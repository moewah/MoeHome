/**
 * MoeWah Homepage - Main Application
 * 个人主页主逻辑文件（仅保留动态交互部分）
 */

// ========== 强制页面从顶部开始（必须在最早时机执行）==========
// 禁用浏览器自动恢复滚动位置
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
// 立即滚动到顶部（不等待 DOMContentLoaded）
window.scrollTo(0, 0);

// ========== 页面初始化 ==========
function initPage() {
    const config = window.HOMEPAGE_CONFIG;

    // 初始化动态视口高度（解决移动端 100vh 问题）
    initDynamicViewportHeight();

    // 初始化主题
    initTheme();

    // 初始化导航栏
    initNavbar();

    // 初始化骨架屏和懒加载
    initSkeletonAndLazyLoad();

    // 初始化动画（语录循环）
    initAnimations();

    // 初始化全局效果（光标、视差、回到顶部）
    initGlobalEffects();

    // 初始化页面特定效果
    initInteractions();

    // 初始化捐赠模态框
    initDonation();

    // 初始化 RSS 翻转轮播
    initRssFlipCarousel();

    // 初始化项目轮播
    initProjectsCarousel();

    // 初始化音乐播放器
    initMusicPlayer();

    // 初始化动态页面（如果存在）
    initMoments();
}

// ========== 导航栏初始化 ==========
function initNavbar() {
    initNavbarScroll();
    initNavbarBrandEffect();
    initNavbarActiveSection();
    initThemeDropdown();
    initMobileSidebar();
    initCustomMenus();
}

// 滚动时背景变化
function initNavbarScroll() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    const checkScroll = () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    };

    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll(); // 初始检查
}

// 品牌区自动循环打字机效果
function initNavbarBrandEffect() {
    const brand = document.getElementById('navbar-brand');
    if (!brand) return;

    const nameEl = brand.querySelector('.brand-name');
    if (!nameEl) return;

    const config = window.HOMEPAGE_CONFIG;
    const originalName = config?.profile?.name || 'MoeWah';
    const hoverText = config?.nav?.brand?.hoverText || '~/whoami';

    let typingInterval = null;
    let isTyping = false;
    let showOriginal = true; // 当前显示的是名字还是路径

    const typingSpeed = 80;
    const displayTime = 3000; // 显示时间 3秒

    // 打字效果
    const typeText = (text, callback) => {
        isTyping = true;
        let i = 0;
        nameEl.textContent = '';

        if (typingInterval) {
            clearInterval(typingInterval);
        }

        typingInterval = setInterval(() => {
            if (i < text.length) {
                nameEl.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(typingInterval);
                typingInterval = null;
                isTyping = false;
                if (callback) callback();
            }
        }, typingSpeed);
    };

    // 删除效果
    const deleteText = (callback) => {
        isTyping = true;
        let text = nameEl.textContent;

        typingInterval = setInterval(() => {
            if (text.length > 0) {
                text = text.slice(0, -1);
                nameEl.textContent = text;
            } else {
                clearInterval(typingInterval);
                typingInterval = null;
                isTyping = false;
                if (callback) callback();
            }
        }, typingSpeed / 2); // 删除速度快一点
    };

    // 循环切换
    const cycle = () => {
        if (isTyping) return;

        const nextText = showOriginal ? hoverText : originalName;
        showOriginal = !showOriginal;

        // 先删除当前文字
        deleteText(() => {
            // 短暂停顿后打新文字
            setTimeout(() => {
                typeText(nextText);
            }, 200);
        });
    };

    // 启动自动循环
    const startCycle = () => {
        // 初始显示名字
        nameEl.textContent = originalName;
        // 每隔一段时间切换
        setInterval(cycle, displayTime);
    };

    // 页面可见性变化时处理
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (typingInterval) {
                clearInterval(typingInterval);
                typingInterval = null;
            }
            isTyping = false;
        }
    });

    startCycle();
}

// 当前区域高亮（Intersection Observer + 滚动检测）
// 注意：仅在锚点导航模式下启用滚动高亮，独立页面模式由点击/服务端控制高亮
function initNavbarActiveSection() {
    const navLinks = document.querySelectorAll('.nav-link, .nav-sidebar-link');
    if (navLinks.length === 0) return;

    // 检测是否为锚点导航模式
    // 如果存在带有 # 锚点的链接，说明是单页锚点导航，需要滚动高亮
    // 如果所有链接都是页面路径（无 #），说明是独立页面模式，禁用滚动高亮
    const hasAnchorLinks = Array.from(navLinks).some(link => {
        const href = link.getAttribute('href') || '';
        return href.includes('#');
    });

    // 独立页面模式：禁用滚动高亮，高亮由点击或服务端渲染控制
    if (!hasAnchorLinks) {
        return;
    }

    const sections = document.querySelectorAll('#actual-content, #rss-section, #projects-section, #links-container');
    if (sections.length === 0) return;

    // 从链接 href 提取 section ID
    function getSectionIdFromLink(link) {
        const href = link.getAttribute('href') || '';
        // 处理 index.html#section 格式
        const hashMatch = href.match(/#([\w-]+)/);
        if (hashMatch) {
            return hashMatch[1];
        }
        // 如果是 index.html 且没有 hash，则是首页链接
        if (href === 'index.html' || href === '/' || href === '') {
            return 'actual-content';
        }
        return null;
    }

    // 更新导航高亮状态
    function updateActiveNav(sectionId) {
        navLinks.forEach(link => {
            const linkSectionId = getSectionIdFromLink(link);
            link.classList.toggle('active', linkSectionId === sectionId);
        });
    }

    // 检测是否在页面顶部附近（考虑导航栏高度）
    function isNearTop() {
        const navbar = document.getElementById('navbar');
        const navbarHeight = navbar ? navbar.offsetHeight : 60;
        return window.scrollY < navbarHeight + 50;
    }

    // 使用 IntersectionObserver 检测当前可见的 section
    const observer = new IntersectionObserver((entries) => {
        // 如果在页面顶部，强制高亮首页
        if (isNearTop()) {
            updateActiveNav('actual-content');
            return;
        }

        // 找出所有 intersecting 的 sections
        const intersectingEntries = entries.filter(entry => entry.isIntersecting);

        if (intersectingEntries.length === 0) return;

        // 按照距离视口顶部的距离排序，选择最接近顶部的 section
        intersectingEntries.sort((a, b) => {
            const rectA = a.boundingClientRect;
            const rectB = b.boundingClientRect;
            // 优先选择顶部在视口内且最接近顶部的
            return Math.abs(rectA.top) - Math.abs(rectB.top);
        });

        // 更新高亮状态
        const activeSection = intersectingEntries[0].target.id;
        updateActiveNav(activeSection);
    }, {
        rootMargin: '-10% 0px -80% 0px',
        threshold: 0
    });

    sections.forEach(section => observer.observe(section));

    // 监听滚动事件，确保顶部位置正确高亮
    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            if (isNearTop()) {
                updateActiveNav('actual-content');
            }
        }, 50);
    }, { passive: true });

    // 初始化时检查
    if (isNearTop()) {
        updateActiveNav('actual-content');
    }

    // 点击导航链接后立即更新高亮状态
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const targetSection = getSectionIdFromLink(link);
            if (targetSection) {
                updateActiveNav(targetSection);
            }
        });
    });

    // 滚动到顶部时，高亮 Home
    const brand = document.getElementById('navbar-brand');
    if (brand) {
        brand.addEventListener('click', () => {
            updateActiveNav('actual-content');
        });
    }
}

