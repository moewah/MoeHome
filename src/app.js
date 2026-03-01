/**
 * MoeWah Homepage - Main Application
 * 个人主页主逻辑文件（仅保留动态交互部分）
 */

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

    // 初始化交互效果
    initInteractions();
}

// ========== 导航栏初始化 ==========
function initNavbar() {
    initNavbarScroll();
    initNavbarBrandEffect();
    initNavbarActiveSection();
    initNavbarThemeSwitcher();
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

// 品牌区打字机效果
function initNavbarBrandEffect() {
    const brand = document.getElementById('navbar-brand');
    if (!brand) return;

    const nameEl = brand.querySelector('.brand-name');
    const promptEl = brand.querySelector('.prompt');
    if (!nameEl) return;

    const config = window.HOMEPAGE_CONFIG;
    const originalName = config?.profile?.name || 'MoeWah';
    const hoverText = config?.nav?.brand?.hoverText || '~/whoami';

    let typingInterval = null;
    let isHovering = false;

    const startTypewriter = () => {
        if (isHovering) return;
        isHovering = true;

        // 打字机效果
        let i = 0;
        nameEl.textContent = '';

        // 清除之前的定时器
        if (typingInterval) {
            clearInterval(typingInterval);
            typingInterval = null;
        }

        typingInterval = setInterval(() => {
            if (i < hoverText.length) {
                nameEl.textContent += hoverText.charAt(i);
                i++;
            } else {
                clearInterval(typingInterval);
                typingInterval = null;
            }
        }, 80);
    };

    const stopTypewriter = () => {
        isHovering = false;

        if (typingInterval) {
            clearInterval(typingInterval);
            typingInterval = null;
        }
        nameEl.textContent = originalName;
    };

    // 为整个品牌区添加 hover 事件
    brand.addEventListener('mouseenter', startTypewriter);
    brand.addEventListener('mouseleave', stopTypewriter);

    // 点击回到顶部
    brand.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// 当前区域高亮（Intersection Observer + 滚动检测）
function initNavbarActiveSection() {
    const navLinks = document.querySelectorAll('.nav-link, .nav-sidebar-link');
    if (navLinks.length === 0) return;

    const sections = document.querySelectorAll('#actual-content, #rss-section, #projects-section, #links-container');
    if (sections.length === 0) return;

    // 更新导航高亮状态
    function updateActiveNav(sectionId) {
        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.section === sectionId);
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
        // 如果在页面顶部，强制高亮 Home
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
            const targetSection = link.dataset.section;
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

// 导航栏主题切换（点击循环切换）
function initNavbarThemeSwitcher() {
    const toggle = document.getElementById('nav-theme-toggle');
    const mobileThemeBtn = document.getElementById('nav-sidebar-theme');

    // PC 端主题循环切换
    if (toggle) {
        toggle.addEventListener('click', () => {
            if (typeof ThemeManager !== 'undefined') {
                const newTheme = ThemeManager.toggle();
                updateThemeToggleIcon(newTheme);
            }
        });
    }

    // 移动端主题循环切换
    if (mobileThemeBtn) {
        mobileThemeBtn.addEventListener('click', () => {
            if (typeof ThemeManager !== 'undefined') {
                const newTheme = ThemeManager.toggle();
                updateThemeToggleIcon(newTheme);
            }
        });
    }

    // 初始化图标状态
    if (typeof ThemeManager !== 'undefined') {
        updateThemeToggleIcon(ThemeManager.getSavedTheme());
    }
}

// 更新主题切换按钮图标
function updateThemeToggleIcon(theme) {
    const toggle = document.getElementById('nav-theme-toggle');
    const mobileToggle = document.getElementById('nav-sidebar-theme');

    const iconMap = {
        auto: 'fa-solid fa-desktop',
        light: 'fa-solid fa-sun',
        dark: 'fa-solid fa-moon'
    };

    const iconClass = iconMap[theme] || 'fa-solid fa-desktop';

    // PC 端图标
    if (toggle) {
        const icon = toggle.querySelector('i');
        if (icon) {
            icon.className = iconClass;
        }
    }

    // 移动端侧边栏图标
    if (mobileToggle) {
        const icon = mobileToggle.querySelector('i');
        if (icon) {
            icon.className = iconClass;
        }
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
        overlay.classList.remove('active');
        document.body.style.overflow = '';
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
}

// 自定义菜单交互
function initCustomMenus() {
    // 桌面端 hover 展开已在 CSS 中处理
    // 移动端点击展开在 initMobileSidebar 中处理
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
    const MIN_SKELETON_TIME = 500;
    const startTime = performance.now();

    // 等待页面资源加载完成
    window.addEventListener('load', () => {
        // 计算已过时间，确保骨架屏至少显示 MIN_SKELETON_TIME
        const elapsed = performance.now() - startTime;
        const remainingTime = Math.max(0, MIN_SKELETON_TIME - elapsed);

        // 延迟隐藏骨架屏，确保用户能看到加载动画
        setTimeout(() => {
            hideSkeleton();
        }, remainingTime);

        // 初始化懒加载动画
        initLazyLoad();

        // 初始化渐进式图片加载
        initProgressiveImage();
    });
}

// ========== 隐藏骨架屏 ==========
function hideSkeleton() {
    const skeleton = document.getElementById('skeleton-screen');
    const actualContent = document.getElementById('actual-content');

    // 隐藏骨架屏
    if (skeleton) {
        skeleton.style.opacity = '0';
        skeleton.style.visibility = 'hidden';
        // 延迟移除DOM，等待过渡完成
        setTimeout(() => {
            skeleton.style.display = 'none';
        }, 300);
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
    
    const config = window.HOMEPAGE_CONFIG;
    if (config?.themeSwitcher?.enabled && config.themeSwitcher.showToggle) {
        initThemeSwitcher();
    }
}

// ========== 主题切换器初始化 ==========
function initThemeSwitcher() {
    const toggle = document.querySelector('.theme-toggle');
    const menu = document.querySelector('.theme-menu');
    
    if (!toggle || !menu) return;
    
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('open');
    });
    
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !toggle.contains(e.target)) {
            menu.classList.remove('open');
        }
    });
    
    const items = menu.querySelectorAll('.theme-menu-item');
    items.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const theme = item.dataset.theme;
            if (typeof ThemeManager !== 'undefined' && theme) {
                ThemeManager.setSavedTheme(theme);
                updateThemeMenuActive(theme);
                menu.classList.remove('open');
            }
        });
    });
    
    updateThemeMenuActive(ThemeManager?.getSavedTheme?.() || 'auto');
}

