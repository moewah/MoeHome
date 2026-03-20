/**
 * MoeHome 留言板模块
 * 极简配置版本 - 支持 Waline / Artalk 双评论系统
 * 设计概念：Signal Station (信号站)
 */

(function() {
    'use strict';

    // ==================== 默认配置 ====================
    var DEFAULTS = {
        placeholder: '欢迎留下你的信号...',
        // 数量限制默认值（可被 config.limits 覆盖）
        limits: {
            comments: {
                newest: 50,
                hot: 50
            },
            barrage: {
                pinned: 5,
                hot: 10,
                latest: 5
            }
        },
        // 弹幕动画配置
        barrage: {
            tracks: 5,
            trackGap: 16,
            signalHeight: 24,
            baseSpeed: 45,
            speedVariance: 10,
            loadingDuration: 2000,  // 最小加载动画时间（毫秒）
            minGap: 80,
            entryInterval: 2.0
        }
    };

    // ==================== 状态管理 ====================
    var state = {
        config: null,
        provider: null,
        instance: null,
        barrage: {
            container: null,
            canvas: null,
            tracks: [],
            signals: [],
            animationId: null,
            isRunning: false,
            startTime: 0,
            prefersReducedMotion: false,
            // 弹幕数据缓存
            data: [],
            isLoading: false,
            // 轨道暂停状态
            pausedTracks: {},
            // 循环控制
            lastExitTime: 0,        // 最后一条弹幕退出时间（秒）
            loopCount: 0            // 循环计数器
        }
    };

    // ==================== 初始化入口 ====================
    /**
     * 【性能优化】分层加载策略：
     * 1. P0: 弹幕数据优先加载（首屏可见）
     * 2. P1: 评论列表延迟加载（进入视口时）
     * 3. P2: 热门数据预取（后台静默加载）
     */
    function init() {
        var cfg = window.HOMEPAGE_CONFIG;
        if (!cfg || !cfg.guestbook || !cfg.guestbook.enabled) {
            return;
        }

        state.config = cfg.guestbook;
        state.provider = state.config.provider;
        state.barrage.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // 【P0】弹幕优先加载
        initBarrage();

        // 【P1】评论列表延迟加载（使用 Intersection Observer）
        initCommentSystemLazy();

        // 【P2】热门数据预取（后台静默）
        prefetchHotData();

        initThemeSync();

        console.log('[Guestbook] 初始化完成，评论系统:', state.provider);
    }

    // ==================== 弹幕系统 ====================
    function initBarrage() {
        var container = document.getElementById('signal-stream');
        var canvas = document.getElementById('signal-canvas');

        if (!container || !canvas) return;

        state.barrage.container = container;
        state.barrage.canvas = canvas;

        // 记录加载开始时间
        state.barrage.loadStartTime = performance.now();

        // 显示加载动画
        showBarrageLoading();

        // 异步加载弹幕数据
        loadBarrageData().then(function(data) {
            if (data.length === 0) {
                hideBarrageLoading();
                container.style.display = 'none';
                return;
            }

            state.barrage.data = data;

            // 计算剩余需要的加载时间，确保动画有足够展示时间
            var elapsed = performance.now() - state.barrage.loadStartTime;
            var minDuration = DEFAULTS.barrage.loadingDuration;
            var remainingTime = Math.max(0, minDuration - elapsed);

            // 延迟隐藏加载动画，确保最小加载时间
            setTimeout(function() {
                // 先切换到"连接成功"状态
                updateLoadingStatus('ready', function() {
                    // 等待 300ms 后淡出
                    setTimeout(function() {
                        hideBarrageLoading(function() {
                            // 淡出完成后立即开始弹幕动画
                            if (isMobile()) {
                                renderMobileBarrages(data);
                            } else {
                                initBarrageTracks();
                                renderBarrages(data);
                            }

                            if (!state.barrage.prefersReducedMotion) {
                                startBarrageAnimation();
                            }
                        });
                    }, 300);
                });
            }, remainingTime);

        }).catch(function(error) {
            console.error('[Barrage] 初始化失败:', error);
            hideBarrageLoading();
            container.style.display = 'none';
        });

        // 响应窗口变化
        window.addEventListener('resize', debounce(handleResize, 200));

        // 响应动画偏好变化
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function(e) {
            state.barrage.prefersReducedMotion = e.matches;
            if (e.matches) {
                stopBarrageAnimation();
            } else if (!isMobile()) {
                startBarrageAnimation();
            }
        });

        // 【性能优化】页面可见性变化时暂停/恢复动画
        // 当用户切换标签页时，暂停弹幕动画以节省 CPU 和内存
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    /**
     * 【性能优化】页面可见性变化处理
     * 页面隐藏时：暂停所有动画（桌面端 RAF + 移动端 Web Animations API）
     * 页面显示时：恢复动画
     */
    function handleVisibilityChange() {
        if (document.hidden) {
            // 页面隐藏：暂停动画
            if (isMobile()) {
                // 移动端：暂停 Web Animations API
                var scroller = document.getElementById('mobile-signals-scroller');
                if (scroller && scroller._scrollAnimation) {
                    scroller._scrollAnimation.pause();
                }
            } else {
                // 桌面端：停止 requestAnimationFrame
                stopBarrageAnimation();
            }
            console.log('[Barrage] 页面隐藏，动画已暂停');
        } else {
            // 页面显示：恢复动画
            if (!state.barrage.prefersReducedMotion) {
                if (isMobile()) {
                    // 移动端：恢复 Web Animations API
                    var scroller = document.getElementById('mobile-signals-scroller');
                    if (scroller && scroller._scrollAnimation) {
                        scroller._scrollAnimation.play();
                    }
                } else {
                    // 桌面端：恢复 requestAnimationFrame
                    startBarrageAnimation();
                }
            }
            console.log('[Barrage] 页面显示，动画已恢复');
        }
    }

    /**
     * 从评论 API 加载弹幕数据
     * 筛选规则由 config.limits.barrage 配置
     */
    async function loadBarrageData() {
        state.barrage.isLoading = true;

        var cfg = state.config;

        // 检查是否有 Comments 类和配置
        if (typeof Comments === 'undefined' || !cfg || !cfg.server) {
            console.warn('[Barrage] Comments 模块未加载或配置缺失，使用降级数据');
            state.barrage.isLoading = false;
            return getFallbackBarrageData();
        }

        // 从配置读取弹幕限制（优先使用配置值，否则使用默认值）
        var limits = Object.assign({}, DEFAULTS.limits.barrage, (cfg.limits && cfg.limits.barrage) || {});

        try {
            var data = await Comments.fetchBarrageComments({
                server: cfg.server,
                provider: state.provider,
                pageKey: '/guestbook',
                site: cfg.site || ''
            }, {
                pinned: limits.pinned,
                hot: limits.hot,
                latest: limits.latest
            });

            state.barrage.isLoading = false;

            if (data.length === 0) {
                console.log('[Barrage] 无评论数据，使用降级数据');
                return getFallbackBarrageData();
            }

            console.log('[Barrage] 已加载', data.length, '条弹幕数据 (置顶:' + limits.pinned + ', 热门:' + limits.hot + ', 最新:' + limits.latest + ')');
            return data;
        } catch (error) {
            console.error('[Barrage] 数据加载失败:', error);
            state.barrage.isLoading = false;
            return getFallbackBarrageData();
        }
    }

    /**
     * 降级数据：当评论 API 不可用时使用
     * 提供足够多的示例数据确保移动端有良好的视觉效果
     */
    function getFallbackBarrageData() {
        return [
            { id: 'fallback-1', content: '欢迎来到信号站，留下你的足迹 ✨', author: 'System', likes: 0, pinned: false },
            { id: 'fallback-2', content: '期待看到你的精彩评论', author: 'System', likes: 0, pinned: false },
            { id: 'fallback-3', content: '这里等待你的声音', author: 'System', likes: 0, pinned: false },
            { id: 'fallback-4', content: '每一条留言都是一颗信号', author: 'System', likes: 0, pinned: false },
            { id: 'fallback-5', content: '感谢你的访问和支持', author: 'System', likes: 0, pinned: false },
            { id: 'fallback-6', content: '分享你的想法和故事', author: 'System', likes: 0, pinned: false },
            { id: 'fallback-7', content: '评论区等你来撩～', author: 'System', likes: 0, pinned: false },
            { id: 'fallback-8', content: '一起交流，一起成长', author: 'System', likes: 0, pinned: false }
        ];
    }

    function showBarrageLoading() {
        var canvas = state.barrage.canvas;
        if (!canvas) return;

        var loading = document.createElement('div');
        loading.className = 'signal-loading';
        loading.id = 'signal-loading';

        var content = document.createElement('div');
        content.className = 'signal-loading-content';

        var dots = document.createElement('div');
        dots.className = 'signal-loading-dots';
        for (var i = 0; i < 3; i++) {
            var dot = document.createElement('div');
            dot.className = 'signal-loading-dot';
            dots.appendChild(dot);
        }
        content.appendChild(dots);

        var text = document.createElement('div');
        text.className = 'signal-loading-text';
        text.id = 'signal-loading-text';
        text.textContent = 'SIGNAL LOADING...';
        content.appendChild(text);

        loading.appendChild(content);
        canvas.appendChild(loading);
    }

    /**
     * 更新加载状态文本
     * @param {string} status - 'loading' | 'ready'
     * @param {function} callback - 状态更新完成后的回调
     */
    function updateLoadingStatus(status, callback) {
        var textEl = document.getElementById('signal-loading-text');
        var loadingEl = document.getElementById('signal-loading');

        if (!textEl || !loadingEl) {
            if (callback) callback();
            return;
        }

        if (status === 'ready') {
            // 切换到"连接成功"状态
            textEl.textContent = 'SIGNAL CONNECTED';
            loadingEl.classList.add('is-ready');

            // 短暂延迟后回调
            setTimeout(function() {
                if (callback) callback();
            }, 300);
        } else {
            if (callback) callback();
        }
    }

    /**
     * 隐藏加载动画
     * @param {function} callback - 淡出完成后的回调
     */
    function hideBarrageLoading(callback) {
        var loading = document.getElementById('signal-loading');
        if (loading) {
            loading.classList.add('fade-out');
            setTimeout(function() {
                loading.remove();
                if (callback) callback();
            }, 400); // 淡出时间 400ms
        } else {
            if (callback) callback();
        }
    }

    function initBarrageTracks() {
        var cfg = DEFAULTS.barrage;
        var canvas = state.barrage.canvas;
        var canvasHeight = canvas.offsetHeight;
        var availableHeight = canvasHeight - (cfg.trackGap * 2);
        var trackHeight = availableHeight / cfg.tracks;

        state.barrage.tracks = [];

        for (var i = 0; i < cfg.tracks; i++) {
            var y = cfg.trackGap + (trackHeight * i) + (trackHeight - cfg.signalHeight) / 2;
            state.barrage.tracks.push({
                index: i,
                y: y,
                // 记录该轨道上最后一条弹幕的信息
                lastSignal: null,  // { exitTime, speed, width }
                speed: null        // 该轨道的固定速度
            });
        }
    }

    /**
     * 渲染桌面端弹幕
     * 简洁循环模式：只使用原始数据，播放完毕后重新开始
     */
    function renderBarrages(data) {
        var canvas = state.barrage.canvas;
        var cfg = DEFAULTS.barrage;
        var canvasWidth = canvas.offsetWidth;

        // 清空旧内容
        clearCanvas();

        state.barrage.signals = [];

        // 重置轨道状态
        state.barrage.tracks.forEach(function(track) {
            track.lastSignal = null;
            track.speed = null;
        });

        // 直接使用原始数据，不复制
        // 计算每条弹幕的调度信息
        var scheduledSignals = [];
        var currentTime = 0;
        var lastExitTime = 0;

        data.forEach(function(item, index) {
            // 先创建元素以获取实际宽度
            var element = createBarrageElement(item);
            element.style.visibility = 'hidden';
            element.style.position = 'absolute';
            element.style.top = '-9999px';
            document.body.appendChild(element);

            var width = element.offsetWidth;
            document.body.removeChild(element);

            // 寻找最佳轨道
            var result = findBestTrackForSignal(width, canvasWidth, currentTime);
            var track = result.track;
            var enterTime = result.enterTime;

            // 更新当前时间
            if (enterTime > currentTime) {
                currentTime = enterTime;
            }

            // 为该轨道分配速度（如果尚未分配）
            if (track.speed === null) {
                track.speed = cfg.baseSpeed + (Math.random() - 0.5) * cfg.speedVariance * 2;
            }

            var speed = track.speed;
            var travelTime = (canvasWidth + width + cfg.minGap) / speed;
            var exitTime = enterTime + travelTime;

            // 记录最晚退出时间
            if (exitTime > lastExitTime) {
                lastExitTime = exitTime;
            }

            // 更新轨道的最后弹幕信息
            track.lastSignal = {
                exitTime: exitTime,
                speed: speed,
                width: width
            };

            scheduledSignals.push({
                id: item.id,
                data: item,
                trackIndex: track.index,
                trackY: track.y,
                width: width,
                speed: speed,
                enterTime: enterTime,
                exitTime: exitTime
            });

            // 推进时间
            currentTime += cfg.entryInterval;
        });

        // 存储最后一条弹幕的退出时间，用于判断循环重置
        state.barrage.lastExitTime = lastExitTime;

        console.log('[Barrage] 弹幕播放周期:', lastExitTime.toFixed(1), '秒');

        // 按进入时间排序后渲染
        scheduledSignals.sort(function(a, b) {
            return a.enterTime - b.enterTime;
        });

        scheduledSignals.forEach(function(scheduled) {
            var element = createBarrageElement(scheduled.data);
            canvas.appendChild(element);

            var signal = {
                id: scheduled.id,
                element: element,
                trackIndex: scheduled.trackIndex,
                width: scheduled.width,
                x: canvasWidth + 50,
                enterTime: scheduled.enterTime,
                speed: scheduled.speed,
                data: scheduled.data
            };

            state.barrage.signals.push(signal);

            element.style.top = scheduled.trackY + 'px';
            element.style.left = signal.x + 'px';
            element.style.opacity = '0';

            bindBarrageEvents(signal);
        });

        console.log('[Barrage] 渲染完成:', state.barrage.signals.length, '条弹幕');
    }

    /**
     * 为弹幕寻找最佳轨道
     * 确保弹幕不会重叠
     */
    function findBestTrackForSignal(signalWidth, canvasWidth, currentTime) {
        var cfg = DEFAULTS.barrage;
        var bestTrack = null;
        var minEnterTime = Infinity;

        state.barrage.tracks.forEach(function(track) {
            var enterTime = currentTime;

            if (track.lastSignal) {
                // 计算安全进入时间：前一条弹幕完全进入画布后
                // 需要考虑：前一条弹幕的速度、宽度、最小间距
                var lastExitTime = track.lastSignal.exitTime;
                var safeEnterTime = lastExitTime + (cfg.minGap / track.lastSignal.speed);

                if (safeEnterTime > enterTime) {
                    enterTime = safeEnterTime;
                }
            }

            if (enterTime < minEnterTime) {
                minEnterTime = enterTime;
                bestTrack = track;
            }
        });

        return {
            track: bestTrack || state.barrage.tracks[0],
            enterTime: minEnterTime
        };
    }

    function createBarrageElement(data) {
        var item = document.createElement('div');
        item.className = 'signal-item';
        item.setAttribute('data-signal-id', data.id);

        if (data.pinned) {
            item.classList.add('pinned');
        } else if (data.likes >= 10) {
            item.classList.add('hot');
        }

        // 置顶标签
        if (data.pinned) {
            var tag = document.createElement('span');
            tag.className = 'signal-item-tag';
            tag.textContent = 'PIN';
            item.appendChild(tag);
        } else if (data.likes >= 10) {
            // 热门标签 + 点赞数
            var hotTag = document.createElement('span');
            hotTag.className = 'signal-item-tag hot';
            hotTag.textContent = 'HOT:' + data.likes;
            item.appendChild(hotTag);
        }

        // 内容 - 全文显示
        var content = data.content || '';
        var contentSpan = document.createElement('span');
        contentSpan.className = 'signal-item-content';
        contentSpan.textContent = content;
        item.appendChild(contentSpan);

        // 作者
        var authorSpan = document.createElement('span');
        authorSpan.className = 'signal-item-author';
        authorSpan.textContent = data.author || 'Anonymous';
        item.appendChild(authorSpan);

        return item;
    }

    function bindBarrageEvents(signal) {
        var element = signal.element;

        element.addEventListener('mouseenter', function() {
            state.barrage.pausedTracks[signal.trackIndex] = true;
        });

        element.addEventListener('mouseleave', function() {
            delete state.barrage.pausedTracks[signal.trackIndex];
        });

        element.addEventListener('click', function() {
            var commentEl = document.querySelector('[data-comment-id="' + signal.id + '"]');
            if (commentEl) {
                commentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                commentEl.classList.add('highlight');
                setTimeout(function() {
                    commentEl.classList.remove('highlight');
                }, 2000);
            }
        });
    }

    function clearCanvas() {
        var canvas = state.barrage.canvas;
        if (!canvas) return;

        var children = Array.prototype.slice.call(canvas.children);
        children.forEach(function(child) {
            if (child.id !== 'signal-loading') {
                child.remove();
            }
        });
    }

    // ==================== 弹幕动画 ====================
    function startBarrageAnimation() {
        if (state.barrage.isRunning || isMobile()) return;

        state.barrage.isRunning = true;
        state.barrage.startTime = performance.now();
        state.barrage.loopCount = 0;

        state.barrage.signals.forEach(function(signal) {
            signal.element.style.opacity = '1';
        });

        animateBarrage();
    }

    function stopBarrageAnimation() {
        state.barrage.isRunning = false;
        if (state.barrage.animationId) {
            cancelAnimationFrame(state.barrage.animationId);
            state.barrage.animationId = null;
        }
    }

    /**
     * 显示循环过渡加载动画
     * 在弹幕播放完毕后显示，作为循环的自然过渡
     */
    function showCycleLoading(callback) {
        var canvas = state.barrage.canvas;
        if (!canvas) {
            if (callback) callback();
            return;
        }

        var loading = document.createElement('div');
        loading.className = 'signal-loading';
        loading.id = 'signal-loading';

        var content = document.createElement('div');
        content.className = 'signal-loading-content';

        var dots = document.createElement('div');
        dots.className = 'signal-loading-dots';
        for (var i = 0; i < 3; i++) {
            var dot = document.createElement('div');
            dot.className = 'signal-loading-dot';
            dots.appendChild(dot);
        }
        content.appendChild(dots);

        var text = document.createElement('div');
        text.className = 'signal-loading-text';
        text.id = 'signal-loading-text';
        text.textContent = 'SIGNAL RECONNECTING...';
        content.appendChild(text);

        loading.appendChild(content);
        canvas.appendChild(loading);

        // 循环加载动画持续时间（毫秒）
        var cycleLoadingDuration = 1500;

        // 1 秒后切换到"连接成功"状态
        setTimeout(function() {
            var textEl = document.getElementById('signal-loading-text');
            var loadingEl = document.getElementById('signal-loading');
            if (textEl && loadingEl) {
                textEl.textContent = 'SIGNAL CONNECTED';
                loadingEl.classList.add('is-ready');
            }
        }, cycleLoadingDuration - 500);

        // 总时间后淡出并回调
        setTimeout(function() {
            var loadingEl = document.getElementById('signal-loading');
            if (loadingEl) {
                loadingEl.classList.add('fade-out');
                setTimeout(function() {
                    if (loadingEl.parentNode) {
                        loadingEl.remove();
                    }
                    if (callback) callback();
                }, 400);
            } else {
                if (callback) callback();
            }
        }, cycleLoadingDuration);
    }

    /**
     * 开始新一轮弹幕播放
     * 重置所有弹幕位置，随机化轨道速度
     */
    function startNewBarrageCycle() {
        state.barrage.startTime = performance.now();
        state.barrage.loopCount++;

        // 重置轨道速度，让每轮有不同的视觉效果
        state.barrage.tracks.forEach(function(track) {
            var cfg = DEFAULTS.barrage;
            track.speed = cfg.baseSpeed + (Math.random() - 0.5) * cfg.speedVariance * 2;
        });

        // 重置所有弹幕位置
        var canvasWidth = state.barrage.canvas.offsetWidth;
        state.barrage.signals.forEach(function(signal) {
            signal.element.style.opacity = '0';
            signal.element.style.left = (canvasWidth + 100) + 'px';
        });

        console.log('[Barrage] 循环 #' + (state.barrage.loopCount + 1));

        // 继续动画
        animateBarrage();
    }

    /**
     * 弹幕动画 - 完整循环模式
     * 播放完毕 → 显示加载动画 → 重新开始播放
     */
    function animateBarrage() {
        if (!state.barrage.isRunning) return;

        var elapsed = (performance.now() - state.barrage.startTime) / 1000;
        var canvasWidth = state.barrage.canvas.offsetWidth;
        var lastExitTime = state.barrage.lastExitTime;

        // 检查是否需要进入循环过渡（最后一条弹幕已退出）
        if (elapsed > lastExitTime) {
            // 先隐藏所有弹幕
            state.barrage.signals.forEach(function(signal) {
                signal.element.style.opacity = '0';
            });

            // 显示循环加载动画，完毕后开始新一轮
            showCycleLoading(function() {
                if (state.barrage.isRunning) {
                    startNewBarrageCycle();
                }
            });
            return; // 停止当前动画循环，等待加载动画完成
        }

        state.barrage.signals.forEach(function(signal) {
            // 检查该轨道是否被暂停
            if (state.barrage.pausedTracks[signal.trackIndex]) {
                return;
            }

            // 计算弹幕在当前时间点的位置
            var travelTime = elapsed - signal.enterTime;

            // 如果还没到弹幕的进入时间，隐藏它
            if (travelTime < 0) {
                signal.element.style.opacity = '0';
                signal.element.style.left = (canvasWidth + 100) + 'px';
                return;
            }

            // 获取该轨道的速度（可能在循环重置时更新）
            var track = state.barrage.tracks[signal.trackIndex];
            var speed = track ? track.speed : signal.speed;

            // 计算当前位置
            var currentX = canvasWidth + 50 - (speed * travelTime);

            // 弹幕已完全离开画布
            if (currentX < -signal.width - 50) {
                signal.element.style.opacity = '0';
                return;
            }

            // 弹幕在可见范围内，显示并更新位置
            signal.element.style.opacity = '1';
            signal.element.style.left = currentX + 'px';
        });

        state.barrage.animationId = requestAnimationFrame(animateBarrage);
    }

    // ==================== 移动端弹幕 ====================
    /**
     * 移动端弹幕：简洁循环模式
     *
     * 播放流程：
     * 1. 内容从底部升起
     * 2. 所有弹幕向上滚动，直到最后一条滚出视野
     * 3. 动画重置，重新从底部升起（自然过渡）
     */
    function renderMobileBarrages(data) {
        var canvas = state.barrage.canvas;
        if (!canvas) return;

        clearCanvas();
        state.barrage.container.classList.add('signal-stream-mobile');

        // 创建滚动容器
        var scroller = document.createElement('div');
        scroller.className = 'mobile-signals-scroller';
        scroller.id = 'mobile-signals-scroller';

        // 只使用原始数据，不复制
        data.forEach(function(item, index) {
            var element = createMobileBarrageElement(item, index);
            scroller.appendChild(element);
        });

        // 初始隐藏，防止闪烁
        scroller.style.opacity = '0';

        canvas.appendChild(scroller);

        // 设置滚动动画
        setupMobileScrollAnimation(scroller, canvas, data.length);

        // 绑定触摸暂停事件
        bindMobileScrollEvents(scroller);

        console.log('[Barrage] 移动端弹幕渲染完成:', data.length, '条');
    }

    /**
     * 设置移动端滚动动画 - 完整循环模式
     * 播放完毕 → 显示加载动画 → 重新开始播放
     */
    function setupMobileScrollAnimation(scroller, canvas, dataCount) {
        // 使用 RAF 确保 DOM 完全渲染
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                var containerHeight = canvas.offsetHeight;
                var contentHeight = scroller.offsetHeight;

                console.log('[Barrage] 移动端参数:', {
                    containerHeight: containerHeight,
                    contentHeight: contentHeight,
                    dataCount: dataCount
                });

                // 动画参数：
                // 开始：内容顶部与容器底部对齐（第一条刚可见）
                var startOffset = containerHeight;

                // 结束：内容完全滚出视野（底部与容器顶部对齐）
                var endOffset = -contentHeight;

                // 滚动距离
                var scrollDistance = containerHeight + contentHeight;

                // 速度计算：每条约 2.5 秒
                var avgItemHeight = contentHeight / dataCount;
                var targetTimePerItem = 2.5;
                var speed = avgItemHeight / targetTimePerItem;
                var duration = scrollDistance / speed;

                // 最少 15 秒
                duration = Math.max(15, duration);

                console.log('[Barrage] 动画参数:', {
                    startOffset: startOffset,
                    endOffset: endOffset,
                    scrollDistance: scrollDistance,
                    duration: duration.toFixed(1) + 's'
                });

                // 存储动画参数供循环使用
                scroller._animationParams = {
                    startOffset: startOffset,
                    endOffset: endOffset,
                    duration: duration
                };

                // 启动第一次播放
                runMobileAnimationCycle(scroller, canvas);
            });
        });
    }

    /**
     * 执行一轮移动端弹幕动画
     */
    function runMobileAnimationCycle(scroller, canvas) {
        var params = scroller._animationParams;
        if (!params) return;

        // 取消之前的动画
        if (scroller._scrollAnimation) {
            scroller._scrollAnimation.cancel();
        }

        // 使用 Web Animations API 播放一次
        var animation = scroller.animate([
            { transform: 'translateY(' + params.startOffset + 'px)' },
            { transform: 'translateY(' + params.endOffset + 'px)' }
        ], {
            duration: params.duration * 1000,
            iterations: 1,  // 只播放一次
            easing: 'linear'
        });

        // 动画开始后显示内容
        scroller.style.opacity = '1';

        // 存储动画引用
        scroller._scrollAnimation = animation;

        // 检查减少动画偏好
        if (state.barrage.prefersReducedMotion) {
            animation.pause();
            return;
        }

        // 动画结束时显示循环加载动画
        animation.onfinish = function() {
            // 隐藏滚动内容
            scroller.style.opacity = '0';

            // 显示循环加载动画
            showCycleLoading(function() {
                // 加载完成后重新开始新一轮
                if (!state.barrage.prefersReducedMotion) {
                    runMobileAnimationCycle(scroller, canvas);
                }
            });
        };
    }

    function bindMobileScrollEvents(scroller) {
        // 触摸时暂停滚动
        scroller.addEventListener('touchstart', function() {
            if (scroller._scrollAnimation) {
                scroller._scrollAnimation.pause();
            }
        });

        scroller.addEventListener('touchend', function() {
            if (scroller._scrollAnimation && !state.barrage.prefersReducedMotion) {
                scroller._scrollAnimation.play();
            }
        });

        // 鼠标悬停也暂停（方便桌面调试）
        scroller.addEventListener('mouseenter', function() {
            if (scroller._scrollAnimation) {
                scroller._scrollAnimation.pause();
            }
        });

        scroller.addEventListener('mouseleave', function() {
            if (scroller._scrollAnimation && !state.barrage.prefersReducedMotion) {
                scroller._scrollAnimation.play();
            }
        });
    }

    /**
     * 创建移动端弹幕元素
     * 设计原则：与PC端一致，展示"评论内容 @作者昵称"
     * - 不展示点赞数量
     * - 不展示热门/置顶徽章
     * - 通过卡片边框颜色和背景区分三类评论
     */
    function createMobileBarrageElement(data, index) {
        var item = document.createElement('div');
        item.className = 'mobile-signal-item';

        // 通过类名控制边框颜色和背景，区分三类评论
        if (data.pinned) {
            item.classList.add('mobile-signal-pinned');
        } else if (data.likes >= 10) {
            item.classList.add('mobile-signal-liked');
        }

        // 标签（置顶/热门）
        if (data.pinned) {
            var tag = document.createElement('span');
            tag.className = 'signal-item-tag';
            tag.textContent = 'PIN';
            item.appendChild(tag);
            item.appendChild(document.createTextNode(' '));
        } else if (data.likes >= 10) {
            var hotTag = document.createElement('span');
            hotTag.className = 'signal-item-tag hot';
            hotTag.textContent = 'HOT:' + data.likes;
            item.appendChild(hotTag);
            item.appendChild(document.createTextNode(' '));
        }

        // 评论内容
        var content = data.content || '';
        var contentSpan = document.createElement('span');
        contentSpan.className = 'mobile-signal-content';
        contentSpan.textContent = content;
        item.appendChild(contentSpan);

        // 作者
        var authorSpan = document.createElement('span');
        authorSpan.className = 'mobile-signal-author';
        authorSpan.textContent = data.author || 'Anonymous';
        item.appendChild(document.createTextNode(' '));
        item.appendChild(authorSpan);

        // 点击跳转到评论
        item.addEventListener('click', function() {
            var commentEl = document.querySelector('[data-comment-id="' + data.id + '"]');
            if (commentEl) {
                commentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                commentEl.classList.add('highlight');
                setTimeout(function() {
                    commentEl.classList.remove('highlight');
                }, 2000);
            }
        });

        return item;
    }

    // ==================== 评论系统 ====================
    /**
     * 初始化评论系统
     *
     * 设计决策：留言板页面的评论容器在首屏可见，不需要延迟加载。
     * 延迟加载（IntersectionObserver）只适用于评论容器在视口外的情况。
     * 如果容器初始就在视口内，IntersectionObserver 不会触发（无状态变化），
     * 导致骨架屏一直显示，直到用户滚动页面才初始化。
     */
    function initCommentSystemLazy() {
        var container = document.getElementById('comments-container');
        if (!container) {
            console.error('[Guestbook] 找不到评论容器');
            return;
        }

        // 留言板页面评论容器在首屏可见，直接初始化
        // 不使用 IntersectionObserver 延迟加载
        initCommentSystem(container);
        console.log('[Guestbook] 评论系统开始初始化');
    }

    /**
     * 【性能优化】预取热门排序数据
     * 在后台静默加载，用于后续排序切换
     */
    function prefetchHotData() {
        var cfg = state.config;
        if (!cfg || !cfg.server || typeof Comments === 'undefined') {
            return;
        }

        // 从配置读取热门限制
        var hotLimit = (cfg.limits && cfg.limits.comments && cfg.limits.comments.hot) || DEFAULTS.limits.comments.hot;

        // 延迟 2 秒后预取，避免与弹幕数据竞争带宽
        setTimeout(async function() {
            try {
                console.log('[Guestbook] 开始预取热门数据 (limit: ' + hotLimit + ')...');
                await Comments.fetchHotData({
                    server: cfg.server,
                    provider: state.provider,
                    pageKey: '/guestbook',
                    site: cfg.site || ''
                }, { pageSize: hotLimit });
                console.log('[Guestbook] 热门数据预取完成');
            } catch (error) {
                console.warn('[Guestbook] 热门数据预取失败:', error);
            }
        }, 2000);
    }

    /**
     * 初始化评论系统
     */
    function initCommentSystem(container) {
        // 检查 Comments 类是否可用（来自 comments-standalone.js）
        if (typeof Comments === 'undefined') {
            console.error('[Guestbook] Comments 模块未加载');
            showError('评论系统加载失败，请刷新页面重试');
            return;
        }

        var cfg = state.config;

        // 获取编辑器容器
        var editorContainer = document.getElementById('signal-editor');

        // 从配置读取评论列表限制（优先使用配置值，否则使用默认值）
        var commentsLimits = Object.assign({}, DEFAULTS.limits.comments, (cfg.limits && cfg.limits.comments) || {});

        try {
            // 使用统一的 Comments 类
            state.instance = new Comments({
                container: container,
                editorContainer: editorContainer,
                provider: state.provider,
                server: cfg.server,
                pageKey: '/guestbook',
                site: cfg.site || '',
                placeholder: cfg.placeholder || DEFAULTS.placeholder,
                // 传递评论列表数量限制
                limits: commentsLimits
            });

            console.log('[Guestbook] 评论列表限制:', commentsLimits);

            // 初始化（异步）
            state.instance.init().then(function() {
                console.log('[Guestbook] 评论系统初始化成功');
            }).catch(function(error) {
                console.error('[Guestbook] 评论系统初始化失败:', error);
                showError('评论系统初始化失败');
            });

        } catch (error) {
            console.error('[Guestbook] 评论系统初始化失败:', error);
            showError('评论系统初始化失败');
        }
    }

    function showError(message) {
        var container = document.getElementById('comments-container');
        if (!container) return;

        // 清空容器
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        var errorDiv = document.createElement('div');
        errorDiv.className = 'comments-error';

        var icon = document.createElement('i');
        icon.className = 'fa-solid fa-signal comments-error-icon';
        errorDiv.appendChild(icon);

        var msg = document.createElement('p');
        msg.className = 'comments-error-message';
        msg.textContent = message;
        errorDiv.appendChild(msg);

        var retryBtn = document.createElement('button');
        retryBtn.className = 'comments-error-retry';

        var retryIcon = document.createElement('i');
        retryIcon.className = 'fa-solid fa-rotate-right';
        retryBtn.appendChild(retryIcon);
        retryBtn.appendChild(document.createTextNode(' 重试'));

        retryBtn.addEventListener('click', function() {
            location.reload();
        });
        errorDiv.appendChild(retryBtn);

        container.appendChild(errorDiv);
    }

    // ==================== 主题同步 ====================
    function initThemeSync() {
        // 新架构：使用 CSS 变量，主题变化时自动适配
        // 无需手动同步外部 SDK
        // 评论组件的样式完全基于项目 CSS 变量系统

        // 如果需要，可以在这里添加评论刷新逻辑
        // 例如：当配色变化时，刷新评论列表以获取新的头像等

        document.addEventListener('schemechange', function(e) {
            // 配色方案变化时，可以选择刷新评论
            // 目前不需要，因为 UI 使用 CSS 变量自动适配
            console.log('[Guestbook] 配色方案已变化，UI 自动适配');
        });
    }

    // ==================== 工具函数 ====================
    function isMobile() {
        return window.innerWidth <= 640;
    }

    function debounce(fn, delay) {
        var timer = null;
        return function() {
            var context = this;
            var args = arguments;
            if (timer) clearTimeout(timer);
            timer = setTimeout(function() {
                fn.apply(context, args);
            }, delay);
        };
    }

    function handleResize() {
        if (isMobile()) {
            if (!state.barrage.container.classList.contains('signal-stream-mobile')) {
                stopBarrageAnimation();
                state.barrage.container.classList.add('signal-stream-mobile');
                renderMobileBarrages(state.barrage.data);
            }
        } else {
            if (state.barrage.container.classList.contains('signal-stream-mobile')) {
                state.barrage.container.classList.remove('signal-stream-mobile');
                initBarrageTracks();
                renderBarrages(state.barrage.data);
                if (!state.barrage.prefersReducedMotion) {
                    startBarrageAnimation();
                }
            } else {
                initBarrageTracks();
                state.barrage.signals.forEach(function(signal) {
                    var track = state.barrage.tracks[signal.trackIndex];
                    if (track) {
                        signal.element.style.top = track.y + 'px';
                    }
                });
            }
        }
    }

    // ==================== 公开 API ====================
    window.Guestbook = {
        init: init,
        getInstance: function() { return state.instance; },
        getProvider: function() { return state.provider; },
        refresh: function() {
            if (state.provider === 'waline' && state.instance) {
                state.instance.refresh();
            } else if (state.provider === 'artalk' && state.instance) {
                state.instance.reload();
            }
        },
        // 弹幕相关 API
        barrage: {
            refresh: async function() {
                var data = await loadBarrageData();
                if (data.length > 0) {
                    state.barrage.data = data;
                    if (isMobile()) {
                        renderMobileBarrages(data);
                    } else {
                        clearCanvas();
                        initBarrageTracks();
                        renderBarrages(data);
                        if (!state.barrage.prefersReducedMotion && !state.barrage.isRunning) {
                            startBarrageAnimation();
                        }
                    }
                }
                return data;
            },
            getData: function() {
                return state.barrage.data;
            },
            isRunning: function() {
                return state.barrage.isRunning;
            }
        }
    };

    // ==================== 自动初始化 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();