// ========== 统一主题下拉菜单 ==========
function initThemeDropdown() {
    const toggle = document.getElementById('nav-theme-toggle');
    const dropdown = document.getElementById('theme-dropdown');
    const mobileThemeBtn = document.getElementById('nav-sidebar-theme');

    if (!dropdown) return;

    // PC 端：点击按钮切换下拉菜单
    if (toggle) {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleThemeDropdown();
        });
    }

    // 移动端：点击按钮循环切换模式
    if (mobileThemeBtn) {
        mobileThemeBtn.addEventListener('click', () => {
            openMobileThemeSelector();
        });
    }

    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
        if (dropdown.classList.contains('is-active') &&
            !dropdown.contains(e.target) &&
            e.target !== toggle) {
            closeThemeDropdown();
        }
    });

    // ESC 键关闭下拉菜单
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dropdown.classList.contains('is-active')) {
            closeThemeDropdown();
            toggle?.focus();
        }
    });

    // 模式切换按钮事件
    document.querySelectorAll('.theme-mode-item').forEach(item => {
        item.addEventListener('click', () => {
            const mode = item.dataset.mode;
            if (typeof ThemeManager !== 'undefined') {
                ThemeManager.setSavedTheme(mode);
                updateThemeDropdown();
            }
        });

        // 键盘导航
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const mode = item.dataset.mode;
                if (typeof ThemeManager !== 'undefined') {
                    ThemeManager.setSavedTheme(mode);
                    updateThemeDropdown();
                }
            }
        });
    });

    // 监听主题变化，更新下拉菜单和移动端图标
    document.addEventListener('themechange', (e) => {
        updateThemeDropdown();
        // 更新移动端图标
        if (e.detail?.mode) {
            updateMobileThemeIcon(e.detail.mode);
        }
    });

    // 初始化下拉菜单内容
    updateThemeDropdown();

    // 初始化移动端图标
    if (typeof ThemeManager !== 'undefined') {
        const savedTheme = ThemeManager.getSavedTheme();
        updateMobileThemeIcon(savedTheme);
    }
}

// 切换主题下拉菜单显示状态
function toggleThemeDropdown() {
    const dropdown = document.getElementById('theme-dropdown');
    if (!dropdown) return;

    const isActive = dropdown.classList.contains('is-active');
    if (isActive) {
        closeThemeDropdown();
    } else {
        openThemeDropdown();
    }
}

// 打开主题下拉菜单
function openThemeDropdown() {
    const dropdown = document.getElementById('theme-dropdown');
    const toggle = document.getElementById('nav-theme-toggle');
    if (!dropdown) return;

    // 动态定位：菜单右边缘与按钮右边缘对齐
    if (toggle) {
        const rect = toggle.getBoundingClientRect();
        const dropdownWidth = dropdown.offsetWidth || 200;
        dropdown.style.left = `${rect.right - dropdownWidth}px`;
        dropdown.style.right = 'auto';
    }

    updateThemeDropdown();
    dropdown.classList.add('is-active');
    dropdown.setAttribute('aria-hidden', 'false');

    // 聚焦到当前选中的模式
    const activeMode = dropdown.querySelector('.theme-mode-item.is-active');
    if (activeMode) {
        activeMode.focus();
    }
}

// 关闭主题下拉菜单
function closeThemeDropdown() {
    const dropdown = document.getElementById('theme-dropdown');
    if (!dropdown) return;

    dropdown.classList.remove('is-active');
    dropdown.setAttribute('aria-hidden', 'true');
}

// 更新主题下拉菜单内容
function updateThemeDropdown() {
    if (typeof ThemeManager === 'undefined') return;

    // 更新模式选中状态
    const currentMode = ThemeManager.getSavedTheme();
    document.querySelectorAll('.theme-mode-item').forEach(item => {
        const isActive = item.dataset.mode === currentMode;
        item.classList.toggle('is-active', isActive);
        item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // 更新配色方案列表
    updateThemeSchemeList();
}

// 更新配色方案列表
function updateThemeSchemeList() {
    const schemeList = document.getElementById('theme-scheme-list');
    if (!schemeList || typeof ThemeManager === 'undefined') return;

    const effectiveMode = ThemeManager.getEffectiveMode();
    const currentScheme = ThemeManager.getActiveScheme(effectiveMode);
    const availableSchemes = ThemeManager.getAvailableSchemes(effectiveMode);
    const defaultSchemeId = ThemeManager.defaultScheme[effectiveMode];

    // 清空列表
    schemeList.textContent = '';

    // 添加可用方案
    availableSchemes.forEach(scheme => {
        const isActive = currentScheme?.id === scheme.id;
        const isDefault = defaultSchemeId === scheme.id;
        const item = createThemeSchemeItem(scheme.id, scheme, isActive, isDefault);
        schemeList.appendChild(item);
    });
}

// 创建配色方案列表项
function createThemeSchemeItem(schemeId, scheme, isActive, isDefault) {
    const item = document.createElement('div');
    item.className = 'theme-scheme-item';
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '0');

    if (isActive) {
        item.classList.add('is-active');
        item.setAttribute('aria-selected', 'true');
    }

    if (isDefault) {
        item.classList.add('is-default');
    }

    // 颜色指示器（双色圆点）
    const colorIndicator = document.createElement('div');
    colorIndicator.className = 'theme-scheme-item-icon';
    colorIndicator.setAttribute('aria-hidden', 'true'); // 颜色信息通过名称传达

    // 注入方案颜色变量
    const colors = scheme.colors || {};
    if (colors.bgPrimary) {
        colorIndicator.style.setProperty('--scheme-bg-primary', colors.bgPrimary);
    }
    if (colors.accent) {
        colorIndicator.style.setProperty('--scheme-accent', colors.accent);
    }
    if (colors.border) {
        colorIndicator.style.setProperty('--scheme-border', colors.border);
    }

    item.appendChild(colorIndicator);

    // 名称
    const nameEl = document.createElement('span');
    nameEl.className = 'theme-scheme-item-name';
    nameEl.textContent = scheme.name;
    item.appendChild(nameEl);

    // 选中标记
    if (isActive) {
        const checkEl = document.createElement('i');
        checkEl.className = 'fa-solid fa-check theme-scheme-item-check';
        item.appendChild(checkEl);
    }

    // 默认配色标记（仅视觉提示）
    if (isDefault) {
        const defaultEl = document.createElement('i');
        defaultEl.className = 'fa-solid fa-star theme-scheme-item-default';
        defaultEl.title = 'Default Scheme';
        item.appendChild(defaultEl);
    }

    // 点击事件（允许自由切换）
    item.addEventListener('click', () => {
        selectThemeScheme(schemeId);
    });

    // 键盘事件
    item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectThemeScheme(schemeId);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = item.nextElementSibling;
            if (next) next.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = item.previousElementSibling;
            if (prev) prev.focus();
        }
    });

    return item;
}

// 选择配色方案
function selectThemeScheme(schemeId) {
    if (typeof ThemeManager === 'undefined') return;

    const currentMode = ThemeManager.getEffectiveMode();
    const success = ThemeManager.setScheme(schemeId, currentMode);

    if (success) {
        closeThemeDropdown();
        updateThemeSchemeList();
    }
}

// 移动端：循环切换模式并更新图标
function openMobileThemeSelector() {
    if (typeof ThemeManager === 'undefined') return;
    const newTheme = ThemeManager.toggle();
    updateMobileThemeIcon(newTheme);
}

// 更新移动端主题按钮图标
function updateMobileThemeIcon(theme) {
    const mobileToggle = document.getElementById('nav-sidebar-theme');
    if (!mobileToggle) return;

    const iconMap = {
        auto: 'fa-solid fa-desktop',
        light: 'fa-solid fa-sun',
        dark: 'fa-solid fa-moon'
    };

    const iconClass = iconMap[theme] || 'fa-solid fa-desktop';
    const icon = mobileToggle.querySelector('i');
    if (icon) {
        icon.className = iconClass;
    }
}

