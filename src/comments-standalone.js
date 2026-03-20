/**
 * 评论系统 - 独立打包版 v5
 *
 * 支持 Artalk、Waline 两种后端
 * 特性：单层嵌套回复、限量加载、热门排序、置顶优先
 *
 * 设计原则：
 * 1. 单层嵌套：根评论 → 回复（不再有回复的回复）
 * 2. 置顶优先：无论任何排序，置顶评论始终在顶部
 * 3. 回复引用：每条回复显示 @被回复者
 * 4. 限量加载：默认/热门列表各限制 50 条，避免内存无限增长
 * 5. 后端排序：排序逻辑由后端 API 完成，前端只做置顶提升
 *
 * 安全措施：
 * 1. 所有用户输入通过 escapeHtml() 转义
 * 2. 内容处理通过 processContent() 进行安全过滤
 * 3. showToast 使用 textContent 防止 XSS
 */

(function(global) {
    'use strict';

    // ==================== 常量配置 ====================
    var CONFIG = {
        SHARED_CACHE_DURATION: 30000 // 30秒缓存有效期
    };

    // ==================== 共享数据缓存 ====================
    var sharedDataCache = {
        newest: null,
        hot: null,
        timestamp: 0,
        // 正在进行的请求 Promise（用于请求去重）
        pendingRequests: {},

        get: function(type) {
            if (Date.now() - this.timestamp > CONFIG.SHARED_CACHE_DURATION) {
                return null;
            }
            return this[type] || null;
        },

        set: function(type, data) {
            this[type] = data;
            this.timestamp = Date.now();
        },

        clear: function() {
            this.newest = null;
            this.hot = null;
            this.timestamp = 0;
        },

        // 设置正在进行的请求
        setPending: function(type, promise) {
            this.pendingRequests[type] = promise;
        },

        // 获取正在进行的请求
        getPending: function(type) {
            return this.pendingRequests[type] || null;
        },

        // 清除正在进行的请求
        clearPending: function(type) {
            delete this.pendingRequests[type];
        }
    };

    // ==================== 工具函数 ====================

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatTime(isoString) {
        if (!isoString) return '';

        var date = new Date(isoString);

        // 验证日期有效性
        if (isNaN(date.getTime())) return '';

        var now = new Date();
        var diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
        if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';

        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var day = String(date.getDate()).padStart(2, '0');

        return year === now.getFullYear() ? (month + '-' + day) : (year + '-' + month + '-' + day);
    }

    /**
     * 解析 Waline 时间字段
     * Waline API 返回的 time 是毫秒级时间戳（13位）
     * 也支持 insertedAt/createdAt ISO 字符串格式
     */
    function parseWalineTime(raw) {
        // 优先使用 time 字段（毫秒级时间戳，直接使用）
        if (raw.time && typeof raw.time === 'number') {
            return new Date(raw.time).toISOString();
        }

        // 尝试 insertedAt 或 createdAt（ISO 字符串）
        if (raw.insertedAt) {
            return raw.insertedAt;
        }
        if (raw.createdAt) {
            return raw.createdAt;
        }

        // 最后尝试 time 字段作为字符串
        if (raw.time) {
            return raw.time;
        }

        return null;
    }

    function processContent(content, isRaw) {
        if (!content) return '';

        if (!isRaw) {
            return content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        }

        var html = escapeHtml(content);
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/https?:\/\/[^\s<]+/g, function(url) {
            return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(url) + '</a>';
        });
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    /**
     * Gravatar 镜像配置
     * 优先使用国内镜像，失败时回退到原地址
     */
    var GRAVATAR_MIRROR = 'https://cravatar.cn/avatar/';
    var GRAVATAR_ORIGIN = 'https://www.gravatar.com/avatar/';

    /**
     * 获取 Gravatar URL（镜像优先）
     * @returns {{ primary: string, fallback: string }}
     */
    function getGravatarUrls(emailHash, size) {
        size = size || 80;
        var params = '?d=mp&s=' + size;
        if (emailHash) {
            return {
                primary: GRAVATAR_MIRROR + emailHash + params,
                fallback: GRAVATAR_ORIGIN + emailHash + params
            };
        }
        return {
            primary: GRAVATAR_MIRROR + params,
            fallback: GRAVATAR_ORIGIN + params
        };
    }

    function getGravatarUrl(emailHash, size) {
        size = size || 80;
        return emailHash
            ? 'https://cravatar.cn/avatar/' + emailHash + '?d=mp&s=' + size
            : 'https://cravatar.cn/avatar/?d=mp&s=' + size;
    }

    // ==================== 基础适配器 ====================
    function BaseAdapter(config) {
        this.server = config.server.replace(/\/$/, '');
        this.pageKey = config.pageKey || window.location.pathname;
        this.site = config.site || '';
        this.pageSize = config.pageSize || 10; // fallback: 实际调用时总是传入 pageSize
        this.name = 'base';
    }

    BaseAdapter.prototype.getLocalUser = function() {
        try {
            var data = localStorage.getItem('comment_user_info');
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    };

    BaseAdapter.prototype.setLocalUser = function(user) {
        try {
            localStorage.setItem('comment_user_info', JSON.stringify(user));
        } catch (e) {}
    };

    BaseAdapter.prototype.request = async function(url, options) {
        options = options || {};
        var response = await fetch(url, {
            method: options.method || 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
            body: options.body,
            credentials: 'same-origin'
        });

        if (!response.ok) {
            var error = await response.json().catch(function() { return {}; });
            throw new Error(error.msg || error.message || 'HTTP ' + response.status);
        }

        return response.json();
    };

    /**
     * 构建单层嵌套结构
     * 规则：只有直接回复根评论的评论才会被挂载为子评论
     * 多层回复会被扁平化到根评论下，保留 @引用
     */
    BaseAdapter.prototype.buildSingleLevelNested = function(flatComments) {
        if (!flatComments || flatComments.length === 0) return flatComments;

        var commentMap = {};
        var rootComments = [];

        // 建立 ID 映射
        flatComments.forEach(function(c) {
            commentMap[c.id] = c;
            c.children = [];
        });

        // 构建单层嵌套
        flatComments.forEach(function(comment) {
            if (comment.parentId) {
                var parent = commentMap[comment.parentId];
                if (parent) {
                    // 设置回复目标用户
                    if (!comment.replyToUser && parent.user) {
                        comment.replyToUser = parent.user.nick;
                    }
                    // 只有根评论才能有子评论（单层嵌套）
                    if (!parent.parentId) {
                        parent.children.push(comment);
                    } else {
                        // 多层回复：找到根评论，扁平化挂载
                        var root = this.findRoot(parent, commentMap);
                        if (root && root !== parent) {
                            root.children.push(comment);
                        }
                    }
                } else {
                    rootComments.push(comment);
                }
            } else {
                rootComments.push(comment);
            }
        }, this);

        return rootComments;
    };

    BaseAdapter.prototype.findRoot = function(comment, commentMap) {
        var current = comment;
        var maxDepth = 10;
        var depth = 0;
        while (current && current.parentId && depth < maxDepth) {
            var parent = commentMap[current.parentId];
            if (!parent) break;
            if (!parent.parentId) return parent; // 找到根评论
            current = parent;
            depth++;
        }
        return current && !current.parentId ? current : null;
    };

    // ==================== Artalk 适配器 ====================
    function ArtalkAdapter(config) {
        BaseAdapter.call(this, config);
        this.name = 'artalk';
    }

    ArtalkAdapter.prototype = Object.create(BaseAdapter.prototype);

    ArtalkAdapter.prototype.getComments = async function(params) {
        params = params || {};
        var offset = params.offset || 0;
        var limit = params.pageSize || this.pageSize;
        var sortBy = params.sortBy || 'newest';

        var url = new URL(this.server + '/api/v2/comments');
        url.searchParams.set('page_key', this.pageKey);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('offset', String(offset));
        if (this.site) url.searchParams.set('site_name', this.site);

        url.searchParams.set('sort_by', sortBy === 'hot' ? 'vote' : 'date_desc');

        var data = await this.request(url.toString());
        var comments = (data.comments || []).map(this.transformComment, this);
        comments = this.buildSingleLevelNested(comments);

        return {
            comments: comments,
            total: data.count || data.roots_count || 0,
            offset: offset + limit,
            hasMore: (data.comments || []).length >= limit,
            pageSize: limit
        };
    };

    ArtalkAdapter.prototype.transformComment = function(raw) {
        var avatarData = null;
        if (raw.avatar) {
            // 如果后端返回了头像，使用原地址作为 fallback
            avatarData = { primary: raw.avatar, fallback: raw.avatar };
        } else if (raw.email_encrypted) {
            avatarData = getGravatarUrls(raw.email_encrypted, 80);
        }

        return {
            id: String(raw.id),
            parentId: raw.rid ? String(raw.rid) : null,
            content: raw.content_marked || raw.content || '',
            user: {
                nick: raw.nick || 'Anonymous',
                email: raw.email || '',
                link: raw.link || '',
                avatar: avatarData ? avatarData.primary : '',
                avatarFallback: avatarData ? avatarData.fallback : '',
                label: raw.badge_name || ''
            },
            createdAt: raw.date || new Date().toISOString(),
            likes: raw.vote_up || 0,
            liked: raw.is_voted || false,
            pinned: raw.is_pinned || false,
            replyToUser: raw.reply_to || null,
            isPending: raw.is_pending || false
        };
    };

    ArtalkAdapter.prototype.submitComment = async function(data) {
        var response = await this.request(this.server + '/api/v2/comments', {
            method: 'POST',
            body: JSON.stringify({
                page_key: this.pageKey,
                page_title: document.title,
                site_name: this.site || undefined,
                name: data.nick,
                email: data.email,
                link: data.link || undefined,
                content: data.content,
                rid: data.parentId ? parseInt(data.parentId) : undefined
            })
        });

        if (data.nick && data.email) {
            this.setLocalUser({ nick: data.nick, email: data.email, link: data.link || '' });
        }

        return this.transformComment(response.data || response);
    };

    ArtalkAdapter.prototype.toggleLike = async function(commentId, currentCount) {
        var user = this.getLocalUser() || {};
        var response = await this.request(this.server + '/api/v2/votes/comment_up/' + commentId, {
            method: 'POST',
            body: JSON.stringify({ name: user.nick || '', email: user.email || '' })
        });

        var newCount = response.up !== undefined ? response.up : 0;

        // Artalk API 是 toggle 模式，不返回 is_up 字段
        // 需要通过比较点赞前后的数量来判断用户是否点赞
        // newCount > currentCount: 用户点赞了
        // newCount < currentCount: 用户取消点赞了
        var isLiked = currentCount !== undefined ? (newCount > currentCount) : (newCount > 0);

        return {
            likes: newCount,
            liked: isLiked
        };
    };

    // ==================== Waline 适配器 ====================
    function WalineAdapter(config) {
        BaseAdapter.call(this, config);
        this.name = 'waline';
    }

    WalineAdapter.prototype = Object.create(BaseAdapter.prototype);

    WalineAdapter.prototype.getComments = async function(params) {
        params = params || {};
        // Waline 使用 page 分页，offset 被解释为页码
        var page = params.offset || params.page || 1;
        // 如果 offset > 1，表示是"加载更多"，需要 +1
        if (params.offset && !params.page) {
            page = params.offset + 1;
        }
        var limit = params.pageSize || this.pageSize;
        var sortBy = params.sortBy || 'newest';

        var url = new URL(this.server + '/api/comment');
        url.searchParams.set('path', this.pageKey);
        url.searchParams.set('page', String(page));
        url.searchParams.set('pageSize', String(limit));
        url.searchParams.set('lang', 'zh-CN');

        url.searchParams.set('sortBy', sortBy === 'hot' ? 'like_desc' : 'insertedAt_desc');

        var response = await this.request(url.toString());
        // Waline API 返回结构: {errno: 0, data: {data: [...], count: N, totalPages: M, ...}}
        var resultData = response.data || {};
        var comments = (resultData.data || []).map(this.transformComment, this);
        comments = this.buildSingleLevelNested(comments);

        // 使用 totalPages 判断是否还有更多
        var currentPage = resultData.page || page;
        var totalPages = resultData.totalPages || 1;
        var hasMore = currentPage < totalPages;

        return {
            comments: comments,
            total: resultData.count || 0,
            offset: currentPage,
            hasMore: hasMore,
            pageSize: limit
        };
    };

    WalineAdapter.prototype.transformComment = function(raw) {
        var commentId = String(raw.objectId || raw.id);
        // 检查本地存储是否已点赞
        var isLiked = raw.liked || false;
        try {
            var stored = localStorage.getItem('waline_liked_comments');
            var likedComments = stored ? JSON.parse(stored) : [];
            if (likedComments.indexOf(commentId) !== -1) {
                isLiked = true;
            }
        } catch (e) {}

        // 处理头像：优先使用镜像，保留原地址作为 fallback
        var avatarData = null;
        if (raw.avatar) {
            // 检查是否是 Gravatar 地址
            if (raw.avatar.indexOf('gravatar.com') !== -1) {
                // 替换为镜像地址
                var avatarUrl = raw.avatar;
                avatarData = {
                    primary: avatarUrl.replace('www.gravatar.com', 'cravatar.cn').replace('gravatar.com', 'cravatar.cn'),
                    fallback: avatarUrl
                };
            } else {
                avatarData = { primary: raw.avatar, fallback: raw.avatar };
            }
        }

        return {
            id: commentId,
            parentId: raw.pid ? String(raw.pid) : null,
            content: raw.comment || '',
            user: {
                nick: raw.nick || 'Anonymous',
                email: raw.mail || raw.email || '',
                link: raw.link || '',
                avatar: avatarData ? avatarData.primary : '',
                avatarFallback: avatarData ? avatarData.fallback : '',
                label: raw.type === 'administrator' ? '博主' : ''
            },
            createdAt: parseWalineTime(raw) || new Date().toISOString(),
            likes: raw.like || 0,
            liked: isLiked,
            pinned: raw.sticky || false,
            replyToUser: raw.replyUser || raw.reply_user?.nick || null,
            isPending: raw.status === 'waiting'
        };
    };

    WalineAdapter.prototype.submitComment = async function(data) {
        var response = await this.request(this.server + '/api/comment', {
            method: 'POST',
            body: JSON.stringify({
                url: this.pageKey,
                nick: data.nick,
                mail: data.email,
                link: data.link || undefined,
                comment: data.content,
                pid: data.parentId || undefined
            })
        });

        if (data.nick && data.email) {
            this.setLocalUser({ nick: data.nick, email: data.email, link: data.link || '' });
        }

        return this.transformComment(response.data || response);
    };

    WalineAdapter.prototype.toggleLike = async function(commentId, currentCount) {
        // Waline 点赞是累加模式，需要本地记录防止重复点赞
        var likedKey = 'waline_liked_comments';
        var likedComments = [];
        try {
            var stored = localStorage.getItem(likedKey);
            likedComments = stored ? JSON.parse(stored) : [];
        } catch (e) {
            likedComments = [];
        }

        var commentIdStr = String(commentId);
        var alreadyLiked = likedComments.indexOf(commentIdStr) !== -1;

        if (alreadyLiked) {
            // 已点赞，不允许取消（Waline 不支持取消点赞）
            return { likes: currentCount, liked: true, alreadyLiked: true };
        }

        // 调用点赞 API
        var response = await this.request(this.server + '/api/comment/' + commentId, {
            method: 'PUT',
            body: JSON.stringify({ like: true })
        });

        // 记录已点赞
        likedComments.push(commentIdStr);
        try {
            localStorage.setItem(likedKey, JSON.stringify(likedComments));
        } catch (e) {}

        // 从响应获取新点赞数
        var newCount = (response.data && response.data.like !== undefined)
            ? response.data.like
            : (currentCount + 1);

        return { likes: newCount, liked: true, alreadyLiked: false };
    };

    // 检查评论是否已点赞
    WalineAdapter.prototype.isLiked = function(commentId) {
        try {
            var stored = localStorage.getItem('waline_liked_comments');
            var likedComments = stored ? JSON.parse(stored) : [];
            return likedComments.indexOf(String(commentId)) !== -1;
        } catch (e) {
            return false;
        }
    };

    // ==================== 适配器工厂 ====================
    function createAdapter(provider, config) {
        provider = provider.toLowerCase();
        if (provider === 'artalk') {
            return new ArtalkAdapter(config);
        } else if (provider === 'waline') {
            return new WalineAdapter(config);
        }
        throw new Error('Unknown comment provider: ' + provider + '. Supported: artalk, waline');
    }

    // ==================== 样式注入 ====================
    var STYLES_INJECTED = false;

    function injectStyles() {
        if (STYLES_INJECTED) return;
        var style = document.createElement('style');
        style.id = 'comments-ui-styles';
        style.textContent = COMMENTS_STYLES;
        document.head.appendChild(style);
        STYLES_INJECTED = true;
    }

    var COMMENTS_STYLES = '\
.comments-ui{font-family:var(--font-sans);color:var(--text-primary);line-height:1.6}\
.comments-form{background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden}\
.comments-form-title{padding:var(--space-3) var(--space-4);font-family:var(--font-mono);font-size:.875rem;color:var(--accent);border-bottom:1px solid var(--border);background:var(--bg-primary)}\
.comments-form-title::before{content:"> "}\
.comments-form-header{display:flex;gap:var(--space-2);padding:var(--space-4);flex-wrap:wrap}\
.comments-form-field{flex:1;min-width:140px}\
.comments-form-field label{display:none}\
.comments-form-field input{width:100%;padding:10px 14px;background:var(--bg-primary);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:.875rem;font-family:var(--font-mono);transition:border-color .2s,box-shadow .2s}\
.comments-form-field input:hover{border-color:color-mix(in srgb,var(--border) 70%,var(--accent))}\
.comments-form-field input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}\
.comments-form-field input::placeholder{color:var(--text-secondary);opacity:.7}\
.comments-form-body{padding:0 var(--space-4) var(--space-3)}\
.comments-form-textarea{width:100%;min-height:120px;padding:var(--space-3);background:var(--bg-primary);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:.875rem;line-height:1.6;font-family:var(--font-mono);resize:vertical;transition:border-color .2s,box-shadow .2s}\
.comments-form-textarea:hover{border-color:color-mix(in srgb,var(--border) 70%,var(--accent))}\
.comments-form-textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}\
.comments-form-textarea::placeholder{color:var(--text-secondary);opacity:.7}\
.comments-form-footer{display:flex;align-items:center;justify-content:space-between;padding:var(--space-3) var(--space-4) var(--space-4);gap:var(--space-3);min-height:44px}\
.comments-form-actions{display:flex;gap:var(--space-2)}\
.comments-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 20px;font-size:.875rem;font-weight:600;border-radius:var(--radius-sm);cursor:pointer;transition:opacity .15s,transform .15s;border:none;white-space:nowrap;font-family:var(--font-mono)}\
.comments-btn:active{transform:scale(.98)}\
.comments-btn-primary{background:var(--accent);color:var(--bg-primary)}\
.comments-btn-primary:hover{opacity:.9}\
.comments-btn-ghost{background:transparent;color:var(--text-secondary);border:1px solid var(--border)}\
.comments-btn-ghost:hover{color:var(--accent);border-color:var(--accent)}\
.comments-form-tip{font-size:.75rem;color:var(--text-secondary);font-family:var(--font-mono)}\
.comments-form-tip::before{content:"// "}\
.comments-reply-indicator{display:none;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-4);background:var(--accent-dim);border-top:1px solid var(--border);font-size:.875rem;color:var(--text-secondary)}\
.comments-reply-indicator.active{display:flex}\
.comments-reply-indicator-name{color:var(--accent);font-weight:600}\
.comments-reply-cancel{margin-left:auto;padding:4px 10px;font-size:.75rem;color:var(--text-secondary);background:transparent;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:all .15s;font-family:var(--font-mono)}\
.comments-reply-cancel:hover{color:var(--accent);border-color:var(--accent)}\
.comments-list{margin-top:var(--space-6)}\
.comments-list-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4);padding-bottom:var(--space-3);border-bottom:1px solid var(--border)}\
.comments-list-title{font-size:1rem;font-weight:600;color:var(--text-primary)}\
.comments-list-count{font-size:.8125rem;color:var(--text-secondary);margin-left:var(--space-2)}\
.comments-list-sort{display:flex;align-items:center;gap:var(--space-2)}\
.comments-sort-btn{padding:6px 10px;font-size:.75rem;color:var(--text-secondary);background:transparent;border:none;border-radius:var(--radius-sm);cursor:pointer;transition:color .2s ease;font-family:inherit;font-weight:500}\
.comments-sort-btn:hover{color:var(--text-primary)}\
.comments-sort-btn.active{color:var(--accent)}\
.comments-refresh-btn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;font-size:.75rem;color:var(--text-secondary);background:transparent;border:none;border-radius:var(--radius-sm);cursor:pointer;transition:color .2s ease,transform .2s ease;font-family:inherit}\
.comments-refresh-btn:hover{color:var(--accent)}\
.comments-refresh-btn:active{transform:scale(.9)}\
.comments-refresh-btn.is-refreshing{animation:comments-spin .8s linear infinite}\
.comments-refresh-btn.is-refreshing i{color:var(--accent)}\
.comments-admin-btn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;font-size:.75rem;color:var(--text-secondary);background:transparent;border:none;border-radius:var(--radius-sm);cursor:pointer;transition:color .2s ease,transform .2s ease;font-family:inherit}\
.comments-admin-btn:hover{color:var(--accent)}\
.comments-admin-btn:active{transform:scale(.9)}\
.comment-item{padding:var(--space-3);border-bottom:1px dashed var(--border)}\
.comment-item:last-child{border-bottom:none}\
.comment-item.pinned{background:transparent;border-left:2px solid var(--accent);padding:var(--space-3);margin:0 0 var(--space-3) 0;border-radius:0}\
.comment-thread{display:flex;gap:var(--space-2);align-items:flex-start}\
.comment-avatar{width:32px;height:32px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:.75rem;font-weight:600}\
.comment-avatar img{width:100%;height:100%;object-fit:cover}\
.comment-content-area{flex:1;min-width:0;display:flex;flex-direction:column}\
.comment-header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-2);margin-bottom:var(--space-1);flex-wrap:wrap}\
.comment-meta{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}\
.comment-author{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap}\
.comment-nick{font-weight:600;color:var(--text-primary);font-size:.8125rem}\
.comment-reply-ref{display:inline-flex;align-items:center;gap:4px;padding:1px 6px;background:var(--accent-dim);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.625rem;font-weight:500}\
.comment-reply-ref i{color:var(--accent);font-size:.5625rem}\
.comment-reply-ref .reply-to-name{color:var(--accent);font-weight:600}\
.comment-badge{display:inline-block;padding:1px 5px;font-size:.5625rem;font-weight:600;background:var(--accent);color:var(--bg-primary);border-radius:2px}\
.comment-info{display:flex;align-items:center;gap:var(--space-2);font-size:.6875rem;font-family:var(--font-mono);color:var(--text-secondary)}\
.comment-actions{display:flex;gap:var(--space-1);flex-shrink:0;align-items:center}\
.comment-action-btn{display:inline-flex;align-items:center;gap:3px;padding:3px 6px;font-size:.6875rem;color:var(--text-secondary);background:transparent;border:none;cursor:pointer;border-radius:var(--radius-sm);transition:color .15s,background .15s;font-family:var(--font-mono)}\
.comment-action-btn:hover{color:var(--accent);background:var(--accent-dim)}\
.comment-action-btn.liked{color:var(--accent)}\
.comment-content{font-size:.875rem;line-height:1.65;color:var(--text-primary);word-wrap:break-word;padding-right:var(--space-2)}\
.comment-content a{color:var(--accent);text-decoration:none}\
.comment-content a:hover{text-decoration:underline}\
.comment-content code{padding:2px 5px;background:var(--bg-secondary);color:var(--accent);border-radius:3px;font-size:.85em}\
.comment-content pre{margin:var(--space-2) 0;padding:var(--space-2);background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);overflow-x:auto}\
.comment-content pre code{background:transparent;padding:0}\
.comment-replies{margin-top:var(--space-3);margin-left:calc(var(--space-5) + 20px);padding:var(--space-2);background:transparent;border:none;border-left:2px solid var(--accent);border-radius:0}\
.comment-replies-header{font-size:.6875rem;font-family:var(--font-mono);color:var(--text-primary);margin-bottom:var(--space-2);padding-bottom:var(--space-2);border-bottom:1px dashed var(--border);display:flex;align-items:center;gap:var(--space-2);font-weight:600}\
.comment-replies-header i{color:var(--accent);font-size:.625rem}\
.comment-replies .comment-thread{padding:var(--space-2) 0;border-bottom:1px dashed var(--border)}\
.comment-replies .comment-thread:first-child{padding-top:0}\
.comment-replies .comment-thread:last-child{padding-bottom:0;border-bottom:none}\
.comment-replies .comment-avatar{width:28px;height:28px;font-size:.625rem}\
.comment-replies .comment-content{font-size:.875rem}\
.comment-replies .comment-nick{font-size:.75rem}\
.comment-replies .comment-actions{gap:var(--space-1)}\
.comment-replies .comment-action-btn{padding:2px 5px;font-size:.625rem}\
.comment-replies .comment-reply-ref{font-size:.5625rem;padding:1px 4px}\
.comments-empty{text-align:center;padding:var(--space-10);color:var(--text-secondary)}\
.comments-empty-icon{font-size:3rem;margin-bottom:var(--space-4);opacity:.5}\
.comments-empty-text{font-size:.875rem}\
.comments-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--space-8);color:var(--text-secondary)}\
.comments-loading-spinner{width:24px;height:24px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:comments-spin .8s linear infinite;margin-bottom:var(--space-2)}\
@keyframes comments-spin{to{transform:rotate(360deg)}}\
.comments-error{text-align:center;padding:var(--space-8);color:var(--text-secondary)}\
.comments-error-icon{font-size:2rem;margin-bottom:var(--space-3);color:var(--accent)}\
.comments-error-message{margin-bottom:var(--space-4);font-size:.875rem}\
.comments-btn-secondary{background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border)}\
.comments-btn-secondary:hover{border-color:var(--accent);color:var(--accent)}\
.comments-limit-notice{display:flex;align-items:center;justify-content:center;gap:var(--space-2);padding:var(--space-4);margin-top:var(--space-4);font-size:.75rem;color:var(--text-secondary);font-family:var(--font-mono);background:var(--bg-secondary);border-radius:var(--radius-sm)}\
.comments-limit-notice i{color:var(--accent)}\
.comments-load-more-wrapper{display:flex;justify-content:center;margin-top:var(--space-4)}\
.comments-load-more-btn{display:flex;align-items:center;justify-content:center;gap:var(--space-2);width:100%;padding:var(--space-4);font-size:.75rem;font-weight:500;font-family:var(--font-mono);color:var(--text-secondary);background:var(--bg-secondary);border:none;border-radius:var(--radius-sm);cursor:pointer;transition:color .15s ease,background .15s ease}\
.comments-load-more-btn:hover{color:var(--text-primary)}\
.comments-load-more-btn:active{transform:scale(.99)}\
.comments-load-more-btn i{color:var(--accent);font-size:.625rem;transition:transform .15s ease}\
.comments-load-more-btn:hover i{transform:translateY(2px)}\
.comments-skeleton{display:flex;flex-direction:column;gap:var(--space-3)}\
.comments-skeleton-item{display:flex;gap:var(--space-2);padding:var(--space-3);border-bottom:1px dashed var(--border)}\
.comments-skeleton-item:last-child{border-bottom:none}\
.comments-skeleton-avatar{width:32px;height:32px;border-radius:50%;flex-shrink:0}\
.comments-skeleton-content{flex:1;display:flex;flex-direction:column;gap:var(--space-2)}\
.comments-skeleton-header{display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-1)}\
.comments-skeleton-nick{width:80px;height:14px;border-radius:4px}\
.comments-skeleton-date{width:60px;height:12px;border-radius:3px}\
.comments-skeleton-line{height:14px;border-radius:4px}\
.comments-skeleton-line.short{width:70%}\
.skeleton{background:linear-gradient(90deg,var(--bg-secondary) 25%,var(--border) 50%,var(--bg-secondary) 75%);background-size:200% 100%;animation:skeleton-scan 2s ease-in-out infinite}\
@keyframes skeleton-scan{0%{background-position:200% 0}100%{background-position:-200% 0}}\
.comments-fade-in{animation:comments-fade-in .3s ease forwards}\
@keyframes comments-fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}\
.skeleton-fade-out{opacity:0!important;transition:opacity .3s ease}\
@media(prefers-reduced-motion:reduce){.skeleton{animation:none}.comments-fade-in{animation:none;opacity:1;transform:none}}\
@media(max-width:640px){.comments-form-field{flex:1 1 100%}.comments-form-footer{padding:var(--space-2) var(--space-3) var(--space-3);gap:var(--space-2)}.comments-form-tip{font-size:.6875rem}.comments-btn{height:34px;padding:0 14px;font-size:.875rem;gap:4px}.comments-form-actions{justify-content:flex-end}.comment-replies{margin-left:var(--space-3);padding:var(--space-2)}.comment-item.pinned{margin:0 0 var(--space-3) 0}.comment-avatar{width:28px;height:28px;font-size:.625rem}.comment-nick{font-size:.75rem}.comment-info{font-size:.625rem}.comments-skeleton-avatar{width:28px;height:28px}}';

    // ==================== 评论核心类 ====================
    function Comments(config) {
        this.container = config.container;
        this.editorContainer = config.editorContainer || null;
        this.config = config;
        this.adapter = createAdapter(config.provider, {
            server: config.server,
            pageKey: config.pageKey,
            site: config.site,
            pageSize: 10 // fallback: 实际请求时总是使用 limits 控制数量
        });

        // 数量限制配置（优先使用传入配置，否则使用默认值）
        // 注意：limits 表示"总评论数"（根评论 + 嵌套回复）
        this.limits = Object.assign({
            newest: 50,
            hot: 50
        }, config.limits || {});

        // 渐进式展示配置（按总评论数增量）
        this.displayIncrement = 15; // 每次展示的总评论数增量

        this.state = {
            comments: [],
            total: 0,
            sortBy: 'newest',
            loading: false,
            error: null,
            replyTo: null,
            reachedLimit: false,
            displayedCount: this.displayIncrement // 当前展示的总评论数（含回复）
        };
    };

    // ==================== 排序逻辑 ====================
    /**
     * 置顶提升逻辑
     * 后端 API 已按 sortBy 参数返回排序好的数据
     * 前端只需确保置顶评论始终在最前面
     */
    Comments.prototype.liftPinnedComments = function(comments) {
        if (!comments || comments.length === 0) return comments;

        return comments.slice().sort(function(a, b) {
            // 唯一规则：置顶评论永远优先
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return 0;  // 保持后端返回的原始顺序
        });
    };

    // ==================== 初始化 ====================
    Comments.prototype.init = async function() {
        injectStyles();
        this.render();
        await this.loadComments();
    };

    // ==================== 渲染 ====================
    Comments.prototype.render = function() {
        var user = this.adapter.getLocalUser() || {};

        // 如果有独立的编辑器容器，分别渲染
        if (this.editorContainer) {
            // 平滑过渡：先淡出骨架屏
            this.fadeOutSkeleton(this.editorContainer);
            this.fadeOutSkeleton(this.container);

            // 渲染编辑器到独立容器
            this.editorContainer.innerHTML = '<div class="comments-ui comments-fade-in">' +
                this.renderForm(user) +
                '</div>';

            // 渲染列表到主容器
            this.container.innerHTML = '<div class="comments-list comments-fade-in" id="comments-list"></div>';
        } else {
            // 平滑过渡：先淡出骨架屏
            this.fadeOutSkeleton(this.container);

            // 默认：编辑器和列表在同一容器
            this.container.innerHTML = '<div class="comments-ui comments-fade-in">' +
                this.renderForm(user) +
                '<div class="comments-list" id="comments-list"></div>' +
                '</div>';
        }

        this.bindFormEvents();
    };

    /**
     * 平滑过渡：淡出骨架屏元素
     */
    Comments.prototype.fadeOutSkeleton = function(container) {
        if (!container) return;
        var skeletons = container.querySelectorAll('.editor-skeleton, .comments-skeleton, .skeleton');
        skeletons.forEach(function(el) {
            el.classList.add('skeleton-fade-out');
        });
    };

    Comments.prototype.renderForm = function(user) {
        return '<form class="comments-form" id="comments-form">' +
            '<div class="comments-form-title">发射信号</div>' +
            '<div class="comments-form-header">' +
                '<div class="comments-form-field">' +
                    '<label for="comment-nick">昵称</label>' +
                    '<input type="text" id="comment-nick" name="nick" value="' + escapeHtml(user.nick || '') + '" placeholder="--nick=&quot;你的昵称&quot;" required>' +
                '</div>' +
                '<div class="comments-form-field">' +
                    '<label for="comment-email">邮箱</label>' +
                    '<input type="email" id="comment-email" name="email" value="' + escapeHtml(user.email || '') + '" placeholder="--email=&quot;your@email.com&quot;" required>' +
                '</div>' +
                '<div class="comments-form-field">' +
                    '<label for="comment-link">网站</label>' +
                    '<input type="url" id="comment-link" name="link" value="' + escapeHtml(user.link || '') + '" placeholder="--link=&quot;https://&quot;">' +
                '</div>' +
            '</div>' +
            '<div class="comments-form-body">' +
                '<textarea class="comments-form-textarea" id="comment-content" name="content" placeholder="' + (this.config.placeholder || '写下你的想法...') + '" required></textarea>' +
            '</div>' +
            '<div class="comments-reply-indicator" id="comments-reply-indicator">' +
                '<i class="fa-solid fa-reply"></i>' +
                '<span>回复 <span class="comments-reply-indicator-name" id="reply-to-name"></span></span>' +
                '<button type="button" class="comments-reply-cancel" id="cancel-reply-btn">取消</button>' +
            '</div>' +
            '<div class="comments-form-footer">' +
                '<span class="comments-form-tip">支持 Markdown</span>' +
                '<div class="comments-form-actions">' +
                    '<button type="submit" class="comments-btn comments-btn-primary">[TRANSMIT]</button>' +
                '</div>' +
            '</div>' +
            '<input type="hidden" name="parentId" id="comment-parent-id">' +
        '</form>';
    };

    /**
     * 渲染评论列表骨架屏
     * 结构与实际评论项精确匹配，避免 CLS
     */
    Comments.prototype.renderSkeleton = function() {
        var skeletonItems = [];
        var itemCount = 3; // 显示 3 个骨架屏项

        for (var i = 0; i < itemCount; i++) {
            // 模拟实际评论项的布局结构
            skeletonItems.push(
                '<div class="comments-skeleton-item">' +
                    '<div class="comments-skeleton-avatar skeleton"></div>' +
                    '<div class="comments-skeleton-content">' +
                        '<div class="comments-skeleton-header">' +
                            '<div class="comments-skeleton-nick skeleton"></div>' +
                            '<div class="comments-skeleton-date skeleton"></div>' +
                        '</div>' +
                        '<div class="comments-skeleton-line skeleton" style="width:100%;"></div>' +
                        '<div class="comments-skeleton-line skeleton short"></div>' +
                    '</div>' +
                '</div>'
            );
        }

        return '<div class="comments-skeleton">' + skeletonItems.join('') + '</div>';
    };

    /**
     * 统计评论总数（包含嵌套回复）
     * @param {Array} comments - 评论列表
     * @returns {number} 包含回复的总数
     */
    Comments.prototype.countAllComments = function(comments) {
        if (!comments || comments.length === 0) return 0;
        var total = 0;
        for (var i = 0; i < comments.length; i++) {
            total += 1; // 根评论
            if (comments[i].children && comments[i].children.length > 0) {
                total += comments[i].children.length; // 嵌套回复
            }
        }
        return total;
    };

    /**
     * 统计回复总数（不含根评论）
     * @param {Array} comments - 评论列表
     * @returns {number} 回复总数
     */
    Comments.prototype.countReplies = function(comments) {
        if (!comments || comments.length === 0) return 0;
        var total = 0;
        for (var i = 0; i < comments.length; i++) {
            if (comments[i].children && comments[i].children.length > 0) {
                total += comments[i].children.length;
            }
        }
        return total;
    };

    /**
     * 按总评论数截取评论列表
     * 确保返回的评论总数不超过 maxCount
     * @param {Array} comments - 完整评论列表
     * @param {number} maxCount - 最大总评论数（含回复）
     * @returns {Object} { comments: 截取后的评论列表, totalWithReplies: 实际总数 }
     */
    Comments.prototype.sliceCommentsByTotalCount = function(comments, maxCount) {
        if (!comments || comments.length === 0) {
            return { comments: [], totalWithReplies: 0 };
        }

        var result = [];
        var currentCount = 0;

        for (var i = 0; i < comments.length; i++) {
            var comment = comments[i];
            var children = comment.children || [];
            var commentTotal = 1 + children.length; // 根评论 + 回复

            if (currentCount + commentTotal <= maxCount) {
                // 整条评论（含回复）可以完全加入
                result.push(comment);
                currentCount += commentTotal;
            } else if (currentCount + 1 <= maxCount) {
                // 可以加入根评论，但需要截断回复
                var remainingSlots = maxCount - currentCount - 1; // 预留给根评论后的回复槽位
                var truncatedChildren = children.slice(0, Math.max(0, remainingSlots));

                // 创建截断后的评论副本
                var truncatedComment = Object.assign({}, comment);
                truncatedComment.children = truncatedChildren;
                truncatedComment._replyTruncated = children.length > truncatedChildren.length;

                result.push(truncatedComment);
                currentCount += 1 + truncatedChildren.length;
                break; // 已达到限制，停止
            } else {
                // 无法再加入任何评论
                break;
            }
        }

        return {
            comments: result,
            totalWithReplies: currentCount
        };
    };

    Comments.prototype.renderList = function() {
        var listEl = this.container.querySelector('#comments-list');
        if (!listEl) return;

        if (this.state.loading && this.state.comments.length === 0) {
            // 使用骨架屏替代简单 spinner - 内容为静态模板，无用户输入
            listEl.innerHTML = this.renderSkeleton();
            return;
        }

        if (this.state.error && this.state.comments.length === 0) {
            listEl.innerHTML = '<div class="comments-error">' +
                '<div class="comments-error-icon"><i class="fa-solid fa-exclamation-circle"></i></div>' +
                '<p class="comments-error-message">' + escapeHtml(this.state.error) + '</p>' +
                '<button class="comments-btn comments-btn-secondary retry-btn"><i class="fa-solid fa-refresh"></i> 重试</button>' +
            '</div>';
            this.bindListEvents();
            return;
        }

        if (!this.state.comments || this.state.comments.length === 0) {
            listEl.innerHTML = '<div class="comments-empty">' +
                '<div class="comments-empty-icon"><i class="fa-regular fa-comments"></i></div>' +
                '<p class="comments-empty-text">暂无评论，来发表第一条吧！</p>' +
            '</div>';
            return;
        }

        // 按总评论数截取（根评论 + 回复 ≤ displayedCount）
        var allComments = this.state.comments;
        var sliceResult = this.sliceCommentsByTotalCount(allComments, this.state.displayedCount);
        var visibleComments = sliceResult.comments;
        var displayedTotal = sliceResult.totalWithReplies;

        // 计算实际回复数
        var displayedReplies = this.countReplies(visibleComments);

        // 判断是否还有更多评论未展示
        var allTotalWithReplies = this.countAllComments(allComments);
        var hasMoreToDisplay = displayedTotal < allTotalWithReplies;

        var commentsHtml = visibleComments.map(this.renderComment, this).join('');

        // 列表底部提示
        var footerHtml = '';
        if (hasMoreToDisplay) {
            // 还有更多评论未展示：显示"加载更多"按钮
            footerHtml = '<div class="comments-load-more-wrapper">' +
                '<button class="comments-load-more-btn" id="load-more-display-btn">' +
                    '<i class="fa-solid fa-chevron-down"></i>' +
                    '<span>加载更多</span>' +
                '</button>' +
            '</div>';
        } else if (this.state.reachedLimit) {
            // 已展示全部本地数据，但后端还有更多（达到 API 限制）
            footerHtml = '<div class="comments-limit-notice">' +
                '<i class="fa-solid fa-info-circle"></i>' +
                '<span>已显示 ' + displayedTotal + ' 条评论（含 ' + displayedReplies + ' 条回复）</span>' +
            '</div>';
        }

        listEl.innerHTML = '<div class="comments-list-header">' +
            '<div><span class="comments-list-title">评论</span><span class="comments-list-count">' + this.state.total + ' 条</span></div>' +
            '<div class="comments-list-sort">' +
                '<button class="comments-sort-btn' + (this.state.sortBy === 'newest' ? ' active' : '') + '" data-sort="newest">默认</button>' +
                '<button class="comments-sort-btn' + (this.state.sortBy === 'hot' ? ' active' : '') + '" data-sort="hot">热门</button>' +
                '<button class="comments-refresh-btn" id="comments-refresh-btn" title="刷新列表" aria-label="刷新评论列表">' +
                    '<i class="fa-solid fa-rotate"></i>' +
                '</button>' +
                '<button class="comments-admin-btn" id="comments-admin-btn" title="管理后台" aria-label="打开评论管理后台">' +
                    '<i class="fa-solid fa-gear"></i>' +
                '</button>' +
            '</div>' +
        '</div>' +
        '<div class="comments-items">' + commentsHtml + '</div>' +
        footerHtml;

        this.bindListEvents();
    };

    Comments.prototype.renderComment = function(comment) {
        var classes = ['comment-item'];
        if (comment.pinned) classes.push('pinned');

        var avatarHtml;
        if (comment.user.avatar) {
            var fallbackAttr = comment.user.avatarFallback
                ? ' data-fallback="' + escapeHtml(comment.user.avatarFallback) + '"'
                : '';
            avatarHtml = '<img src="' + escapeHtml(comment.user.avatar) + '"' + fallbackAttr +
                ' alt="' + escapeHtml(comment.user.nick) + '" loading="lazy" onerror="this.onerror=null;if(this.dataset.fallback)this.src=this.dataset.fallback">';
        } else {
            avatarHtml = '<span>' + (comment.user.nick || 'A').charAt(0).toUpperCase() + '</span>';
        }

        var badgesHtml = '';
        if (comment.user.label) badgesHtml += '<span class="comment-badge">' + escapeHtml(comment.user.label) + '</span>';
        if (comment.pinned) badgesHtml += '<span class="comment-badge">置顶</span>';

        // 单层嵌套：渲染子回复
        var repliesHtml = '';
        if (comment.children && comment.children.length > 0) {
            var replyLabel = comment.children.length === 1 ? '1 条回复' : comment.children.length + ' 条回复';
            repliesHtml = '<div class="comment-replies">' +
                '<div class="comment-replies-header">' +
                    '<i class="fa-solid fa-comments"></i>' +
                    '<span>' + replyLabel + '</span>' +
                '</div>' +
                comment.children.map(function(child) {
                    return this.renderReply(child);
                }, this).join('') +
            '</div>';
        }

        return '<article class="' + classes.join(' ') + '" data-comment-id="' + comment.id + '">' +
            '<div class="comment-thread">' +
                '<div class="comment-avatar">' + avatarHtml + '</div>' +
                '<div class="comment-content-area">' +
                    '<div class="comment-header">' +
                        '<div class="comment-meta">' +
                            '<div class="comment-author">' +
                                '<span class="comment-nick">' + escapeHtml(comment.user.nick) + '</span>' +
                                badgesHtml +
                            '</div>' +
                            '<div class="comment-info">' +
                                '<span class="comment-date">' + formatTime(comment.createdAt) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="comment-actions">' +
                            '<button class="comment-action-btn like-btn' + (comment.liked ? ' liked' : '') + '" data-comment-id="' + comment.id + '">' +
                                '<i class="fa' + (comment.liked ? 's' : 'r') + ' fa-heart"></i>' +
                                (comment.likes > 0 ? '<span>' + comment.likes + '</span>' : '') +
                            '</button>' +
                            '<button class="comment-action-btn reply-btn" data-comment-id="' + comment.id + '" data-nick="' + escapeHtml(comment.user.nick) + '">' +
                                '<i class="fa-regular fa-comment"></i> 回复' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="comment-content">' + processContent(comment.content, false) + '</div>' +
                '</div>' +
            '</div>' +
            repliesHtml +
        '</article>';
    };

    Comments.prototype.renderReply = function(reply) {
        var avatarHtml;
        if (reply.user.avatar) {
            var fallbackAttr = reply.user.avatarFallback
                ? ' data-fallback="' + escapeHtml(reply.user.avatarFallback) + '"'
                : '';
            avatarHtml = '<img src="' + escapeHtml(reply.user.avatar) + '"' + fallbackAttr +
                ' alt="' + escapeHtml(reply.user.nick) + '" loading="lazy" onerror="this.onerror=null;if(this.dataset.fallback)this.src=this.dataset.fallback">';
        } else {
            avatarHtml = '<span>' + (reply.user.nick || 'A').charAt(0).toUpperCase() + '</span>';
        }

        var badgeHtml = reply.user.label ? '<span class="comment-badge">' + escapeHtml(reply.user.label) + '</span>' : '';

        // 回复引用：显示 @被回复者
        var replyRefHtml = '';
        if (reply.replyToUser) {
            replyRefHtml = '<span class="comment-reply-ref"><i class="fa-solid fa-reply"></i><span class="reply-to-name">@' + escapeHtml(reply.replyToUser) + '</span></span>';
        }

        return '<div class="comment-thread" data-comment-id="' + reply.id + '">' +
            '<div class="comment-avatar">' + avatarHtml + '</div>' +
            '<div class="comment-content-area">' +
                '<div class="comment-header">' +
                    '<div class="comment-meta">' +
                        '<div class="comment-author">' +
                            '<span class="comment-nick">' + escapeHtml(reply.user.nick) + '</span>' +
                            replyRefHtml +
                            badgeHtml +
                        '</div>' +
                        '<div class="comment-info">' +
                            '<span class="comment-date">' + formatTime(reply.createdAt) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="comment-actions">' +
                        '<button class="comment-action-btn like-btn' + (reply.liked ? ' liked' : '') + '" data-comment-id="' + reply.id + '">' +
                            '<i class="fa' + (reply.liked ? 's' : 'r') + ' fa-heart"></i>' +
                            (reply.likes > 0 ? '<span>' + reply.likes + '</span>' : '') +
                        '</button>' +
                        '<button class="comment-action-btn reply-btn" data-comment-id="' + reply.id + '" data-nick="' + escapeHtml(reply.user.nick) + '">' +
                            '<i class="fa-regular fa-comment"></i> 回复' +
                        '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="comment-content">' + processContent(reply.content, false) + '</div>' +
            '</div>' +
        '</div>';
    };

    // ==================== 数据加载 ====================
    /**
     * 加载评论列表
     *
     * 设计原则：
     * 1. 后端 API 已按 sortBy 参数返回排序好的数据
     * 2. 前端一次性请求限量数据（数量由 config.limits 控制）
     * 3. 前端只需做置顶提升（pinned comments 在顶部）
     * 4. 不再分页，避免内存无限增长
     */
    Comments.prototype.loadComments = async function() {
        this.state.loading = true;
        this.state.comments = [];
        this.state.reachedLimit = false;
        this.state.hasMore = false;
        // 重置展示数量为初始值
        this.state.displayedCount = this.displayIncrement;
        this.renderList();

        var sortBy = this.state.sortBy;
        // 使用实例配置的限制值
        var limit = this.limits[sortBy] || 50;

        try {
            var result;

            // newest 排序：使用共享缓存或发起新请求
            if (sortBy === 'newest') {
                var cached = sharedDataCache.get('newest');
                if (cached && cached.comments && cached.comments.length >= limit) {
                    console.log('[Comments] 使用缓存的 newest 数据');
                    result = cached;
                } else {
                    var pendingRequest = sharedDataCache.getPending('newest');
                    if (pendingRequest) {
                        console.log('[Comments] 等待正在进行的 newest 请求');
                        result = await pendingRequest;
                    } else {
                        var requestPromise = this.fetchWithLimit('newest', limit);
                        sharedDataCache.setPending('newest', requestPromise);
                        result = await requestPromise;
                        sharedDataCache.clearPending('newest');
                        sharedDataCache.set('newest', result);
                    }
                }
            }
            // hot 排序：使用共享缓存或发起新请求
            else if (sortBy === 'hot') {
                var hotCached = sharedDataCache.get('hot');
                if (hotCached && hotCached.comments && hotCached.comments.length >= limit) {
                    console.log('[Comments] 使用缓存的 hot 数据');
                    result = hotCached;
                } else {
                    var hotPendingRequest = sharedDataCache.getPending('hot');
                    if (hotPendingRequest) {
                        console.log('[Comments] 等待正在进行的 hot 请求');
                        result = await hotPendingRequest;
                    } else {
                        var hotRequestPromise = this.fetchWithLimit('hot', limit);
                        sharedDataCache.setPending('hot', hotRequestPromise);
                        result = await hotRequestPromise;
                        sharedDataCache.clearPending('hot');
                        sharedDataCache.set('hot', result);
                    }
                }
            }
            // 其他排序（预留扩展）
            else {
                result = await this.fetchWithLimit(sortBy, limit);
            }

            // 后端已排序，前端只做置顶提升
            this.state.comments = this.liftPinnedComments(result.comments || []);
            this.state.total = result.total || this.state.comments.length;

            // 判断是否达到限制（总数 > 限制数，说明还有更多数据但被截断）
            this.state.reachedLimit = this.state.total > limit;

            // 计算实际加载的总评论数（含回复）
            var loadedTotalWithReplies = this.countAllComments(this.state.comments);
            var loadedReplies = this.countReplies(this.state.comments);

            console.log('[Comments] 加载完成:', {
                sortBy: sortBy,
                roots: this.state.comments.length,
                replies: loadedReplies,
                totalWithReplies: loadedTotalWithReplies,
                backendTotal: this.state.total,
                limit: limit,
                reachedLimit: this.state.reachedLimit
            });

        } catch (error) {
            console.error('[Comments] 加载失败:', error);
            this.state.error = error.message || '加载失败';
        } finally {
            this.state.loading = false;
        }

        this.renderList();
    };

    /**
     * 带限制的数据请求
     * 一次性请求指定数量的评论数据
     */
    Comments.prototype.fetchWithLimit = async function(sortBy, limit) {
        var result = await this.adapter.getComments({
            sortBy: sortBy,
            pageSize: limit
        });

        return {
            comments: result.comments || [],
            total: result.total || 0
        };
    };

    /**
     * 加载更多评论（已废弃）
     * 现在采用限量一次性加载策略，不再支持无限滚动
     */
    Comments.prototype.loadMoreComments = async function() {
        // 不再支持分页加载，按钮已隐藏
        console.log('[Comments] 已禁用分页加载，当前采用限量一次性加载策略');
    };

    Comments.prototype.updateLoadMoreButton = function(loading) {
        var btn = this.container.querySelector('#load-more-btn');
        if (btn) {
            btn.disabled = loading;
            btn.textContent = loading ? '加载中...' : '加载更多';
        }
    };

    // ==================== 事件处理 ====================
    Comments.prototype.bindFormEvents = function() {
        var self = this;
        // 获取编辑器容器（可能在独立容器中）
        var formContainer = this.editorContainer || this.container;

        var form = formContainer.querySelector('#comments-form');
        if (form) {
            form.addEventListener('submit', function(e) { self.handleSubmit(e); });
        }

        var cancelBtn = formContainer.querySelector('#cancel-reply-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() { self.cancelReply(); });
        }
    };

    Comments.prototype.bindListEvents = function() {
        var self = this;
        var listEl = this.container.querySelector('#comments-list');
        if (!listEl) return;

        listEl.querySelectorAll('.like-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                self.handleLike(btn.dataset.commentId);
            });
        });

        listEl.querySelectorAll('.reply-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                self.handleReply(btn.dataset.commentId, btn.dataset.nick);
            });
        });

        listEl.querySelectorAll('.comments-sort-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                self.handleSort(btn.dataset.sort);
            });
        });

        // 刷新按钮事件绑定
        var refreshBtn = listEl.querySelector('#comments-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function(e) {
                e.preventDefault();
                self.handleRefresh();
            });
        }

        // 管理按钮事件绑定
        var adminBtn = listEl.querySelector('#comments-admin-btn');
        if (adminBtn) {
            adminBtn.addEventListener('click', function(e) {
                e.preventDefault();
                self.handleAdmin();
            });
        }

        // 加载更多展示按钮事件绑定
        var loadMoreBtn = listEl.querySelector('#load-more-display-btn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', function(e) {
                e.preventDefault();
                self.handleLoadMoreDisplay();
            });
        }

        listEl.querySelectorAll('.retry-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                self.loadComments();
            });
        });
    };

    Comments.prototype.handleSubmit = async function(e) {
        e.preventDefault();
        var form = e.target;
        var formData = new FormData(form);

        var data = {
            nick: formData.get('nick'),
            email: formData.get('email'),
            link: formData.get('link'),
            content: formData.get('content'),
            parentId: formData.get('parentId') || undefined
        };

        if (!data.nick || !data.email || !data.content) {
            this.showToast('请填写昵称、邮箱和评论内容', 'error');
            return;
        }

        var submitBtn = form.querySelector('[type="submit"]');
        var originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 发送中...';

        try {
            await this.adapter.submitComment(data);
            form.querySelector('#comment-content').value = '';
            this.cancelReply();
            await this.loadComments();
            this.showToast('评论发表成功！', 'success');
        } catch (error) {
            console.error('[Comments] 提交失败:', error);
            this.showToast(error.message || '发表失败', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    };

    Comments.prototype.handleLike = async function(commentId) {
        var btn = this.container.querySelector('.like-btn[data-comment-id="' + commentId + '"]');
        if (!btn) return;

        // 检查是否已点赞（用于 Waline）
        if (this.adapter.isLiked && this.adapter.isLiked(commentId)) {
            this.showToast('你已经点过赞了', 'info');
            return;
        }

        btn.disabled = true;

        try {
            // 获取当前评论的点赞数（用于比较判断是点赞还是取消）
            var comment = this.findComment(commentId);
            var currentCount = comment ? comment.likes : 0;

            var result = await this.adapter.toggleLike(commentId, currentCount);

            // 处理已点赞的情况
            if (result.alreadyLiked) {
                this.showToast('你已经点过赞了', 'info');
                btn.classList.add('liked');
                var icon = btn.querySelector('i');
                if (icon) icon.className = 'fas fa-heart';
                btn.disabled = false;
                return;
            }

            var newCount = result.likes !== null ? result.likes : 0;
            var isLiked = result.liked;

            // 安全地更新按钮内容（newCount 是数字，安全）
            btn.classList.toggle('liked', isLiked);
            var icon = btn.querySelector('i');
            if (icon) {
                icon.className = 'fa' + (isLiked ? 's' : 'r') + ' fa-heart';
            }
            var countSpan = btn.querySelector('span');
            if (newCount > 0) {
                if (countSpan) {
                    countSpan.textContent = newCount;
                } else {
                    var span = document.createElement('span');
                    span.textContent = newCount;
                    btn.appendChild(span);
                }
            } else if (countSpan) {
                countSpan.remove();
            }

            this.updateCommentLikeState(commentId, newCount, isLiked);

        } catch (error) {
            console.error('[Comments] 点赞失败:', error);
            this.showToast('操作失败: ' + (error.message || '网络错误'), 'error');
        } finally {
            btn.disabled = false;
        }
    };

    Comments.prototype.findComment = function(commentId) {
        var find = function(comments) {
            if (!comments) return null;
            for (var i = 0; i < comments.length; i++) {
                if (comments[i].id === commentId) {
                    return comments[i];
                }
                if (comments[i].children) {
                    var found = find(comments[i].children);
                    if (found) return found;
                }
            }
            return null;
        };
        return find(this.state.comments);
    };

    Comments.prototype.updateCommentLikeState = function(commentId, likes, liked) {
        var update = function(comments) {
            if (!comments) return false;
            for (var i = 0; i < comments.length; i++) {
                if (comments[i].id === commentId) {
                    comments[i].likes = likes;
                    comments[i].liked = liked;
                    return true;
                }
                if (comments[i].children && update(comments[i].children)) return true;
            }
            return false;
        };
        update(this.state.comments);
    };

    Comments.prototype.handleReply = function(commentId, nick) {
        // 获取编辑器容器（可能在独立容器中）
        var formContainer = this.editorContainer || this.container;

        var parentIdInput = formContainer.querySelector('#comment-parent-id');
        if (parentIdInput) parentIdInput.value = commentId;

        var replyIndicator = formContainer.querySelector('#comments-reply-indicator');
        var replyToName = formContainer.querySelector('#reply-to-name');
        if (replyIndicator && replyToName) {
            replyToName.textContent = nick;
            replyIndicator.classList.add('active');
        }

        // 滚动到编辑器位置并添加高亮动画
        var editorElement = formContainer.querySelector('.comments-form');
        if (editorElement) {
            editorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 添加高亮动画
            editorElement.classList.add('is-replying');
            setTimeout(function() {
                editorElement.classList.remove('is-replying');
            }, 600);
        }

        var textarea = formContainer.querySelector('#comment-content');
        if (textarea) {
            // 延迟聚焦，等待滚动动画
            setTimeout(function() {
                textarea.focus();
            }, 300);
        }

        this.state.replyTo = { id: commentId, nick: nick };
    };

    Comments.prototype.cancelReply = function() {
        var formContainer = this.editorContainer || this.container;

        var parentIdInput = formContainer.querySelector('#comment-parent-id');
        if (parentIdInput) parentIdInput.value = '';

        var replyIndicator = formContainer.querySelector('#comments-reply-indicator');
        if (replyIndicator) replyIndicator.classList.remove('active');

        var replyToName = formContainer.querySelector('#reply-to-name');
        if (replyToName) replyToName.textContent = '';

        this.state.replyTo = null;
    };

    /**
     * 加载更多展示（渐进式展示）
     * 不请求新数据，只增加展示数量
     * 按总评论数（含回复）增量展示
     */
    Comments.prototype.handleLoadMoreDisplay = function() {
        var allComments = this.state.comments;
        var allTotalWithReplies = this.countAllComments(allComments);

        // 当前已展示的总评论数
        var currentCount = this.state.displayedCount;

        // 增加展示数量
        var newCount = Math.min(currentCount + this.displayIncrement, allTotalWithReplies);

        if (newCount > currentCount) {
            this.state.displayedCount = newCount;
            console.log('[Comments] 展示更多评论:', currentCount, '→', newCount, '/', allTotalWithReplies, '条（含回复）');
            this.renderList();

            // 滚动到新加载的第一条评论
            var listEl = this.container.querySelector('.comments-items');
            if (listEl) {
                // 找到第一条新加载的评论
                var sliceResult = this.sliceCommentsByTotalCount(allComments, currentCount);
                var firstNewIndex = sliceResult.comments.length;

                if (listEl.children[firstNewIndex]) {
                    listEl.children[firstNewIndex].scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            }
        }
    };

    Comments.prototype.handleSort = function(sortBy) {
        if (this.state.sortBy === sortBy) return;
        this.state.sortBy = sortBy;
        this.loadComments();
    };

    /**
     * 刷新当前排序的评论列表
     * 清除缓存并重新加载当前排序方式的数据
     */
    Comments.prototype.handleRefresh = async function() {
        var refreshBtn = this.container.querySelector('#comments-refresh-btn');
        if (!refreshBtn) return;

        // 添加旋转动画
        refreshBtn.classList.add('is-refreshing');

        try {
            // 清除对应的缓存，强制重新请求
            if (this.state.sortBy === 'newest') {
                sharedDataCache.newest = null;
            } else if (this.state.sortBy === 'hot') {
                sharedDataCache.hot = null;
            }

            // 重新加载评论
            await this.loadComments();
        } finally {
            // 移除旋转动画（延迟一点确保用户能看到）
            setTimeout(function() {
                refreshBtn.classList.remove('is-refreshing');
            }, 300);
        }
    };

    /**
     * 获取管理后台 URL
     * @returns {string|null} 管理后台地址，不支持时返回 null
     */
    Comments.prototype.getAdminUrl = function() {
        var server = this.adapter.server;
        var provider = this.adapter.name;

        if (provider === 'waline') {
            return server + '/ui';
        } else if (provider === 'artalk') {
            return server + '/sidebar/';
        }
        return null;
    };

    /**
     * 打开管理后台
     * 根据评论系统类型打开对应的管理界面
     */
    Comments.prototype.handleAdmin = function() {
        var adminUrl = this.getAdminUrl();
        if (adminUrl) {
            window.open(adminUrl, '_blank');
        } else {
            this.showToast('当前评论系统不支持独立管理后台', 'info');
        }
    };

    Comments.prototype.showToast = function(message, type) {
        type = type || 'info';
        var toast = document.createElement('div');
        toast.textContent = message;

        var bgColor = type === 'success' ? 'var(--accent)' : type === 'error' ? '#ef4444' : 'var(--bg-secondary)';
        var textColor = type === 'success' || type === 'error' ? '#fff' : 'var(--text-primary)';

        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:12px 24px;background:' + bgColor + ';color:' + textColor + ';border-radius:var(--radius-sm);font-size:.875rem;z-index:9999;';
        document.body.appendChild(toast);

        setTimeout(function() { toast.remove(); }, 3000);
    };

    Comments.prototype.refresh = async function() {
        await this.loadComments();
    };

    Comments.prototype.destroy = function() {
        this.container.innerHTML = '';
    };

    // ==================== 弹幕数据获取 ====================
    /**
     * 【性能优化】获取共享数据 - 用于弹幕和评论列表
     * 单次请求 newest 数据，缓存后供多个模块使用
     * 支持请求去重：如果有正在进行的相同请求，返回该 Promise
     *
     * @param {Object} config - 配置 { server, provider, pageKey, site }
     * @param {Object} options - 可选配置 { pageSize: 50, forceRefresh: false }
     * @returns {Promise<Object>} { comments, total, hasMore, offset }
     */
    Comments.fetchUnifiedData = async function(config, options) {
        options = options || {};
        var pageSize = options.pageSize || 50;
        var forceRefresh = options.forceRefresh || false;

        // 检查缓存
        if (!forceRefresh) {
            var cached = sharedDataCache.get('newest');
            if (cached) {
                console.log('[Comments] 使用缓存的 newest 数据');
                return cached;
            }
        }

        // 【请求去重】检查是否有正在进行的相同请求
        var pendingRequest = sharedDataCache.getPending('newest');
        if (pendingRequest) {
            console.log('[Comments] 等待正在进行的 newest 请求...');
            return pendingRequest;
        }

        // 创建新的请求 Promise
        var requestPromise = (async function() {
            try {
                var adapter = createAdapter(config.provider, {
                    server: config.server,
                    pageKey: config.pageKey || '/guestbook',
                    site: config.site || '',
                    pageSize: pageSize
                });

                // 单次请求 newest 数据
                var result = await adapter.getComments({ sortBy: 'newest', pageSize: pageSize });

                // 缓存结果
                var data = {
                    comments: result.comments || [],
                    total: result.total || 0,
                    hasMore: result.hasMore || false,
                    offset: result.offset || 0
                };

                sharedDataCache.set('newest', data);
                console.log('[Comments] 已缓存 newest 数据:', data.comments.length, '条');

                return data;
            } catch (error) {
                console.error('[Comments] 获取共享数据失败:', error);
                throw error;
            } finally {
                // 清除 pending 状态
                sharedDataCache.clearPending('newest');
            }
        })();

        // 设置 pending 状态
        sharedDataCache.setPending('newest', requestPromise);

        return requestPromise;
    };

    /**
     * 【性能优化】获取热门排序数据 - 按需加载
     * 支持请求去重
     *
     * @param {Object} config - 配置
     * @param {Object} options - 可选配置
     * @returns {Promise<Object>} { comments, total, hasMore, offset }
     */
    Comments.fetchHotData = async function(config, options) {
        options = options || {};
        var pageSize = options.pageSize || 50;
        var forceRefresh = options.forceRefresh || false;

        // 检查缓存
        if (!forceRefresh) {
            var cached = sharedDataCache.get('hot');
            if (cached) {
                console.log('[Comments] 使用缓存的 hot 数据');
                return cached;
            }
        }

        // 【请求去重】检查是否有正在进行的相同请求
        var pendingRequest = sharedDataCache.getPending('hot');
        if (pendingRequest) {
            console.log('[Comments] 等待正在进行的 hot 请求...');
            return pendingRequest;
        }

        // 创建新的请求 Promise
        var requestPromise = (async function() {
            try {
                var adapter = createAdapter(config.provider, {
                    server: config.server,
                    pageKey: config.pageKey || '/guestbook',
                    site: config.site || '',
                    pageSize: pageSize
                });

                var result = await adapter.getComments({ sortBy: 'hot', pageSize: pageSize });

                var data = {
                    comments: result.comments || [],
                    total: result.total || 0,
                    hasMore: result.hasMore || false,
                    offset: result.offset || 0
                };

                sharedDataCache.set('hot', data);
                console.log('[Comments] 已缓存 hot 数据:', data.comments.length, '条');

                return data;
            } catch (error) {
                console.error('[Comments] 获取热门数据失败:', error);
                throw error;
            } finally {
                // 清除 pending 状态
                sharedDataCache.clearPending('hot');
            }
        })();

        // 设置 pending 状态
        sharedDataCache.setPending('hot', requestPromise);

        return requestPromise;
    };

    /**
     * 获取用于弹幕显示的评论数据
     * 使用共享数据缓存，避免重复请求
     * 筛选规则由调用方通过 options 指定
     *
     * @param {Object} config - 配置 { server, provider, pageKey, site }
     * @param {Object} options - 弹幕数量限制 { pinned: 5, hot: 10, latest: 5 }
     * @returns {Promise<Array>} 弹幕数据数组
     */
    Comments.fetchBarrageComments = async function(config, options) {
        options = options || {};
        var pinnedLimit = options.pinned || 5;
        var hotLimit = options.hot || 10;
        var latestLimit = options.latest || 5;

        // 计算需要获取的数据量：确保足够覆盖所有弹幕筛选
        var totalNeeded = pinnedLimit + hotLimit + latestLimit + 10; // 额外加 10 条缓冲

        try {
            // 获取 newest 数据（用于弹幕和评论列表共享）
            var newestData = await Comments.fetchUnifiedData(config, { pageSize: totalNeeded });
            var newestComments = newestData.comments || [];

            // 热门数据使用缓存或从 newest 数据模拟
            var hotData = sharedDataCache.get('hot');
            var hotComments;
            if (hotData && hotData.comments) {
                hotComments = hotData.comments;
            } else {
                // 使用 newest 数据按点赞数排序模拟热门
                hotComments = newestComments.slice().sort(function(a, b) {
                    return (b.likes || 0) - (a.likes || 0);
                });
            }

            // 提取置顶评论
            var pinnedComments = newestComments
                .filter(function(c) { return c.pinned; })
                .slice(0, pinnedLimit);

            // 提取热门评论（排除已选的置顶评论）
            var pinnedIds = new Set(pinnedComments.map(function(c) { return c.id; }));
            var hotCommentsFiltered = hotComments
                .filter(function(c) { return !pinnedIds.has(c.id); })
                .slice(0, hotLimit);

            // 提取最新评论（排除已选的置顶和热门评论）
            var hotIds = new Set(hotCommentsFiltered.map(function(c) { return c.id; }));
            var latestCommentsFiltered = newestComments
                .filter(function(c) { return !pinnedIds.has(c.id) && !hotIds.has(c.id); })
                .slice(0, latestLimit);

            // 合并数据
            var allSelected = []
                .concat(pinnedComments)
                .concat(hotCommentsFiltered)
                .concat(latestCommentsFiltered);

            // 转换为弹幕数据格式
            return allSelected.map(function(comment) {
                return {
                    id: comment.id,
                    content: comment.content.replace(/<[^>]*>/g, ''),
                    author: comment.user ? comment.user.nick : 'Anonymous',
                    likes: comment.likes || 0,
                    pinned: comment.pinned || false,
                    createdAt: comment.createdAt
                };
            });
        } catch (error) {
            console.error('[Comments] 获取弹幕数据失败:', error);
            return [];
        }
    };

    /**
     * 清除共享数据缓存
     */
    Comments.clearCache = function() {
        sharedDataCache.clear();
        console.log('[Comments] 已清除数据缓存');
    };

    // ==================== 导出 ====================
    global.Comments = Comments;
    global.CommentAdapters = {
        ArtalkAdapter: ArtalkAdapter,
        WalineAdapter: WalineAdapter,
        createAdapter: createAdapter
    };

})(typeof window !== 'undefined' ? window : this);
