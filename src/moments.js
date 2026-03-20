/**
 * Memos 动态模块
 * 支持：时间线布局、标签筛选、图片灯箱、完整 Markdown 渲染、加载更多
 * 扩展：触摸滑动切换图片、代码语法高亮
 *
 * 安全说明：所有用户内容通过 DOM API 安全创建，避免 XSS
 */

class MomentsFeed {
  constructor(config) {
    this.config = config;
    this.container = document.getElementById('moments-feed');
    this.filterContainer = document.querySelector('.moments-filter');
    this.loadMoreBtn = null;
    this.loadMoreBtnBound = false; // 标记加载更多按钮事件是否已绑定
    this.filterContainerDelegateBound = false; // 标记标签筛选器事件委托是否已绑定
    this.imageClickDelegateBound = false; // 标记图片点击事件委托是否已绑定
    this.initialized = false;

    // 无限滚动相关
    this.infiniteScrollEnabled = true; // 是否启用无限滚动
    this.sentinel = null; // 哨兵元素
    this.intersectionObserver = null; // IntersectionObserver 实例
    this.isLoading = false;
    this.initialTags = new Set();
    this.activeTag = null;
    // 为每个标签（包括 null/全部）维护独立的分页 token
    this.nextTokens = new Map(); // key: tag or 'all', value: nextToken
    // 为每个标签维护独立的已渲染 memo ID 集合，防止标签间交叉污染
    this.renderedMemoIdsByTag = new Map(); // key: tag or 'all', value: Set of memo.name
    this.lightbox = null;
    this.currentImageIndex = 0;
    this.currentImages = [];

    // 请求追踪：防止竞态条件
    this.requestId = 0; // 自增请求ID
    this.pendingRequest = null; // 当前进行中的请求信息

    // 标签筛选器状态：避免重复渲染
    this.lastRenderedActiveTag = undefined; // 上次渲染时的 activeTag
    this.lastRenderedTagsJson = ''; // 上次渲染的标签列表 JSON

    // 触摸滑动状态
    this.touchState = {
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      isSwiping: false,
      direction: null
    };

    // 绑定方法到实例，确保事件监听器可以正确移除
    this._handleLoadMoreClick = this._handleLoadMoreClick.bind(this);
    this._handleIntersection = this._handleIntersection.bind(this);
  }

  /**
   * "加载更多"按钮点击处理函数（保留作为备用）
   */
  _handleLoadMoreClick() {
    if (!this.isLoading) {
      this.fetch(true);
    }
  }

  /**
   * IntersectionObserver 回调：当哨兵进入视口时加载更多
   */
  _handleIntersection(entries) {
    var self = this;
    entries.forEach(function(entry) {
      // 当哨兵进入视口且不在加载中时，加载下一页
      if (entry.isIntersecting && !self.isLoading && self.infiniteScrollEnabled) {
        var hasNextPage = self.getNextTokenForTag(self.activeTag);
        if (hasNextPage) {
          console.log('[Moments] 触发无限滚动加载');
          self.fetch(true);
        }
      }
    });
  }

  /**
   * 初始化无限滚动
   */
  initInfiniteScroll() {
    var self = this;

    // 如果已经有 Observer，先销毁
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    // 创建 IntersectionObserver
    this.intersectionObserver = new IntersectionObserver(this._handleIntersection, {
      root: null, // 使用视口作为根
      rootMargin: '200px', // 提前 200px 触发
      threshold: 0
    });

    // 创建哨兵元素（如果还没有）
    if (!this.sentinel) {
      this.sentinel = document.createElement('div');
      this.sentinel.className = 'infinite-scroll-sentinel';
      this.sentinel.setAttribute('aria-hidden', 'true');
    }

    // 确保哨兵在容器中
    var container = document.querySelector('.load-more-container');
    if (container && !container.contains(this.sentinel)) {
      container.textContent = '';
      container.appendChild(this.sentinel);
    }

    // 开始观察哨兵
    if (this.sentinel) {
      this.intersectionObserver.observe(this.sentinel);
    }

    console.log('[Moments] 无限滚动已初始化');
  }

  /**
   * 更新无限滚动状态（根据是否有下一页显示/隐藏哨兵）
   */
  updateInfiniteScrollState() {
    if (!this.sentinel) return;

    var hasNextPage = this.getNextTokenForTag(this.activeTag);
    this.sentinel.style.display = hasNextPage ? 'block' : 'none';
  }

  async init() {
    if (!this.config?.enabled || !this.config.memosUrl) {
      console.warn('Moments module disabled or URL not configured');
      return;
    }

    // 创建灯箱
    this.createLightbox();

    // 初始化无限滚动
    this.initInfiniteScroll();

    if (this.config.showSkeleton !== false) {
      this.showSkeleton();
    }

    // 优化首屏加载：先获取首屏数据，再异步获取标签列表
    // 这样首屏内容不会因标签收集而阻塞
    await this.fetch();

    // 延迟异步获取标签列表（不阻塞首屏渲染）
    this.fetchAllTags().then(() => {
      if (this.initialTags.size > 0) {
        this.renderFilterTags();
      }
    }).catch((err) => {
      console.warn('[Moments] 标签列表获取失败，不影响主要内容:', err);
    });

    this.initialized = true;
  }

  /**
   * 获取当前标签的已渲染 memo ID 集合
   */
  getRenderedMemoIdsForTag(tag) {
    const key = tag || 'all';
    if (!this.renderedMemoIdsByTag.has(key)) {
      this.renderedMemoIdsByTag.set(key, new Set());
    }
    return this.renderedMemoIdsByTag.get(key);
  }

  /**
   * 清空指定标签的已渲染 memo ID 集合
   */
  clearRenderedMemoIdsForTag(tag) {
    const key = tag || 'all';
    this.renderedMemoIdsByTag.delete(key);
  }