// 移动端侧边栏
function initMobileSidebar() {
    const toggle = document.getElementById('navbar-toggle');
    const sidebar = document.getElementById('nav-sidebar');
    const overlay = document.getElementById('nav-overlay');
    const closeBtn = document.getElementById('nav-sidebar-close');

    if (!toggle || !sidebar || !overlay) return;

    const open = () => {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const close = () => {
        sidebar.classList.remove('open');
        sidebar.style.transform = '';
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        // 重置滑动状态
        isSwiping = false;
        swipeStartX = 0;
        currentSwipeX = 0;
    };

    toggle.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);

    // 点击链接后关闭
    sidebar.querySelectorAll('.nav-sidebar-link').forEach(link => {
        link.addEventListener('click', close);
    });

    // 移动端下拉菜单
    sidebar.querySelectorAll('.nav-sidebar-dropdown-toggle').forEach(toggleBtn => {
        toggleBtn.addEventListener('click', () => {
            const dropdown = toggleBtn.closest('.nav-sidebar-dropdown');
            if (dropdown) {
                dropdown.classList.toggle('open');
            }
        });
    });

    // ========== 滑动关闭手势 ==========
    let isSwiping = false;
    let swipeStartX = 0;
    let currentSwipeX = 0;
    const SWIPE_THRESHOLD = 80; // 触发关闭的最小滑动距离
    const sidebarWidth = 280; // 侧边栏宽度

    // 触摸开始
    sidebar.addEventListener('touchstart', (e) => {
        if (!sidebar.classList.contains('open')) return;
        isSwiping = true;
        swipeStartX = e.touches[0].clientX;
        sidebar.style.transition = 'none';
    }, { passive: true });

    // 触摸移动
    sidebar.addEventListener('touchmove', (e) => {
        if (!isSwiping || !sidebar.classList.contains('open')) return;

        currentSwipeX = e.touches[0].clientX;
        const deltaX = currentSwipeX - swipeStartX;

        // 只允许向右滑动（关闭方向）
        if (deltaX > 0) {
            const translateX = Math.min(deltaX, sidebarWidth);
            sidebar.style.transform = `translateX(${translateX}px)`;
        }
    }, { passive: true });

    // 触摸结束
    sidebar.addEventListener('touchend', () => {
        if (!isSwiping) return;

        const deltaX = currentSwipeX - swipeStartX;
        sidebar.style.transition = '';

        // 滑动距离超过阈值则关闭，否则回弹
        if (deltaX > SWIPE_THRESHOLD) {
            close();
        } else {
            sidebar.style.transform = '';
        }

        isSwiping = false;
    }, { passive: true });

    // 边缘滑动打开侧边栏 - 从右侧边缘向左滑动
    let edgeSwipeStartX = 0;
    let isEdgeSwipe = false;

    document.addEventListener('touchstart', (e) => {
        // 从右边缘 20px 内开始滑动
        const windowWidth = window.innerWidth;
        if (e.touches[0].clientX > windowWidth - 20 && !sidebar.classList.contains('open')) {
            isEdgeSwipe = true;
            edgeSwipeStartX = e.touches[0].clientX;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isEdgeSwipe) return;

        const currentX = e.touches[0].clientX;
        const deltaX = currentX - edgeSwipeStartX;

        // 向左滑动打开（deltaX 为负值）
        if (deltaX < 0 && Math.abs(deltaX) < sidebarWidth) {
            e.preventDefault();
            sidebar.style.transition = 'none';
            sidebar.classList.add('open');
            overlay.classList.add('active');
            // 从右侧滑出：translateX(100%) -> translateX(0)
            // 向左滑动时，deltaX 为负，所以用 100% + deltaX/siderWidth * 100%
            const offset = sidebarWidth + deltaX; // deltaX 为负
            sidebar.style.transform = `translateX(${offset}px)`;
        }
    }, { passive: false });

    document.addEventListener('touchend', () => {
        if (!isEdgeSwipe) return;

        sidebar.style.transition = '';

        const currentX = sidebar.style.transform;
        const match = currentX.match(/translateX\(([-\d.]+)px\)/);

        if (match) {
            const translateX = parseFloat(match[1]);
            // 滑动超过一半则完全打开，否则关闭
            if (translateX < sidebarWidth / 2) {
                sidebar.style.transform = '';
            } else {
                close();
            }
        }

        isEdgeSwipe = false;
    }, { passive: true });
}

// 自定义菜单交互
function initCustomMenus() {
    // 桌面端 hover 展开已在 CSS 中处理
    // 移动端点击展开在 initMobileSidebar 中处理
}

// ========== 捐赠模态框 ==========
function initDonation() {
    const donationBtns = document.querySelectorAll('.donation__btn[data-qr]');
    if (donationBtns.length === 0) return;

    // 使用静态存在的模态框（已在 HTML 中定义）
    const modalOverlay = document.getElementById('donation-modal');
    if (!modalOverlay) return;

    const modalName = modalOverlay.querySelector('.donation__modal-name');
    const modalImg = modalOverlay.querySelector('.donation__qr-image');
    const closeBtn = modalOverlay.querySelector('.donation__modal-close');

    // 焦点陷阱相关变量
    let focusableElements = [];
    let firstFocusable = null;
    let lastFocusable = null;
    let previousActiveElement = null;

    // 更新可聚焦元素列表
    function updateFocusableElements() {
        focusableElements = modalOverlay.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable = focusableElements[0];
        lastFocusable = focusableElements[focusableElements.length - 1];
    }

    // 焦点陷阱处理
    function trapFocus(e) {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
            // Shift + Tab: 向后导航
            if (document.activeElement === firstFocusable) {
                e.preventDefault();
                lastFocusable.focus();
            }
        } else {
            // Tab: 向前导航
            if (document.activeElement === lastFocusable) {
                e.preventDefault();
                firstFocusable.focus();
            }
        }
    }

    // 打开模态框
    function openModal(name, qr) {
        // 保存当前焦点元素，以便关闭时恢复
        previousActiveElement = document.activeElement;

        modalName.textContent = name;
        modalImg.src = qr;
        modalImg.alt = name + '支付二维码';
        modalOverlay.classList.add('is-active');
        document.body.style.overflow = 'hidden';

        // 二维码加载错误处理
        modalImg.onerror = function() {
            this.style.display = 'none';
            // 显示错误提示
            const errorMsg = modalOverlay.querySelector('.donation__qr-error') ||
                document.createElement('p');
            errorMsg.className = 'donation__qr-error';
            errorMsg.textContent = '二维码加载失败，请稍后重试';
            errorMsg.style.cssText = 'color: var(--text-secondary); text-align: center; padding: 20px;';
            if (!modalOverlay.querySelector('.donation__qr-error')) {
                this.parentElement.appendChild(errorMsg);
            }
        };
        modalImg.onload = function() {
            this.style.display = 'block';
            const errorMsg = modalOverlay.querySelector('.donation__qr-error');
            if (errorMsg) errorMsg.remove();
        };

        // 更新可聚焦元素列表并设置焦点陷阱
        updateFocusableElements();

        // 添加焦点陷阱事件监听
        modalOverlay.addEventListener('keydown', trapFocus);

        // 聚焦到关闭按钮
        closeBtn.focus();

        // 设置 ARIA 属性
        modalOverlay.setAttribute('aria-hidden', 'false');
        modalOverlay.setAttribute('role', 'dialog');
        modalOverlay.setAttribute('aria-modal', 'true');
        modalOverlay.setAttribute('aria-labelledby', 'donation-modal-title');
    }

    // 关闭模态框
    function closeModal() {
        modalOverlay.classList.remove('is-active');
        document.body.style.overflow = '';

        // 移除焦点陷阱事件监听
        modalOverlay.removeEventListener('keydown', trapFocus);

        // 恢复之前的焦点
        if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
            previousActiveElement.focus();
        }

        // 更新 ARIA 属性
        modalOverlay.setAttribute('aria-hidden', 'true');
    }

    // 点击支付按钮打开模态框
    donationBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(btn.dataset.name, btn.dataset.qr);
        });
    });

    // 点击关闭按钮
    closeBtn.addEventListener('click', closeModal);

    // 点击遮罩层关闭
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.classList.contains('is-active')) {
            closeModal();
        }
    });

    // 初始化 ARIA 属性
    modalOverlay.setAttribute('aria-hidden', 'true');
}

// ========== 动态视口高度（解决移动端地址栏问题）==========
function initDynamicViewportHeight() {
    // 设置 CSS 变量 --vh 为实际视口高度的 1%
    const setVH = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    // 初始设置
    setVH();

    // 监听窗口大小变化（包括地址栏收起/展开）
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(setVH, 100);
    });

    // 监听设备方向变化
    window.addEventListener('orientationchange', () => {
        setTimeout(setVH, 100);
    });
}

