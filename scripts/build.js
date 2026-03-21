/**
 * MoeWah Homepage - Build Script
 * 构建脚本：读取 config.js 生成完全静态化的 HTML
 */

const fs = require('fs');
const path = require('path');
const { getRSSArticles } = require('./rss-parser');
const { fetchUserRepos, parseGitHubUser, formatNumber } = require('./github-fetcher');
const { fetchUserContributions } = require('./contribution-fetcher');
const {
    getMinifyConfig,
    processJSFile,
    processCSSFile,
    processHTML,
    processInlineCSS,
    processInlineJS,
    processImageFile,
    isImage,
    formatSize,
    calcReduction,
    generateFavicon,
    minifyJS
} = require('./minify');

// 引入共享主题数据
const {
    THEME_CONSTANTS,
    builtinSchemes,
    deriveConfig,
    hexToRgb,
    darkenColor,
    getSchemeColors,
    isSchemeCompatible,
    getDefaultColors,
    buildCSSVariablesArray,
    buildStyleString,
    getInlineScriptHelpers
} = require('../src/theme-data.js');

// 压缩配置
const minifyConfig = getMinifyConfig();

// 定义路径
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const templatesDir = path.join(rootDir, 'templates');
const partialsDir = path.join(templatesDir, 'partials');

/**
 * 读取 partial 模板
 * @param {string} name - partial 名称（不含扩展名）
 * @returns {string} partial 内容
 */
function readPartial(name) {
    const partialPath = path.join(partialsDir, `${name}.html`);
    if (!fs.existsSync(partialPath)) {
        console.warn(`⚠️ 找不到 partial: ${name}.html`);
        return '';
    }
    return fs.readFileSync(partialPath, 'utf8');
}

/**
 * 渲染 partials - 替换 {{> partialName}} 为对应 partial 内容
 * @param {string} content - 模板内容
 * @returns {string} 渲染后的内容
 */
function renderPartials(content) {
    return content.replace(/\{\{>\s*([\w-]+)\}\}/g, (match, name) => {
        return readPartial(name);
    });
}

/**
 * 生成导航链接 HTML（桌面端）
 * @param {object} options - 配置选项
 * @param {string} options.activePage - 当前页面标识（用于高亮）
 * @param {object} options.config - 配置对象
 * @returns {string} 导航链接 HTML
 */
function generateNavLinks(options) {
    const { activePage, config } = options;
    const links = [];
    const linkClass = 'nav-link';

    // 检查是否有独立页面（排除404，404永远不在菜单中显示）
    const hasMoments = config.moments && config.moments.enabled;
    const hasGuestbook = config.guestbook && config.guestbook.enabled;
    const hasStandalonePages = hasMoments || hasGuestbook;

    // 首页 - 固定图标
    const homeActive = activePage === 'home' ? ' active' : '';
    const homeIcon = '<i class="fa-solid fa-home"></i>';
    links.push(`<a href="/" class="${linkClass}${homeActive}">${homeIcon}<span>首页</span></a>`);

    if (hasStandalonePages) {
        // 有独立页面时：只显示首页和独立页面链接，不显示锚点链接
        // 动态页（Moments 启用时）
        if (hasMoments) {
            const momentsActive = activePage === 'moments' ? ' active' : '';
            const momentsIcon = `<i class="${config.pages?.moments?.icon || 'fa-solid fa-bolt'}"></i>`;
            links.push(`<a href="/moments/" class="${linkClass}${momentsActive}">${momentsIcon}<span>动态</span></a>`);
        }
        // 留言板（Guestbook 启用时）
        if (hasGuestbook) {
            const guestbookActive = activePage === 'guestbook' ? ' active' : '';
            const guestbookIcon = `<i class="${config.pages?.guestbook?.icon || 'fa-solid fa-comments'}"></i>`;
            links.push(`<a href="/guestbook/" class="${linkClass}${guestbookActive}">${guestbookIcon}<span>留言</span></a>`);
        }
    } else {
        // 只有 index 主页时：显示锚点链接（文章、项目、链接）
        // 图标从板块配置读取
        // 文章页（RSS 启用时）- 锚点链接
        if (config.rss && config.rss.enabled) {
            const postsActive = activePage === 'posts' ? ' active' : '';
            const postsIcon = `<i class="${config.rss?.titleIcon || 'fa-solid fa-newspaper'}"></i>`;
            links.push(`<a href="/#rss-section" class="${linkClass}${postsActive}">${postsIcon}<span>文章</span></a>`);
        }

        // 项目页（Projects 启用时）- 锚点链接
        if (config.projects && config.projects.enabled) {
            const projectsActive = activePage === 'projects' ? ' active' : '';
            const projectsIcon = `<i class="${config.projects?.titleIcon || 'fa-solid fa-folder-open'}"></i>`;
            links.push(`<a href="/#projects-section" class="${linkClass}${projectsActive}">${projectsIcon}<span>项目</span></a>`);
        }

        // 链接导航（Links 启用时）- 锚点链接
        if (config.linksConfig && config.linksConfig.enabled) {
            const linksActive = activePage === 'links' ? ' active' : '';
            const linksIcon = `<i class="${config.linksConfig?.titleIcon || 'fa-solid fa-link'}"></i>`;
            links.push(`<a href="/#links-container" class="${linkClass}${linksActive}">${linksIcon}<span>链接</span></a>`);
        }
    }

    // 自定义菜单
    if (config.nav && config.nav.menus && config.nav.menus.length > 0) {
        links.push(generateCustomMenusHTML(config.nav.menus));
    }

    return links.join('\n            ');
}

// 生成移动端导航下拉菜单链接（新样式）
function generateNavLinksMobileDropdown(options) {
    const { activePage, config } = options;
    const links = [];

    // 检查是否有独立页面
    const hasMoments = config.moments && config.moments.enabled;
    const hasGuestbook = config.guestbook && config.guestbook.enabled;
    const hasStandalonePages = hasMoments || hasGuestbook;

    // 首页 - 固定图标
    const homeActive = activePage === 'home' ? ' is-active' : '';
    links.push(`<a href="/" class="nav-mobile-link${homeActive}"><i class="fa-solid fa-home"></i><span>首页</span></a>`);

    if (hasStandalonePages) {
        // 动态页 - 从 pages 配置读取图标
        if (hasMoments) {
            const momentsActive = activePage === 'moments' ? ' is-active' : '';
            const momentsIcon = config.pages?.moments?.icon || 'fa-solid fa-bolt';
            links.push(`<a href="/moments/" class="nav-mobile-link${momentsActive}"><i class="${momentsIcon}"></i><span>动态</span></a>`);
        }
        // 留言板 - 从 pages 配置读取图标
        if (hasGuestbook) {
            const guestbookActive = activePage === 'guestbook' ? ' is-active' : '';
            const guestbookIcon = config.pages?.guestbook?.icon || 'fa-solid fa-comments';
            links.push(`<a href="/guestbook/" class="nav-mobile-link${guestbookActive}"><i class="${guestbookIcon}"></i><span>留言</span></a>`);
        }
    } else {
        // 锚点链接 - 从板块配置读取图标
        if (config.rss && config.rss.enabled) {
            const postsActive = activePage === 'posts' ? ' is-active' : '';
            const postsIcon = config.rss?.titleIcon || 'fa-solid fa-newspaper';
            links.push(`<a href="/#rss-section" class="nav-mobile-link${postsActive}"><i class="${postsIcon}"></i><span>文章</span></a>`);
        }
        if (config.projects && config.projects.enabled) {
            const projectsActive = activePage === 'projects' ? ' is-active' : '';
            const projectsIcon = config.projects?.titleIcon || 'fa-solid fa-folder-open';
            links.push(`<a href="/#projects-section" class="nav-mobile-link${projectsActive}"><i class="${projectsIcon}"></i><span>项目</span></a>`);
        }
        if (config.linksConfig && config.linksConfig.enabled) {
            const linksActive = activePage === 'links' ? ' is-active' : '';
            const linksIcon = config.linksConfig?.titleIcon || 'fa-solid fa-link';
            links.push(`<a href="/#links-container" class="nav-mobile-link${linksActive}"><i class="${linksIcon}"></i><span>链接</span></a>`);
        }
    }

    // 自定义菜单（下拉样式）
    if (config.nav && config.nav.menus && config.nav.menus.length > 0) {
        links.push(generateCustomMenusMobileDropdownHTML(config.nav.menus));
    }

    return links.join('\n            ');
}

// 清理 dist 目录
function cleanDist() {
    if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
        console.log('🧹 已清理 dist 目录');
    }
    fs.mkdirSync(distDir, { recursive: true });
}

// 读取配置文件
const configContent = fs.readFileSync(path.join(rootDir, 'src/config.js'), 'utf8');

/**
 * 提取字符串值 - 支持字符串内包含引号
 */
function extractString(pattern, fallback = '') {
    const match = configContent.match(pattern);
    if (match && match[1]) {
        return match[1].trim();
    }
    return fallback;
}

/**
 * 提取数组 - 支持字符串内包含引号
 * 正确处理：
 * - 字符串内的引号（如 "I'm"）
 * - 不同引号类型混用（单引号、双引号、反引号）
 * - 转义字符
 */