  /**
   * 获取所有标签（用于标签筛选器）
   * 遍历所有分页获取完整标签列表，确保不遗漏任何标签
   */
  async fetchAllTags() {
    var self = this;
    try {
      var baseUrl = this.config.memosUrl.replace(/\/$/, '');
      var filter = "visibility == 'PUBLIC'";

      // 配置预设标签过滤（如果有）
      if (this.config.tags && this.config.tags.length > 0) {
        var tagFilters = this.config.tags.map(function(tag) {
          return "'" + self.escapeCelString(tag) + "' in tags";
        });
        filter = filter + ' && (' + tagFilters.join(' || ') + ')';
      }

      // 分页获取所有 memos 以收集完整标签列表
      var hasMorePages = true;
      var nextPageToken = null;
      var pageCount = 0;
      const maxPages = 20; // 安全限制：最多获取20页

      while (hasMorePages && pageCount < maxPages) {
        pageCount++;
        var params = [];
        params.push('filter=' + encodeURIComponent(filter));
        params.push('orderBy=' + encodeURIComponent('pinned desc, display_time desc'));
        params.push('pageSize=100');

        if (nextPageToken) {
          params.push('pageToken=' + encodeURIComponent(nextPageToken));
        }

        var url = baseUrl + '/api/v1/memos?' + params.join('&');
        console.log('[Moments] 获取标签列表第' + pageCount + '页:', url);

        var response = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }

        var data = await response.json();
        var memos = data.memos || [];

        // 从当前页 memos 中收集标签
        memos.forEach(function(m) {
          if (m.tags && Array.isArray(m.tags)) {
            m.tags.forEach(function(tag) {
              if (typeof tag === 'string' && tag.trim()) {
                self.initialTags.add(tag.trim());
              }
            });
          }
        });

        // 检查是否还有更多页
        nextPageToken = data.nextPageToken;
        hasMorePages = !!nextPageToken;

        console.log('[Moments] 第' + pageCount + '页收集到', memos.length, '条动态，标签总数:', self.initialTags.size);
      }

      console.log('[Moments] 标签列表收集完成，共' + pageCount + '页，标签:', Array.from(self.initialTags).sort());

    } catch (error) {
      console.error('[Moments] 获取标签列表失败:', error);
      // 不阻止后续数据加载
    }
  }

  /**
   * 构建 API URL
   * 注意：Memos API v1 使用 CEL 表达式语法
   * 正确语法：'tag' in tags（而非 tags contains 'tag'）
   * @param {string|null} pageToken - 分页token
   * @param {string|null} tagFilter - 用于构建URL的标签（独立于this.activeTag）
   */
  buildApiUrl(pageToken, tagFilter) {
    var self = this;
    var baseUrl = this.config.memosUrl.replace(/\/$/, '');
    // 基础过滤条件：只获取公开可见的动态
    var filter = "visibility == 'PUBLIC'";

    if (tagFilter) {
      // 按单个标签筛选：使用 CEL 语法 'tag' in tags
      filter = filter + " && '" + this.escapeCelString(tagFilter) + "' in tags";
    } else if (this.config.tags && this.config.tags.length > 0) {
      // 配置预设标签过滤：使用 OR 连接多个标签条件
      var tagFilters = this.config.tags.map(function(tag) {
        return "'" + self.escapeCelString(tag) + "' in tags";
      });
      filter = filter + ' && (' + tagFilters.join(' || ') + ')';
    }

    // 手动构建查询字符串，使用 encodeURIComponent 确保正确编码
    // 注意：URLSearchParams 会将空格编码为 +，但某些API期望 %20
    var params = [];
    params.push('filter=' + encodeURIComponent(filter));
    params.push('orderBy=' + encodeURIComponent('pinned desc, display_time desc'));
    params.push('pageSize=' + (this.config.count || 10));

    if (pageToken) {
      params.push('pageToken=' + encodeURIComponent(pageToken));
    }

    return baseUrl + '/api/v1/memos?' + params.join('&');
  }

  /**
   * 转义 CEL 表达式中的特殊字符
   * 防止标签名中包含单引号等字符导致语法错误
   */
  escapeCelString(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /**
   * 获取标签对应的 token key
   */
  getTokenKeyForTag(tag) {
    return tag || 'all';
  }

  /**
   * 获取指定标签的 nextToken
   */
  getNextTokenForTag(tag) {
    return this.nextTokens.get(this.getTokenKeyForTag(tag)) || null;
  }

  /**
   * 设置指定标签的 nextToken
   */
  setNextTokenForTag(tag, token) {
    var key = this.getTokenKeyForTag(tag);
    if (token) {
      this.nextTokens.set(key, token);
    } else {
      this.nextTokens.delete(key);
    }
  }

  /**
   * 获取数据（带竞态条件保护）
   * @param {boolean} append - 是否追加模式（加载更多）
   */
  async fetch(append) {
    var self = this;
    append = append || false;

    // 如果有正在进行的请求，取消它（通过ID标记为过期）
    if (this.pendingRequest) {
      this.pendingRequest.cancelled = true;
    }

    // 创建新的请求追踪对象
    this.requestId++;
    var requestInfo = {
      id: this.requestId,
      tag: this.activeTag,          // 记录发起请求时的标签状态
      append: append,               // 记录是否追加模式
      cancelled: false              // 是否被取消
    };
    this.pendingRequest = requestInfo;

    this.isLoading = true;
    this.updateLoadingState(true);

    try {
      if (!append) {
        // 非追加模式：清空容器，重置该标签的分页状态，清空该标签的已渲染ID集合
        this.container.textContent = '';
        this.clearRenderedMemoIdsForTag(requestInfo.tag);
        this.setNextTokenForTag(requestInfo.tag, null);
      }

      // 获取该标签的分页token
      var pageToken = this.getNextTokenForTag(requestInfo.tag);
      // 使用请求时的标签构建URL（而非this.activeTag）
      var url = this.buildApiUrl(append ? pageToken : null, requestInfo.tag);

      console.log('[Moments] 发起请求:', {
        requestId: requestInfo.id,
        tag: requestInfo.tag,
        append: append,
        url: url
      });

      var response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      // 检查请求是否已被取消
      if (requestInfo.cancelled) {
        console.log('[Moments] 请求已取消，忽略响应:', requestInfo.id);
        return;
      }

      if (!response.ok) {
        // 尝试获取错误详情
        var errorDetail = 'HTTP ' + response.status;
        try {
          var errorText = await response.text();
          console.error('[Moments] API错误响应:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText.substring(0, 500),
            url: url
          });
          errorDetail += ' - ' + errorText.substring(0, 100);
        } catch (e) {
          // 忽略解析错误
        }
        throw new Error(errorDetail);
      }

      var data = await response.json();

      // 再次检查请求是否已被取消（解析JSON期间可能被取消）
      if (requestInfo.cancelled) {
        console.log('[Moments] 请求已取消，忽略数据:', requestInfo.id);
        return;
      }

      // 验证响应是否与当前状态匹配
      if (requestInfo.tag !== this.activeTag) {
        console.warn('[Moments] 状态不匹配，丢弃响应:', {
          requestTag: requestInfo.tag,
          currentTag: this.activeTag
        });
        return;
      }

      console.log('[Moments] 收到响应:', {
        requestId: requestInfo.id,
        memosCount: (data.memos || []).length,
        hasNextPage: !!data.nextPageToken
      });

      // 保存该标签的nextToken
      this.setNextTokenForTag(requestInfo.tag, data.nextPageToken || null);

      // 渲染数据
      this.render(data.memos || [], append, requestInfo.tag);
      this.updateInfiniteScrollState();

    } catch (error) {
      // 只在未被取消时报告错误
      if (!requestInfo.cancelled) {
        console.error('[Moments] 请求失败:', error);
        this.showError();
      }
    } finally {
      // 只在当前请求是最新请求时才清除loading状态
      if (this.pendingRequest && this.pendingRequest.id === requestInfo.id) {
        this.pendingRequest = null;
      }
      this.isLoading = false;
      this.updateLoadingState(false);
    }
  }

  /**
   * 更新加载状态（无限滚动模式下显示加载指示器）
   */
  updateLoadingState(loading) {
    var container = document.querySelector('.load-more-container');
    if (!container) return;

    if (loading) {
      // 显示加载指示器
      var loader = container.querySelector('.infinite-scroll-loader');
      if (!loader) {
        loader = document.createElement('div');
        loader.className = 'infinite-scroll-loader';
        var spinner = document.createElement('div');
        spinner.className = 'spinner';
        var text = document.createElement('span');
        text.textContent = '加载中...';
        loader.appendChild(spinner);
        loader.appendChild(text);
        container.appendChild(loader);
      }
      loader.style.display = 'flex';
      // 隐藏哨兵
      if (this.sentinel) {
        this.sentinel.style.display = 'none';
      }
    } else {
      // 隐藏加载指示器
      var loader = container.querySelector('.infinite-scroll-loader');
      if (loader) {
        loader.style.display = 'none';
      }
      // 显示哨兵（如果还有更多数据）
      this.updateInfiniteScrollState();
    }
  }

  /**
   * 创建图片灯箱
   */
  createLightbox() {
    if (this.lightbox) return;

    const self = this;
    const lightbox = document.createElement('div');
    lightbox.className = 'moment-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', '图片预览');

    // 背景遮罩
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';

    // 内容容器
    const content = document.createElement('div');
    content.className = 'lightbox-content';

    // 图片
    const img = document.createElement('img');
    img.className = 'lightbox-image';
    img.alt = '';

    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.className = 'lightbox-close';
    closeBtn.setAttribute('aria-label', '关闭');
    const closeIcon = document.createElement('i');
    closeIcon.className = 'fa-solid fa-xmark';
    closeBtn.appendChild(closeIcon);

    // 导航按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = 'lightbox-nav lightbox-prev';
    prevBtn.setAttribute('aria-label', '上一张');
    const prevIcon = document.createElement('i');
    prevIcon.className = 'fa-solid fa-chevron-left';
    prevBtn.appendChild(prevIcon);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'lightbox-nav lightbox-next';
    nextBtn.setAttribute('aria-label', '下一张');
    const nextIcon = document.createElement('i');
    nextIcon.className = 'fa-solid fa-chevron-right';
    nextBtn.appendChild(nextIcon);

    // 图片计数器
    const counter = document.createElement('div');
    counter.className = 'lightbox-counter';

    content.appendChild(img);
    lightbox.appendChild(overlay);
    lightbox.appendChild(content);
    lightbox.appendChild(closeBtn);
    lightbox.appendChild(prevBtn);
    lightbox.appendChild(nextBtn);
    lightbox.appendChild(counter);

    document.body.appendChild(lightbox);
    this.lightbox = lightbox;

    // 统一的事件处理入口
    function handleLightboxClick(e) {
      try {
        // 关闭按钮
        if (e.target.closest('.lightbox-close') || e.target.closest('.lightbox-overlay')) {
          self.closeLightbox();
          return;
        }
        // 上一张
        if (e.target.closest('.lightbox-prev')) {
          self.showPrevImage();
          return;
        }
        // 下一张
        if (e.target.closest('.lightbox-next')) {
          self.showNextImage();
          return;
        }
      } catch (err) {
        console.error('[Moments] 灯箱点击处理错误:', err);
      }
    }

    lightbox.addEventListener('click', handleLightboxClick);

    // 键盘导航
    this._handleKeydown = function(e) {
      if (!lightbox.classList.contains('is-active')) return;
      try {
        if (e.key === 'Escape') {
          self.closeLightbox();
        } else if (e.key === 'ArrowLeft') {
          self.showPrevImage();
        } else if (e.key === 'ArrowRight') {
          self.showNextImage();
        }
      } catch (err) {
        console.error('[Moments] 键盘导航错误:', err);
      }
    };
    document.addEventListener('keydown', this._handleKeydown);

    // 触摸滑动支持
    this.initLightboxTouchEvents(content);
  }

  /**
   * 初始化灯箱触摸事件
   */
  initLightboxTouchEvents(content) {
    const self = this;
    const threshold = 50;
    const restraint = 100;

    content.addEventListener('touchstart', function(e) {
      try {
        const touch = e.touches[0];
        self.touchState.startX = touch.clientX;
        self.touchState.startY = touch.clientY;
        self.touchState.currentX = touch.clientX;
        self.touchState.currentY = touch.clientY;
        self.touchState.isSwiping = false;
        self.touchState.direction = null;
      } catch (err) {
        console.error('[Moments] 触摸开始处理错误:', err);
      }
    }, { passive: true });

    content.addEventListener('touchmove', function(e) {
      try {
        if (!self.lightbox || !self.lightbox.classList.contains('is-active')) return;

        const touch = e.touches[0];
        self.touchState.currentX = touch.clientX;
        self.touchState.currentY = touch.clientY;

        const deltaX = self.touchState.currentX - self.touchState.startX;
        const deltaY = self.touchState.currentY - self.touchState.startY;

        if (Math.abs(deltaX) > threshold && Math.abs(deltaY) < restraint) {
          self.touchState.isSwiping = true;
          self.touchState.direction = deltaX > 0 ? 'right' : 'left';

          const img = self.lightbox.querySelector('.lightbox-image');
          if (img) {
            img.style.transform = 'translateX(' + (deltaX * 0.3) + 'px)';
            img.style.transition = 'transform 0.05s linear';
          }
        }
      } catch (err) {
        console.error('[Moments] 触摸移动处理错误:', err);
      }
    }, { passive: true });

    content.addEventListener('touchend', function(e) {
      try {
        if (!self.touchState.isSwiping) return;

        if (self.lightbox) {
          const img = self.lightbox.querySelector('.lightbox-image');
          if (img) {
            img.style.transform = '';
            img.style.transition = 'transform 0.2s ease-out';
          }
        }

        if (self.touchState.direction === 'left') {
          self.showNextImage();
        } else if (self.touchState.direction === 'right') {
          self.showPrevImage();
        }

        self.touchState.isSwiping = false;
        self.touchState.direction = null;
      } catch (err) {
        console.error('[Moments] 触摸结束处理错误:', err);
        self.touchState.isSwiping = false;
        self.touchState.direction = null;
      }
    }, { passive: true });

    content.addEventListener('touchcancel', function() {
      try {
        if (self.lightbox) {
          const img = self.lightbox.querySelector('.lightbox-image');
          if (img) {
            img.style.transform = '';
            img.style.transition = '';
          }
        }
        self.touchState.isSwiping = false;
        self.touchState.direction = null;
      } catch (err) {
        console.error('[Moments] 触摸取消处理错误:', err);
      }
    }, { passive: true });
  }

  /**
   * 打开灯箱
   * @param {Array} images - 图片数据数组 [{url, alt}, ...]
   * @param {number} index - 初始显示的图片索引
   */
  openLightbox(images, index) {
    try {
      // 验证灯箱元素
      if (!this.lightbox) {
        console.error('[Moments] 灯箱未初始化，无法打开');
        return;
      }

      // 验证图片数据
      if (!Array.isArray(images) || images.length === 0) {
        console.warn('[Moments] 没有有效的图片数据');
        return;
      }

      // 验证并修正索引
      const safeIndex = Math.max(0, Math.min(index || 0, images.length - 1));

      // 设置状态
      this.currentImages = images;
      this.currentImageIndex = safeIndex;

      // 更新图片显示
      this.updateLightboxImage();

      // 显示灯箱
      this.lightbox.classList.add('is-active');
      document.body.style.overflow = 'hidden';

    } catch (err) {
      console.error('[Moments] 打开灯箱时发生错误:', err);
      // 尝试恢复页面状态
      document.body.style.overflow = '';
    }
  }

  /**
   * 关闭灯箱
   */
  closeLightbox() {
    try {
      if (this.lightbox) {
        this.lightbox.classList.remove('is-active');
      }
      document.body.style.overflow = '';
    } catch (err) {
      console.error('[Moments] 关闭灯箱时发生错误:', err);
      document.body.style.overflow = '';
    }
  }

  /**
   * 更新灯箱图片
   */
  updateLightboxImage() {
    try {
      // 验证灯箱元素
      if (!this.lightbox) {
        console.warn('[Moments] 灯箱元素不存在');
        return;
      }

      // 获取 DOM 元素
      const img = this.lightbox.querySelector('.lightbox-image');
      const counter = this.lightbox.querySelector('.lightbox-counter');
      const prevBtn = this.lightbox.querySelector('.lightbox-prev');
      const nextBtn = this.lightbox.querySelector('.lightbox-next');

      if (!img) {
        console.warn('[Moments] 图片元素不存在');
        return;
      }

      // 验证图片数据
      if (!Array.isArray(this.currentImages) || this.currentImages.length === 0) {
        console.warn('[Moments] 当前图片数据无效');
        return;
      }

      // 验证索引
      if (this.currentImageIndex < 0 || this.currentImageIndex >= this.currentImages.length) {
        console.warn('[Moments] 图片索引越界:', this.currentImageIndex, '总数:', this.currentImages.length);
        this.currentImageIndex = 0;
      }

      // 获取当前图片数据
      const current = this.currentImages[this.currentImageIndex];
      if (!current || !current.url) {
        console.warn('[Moments] 当前图片数据无效:', current);
        return;
      }

      // 更新图片
      img.src = current.url;
      img.alt = current.alt || '';

      // 更新计数器
      if (counter) {
        counter.textContent = (this.currentImageIndex + 1) + ' / ' + this.currentImages.length;
      }

      // 更新导航按钮
      const showNav = this.currentImages.length > 1;
      if (prevBtn) prevBtn.style.display = showNav ? 'flex' : 'none';
      if (nextBtn) nextBtn.style.display = showNav ? 'flex' : 'none';

    } catch (err) {
      console.error('[Moments] 更新灯箱图片时发生错误:', err);
    }
  }

  /**
   * 显示上一张图片
   */
  showPrevImage() {
    try {
      if (!Array.isArray(this.currentImages) || this.currentImages.length === 0) return;

      if (this.currentImageIndex > 0) {
        this.currentImageIndex--;
      } else {
        this.currentImageIndex = this.currentImages.length - 1;
      }
      this.updateLightboxImage();
    } catch (err) {
      console.error('[Moments] 显示上一张图片时发生错误:', err);
    }
  }

  /**
   * 显示下一张图片
   */
  showNextImage() {
    try {
      if (!Array.isArray(this.currentImages) || this.currentImages.length === 0) return;

      if (this.currentImageIndex < this.currentImages.length - 1) {
        this.currentImageIndex++;
      } else {
        this.currentImageIndex = 0;
      }
      this.updateLightboxImage();
    } catch (err) {
      console.error('[Moments] 显示下一张图片时发生错误:', err);
    }
  }

  /**
   * 骨架屏
   */
  showSkeleton() {
    this.container.textContent = '';

    const skeleton = document.createElement('div');
    skeleton.className = 'moments-skeleton';
    skeleton.setAttribute('role', 'status');
    skeleton.setAttribute('aria-label', '加载中');

    for (let i = 0; i < 3; i++) {
      const item = document.createElement('div');
      item.className = 'skeleton-item';

      // 元信息区（日期 + 标签）- 卡片外部
      const header = document.createElement('div');
      header.className = 'skeleton-header';

      const date = document.createElement('div');
      date.className = 'skeleton-date';

      const tag = document.createElement('div');
      tag.className = 'skeleton-tag';

      header.appendChild(date);
      header.appendChild(tag);

      // 卡片容器
      const card = document.createElement('div');
      card.className = 'skeleton-card';

      const content = document.createElement('div');
      content.className = 'skeleton-content';

      const line1 = document.createElement('div');
      line1.className = 'skeleton-line';

      const line2 = document.createElement('div');
      line2.className = 'skeleton-line short';

      content.appendChild(line1);
      content.appendChild(line2);

      card.appendChild(content);

      item.appendChild(header);
      item.appendChild(card);
      skeleton.appendChild(item);
    }

    this.container.appendChild(skeleton);
  }

  /**
   * 渲染动态列表
   * @param {Array} moments - 动态数据数组
   * @param {boolean} append - 是否追加模式
   * @param {string|null} requestTag - 发起请求时的标签（用于验证）
   */
  render(moments, append, requestTag) {
    var self = this;
    append = append || false;
    requestTag = requestTag !== undefined ? requestTag : this.activeTag;

    if (!append) {
      // 查找骨架屏元素，添加淡出动画
      const skeleton = this.container.querySelector('.moments-skeleton');
      if (skeleton && !skeleton.classList.contains('skeleton-fade-out')) {
        skeleton.classList.add('skeleton-fade-out');
        // 等待动画完成后再清空容器并渲染
        setTimeout(function() {
          self.container.textContent = '';
          self._renderMomentsContent(moments, requestTag);
        }, 300);
        return;
      }
      // 没有骨架屏或已在淡出中，直接清空
      this.container.textContent = '';
    }

    this._renderMomentsContent(moments, requestTag);
  }

  /**
   * 实际渲染动态内容（从 render 方法提取）
   * @param {Array} moments - 动态数据数组
   * @param {string|null} requestTag - 发起请求时的标签
   */
  _renderMomentsContent(moments, requestTag) {
    var self = this;
    requestTag = requestTag !== undefined ? requestTag : this.activeTag;

    // 移除之前的结束提示
    var existingEndTip = this.container.querySelector('.moments-end-tip');
    if (existingEndTip) {
      existingEndTip.remove();
    }

    if (moments.length === 0) {
      this.showEmpty();
      if (this.initialTags.size > 0) {
        this.renderFilterTags();
      }
      return;
    }

    // 获取当前标签的已渲染 ID 集合
    const renderedMemoIds = this.getRenderedMemoIdsForTag(requestTag);

    // 使用 DocumentFragment 优化批量 DOM 操作
    const fragment = document.createDocumentFragment();

    // 统计置顶数量（调试用）
    var pinnedCount = 0;

    // 单次遍历：过滤、验证、收集标签、渲染
    moments.forEach(function(m) {
      // 1. 检查是否已渲染（内存 Set 检查）
      if (renderedMemoIds.has(m.name)) {
        return;
      }

      // 1.5 统计置顶
      if (m.pinned) {
        pinnedCount++;
        console.log('[Moments] 发现置顶动态:', {
          id: m.name,
          pinned: m.pinned,
          displayTime: m.displayTime
        });
      }

      // 2. 前端二次验证：确保数据符合筛选条件
      if (requestTag) {
        if (!m.tags || !Array.isArray(m.tags) || !m.tags.includes(requestTag)) {
          console.warn('[Moments] 数据验证失败，动态不包含预期标签:', {
            memoId: m.name,
            expectedTag: requestTag,
            actualTags: m.tags
          });
          return;
        }
      }

      // 3. 收集新标签（用于更新筛选器）
      if (m.tags && Array.isArray(m.tags)) {
        m.tags.forEach(function(tag) {
          if (typeof tag === 'string' && tag.trim()) {
            self.initialTags.add(tag.trim());
          }
        });
      }

      // 4. 创建并渲染动态卡片
      const article = self._createMomentArticle(m, renderedMemoIds);
      if (article) {
        fragment.appendChild(article);
      }
    });

    // 批量添加到 DOM
    this.container.appendChild(fragment);

    // 输出置顶统计
    if (pinnedCount > 0) {
      console.log('[Moments] 本批次渲染了 ' + pinnedCount + ' 个置顶动态');
    }

    // 如果没有下一页，显示结束提示
    if (!this.getNextTokenForTag(this.activeTag)) {
      this.showEndTip();
    }

    this.renderFilterTags();
    this.updateInfiniteScrollState();
  }

  /**
   * 创建单个动态卡片元素
   * @param {Object} m - memo 数据
   * @param {Set} renderedMemoIds - 已渲染 ID 集合
   * @returns {HTMLElement|null} - 文章元素或 null
   */
  _createMomentArticle(m, renderedMemoIds) {
    var self = this;

    const article = document.createElement('article');
    article.className = 'moment-item';
    article.dataset.id = m.name;

    // 记录已渲染
    if (renderedMemoIds) {
      renderedMemoIds.add(m.name);
    }

    if (m.pinned) article.classList.add('pinned');

    // 时间线节点
    const node = document.createElement('div');
    node.className = 'moment-node';
    article.appendChild(node);

    // 元信息区（日期 + 标签）- 在卡片外部
    const meta = document.createElement('div');
    meta.className = 'moment-meta';

    const time = document.createElement('time');
    time.className = 'moment-date';
    time.setAttribute('datetime', m.displayTime);
    time.textContent = self.formatDate(m.displayTime);
    meta.appendChild(time);

    if (m.tags && m.tags.length > 0) {
      // 使用 Set 去重
      const uniqueTags = Array.from(new Set(m.tags));
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'moment-tags';
      uniqueTags.forEach(function(tag) {
        const tagSpan = document.createElement('button');
        tagSpan.className = 'moment-tag';
        tagSpan.textContent = '#' + tag;
        tagSpan.dataset.tag = tag;
        tagSpan.setAttribute('aria-label', '筛选标签: ' + tag);
        tagsDiv.appendChild(tagSpan);
      });
      meta.appendChild(tagsDiv);
    }

    if (m.pinned) {
      const badge = document.createElement('span');
      badge.className = 'pinned-badge';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-thumbtack';
      badge.appendChild(icon);
      badge.appendChild(document.createTextNode(' 置顶'));
      meta.appendChild(badge);
    }

    article.appendChild(meta);

    // 卡片容器（带装饰边框）
    const card = document.createElement('div');
    card.className = 'moment-card';

    // 内容区
    const contentDiv = document.createElement('div');
    contentDiv.className = 'moment-content';
    self.renderContent(contentDiv, m.content || '');
    card.appendChild(contentDiv);

    // 附件预览（图片、音频、视频）
    const attachments = m.attachments || m.resources || [];
    if (attachments.length > 0) {
      const attachmentsContainer = self.renderAttachments(attachments);
      card.appendChild(attachmentsContainer);
    }

    article.appendChild(card);

    return article;
  }

  /**
   * 显示结束提示
   */
  showEndTip() {
    const tip = document.createElement('div');
    tip.className = 'moments-end-tip';

    // 左侧装饰线
    const leftLine = document.createElement('div');
    leftLine.className = 'moments-end-line';

    // 中心装饰图标
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-feather moments-end-icon';

    // 文本
    const text = document.createElement('span');
    text.className = 'moments-end-text';
    text.textContent = '到底了';

    // 右侧装饰线
    const rightLine = document.createElement('div');
    rightLine.className = 'moments-end-line';

    tip.appendChild(leftLine);
    tip.appendChild(icon);
    tip.appendChild(text);
    tip.appendChild(rightLine);

    this.container.appendChild(tip);
  }

  /**
   * 渲染附件（图片、音频、视频）
   * 根据附件类型分发到对应的渲染方法
   */
  renderAttachments(attachments) {
    const container = document.createDocumentFragment();

    // 分类附件
    const images = [];
    const audios = [];
    const videos = [];
    const documents = [];

    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      if (this.isImageAttachment(att)) {
        images.push(att);
      } else if (this.isAudioAttachment(att)) {
        audios.push(att);
      } else if (this.isVideoAttachment(att)) {
        videos.push(att);
      } else if (this.isDocumentAttachment(att)) {
        documents.push(att);
      }
    }

    // 渲染图片
    if (images.length > 0) {
      const imagesDiv = this.renderImages(images);
      container.appendChild(imagesDiv);
    }

    // 渲染音频
    if (audios.length > 0) {
      audios.forEach(att => {
        const audioDiv = this.renderAudio(att);
        container.appendChild(audioDiv);
      });
    }

    // 渲染视频
    if (videos.length > 0) {
      videos.forEach(att => {
        const videoDiv = this.renderVideo(att);
        container.appendChild(videoDiv);
      });
    }

    // 渲染文档（PDF等）
    if (documents.length > 0) {
      documents.forEach(att => {
        const docDiv = this.renderDocument(att);
        container.appendChild(docDiv);
      });
    }

    return container;
  }

  /**
   * 渲染图片预览（支持点击展开）
   * 布局规则：
   * - 1张：单图展示，大尺寸
   * - 2张：双列展示
   * - 3张及以上：三列展示
   * - 超过6张：显示前5张 + 第6张显示 +N 蒙层
   * @param {Array} attachments - 仅包含图片类型的附件数组
   */
  renderImages(attachments) {
    const self = this;
    const imagesDiv = document.createElement('div');
    imagesDiv.className = 'moment-images';

    // 收集图片数据（attachments 已经过滤为图片类型）
    const imageData = [];
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      // 双重校验：确保是图片类型
      if (!self.isImageAttachment(att)) {
        console.warn('[Moments] 跳过非图片附件:', att.filename || att.name);
        continue;
      }
      const url = self.buildAttachmentUrl(att);
      if (url) {
        imageData.push({
          url: url,
          alt: att.filename || 'image'
        });
      }
    }

    // 如果没有有效图片，返回空容器
    if (imageData.length === 0) {
      return imagesDiv;
    }

    // 将图片数据存储在容器上，供事件委托使用
    imagesDiv.dataset.imageData = JSON.stringify(imageData);

    const count = imageData.length;
    if (count === 1) {
      imagesDiv.classList.add('single');
    } else if (count === 2) {
      imagesDiv.classList.add('double');
    } else {
      imagesDiv.classList.add('multiple');
    }

    // 超过6张只显示前6张，最后一张显示 +N
    const displayCount = count > 6 ? 6 : count;
    const hasMore = count > 6;
    const moreCount = count - displayCount;

    for (let i = 0; i < displayCount; i++) {
      const data = imageData[i];
      const imageWrapper = document.createElement('div');
      imageWrapper.className = 'moment-image';
      imageWrapper.dataset.index = i;

      const img = document.createElement('img');
      img.src = data.url;
      img.alt = data.alt;
      img.loading = 'lazy';
      img.decoding = 'async';

      // 图片加载完成后添加 loaded 类（移除 shimmer 动画）
      img.addEventListener('load', function() {
        imageWrapper.classList.add('loaded');
      });

      // 图片加载失败处理
      img.addEventListener('error', function() {
        try {
          imageWrapper.classList.add('moment-image-error');
          img.style.display = 'none';
          const fallback = document.createElement('div');
          fallback.className = 'moment-image-fallback';
          const icon = document.createElement('i');
          icon.className = 'fa-solid fa-image';
          const text = document.createElement('span');
          text.textContent = '图片加载失败';
          fallback.appendChild(icon);
          fallback.appendChild(text);
          imageWrapper.appendChild(fallback);
        } catch (err) {
          console.error('[Moments] 图片错误处理失败:', err);
        }
      });

      imageWrapper.appendChild(img);

      // 在最后一张上显示 +N（超过6张时）
      if (i === displayCount - 1 && hasMore) {
        const moreCountDiv = document.createElement('div');
        moreCountDiv.className = 'more-count';
        moreCountDiv.textContent = '+' + moreCount;
        imageWrapper.appendChild(moreCountDiv);
      }

      imagesDiv.appendChild(imageWrapper);
    }

    // 初始化图片点击事件委托（只绑定一次）
    this._initImageClickDelegate();

    return imagesDiv;
  }

  /**
   * 检查附件是否为图片类型
   * 优先使用 MIME type，其次使用文件扩展名
   * @param {Object} att - 附件对象
   * @returns {boolean}
   */
  isImageAttachment(att) {
    // 优先检查 MIME type（Memos API 提供的字段）
    if (att.type || att.mimeType) {
      const mimeType = (att.type || att.mimeType).toLowerCase();
      return mimeType.startsWith('image/');
    }

    // 备用：检查文件扩展名
    const filename = att.filename || att.name || '';
    const ext = filename.split('.').pop().toLowerCase();

    // 常见图片扩展名
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic', 'heif'];
    return imageExtensions.includes(ext);
  }

  /**
   * 检查附件是否为音频类型
   * @param {Object} att - 附件对象
   * @returns {boolean}
   */
  isAudioAttachment(att) {
    if (att.type || att.mimeType) {
      const mimeType = (att.type || att.mimeType).toLowerCase();
      return mimeType.startsWith('audio/');
    }

    const filename = att.filename || att.name || '';
    const ext = filename.split('.').pop().toLowerCase();
    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'];
    return audioExtensions.includes(ext);
  }

  /**
   * 检查附件是否为视频类型
   * @param {Object} att - 附件对象
   * @returns {boolean}
   */
  isVideoAttachment(att) {
    if (att.type || att.mimeType) {
      const mimeType = (att.type || att.mimeType).toLowerCase();
      return mimeType.startsWith('video/');
    }

    const filename = att.filename || att.name || '';
    const ext = filename.split('.').pop().toLowerCase();
    const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
    return videoExtensions.includes(ext);
  }

  /**
   * 检查附件是否为文档类型（PDF、Word、Excel等）
   * @param {Object} att - 附件对象
   * @returns {boolean}
   */
  isDocumentAttachment(att) {
    if (att.type || att.mimeType) {
      const mimeType = (att.type || att.mimeType).toLowerCase();
      // PDF, Word, Excel, PowerPoint, 文本文件等
      const documentMimeTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/rtf',
        'text/plain',
        'text/markdown',
        'application/zip',
        'application/x-zip-compressed'
      ];
      if (documentMimeTypes.includes(mimeType)) {
        return true;
      }
    }

    const filename = att.filename || att.name || '';
    const ext = filename.split('.').pop().toLowerCase();
    const documentExtensions = [
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'rtf', 'txt', 'md', 'zip', 'rar', '7z', 'tar', 'gz'
    ];
    return documentExtensions.includes(ext);
  }

  /**
   * 获取文档类型图标
   * @param {Object} att - 附件对象
   * @returns {Object} { icon: string, label: string }
   */
  getDocumentTypeInfo(att) {
    const filename = att.filename || att.name || '';
    const ext = filename.split('.').pop().toLowerCase();
    const mimeType = (att.type || att.mimeType || '').toLowerCase();

    // PDF
    if (ext === 'pdf' || mimeType === 'application/pdf') {
      return { icon: 'fa-solid fa-file-pdf', label: 'PDF', color: '#ef4444' };
    }
    // Word
    if (['doc', 'docx'].includes(ext) || mimeType.includes('word')) {
      return { icon: 'fa-solid fa-file-word', label: 'Word', color: '#2563eb' };
    }
    // Excel
    if (['xls', 'xlsx'].includes(ext) || mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      return { icon: 'fa-solid fa-file-excel', label: 'Excel', color: '#16a34a' };
    }
    // PowerPoint
    if (['ppt', 'pptx'].includes(ext) || mimeType.includes('powerpoint') || mimeType.includes('presentation')) {
      return { icon: 'fa-solid fa-file-powerpoint', label: 'PPT', color: '#ea580c' };
    }
    // 压缩包
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mimeType.includes('zip')) {
      return { icon: 'fa-solid fa-file-zipper', label: '压缩包', color: '#8b5cf6' };
    }
    // 文本
    if (['txt', 'md', 'rtf'].includes(ext) || mimeType.includes('text/')) {
      return { icon: 'fa-solid fa-file-lines', label: '文本', color: '#64748b' };
    }
    // 默认
    return { icon: 'fa-solid fa-file', label: '文件', color: 'var(--accent)' };
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 文件字节数
   * @returns {string}
   */
  formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }

  /**
   * 渲染文档附件
   * 简洁文件卡片：图标 + 文件名 + 大小 + 下载按钮
   * @param {Object} att - 文档附件对象
   * @returns {HTMLElement}
   */
  renderDocument(att) {
    const url = this.buildAttachmentUrl(att);
    if (!url) return document.createElement('div');

    const docContainer = document.createElement('div');
    docContainer.className = 'moment-document';

    const typeInfo = this.getDocumentTypeInfo(att);
    const filename = att.filename || att.name || '未命名文件';
    const fileSize = this.formatFileSize(att.size || att.fileSize || 0);

    // 主内容区域（可点击下载）
    const mainContent = document.createElement('a');
    mainContent.className = 'moment-document-main';
    mainContent.href = url;
    mainContent.target = '_blank';
    mainContent.rel = 'noopener noreferrer';
    mainContent.setAttribute('download', filename);

    // 图标区域
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'moment-document-icon';
    if (typeInfo.color && typeInfo.color !== 'var(--accent)') {
      iconWrapper.style.setProperty('--doc-color', typeInfo.color);
      iconWrapper.classList.add('custom-color');
    }
    const icon = document.createElement('i');
    icon.className = typeInfo.icon;
    iconWrapper.appendChild(icon);

    // 信息区域
    const infoWrapper = document.createElement('div');
    infoWrapper.className = 'moment-document-info';

    const filenameEl = document.createElement('div');
    filenameEl.className = 'moment-document-filename';
    filenameEl.textContent = filename;
    filenameEl.title = filename;

    const metaEl = document.createElement('div');
    metaEl.className = 'moment-document-meta';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'moment-document-type';
    typeLabel.textContent = typeInfo.label;
    metaEl.appendChild(typeLabel);
    if (fileSize) {
      const sizeLabel = document.createElement('span');
      sizeLabel.className = 'moment-document-size';
      sizeLabel.textContent = fileSize;
      metaEl.appendChild(sizeLabel);
    }

    infoWrapper.appendChild(filenameEl);
    infoWrapper.appendChild(metaEl);

    // 下载按钮区域
    const actionWrapper = document.createElement('div');
    actionWrapper.className = 'moment-document-action';
    const downloadIcon = document.createElement('i');
    downloadIcon.className = 'fa-solid fa-arrow-down';
    actionWrapper.appendChild(downloadIcon);

    mainContent.appendChild(iconWrapper);
    mainContent.appendChild(infoWrapper);
    mainContent.appendChild(actionWrapper);

    docContainer.appendChild(mainContent);

    return docContainer;
  }

  /**
   * 渲染音频附件
   * 自定义播放器：播放按钮 + 进度条 + 时间 + 波形装饰
   * @param {Object} att - 音频附件对象
   * @returns {HTMLElement}
   */
  renderAudio(att) {
    const url = this.buildAttachmentUrl(att);
    if (!url) return document.createElement('div');

    const self = this;
    const audioContainer = document.createElement('div');
    audioContainer.className = 'moment-audio';

    // 播放器主体
    const player = document.createElement('div');
    player.className = 'moment-audio-player';

    // 播放按钮
    const playBtn = document.createElement('button');
    playBtn.className = 'moment-audio-btn';
    playBtn.type = 'button';
    playBtn.setAttribute('aria-label', '播放音频');
    const playIcon = document.createElement('i');
    playIcon.className = 'fa-solid fa-play';
    playBtn.appendChild(playIcon);

    // 可视化区域
    const visualizer = document.createElement('div');
    visualizer.className = 'moment-audio-visualizer';

    // 波形装饰条
    const waveform = document.createElement('div');
    waveform.className = 'moment-audio-waveform';
    for (let i = 0; i < 8; i++) {
      const bar = document.createElement('div');
      bar.className = 'moment-audio-waveform-bar';
      bar.style.height = (Math.random() * 16 + 4) + 'px';
      waveform.appendChild(bar);
    }

    // 进度条
    const progress = document.createElement('div');
    progress.className = 'moment-audio-progress';
    const progressFill = document.createElement('div');
    progressFill.className = 'moment-audio-progress-fill';
    progressFill.style.width = '0%';
    progress.appendChild(progressFill);

    visualizer.appendChild(waveform);
    visualizer.appendChild(progress);

    // 时间显示
    const timeDisplay = document.createElement('div');
    timeDisplay.className = 'moment-audio-time';
    timeDisplay.textContent = '0:00 / 0:00';

    // 组装播放器
    player.appendChild(playBtn);
    player.appendChild(visualizer);
    player.appendChild(timeDisplay);

    // 文件名标题
    const titleDiv = document.createElement('div');
    titleDiv.className = 'moment-audio-title';
    const titleIcon = document.createElement('i');
    titleIcon.className = 'fa-solid fa-music';
    const titleText = document.createElement('span');
    titleText.textContent = att.filename || 'Audio';
    titleDiv.appendChild(titleIcon);
    titleDiv.appendChild(titleText);

    // 隐藏的原生 audio 元素
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = url;

    audioContainer.appendChild(player);
    audioContainer.appendChild(titleDiv);
    audioContainer.appendChild(audio);

    // 格式化时间
    function formatTime(seconds) {
      if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return mins + ':' + secs.toString().padStart(2, '0');
    }

    // 更新时间显示
    function updateTimeDisplay() {
      const current = formatTime(audio.currentTime);
      const duration = formatTime(audio.duration);
      timeDisplay.textContent = current + ' / ' + duration;
    }

    // 更新进度条
    function updateProgress() {
      if (audio.duration && isFinite(audio.duration)) {
        const percent = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = percent + '%';
      }
      updateTimeDisplay();
    }

    // 切换播放状态
    function togglePlay() {
      if (audio.paused) {
        // 暂停其他正在播放的音频
        document.querySelectorAll('.moment-audio audio').forEach(function(a) {
          if (a !== audio && !a.paused) {
            a.pause();
          }
        });
        audio.play();
      } else {
        audio.pause();
      }
    }

    // 点击进度条跳转
    progress.addEventListener('click', function(e) {
      if (!audio.duration || !isFinite(audio.duration)) return;
      const rect = progress.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audio.currentTime = percent * audio.duration;
    });

    // 播放按钮点击
    playBtn.addEventListener('click', togglePlay);

    // 音频事件
    audio.addEventListener('play', function() {
      playBtn.classList.add('playing');
      audioContainer.classList.add('playing');
      playIcon.className = 'fa-solid fa-pause';
      playBtn.setAttribute('aria-label', '暂停音频');
    });

    audio.addEventListener('pause', function() {
      playBtn.classList.remove('playing');
      audioContainer.classList.remove('playing');
      playIcon.className = 'fa-solid fa-play';
      playBtn.setAttribute('aria-label', '播放音频');
    });

    audio.addEventListener('ended', function() {
      playBtn.classList.remove('playing');
      audioContainer.classList.remove('playing');
      playIcon.className = 'fa-solid fa-play';
      playBtn.setAttribute('aria-label', '播放音频');
      progressFill.style.width = '0%';
      audio.currentTime = 0;
    });

    audio.addEventListener('timeupdate', updateProgress);

    audio.addEventListener('loadedmetadata', function() {
      updateTimeDisplay();
    });

    return audioContainer;
  }

  /**
   * 检测是否为 iOS 设备
   * iOS Safari 的 Fullscreen API 有特殊限制：只能对 video 元素本身调用
   * @returns {boolean}
   */
  isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /**
   * 检测是否为移动设备（需要原生视频全屏）
   * @returns {boolean}
   */
  isMobileDevice() {
    return this.isIOSDevice() || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * 渲染视频附件
   * 自定义播放器：覆盖控件 + 霓虹进度条
   * iOS 特殊处理：使用原生视频全屏（webkitEnterFullscreen）
   * @param {Object} att - 视频附件对象
   * @returns {HTMLElement}
   */
  renderVideo(att) {
    const url = this.buildAttachmentUrl(att);
    if (!url) return document.createElement('div');

    const self = this;
    const isIOS = this.isIOSDevice();
    const isMobile = this.isMobileDevice();

    const videoContainer = document.createElement('div');
    videoContainer.className = 'moment-video';
    if (isMobile) {
      videoContainer.classList.add('is-mobile');
    }

    // 视频元素
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('playsinline', ''); // iOS 必需
    video.setAttribute('webkit-playsinline', ''); // iOS 旧版本兼容
    video.setAttribute('x5-video-player-type', 'h5'); // 微信/QQ 浏览器兼容
    video.setAttribute('x5-video-player-fullscreen', 'true'); // 微信/QQ 浏览器全屏兼容
    video.src = url;

    // 覆盖层
    const overlay = document.createElement('div');
    overlay.className = 'moment-video-overlay';

    // 中央播放按钮
    const playBtn = document.createElement('button');
    playBtn.className = 'moment-video-play-btn';
    playBtn.type = 'button';
    playBtn.setAttribute('aria-label', '播放视频');
    const playIcon = document.createElement('i');
    playIcon.className = 'fa-solid fa-play';
    playBtn.appendChild(playIcon);

    // 底部控件栏
    const controls = document.createElement('div');
    controls.className = 'moment-video-controls';

    // 进度条
    const progress = document.createElement('div');
    progress.className = 'moment-video-progress';
    const progressFill = document.createElement('div');
    progressFill.className = 'moment-video-progress-fill';
    progressFill.style.width = '0%';
    progress.appendChild(progressFill);

    // 时间显示
    const timeDisplay = document.createElement('div');
    timeDisplay.className = 'moment-video-time';
    timeDisplay.textContent = '0:00 / 0:00';

    // 全屏按钮
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'moment-video-fullscreen';
    fullscreenBtn.type = 'button';
    fullscreenBtn.setAttribute('aria-label', '全屏');
    const fullscreenIcon = document.createElement('i');
    fullscreenIcon.className = 'fa-solid fa-expand';
    fullscreenBtn.appendChild(fullscreenIcon);

    controls.appendChild(progress);
    controls.appendChild(timeDisplay);
    controls.appendChild(fullscreenBtn);

    // 文件名标签
    const titleDiv = document.createElement('div');
    titleDiv.className = 'moment-video-title';
    const titleIcon = document.createElement('i');
    titleIcon.className = 'fa-solid fa-video';
    const titleText = document.createElement('span');
    titleText.textContent = att.filename || 'Video';
    titleDiv.appendChild(titleIcon);
    titleDiv.appendChild(titleText);

    overlay.appendChild(playBtn);
    overlay.appendChild(controls);

    videoContainer.appendChild(video);
    videoContainer.appendChild(titleDiv);
    videoContainer.appendChild(overlay);

    // 格式化时间
    function formatTime(seconds) {
      if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return mins + ':' + secs.toString().padStart(2, '0');
    }

    // 更新时间显示
    function updateTimeDisplay() {
      const current = formatTime(video.currentTime);
      const duration = formatTime(video.duration);
      timeDisplay.textContent = current + ' / ' + duration;
    }

    // 更新进度条
    function updateProgress() {
      if (video.duration && isFinite(video.duration)) {
        const percent = (video.currentTime / video.duration) * 100;
        progressFill.style.width = percent + '%';
      }
      updateTimeDisplay();
    }

    // 切换播放状态
    function togglePlay() {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    }

    // overlay点击处理
    // 桌面端：点击切换播放状态
    // 移动端：播放时点击切换控件显示，暂停时点击播放
    overlay.addEventListener('click', function(e) {
      // 忽略控件区域的点击
      if (e.target.closest('.moment-video-fullscreen') || e.target.closest('.moment-video-progress')) {
        return;
      }

      if (isMobile) {
        // 移动端逻辑
        if (video.paused) {
          // 暂停状态：播放视频
          video.play();
        } else {
          // 播放状态：切换控件显示/隐藏
          // toggleControls会自动处理全屏时的定时器
          toggleControls();
        }
      } else {
        // 桌面端：
        // 非全屏时：切换播放状态
        // 全屏时播放中：切换控件显示
        if (videoContainer.classList.contains('is-fullscreen') && !video.paused) {
          toggleControls();
        } else {
          togglePlay();
        }
      }
    });

    // 点击进度条跳转
    progress.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!video.duration || !isFinite(video.duration)) return;
      const rect = progress.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      video.currentTime = percent * video.duration;
    });

    // 全屏切换（iOS 特殊处理）
    fullscreenBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault(); // 防止移动端双击问题

      if (isIOS) {
        // iOS: 使用原生视频全屏 API
        // iOS Safari 的 Fullscreen API 只能作用于 video 元素本身
        const isFullscreen = video.webkitDisplayingFullscreen;

        if (isFullscreen) {
          // 退出全屏
          if (video.webkitExitFullscreen) {
            video.webkitExitFullscreen();
          }
        } else {
          // 进入全屏
          if (video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
          } else if (video.requestFullscreen) {
            // Fallback: 标准 API（某些 iOS 版本支持）
            video.requestFullscreen();
          }
        }
      } else {
        // 非 iOS: 使用容器全屏
        const isFullscreen = document.fullscreenElement === videoContainer ||
                             document.webkitFullscreenElement === videoContainer ||
                             document.mozFullScreenElement === videoContainer;

        if (isFullscreen) {
          // 退出全屏
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
          }
        } else {
          // 进入全屏
          if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen();
          } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
          } else if (videoContainer.mozRequestFullScreen) {
            videoContainer.mozRequestFullScreen();
          } else if (videoContainer.msRequestFullscreen) {
            videoContainer.msRequestFullscreen();
          }
        }
      }
    });

    // ========== 统一的控件显示/隐藏系统 ==========
    // 核心原则：
    // - 非全屏：播放时鼠标悬浮显示，离开隐藏
    // - 全屏：播放时鼠标移动/触摸显示，无操作后自动隐藏
    // - 暂停：控件始终显示
    // 所有设备保持一致的交互逻辑

    let controlsHideTimer = null;
    const CONTROLS_HIDE_DELAY = 3000; // 全屏时3秒无操作后隐藏控件

    // 显示控件
    function showControls() {
      videoContainer.classList.remove('controls-hidden');
    }

    // 隐藏控件（仅播放时生效）
    function hideControls() {
      if (!video.paused) {
        videoContainer.classList.add('controls-hidden');
      }
    }

    // 清除自动隐藏定时器
    function clearHideTimer() {
      if (controlsHideTimer) {
        clearTimeout(controlsHideTimer);
        controlsHideTimer = null;
      }
    }

    // 启动全屏自动隐藏定时器
    function startHideTimer() {
      clearHideTimer();
      showControls();
      controlsHideTimer = setTimeout(function() {
        // 只有播放中且全屏时才自动隐藏
        if (!video.paused && videoContainer.classList.contains('is-fullscreen')) {
          hideControls();
        }
      }, CONTROLS_HIDE_DELAY);
    }

    // 切换控件显示状态（移动端使用）
    function toggleControls() {
      if (videoContainer.classList.contains('controls-hidden')) {
        showControls();
        // 全屏时显示控件后启动自动隐藏
        if (videoContainer.classList.contains('is-fullscreen') && !video.paused) {
          startHideTimer();
        }
      } else if (!video.paused) {
        hideControls();
      }
    }

    // ========== 桌面端：鼠标悬浮控制 ==========
    // 鼠标进入显示控件
    videoContainer.addEventListener('mouseenter', function() {
      if (videoContainer.classList.contains('is-fullscreen')) {
        // 全屏时：鼠标进入启动自动隐藏
        startHideTimer();
      } else {
        // 非全屏：直接显示
        showControls();
      }
    });

    // 鼠标离开
    videoContainer.addEventListener('mouseleave', function() {
      if (videoContainer.classList.contains('is-fullscreen')) {
        // 全屏时：鼠标离开清除定时器并隐藏
        clearHideTimer();
        hideControls();
      } else {
        // 非全屏：鼠标离开隐藏控件
        hideControls();
      }
    });

    // 鼠标移动（全屏时重新计时）
    videoContainer.addEventListener('mousemove', function() {
      if (videoContainer.classList.contains('is-fullscreen') && !video.paused) {
        startHideTimer();
      } else {
        showControls();
      }
    });

    // ========== 移动端：触摸事件处理 ==========
    let touchMoved = false;

    videoContainer.addEventListener('touchstart', function() {
      touchMoved = false;
    }, { passive: true });

    videoContainer.addEventListener('touchmove', function() {
      touchMoved = true;
    }, { passive: true });

    videoContainer.addEventListener('touchend', function(e) {
      // 忽略滑动操作
      if (touchMoved) return;

      const target = e.target;

      // 控件区域的触摸：显示控件并重新计时
      if (target.closest('.moment-video-fullscreen') ||
          target.closest('.moment-video-progress') ||
          target.closest('.moment-video-play-btn')) {
        showControls();
        if (videoContainer.classList.contains('is-fullscreen') && !video.paused) {
          startHideTimer();
        }
      }
      // overlay区域的点击由click事件处理
    }, { passive: true });

    // ========== 视频状态事件 ==========
    // 播放开始
    video.addEventListener('play', function() {
      videoContainer.classList.add('playing');
      playIcon.className = 'fa-solid fa-pause';
      playBtn.setAttribute('aria-label', '暂停视频');
      // 全屏状态：启动自动隐藏定时器
      // 非全屏状态：鼠标不在容器内时会自动隐藏（由mouseleave处理）
      if (videoContainer.classList.contains('is-fullscreen')) {
        startHideTimer();
      } else {
        // 非全屏时立即隐藏（用户看不到播放按钮，需要悬浮才能看到）
        hideControls();
      }
    });

    // 暂停
    video.addEventListener('pause', function() {
      videoContainer.classList.remove('playing');
      playIcon.className = 'fa-solid fa-play';
      playBtn.setAttribute('aria-label', '播放视频');
      // 暂停时清除定时器并显示控件
      clearHideTimer();
      showControls();
    });

    // 播放结束
    video.addEventListener('ended', function() {
      videoContainer.classList.remove('playing');
      playIcon.className = 'fa-solid fa-play';
      playBtn.setAttribute('aria-label', '播放视频');
      progressFill.style.width = '0%';
      // 播放结束清除定时器并显示控件
      clearHideTimer();
      showControls();
    });

    video.addEventListener('timeupdate', updateProgress);

    video.addEventListener('loadedmetadata', function() {
      updateTimeDisplay();
    });

    // ========== 全屏状态变化处理 ==========
    function handleFullscreenChange() {
      let isFullscreen = false;

      if (isIOS) {
        isFullscreen = video.webkitDisplayingFullscreen === true;
      } else {
        isFullscreen = document.fullscreenElement === videoContainer ||
                       document.webkitFullscreenElement === videoContainer ||
                       document.mozFullScreenElement === videoContainer ||
                       document.msFullscreenElement === videoContainer;
      }

      if (isFullscreen) {
        fullscreenIcon.className = 'fa-solid fa-compress';
        fullscreenBtn.setAttribute('aria-label', '退出全屏');
        videoContainer.classList.add('is-fullscreen');
        // 进入全屏时：播放中启动自动隐藏，暂停中显示控件
        if (!video.paused) {
          startHideTimer();
        } else {
          showControls();
        }
      } else {
        fullscreenIcon.className = 'fa-solid fa-expand';
        fullscreenBtn.setAttribute('aria-label', '全屏');
        videoContainer.classList.remove('is-fullscreen');
        // 退出全屏时清除定时器
        clearHideTimer();
        // 退出全屏时显示控件
        showControls();
      }
    }

    // 监听全屏变化事件（跨浏览器）
    videoContainer.addEventListener('fullscreenchange', handleFullscreenChange);
    videoContainer.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    videoContainer.addEventListener('mozfullscreenchange', handleFullscreenChange);
    videoContainer.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // iOS Safari 特有的全屏事件
    if (isIOS) {
      video.addEventListener('webkitbeginfullscreen', function() {
        handleFullscreenChange();
      });
      video.addEventListener('webkitendfullscreen', function() {
        handleFullscreenChange();
      });
      video.addEventListener('webkitpresentationmodechanged', function() {
        handleFullscreenChange();
      });
    }

    return videoContainer;
  }

  /**
   * 构建附件 URL
   */
  buildAttachmentUrl(att) {
    if (att.externalLink) {
      return att.externalLink;
    }

    if (att.name && att.name.startsWith('attachments/')) {
      const baseUrl = this.config.memosUrl.replace(/\/$/, '');
      return baseUrl + '/file/' + att.name + '/' + encodeURIComponent(att.filename || 'file');
    }

    if (att.uid) {
      const baseUrl = this.config.memosUrl.replace(/\/$/, '');
      return baseUrl + '/file/attachments/' + att.uid + '/' + encodeURIComponent(att.filename || 'file');
    }

    if (att.url) {
      if (att.url.startsWith('/')) {
        const baseUrl = this.config.memosUrl.replace(/\/$/, '');
        return baseUrl + att.url;
      }
      return att.url;
    }

    console.warn('Cannot build attachment URL:', att);
    return '';
  }

  /**
   * 处理图片加载失败
   */
  handleImageError(img, att) {
    const wrapper = img.parentElement;
    if (!wrapper || wrapper.classList.contains('moment-image-fallback')) return;

    wrapper.classList.add('moment-image-fallback');
    wrapper.textContent = '';

    const placeholder = document.createElement('div');
    placeholder.className = 'image-placeholder';

    const icon = document.createElement('i');
    icon.className = 'fa-regular fa-image';

    const text = document.createElement('span');
    text.textContent = '图片加载失败';

    placeholder.appendChild(icon);
    placeholder.appendChild(text);

    if (att.memo) {
      const baseUrl = this.config.memosUrl.replace(/\/$/, '');
      const memoUrl = baseUrl + '/m/' + att.memo.replace('memos/', '');

      const link = document.createElement('a');
      link.className = 'view-on-memos';
      link.href = memoUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '在 Memos 中查看';
      placeholder.appendChild(link);
    }

    wrapper.appendChild(placeholder);
  }

  /**
   * 渲染标签筛选器
   * 使用事件委托模式，避免重复绑定事件监听器
   */
  renderFilterTags() {
    if (!this.filterContainer) return;

    // 如果没有标签，清空骨架屏后返回
    if (this.initialTags.size === 0) {
      console.log('[Moments] 没有收集到任何标签');
      // 清除骨架屏元素
      this.filterContainer.textContent = '';
      return;
    }

    // 只绑定一次事件委托
    if (!this.filterContainerDelegateBound) {
      this._initFilterContainerDelegate();
      this.filterContainerDelegateBound = true;
    }

    // 检查是否需要重新渲染
    var sortedTags = Array.from(this.initialTags).sort();
    var currentTagsJson = JSON.stringify(sortedTags);
    var needRerender = this.lastRenderedTagsJson !== currentTagsJson;

    if (!needRerender) {
      // 只更新活跃状态
      this._updateFilterTagsActiveState();
      return;
    }

    console.log('[Moments] 渲染标签筛选器，当前标签列表:', sortedTags);

    // 记录当前状态
    this.lastRenderedTagsJson = currentTagsJson;

    // 清空容器
    this.filterContainer.textContent = '';

    // "全部" 标签
    var allTag = document.createElement('button');
    allTag.className = 'filter-tag' + (this.activeTag === null ? ' active' : '');
    allTag.textContent = '全部';
    allTag.setAttribute('role', 'tab');
    allTag.setAttribute('aria-selected', this.activeTag === null);
    allTag.dataset.tag = 'all';
    this.filterContainer.appendChild(allTag);

    // 各个标签
    var self = this;
    sortedTags.forEach(function(tag) {
      var tagBtn = document.createElement('button');
      tagBtn.className = 'filter-tag' + (self.activeTag === tag ? ' active' : '');
      tagBtn.textContent = '#' + tag;
      tagBtn.setAttribute('role', 'tab');
      tagBtn.setAttribute('aria-selected', self.activeTag === tag);
      tagBtn.dataset.tag = tag;
      self.filterContainer.appendChild(tagBtn);
    });
  }

  /**
   * 初始化标签筛选器的事件委托
   * 使用事件委托，只在容器上绑定一个监听器
   */
  _initFilterContainerDelegate() {
    var self = this;

    // 筛选器标签点击
    this.filterContainer.addEventListener('click', function(e) {
      try {
        var btn = e.target.closest('.filter-tag');
        if (!btn) return;

        var tag = btn.dataset.tag;
        var newActiveTag = (tag === 'all') ? null : tag;

        if (self.activeTag !== newActiveTag) {
          console.log('[Moments] 标签切换:', self.activeTag, '->', newActiveTag);
          self.activeTag = newActiveTag;
          self.fetch();
        }
      } catch (err) {
        console.error('[Moments] 筛选器点击处理错误:', err);
      }
    });

    // 绑定容器事件委托，只绑定一次
    this.filterContainerDelegateBound = true;
  }

  /**
   * 初始化图片点击事件委托
   * 使用事件委托统一处理所有图片点击，避免内存泄漏
   */
  _initImageClickDelegate() {
    if (this.imageClickDelegateBound) return;

    const self = this;
    this.container.addEventListener('click', function(e) {
      try {
        // 1. 检查是否点击了卡片标签
        const tagBtn = e.target.closest('.moment-tag');
        if (tagBtn) {
          const tag = tagBtn.dataset.tag;
          if (tag && self.activeTag !== tag) {
            console.log('[Moments] 卡片标签点击，切换到:', tag);
            self.activeTag = tag;
            self.fetch();
          }
          return; // 标签点击已处理，不再继续
        }

        // 2. 检查是否点击了图片
        const imageWrapper = e.target.closest('.moment-image');
        if (!imageWrapper) return;

        // 跳过加载失败的图片
        if (imageWrapper.classList.contains('moment-image-error')) return;

        // 获取图片容器
        const imagesDiv = imageWrapper.closest('.moment-images');
        if (!imagesDiv) return;

        // 从容器获取图片数据
        const imageDataStr = imagesDiv.dataset.imageData;
        if (!imageDataStr) {
          console.warn('[Moments] 未找到图片数据');
          return;
        }

        let imageData;
        try {
          imageData = JSON.parse(imageDataStr);
        } catch (parseErr) {
          console.error('[Moments] 图片数据解析失败:', parseErr);
          return;
        }

        if (!Array.isArray(imageData) || imageData.length === 0) {
          console.warn('[Moments] 图片数据无效');
          return;
        }

        // 获取点击的图片索引
        const index = parseInt(imageWrapper.dataset.index, 10);
        if (isNaN(index) || index < 0 || index >= imageData.length) {
          console.warn('[Moments] 图片索引无效:', index);
          return;
        }

        // 打开灯箱
        self.openLightbox(imageData, index);

      } catch (err) {
        console.error('[Moments] 容器点击处理错误:', err);
      }
    });

    this.imageClickDelegateBound = true;
  }

  /**
   * 更新标签筛选器的活跃状态（不重新渲染）
   */
  _updateFilterTagsActiveState() {
    if (!this.filterContainer) return;

    var buttons = this.filterContainer.querySelectorAll('.filter-tag');
    var self = this;
    buttons.forEach(function(btn) {
      var tag = btn.dataset.tag;
      var isActive = (tag === 'all' && self.activeTag === null) ||
                     (tag === self.activeTag);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive);
    });
  }

  /**
   * 安全渲染 Markdown 内容
   * 支持：标题、引用、代码块、列表（含 TODO）、表格、粗体、斜体、链接等
   */
  renderContent(container, content) {
    if (!content) return;

    const lines = content.split('\n');
    let i = 0;
    let currentList = null;
    let currentListType = null;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // 空行
      if (!trimmed) {
        if (currentList) {
          container.appendChild(currentList);
          currentList = null;
          currentListType = null;
        }
        i++;
        continue;
      }

      // 代码块
      if (trimmed.startsWith('```')) {
        if (currentList) {
          container.appendChild(currentList);
          currentList = null;
          currentListType = null;
        }

        const lang = trimmed.slice(3).trim() || 'code';
        const codeLines = [];
        i++;

        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }

        // 创建代码块容器
        const codeWrapper = document.createElement('div');
        codeWrapper.className = 'moment-code-wrapper';

        // 代码头部：语言标签 + 复制按钮
        const codeHeader = document.createElement('div');
        codeHeader.className = 'moment-code-header';

        const langTag = document.createElement('span');
        langTag.className = 'moment-code-lang';
        langTag.textContent = lang;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'moment-code-copy';
        copyBtn.type = 'button';
        copyBtn.setAttribute('aria-label', '复制代码');

        const copyIcon = document.createElement('i');
        copyIcon.className = 'fa-regular fa-copy';
        const copyText = document.createElement('span');
        copyText.textContent = '复制';
        copyBtn.appendChild(copyIcon);
        copyBtn.appendChild(copyText);

        // 复制功能
        const codeText = codeLines.join('\n');
        copyBtn.addEventListener('click', function(e) {
          e.preventDefault();
          navigator.clipboard.writeText(codeText).then(function() {
            copyBtn.textContent = '';
            const checkIcon = document.createElement('i');
            checkIcon.className = 'fa-solid fa-check';
            const copiedText = document.createElement('span');
            copiedText.textContent = '已复制';
            copyBtn.appendChild(checkIcon);
            copyBtn.appendChild(copiedText);
            copyBtn.classList.add('copied');
            setTimeout(function() {
              copyBtn.textContent = '';
              const newIcon = document.createElement('i');
              newIcon.className = 'fa-regular fa-copy';
              const newText = document.createElement('span');
              newText.textContent = '复制';
              copyBtn.appendChild(newIcon);
              copyBtn.appendChild(newText);
              copyBtn.classList.remove('copied');
            }, 2000);
          }).catch(function() {
            copyBtn.textContent = '';
            const xIcon = document.createElement('i');
            xIcon.className = 'fa-solid fa-xmark';
            const failText = document.createElement('span');
            failText.textContent = '失败';
            copyBtn.appendChild(xIcon);
            copyBtn.appendChild(failText);
            setTimeout(function() {
              copyBtn.textContent = '';
              const newIcon = document.createElement('i');
              newIcon.className = 'fa-regular fa-copy';
              const newText = document.createElement('span');
              newText.textContent = '复制';
              copyBtn.appendChild(newIcon);
              copyBtn.appendChild(newText);
            }, 2000);
          });
        });

        codeHeader.appendChild(langTag);
        codeHeader.appendChild(copyBtn);

        // 代码内容 - 带语法高亮
        const pre = document.createElement('pre');
        pre.className = 'moment-code-block';

        const code = document.createElement('code');
        // 使用安全的 DOM 方法应用语法高亮
        this.applySyntaxHighlighting(code, codeText, lang);
        pre.appendChild(code);

        codeWrapper.appendChild(codeHeader);
        codeWrapper.appendChild(pre);
        container.appendChild(codeWrapper);

        i++;
        continue;
      }

      // 表格解析
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (currentList) {
          container.appendChild(currentList);
          currentList = null;
          currentListType = null;
        }

        const table = this.parseTable(lines, i);
        if (table.element) {
          container.appendChild(table.element);
          i = table.nextIndex;
          continue;
        }
      }

      // TODO 列表项 (- [ ] 或 - [x])
      const todoMatch = trimmed.match(/^- \[([ xX])\]\s+(.*)$/);
      if (todoMatch) {
        if (currentList && currentListType !== 'ul') {
          container.appendChild(currentList);
          currentList = null;
        }
        if (!currentList) {
          currentList = document.createElement('ul');
          currentList.className = 'moment-todo-list';
          currentListType = 'ul';
        }
        const li = document.createElement('li');
        li.className = 'todo-item' + (todoMatch[1].toLowerCase() === 'x' ? ' completed' : '');

        const checkbox = document.createElement('span');
        checkbox.className = 'todo-checkbox';
        checkbox.setAttribute('aria-hidden', 'true');

        const textSpan = document.createElement('span');
        textSpan.className = 'todo-text';
        this.renderInlineContent(textSpan, todoMatch[2]);

        li.appendChild(checkbox);
        li.appendChild(textSpan);
        currentList.appendChild(li);
        i++;
        continue;
      }

      // 无序列表项
      if (trimmed.startsWith('- ')) {
        if (currentList && currentListType !== 'ul') {
          container.appendChild(currentList);
          currentList = null;
        }
        if (!currentList) {
          currentList = document.createElement('ul');
          currentListType = 'ul';
        }
        const li = document.createElement('li');
        this.renderInlineContent(li, trimmed.slice(2));
        currentList.appendChild(li);
        i++;
        continue;
      }

      // 有序列表项
      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (orderedMatch) {
        if (currentList && currentListType !== 'ol') {
          container.appendChild(currentList);
          currentList = null;
        }
        if (!currentList) {
          currentList = document.createElement('ol');
          currentListType = 'ol';
        }
        const li = document.createElement('li');
        this.renderInlineContent(li, orderedMatch[2]);
        currentList.appendChild(li);
        i++;
        continue;
      }

      // 非列表项
      if (currentList) {
        container.appendChild(currentList);
        currentList = null;
        currentListType = null;
      }

      const element = this.parseLine(trimmed);
      if (element) container.appendChild(element);
      i++;
    }

    if (currentList) {
      container.appendChild(currentList);
    }
  }

  /**
   * 解析表格
   */
  parseTable(lines, startIndex) {
    let i = startIndex;
    const rows = [];

    // 收集所有表格行
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line.startsWith('|') || !line.endsWith('|')) break;
      rows.push(line);
      i++;
    }

    if (rows.length < 2) {
      return { element: null, nextIndex: startIndex };
    }

    // 创建全宽容器（与代码块样式一致）
    const wrapper = document.createElement('div');
    wrapper.className = 'moment-table-wrapper';

    const table = document.createElement('table');
    table.className = 'moment-table';

    // 解析表头
    const headerCells = this.parseTableRow(rows[0]);
    if (headerCells.length > 0) {
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      headerCells.forEach(function(cell) {
        const th = document.createElement('th');
        th.textContent = cell.trim();
        headerRow.appendChild(th);
      });

      thead.appendChild(headerRow);
      table.appendChild(thead);
    }

    // 解析表体（跳过分隔行）
    const tbody = document.createElement('tbody');
    for (let j = 2; j < rows.length; j++) {
      const cells = this.parseTableRow(rows[j]);
      const tr = document.createElement('tr');

      cells.forEach(function(cell) {
        const td = document.createElement('td');
        td.textContent = cell.trim();
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);

    return { element: wrapper, nextIndex: i };
  }

  /**
   * 解析表格行
   */
  parseTableRow(line) {
    // 移除首尾的 |
    const content = line.slice(1, -1);
    // 分割单元格
    return content.split('|');
  }

  parseLine(line) {
    // 标题（从长到短匹配，避免 #### 被误判为 #）
    if (line.startsWith('#### ')) {
      const h4 = document.createElement('h4');
      h4.textContent = line.slice(5);
      return h4;
    }
    if (line.startsWith('### ')) {
      const h3 = document.createElement('h3');
      h3.textContent = line.slice(4);
      return h3;
    }
    if (line.startsWith('## ')) {
      const h2 = document.createElement('h2');
      h2.textContent = line.slice(3);
      return h2;
    }
    if (line.startsWith('# ')) {
      const h1 = document.createElement('h1');
      h1.textContent = line.slice(2);
      return h1;
    }

    // 引用
    if (line.startsWith('> ')) {
      const blockquote = document.createElement('blockquote');
      this.renderInlineContent(blockquote, line.slice(2));
      return blockquote;
    }

    // 分割线
    if (line === '---' || line === '***' || line === '___') {
      return document.createElement('hr');
    }

    // 普通文本
    const p = document.createElement('p');
    this.renderInlineContent(p, line);
    return p;
  }

  renderInlineContent(container, text) {
    // 过滤 #标签
    text = text.replace(/\s*#[\u4e00-\u9fa5\w\-]+\s*/g, ' ').trim();

    if (!text) return;

    const patterns = [
      { regex: /!\[([^\]]*)\]\(([^)]+)\)/g, tag: 'img' },
      { regex: /\*\*([^*]+?)\*\*/g, tag: 'strong' },
      { regex: /(?<!\*)\*([^*]+?)\*(?!\*)/g, tag: 'em' },
      { regex: /~~([^~]+)~~/g, tag: 'del' },
      { regex: /`([^`]+)`/g, tag: 'code' },
      { regex: /\[([^\]]+)\]\(([^)]+)\)/g, tag: 'a' }
    ];

    let lastEnd = 0;
    const matches = [];

    patterns.forEach(function(item) {
      item.regex.lastIndex = 0;
      let match;
      while ((match = item.regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          tag: item.tag,
          content: match[1],
          href: match[2] || null
        });
      }
    });

    matches.sort(function(a, b) {
      return a.start - b.start;
    });

    const validMatches = [];
    let lastMatchEnd = -1;
    matches.forEach(function(m) {
      if (m.start >= lastMatchEnd) {
        validMatches.push(m);
        lastMatchEnd = m.end;
      }
    });

    const self = this;
    validMatches.forEach(function(m) {
      if (m.start > lastEnd) {
        container.appendChild(document.createTextNode(text.slice(lastEnd, m.start)));
      }

      if (m.tag === 'img') {
        // Markdown 图片语法 ![alt](url)
        const img = document.createElement('img');
        img.src = m.href;
        img.alt = m.content || '';
        img.loading = 'lazy';
        img.className = 'moment-inline-image';
        container.appendChild(img);
      } else if (m.tag === 'a') {
        const a = document.createElement('a');
        a.href = m.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'moment-external-link';
        a.textContent = m.content;

        // 添加外部链接图标 (arrow-up-right-from-square)
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-arrow-up-right-from-square moment-external-link-icon';
        icon.setAttribute('aria-hidden', 'true');
        a.appendChild(icon);

        container.appendChild(a);
      } else {
        const el = document.createElement(m.tag);
        el.textContent = m.content;
        container.appendChild(el);
      }

      lastEnd = m.end;
    });

    if (lastEnd < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastEnd)));
    }
  }

  /**
   * 代码语法高亮（轻量级实现，无外部依赖）
   * 安全：先转义所有 HTML 实体，再应用语法标记
   */
  highlightCode(code, lang) {
    // 首先转义所有 HTML 实体，防止 XSS
    var escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // 根据语言选择高亮规则
    var rules = this.getHighlightRules(lang);

    // 应用语法高亮
    var highlighted = escaped;

    // 按顺序应用规则，避免嵌套问题
    rules.forEach(function(rule) {
      highlighted = highlighted.replace(rule.pattern, rule.replacement);
    });

    return highlighted;
  }

  /**
   * 安全地应用语法高亮到 DOM 元素
   * 使用 DOM API 而非 innerHTML
   */
  applySyntaxHighlighting(container, code, lang) {
    var highlighted = this.highlightCode(code, lang);
    // 使用 template 元素安全解析 HTML
    var template = document.createElement('template');
    template.innerHTML = highlighted;
    var fragment = template.content.cloneNode(true);
    container.appendChild(fragment);
  }

  /**
   * 获取语言的语法高亮规则
   */
  getHighlightRules(lang) {
    var self = this;
    var commonRules = [
      // 字符串（双引号）
      {
        pattern: /(&quot;[^&]*?&quot;)/g,
        replacement: '<span class="token string">$1</span>'
      },
      // 字符串（单引号）
      {
        pattern: /(&#039;[^&]*?&#039;)/g,
        replacement: '<span class="token string">$1</span>'
      },
      // 注释（单行）
      {
        pattern: /(\/\/[^\n]*)/g,
        replacement: '<span class="token comment">$1</span>'
      },
      // 注释（# 开头，如 Python、Shell）
      {
        pattern: /(#[^\n]*)/g,
        replacement: '<span class="token comment">$1</span>'
      },
      // 数字
      {
        pattern: /\b(\d+\.?\d*)\b/g,
        replacement: '<span class="token number">$1</span>'
      },
      // 关键字
      {
        pattern: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|default|async|await|try|catch|throw|new|this|typeof|instanceof|in|of|true|false|null|undefined|void|delete)\b/g,
        replacement: '<span class="token keyword">$1</span>'
      },
      // 函数调用
      {
        pattern: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g,
        replacement: '<span class="token function">$1</span>'
      }
    ];

    var languageSpecificRules = {
      // JavaScript/TypeScript
      javascript: [
        {
          pattern: /(\/\/[^\n]*)/g,
          replacement: '<span class="token comment">$1</span>'
        },
        {
          pattern: /(\/\*[\s\S]*?\*\/)/g,
          replacement: '<span class="token comment">$1</span>'
        }
      ],
      js: 'javascript',
      typescript: 'javascript',
      ts: 'javascript',
      // Python
      python: [
        {
          pattern: /(#[^\n]*)/g,
          replacement: '<span class="token comment">$1</span>'
        },
        {
          pattern: /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|lambda|yield|pass|break|continue|and|or|not|in|is|True|False|None|self)\b/g,
          replacement: '<span class="token keyword">$1</span>'
        },
        {
          pattern: /@([a-zA-Z_][a-zA-Z0-9_]*)/g,
          replacement: '<span class="token decorator">@$1</span>'
        }
      ],
      py: 'python',
      // Shell/Bash
      shell: [
        {
          pattern: /(#[^\n]*)/g,
          replacement: '<span class="token comment">$1</span>'
        },
        {
          pattern: /\b(if|then|else|fi|for|do|done|while|case|esac|function|echo|cd|ls|grep|cat|mkdir|rm|cp|mv|chmod|sudo|apt|yum|brew|pip|npm|npx|node|python|git)\b/g,
          replacement: '<span class="token keyword">$1</span>'
        },
        {
          pattern: /(\$\{[^}]+\}|\$[a-zA-Z_][a-zA-Z0-9_]*)/g,
          replacement: '<span class="token variable">$1</span>'
        }
      ],
      bash: 'shell',
      sh: 'shell',
      zsh: 'shell',
      // CSS
      css: [
        {
          pattern: /(\/\*[\s\S]*?\*\/)/g,
          replacement: '<span class="token comment">$1</span>'
        },
        {
          pattern: /([.#][a-zA-Z_-][a-zA-Z0-9_-]*)/g,
          replacement: '<span class="token selector">$1</span>'
        },
        {
          pattern: /\b([a-z-]+)(?=\s*:)/g,
          replacement: '<span class="token property">$1</span>'
        }
      ],
      // HTML
      html: [
        {
          pattern: /(&lt;!--[\s\S]*?--&gt;)/g,
          replacement: '<span class="token comment">$1</span>'
        },
        {
          pattern: /(&lt;\/?[a-zA-Z][a-zA-Z0-9]*)/g,
          replacement: '<span class="token tag">$1</span>'
        },
        {
          pattern: /(&gt;)/g,
          replacement: '<span class="token tag">$1</span>'
        },
        {
          pattern: /([a-zA-Z-]+)(?==)/g,
          replacement: '<span class="token attr-name">$1</span>'
        }
      ],
      // JSON
      json: [
        {
          pattern: /(&quot;[^&]*?&quot;)(?=\s*:)/g,
          replacement: '<span class="token property">$1</span>'
        }
      ],
      // SQL
      sql: [
        {
          pattern: /(--[^\n]*)/g,
          replacement: '<span class="token comment">$1</span>'
        },
        {
          pattern: /\b(SELECT|FROM|WHERE|JOIN|ON|LEFT|RIGHT|INNER|OUTER|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|PRIMARY|KEY|FOREIGN|REFERENCES|NOT|NULL|DEFAULT|AUTO_INCREMENT|AND|OR|IN|LIKE|BETWEEN|IS|ORDER|BY|ASC|DESC|LIMIT|OFFSET|GROUP|HAVING|UNION|DISTINCT|COUNT|SUM|AVG|MAX|MIN|CASE|WHEN|THEN|ELSE|END)\b/gi,
          replacement: '<span class="token keyword">$1</span>'
        }
      ],
      // Java
      java: [
        {
          pattern: /(\/\/[^\n]*)/g,
          replacement: '<span class="token comment">$1</span>'
        },
        {
          pattern: /(\/\*[\s\S]*?\*\/)/g,
          replacement: '<span class="token comment">$1</span>'
        },
        {
          pattern: /\b(public|private|protected|static|final|abstract|class|interface|extends|implements|new|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|import|package|void|int|long|short|byte|float|double|boolean|char|true|false|null|this|super)\b/g,
          replacement: '<span class="token keyword">$1</span>'
        }
      ],
      // Go
      go: [
        {
          pattern: /(\/\/[^\n]*)/g,
          replacement: '<span class="token comment">$1</span>'
        },
        {
          pattern: /\b(package|import|func|return|if|else|for|range|switch|case|default|break|continue|go|defer|chan|select|struct|interface|type|var|const|map|slice|make|new|len|cap|append|copy|delete|panic|recover|error|string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|complex64|complex128|bool|rune|byte|true|false|nil)\b/g,
          replacement: '<span class="token keyword">$1</span>'
        }
      ],
      golang: 'go'
    };

    // 获取语言特定规则
    var langRules = languageSpecificRules[lang.toLowerCase()];

    if (typeof langRules === 'string') {
      // 别名引用
      langRules = languageSpecificRules[langRules];
    }

    if (!langRules) {
      langRules = [];
    }

    // 合并通用规则和语言特定规则
    return commonRules.concat(langRules);
  }

  /**
   * 格式化日期时间
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';

    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * 显示空状态
   */
  showEmpty() {
    const empty = document.createElement('div');
    empty.className = 'moments-empty';

    const icon = document.createElement('i');
    icon.className = 'fa-regular fa-comment-dots';

    const p = document.createElement('p');
    p.textContent = '暂无动态';

    empty.appendChild(icon);
    empty.appendChild(p);
    this.container.appendChild(empty);
  }

  /**
   * 显示错误状态
   */
  showError() {
    this.container.textContent = '';

    const error = document.createElement('div');
    error.className = 'moments-error';

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-exclamation-circle';

    const p = document.createElement('p');
    p.textContent = '加载失败，';

    const self = this;
    const btn = document.createElement('button');
    btn.className = 'retry-btn';
    btn.textContent = '重试';
    btn.addEventListener('click', function() {
      self.init();
    });

    p.appendChild(btn);
    error.appendChild(icon);
    error.appendChild(p);
    this.container.appendChild(error);
  }
}

window.MomentsFeed = MomentsFeed;