// ========== 骨架屏和懒加载初始化 ==========
function initSkeletonAndLazyLoad() {
    // 添加骨架屏激活状态（隐藏交互元素）
    document.body.classList.add('skeleton-active');

    // 骨架屏最小显示时间（毫秒），避免闪烁
    const MIN_SKELETON_TIME = 100;
    // 骨架屏最大显示时间（毫秒），超时强制隐藏
    const MAX_SKELETON_TIME = 5000;
    const startTime = performance.now();
    let skeletonHidden = false;

    // 隐藏骨架屏的包装函数，防止重复调用
    const hideSkeletonOnce = () => {
        if (skeletonHidden) return;
        skeletonHidden = true;
        hideSkeleton();
    };

    // 设置超时保护，确保骨架屏不会无限显示
    const timeoutId = setTimeout(() => {
        if (!skeletonHidden) {
            console.warn('Skeleton screen timeout, force hiding');
            hideSkeletonOnce();
        }
    }, MAX_SKELETON_TIME);

    // 使用 DOMContentLoaded 替代 load 事件，首屏感知提速
    // 检查 DOM 是否已经加载完成
    const tryHideSkeleton = () => {
        // 计算已过时间，确保骨架屏至少显示 MIN_SKELETON_TIME
        const elapsed = performance.now() - startTime;
        const remainingTime = Math.max(0, MIN_SKELETON_TIME - elapsed);

        // 延迟隐藏骨架屏，确保用户能看到加载动画
        setTimeout(() => {
            clearTimeout(timeoutId);
            hideSkeletonOnce();
        }, remainingTime);

        // 初始化懒加载动画
        initLazyLoad();

        // 初始化渐进式图片加载
        initProgressiveImage();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryHideSkeleton);
    } else {
        // DOM 已经加载完成，立即执行
        tryHideSkeleton();
    }
}

// ========== 隐藏骨架屏 ==========
function hideSkeleton() {
    const skeleton = document.getElementById('skeleton-screen');
    const actualContent = document.getElementById('actual-content');

    // 隐藏骨架屏
    if (skeleton) {
        // 先停止所有骨架屏动画，节省资源
        skeleton.querySelectorAll('.skeleton').forEach(el => {
            el.style.animation = 'none';
        });

        skeleton.style.opacity = '0';
        skeleton.style.visibility = 'hidden';
        // 延迟移除DOM，等待过渡完成
        setTimeout(() => {
            skeleton.style.display = 'none';
        }, 200);
    }

    // 显示实际内容
    if (actualContent) {
        // 移除初始隐藏类
        actualContent.classList.remove('content-initial-hidden');
        // 添加可见类（用于过渡动画）
        actualContent.classList.add('content-visible');
        // 更新 ARIA 状态
        actualContent.setAttribute('aria-busy', 'false');
    }

    // 移除骨架屏激活状态（恢复交互元素）
    document.body.classList.remove('skeleton-active');
}

// ========== 懒加载动画（Intersection Observer） ==========
function initLazyLoad() {
    if (!('IntersectionObserver' in window)) {
        // 不支持 Intersection Observer 则直接显示所有内容
        document.querySelectorAll('.lazy-load').forEach(el => {
            el.classList.add('visible');
        });
        return;
    }

    const lazyElements = document.querySelectorAll('.lazy-load');
    
    const lazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const element = entry.target;
                element.classList.add('visible');
                lazyObserver.unobserve(element);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '50px'
    });

    lazyElements.forEach(el => lazyObserver.observe(el));
}

// ========== 渐进式图片加载 ==========
function initProgressiveImage() {
    const avatarImg = document.getElementById('avatar-img');
    const avatarPlaceholder = document.getElementById('avatar-placeholder');
    
    if (!avatarImg || !avatarPlaceholder) return;

    // 如果图片已缓存完成，直接移除占位
    if (avatarImg.complete && avatarImg.naturalHeight !== 0) {
        avatarImg.classList.add('loaded');
        avatarPlaceholder.classList.add('loaded');
        avatarImg.removeAttribute('data-blur');
        return;
    }

    // 监听图片加载完成
    avatarImg.addEventListener('load', () => {
        avatarImg.classList.add('loaded');
        avatarPlaceholder.classList.add('loaded');
        // 移除模糊效果
        setTimeout(() => {
            avatarImg.removeAttribute('data-blur');
        }, 300);
    });

    // 监听图片加载失败
    avatarImg.addEventListener('error', () => {
        avatarPlaceholder.classList.add('loaded');
        avatarImg.removeAttribute('data-blur');
        // 添加 fallback 类显示占位样式
        avatarPlaceholder.classList.add('fallback');
        avatarImg.classList.add('error');
    });
}

// ========== 名人语录状态管理 ==========
let currentQuoteIndex = 0;
let typingTimeout = null;
let deleteTimeout = null;
let animationRunning = false;
let isPageVisible = true;
let savedQuoteState = null; // 保存中断时的状态
const pendingTimeouts = [];

// ========== 清理所有定时器 ==========
function clearAllTimeouts() {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
    if (deleteTimeout) {
        clearTimeout(deleteTimeout);
        deleteTimeout = null;
    }
    pendingTimeouts.forEach(t => clearTimeout(t));
    pendingTimeouts.length = 0;
}

// ========== 安全设置定时器（统一管理）==========
function safeSetTimeout(callback, delay) {
    const timeoutId = setTimeout(callback, delay);
    pendingTimeouts.push(timeoutId);
    return timeoutId;
}

// ========== 移除已完成的定时器ID ==========
function removeTimeout(timeoutId) {
    const index = pendingTimeouts.indexOf(timeoutId);
    if (index > -1) {
        pendingTimeouts.splice(index, 1);
    }
}

// ========== 初始化动画 ==========
function initAnimations() {
    const config = window.HOMEPAGE_CONFIG;

    // 延迟启动语录循环
    safeSetTimeout(() => {
        startQuoteCycle(config);
    }, config.animation.fadeInDelay);
}

// ========== 语录循环打字机效果 ==========
function startQuoteCycle(config) {
    if (!isPageVisible || animationRunning) {
        return;
    }
    
    const output = document.getElementById("quote-output");
    if (!output || !config.quotes || config.quotes.length === 0) return;

    animationRunning = true;

    // 创建光标元素（全局复用）
    if (!output.querySelector('.cursor-blink')) {
        const cursorBlink = document.createElement("span");
        cursorBlink.className = "cursor-blink";
        output.appendChild(cursorBlink);
    }

    // 显示光标
    showCursor(output);

    // 开始打字
    safeSetTimeout(() => {
        if (!isPageVisible) {
            animationRunning = false;
            return;
        }
        const quotes = config.quotes;
        typeQuote(output, quotes[currentQuoteIndex], config, () => {
            // 打字完成，显示光标
            showCursor(output);

            // 等待后开始删除
            safeSetTimeout(() => {
                if (!isPageVisible) {
                    animationRunning = false;
                    return;
                }
                deleteQuote(output, config, () => {
                    currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
                    // 继续循环
                    animationRunning = false;
                    startQuoteCycle(config);
                });
            }, config.animation.quoteDisplayTime || 4000);
        });
    }, 300);
}

// ========== 显示光标 ==========
function showCursor(output) {
    const cursor = output.querySelector('.cursor-blink');
    if (cursor) {
        cursor.style.opacity = '1';
    }
}

// ========== 隐藏光标 ==========
function hideCursor(output) {
    const cursor = output.querySelector('.cursor-blink');
    if (cursor) {
        cursor.style.opacity = '0';
    }
}

// ========== 打字效果 ==========
function typeQuote(output, text, config, callback) {
    if (!output) return;
    
    // 清空文本内容但保留光标元素
    const cursor = output.querySelector('.cursor-blink');
    output.textContent = text;
    if (cursor) output.appendChild(cursor);

    // 隐藏光标
    hideCursor(output);

    // 从 0 开始逐字显示
    let currentText = "";
    let i = 0;

    function type() {
        if (!isPageVisible) return;
        
        if (i < text.length) {
            currentText += text.charAt(i);
            // 保留光标元素
            output.textContent = currentText;
            if (cursor) output.appendChild(cursor);
            i++;
            typingTimeout = setTimeout(type, config.animation.typingSpeed);
        } else {
            // 打字完成
            if (callback) callback();
        }
    }
    type();
}