// ========== 更新主题菜单激活状态 ==========
function updateThemeMenuActive(theme) {
    const items = document.querySelectorAll('.theme-menu-item');
    items.forEach(item => {
        item.classList.toggle('active', item.dataset.theme === theme);
    });
    
    const toggle = document.querySelector('.theme-toggle');
    if (toggle) {
        const icon = toggle.querySelector('i');
        if (icon) {
            icon.className = 'fa-solid fa-circle-half-stroke';
        }
    }
}

// ========== 自定义光标 ==========
function initInteractions() {
    const cursor = document.querySelector(".cursor");
    let mouseX = 0, mouseY = 0;
    let cursorX = 0, cursorY = 0;
    let cursorAnimationId = null;

    document.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    function animateCursor() {
        cursorX += (mouseX - cursorX) * 0.15;
        cursorY += (mouseY - cursorY) * 0.15;
        cursor.style.transform = `translate(${cursorX - 10}px, ${cursorY - 10}px)`;
        cursorAnimationId = requestAnimationFrame(animateCursor);
    }
    animateCursor();

    // 页面可见性变化时停止/重启光标动画
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            if (cursorAnimationId) {
                cancelAnimationFrame(cursorAnimationId);
                cursorAnimationId = null;
            }
        } else {
            if (!cursorAnimationId && cursor) {
                animateCursor();
            }
        }
    });

    // 鼠标离开窗口隐藏光标
    document.addEventListener("mouseleave", () => {
        cursor.style.opacity = '0';
    });

    document.addEventListener("mouseenter", () => {
        cursor.style.opacity = '1';
    });

    // 可交互元素选择器
    const interactiveSelectors = 'a, button, input, textarea, [role="button"], [tabindex]';

    // 光标悬停效果
    document.addEventListener("mouseover", (e) => {
        if (e.target.closest(interactiveSelectors)) {
            cursor.classList.add("hover");
        } else {
            cursor.classList.remove("hover");
        }
    });

    document.addEventListener("mouseout", (e) => {
        if (e.target.closest(interactiveSelectors)) {
            cursor.classList.remove("hover");
        }
    });

    // 生成粒子
    const particlesContainer = document.getElementById("particles");
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement("div");
        particle.className = "particle";
        particle.style.left = Math.random() * 100 + "%";
        particle.style.animationDelay = Math.random() * 15 + "s";
        particle.style.animationDuration = 15 + Math.random() * 10 + "s";
        particlesContainer.appendChild(particle);
    }

    // 视差效果
    document.addEventListener("mousemove", (e) => {
        const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
        const moveY = (e.clientY - window.innerHeight / 2) * 0.01;

        const gridBg = document.querySelector(".grid-bg");
        if (gridBg) {
            gridBg.style.transform = `perspective(500px) rotateX(60deg) translateY(${moveY}px) translateX(${moveX}px)`;
        }
    });

    // 链接鼠标位置跟踪（用于光晕效果）
    document.querySelectorAll('.link').forEach(linkElement => {
        linkElement.addEventListener("mousemove", (e) => {
            const rect = linkElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            linkElement.style.setProperty("--mouse-x", `${x}%`);
            linkElement.style.setProperty("--mouse-y", `${y}%`);
        });
    });

    // 项目卡片鼠标位置跟踪（用于光晕效果）
    document.querySelectorAll('.project-card').forEach(cardElement => {
        cardElement.addEventListener("mousemove", (e) => {
            const rect = cardElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            cardElement.style.setProperty("--mouse-x", `${x}%`);
            cardElement.style.setProperty("--mouse-y", `${y}%`);
        });
    });

    // 贡献图格子悬停动效
    document.querySelectorAll('.contribution-cell').forEach(cell => {
        cell.addEventListener("mouseenter", () => {
            cell.style.transform = "scale(1.2)";
        });
        cell.addEventListener("mouseleave", () => {
            cell.style.transform = "scale(1)";
        });
    });

    // RSS 文章卡片鼠标位置跟踪（用于光晕效果）
    document.querySelectorAll('.rss-article').forEach(articleElement => {
        articleElement.addEventListener("mousemove", (e) => {
            const rect = articleElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            articleElement.style.setProperty("--mouse-x", `${x}%`);
            articleElement.style.setProperty("--mouse-y", `${y}%`);
        });
    });
}

// ========== 页面加载完成后初始化 ==========
document.addEventListener("DOMContentLoaded", initPage);