function extractArray(pattern, fallback = []) {
    const match = configContent.match(pattern);
    if (!match || !match[1]) {
        return fallback;
    }

    const arrayContent = match[1];
    const items = [];

    // 匹配三种引号类型，正确处理内部引号和转义
    // 双引号: "..." 或 "..."
    // 单引号: '...' 或 '...'
    // 反引号: `...`
    const stringPattern = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

    let stringMatch;
    while ((stringMatch = stringPattern.exec(arrayContent)) !== null) {
        const str = stringMatch[0];
        // 移除首尾引号
        const content = str.slice(1, -1);
        // 处理转义字符
        items.push(content.replace(/\\(['"`\\])/g, '$1').trim());
    }

    return items.length > 0 ? items : fallback;
}

/**
 * 提取嵌套字符串 - 支持字符串内包含引号
 * 正确处理转义字符和字符串内的引号
 */
function extractNestedString(parentPattern, key, fallback = '') {
    const parentMatch = configContent.match(parentPattern);
    if (!parentMatch || !parentMatch[1]) {
        return fallback;
    }

    const parentContent = parentMatch[1];

    // 使用更健壮的正则，匹配三种引号类型
    // 匹配 key: "..." 或 key: '...' 或 key: `...`
    const patterns = [
        new RegExp(key + ':\\s*"((?:[^"\\\\]|\\\\.)*)"'),  // 双引号
        new RegExp(key + ":\\s*'((?:[^'\\\\]|\\\\.)*)'"),  // 单引号
        new RegExp(key + ':\\s*`((?:[^`\\\\]|\\\\.)*)`'),  // 反引号
    ];

    for (const pattern of patterns) {
        const match = parentContent.match(pattern);
        if (match && match[1]) {
            // 处理转义字符
            return match[1].replace(/\\(['"`\\])/g, '$1').trim();
        }
    }

    return fallback;
}

/**
 * 提取嵌套布尔值
 */
function extractNestedBoolean(parentPattern, key, fallback = false) {
    const parentMatch = configContent.match(parentPattern);
    if (!parentMatch || !parentMatch[1]) {
        return fallback;
    }

    const parentContent = parentMatch[1];
    const match = parentContent.match(new RegExp(key + ':\\s*(true|false)'));
    if (match && match[1]) {
        return match[1] === 'true';
    }
    return fallback;
}

/**
 * 提取链接数组 - 支持字符串内包含引号
 * 使用健壮的字符串匹配，正确处理转义字符
 */
function extractLinks() {
    const linksMatch = configContent.match(/links:\s*\[([\s\S]*?)\n\s*\]/);
    if (!linksMatch) return [];

    const linksContent = linksMatch[1];
    const links = [];

    // 匹配每个链接对象 {...}
    const objectPattern = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;

    let objectMatch;
    while ((objectMatch = objectPattern.exec(linksContent)) !== null) {
        const objContent = objectMatch[1];

        // 使用健壮的字符串提取函数
        const name = extractStringValue(objContent, 'name');
        const description = extractStringValue(objContent, 'description');
        const url = extractStringValue(objContent, 'url');
        const icon = extractStringValue(objContent, 'icon');
        const brand = extractStringValue(objContent, 'brand');

        // 提取 external 布尔值
        const externalMatch = objContent.match(/external:\s*(true|false)/);
        const external = externalMatch ? externalMatch[1] === 'true' : true;

        // 提取 color 字段
        const color = extractStringValue(objContent, 'color') || '#00ff9f';

        // 提取 enabled 字段
        const enabledMatch = objContent.match(/enabled:\s*(true|false)/);
        const enabled = enabledMatch ? enabledMatch[1] === 'true' : true;

        // 提取 antiCrawler 字段（邮箱反爬虫保护）
        const antiCrawlerMatch = objContent.match(/antiCrawler:\s*(true|false)/);
        const antiCrawler = antiCrawlerMatch ? antiCrawlerMatch[1] === 'true' : true;

        if (name && url) {
            links.push({
                name,
                description: description || '',
                url,
                icon: icon || 'fa-solid fa-link',
                brand: brand || 'link',
                external,
                color,
                enabled,
                antiCrawler
            });
        }
    }

    return links;
}

/**
 * 从对象内容中提取字符串值 - 支持字符串内包含引号
 * @param {string} content - 对象内容
 * @param {string} key - 键名
 * @returns {string|null} - 提取的值或 null
 */
function extractStringValue(content, key) {
    // 匹配三种引号类型
    const patterns = [
        new RegExp(key + ':\\s*"((?:[^"\\\\]|\\\\.)*)"'),  // 双引号
        new RegExp(key + ":\\s*'((?:[^'\\\\]|\\\\.)*)'"),  // 单引号
        new RegExp(key + ':\\s*`((?:[^`\\\\]|\\\\.)*)`'),  // 反引号
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        // 修改：使用 match[1] !== undefined 而不是 match[1] 来支持空字符串
        if (match && match[1] !== undefined) {
            return match[1].replace(/\\(['"`\\])/g, '$1').trim();
        }
    }
    return null;
}

// 提取 LinksConfig 配置
function extractLinksConfig() {
    const configMatch = configContent.match(/linksConfig:\s*\{([\s\S]*?)\n\s*\},?\s*\n\s*\/\/ =/);
    if (!configMatch) {
        return {
            enabled: true,
            titleText: 'Quick Links',
            titleIcon: 'fa-solid fa-link',
        };
    }

    const configStr = configMatch[1];

    const enabledMatch = configStr.match(/enabled:\s*(true|false)/);
    const titleTextMatch = configStr.match(/text:\s*['"`]([^'"`]+)['"`]/);
    const titleIconMatch = configStr.match(/icon:\s*['"`]([^'"`]+)['"`]/);

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : true,
        titleText: titleTextMatch ? titleTextMatch[1].trim() : '链接导航',
        titleIcon: titleIconMatch ? titleIconMatch[1].trim() : 'fa-solid fa-link',
    };
}

// 提取 Donation 配置
function extractDonationConfig() {
    const configMatch = configContent.match(/donation:\s*\{([\s\S]*?)\n\s*\},?\s*\n\s*\/\/ =/);
    if (!configMatch) {
        return {
            enabled: false,
            titleText: 'Support Me',
            titleIcon: 'fa-solid fa-mug-hot',
            message: '如果我的内容对你有帮助，欢迎请我喝杯咖啡~',
            methods: [],
        };
    }

    const configStr = configMatch[1];

    const enabledMatch = configStr.match(/enabled:\s*(true|false)/);
    const titleTextMatch = configStr.match(/text:\s*['"`]([^'"`]+)['"`]/);
    const titleIconMatch = configStr.match(/icon:\s*['"`]([^'"`]+)['"`]/);
    const messageMatch = configStr.match(/message:\s*['"`]([^'"`]+)['"`]/);

    // 提取 methods 数组 - 使用更健壮的对象解析
    const methodsMatch = configStr.match(/methods:\s*\[([\s\S]*?)\n\s*\]/);
    const methods = [];

    if (methodsMatch) {
        const methodsStr = methodsMatch[1];

        // 匹配每个 method 对象 {...}
        const objectPattern = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;

        let objectMatch;
        while ((objectMatch = objectPattern.exec(methodsStr)) !== null) {
            const objContent = objectMatch[1];

            const name = extractStringValue(objContent, 'name');
            const key = extractStringValue(objContent, 'key');
            const icon = extractStringValue(objContent, 'icon');
            const qrImage = extractStringValue(objContent, 'qrImage');
            const url = extractStringValue(objContent, 'url');

            const enabledMethodMatch = objContent.match(/enabled:\s*(true|false)/);
            const methodEnabled = enabledMethodMatch ? enabledMethodMatch[1] === 'true' : true;

            if (name && key && icon) {
                const method = {
                    name,
                    key,
                    icon,
                    enabled: methodEnabled,
                };

                if (qrImage) {
                    method.qrImage = qrImage;
                } else if (url) {
                    method.url = url;
                }

                methods.push(method);
            }
        }
    }

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : false,
        titleText: titleTextMatch ? titleTextMatch[1].trim() : '赞赏支持',
        titleIcon: titleIconMatch ? titleIconMatch[1].trim() : 'fa-solid fa-mug-hot',
        message: messageMatch ? messageMatch[1].trim() : '如果我的内容对你有帮助，欢迎请我喝杯咖啡~',
        methods,
    };
}

// ========== 主题配置提取 ==========

/**
 * 从 theme 配置块中提取单个颜色值
 */
function extractThemeColor(themeBlock, key, fallback) {
    if (!themeBlock) return fallback;
    const pattern = new RegExp(key + ':\\s*[\'"`]([^\'"`]+)[\'"`]');
    const match = themeBlock.match(pattern);
    return match && match[1] ? match[1].trim() : fallback;
}

/**
 * 提取主题配置
 * 支持新版格式（defaults, locked, schemes）和旧版格式（light, dark）
 */
function extractThemeConfig() {
    // 匹配 theme 对象
    const themeMatch = configContent.match(/theme:\s*\{([\s\S]*?)\n\s*\},?\s*\n\s*\/\/ =/);
    if (!themeMatch) {
        return null;
    }

    const themeBlock = themeMatch[1];

    // 提取 default
    const defaultMatch = themeBlock.match(/default:\s*['"`](light|dark|auto)['"`]/);
    const defaultMode = defaultMatch ? defaultMatch[1] : 'auto';

    // 提取 defaultScheme 配置
    let defaultScheme = null;
    const defaultSchemeMatch = themeBlock.match(/defaultScheme:\s*\{([^}]+)\}/);
    if (defaultSchemeMatch) {
        const defaultSchemeBlock = defaultSchemeMatch[1];
        const lightSchemeMatch = defaultSchemeBlock.match(/light:\s*['"`]([^'"`]+)['"`]/);
        const darkSchemeMatch = defaultSchemeBlock.match(/dark:\s*['"`]([^'"`]+)['"`]/);
        defaultScheme = {
            light: lightSchemeMatch ? lightSchemeMatch[1] : null,
            dark: darkSchemeMatch ? darkSchemeMatch[1] : null,
        };
    }

    // 提取 locked 配置（旧版兼容）
    let locked = null;
    const lockedMatch = themeBlock.match(/locked:\s*\{([^}]+)\}/);
    if (lockedMatch) {
        const lockedBlock = lockedMatch[1];
        const lightLockedMatch = lockedBlock.match(/light:\s*['"`]([^'"`]+)['"`]/);
        const darkLockedMatch = lockedBlock.match(/dark:\s*['"`]([^'"`]+)['"`]/);
        locked = {
            light: lightLockedMatch ? lightLockedMatch[1] : null,
            dark: darkLockedMatch ? darkLockedMatch[1] : null,
        };
    }

    return {
        default: defaultMode,
        defaultScheme,
        locked,
    };
}

/**
 * 获取指定模式的配色（考虑 defaultScheme 优先级）
 * @param {object} theme - 主题配置对象
 * @param {string} mode - 'light' 或 'dark'
 * @returns {object|null} 颜色配置对象
 */
function getModeColors(theme, mode) {
    // 优先级：defaultScheme > locked > 系统默认
    let colors = null;

    // 1. 首先检查 defaultScheme
    if (theme.defaultScheme && theme.defaultScheme[mode]) {
        const scheme = builtinSchemes[theme.defaultScheme[mode]];
        if (scheme && isSchemeCompatible(scheme, mode)) {
            colors = getSchemeColors(scheme, mode);
        }
    }

    // 2. 其次检查 locked（旧版兼容）
    if (!colors && theme.locked && theme.locked[mode]) {
        const scheme = builtinSchemes[theme.locked[mode]];
        if (scheme && isSchemeCompatible(scheme, mode)) {
            colors = getSchemeColors(scheme, mode);
        }
    }

    // 3. 最后使用系统默认
    if (!colors) {
        colors = getDefaultColors(mode);
    }

    return colors;
}

/**
 * 生成默认主题 CSS 变量（写入 Critical CSS，确保首次渲染就有颜色）
 * 使用 Light 模式的默认配色作为初始值
 */
function generateDefaultThemeCSS() {
    // 获取 Light 模式的默认配色
    const lightColors = getDefaultColors('light');
    if (!lightColors) return '';

    const vars = buildCSSVariablesArray(lightColors, 'light');
    return vars.join(';');
}

/**
 * 生成主题初始化脚本（防闪烁）
 *
 * 核心设计：直接在 <html> 元素上设置 inline style
 * - 在 HTML 解析最早时机执行
 * - inline style 优先级最高，不会被后续 CSS 覆盖
 * - 消除渲染和脚本执行之间的竞争条件
 /**
 * 生成主题初始化内联脚本
 * 注：输出会被 processInlineJS 压缩，此处优先可读性
 */
function generateThemeInitScript() {
    const schemesJson = JSON.stringify(builtinSchemes);
    const deriveConfigJson = JSON.stringify(deriveConfig);
    const themeConfig = extractThemeConfig();
    const defaultMode = themeConfig?.default || 'auto';
    const defaultSchemeJson = JSON.stringify(themeConfig?.defaultScheme || { light: null, dark: null });
    const helpers = getInlineScriptHelpers();

    return `<script id="theme-init-script">
(function() {
    var SCHEMES = ${schemesJson};
    var DERIVE_CONFIG = ${deriveConfigJson};
    var DEFAULT_MODE = "${defaultMode}";
    var DEFAULT_SCHEME = ${defaultSchemeJson};
    var STORAGE_KEY = "${THEME_CONSTANTS.STORAGE_KEY}";
    var THEME_ATTR = "${THEME_CONSTANTS.THEME_ATTRIBUTE}";

    ${helpers.hexToRgb}

    ${helpers.darkenColor}

    function getEffectiveTheme(mode) {
        if (mode === "auto") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        return mode;
    }

    function getSchemeColors(scheme, mode) {
        if (scheme.colors && typeof scheme.colors.light === "object") return scheme.colors[mode] || scheme.colors.dark || scheme.colors;
        return scheme.colors;
    }

    function isSchemeCompatible(scheme, mode) {
        return !scheme.modes || scheme.modes.indexOf(mode) !== -1;
    }

    function getActiveScheme(mode, stored) {
        var schemeId = null;
        if (stored && stored.schemes && stored.schemes[mode] !== undefined) schemeId = stored.schemes[mode];
        else if (DEFAULT_SCHEME[mode]) schemeId = DEFAULT_SCHEME[mode];
        if (schemeId === null || !schemeId) return null;
        var scheme = SCHEMES[schemeId];
        if (scheme && isSchemeCompatible(scheme, mode)) return scheme;
        return null;
    }

    function getDefaultColors(mode) {
        for (var id in SCHEMES) {
            if (SCHEMES[id].isDefault && SCHEMES[id].modes && SCHEMES[id].modes.indexOf(mode) !== -1) return SCHEMES[id].colors;
        }
        return null;
    }

    ${helpers.buildStyleString}

    var stored = null;
    try { var s = localStorage.getItem(STORAGE_KEY); if (s) stored = JSON.parse(s); } catch (e) {}

    var mode = (stored && stored.mode) || DEFAULT_MODE;
    var theme = getEffectiveTheme(mode);

    // 应用主题（带容错保护，失败时使用 CSS 默认值）
    try {
        document.documentElement.setAttribute(THEME_ATTR, theme);
        if (theme === "dark" || (stored && stored.schemes && stored.schemes[theme])) {
            var scheme = getActiveScheme(theme, stored);
            var colors = scheme ? getSchemeColors(scheme, theme) : getDefaultColors(theme);
            if (colors) {
                document.documentElement.style.cssText = buildStyleString(colors, theme);
            }
        }
    } catch (e) {}

    window.THEME_SCHEMES = SCHEMES;
    window.THEME_DERIVE_CONFIG = DERIVE_CONFIG;
    window.THEME_DEFAULT_MODE = DEFAULT_MODE;
    window.THEME_DEFAULT_SCHEME = DEFAULT_SCHEME;
    window.THEME_CONSTANTS = { STORAGE_KEY: STORAGE_KEY, THEME_ATTR: THEME_ATTR };
    window.THEME_HELPERS = {
        hexToRgb: hexToRgb,
        darkenColor: darkenColor,
        buildStyleString: buildStyleString
    };
})();
</script>`;
}





// 提取 analytics 子配置值
function extractAnalyticsValue(key, subKey) {
    const pattern = new RegExp(key + ':\\s*\\{([^}]+)\\}', 's');
    const match = configContent.match(pattern);
    if (match && match[1]) {
        const subPattern = new RegExp(subKey + ':\\s*[\'"`]([^\'"`]+)[\'"`]');
        const subMatch = match[1].match(subPattern);
        if (subMatch && subMatch[1]) {
            return subMatch[1].trim();
        }
        const boolPattern = new RegExp(subKey + ':\\s*(true|false)');
        const boolMatch = match[1].match(boolPattern);
        if (boolMatch) {
            return boolMatch[1].trim();
        }
    }
    return '';
}

// 提取 Umami 脚本标签
function extractUmamiScript() {
    // 匹配单引号包裹的内容（允许内部有双引号）
    const singleQuoteMatch = configContent.match(/umami:\s*'([^']+)'/);
    if (singleQuoteMatch && singleQuoteMatch[1]) {
        return singleQuoteMatch[1].trim();
    }
    // 匹配反引号包裹的内容
    const backtickMatch = configContent.match(/umami:\s*`([^`]+)`/);
    if (backtickMatch && backtickMatch[1]) {
        return backtickMatch[1].trim();
    }
    // 匹配双引号包裹的内容
    const doubleQuoteMatch = configContent.match(/umami:\s*"([^"]+)"/);
    if (doubleQuoteMatch && doubleQuoteMatch[1]) {
        return doubleQuoteMatch[1].trim();
    }
    return '';
}

// 提取自定义脚本数组
function extractCustomScripts() {
    const match = configContent.match(/customScripts:\s*\[([\s\S]*?)\n\s*\]/);
    if (!match) return [];

    const scriptsContent = match[1];
    const scriptPattern = /['"`](<script[\s\S]*?<\/script>)['"`]/g;
    const scripts = [];

    let scriptMatch;
    while ((scriptMatch = scriptPattern.exec(scriptsContent)) !== null) {
        scripts.push(scriptMatch[1].trim());
    }

    return scripts;
}

// 提取 RSS 配置
function extractRSSConfig() {
    const rssMatch = configContent.match(/rss:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*\/\/ =/);
    if (!rssMatch) {
        return {
            enabled: false,
            url: '',
            count: 6,
            openInNewTab: true,
            titleText: 'Recent Posts',
            titleIcon: 'fa-solid fa-newspaper',
            showDate: true,
            showDescription: true,
            maxDescriptionLength: 100,
        };
    }

    const rssContent = rssMatch[1];

    const enabledMatch = rssContent.match(/enabled:\s*(true|false)/);
    const urlMatch = rssContent.match(/url:\s*['"`]([^'"`]+)['"`]/);
    const countMatch = rssContent.match(/count:\s*(\d+)/);
    const openInNewTabMatch = rssContent.match(/openInNewTab:\s*(true|false)/);

    // 提取 title 配置
    const titleMatch = rssContent.match(/title:\s*\{([^}]+)\}/);
    let titleText = '最新文章';
    let titleIcon = 'fa-solid fa-rss';
    if (titleMatch) {
        const titleContent = titleMatch[1];
        const textMatch = titleContent.match(/text:\s*['"`]([^'"`]+)['"`]/);
        const iconMatch = titleContent.match(/icon:\s*['"`]([^'"`]+)['"`]/);
        if (textMatch) titleText = textMatch[1].trim();
        if (iconMatch) titleIcon = iconMatch[1].trim();
    }

    // 提取 display 配置
    const displayMatch = rssContent.match(/display:\s*\{([^}]+)\}/);
    let showDate = true;
    let showDescription = true;
    let maxDescriptionLength = 80;
    if (displayMatch) {
        const displayContent = displayMatch[1];
        const showDateMatch = displayContent.match(/showDate:\s*(true|false)/);
        const showDescMatch = displayContent.match(/showDescription:\s*(true|false)/);
        const maxLenMatch = displayContent.match(/maxDescriptionLength:\s*(\d+)/);
        if (showDateMatch) showDate = showDateMatch[1] === 'true';
        if (showDescMatch) showDescription = showDescMatch[1] === 'true';
        if (maxLenMatch) maxDescriptionLength = parseInt(maxLenMatch[1], 10);
    }

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : false,
        url: urlMatch ? urlMatch[1].trim() : '',
        count: countMatch ? parseInt(countMatch[1], 10) : 5,
        openInNewTab: openInNewTabMatch ? openInNewTabMatch[1] === 'true' : true,
        titleText: titleText,
        titleIcon: titleIcon,
        showDate: showDate,
        showDescription: showDescription,
        maxDescriptionLength: maxDescriptionLength,
    };
}

// 生成统计脚本 HTML
function generateAnalyticsHTML(config) {
    let scripts = '';
    
    // Google Analytics
    if (config.gaEnabled && config.gaId) {
        scripts += `
        <!-- Google Analytics -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=${config.gaId}"></script>
        <script>
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${config.gaId}');
        </script>`;
    }
    
    // Microsoft Clarity
    if (config.clarityEnabled && config.clarityId) {
        scripts += `
        <!-- Microsoft Clarity -->
        <script>
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${config.clarityId}");
        </script>`;
    }
    
    // Umami
    if (config.umami) {
        scripts += `
        <!-- Umami Analytics -->
        ${config.umami}`;
    }
    
    // Custom Scripts
    if (config.customScripts && config.customScripts.length > 0) {
        scripts += `
        <!-- Custom Analytics Scripts -->
        ${config.customScripts.join('\n        ')}`;
    }
    
    return scripts;
}

// 生成链接 HTML
// ========== 邮箱反爬虫 ==========
/**
 * 编码邮箱地址（Base64 + 字符反转双重保护）
 * @param {string} email - 邮箱地址
 * @returns {string} 编码后的字符串
 */
function encodeEmail(email) {
    // 先反转字符串，再 Base64 编码
    const reversed = email.split('').reverse().join('');
    return Buffer.from(reversed).toString('base64');
}

/**
 * 解码邮箱地址的 JS 代码
 * @param {string} encoded - 编码后的字符串
 * @returns {string} JS 解码表达式
 */
function getEmailDecodeJS(encoded) {
    // 反转 Base64 解码：先 Base64 解码，再反转字符串
    return `atob('${encoded}').split('').reverse().join('')`;
}

/**
 * 处理链接 URL（针对 mailto 进行反爬虫处理）
 * @param {string} url - 原始 URL
 * @param {boolean} external - 是否外部链接
 * @param {boolean} antiCrawler - 是否启用反爬虫
 * @returns {{ href: string, attrs: string }} 处理后的 href 和属性
 */
function processLinkUrl(url, external, antiCrawler = true) {
    if (antiCrawler && url.startsWith('mailto:')) {
        const email = url.replace('mailto:', '');
        const encoded = encodeEmail(email);
        return {
            href: 'javascript:void(0)',
            attrs: `onclick="location.href='mailto:'+${getEmailDecodeJS(encoded)}"`,
            isEmail: true
        };
    }
    return {
        href: url,
        attrs: external ? 'target="_blank" rel="noopener noreferrer"' : '',
        isEmail: false
    };
}

// 生成单个链接 HTML
function generateLinkHTML(link) {
    const antiCrawler = link.antiCrawler !== false;
    const { href, attrs } = processLinkUrl(link.url, link.external, antiCrawler);

    return `                    <a href="${href}" class="link" data-brand="${link.brand}" style="--brand-color: ${link.color}" ${attrs} aria-label="${link.name} - ${link.description}">
                        <div class="link-left">
                            <div class="link-icon-wrapper">
                                <i class="${link.icon}" aria-hidden="true"></i>
                            </div>
                            <div class="link-content">
                                <span class="link-text">${link.name}</span>
                                <span class="link-description">${link.description}</span>
                            </div>
                        </div>
                        <span class="link-indicator" aria-hidden="true"></span>
                    </a>`;
}

function generateLinksHTML(links) {
    // 过滤掉未启用的链接
    const enabledLinks = links.filter(link => link.enabled !== false);
    return enabledLinks.map(generateLinkHTML).join('\n');
}

// 生成链接模块（含顶部分割线和标题）
function generateLinksSectionHTML(links, linksConfig) {
    // 模块开关检查
    if (!linksConfig.enabled) {
        return '';
    }

    // 过滤掉未启用的链接
    const enabledLinks = links.filter(link => link.enabled !== false);

    // 如果没有启用的链接，返回空字符串（分割线也不显示）
    if (enabledLinks.length === 0) {
        return '';
    }

    const linksHTML = enabledLinks.map(generateLinkHTML).join('\n');

    return `<div class="divider divider-compact lazy-load" data-delay="4"></div>

                <!-- Links Section -->
                <div class="links-section lazy-load" id="links-container" data-delay="4">
                    <div class="links-header">
                        <i class="${escapeHTML(linksConfig.titleIcon)}"></i>
                        <span class="links-title">${escapeHTML(linksConfig.titleText)}</span>
                        <span class="section-count">${enabledLinks.length} links</span>
                    </div>
                    <div class="links">
${linksHTML}
                    </div>
                </div>`;
}

// 生成骨架屏链接占位 HTML
function generateSkeletonLinksHTML(links) {
    const enabledLinks = links.filter(link => link.enabled !== false);
    const count = enabledLinks.length;

    return Array(count).fill(`<div class="skeleton-link skeleton"></div>`).join('\n                    ');
}

// 生成骨架屏链接模块（含顶部分割线和标题）
function generateSkeletonLinksSectionHTML(links, linksConfig) {
    // 模块开关检查
    if (!linksConfig.enabled) {
        return '';
    }

    const enabledLinks = links.filter(link => link.enabled !== false);

    // 如果没有启用的链接，返回空字符串
    if (enabledLinks.length === 0) {
        return '';
    }

    const skeletonLinks = Array(enabledLinks.length).fill(`<div class="skeleton-link skeleton"></div>`).join('\n                    ');

    return `                <div class="skeleton-divider skeleton"></div>
                <div class="skeleton-links-section">
                    <div class="skeleton-links-header">
                        <div class="skeleton-links-title skeleton"></div>
                        <div class="skeleton-section-count skeleton"></div>
                    </div>
                    <div class="skeleton-links">
                    ${skeletonLinks}
                    </div>
                </div>`;
}

// 生成 Notice HTML
function generateNoticeHTML(notice) {
    if (!notice.enabled) {
        return '';
    }

    return `                <!-- Notice -->
                <div class="notice notice-${notice.type}">
                    <div class="notice-icon">
                        <i class="${notice.icon}"></i>
                    </div>
                    <div class="notice-content">
                        ${notice.text}
                    </div>
                </div>`;
}

// 生成骨架屏 Notice 占位 HTML
function generateSkeletonNoticeHTML(notice) {
    if (!notice.enabled) {
        return '';
    }

    return '<div class="skeleton-notice skeleton"></div>';
}

// 生成音乐切换图标 HTML（极简音符图标）
function generateMusicToggleIconHTML(music) {
    if (!music.enabled) {
        return '';
    }
    // 音符图标，点击展开音乐控件
    return `
                    <button class="music-toggle" id="music-toggle" title="音乐" aria-label="展开音乐播放器" aria-expanded="false">
                        <i class="fa-solid fa-music"></i>
                    </button>`;
}

// 生成音乐播放器 HTML（可展开版，包含分割线切换）
// 采用动态卡片音频播放器风格：终端风格 · 强调色 · 微妙呼吸动画
function generateMusicPlayerHTML(music) {
    if (!music.enabled) {
        // 音乐播放器禁用时，显示原始分割线
        return '<!-- Divider -->\n                <div class="divider lazy-load" data-delay="1"></div>';
    }

    // 将配置序列化为 JSON 供前端 JS 使用
    const musicConfigJSON = JSON.stringify({
        volume: music.volume,
        autoplay: music.autoplay,
        playMode: music.playMode,
        mode: music.mode,
        meting: music.meting,
        local: music.local,
    }).replace(/"/g, '&quot;');

    // 音乐区域容器：包含分割线和音乐播放器，通过切换显示
    return `<!-- Music Area (divider <-> player toggle) -->
                <div class="music-area" id="music-area">
                    <!-- 分割线：默认显示，展开音乐时隐藏 -->
                    <div class="divider lazy-load music-divider" data-delay="1" id="music-divider"></div>
                    <!-- 音乐播放器：默认隐藏，点击音符图标后展开 -->
                    <div class="music-player-wrapper" id="music-player-wrapper">
                        <div class="music-player-inner">
                            <div class="home-audio" id="music-player" data-config="${musicConfigJSON}">
                                <!-- 播放器主体 -->
                                <div class="home-audio-player">
                                    <!-- 上一曲按钮 -->
                                    <button class="home-audio-btn home-audio-btn--prev" id="music-prev" title="上一曲" aria-label="上一曲">
                                        <i class="fa-solid fa-backward-step"></i>
                                    </button>
                                    <!-- 播放按钮 -->
                                    <button class="home-audio-btn home-audio-btn--play" id="music-play" title="播放" aria-label="播放">
                                        <i class="fa-solid fa-play" id="music-play-icon"></i>
                                    </button>
                                    <!-- 下一曲按钮 -->
                                    <button class="home-audio-btn home-audio-btn--next" id="music-next" title="下一曲" aria-label="下一曲">
                                        <i class="fa-solid fa-forward-step"></i>
                                    </button>
                                    <!-- 波形可视化 + 进度条容器 -->
                                    <div class="home-audio-visualizer">
                                        <!-- 波形条装饰 -->
                                        <div class="home-audio-waveform">
                                            <div class="home-audio-waveform-bar"></div>
                                            <div class="home-audio-waveform-bar"></div>
                                            <div class="home-audio-waveform-bar"></div>
                                            <div class="home-audio-waveform-bar"></div>
                                            <div class="home-audio-waveform-bar"></div>
                                            <div class="home-audio-waveform-bar"></div>
                                            <div class="home-audio-waveform-bar"></div>
                                            <div class="home-audio-waveform-bar"></div>
                                        </div>
                                        <!-- 进度条 -->
                                        <div class="home-audio-progress" id="music-progress" role="slider" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
                                            <div class="home-audio-progress-fill" id="music-progress-fill"></div>
                                        </div>
                                    </div>
                                    <!-- 时间显示 -->
                                    <div class="home-audio-time" id="music-time">0:00 / 0:00</div>
                                </div>
                                <!-- 歌曲名称显示区域 -->
                                <div class="home-audio-title" id="music-title">
                                    <i class="fa-solid fa-music"></i>
                                    <span>未在播放</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
}

// 生成骨架屏音乐播放器占位 - 初始不显示，展开时由JS控制
function generateSkeletonMusicHTML(music) {
    if (!music.enabled) {
        return '';
    }
    // 骨架屏不再显示音乐控件占位，因为初始状态是收起的
    return '';
}

// 生成页脚 HTML（单行居中布局）
function generateFooterHTML(config) {
    const copyright = `© ${config.footerCopyrightYear} <a href="${config.footerCopyrightUrl}" target="_blank" rel="noopener noreferrer" class="footer-brand">${config.footerCopyrightName}</a>`;

    // 如果启用 ICP 且有备案号，添加分隔符和 ICP 链接
    if (config.footerIcpEnabled && config.footerIcpNumber) {
        return `<p class="footer-text">${copyright} <span class="footer-divider">·</span> <a href="${config.footerIcpUrl}" target="_blank" rel="noopener noreferrer" class="footer-icp">${config.footerIcpNumber}</a></p>`;
    }

    return `<p class="footer-text">${copyright}</p>`;
}

// 生成 Donation HTML
function generateDonationHTML(donation) {
    if (!donation.enabled) {
        return '';
    }

    // 过滤启用的支付方式
    const enabledMethods = donation.methods.filter(method => method.enabled);
    if (enabledMethods.length === 0) {
        return '';
    }

    // 生成支付按钮（使用 BEM 类名）
    const buttonsHTML = enabledMethods.map(method => {
        // BEM modifier class
        const modifierClass = `donation__btn--${method.key}`;

        if (method.qrImage) {
            // 二维码方式（微信、支付宝）
            return `<button class="donation__btn ${modifierClass}" data-method="${method.key}" data-qr="${method.qrImage}" data-name="${method.name}" aria-label="${method.name}扫码支付">
                    <i class="${method.icon} donation__btn-icon" aria-hidden="true"></i>
                    <span>${method.name}</span>
                </button>`;
        } else {
            // 外链方式（PayPal等）
            return `<a href="${method.url}" class="donation__btn ${modifierClass}" data-method="${method.key}" target="_blank" rel="noopener noreferrer" aria-label="前往${method.name}支付页面">
                    <i class="${method.icon} donation__btn-icon" aria-hidden="true"></i>
                    <span>${method.name}</span>
                </a>`;
        }
    }).join('\n                ');

    return `<div class="divider divider-compact lazy-load" data-delay="4"></div>

                <!-- Donation Section -->
                <section class="donation lazy-load" id="donation-section" data-delay="4" aria-labelledby="donation-title">
                    <div class="donation__header">
                        <i class="${escapeHTML(donation.titleIcon)} donation__icon" aria-hidden="true"></i>
                        <span class="donation__title" id="donation-title">${escapeHTML(donation.titleText)}</span>
                    </div>
                    <div class="donation__terminal">
                        <div class="donation__prompt">$ <span class="donation__command">cat support.txt</span></div>
                        <div class="donation__output">${escapeHTML(donation.message)}</div>
                        <div class="donation__methods">
                ${buttonsHTML}
                        </div>
                    </div>
                </section>`;
}

// 生成骨架屏 Donation 占位 HTML
// 生成骨架屏 Donation 占位 HTML - 与实际布局结构一致
function generateSkeletonDonationHTML(donation) {
    if (!donation.enabled) {
        return '';
    }

    const enabledMethods = donation.methods.filter(method => method.enabled);
    if (enabledMethods.length === 0) {
        return '';
    }

    // 生成支付按钮骨架（最多显示3个，与实际布局一致）
    const btnCount = Math.min(enabledMethods.length, 3);
    const buttonsHTML = Array(btnCount).fill(0).map(() =>
        `<div class="skeleton-donation-btn skeleton"></div>`
    ).join('\n                        ');

    return `                <div class="skeleton-divider skeleton"></div>
                <div class="skeleton-donation">
                    <div class="skeleton-donation-header">
                        <div class="skeleton-donation-icon skeleton"></div>
                        <div class="skeleton-donation-title skeleton"></div>
                    </div>
                    <div class="skeleton-donation-terminal">
                        <div class="skeleton-donation-prompt skeleton"></div>
                        <div class="skeleton-donation-output skeleton"></div>
                        <div class="skeleton-donation-methods">
                        ${buttonsHTML}
                        </div>
                    </div>
                </div>`;
}

// 生成捐赠模态框 HTML（静态存在，避免 JS 动态创建时闪烁）
// 关键：隐藏样式在 Critical CSS 中定义，确保 CSS 加载前就生效
function generateDonationModalHTML(donation) {
    if (!donation.enabled) {
        return '';
    }

    const enabledMethods = donation.methods.filter(method => method.enabled && method.qrImage);
    if (enabledMethods.length === 0) {
        return '';
    }

    // 模态框静态 HTML
    // 隐藏由 Critical CSS 控制，不需要内联样式或 hidden 属性
    return `<div class="donation__modal-overlay" id="donation-modal" role="dialog" aria-modal="true" aria-labelledby="donation-modal-title" aria-hidden="true">
            <div class="donation__modal">
                <div class="donation__modal-title">
                    <i class="fa-solid fa-qrcode donation__modal-title-icon" aria-hidden="true"></i>
                    <span class="donation__modal-name" id="donation-modal-title"></span>
                </div>
                <div class="donation__qr-wrapper">
                    <img class="donation__qr-image" alt="支付二维码" />
                </div>
                <button class="donation__modal-close" aria-label="关闭支付二维码弹窗">关闭</button>
            </div>
        </div>`;
}

// 生成 RSS 文章列表 HTML（支持3D翻转Masonry布局）
function generateRSSHTML(articles, rssConfig) {
    if (!rssConfig.enabled) {
        return '';
    }

    // RSS 模块前面带分割线
    let result = '<div class="divider divider-compact lazy-load" data-delay="4"></div>\n';

    // 文章数量显示
    const countText = articles.length + ' posts';

    // 空文章列表时显示友好提示
    if (articles.length === 0) {
        result += '<div class="rss-section lazy-load" id="rss-section" data-delay="4">\n' +
            '                    <div class="rss-header">\n' +
            '                        <i class="' + rssConfig.titleIcon + '"></i>\n' +
            '                        <span class="rss-title">' + rssConfig.titleText + '</span>\n' +
            '                        <span class="section-count">' + countText + '</span>\n' +
            '                    </div>\n' +
            '                    <div class="rss-articles rss-empty">\n' +
            '                        <span class="rss-empty-text">暂无最新文章</span>\n' +
            '                    </div>\n' +
            '                </div>';
        return result;
    }

    const targetAttr = rssConfig.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';

    // 生成单张卡片HTML
    function generateCardHTML(article, index, isBack) {
        // 截断描述并进行 HTML 转义
        let desc = escapeHTML(article.description || '');
        if (desc.length > rssConfig.maxDescriptionLength) {
            desc = desc.substring(0, rssConfig.maxDescriptionLength) + '...';
        }

        // 生成日期
        const dateHTML = rssConfig.showDate && article.pubDate
            ? '<span class="rss-article-date">' + escapeHTML(article.pubDate) + '</span>'
            : '';

        // 生成描述
        const descHTML = rssConfig.showDescription && desc
            ? '<p class="rss-article-desc">' + desc + '</p>'
            : '';

        // 对链接进行安全校验和转义
        const safeLink = escapeHTML(article.link);

        // 背面卡片额外类名
        const backClass = isBack ? ' rss-article-back' : '';

        return '<a href="' + safeLink + '" class="rss-article' + backClass + '"' + targetAttr + ' aria-label="阅读文章：' + escapeHTML(article.title) + '">\n' +
            '                            <div class="rss-article-content">\n' +
            '                                <span class="rss-article-title">' + escapeHTML(article.title) + '</span>\n' +
            '                                ' + descHTML + '\n' +
            '                            </div>\n' +
            '                            <div class="rss-article-meta">\n' +
            '                                ' + dateHTML + '\n' +
            '                                <i class="fa-solid fa-arrow-right rss-article-arrow" aria-hidden="true"></i>\n' +
            '                            </div>\n' +
            '                        </a>';
    }

    // 生成卡片容器（包含正面和背面）
    function generateCardContainer(article, index, backArticle) {
        const frontCard = generateCardHTML(article, index, false);
        const backCard = backArticle ? generateCardHTML(backArticle, index, true) : '';

        return '<div class="rss-card-container" data-card-index="' + index + '">\n' +
            '                        ' + frontCard + '\n' +
            '                        ' + backCard + '\n' +
            '                    </div>';
    }

    // 将文章分组：主卡片组（前3篇）和额外卡片组（第4篇及以后）
    const primaryArticles = articles.slice(0, 3);
    const extraArticles = articles.slice(3);

    // 生成卡片容器HTML
    const cardContainersHTML = [];

    // 主卡片区域：前3篇文章，支持翻转
    for (let i = 0; i < 3; i++) {
        const frontArticle = primaryArticles[i];
        // 背面文章：从额外文章中取，如果没有则不显示背面
        const backArticle = extraArticles[i] || null;

        if (frontArticle) {
            cardContainersHTML.push(generateCardContainer(frontArticle, i, backArticle));
        }
    }

    // 额外卡片区域：第4篇及以后的文章（如果还有剩余）
    // 这些文章每两篇一组，正面背面
    const remainingArticles = extraArticles.slice(3);
    for (let i = 0; i < remainingArticles.length; i += 2) {
        const frontArticle = remainingArticles[i];
        const backArticle = remainingArticles[i + 1] || null;

        if (frontArticle) {
            cardContainersHTML.push(generateCardContainer(frontArticle, 4 + Math.floor(i / 2), backArticle));
        }
    }

    // 如果有多余卡片，添加has-extra-cards类
    const extraClass = extraArticles.length > 0 ? ' has-extra-cards' : '';

    return '<div class="divider divider-compact lazy-load" data-delay="4"></div>\n' +
        '<div class="rss-section lazy-load" id="rss-section" data-delay="4">\n' +
        '                    <div class="rss-header">\n' +
        '                        <i class="' + escapeHTML(rssConfig.titleIcon) + '"></i>\n' +
        '                        <span class="rss-title">' + escapeHTML(rssConfig.titleText) + '</span>\n' +
        '                        <span class="section-count">' + countText + '</span>\n' +
        '                    </div>\n' +
        '                    <div class="rss-articles' + extraClass + '">\n' +
        cardContainersHTML.join('\n') + '\n' +
        '                    </div>\n' +
        '                </div>';
}

// 生成骨架屏 RSS 占位 HTML（适配Masonry布局）
function generateSkeletonRSSHTML(rssConfig) {
    if (!rssConfig.enabled) {
        return '';
    }

    // 骨架屏显示3个占位，模拟Masonry布局的前3张卡片
    // 第1张是主卡片（占据两行），第2、3张是次要卡片
    const skeletonArticles = [];
    skeletonArticles.push('                    <div class="skeleton-rss-article skeleton-rss-main skeleton"></div>');
    skeletonArticles.push('                    <div class="skeleton-rss-article skeleton"></div>');
    skeletonArticles.push('                    <div class="skeleton-rss-article skeleton"></div>');

    return '<div class="skeleton-divider skeleton"></div>\n' +
        '                <!-- RSS Articles Skeleton -->\n' +
        '                <div class="skeleton-rss-section">\n' +
        '                    <div class="skeleton-rss-header">\n' +
        '                        <div class="skeleton-rss-icon skeleton"></div>\n' +
        '                        <div class="skeleton-rss-title skeleton"></div>\n' +
        '                        <div class="skeleton-section-count skeleton"></div>\n' +
        '                    </div>\n' +
        '                    <div class="skeleton-rss-articles">\n' +
                skeletonArticles.join('\n') + '\n' +
        '                    </div>\n' +
        '                </div>';
}

// 提取 Projects 配置
function extractProjectsConfig() {
    const projectsMatch = configContent.match(/projects:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*\/\/ =/);
    if (!projectsMatch) {
        return {
            enabled: false,
            titleText: 'Projects',
            titleIcon: 'fa-solid fa-folder-open',
            githubUser: '',
            count: 4,
            exclude: [],
        };
    }

    const projectsContent = projectsMatch[1];

    const enabledMatch = projectsContent.match(/enabled:\s*(true|false)/);

    // 提取 title 配置
    const titleMatch = projectsContent.match(/title:\s*\{([^}]+)\}/);
    let titleText = '我的项目';
    let titleIcon = 'fa-solid fa-folder-open';
    if (titleMatch) {
        const titleContent = titleMatch[1];
        const textMatch = titleContent.match(/text:\s*['"`]([^'"`]+)['"`]/);
        const iconMatch = titleContent.match(/icon:\s*['"`]([^'"`]+)['"`]/);
        if (textMatch) titleText = textMatch[1].trim();
        if (iconMatch) titleIcon = iconMatch[1].trim();
    }

    // 提取 GitHub 用户地址
    const githubUserMatch = projectsContent.match(/githubUser:\s*['"`]([^'"`]+)['"`]/);
    const githubUser = githubUserMatch ? githubUserMatch[1].trim() : '';

    // 提取数量限制
    const countMatch = projectsContent.match(/count:\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 4;

    // 提取排除列表
    const excludeMatch = projectsContent.match(/exclude:\s*\[([\s\S]*?)\]/);
    let exclude = [];
    if (excludeMatch) {
        const excludeContent = excludeMatch[1];
        const itemMatches = excludeContent.match(/['"`]([^'"`]+)['"`]/g);
        if (itemMatches) {
            exclude = itemMatches.map(m => m.replace(/['"`]/g, '').trim());
        }
    }

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : false,
        titleText: titleText,
        titleIcon: titleIcon,
        githubUser: githubUser,
        count: count,
        exclude: exclude,
    };
}

// 提取 Contribution 配置
function extractContributionConfig() {
    const contribMatch = configContent.match(/contribution:\s*\{([\s\S]*?)\n\s*\}/);
    if (!contribMatch) {
        return {
            enabled: true,
            useRealData: true,
            githubUser: '',
        };
    }

    const contribContent = contribMatch[1];

    const enabledMatch = contribContent.match(/enabled:\s*(true|false)/);
    const useRealDataMatch = contribContent.match(/useRealData:\s*(true|false)/);
    const githubUserMatch = contribContent.match(/githubUser:\s*['"`]([^'"`]+)['"`]/);

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : true,
        useRealData: useRealDataMatch ? useRealDataMatch[1] === 'true' : true,
        githubUser: githubUserMatch ? githubUserMatch[1].trim() : '',
    };
}

// 提取 Moments 配置
function extractMomentsConfig() {
    // 找到 "// ========== 个人动态配置 ==========" 注释后的 moments 块
    // 避免匹配到 pages.moments
    const momentsStart = configContent.indexOf('// ========== 个人动态配置 ==========');
    if (momentsStart === -1) {
        return {
            enabled: false,
            memosUrl: '',
            count: 10,
            tags: [],
            showSkeleton: true,
        };
    }

    // 从注释位置开始查找 moments:
    const momentsKeyPos = configContent.indexOf('moments:', momentsStart);
    if (momentsKeyPos === -1) {
        return {
            enabled: false,
            memosUrl: '',
            count: 10,
            tags: [],
            showSkeleton: true,
        };
    }

    // 找到第一个 { 的位置
    const startBrace = configContent.indexOf('{', momentsKeyPos);
    if (startBrace === -1) {
        return {
            enabled: false,
            memosUrl: '',
            count: 10,
            tags: [],
            showSkeleton: true,
        };
    }

    // 使用括号匹配找到对应的 }
    let depth = 0;
    let endBrace = -1;
    for (let i = startBrace; i < configContent.length; i++) {
        if (configContent[i] === '{') depth++;
        else if (configContent[i] === '}') {
            depth--;
            if (depth === 0) {
                endBrace = i;
                break;
            }
        }
    }

    if (endBrace === -1) {
        return {
            enabled: false,
            memosUrl: '',
            count: 10,
            tags: [],
            showSkeleton: true,
        };
    }

    const momentsContent = configContent.substring(startBrace + 1, endBrace);

    const enabledMatch = momentsContent.match(/enabled:\s*(true|false)/);
    const memosUrlMatch = momentsContent.match(/memosUrl:\s*['"`]([^'"`]+)['"`]/);
    const countMatch = momentsContent.match(/count:\s*(\d+)/);
    const showSkeletonMatch = momentsContent.match(/showSkeleton:\s*(true|false)/);
    const tagsMatch = momentsContent.match(/tags:\s*\[([\s\S]*?)\]/);

    let tags = [];
    if (tagsMatch) {
        const tagsContent = tagsMatch[1];
        const tagMatches = tagsContent.match(/['"`]([^'"`]+)['"`]/g);
        if (tagMatches) {
            tags = tagMatches.map(t => t.replace(/['"`]/g, '').trim());
        }
    }

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : false,
        memosUrl: memosUrlMatch ? memosUrlMatch[1].trim() : '',
        count: countMatch ? parseInt(countMatch[1], 10) : 10,
        tags: tags,
        showSkeleton: showSkeletonMatch ? showSkeletonMatch[1] === 'true' : true,
    };
}

// 提取 Guestbook 配置
function extractGuestbookConfig() {
    // 找到 "// ========== 留言板配置 ==========" 注释后的 guestbook 块
    // 避免匹配到 pages.guestbook
    const guestbookStart = configContent.indexOf('// ========== 留言板配置 ==========');
    if (guestbookStart === -1) {
        return {
            enabled: false,
            provider: 'waline',
            title: '留言板',
            description: '欢迎留下你的足迹',
            waline: {},
            artalk: {},
            signalStream: {
                enabled: true,
                tracks: 2,
                maxChars: 50,
            },
        };
    }

    // 从注释位置开始查找 guestbook:
    const guestbookKeyPos = configContent.indexOf('guestbook:', guestbookStart);
    if (guestbookKeyPos === -1) {
        return {
            enabled: false,
            provider: 'waline',
            title: '留言板',
            description: '欢迎留下你的足迹',
            waline: {},
            artalk: {},
            signalStream: {
                enabled: true,
                tracks: 2,
                maxChars: 50,
            },
        };
    }

    // 找到第一个 { 的位置
    const startBrace = configContent.indexOf('{', guestbookKeyPos);
    if (startBrace === -1) {
        return {
            enabled: false,
            provider: 'waline',
            title: '留言板',
            description: '欢迎留下你的足迹',
            waline: {},
            artalk: {},
            signalStream: {
                enabled: true,
                tracks: 2,
                maxChars: 50,
            },
        };
    }

    // 使用括号匹配找到对应的 }
    let depth = 0;
    let endBrace = -1;
    for (let i = startBrace; i < configContent.length; i++) {
        if (configContent[i] === '{') depth++;
        else if (configContent[i] === '}') {
            depth--;
            if (depth === 0) {
                endBrace = i;
                break;
            }
        }
    }

    if (endBrace === -1) {
        return {
            enabled: false,
            provider: 'waline',
            title: '留言板',
            description: '欢迎留下你的足迹',
            waline: {},
            artalk: {},
            signalStream: {
                enabled: true,
                tracks: 2,
                maxChars: 50,
            },
        };
    }

    const guestbookContent = configContent.substring(startBrace + 1, endBrace);

    // 基础配置
    const enabledMatch = guestbookContent.match(/enabled:\s*(true|false)/);
    const providerMatch = guestbookContent.match(/provider:\s*['"`](waline|artalk)['"`]/);
    const titleMatch = guestbookContent.match(/title:\s*['"`]([^'"`]+)['"`]/);
    const descriptionMatch = guestbookContent.match(/description:\s*['"`]([^'"`]+)['"`]/);

    // 提取 Waline 配置
    const walineMatch = guestbookContent.match(/waline:\s*\{([\s\S]*?)\n\s*\}/);
    let walineConfig = {};
    if (walineMatch) {
        const walineContent = walineMatch[1];
        const serverURLMatch = walineContent.match(/serverURL:\s*['"`]([^'"`]+)['"`]/);
        const placeholderMatch = walineContent.match(/placeholder:\s*['"`]([^'"`]+)['"`]/);
        const avatarMatch = walineContent.match(/avatar:\s*['"`]([^'"`]+)['"`]/);
        const visitorMatch = walineContent.match(/visitor:\s*(true|false)/);
        const langMatch = walineContent.match(/lang:\s*['"`]([^'"`]+)['"`]/);

        walineConfig = {
            serverURL: serverURLMatch ? serverURLMatch[1].trim() : '',
            placeholder: placeholderMatch ? placeholderMatch[1].trim() : '欢迎留言...',
            avatar: avatarMatch ? avatarMatch[1].trim() : 'monsterid',
            visitor: visitorMatch ? visitorMatch[1] === 'true' : true,
            lang: langMatch ? langMatch[1].trim() : 'zh-CN',
        };
    }

    // 提取 Artalk 配置
    const artalkMatch = guestbookContent.match(/artalk:\s*\{([\s\S]*?)\n\s*\}/);
    let artalkConfig = {};
    if (artalkMatch) {
        const artalkContent = artalkMatch[1];
        const serverMatch = artalkContent.match(/server:\s*['"`]([^'"`]+)['"`]/);
        const siteMatch = artalkContent.match(/site:\s*['"`]([^'"`]+)['"`]/);
        const pageKeyMatch = artalkContent.match(/pageKey:\s*['"`]([^'"`]+)['"`]/);
        const pageTitleMatch = artalkContent.match(/pageTitle:\s*['"`]([^'"`]+)['"`]/);
        const placeholderMatch = artalkContent.match(/placeholder:\s*['"`]([^'"`]+)['"`]/);
        const useBackendConfMatch = artalkContent.match(/useBackendConf:\s*(true|false)/);
        const nestMaxMatch = artalkContent.match(/nestMax:\s*(\d+)/);
        const pvMatch = artalkContent.match(/pv:\s*(true|false)/);
        const langMatch = artalkContent.match(/lang:\s*['"`]([^'"`]+)['"`]/);

        artalkConfig = {
            server: serverMatch ? serverMatch[1].trim() : '',
            site: siteMatch ? siteMatch[1].trim() : '',
            pageKey: pageKeyMatch ? pageKeyMatch[1].trim() : '/guestbook',
            pageTitle: pageTitleMatch ? pageTitleMatch[1].trim() : '留言板',
            placeholder: placeholderMatch ? placeholderMatch[1].trim() : '欢迎留言...',
            useBackendConf: useBackendConfMatch ? useBackendConfMatch[1] === 'true' : true,
            nestMax: nestMaxMatch ? parseInt(nestMaxMatch[1], 10) : 2,
            pv: pvMatch ? pvMatch[1] === 'true' : true,
            lang: langMatch ? langMatch[1].trim() : 'zh-CN',
        };
    }

    // 提取 signalStream 配置
    const signalStreamMatch = guestbookContent.match(/signalStream:\s*\{([\s\S]*?)\n\s*\}/);
    let signalStreamConfig = {
        enabled: true,
        tracks: 2,
        maxChars: 50,
    };
    if (signalStreamMatch) {
        const ssContent = signalStreamMatch[1];
        const ssEnabledMatch = ssContent.match(/enabled:\s*(true|false)/);
        const tracksMatch = ssContent.match(/tracks:\s*(\d+)/);
        const maxCharsMatch = ssContent.match(/maxChars:\s*(\d+)/);

        signalStreamConfig = {
            enabled: ssEnabledMatch ? ssEnabledMatch[1] === 'true' : true,
            tracks: tracksMatch ? parseInt(tracksMatch[1], 10) : 2,
            maxChars: maxCharsMatch ? parseInt(maxCharsMatch[1], 10) : 50,
        };
    }

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : false,
        provider: providerMatch ? providerMatch[1] : 'waline',
        title: titleMatch ? titleMatch[1].trim() : '留言板',
        description: descriptionMatch ? descriptionMatch[1].trim() : '欢迎留下你的足迹',
        waline: walineConfig,
        artalk: artalkConfig,
        signalStream: signalStreamConfig,
    };
}

/**
 * 生成评论系统 SDK 引用
 * @param {object} guestbookConfig - 留言板配置
 * @returns {string} SDK HTML
 */
function generateCommentSDK(guestbookConfig) {
    if (!guestbookConfig || !guestbookConfig.enabled) {
        return '';
    }

    // 新架构：使用自建 UI，不再加载外部 SDK
    // 外部 SDK 的 CSS 样式不再需要，使用项目自己的 CSS 变量
    return '';
}

// 提取 Music 配置
function extractMusicConfig() {
    const musicMatch = configContent.match(/music:\s*\{([\s\S]*?)(?=\n\s*\},?\s*\n\s*\/\/ =|\n\s*\},?\s*$)/);
    if (!musicMatch) {
        return {
            enabled: false,
            volume: 0.5,
            autoplay: false,
            playMode: 'list',
            mode: 'meting',
            meting: {
                server: 'netease',
                type: 'playlist',
                id: '',
                apis: [],
            },
            local: [],
        };
    }

    const musicContent = musicMatch[1];

    // 基础配置
    const enabledMatch = musicContent.match(/enabled:\s*(true|false)/);
    const volumeMatch = musicContent.match(/volume:\s*([0-9.]+)/);
    const autoplayMatch = musicContent.match(/autoplay:\s*(true|false)/);
    const playModeMatch = musicContent.match(/playMode:\s*['"`]([^'"`]+)['"`]/);
    const modeMatch = musicContent.match(/mode:\s*['"`]([^'"`]+)['"`]/);

    // Meting 配置
    const metingMatch = musicContent.match(/meting:\s*\{([\s\S]*?)\n\s*\}/);
    let metingConfig = {
        server: 'netease',
        type: 'playlist',
        id: '',
        apis: [],
    };

    if (metingMatch) {
        const metingContent = metingMatch[1];
        const serverMatch = metingContent.match(/server:\s*['"`]([^'"`]+)['"`]/);
        const typeMatch = metingContent.match(/type:\s*['"`]([^'"`]+)['"`]/);
        const idMatch = metingContent.match(/id:\s*['"`]([^'"`]+)['"`]/);

        // 提取 apis 数组
        const apisMatch = metingContent.match(/apis:\s*\[([\s\S]*?)\]/);
        let apis = [];
        if (apisMatch) {
            apis = apisMatch[1]
                .match(/['"`]([^'"`]+)['"`]/g)
                ?.map(s => s.replace(/['"`]/g, '').trim())
                .filter(Boolean) || [];
        }

        metingConfig = {
            server: serverMatch ? serverMatch[1].trim() : metingConfig.server,
            type: typeMatch ? typeMatch[1].trim() : metingConfig.type,
            id: idMatch ? idMatch[1].trim() : metingConfig.id,
            apis: apis,
        };
    }

    // Local 配置 - 提取 URL 数组
    const localMatch = musicContent.match(/local:\s*\[([\s\S]*?)\]/);
    let localUrls = [];
    if (localMatch) {
        localUrls = localMatch[1]
            .match(/['"`]([^'"`]+)['"`]/g)
            ?.map(s => s.replace(/['"`]/g, '').trim())
            .filter(Boolean) || [];
    }

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : false,
        volume: volumeMatch ? parseFloat(volumeMatch[1]) : 0.5,
        autoplay: autoplayMatch ? autoplayMatch[1] === 'true' : false,
        playMode: playModeMatch ? playModeMatch[1].trim() : 'list',
        mode: modeMatch ? modeMatch[1].trim() : 'meting',
        meting: metingConfig,
        local: localUrls,
    };
}

// 提取 Favicon 配置
function extractFaviconConfig() {
    const faviconMatch = configContent.match(/favicon:\s*\{([\s\S]*?)\n\s*\}/);
    if (!faviconMatch) {
        return { path: '' };
    }

    const faviconContent = faviconMatch[1];
    const pathMatch = faviconContent.match(/path:\s*['"`]([^'"`]*)['"`]/);

    return {
        path: pathMatch ? pathMatch[1].trim() : '',
    };
}

// 提取 Nav 配置
function extractNavConfig() {
    // 使用更精确的模式匹配 nav 配置块
    const navMatch = configContent.match(/nav:\s*\{([\s\S]*?)(?=\n\s*\},?\s*\n\s*\/\/ =|\n\s*\},?\s*$)/);
    if (!navMatch) {
        return {
            enabled: true,
            brand: { showPrompt: true, hoverText: '~/whoami' },
            menus: []
        };
    }

    const navContent = navMatch[1];

    const enabledMatch = navContent.match(/enabled:\s*(true|false)/);

    // 提取 brand 配置
    const brandMatch = navContent.match(/brand:\s*\{([^}]+)\}/);
    let brand = { showPrompt: true, hoverText: '~/whoami' };
    if (brandMatch) {
        const brandContent = brandMatch[1];
        const showPromptMatch = brandContent.match(/showPrompt:\s*(true|false)/);
        const hoverTextMatch = brandContent.match(/hoverText:\s*['"`]([^'"`]+)['"`]/);
        brand = {
            showPrompt: showPromptMatch ? showPromptMatch[1] === 'true' : true,
            hoverText: hoverTextMatch ? hoverTextMatch[1].trim() : '~/whoami'
        };
    }

    // 提取 menus 配置
    let menus = [];
    const menusStartMatch = navContent.match(/menus:\s*\[/);
    if (menusStartMatch) {
        const startIndex = menusStartMatch.index + menusStartMatch[0].length;
        let depth = 1;
        let endIndex = startIndex;

        for (let i = startIndex; i < navContent.length && depth > 0; i++) {
            const char = navContent[i];
            if (char === '[' || char === '{') depth++;
            else if (char === ']' || char === '}') depth--;
            if (depth === 0) {
                endIndex = i;
                break;
            }
        }

        let menusContent = navContent.substring(startIndex, endIndex);

        // 移除注释（但不影响字符串内的内容）
        // 先移除多行注释 /* ... */
        menusContent = menusContent.replace(/\/\*[\s\S]*?\*\//g, '');
        // 再移除单行注释 // ...（只匹配行首空白后的 // 或独立一行的 //）
        // 使用更精确的方式：不匹配字符串内的 //
        menusContent = menusContent.split('\n').map(line => {
            // 找到第一个不在字符串内的 //
            let inString = false;
            let stringChar = '';
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if ((char === '"' || char === "'" || char === '`') && (i === 0 || line[i-1] !== '\\')) {
                    if (!inString) {
                        inString = true;
                        stringChar = char;
                    } else if (char === stringChar) {
                        inString = false;
                    }
                }
                if (!inString && line.substring(i, i + 2) === '//') {
                    return line.substring(0, i).trimEnd();
                }
            }
            return line;
        }).join('\n');

        // 使用更精确的方式解析每个菜单对象
        // 找到所有顶层菜单对象的开始位置
        let menuDepth = 0;
        let currentMenuStart = -1;
        const menuBlocks = [];

        for (let i = 0; i < menusContent.length; i++) {
            const char = menusContent[i];
            if (char === '{') {
                if (menuDepth === 0) {
                    currentMenuStart = i;
                }
                menuDepth++;
            } else if (char === '}') {
                menuDepth--;
                if (menuDepth === 0 && currentMenuStart >= 0) {
                    menuBlocks.push(menusContent.substring(currentMenuStart, i + 1));
                    currentMenuStart = -1;
                }
            }
        }

        // 解析每个菜单块
        for (const menuBlock of menuBlocks) {
            const nameMatch = menuBlock.match(/name:\s*['"`]([^'"`]+)['"`]/);
            const iconMatch = menuBlock.match(/icon:\s*['"`]([^'"`]+)['"`]/);

            // 解析 items 数组
            let menuItems = [];
            const itemsStartMatch = menuBlock.match(/items:\s*\[/);
            if (itemsStartMatch) {
                const itemsStartIndex = itemsStartMatch.index + itemsStartMatch[0].length;
                let itemsDepth = 1;
                let itemsEndIndex = itemsStartIndex;

                for (let j = itemsStartIndex; j < menuBlock.length && itemsDepth > 0; j++) {
                    const char = menuBlock[j];
                    if (char === '[' || char === '{') itemsDepth++;
                    else if (char === ']' || char === '}') itemsDepth--;
                    if (itemsDepth === 0) {
                        itemsEndIndex = j;
                        break;
                    }
                }

                const itemsContent = menuBlock.substring(itemsStartIndex, itemsEndIndex);

                // 解析每个 item 对象
                let itemDepth = 0;
                let currentItemStart = -1;

                for (let k = 0; k < itemsContent.length; k++) {
                    const char = itemsContent[k];
                    if (char === '{') {
                        if (itemDepth === 0) {
                            currentItemStart = k;
                        }
                        itemDepth++;
                    } else if (char === '}') {
                        itemDepth--;
                        if (itemDepth === 0 && currentItemStart >= 0) {
                            const itemBlock = itemsContent.substring(currentItemStart, k + 1);

                            const iNameMatch = itemBlock.match(/name:\s*['"`]([^'"`]+)['"`]/);
                            const iUrlMatch = itemBlock.match(/url:\s*['"`]([^'"`]+)['"`]/);
                            const iExternalMatch = itemBlock.match(/external:\s*(true|false)/);

                            if (iNameMatch && iUrlMatch) {
                                menuItems.push({
                                    name: iNameMatch[1].trim(),
                                    url: iUrlMatch[1].trim(),
                                    external: iExternalMatch ? iExternalMatch[1] === 'true' : true
                                });
                            }

                            currentItemStart = -1;
                        }
                    }
                }
            }

            if (nameMatch) {
                menus.push({
                    name: nameMatch[1].trim(),
                    icon: iconMatch ? iconMatch[1].trim() : '',
                    items: menuItems
                });
            }
        }
    }

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : true,
        brand: brand,
        menus: menus
    };
}

// 生成导航链接 HTML（桌面端）
function generateNavLinksHTML(rssConfig, projectsConfig) {
    let html = '';

    // Posts 链接
    if (rssConfig.enabled) {
        html += '\n                    <a href="#rss-section" class="nav-link" data-section="rss-section">文章</a>';
    }

    // Projects 链接
    if (projectsConfig.enabled) {
        html += '\n                    <a href="#projects-section" class="nav-link" data-section="projects-section">项目</a>';
    }

    return html;
}

// 生成自定义菜单 HTML（桌面端）
function generateCustomMenusHTML(menus) {
    if (!menus || menus.length === 0) return '';

    return menus.map(menu => {
        const itemsHTML = menu.items.map(item => {
            const externalAttrs = item.external ? 'target="_blank" rel="noopener noreferrer"' : '';
            return `                    <a href="${escapeHTML(item.url)}" ${externalAttrs}>${escapeHTML(item.name)}</a>`;
        }).join('\n                    ');

        return `
                <div class="nav-dropdown">
                    <button class="nav-dropdown-toggle">
                        <span>${escapeHTML(menu.name)}</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                    <div class="nav-dropdown-menu">
                        ${itemsHTML}
                    </div>
                </div>`;
    }).join('');
}

// 生成自定义菜单 HTML（移动端下拉菜单样式）
function generateCustomMenusMobileDropdownHTML(menus) {
    if (!menus || menus.length === 0) return '';

    return menus.map(menu => {
        const menuIcon = menu.icon || 'fa-solid fa-folder';
        const itemsHTML = menu.items.map(item => {
            const externalAttrs = item.external ? 'target="_blank" rel="noopener noreferrer"' : '';
            return `<a href="${escapeHTML(item.url)}" class="nav-mobile-link" ${externalAttrs}><span>${escapeHTML(item.name)}</span></a>`;
        }).join('\n                ');

        return `
            <div class="nav-mobile-dropdown-group">
                <button class="nav-mobile-dropdown-toggle">
                    <i class="${escapeHTML(menuIcon)}"></i>
                    <span class="toggle-text">${escapeHTML(menu.name)}</span>
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
                <div class="nav-mobile-dropdown-items">
                    ${itemsHTML}
                </div>
            </div>`;
    }).join('');
}

// 生成项目展示 HTML（仪表盘式布局）
function generateProjectsHTML(repos, projectsConfig, contributionData, contributionConfig) {
    if (!projectsConfig.enabled) {
        return '';
    }
    
    // 即使没有仓库数据，也要显示项目区域但带错误提示
    if (repos.length === 0) {
        return `                <div class="divider divider-compact lazy-load" data-delay="4"></div>

                <!-- Projects Section - Dashboard Style -->
                <div class="projects-section lazy-load error-state" id="projects-section" data-delay="4">
                    <div class="projects-header">
                        <i class="${escapeHTML(projectsConfig.titleIcon)}"></i>
                        <span class="projects-title">${escapeHTML(projectsConfig.titleText)}</span>
                        <span class="section-count">0 repos</span>
                    </div>
                    <div class="error-message">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <p>无法加载 GitHub 项目数据。请检查配置或稍后重试。</p>
                    </div>
                </div>`;
    }

    // 生成贡献图格子
    let contributionCells = '';

    if (contributionConfig && contributionConfig.enabled) {
        const levels = contributionData?.levels || [];
        const counts = contributionData?.counts || [];
        const dates = contributionData?.dates || [];

        for (let i = 0; i < 78; i++) {
            const level = levels[i] ?? 0;
            const count = counts[i] ?? 0;
            const date = dates[i] || '';
            const title = count > 0 ? `${count} 次贡献于 ${date}` : `无贡献于 ${date}`;
            contributionCells += `<div class="contribution-cell" data-level="${level}" title="${title}"></div>`;
        }
    } else {
        // 禁用时显示空格子
        for (let i = 0; i < 78; i++) {
            contributionCells += `<div class="contribution-cell" data-level="0"></div>`;
        }
    }

    // 第一个项目：大卡片（保留编辑器标签页风格）
    const mainRepo = repos[0];
    const mainStarsText = mainRepo.stars >= 1000 ? formatNumber(mainRepo.stars) : mainRepo.stars.toString();
    const mainForksText = mainRepo.forks >= 1000 ? formatNumber(mainRepo.forks) : mainRepo.forks.toString();

    // 计算进度条宽度（基于star数的相对比例，最小为10%）
    const maxStars = Math.max(...repos.map(r => r.stars), 1); // 确保最小值为1避免除零
    const progressWidth = Math.max(Math.min((mainRepo.stars / maxStars) * 100, 100), 10);

    const mainCardHTML = `                    <a href="${escapeHTML(mainRepo.url)}" class="project-card project-card-main" target="_blank" rel="noopener noreferrer" aria-label="查看项目：${escapeHTML(mainRepo.name)}">
                        <div class="project-tab">
                            <i class="fa-solid fa-file-code" aria-hidden="true"></i>
                            <span class="project-name">${escapeHTML(mainRepo.name)}</span>
                            <div class="project-stats">
                                <span class="project-stat"><i class="fa-solid fa-star" aria-hidden="true"></i> ${mainStarsText}</span>
                                <span class="project-stat"><i class="fa-solid fa-code-fork" aria-hidden="true"></i> ${mainForksText}</span>
                            </div>
                        </div>
                        <div class="project-body">
                            <p class="project-description">${escapeHTML(mainRepo.description)}</p>
                            <div class="project-progress">
                                <div class="project-progress-bar" style="width: ${progressWidth}%"></div>
                            </div>
                        </div>
                        <div class="project-footer">
                            <span class="project-language">
                                <span class="language-dot" style="background-color: ${mainRepo.languageColor}" aria-hidden="true"></span>
                                ${escapeHTML(mainRepo.language || 'Unknown')}
                            </span>
                            <i class="fa-solid fa-arrow-up-right-from-square project-arrow" aria-hidden="true"></i>
                        </div>
                    </a>`;

    // 迷你卡片轮播容器
    const miniCardsCount = repos.slice(1).length;
    const hasCarousel = miniCardsCount > 0;

    // 生成迷你卡片
    const miniCardsHTML = repos.slice(1).map((repo, index) => {
        const starsText = repo.stars >= 1000 ? formatNumber(repo.stars) : repo.stars.toString();
        return `                        <a href="${escapeHTML(repo.url)}" class="project-card project-card-mini" target="_blank" rel="noopener noreferrer" data-index="${index}" aria-label="查看项目：${escapeHTML(repo.name)}">
                            <div class="project-mini-header">
                                <i class="fa-solid fa-file-code" aria-hidden="true"></i>
                                <span class="project-mini-stars"><i class="fa-solid fa-star" aria-hidden="true"></i> ${starsText}</span>
                            </div>
                            <div class="project-mini-body">
                                <span class="project-mini-name">${escapeHTML(repo.name)}</span>
                            </div>
                            <div class="project-mini-footer">
                                <span class="project-language project-language-mini">
                                    <span class="language-dot language-dot-mini" style="background-color: ${repo.languageColor}" aria-hidden="true"></span>
                                    ${escapeHTML(repo.language || 'Unknown')}
                                </span>
                            </div>
                        </a>`;
    }).join('\n');

    return `                <div class="divider divider-compact lazy-load" data-delay="4"></div>

                <!-- Projects Section - Dashboard Style -->
                <div class="projects-section lazy-load" id="projects-section" data-delay="4">
                    <div class="projects-header">
                        <i class="${escapeHTML(projectsConfig.titleIcon)}"></i>
                        <span class="projects-title">${escapeHTML(projectsConfig.titleText)}</span>
                        <span class="section-count">${repos.length} repos</span>
                    </div>
                    <!-- Contribution Graph -->
                    <div class="contribution-graph" aria-hidden="true">
                        ${contributionCells}
                    </div>
                    <!-- Projects Container -->
                    <div class="projects-container">
                        <!-- Main Project Card -->
${mainCardHTML}
                        <!-- Mini Cards Carousel -->
${hasCarousel ? `                        <div class="projects-carousel-wrapper" data-total="${miniCardsCount}">
                            <div class="carousel-track">
${miniCardsHTML}
                            </div>
                            <div class="carousel-indicators" role="tablist" aria-label="项目轮播导航"></div>
                        </div>` : ''}
                    </div>
                </div>`;
}

// 生成骨架屏项目占位 HTML（仪表盘式布局）
function generateSkeletonProjectsHTML(projectsConfig) {
    if (!projectsConfig.enabled || !projectsConfig.githubUser) {
        return '';
    }

    const count = Math.min(projectsConfig.count || 4, 4);

    // 贡献图骨架
    let contributionCells = '';
    for (let i = 0; i < 78; i++) {
        contributionCells += '<div class="contribution-cell skeleton"></div>';
    }

    // 主卡片骨架
    const mainCardSkeleton = '<div class="skeleton-project-main skeleton"></div>';

    // 迷你卡片骨架（轮播样式）
    const miniCardsSkeleton = Array(Math.max(0, count - 1))
        .fill('<div class="skeleton-project-mini skeleton"></div>')
        .join('\n                            ');

    return `<div class="skeleton-divider skeleton"></div>

                <!-- Projects Skeleton -->
                <div class="skeleton-projects-section">
                    <div class="skeleton-projects-header skeleton"></div>
                    <div class="skeleton-contribution-graph">
                        ${contributionCells}
                    </div>
                    <div class="skeleton-projects-container">
                        ${mainCardSkeleton}
                        <div class="skeleton-carousel">
                            <div class="skeleton-carousel-track">
                            ${miniCardsSkeleton}
                            </div>
                        </div>
                    </div>
                </div>`;
}

// HTML 转义函数
function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 提取 site 配置块
function extractSiteConfig() {
    const siteMatch = configContent.match(/site:\s*\{([\s\S]*?)\n\s*\},?\n/);
    if (!siteMatch) {
        return {
            name: 'MoeWah',
            tagline: '技术博主 / 开源爱好者 / AI 探索者',
            url: '',
            ogImage: '/images/avatar.webp',
        };
    }
    const content = siteMatch[1];
    const urlValue = extractStringValue(content, 'url');
    return {
        name: extractStringValue(content, 'name') || 'MoeWah',
        tagline: extractStringValue(content, 'tagline') || '技术博主 / 开源爱好者 / AI 探索者',
        // 空字符串表示使用相对路径，undefined/null 才使用默认值
        url: urlValue !== undefined && urlValue !== null ? urlValue : '',
        ogImage: extractStringValue(content, 'ogImage') || '/images/avatar.webp',
    };
}

// 提取 pages 配置块
function extractPagesConfig() {
    // 找到 pages: 的位置
    const pagesStart = configContent.indexOf('pages:');
    if (pagesStart === -1) {
        console.warn('⚠️ 无法找到 pages 配置');
        return {};
    }

    // 找到第一个 { 的位置
    const startBrace = configContent.indexOf('{', pagesStart);
    if (startBrace === -1) {
        console.warn('⚠️ pages 配置格式错误');
        return {};
    }

    // 使用括号匹配找到对应的 }
    let depth = 0;
    let endBrace = -1;
    for (let i = startBrace; i < configContent.length; i++) {
        if (configContent[i] === '{') depth++;
        else if (configContent[i] === '}') {
            depth--;
            if (depth === 0) {
                endBrace = i;
                break;
            }
        }
    }

    if (endBrace === -1) {
        console.warn('⚠️ pages 配置括号不匹配');
        return {};
    }

    const pagesContent = configContent.substring(startBrace + 1, endBrace);
    const pages = {};

    // 手动解析页面对象，更可靠
    let i = 0;
    while (i < pagesContent.length) {
        // 跳过空白和注释
        while (i < pagesContent.length && /[\s\n]/.test(pagesContent[i])) i++;
        if (i >= pagesContent.length) break;

        // 跳过单行注释
        if (pagesContent[i] === '/' && pagesContent[i + 1] === '/') {
            while (i < pagesContent.length && pagesContent[i] !== '\n') i++;
            continue;
        }

        // 提取键名
        let key = '';
        if (pagesContent[i] === "'" || pagesContent[i] === '"') {
            const quote = pagesContent[i];
            i++;
            while (i < pagesContent.length && pagesContent[i] !== quote) {
                key += pagesContent[i];
                i++;
            }
            i++; // 跳过结束引号
        } else if (/[a-zA-Z0-9_]/.test(pagesContent[i])) {
            while (i < pagesContent.length && /[a-zA-Z0-9_]/.test(pagesContent[i])) {
                key += pagesContent[i];
                i++;
            }
        } else {
            i++;
            continue;
        }

        // 跳过冒号和空白
        while (i < pagesContent.length && /[\s:\n]/.test(pagesContent[i])) i++;

        // 检查是否是对象开始
        if (pagesContent[i] !== '{') {
            continue;
        }

        // 找到对象结束位置（处理嵌套）
        let objDepth = 1;
        const objectStart = i;
        i++;
        while (i < pagesContent.length && objDepth > 0) {
            if (pagesContent[i] === '{') objDepth++;
            else if (pagesContent[i] === '}') objDepth--;
            i++;
        }

        const objectContent = pagesContent.substring(objectStart + 1, i - 1);

        // 提取对象属性
        if (key) {
            pages[key] = {
                title: extractStringValue(objectContent, 'title') || key,
                icon: extractStringValue(objectContent, 'icon') || '',
                tagline: extractStringValue(objectContent, 'tagline') || '',
                description: extractStringValue(objectContent, 'description') || '',
                keywords: extractArrayFromContent(objectContent, 'keywords'),
                robots: extractStringValue(objectContent, 'robots') || '',
            };
        }

        // 跳过逗号
        while (i < pagesContent.length && /[\s,\n]/.test(pagesContent[i])) i++;
    }

    console.log('📋 提取到 pages 配置:', Object.keys(pages).join(', '));
    return pages;
}

// 从页面内容中提取数组
function extractArrayFromContent(content, key) {
    const pattern = new RegExp(key + ':\\s*\\[([\\s\\S]*?)\\]');
    const match = content.match(pattern);
    if (!match || !match[1]) {
        return [];
    }

    const arrayContent = match[1];
    const items = [];

    // 匹配三种引号类型
    const stringPattern = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

    let stringMatch;
    while ((stringMatch = stringPattern.exec(arrayContent)) !== null) {
        const str = stringMatch[0];
        const content = str.slice(1, -1);
        items.push(content.replace(/\\(['"`\\])/g, '$1').trim());
    }

    return items;
}

// 从 config.js 提取所有配置
const config = {
    // Site - 站点核心信息
    site: extractSiteConfig(),
    // 兼容旧字段（从 site.url 同步）
    siteUrl: extractSiteConfig().url,

    // SEO（首页专用）
    title: extractString(/title:\s*['"`]([^'"`]+)['"`]/, 'MoeWah - 技术博主 / 开源爱好者 / AI 探索者'),
    description: extractString(/description:\s*['"`]([^'"`]+)['"`]/, 'Hi，欢迎访问 MoeWah 的个人主页'),
    keywords: extractArray(/keywords:\s*\[([\s\S]*?)\]/, ['MoeWah', '技术博客', 'Astro', 'Docker']),
    ogTitle: extractNestedString(/og:\s*\{([\s\S]*?)\}/, 'title', 'MoeWah - 个人主页'),
    ogDescription: extractNestedString(/og:\s*\{([\s\S]*?)\}/, 'description', '开源爱好者 / Astro爱好者 / AI探索者'),
    ogImage: extractNestedString(/og:\s*\{([\s\S]*?)\}/, 'image', 'https://www.moewah.com/images/avatar.webp'),

    // Pages - 独立页面配置
    pages: extractPagesConfig(),

    // Profile
    name: extractNestedString(/profile:\s*\{([\s\S]*?)\}/, 'name', 'MoeWah'),
    avatar: extractNestedString(/profile:\s*\{([\s\S]*?)\}/, 'avatar', 'images/avatar.webp'),
    taglinePrefix: extractNestedString(/tagline:\s*\{([\s\S]*?)\}/, 'prefix', '🐾'),
    taglineHighlight: extractNestedString(/tagline:\s*\{([\s\S]*?)\}/, 'highlight', '万物皆可萌！'),

    // Identity & Interests
    identity: extractArray(/identity:\s*\[([\s\S]*?)\]/, ['开源爱好者', 'Astro爱好者', 'AI探索者']),
    interests: extractArray(/interests:\s*\[([\s\S]*?)\]/, ['Astro & 前端开发', 'Docker & 容器技术']),
    gear: extractArray(/gear:\s*\[([\s\S]*?)\]/, []),

    // Favicon
    favicon: extractFaviconConfig(),

    // Terminal
    terminalTitle: extractNestedString(/terminal:\s*\{([\s\S]*?)\}/, 'title', '🐾 meow@tribe:~|'),

    // Links
    links: extractLinks(),
    linksConfig: extractLinksConfig(),

    // Donation
    donation: extractDonationConfig(),

    // Footer - Copyright
    footerCopyrightYear: extractNestedString(/copyright:\s*\{([\s\S]*?)\}/, 'year', '2026'),
    footerCopyrightName: extractNestedString(/copyright:\s*\{([\s\S]*?)\}/, 'name', 'MoeWah'),
    footerCopyrightUrl: extractNestedString(/copyright:\s*\{([\s\S]*?)\}/, 'url', 'https://www.moewah.com/'),
    // Footer - ICP
    footerIcpEnabled: extractNestedBoolean(/icp:\s*\{([\s\S]*?)\}/, 'enabled', false),
    footerIcpNumber: extractNestedString(/icp:\s*\{([\s\S]*?)\}/, 'number', ''),
    footerIcpUrl: extractNestedString(/icp:\s*\{([\s\S]*?)\}/, 'url', 'https://beian.miit.gov.cn/'),

    // Notice
    noticeEnabled: extractNestedString(/notice:\s*\{([\s\S]*?)\}/, 'enabled', 'true') === 'true',
    noticeType: extractNestedString(/notice:\s*\{([\s\S]*?)\}/, 'type', 'warning'),
    noticeIcon: extractNestedString(/notice:\s*\{([\s\S]*?)\}/, 'icon', 'fa-solid fa-shield-halved'),
    noticeText: extractNestedString(/notice:\s*\{([\s\S]*?)\}/, 'text', '声明：本人不会主动邀请或联系任何人，任何冒用本人名义的一切事物，请务必谨防受骗！'),

    // RSS
    rss: extractRSSConfig(),

    // Projects
    projects: extractProjectsConfig(),

    // Contribution
    contribution: extractContributionConfig(),

    // Moments
    moments: extractMomentsConfig(),

    // Guestbook
    guestbook: extractGuestbookConfig(),

    // Music
    music: extractMusicConfig(),

    // Nav
    nav: extractNavConfig(),

    // Analytics
    gaEnabled: extractAnalyticsValue('googleAnalytics', 'enabled') === 'true',
    gaId: extractAnalyticsValue('googleAnalytics', 'id'),
    clarityEnabled: extractAnalyticsValue('microsoftClarity', 'enabled') === 'true',
    clarityId: extractAnalyticsValue('microsoftClarity', 'id'),
    umami: extractUmamiScript(),
    customScripts: extractCustomScripts()
};

/**
 * 页面 SEO 生成函数
 * 根据页面类型生成统一的 SEO 元数据
 * @param {string} pageKey - 页面标识（'home' | '404' | 'moments' 等）
 * @returns {object} - SEO 配置对象
 */
function generatePageSEO(pageKey) {
    const siteName = config.site.name;
    const siteTagline = config.site.tagline;
    const siteOgImage = config.site.ogImage;

    // 首页使用完整自定义配置
    if (pageKey === 'home') {
        return {
            title: config.title,
            description: config.description,
            keywords: config.keywords.join(', '),
            ogTitle: config.ogTitle,
            ogDescription: config.ogDescription,
            ogImage: config.ogImage,
            robots: ''
        };
    }

    // 独立页面 - 从 pages 配置读取
    const pageConfig = config.pages[pageKey];
    if (pageConfig) {
        // 标题格式: "页面标题 | 站点名称"
        const pageTitle = pageConfig.title || pageKey;
        const title = `${pageTitle} | ${siteName}`;

        // 描述: 使用页面描述，或生成默认描述
        const description = pageConfig.description || `${pageTitle} - ${siteName}`;

        // 关键词: 页面关键词 + 站点名称（避免重复）
        let keywords = siteName;
        if (pageConfig.keywords && pageConfig.keywords.length > 0) {
            // 如果站点名称不在关键词列表中，则添加
            const keywordsList = pageConfig.keywords.includes(siteName)
                ? pageConfig.keywords
                : [...pageConfig.keywords, siteName];
            keywords = keywordsList.join(', ');
        }

        // OG 信息: 使用页面标题，共用站点 OG 图片
        const ogTitle = title;
        const ogDescription = description;
        const ogImage = siteOgImage;

        return {
            title,
            description,
            keywords,
            ogTitle,
            ogDescription,
            ogImage,
            robots: pageConfig.robots || ''
        };
    }

    // 默认回退
    return {
        title: `${siteName}`,
        description: siteTagline,
        keywords: siteName,
        ogTitle: `${siteName} - ${siteTagline}`,
        ogDescription: siteTagline,
        ogImage: siteOgImage,
        robots: ''
    };
}

/**
 * 生成 SEO meta 标签 HTML
 * @param {object} seo - SEO 配置对象
 * @param {string} pageUrl - 页面完整 URL（用于 og:url）
 * @returns {string} - SEO meta 标签 HTML
 */
function generateSEOMetaHTML(seo, pageUrl = '') {
    let html = `<meta name="description" content="${seo.description}" />\n`;

    if (seo.keywords) {
        html += `        <meta name="keywords" content="${seo.keywords}" />\n`;
    }

    if (seo.robots) {
        html += `        <meta name="robots" content="${seo.robots}" />\n`;
    }

    // Open Graph
    html += `\n        <!-- Open Graph / Facebook -->\n`;
    html += `        <meta property="og:type" content="website" />\n`;
    if (pageUrl) {
        html += `        <meta property="og:url" content="${pageUrl}" />\n`;
    }
    html += `        <meta property="og:title" content="${seo.ogTitle}" />\n`;
    html += `        <meta property="og:description" content="${seo.ogDescription}" />\n`;
    html += `        <meta property="og:image" content="${seo.ogImage}" />\n`;

    // Twitter
    html += `\n        <!-- Twitter -->\n`;
    html += `        <meta property="twitter:card" content="summary_large_image" />\n`;
    if (pageUrl) {
        html += `        <meta property="twitter:url" content="${pageUrl}" />\n`;
    }
    html += `        <meta property="twitter:title" content="${seo.ogTitle}" />\n`;
    html += `        <meta property="twitter:description" content="${seo.ogDescription}" />\n`;
    html += `        <meta property="twitter:image" content="${seo.ogImage}" />`;

    return html;
}

/**
 * URL 辅助函数 - 根据 siteUrl 配置生成资源路径
 * @param {string} path - 相对路径（如 "style.css", "images/avatar.webp"）
 * @returns {string} - 完整 URL 或相对路径
 */
function url(path) {
    if (!config.siteUrl) {
        return path;
    }
    // 确保 siteUrl 不以 / 结尾，path 以 / 开头时处理正确
    const baseUrl = config.siteUrl.replace(/\/$/, '');
    // 如果 path 已经以 / 开头，直接拼接；否则添加 /
    if (path.startsWith('/')) {
        return baseUrl + path;
    }
    return baseUrl + '/' + path;
}

/**
 * 重写 HTML 中的资源 URL
 * 当 siteUrl 配置时，将相对路径转换为绝对路径
 * @param {string} html - HTML 内容
 * @param {string} basePath - 基础路径（用于子目录页面，如 moments/ 使用 '../'）- 当 siteUrl 配置时忽略
 * @returns {string} - 重写后的 HTML
 */
function rewriteAssetUrls(html, basePath = '') {
    if (!config.siteUrl) {
        return html;
    }

    const baseUrl = config.siteUrl.replace(/\/$/, '');

    // 规范化路径：移除 ./ 和 ../ 前缀（当使用绝对 URL 时不需要这些）
    const normalizePath = (url) => {
        // 移除 ./ 前缀
        if (url.startsWith('./')) {
            return url.slice(2);
        }
        // 移除 ../ 前缀（可能有多个）
        if (url.startsWith('../')) {
            return url.replace(/^(\.\.\/)+/, '');
        }
        return url;
    };

    // 匹配需要重写的资源属性
    // 排除：外部链接、站点根路径、hash 链接、data URI、mailto:、tel: 等
    const shouldRewrite = (url) => {
        if (!url) return false;
        // 排除已经是绝对路径的
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) return false;
        // 排除站点根路径（以 / 开头但不以 // 开头）
        if (url.startsWith('/') && !url.startsWith('//')) return false;
        // 排除特殊协议
        if (url.startsWith('data:') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('javascript:')) return false;
        // 排除 hash 链接
        if (url.startsWith('#')) return false;
        return true;
    };

    // 重写 href 属性
    html = html.replace(/href="([^"]*)"/g, (match, url) => {
        if (shouldRewrite(url)) {
            const normalizedPath = normalizePath(url);
            return `href="${baseUrl}/${normalizedPath}"`;
        }
        return match;
    });

    // 重写 src 属性
    html = html.replace(/src="([^"]*)"/g, (match, url) => {
        if (shouldRewrite(url)) {
            const normalizedPath = normalizePath(url);
            return `src="${baseUrl}/${normalizedPath}"`;
        }
        return match;
    });

    // 重写 CSS 中的 url()（在 style 属性和 <style> 标签中）
    html = html.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, (match, url) => {
        if (shouldRewrite(url)) {
            const normalizedPath = normalizePath(url);
            return `url('${baseUrl}/${normalizedPath}')`;
        }
        return match;
    });

    return html;
}

// 读取模板
const templatePath = path.join(__dirname, '../templates/index.template.html');
if (!fs.existsSync(templatePath)) {
    console.error('❌ 找不到 templates/index.template.html');
    process.exit(1);
}

const templateRaw = fs.readFileSync(templatePath, 'utf8');
// 先渲染 partials（{{> partialName}}）
const template = renderPartials(templateRaw);

// 主构建函数（异步）
async function build() {
    console.log('🏗️  开始构建...');

    // 显示压缩配置
    if (minifyConfig.minify) {
        console.log('📦 压缩配置:');
        console.log('   JS: ' + (minifyConfig.minifyJS ? '✓' : '✗'));
        console.log('   CSS: ' + (minifyConfig.minifyCSS ? '✓' : '✗'));
        console.log('   HTML: ' + (minifyConfig.minifyHTML ? '✓' : '✗'));
        console.log('   图片: ' + (minifyConfig.compressImages ? '✓ (质量: ' + minifyConfig.imageQuality + '%)' : '✗'));
    } else {
        console.log('📦 压缩: 已禁用');
    }

    // 显示站点 URL 配置
    if (config.siteUrl) {
        console.log('🌐 静态资源 URL: ' + config.siteUrl + ' (绝对路径模式)');
    } else {
        console.log('🌐 静态资源 URL: 相对路径模式');
    }

    // 获取 RSS 文章
    let rssArticles = [];
    if (config.rss.enabled && config.rss.url) {
        rssArticles = await getRSSArticles(config.rss.url, config.rss.count);
    }

    // 获取 GitHub 项目信息和贡献数据
    let githubRepos = [];
    let contributionData = null;

    if (config.projects.enabled && config.projects.githubUser) {
        const username = parseGitHubUser(config.projects.githubUser);
        if (username) {
            githubRepos = await fetchUserRepos(
                username,
                config.projects.count,
                config.projects.exclude
            );
            
            // 获取贡献数据
            if (config.contribution.enabled) {
                const contribUser = config.contribution.githubUser 
                    ? parseGitHubUser(config.contribution.githubUser) || username
                    : username;
                contributionData = await fetchUserContributions(contribUser, config.contribution.useRealData);
            }
        }
    }

    // 如果 contribution 启用但 projects 未配置，单独获取贡献数据
    if (config.contribution.enabled && !contributionData && config.contribution.githubUser) {
        const contribUser = parseGitHubUser(config.contribution.githubUser);
        if (contribUser) {
            contributionData = await fetchUserContributions(contribUser, config.contribution.useRealData);
        }
    }

    // 确保贡献数据始终有值
    if (!contributionData) {
        contributionData = await fetchUserContributions(null, false);
    }

    // 替换所有占位符
    let html = template
        // Theme Init Script (必须在所有 CSS 之前执行，防止闪烁)
        .replace(/{{THEME_INIT_SCRIPT}}/g, generateThemeInitScript())

        // 默认主题 CSS 变量（写入 Critical CSS）
        .replace(/{{DEFAULT_THEME_VARS}}/g, generateDefaultThemeCSS())

        // SEO
        .replace(/{{TITLE}}/g, config.title)
        .replace(/{{DESCRIPTION}}/g, config.description)
        .replace(/{{KEYWORDS}}/g, config.keywords.join(', '))
        .replace(/{{OG_TITLE}}/g, config.ogTitle)
        .replace(/{{OG_DESCRIPTION}}/g, config.ogDescription)
        .replace(/{{OG_IMAGE}}/g, config.ogImage)

        // Profile
        .replace(/{{NAME}}/g, config.name)
        .replace(/{{AVATAR}}/g, config.avatar)
        .replace(/{{TAGLINE_PREFIX}}/g, config.taglinePrefix)
        .replace(/{{TAGLINE_HIGHLIGHT}}/g, config.taglineHighlight)

        // Terminal
        .replace(/{{TERMINAL_TITLE}}/g, config.terminalTitle)
        .replace(/{{IDENTITY}}/g, config.identity.join(' / '))
        .replace(/{{INTERESTS}}/g, config.interests.join(' / '))
        .replace(/{{GEAR_SECTION}}/g, config.gear.length > 0 ? `
                        <div class="prompt-line" style="margin-top: 8px;">
                            <span class="prompt">$ </span>
                            <span class="command">cat gear.txt</span>
                        </div>
                        <div class="output">${config.gear.join(' / ')}</div>` : '')

        // Music Player
        .replace(/{{MUSIC_TOGGLE_ICON}}/g, generateMusicToggleIconHTML(config.music))
        .replace(/{{MUSIC_PLAYER}}/g, generateMusicPlayerHTML(config.music))
        .replace(/{{SKELETON_MUSIC}}/g, generateSkeletonMusicHTML(config.music))

        // Links
        .replace(/{{LINKS_SECTION}}/g, generateLinksSectionHTML(config.links, config.linksConfig))
        .replace(/{{SKELETON_LINKS_SECTION}}/g, generateSkeletonLinksSectionHTML(config.links, config.linksConfig))

        // Donation
        .replace(/{{DONATION}}/g, generateDonationHTML(config.donation))
        .replace(/{{SKELETON_DONATION}}/g, generateSkeletonDonationHTML(config.donation))
        .replace(/{{DONATION_MODAL}}/g, generateDonationModalHTML(config.donation))

        // Notice
        .replace(/{{NOTICE}}/g, generateNoticeHTML({
            enabled: config.noticeEnabled,
            type: config.noticeType,
            icon: config.noticeIcon,
            text: config.noticeText
        }))
        .replace(/{{SKELETON_NOTICE}}/g, generateSkeletonNoticeHTML({
            enabled: config.noticeEnabled
        }))

        // RSS
        .replace(/{{RSS}}/g, generateRSSHTML(rssArticles, config.rss))
        .replace(/{{SKELETON_RSS}}/g, generateSkeletonRSSHTML(config.rss))

        // Projects
        .replace(/{{PROJECTS}}/g, generateProjectsHTML(githubRepos, config.projects, contributionData, config.contribution))
        .replace(/{{SKELETON_PROJECTS}}/g, generateSkeletonProjectsHTML(config.projects))

        // Footer - 生成单行页脚 HTML
        .replace(/{{FOOTER_CONTENT}}/g, generateFooterHTML(config))

// Nav Links - 使用新的导航生成函数
        .replace(/{{NAV_HOME_URL}}/g, '/')
        .replace(/{{NAV_LINKS}}/g, generateNavLinks({ activePage: 'home', config }))
        .replace(/{{NAV_LINKS_MOBILE_DROPDOWN}}/g, generateNavLinksMobileDropdown({ activePage: 'home', config }))

        // Analytics
        .replace(/{{ANALYTICS}}/g, generateAnalyticsHTML(config));

    // 清理并创建 dist 目录
    cleanDist();

    // ========== Favicon 处理（必须） ==========
    console.log('🔘 处理 Favicon...');

    // 确保 images 目录存在
    const distImagesDir = path.join(distDir, 'images');
    if (!fs.existsSync(distImagesDir)) {
        fs.mkdirSync(distImagesDir, { recursive: true });
    }

    let faviconPath = '';
    let appleTouchPath = '';

    // 优先使用自定义 favicon（path 有值且文件存在）
    if (config.favicon.path) {
        const customFaviconSrc = path.join(rootDir, 'src', config.favicon.path);
        const customFaviconDest = path.join(distDir, 'images/favicon.ico');

        if (fs.existsSync(customFaviconSrc)) {
            fs.copyFileSync(customFaviconSrc, customFaviconDest);
            console.log('   ✓ 使用自定义 favicon: ' + config.favicon.path);
            faviconPath = 'images/favicon.ico';
        } else {
            console.log('   ⚠️ 自定义 favicon 文件不存在: src/' + config.favicon.path);
        }
    }

    // 没有自定义 favicon 时，从头像自动生成（默认行为）
    if (!faviconPath) {
        const avatarSrc = path.join(rootDir, 'src', config.avatar);
        const faviconDest = path.join(distDir, 'images/favicon.ico');

        if (fs.existsSync(avatarSrc)) {
            const avatarBuffer = fs.readFileSync(avatarSrc);
            const result = await generateFavicon(avatarBuffer, faviconDest);

            if (result.success) {
                console.log('   ✓ 从头像生成 favicon (尺寸: ' + result.sizes.join(', ') + ')');
                faviconPath = 'images/favicon.ico';
                appleTouchPath = 'images/favicon-apple-touch.png';
            } else {
                console.log('   ⚠️ favicon 生成失败');
            }
        } else {
            console.log('   ⚠️ 头像文件不存在: src/' + config.avatar);
        }
    }

    // 生成 favicon HTML 链接
    // basePath: 对于根目录页面为 ''，对于子目录页面（如 moments/）为 '../'
    // 当 siteUrl 配置时，使用绝对路径
    function generateFaviconLinks(basePath = '') {
        if (!faviconPath) return '';
        const iconUrl = config.siteUrl ? `${config.siteUrl.replace(/\/$/, '')}/${faviconPath}` : `${basePath}${faviconPath}`;
        if (appleTouchPath) {
            const appleUrl = config.siteUrl ? `${config.siteUrl.replace(/\/$/, '')}/${appleTouchPath}` : `${basePath}${appleTouchPath}`;
            return `<link rel="icon" type="image/x-icon" href="${iconUrl}" />
        <link rel="apple-touch-icon" href="${appleUrl}" />`;
        }
        return `<link rel="icon" type="image/x-icon" href="${iconUrl}" />`;
    }

    // 将 favicon 链接注入 HTML（首页使用根路径）
    html = html.replace(/{{FAVICON_LINKS}}/g, generateFaviconLinks(''));

    // 重写静态资源 URL（当 siteUrl 配置时）
    if (config.siteUrl) {
        html = rewriteAssetUrls(html, '');
    }

    // 压缩内联 CSS（<style> 标签内的 CSS，包括 Critical CSS）
    const htmlBeforeInlineCSS = Buffer.byteLength(html, 'utf8');
    html = processInlineCSS(html, minifyConfig);
    const htmlAfterInlineCSS = Buffer.byteLength(html, 'utf8');
    if (minifyConfig.minifyCSS && minifyConfig.minify) {
        console.log('📋 内联 CSS: ' + formatSize(htmlBeforeInlineCSS) + ' → ' + formatSize(htmlAfterInlineCSS) + ' (节省 ' + calcReduction(htmlBeforeInlineCSS, htmlAfterInlineCSS) + ')');
    }

    // 压缩内联 JS（<script> 标签内的 JS，包括 theme-init-script）
    const htmlBeforeInlineJS = Buffer.byteLength(html, 'utf8');
    html = await processInlineJS(html, minifyConfig);
    const htmlAfterInlineJS = Buffer.byteLength(html, 'utf8');
    if (minifyConfig.minifyJS && minifyConfig.minify) {
        console.log('📜 内联 JS: ' + formatSize(htmlBeforeInlineJS) + ' → ' + formatSize(htmlAfterInlineJS) + ' (节省 ' + calcReduction(htmlBeforeInlineJS, htmlAfterInlineJS) + ')');
    }

    // 压缩并写入首页 HTML
    const processedHTML = await processHTML(html, minifyConfig);
    const htmlSize = {
        original: Buffer.byteLength(html, 'utf8'),
        minified: Buffer.byteLength(processedHTML, 'utf8')
    };
    fs.writeFileSync(path.join(distDir, 'index.html'), processedHTML, 'utf8');
    console.log('📄 index.html: ' + formatSize(htmlSize.original) + ' → ' + formatSize(htmlSize.minified) + ' (节省 ' + calcReduction(htmlSize.original, htmlSize.minified) + ')');

    // ========== 生成 404 页面 ==========
    console.log('📄 生成 404 页面...');
    const template404Path = path.join(templatesDir, '404.template.html');
    if (fs.existsSync(template404Path)) {
        // 读取并渲染 partials
        let html404 = renderPartials(fs.readFileSync(template404Path, 'utf8'));

        // 生成 404 页面 SEO
        const seo404 = generatePageSEO('404');

        // 替换模板变量
        html404 = html404
            .replace(/{{THEME_INIT_SCRIPT}}/g, generateThemeInitScript())

        // 默认主题 CSS 变量（写入 Critical CSS）
        .replace(/{{DEFAULT_THEME_VARS}}/g, generateDefaultThemeCSS())
            .replace(/{{NAME}}/g, config.name)
            .replace(/{{NAV_HOME_URL}}/g, '/')
            .replace(/{{NAV_LINKS}}/g, generateNavLinks({ activePage: '', config }))
            .replace(/{{NAV_LINKS_MOBILE_DROPDOWN}}/g, generateNavLinksMobileDropdown({ activePage: '', config }))
            .replace(/{{FOOTER_CONTENT}}/g, generateFooterHTML(config))
            .replace(/{{FAVICON_LINKS}}/g, generateFaviconLinks(''))
            // SEO 替换
            .replace(/{{PAGE_TITLE}}/g, seo404.title)
            .replace(/{{SEO_META}}/g, generateSEOMetaHTML(seo404));

        // 重写静态资源 URL（当 siteUrl 配置时）
        if (config.siteUrl) {
            html404 = rewriteAssetUrls(html404, '');
        }

        // 压缩内联 CSS
        html404 = processInlineCSS(html404, minifyConfig);

        // 压缩内联 JS
        html404 = await processInlineJS(html404, minifyConfig);

        // 压缩并写入
        const processed404HTML = await processHTML(html404, minifyConfig);
        const html404Size = {
            original: Buffer.byteLength(html404, 'utf8'),
            minified: Buffer.byteLength(processed404HTML, 'utf8')
        };
        fs.writeFileSync(path.join(distDir, '404.html'), processed404HTML, 'utf8');
        console.log('📄 404.html: ' + formatSize(html404Size.original) + ' → ' + formatSize(html404Size.minified) + ' (节省 ' + calcReduction(html404Size.original, html404Size.minified) + ')');
    } else {
        console.log('   ⚠️ 找不到 templates/404.template.html，跳过生成');
    }

    // ========== 生成动态页面 ==========
    if (config.moments && config.moments.enabled) {
        console.log('📄 生成动态页面...');
        const templateMomentsPath = path.join(templatesDir, 'moments.template.html');
        if (fs.existsSync(templateMomentsPath)) {
            // 读取并渲染 partials
            let htmlMoments = renderPartials(fs.readFileSync(templateMomentsPath, 'utf8'));

            // 生成 moments 页面 SEO
            const seoMoments = generatePageSEO('moments');
            const pageUrl = config.siteUrl ? `${config.siteUrl}/moments/` : '';

            // 页面内容变量
            const pageTitleText = config.pages?.moments?.title || '动态';
            const pageTagline = config.pages?.moments?.tagline || '记录生活点滴与瞬间感悟';

            // 替换模板变量
            htmlMoments = htmlMoments
                .replace(/{{THEME_INIT_SCRIPT}}/g, generateThemeInitScript())

        // 默认主题 CSS 变量（写入 Critical CSS）
        .replace(/{{DEFAULT_THEME_VARS}}/g, generateDefaultThemeCSS())
                .replace(/{{NAME}}/g, config.name)
                .replace(/{{NAV_HOME_URL}}/g, '/')
                .replace(/{{NAV_LINKS}}/g, generateNavLinks({ activePage: 'moments', config }))
                .replace(/{{NAV_LINKS_MOBILE_DROPDOWN}}/g, generateNavLinksMobileDropdown({ activePage: 'moments', config }))
                .replace(/{{FOOTER_CONTENT}}/g, generateFooterHTML(config))
                .replace(/{{FAVICON_LINKS}}/g, generateFaviconLinks('../'))
                // 页面内容变量
                .replace(/{{PAGE_TITLE_TEXT}}/g, pageTitleText)
                .replace(/{{PAGE_TAGLINE}}/g, pageTagline)
                // SEO 替换
                .replace(/{{PAGE_TITLE}}/g, seoMoments.title)
                .replace(/{{SEO_META}}/g, generateSEOMetaHTML(seoMoments, pageUrl));

            // 重写静态资源 URL（当 siteUrl 配置时）
            if (config.siteUrl) {
                htmlMoments = rewriteAssetUrls(htmlMoments, '');
            }

            // 压缩内联 CSS
            htmlMoments = processInlineCSS(htmlMoments, minifyConfig);

            // 压缩内联 JS
            htmlMoments = await processInlineJS(htmlMoments, minifyConfig);

            // 压缩并写入
            const processedMomentsHTML = await processHTML(htmlMoments, minifyConfig);
            const htmlMomentsSize = {
                original: Buffer.byteLength(htmlMoments, 'utf8'),
                minified: Buffer.byteLength(processedMomentsHTML, 'utf8')
            };

            // 创建 moments 目录并写入
            const momentsDir = path.join(distDir, 'moments');
            fs.mkdirSync(momentsDir, { recursive: true });
            fs.writeFileSync(path.join(momentsDir, 'index.html'), processedMomentsHTML, 'utf8');
            console.log('📄 moments/index.html: ' + formatSize(htmlMomentsSize.original) + ' → ' + formatSize(htmlMomentsSize.minified) + ' (节省 ' + calcReduction(htmlMomentsSize.original, htmlMomentsSize.minified) + ')');
        } else {
            console.log('   ⚠️ 找不到 templates/moments.template.html，跳过生成');
        }
    }

    // ========== 生成留言板页面 ==========
    if (config.guestbook && config.guestbook.enabled) {
        console.log('📄 生成留言板页面...');
        const templateGuestbookPath = path.join(templatesDir, 'guestbook.template.html');
        if (fs.existsSync(templateGuestbookPath)) {
            // 读取并渲染 partials
            let htmlGuestbook = renderPartials(fs.readFileSync(templateGuestbookPath, 'utf8'));

            // 生成留言板页面 SEO
            const seoGuestbook = generatePageSEO('guestbook');
            const pageUrl = config.siteUrl ? `${config.siteUrl}/guestbook/` : '';

            // 生成评论系统 SDK
            const commentSDK = generateCommentSDK(config.guestbook);

            // 页面内容变量
            const pageTitleText = config.pages?.guestbook?.title || '留言板';
            const pageTagline = config.pages?.guestbook?.tagline || '欢迎留下你的足迹';

            // 替换模板变量
            htmlGuestbook = htmlGuestbook
                .replace(/{{THEME_INIT_SCRIPT}}/g, generateThemeInitScript())

        // 默认主题 CSS 变量（写入 Critical CSS）
        .replace(/{{DEFAULT_THEME_VARS}}/g, generateDefaultThemeCSS())
                .replace(/{{NAME}}/g, config.name)
                .replace(/{{NAV_HOME_URL}}/g, '/')
                .replace(/{{NAV_LINKS}}/g, generateNavLinks({ activePage: 'guestbook', config }))
                .replace(/{{NAV_LINKS_MOBILE_DROPDOWN}}/g, generateNavLinksMobileDropdown({ activePage: 'guestbook', config }))
                .replace(/{{FOOTER_CONTENT}}/g, generateFooterHTML(config))
                .replace(/{{FAVICON_LINKS}}/g, generateFaviconLinks('../'))
                // 页面内容变量
                .replace(/{{PAGE_TITLE_TEXT}}/g, pageTitleText)
                .replace(/{{PAGE_TAGLINE}}/g, pageTagline)
                // SEO 替换
                .replace(/{{PAGE_TITLE}}/g, seoGuestbook.title)
                .replace(/{{SEO_META}}/g, generateSEOMetaHTML(seoGuestbook, pageUrl))
                // 留言板特定变量
                .replace(/{{COMMENT_SDK}}/g, commentSDK);

            // 重写静态资源 URL（当 siteUrl 配置时）
            if (config.siteUrl) {
                htmlGuestbook = rewriteAssetUrls(htmlGuestbook, '');
            }

            // 压缩内联 CSS
            htmlGuestbook = processInlineCSS(htmlGuestbook, minifyConfig);

            // 压缩内联 JS
            htmlGuestbook = await processInlineJS(htmlGuestbook, minifyConfig);

            // 压缩并写入
            const processedGuestbookHTML = await processHTML(htmlGuestbook, minifyConfig);
            const htmlGuestbookSize = {
                original: Buffer.byteLength(htmlGuestbook, 'utf8'),
                minified: Buffer.byteLength(processedGuestbookHTML, 'utf8')
            };

            // 创建 guestbook 目录并写入
            const guestbookDir = path.join(distDir, 'guestbook');
            fs.mkdirSync(guestbookDir, { recursive: true });
            fs.writeFileSync(path.join(guestbookDir, 'index.html'), processedGuestbookHTML, 'utf8');
            console.log('📄 guestbook/index.html: ' + formatSize(htmlGuestbookSize.original) + ' → ' + formatSize(htmlGuestbookSize.minified) + ' (节省 ' + calcReduction(htmlGuestbookSize.original, htmlGuestbookSize.minified) + ')');
        } else {
            console.log('   ⚠️ 找不到 templates/guestbook.template.html，跳过生成');
        }
    }

    // 压缩统计
    const stats = {
        js: { count: 0, totalOriginal: 0, totalMinified: 0 },
        css: { count: 0, totalOriginal: 0, totalMinified: 0 },
        images: { count: 0, totalOriginal: 0, totalMinified: 0 }
    };

    // 处理静态资源（带压缩）
    async function processFile(srcFile, destFile) {
        const srcPath = path.join(rootDir, srcFile);
        const destPath = path.join(distDir, destFile);

        if (!fs.existsSync(srcPath)) return;

        // 确保目标目录存在
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        const ext = path.extname(srcFile).toLowerCase();

        // JS 文件
        if (ext === '.js') {
            const result = await processJSFile(srcPath, destPath, minifyConfig);
            stats.js.count++;
            stats.js.totalOriginal += result.original;
            stats.js.totalMinified += result.minified;
            console.log('📜 ' + destFile + ': ' + formatSize(result.original) + ' → ' + formatSize(result.minified) + ' (节省 ' + calcReduction(result.original, result.minified) + ')');
            return;
        }

        // CSS 文件
        if (ext === '.css') {
            const result = processCSSFile(srcPath, destPath, minifyConfig);
            stats.css.count++;
            stats.css.totalOriginal += result.original;
            stats.css.totalMinified += result.minified;
            console.log('🎨 ' + destFile + ': ' + formatSize(result.original) + ' → ' + formatSize(result.minified) + ' (节省 ' + calcReduction(result.original, result.minified) + ')');
            return;
        }

        // 图片文件
        if (isImage(srcFile)) {
            const result = await processImageFile(srcPath, destPath, minifyConfig);
            stats.images.count++;
            stats.images.totalOriginal += result.original;
            stats.images.totalMinified += result.minified;
            console.log('🖼️  ' + destFile + ': ' + formatSize(result.original) + ' → ' + formatSize(result.minified) + ' (节省 ' + calcReduction(result.original, result.minified) + ')');
            return;
        }

        // 其他文件直接复制
        fs.copyFileSync(srcPath, destPath);
        console.log('📋 ' + destFile + ' (已复制)');
    }

    // 处理所有静态资源
    await processFile('src/media-manager.js', 'media-manager.js');
    await processFile('src/app.js', 'app.js');
    await processFile('src/style.css', 'style.css');
    await processFile('src/config.js', 'config.js');
    await processFile('src/theme-utils.js', 'theme-utils.js');
    await processFile('src/moments.js', 'moments.js');

    // 处理留言板模块（包含评论系统）
    // 先读取评论独立模块
    const commentsStandalonePath = path.join(rootDir, 'src/comments-standalone.js');
    const guestbookPath = path.join(rootDir, 'src/guestbook.js');
    if (fs.existsSync(commentsStandalonePath) && fs.existsSync(guestbookPath)) {
        const commentsCode = fs.readFileSync(commentsStandalonePath, 'utf8');
        const guestbookCode = fs.readFileSync(guestbookPath, 'utf8');
        // 合并代码：评论模块在前，guestbook 在后
        const combinedCode = commentsCode + '\n\n' + guestbookCode;

        // 处理合并后的代码
        const distGuestbookPath = path.join(distDir, 'guestbook.js');
        // 计算原始字节数（UTF-8 编码）
        const originalBytes = Buffer.byteLength(combinedCode, 'utf8');

        if (minifyConfig.minifyJS && minifyConfig.minify) {
            const minifiedCode = await minifyJS(combinedCode);
            fs.writeFileSync(distGuestbookPath, minifiedCode, 'utf8');
            const finalSize = fs.statSync(distGuestbookPath).size;
            console.log('📜 guestbook.js (含评论模块): ' + formatSize(originalBytes) + ' → ' + formatSize(finalSize) + ' (节省 ' + calcReduction(originalBytes, finalSize) + ')');
        } else {
            fs.writeFileSync(distGuestbookPath, combinedCode, 'utf8');
            console.log('📜 guestbook.js (含评论模块): ' + formatSize(originalBytes) + ' (未压缩)');
        }
    } else {
        await processFile('src/guestbook.js', 'guestbook.js');
    }

    await processFile('src/images/avatar.webp', 'images/avatar.webp');

    // 处理捐赠二维码图片
    if (config.donation.enabled && config.donation.methods) {
        const enabledMethods = config.donation.methods.filter(m => m.enabled && m.qrImage);
        for (const method of enabledMethods) {
            const srcPath = 'src/' + method.qrImage;
            const destPath = method.qrImage;
            await processFile(srcPath, destPath);
        }
    }

    // 处理本地音乐文件
    if (config.music.enabled && config.music.mode === 'local' && config.music.local.length > 0) {
        console.log('🎵 处理本地音乐文件...');
        const distMusicDir = path.join(distDir, 'music');
        if (!fs.existsSync(distMusicDir)) {
            fs.mkdirSync(distMusicDir, { recursive: true });
        }
        for (const musicPath of config.music.local) {
            const srcPath = path.join(rootDir, 'src', musicPath);
            const destPath = path.join(distDir, musicPath);
            if (fs.existsSync(srcPath)) {
                // 确保目标目录存在
                const destDir = path.dirname(destPath);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }
                fs.copyFileSync(srcPath, destPath);
                const stat = fs.statSync(destPath);
                console.log(`   ✓ ${musicPath} (${formatSize(stat.size)})`);
            } else {
                console.warn(`   ⚠️ 音乐文件不存在: ${musicPath}`);
            }
        }
    }

    // 输出压缩统计
    console.log('');
    console.log('📊 压缩统计:');
    if (stats.js.count > 0) {
        console.log('   JS: ' + formatSize(stats.js.totalOriginal) + ' → ' + formatSize(stats.js.totalMinified) + ' (节省 ' + calcReduction(stats.js.totalOriginal, stats.js.totalMinified) + ')');
    }
    if (stats.css.count > 0) {
        console.log('   CSS: ' + formatSize(stats.css.totalOriginal) + ' → ' + formatSize(stats.css.totalMinified) + ' (节省 ' + calcReduction(stats.css.totalOriginal, stats.css.totalMinified) + ')');
    }
    if (stats.images.count > 0) {
        console.log('   图片: ' + formatSize(stats.images.totalOriginal) + ' → ' + formatSize(stats.images.totalMinified) + ' (节省 ' + calcReduction(stats.images.totalOriginal, stats.images.totalMinified) + ')');
    }

    const totalOriginal = htmlSize.original + stats.js.totalOriginal + stats.css.totalOriginal + stats.images.totalOriginal;
    const totalMinified = htmlSize.minified + stats.js.totalMinified + stats.css.totalMinified + stats.images.totalMinified;
    console.log('   总计: ' + formatSize(totalOriginal) + ' → ' + formatSize(totalMinified) + ' (节省 ' + calcReduction(totalOriginal, totalMinified) + ')');

    console.log('');
    console.log('✅ 构建成功！');
    console.log('📄 生成了: ' + path.join(distDir, 'index.html'));
    console.log('📋 标题: ' + config.title);
    console.log('🔑 关键词: ' + config.keywords.join(', '));
    if (config.rss.enabled) {
        console.log('📰 RSS 文章: ' + rssArticles.length + ' 篇');
    }
    if (config.projects.enabled && githubRepos.length > 0) {
        console.log('📦 GitHub 项目: ' + githubRepos.length + ' 个');
    }
}

// 执行构建
build().catch(function(err) {
    console.error('❌ 构建失败:', err);
    process.exit(1);
});