// ========== 删除效果 ==========
function deleteQuote(output, config, callback) {
    if (!output) return;
    
    const cursor = output.querySelector('.cursor-blink');
    const text = output.textContent;
    let i = text.length - 1;

    // 隐藏光标
    hideCursor(output);

    function erase() {
        if (!isPageVisible) return;
        
        if (i >= 0) {
            const currentText = text.substring(0, i);
            output.textContent = currentText;
            if (cursor) output.appendChild(cursor);
            i--;
            deleteTimeout = setTimeout(erase, config.animation.quoteDeleteSpeed);
        } else {
            // 删除完成，显示光标
            showCursor(output);

            // 短暂停顿
            safeSetTimeout(() => {
                if (callback) callback();
            }, 300);
        }
    }
    erase();
}

// ========== 保存当前打印状态 ==========
function saveQuoteState(output) {
    const cursor = output.querySelector('.cursor-blink');
    return {
        text: output.textContent,
        currentText: output.textContent,
        quoteIndex: currentQuoteIndex,
        cursorHtml: cursor ? cursor.outerHTML : null
    };
}

// ========== 恢复打印状态 ==========
function restoreQuoteState(output, state) {
    if (!state) return false;
    output.textContent = state.text;
    if (state.cursorHtml) {
        const cursor = output.querySelector('.cursor-blink');
        if (!cursor) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = state.cursorHtml;
            output.appendChild(tempDiv.firstChild);
        }
    }
    currentQuoteIndex = state.quoteIndex;
    return true;
}

// ========== 页面可见性变化时重置（避免堆积定时器）==========
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        isPageVisible = false;
        // 页面隐藏时保存当前状态
        const output = document.getElementById("quote-output");
        if (output && animationRunning) {
            savedQuoteState = saveQuoteState(output);
        }
        // 页面隐藏时清理所有定时器
        clearAllTimeouts();
        animationRunning = false;
    } else {
        // 页面恢复时
        isPageVisible = true;
        clearAllTimeouts();
        const config = window.HOMEPAGE_CONFIG;
        const output = document.getElementById("quote-output");
        if (output && config.quotes && config.quotes.length > 0) {
            // 尝试恢复之前的状态
            if (savedQuoteState && restoreQuoteState(output, savedQuoteState)) {
                // 恢复成功后继续动画
                savedQuoteState = null;
                safeSetTimeout(() => {
                    animationRunning = false;
                    startQuoteCycle(config);
                }, 300);
            } else {
                // 无法恢复则重新开始
                output.textContent = '';
                const cursor = output.querySelector('.cursor-blink');
                if (cursor) output.appendChild(cursor);
                safeSetTimeout(() => {
                    currentQuoteIndex = 0;
                    animationRunning = false;
                    startQuoteCycle(config);
                }, 300);
            }
        }
    }
});

// ========== 主题切换初始化 ==========
function initTheme() {
    if (typeof ThemeManager !== 'undefined') {
        ThemeManager.init();
    }
}

// ========== 全局效果模块 ==========
/**
 * CustomCursor - 自定义光标效果
 * 自动创建元素，全局可用
 */
class CustomCursor {
    constructor() {
        this.cursor = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.cursorX = 0;
        this.cursorY = 0;
        this.animationId = null;
    }

    init() {
        // 自动创建元素（如果不存在）
        this.cursor = document.querySelector('.cursor');
        if (!this.cursor) {
            this.cursor = document.createElement('div');
            this.cursor.className = 'cursor';
            document.body.appendChild(this.cursor);
        }

        this.bindEvents();
        this.animate();
    }

    bindEvents() {
        // 鼠标移动跟踪
        document.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });

        // 页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAnimation();
            } else {
                this.animate();
            }
        });

        // 鼠标离开/进入窗口
        document.addEventListener('mouseleave', () => {
            this.cursor.style.opacity = '0';
        });
        document.addEventListener('mouseenter', () => {
            this.cursor.style.opacity = '1';
        });

        // 可交互元素悬停效果
        const interactiveSelectors = 'a, button, input, textarea, [role="button"], [tabindex]';
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest(interactiveSelectors)) {
                this.cursor.classList.add('hover');
            } else {
                this.cursor.classList.remove('hover');
            }
        });
        document.addEventListener('mouseout', (e) => {
            if (e.target.closest(interactiveSelectors)) {
                this.cursor.classList.remove('hover');
            }
        });
    }

    animate() {
        this.cursorX += (this.mouseX - this.cursorX) * 0.15;
        this.cursorY += (this.mouseY - this.cursorY) * 0.15;
        this.cursor.style.transform = `translate(${this.cursorX - 10}px, ${this.cursorY - 10}px)`;
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
}

/**
 * GridParallax - 背景网格视差效果
 * 自动创建元素，全局可用
 */
class GridParallax {
    constructor() {
        this.gridBg = null;
    }

    init() {
        // 自动创建元素（如果不存在）
        this.gridBg = document.querySelector('.grid-bg');
        if (!this.gridBg) {
            this.gridBg = document.createElement('div');
            this.gridBg.className = 'grid-bg';
            document.body.insertBefore(this.gridBg, document.body.firstChild);
        }

        this.bindEvents();
    }

    bindEvents() {
        document.addEventListener('mousemove', (e) => {
            const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
            const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
            this.gridBg.style.transform = `perspective(500px) rotateX(60deg) translateY(${moveY}px) translateX(${moveX}px)`;
        });
    }
}

/**
 * ScrollProgress - 回到顶部按钮
 * 自动创建元素，全局可用
 */
class ScrollProgress {
    constructor(options = {}) {
        this.button = null;
        this.ringProgress = null;
        this.circumference = 0;
        this.showThreshold = options.showThreshold || 100;
        this.smoothScroll = options.smoothScroll !== false;
    }

    init() {
        // 自动创建元素（如果不存在）
        this.button = document.querySelector('.scroll-progress-btn');
        if (!this.button) {
            this.createButton();
        }
        this.bindEvents();
    }

    createButton() {
        const buttonSize = window.innerWidth <= 768 ? 44 : 48;
        const ringRadius = buttonSize <= 44 ? 20.2 : 22;
        this.circumference = 2 * Math.PI * ringRadius;

        // 创建按钮
        this.button = document.createElement('button');
        this.button.className = 'scroll-progress-btn';
        this.button.setAttribute('aria-label', '返回顶部');
        this.button.setAttribute('title', '返回顶部');

        // 创建 SVG
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'scroll-progress-btn__ring');
        svg.setAttribute('viewBox', `0 0 ${buttonSize} ${buttonSize}`);

        // 背景圆环
        const ringBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ringBg.setAttribute('class', 'scroll-progress-btn__ring-bg');
        ringBg.setAttribute('cx', buttonSize / 2);
        ringBg.setAttribute('cy', buttonSize / 2);
        ringBg.setAttribute('r', ringRadius);

        // 进度圆环
        this.ringProgress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.ringProgress.setAttribute('class', 'scroll-progress-btn__ring-progress');
        this.ringProgress.setAttribute('cx', buttonSize / 2);
        this.ringProgress.setAttribute('cy', buttonSize / 2);
        this.ringProgress.setAttribute('r', ringRadius);
        this.ringProgress.style.strokeDasharray = this.circumference;
        this.ringProgress.style.strokeDashoffset = this.circumference;

        svg.appendChild(ringBg);
        svg.appendChild(this.ringProgress);

        // 创建图标
        const icon = document.createElement('i');
        icon.className = 'scroll-progress-btn__icon fa-solid fa-chevron-up';

        this.button.appendChild(svg);
        this.button.appendChild(icon);
        document.body.appendChild(this.button);
    }

    bindEvents() {
        // 点击返回顶部
        this.button.addEventListener('click', () => {
            if (this.smoothScroll) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                window.scrollTo(0, 0);
            }
        });

        // 滚动事件
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    this.updateProgress();
                    this.updateVisibility();
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });

        // 窗口大小变化
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.handleResize(), 150);
        });
    }

    calculateProgress() {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight;
        const winHeight = window.innerHeight;
        const viewedContent = scrollTop + winHeight;
        return Math.min(viewedContent / docHeight, 1);
    }

    updateProgress() {
        if (!this.ringProgress) return;
        const progress = this.calculateProgress();
        const offset = this.circumference * (1 - progress);
        this.ringProgress.style.strokeDashoffset = offset;
    }

    updateVisibility() {
        if (window.scrollY > this.showThreshold) {
            this.button.classList.add('is-visible');
        } else {
            this.button.classList.remove('is-visible');
        }
    }

    handleResize() {
        const newSize = window.innerWidth <= 768 ? 44 : 48;
        const newRadius = newSize <= 44 ? 20.2 : 22;
        this.circumference = 2 * Math.PI * newRadius;

        const svg = this.button.querySelector('svg');
        svg.setAttribute('viewBox', `0 0 ${newSize} ${newSize}`);

        const circles = svg.querySelectorAll('circle');
        circles.forEach(circle => {
            circle.setAttribute('cx', newSize / 2);
            circle.setAttribute('cy', newSize / 2);
            circle.setAttribute('r', newRadius);
        });

        this.ringProgress.style.strokeDasharray = this.circumference;
        this.updateProgress();
    }
}

/**
 * ElementGlow - 元素光晕效果
 * 鼠标位置跟踪，用于 CSS 光晕效果
 */
class ElementGlow {
    constructor() {
        this.selectors = [
            '.link',
            '.project-card',
            '.rss-card-container',
            '.donation__btn'
        ];
    }

    init() {
        this.selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.addEventListener('mousemove', (e) => this.trackMouse(e, el));
            });
        });

        // 贡献图格子悬停动效
        document.querySelectorAll('.contribution-cell').forEach(cell => {
            cell.addEventListener('mouseenter', () => {
                cell.style.transform = 'scale(1.2)';
            });
            cell.addEventListener('mouseleave', () => {
                cell.style.transform = 'scale(1)';
            });
        });
    }

    trackMouse(e, element) {
        const rect = element.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        element.style.setProperty('--mouse-x', `${x}%`);
        element.style.setProperty('--mouse-y', `${y}%`);
    }
}

// ========== 全局效果统一初始化 ==========
function initGlobalEffects() {
    new CustomCursor().init();
    new GridParallax().init();
    new ScrollProgress().init();
    new ElementGlow().init();
}

// ========== 页面特定效果 ==========
function initInteractions() {
    // RSS 卡片自动翻转
    initRSSCardAutoFlip();
}

// ========== RSS卡片自动翻转控制 ==========
let rssFlipInterval = null;
let rssFlipCards = [];
let rssCurrentFlipIndex = 0;

function initRSSCardAutoFlip() {
    // 获取所有有背面内容的卡片容器
    rssFlipCards = Array.from(document.querySelectorAll('.rss-card-container')).filter(container => {
        return container.querySelector('.rss-article-back');
    });

    if (rssFlipCards.length === 0) return;

    // 启动自动翻转
    startAutoFlip();

    // 页面可见性变化时暂停/恢复
    document.addEventListener('visibilitychange', handleRSSVisibilityChange);
}

// 切换单张卡片的翻转状态
function toggleCardFlip(container) {
    const isFlipped = container.classList.toggle('flipped');

    // iOS WebKit 修复：手动控制卡片的显示/隐藏
    // 因为 backface-visibility 在某些 iOS 版本上不可靠
    const frontCard = container.querySelector('.rss-article:not(.rss-article-back)');
    const backCard = container.querySelector('.rss-article-back');

    if (frontCard && backCard) {
        if (isFlipped) {
            // 翻转后：隐藏正面，显示背面
            frontCard.style.visibility = 'hidden';
            frontCard.style.opacity = '0';
            backCard.style.visibility = 'visible';
            backCard.style.opacity = '1';
        } else {
            // 翻转前：显示正面，隐藏背面
            frontCard.style.visibility = 'visible';
            frontCard.style.opacity = '1';
            backCard.style.visibility = 'hidden';
            backCard.style.opacity = '0';
        }
    }
}

// 启动自动翻转
function startAutoFlip() {
    if (rssFlipCards.length === 0) return;

    // 清除之前的定时器
    if (rssFlipInterval) {
        clearInterval(rssFlipInterval);
    }

    // 每6秒翻转一张卡片
    rssFlipInterval = setInterval(() => {
        if (document.hidden) return;

        // 顺序翻转每张卡片
        if (rssFlipCards[rssCurrentFlipIndex]) {
            toggleCardFlip(rssFlipCards[rssCurrentFlipIndex]);
        }

        // 移动到下一张卡片
        rssCurrentFlipIndex = (rssCurrentFlipIndex + 1) % rssFlipCards.length;
    }, 6000);
}

// 页面可见性变化处理
function handleRSSVisibilityChange() {
    if (document.hidden) {
        // 页面隐藏时停止自动翻转
        if (rssFlipInterval) {
            clearInterval(rssFlipInterval);
            rssFlipInterval = null;
        }
    } else {
        // 页面可见时恢复自动翻转
        startAutoFlip();
    }
}

// ========== 项目轮播 ==========
class ProjectsCarousel {
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.track = wrapper.querySelector('.carousel-track');
        this.originalCards = Array.from(this.track.querySelectorAll('.project-card-mini'));
        this.totalCards = this.originalCards.length;

        // 单卡片滚动 + 无缝循环
        this.currentIndex = 0;
        this.autoplayInterval = null;
        this.autoplayDelay = 4000;
        this.isPaused = false;
        this.isTransitioning = false;
        this.cardWidth = 0;
        this.gap = 12;

        // 检查是否启用减少动画
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.init();
    }

    init() {
        if (this.totalCards <= 1) {
            this.hideIndicators();
            return;
        }

        // 克隆首尾卡片实现无缝循环
        this.cloneCards();

        // 计算卡片宽度
        this.calculateCardWidth();

        // 设置初始位置（从第一个真正的卡片开始，跳过克隆卡片）
        this.currentIndex = this.indexOffset;
        this.updateTrackPosition(false);

        // 绑定事件
        this.bindEvents();

        // 更新指示器
        this.updateIndicators(0);

        // 开始自动播放
        this.startAutoplay();
    }

    cloneCards() {
        // 无缝轮播的关键：
        // 1. 末尾克隆足够多的卡片，确保最后一张真实卡片后面有 visibleCards 张克隆卡片
        // 2. 开头克隆足够多的卡片，确保第一张真实卡片前面有 visibleCards 张克隆卡片
        // 这样无论滚动到哪里，都有卡片预先准备好，实现真正的无缝循环

        const visibleCards = this.calculateVisibleCards();

        // 在末尾克隆前 visibleCards 张卡片
        // 这样当显示最后一张真实卡片时，右边已经有克隆卡片准备好
        for (let i = 0; i < visibleCards; i++) {
            const clone = this.originalCards[i % this.totalCards].cloneNode(true);
            clone.classList.add('carousel-clone');
            clone.dataset.cloneIndex = i;
            this.track.appendChild(clone);
        }

        // 在开头克隆后 visibleCards 张卡片（逆序插入）
        // 这样当显示第一张真实卡片时，左边已经有克隆卡片准备好
        for (let i = 0; i < visibleCards; i++) {
            const originalIndex = this.totalCards - 1 - (i % this.totalCards);
            const clone = this.originalCards[originalIndex].cloneNode(true);
            clone.classList.add('carousel-clone');
            clone.dataset.cloneIndex = -(i + 1);
            this.track.insertBefore(clone, this.track.firstChild);
        }

        // 更新卡片列表
        this.allCards = Array.from(this.track.querySelectorAll('.project-card-mini'));
        // 索引偏移：因为我们添加了 visibleCards 张克隆卡片在开头
        this.indexOffset = visibleCards;
        this.visibleCards = visibleCards;
    }

    calculateVisibleCards() {
        // 根据视口宽度决定可见卡片数（不使用容器宽度，因为容器有 max-width 限制）
        const viewportWidth = window.innerWidth;
        
        // 移动端显示2张，平板/PC显示3张
        if (viewportWidth <= 600) {
            return 2;
        } else {
            return 3;
        }
    }

    calculateCardWidth() {
        // 计算基于可见区域的卡片宽度
        const wrapperStyle = getComputedStyle(this.wrapper);
        const paddingLeft = parseFloat(wrapperStyle.paddingLeft);
        const paddingRight = parseFloat(wrapperStyle.paddingRight);
        const wrapperFullWidth = this.wrapper.offsetWidth;
        const wrapperContentWidth = wrapperFullWidth - paddingLeft - paddingRight;
        const gap = 12;

        // 使用已计算的 visibleCards
        const visibleCards = this.visibleCards || 3;
        const totalGapWidth = (visibleCards - 1) * gap;
        const cardWidth = (wrapperContentWidth - totalGapWidth) / visibleCards;

        // 设置所有卡片宽度
        this.allCards.forEach(card => {
            card.style.width = `${cardWidth}px`;
            card.style.minWidth = `${cardWidth}px`;
            card.style.maxWidth = `${cardWidth}px`;
        });

        this.cardWidth = cardWidth;
        this.gap = gap;
    }

    bindEvents() {
        // 悬停暂停
        this.wrapper.addEventListener('mouseenter', () => this.pause());
        this.wrapper.addEventListener('mouseleave', () => this.resume());

        // 监听过渡结束，处理无缝循环跳转
        this.track.addEventListener('transitionend', () => {
            this.handleTransitionEnd();
        });

        // 触摸滑动支持
        this.initTouchSwipe();

        // 页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAutoplay();
            } else if (!this.prefersReducedMotion) {
                this.startAutoplay();
            }
        });

        // 窗口大小变化
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.visibleCards = this.calculateVisibleCards();
                this.calculateCardWidth();
                this.updateTrackPosition(false);
            }, 150);
        });
    }

    initTouchSwipe() {
        let startX = 0;
        let isDragging = false;

        this.track.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
        }, { passive: true });

        this.track.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const diffX = Math.abs(e.touches[0].clientX - startX);
            const diffY = Math.abs(e.touches[0].clientY - startX);
            if (diffX > diffY && diffX > 10) {
                e.preventDefault();
            }
        }, { passive: false });

        this.track.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;

            const diffX = e.changedTouches[0].clientX - startX;
            if (Math.abs(diffX) > 50) {
                if (diffX < 0) {
                    this.next();
                } else {
                    this.prev();
                }
            }
        }, { passive: true });
    }

    next() {
        if (this.isTransitioning) return;
        this.goToIndex(this.currentIndex + 1);
    }

    prev() {
        if (this.isTransitioning) return;
        this.goToIndex(this.currentIndex - 1);
    }

    goToIndex(targetIndex) {
        if (this.isTransitioning) return;

        this.isTransitioning = true;
        this.currentIndex = targetIndex;

        // 正常滑动到目标位置
        this.updateTrackPosition(true);

        // 更新指示器（显示原始索引）
        const displayIndex = this.getDisplayIndex();
        this.updateIndicators(displayIndex);

        this.restartAutoplay();
    }

    handleTransitionEnd() {
        // 无缝循环跳转逻辑
        // 当到达边界克隆区域时，瞬间跳转到对应的真实卡片位置

        // 计算边界索引
        const firstRealIndex = this.indexOffset; // 第一张真实卡片的索引
        const lastRealIndex = this.indexOffset + this.totalCards - 1; // 最后一张真实卡片的索引

        if (this.currentIndex > lastRealIndex) {
            // 向左滑动超过了最后一张真实卡片，跳转到开头的对应位置
            // 例如：currentIndex = lastRealIndex + 1 应该跳转到 firstRealIndex
            this.currentIndex = firstRealIndex + (this.currentIndex - lastRealIndex - 1);
            this.updateTrackPosition(false);
        } else if (this.currentIndex < firstRealIndex) {
            // 向右滑动超过了第一张真实卡片，跳转到末尾的对应位置
            // 例如：currentIndex = firstRealIndex - 1 应该跳转到 lastRealIndex
            this.currentIndex = lastRealIndex - (firstRealIndex - this.currentIndex - 1);
            this.updateTrackPosition(false);
        }

        this.isTransitioning = false;

        // 更新指示器
        const displayIndex = this.getDisplayIndex();
        this.updateIndicators(displayIndex);
    }

    getDisplayIndex() {
        // 将内部索引转换为显示索引（0 到 totalCards-1）
        let displayIndex = this.currentIndex - this.indexOffset;
        if (displayIndex < 0) displayIndex = this.totalCards - 1;
        if (displayIndex >= this.totalCards) displayIndex = 0;
        return displayIndex;
    }

    updateTrackPosition(animate) {
        const offset = this.currentIndex * (this.cardWidth + this.gap);

        if (animate && !this.prefersReducedMotion) {
            this.track.classList.remove('no-transition');
        } else {
            this.track.classList.add('no-transition');
        }

        this.track.style.transform = `translateX(-${offset}px)`;
    }

    updateIndicators(activeIndex = 0) {
        const indicatorsContainer = this.wrapper.querySelector('.carousel-indicators');
        if (!indicatorsContainer) return;

        // 如果指示器数量不匹配，重新生成
        if (indicatorsContainer.children.length !== this.totalCards) {
            while (indicatorsContainer.firstChild) {
                indicatorsContainer.removeChild(indicatorsContainer.firstChild);
            }

            for (let i = 0; i < this.totalCards; i++) {
                const indicator = document.createElement('button');
                indicator.className = `carousel-indicator${i === activeIndex ? ' active' : ''}`;
                indicator.setAttribute('role', 'tab');
                indicator.setAttribute('aria-selected', i === activeIndex);
                indicator.setAttribute('aria-label', `查看项目 ${i + 1}`);
                indicator.addEventListener('click', () => {
                    if (!this.isTransitioning) {
                        // 点击指示器时，跳转到对应的真正卡片
                        this.goToIndex(i + this.indexOffset);
                    }
                });
                indicatorsContainer.appendChild(indicator);
            }
        } else {
            // 只更新active状态
            const indicators = indicatorsContainer.querySelectorAll('.carousel-indicator');
            indicators.forEach((ind, idx) => {
                ind.classList.toggle('active', idx === activeIndex);
                ind.setAttribute('aria-selected', idx === activeIndex);
            });
        }
    }

    hideIndicators() {
        const indicators = this.wrapper.querySelector('.carousel-indicators');
        if (indicators) indicators.style.display = 'none';
    }

    startAutoplay() {
        if (this.autoplayInterval || this.totalCards <= 1 || this.prefersReducedMotion) return;
        this.isPaused = false;
        this.autoplayInterval = setInterval(() => {
            if (!this.isPaused) {
                this.next();
            }
        }, this.autoplayDelay);
    }

    stopAutoplay() {
        if (this.autoplayInterval) {
            clearInterval(this.autoplayInterval);
            this.autoplayInterval = null;
        }
    }

    restartAutoplay() {
        this.stopAutoplay();
        this.startAutoplay();
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }

    // 公共API方法
    goTo(index) {
        if (index < 0 || index >= this.totalCards || this.isTransitioning) return;
        this.goToIndex(index + this.indexOffset);
    }

    stop() {
        this.stopAutoplay();
        this.isPaused = true;
    }

    play() {
        if (!this.prefersReducedMotion) {
            this.isPaused = false;
            this.startAutoplay();
        }
    }
}

// 初始化所有轮播
function initProjectsCarousel() {
    const wrappers = document.querySelectorAll('.projects-carousel-wrapper');
    const carousels = [];
    wrappers.forEach(wrapper => {
        const carousel = new ProjectsCarousel(wrapper);
        carousels.push(carousel);
    });

    // 暴露到全局以便外部控制
    if (typeof window !== 'undefined') {
        window.ProjectsCarousels = carousels;
    }
}

// ========== RSS 卡片初始化（简化版）==========
function initRssFlipCarousel() {
    // RSS卡片已简化为静态布局，无需复杂的翻转逻辑
    // 鼠标跟踪光晕效果已在initInteractions中处理
}

// ========== 音乐播放器模块 ==========
/**
 * MusicPlayer - 简约音乐播放器组件
 * 支持 Meting API (带备用API) 和本地音乐播放
 */
class MusicPlayer {
    constructor(config) {
        this.config = config;
        this.audio = new Audio();
        this.playlist = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.isLoading = false;
        this.playMode = config.playMode || 'list'; // list, one, random

        // DOM 元素
        this.elements = {};

        // 初始化
        this.init();
    }

    init() {
        // 获取 DOM 元素
        this.elements = {
            player: document.getElementById('music-player'),
            playBtn: document.getElementById('music-play'),
            playIcon: document.getElementById('music-play-icon'),
            prevBtn: document.getElementById('music-prev'),
            nextBtn: document.getElementById('music-next'),
            progressFill: document.getElementById('music-progress-fill'),
        };

        if (!this.elements.player) return;

        // 设置初始音量
        this.audio.volume = this.config.volume || 0.5;

        // 绑定事件
        this.bindEvents();

        // 根据模式加载播放列表
        if (this.config.mode === 'meting') {
            this.loadMetingPlaylist();
        } else if (this.config.mode === 'local') {
            this.loadLocalPlaylist();
        }
    }

    bindEvents() {
        // 播放/暂停
        this.elements.playBtn?.addEventListener('click', () => this.togglePlay());

        // 上一曲/下一曲
        this.elements.prevBtn?.addEventListener('click', () => this.prev());
        this.elements.nextBtn?.addEventListener('click', () => this.next());

        // 音频事件
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.onEnded());
        this.audio.addEventListener('play', () => this.onPlay());
        this.audio.addEventListener('pause', () => this.onPause());
        this.audio.addEventListener('waiting', () => this.setLoading(true));
        this.audio.addEventListener('canplay', () => this.setLoading(false));
        this.audio.addEventListener('error', (e) => this.onError(e));
    }

    // 加载 Meting 播放列表（支持备用 API）
    async loadMetingPlaylist() {
        const { meting } = this.config;
        if (!meting || !meting.id) {
            console.warn('MoeWah Music: 未配置歌单 ID');
            return;
        }

        this.setLoading(true);

        // 获取 API 列表
        const apis = meting.apis || [];
        if (apis.length === 0) {
            console.warn('MoeWah Music: 未配置 API');
            this.setLoading(false);
            return;
        }

        // 尝试每个 API
        for (let i = 0; i < apis.length; i++) {
            const apiUrl = apis[i]
                .replace(':server', meting.server)
                .replace(':type', meting.type)
                .replace(':id', meting.id);

            try {
                const url = apiUrl + (apiUrl.includes('?') ? '&' : '?') + 'r=' + Math.random();
                const response = await fetch(url);
                const data = await response.json();

                if (Array.isArray(data) && data.length > 0) {
                    this.playlist = data.map(song => song.url).filter(Boolean);

                    if (this.playlist.length > 0) {
                        this.currentIndex = 0;
                        console.log(`MoeWah Music: 成功加载 ${this.playlist.length} 首歌曲 (API ${i + 1})`);

                        if (this.config.autoplay) {
                            this.play();
                        }
                        this.setLoading(false);
                        return;
                    }
                }
            } catch (error) {
                console.warn(`MoeWah Music: API ${i + 1} 失败`, error.message);
            }
        }

        console.error('MoeWah Music: 所有 API 都失败了');
        this.setLoading(false);
    }

    // 加载本地播放列表（URL 数组）
    loadLocalPlaylist() {
        const { local } = this.config;
        if (!local || !Array.isArray(local) || local.length === 0) {
            console.warn('MoeWah Music: 未配置本地音乐');
            return;
        }

        this.playlist = local.filter(url => typeof url === 'string' && url.trim());
        this.currentIndex = 0;

        if (this.playlist.length > 0) {
            console.log(`MoeWah Music: 成功加载 ${this.playlist.length} 首本地音乐`);

            if (this.config.autoplay) {
                this.play();
            }
        }
    }

    // 播放控制
    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (this.playlist.length === 0) return;

        const url = this.playlist[this.currentIndex];
        if (!url) {
            this.next();
            return;
        }

        this.audio.src = url;
        this.audio.play().catch(err => {
            if (err.name === 'NotAllowedError') {
                this.onPause();
            }
        });
    }

    pause() {
        this.audio.pause();
    }

    prev() {
        if (this.playlist.length === 0) return;

        if (this.playMode === 'random') {
            this.currentIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        }

        if (this.isPlaying) {
            this.play();
        }
    }

    next() {
        if (this.playlist.length === 0) return;

        if (this.playMode === 'random') {
            this.currentIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        }

        if (this.isPlaying) {
            this.play();
        }
    }

    updateProgress() {
        if (this.audio.duration && this.elements.progressFill) {
            const progress = (this.audio.currentTime / this.audio.duration) * 100;
            this.elements.progressFill.style.width = `${progress}%`;
        }
    }

    onPlay() {
        this.isPlaying = true;
        this.elements.playBtn?.classList.add('playing');
        if (this.elements.playIcon) {
            this.elements.playIcon.className = 'fa-solid fa-pause';
        }
        // 头像呼吸光晕效果
        document.querySelector('.avatar')?.classList.add('music-playing');
    }

    onPause() {
        this.isPlaying = false;
        this.elements.playBtn?.classList.remove('playing');
        if (this.elements.playIcon) {
            this.elements.playIcon.className = 'fa-solid fa-play';
        }
        // 移除头像呼吸光晕效果
        document.querySelector('.avatar')?.classList.remove('music-playing');
    }

    onEnded() {
        if (this.playMode === 'one') {
            this.play();
        } else {
            this.next();
        }
    }

    onError() {
        this.setLoading(false);
        setTimeout(() => this.next(), 1000);
    }

    setLoading(loading) {
        this.isLoading = loading;
    }
}

// 初始化音乐播放器
function initMusicPlayer() {
    const toggleBtn = document.getElementById('music-toggle');
    const musicArea = document.getElementById('music-area');
    const playerEl = document.getElementById('music-player');

    // 如果没有切换按钮，说明音乐功能未启用
    if (!toggleBtn || !musicArea) return;

    // 音乐播放器实例（延迟初始化）
    let musicPlayerInstance = null;
    let isExpanded = false;

    // 切换展开/收起（分割线 <-> 音乐播放器）
    const toggleExpand = () => {
        isExpanded = !isExpanded;

        // 更新展开状态（在 music-area 上切换类名）
        musicArea.classList.toggle('is-expanded', isExpanded);
        toggleBtn.classList.toggle('is-active', isExpanded);
        toggleBtn.setAttribute('aria-expanded', isExpanded);

        // 首次展开时初始化播放器
        if (isExpanded && !musicPlayerInstance && playerEl) {
            const configAttr = playerEl.dataset.config;
            if (configAttr) {
                try {
                    const config = JSON.parse(configAttr);
                    musicPlayerInstance = new MusicPlayer(config);
                } catch (e) {
                    console.error('MoeWah Music: 配置解析失败', e);
                }
            }
        }

        // 注意：收起时不再暂停播放，音乐控制仅由三个控制按钮管理
        // 用户可以通过播放控制按钮来暂停/继续播放
    };

    // 绑定切换事件
    toggleBtn.addEventListener('click', toggleExpand);

    // 键盘支持
    toggleBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpand();
        }
    });
}

// ========== 动态页面初始化 ==========
function initMoments() {
    // 防止重复初始化
    if (window.__momentsInitialized) {
        console.log('Moments: 已经初始化，跳过');
        return;
    }
    window.__momentsInitialized = true;

    const momentsFeed = document.getElementById('moments-feed');
    if (!momentsFeed) return; // 不在动态页面

    const config = window.HOMEPAGE_CONFIG?.moments;
    if (!config || !config.enabled || !config.memosUrl) {
        console.warn('Moments: 未启用或缺少配置');
        return;
    }

    // MomentsFeed 类由 moments.js 提供
    if (typeof MomentsFeed === 'function') {
        const feed = new MomentsFeed(config);
        feed.init();
    } else {
        console.warn('Moments: MomentsFeed 类未加载');
    }
}

// ========== 页面加载完成后初始化 ==========
document.addEventListener("DOMContentLoaded", initPage);
