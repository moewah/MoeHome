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
    processImageFile,
    isImage,
    formatSize,
    calcReduction,
    generateFavicon
} = require('./minify');

// 压缩配置
const minifyConfig = getMinifyConfig();

// 定义路径
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

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
        if (match && match[1]) {
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

// ========== 主题配色提取 ==========

/**
 * Hex 转 RGB 字符串
 * @param {string} hex - #00ff9f 或 #fff
 * @returns {string} - "0, 255, 159"
 */
function hexToRgb(hex) {
    // 标准 6 位格式
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    // 短格式 #fff
    const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
    if (shortResult) {
        return `${parseInt(shortResult[1] + shortResult[1], 16)}, ${parseInt(shortResult[2] + shortResult[2], 16)}, ${parseInt(shortResult[3] + shortResult[3], 16)}`;
    }
    return '0, 255, 159'; // fallback
}

/**
 * 将 hex 颜色加深指定比例
 * @param {string} hex - #00ff9f 或 #fff
 * @param {number} amount - 加深比例 (0-1)
 * @returns {string} - 加深后的 hex 颜色
 */
function darkenColor(hex, amount) {
    const rgb = hexToRgb(hex).split(', ').map(Number);
    const darkened = rgb.map(channel => Math.max(0, Math.round(channel * (1 - amount))));
    return `#${darkened.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

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

    // 默认值
    const lightDefaults = {
        accent: '#D97706',
        bgPrimary: '#FBF8F3',
        bgSecondary: '#F5F2ED',
        textPrimary: '#1C1917',
        textSecondary: '#57534E',
        border: '#E7E5E4',
    };

    const darkDefaults = {
        accent: '#00ff9f',
        bgPrimary: '#0a0a0a',
        bgSecondary: '#111111',
        textPrimary: '#e8e8e8',
        textSecondary: '#888888',
        border: '#222222',
    };

    // 检测新版格式（defaults 子对象）
    const defaultsMatch = themeBlock.match(/defaults:\s*\{([\s\S]*?)\n\s*\},?\s*\n/);
    if (defaultsMatch) {
        // 新版格式
        const defaultsBlock = defaultsMatch[1];

        // 匹配 light 子对象
        const lightMatch = defaultsBlock.match(/light:\s*\{([^}]+)\}/);
        const lightBlock = lightMatch ? lightMatch[1] : null;

        // 匹配 dark 子对象
        const darkMatch = defaultsBlock.match(/dark:\s*\{([^}]+)\}/);
        const darkBlock = darkMatch ? darkMatch[1] : null;

        const result = {
            default: defaultMode,
            light: lightBlock ? {
                accent: extractThemeColor(lightBlock, 'accent', lightDefaults.accent),
                bgPrimary: extractThemeColor(lightBlock, 'bgPrimary', lightDefaults.bgPrimary),
                bgSecondary: extractThemeColor(lightBlock, 'bgSecondary', lightDefaults.bgSecondary),
                textPrimary: extractThemeColor(lightBlock, 'textPrimary', lightDefaults.textPrimary),
                textSecondary: extractThemeColor(lightBlock, 'textSecondary', lightDefaults.textSecondary),
                border: extractThemeColor(lightBlock, 'border', lightDefaults.border),
            } : { ...lightDefaults },
            dark: darkBlock ? {
                accent: extractThemeColor(darkBlock, 'accent', darkDefaults.accent),
                bgPrimary: extractThemeColor(darkBlock, 'bgPrimary', darkDefaults.bgPrimary),
                bgSecondary: extractThemeColor(darkBlock, 'bgSecondary', darkDefaults.bgSecondary),
                textPrimary: extractThemeColor(darkBlock, 'textPrimary', darkDefaults.textPrimary),
                textSecondary: extractThemeColor(darkBlock, 'textSecondary', darkDefaults.textSecondary),
                border: extractThemeColor(darkBlock, 'border', darkDefaults.border),
            } : { ...darkDefaults },
        };

        // 提取 locked 配置
        const lockedMatch = themeBlock.match(/locked:\s*\{([^}]+)\}/);
        if (lockedMatch) {
            const lockedBlock = lockedMatch[1];
            const lightLockedMatch = lockedBlock.match(/light:\s*['"`]([^'"`]+)['"`]/);
            const darkLockedMatch = lockedBlock.match(/dark:\s*['"`]([^'"`]+)['"`]/);
            result.locked = {
                light: lightLockedMatch ? lightLockedMatch[1] : null,
                dark: darkLockedMatch ? darkLockedMatch[1] : null,
            };
        }

        return result;
    }

    // 旧版格式（直接 light/dark）
    const lightMatch = themeBlock.match(/light:\s*\{([^}]+)\}/);
    const lightBlock = lightMatch ? lightMatch[1] : null;

    const darkMatch = themeBlock.match(/dark:\s*\{([^}]+)\}/);
    const darkBlock = darkMatch ? darkMatch[1] : null;

    return {
        default: defaultMode,
        light: {
            accent: extractThemeColor(lightBlock, 'accent', lightDefaults.accent),
            bgPrimary: extractThemeColor(lightBlock, 'bgPrimary', lightDefaults.bgPrimary),
            bgSecondary: extractThemeColor(lightBlock, 'bgSecondary', lightDefaults.bgSecondary),
            textPrimary: extractThemeColor(lightBlock, 'textPrimary', lightDefaults.textPrimary),
            textSecondary: extractThemeColor(lightBlock, 'textSecondary', lightDefaults.textSecondary),
            border: extractThemeColor(lightBlock, 'border', lightDefaults.border),
        },
        dark: {
            accent: extractThemeColor(darkBlock, 'accent', darkDefaults.accent),
            bgPrimary: extractThemeColor(darkBlock, 'bgPrimary', darkDefaults.bgPrimary),
            bgSecondary: extractThemeColor(darkBlock, 'bgSecondary', darkDefaults.bgSecondary),
            textPrimary: extractThemeColor(darkBlock, 'textPrimary', darkDefaults.textPrimary),
            textSecondary: extractThemeColor(darkBlock, 'textSecondary', darkDefaults.textSecondary),
            border: extractThemeColor(darkBlock, 'border', darkDefaults.border),
        },
    };
}

/**
 * 内置配色方案（构建时使用）
 */
const builtinSchemes = {
    cyber: {
        modes: ['dark'],
        colors: {
            accent: '#00ff9f',
            bgPrimary: '#0a0a0a',
            bgSecondary: '#111111',
            textPrimary: '#e8e8e8',
            textSecondary: '#888888',
            border: '#222222',
        }
    },
    ocean: {
        modes: ['dark'],
        colors: {
            accent: '#0ea5e9',
            bgPrimary: '#0c1222',
            bgSecondary: '#111827',
            textPrimary: '#e2e8f0',
            textSecondary: '#94a3b8',
            border: '#1e293b',
        }
    },
    sakura: {
        modes: ['light'],
        colors: {
            accent: '#f472b6',
            bgPrimary: '#fdf2f8',
            bgSecondary: '#fce7f3',
            textPrimary: '#831843',
            textSecondary: '#9d174d',
            border: '#fbcfe8',
        }
    },
    forest: {
        modes: ['light', 'dark'],
        colors: {
            light: {
                accent: '#22c55e',
                bgPrimary: '#f0fdf4',
                bgSecondary: '#dcfce7',
                textPrimary: '#14532d',
                textSecondary: '#166534',
                border: '#bbf7d0',
            },
            dark: {
                accent: '#22c55e',
                bgPrimary: '#052e16',
                bgSecondary: '#14532d',
                textPrimary: '#ecfdf5',
                textSecondary: '#86efac',
                border: '#166534',
            }
        }
    },
    sunset: {
        modes: ['light', 'dark'],
        colors: {
            light: {
                accent: '#f97316',
                bgPrimary: '#fffbeb',
                bgSecondary: '#fef3c7',
                textPrimary: '#451a03',
                textSecondary: '#78350f',
                border: '#fde68a',
            },
            dark: {
                accent: '#f97316',
                bgPrimary: '#1c1917',
                bgSecondary: '#292524',
                textPrimary: '#fef3c7',
                textSecondary: '#d6d3d1',
                border: '#44403c',
            }
        }
    }
};

/**
 * 从配色方案获取颜色
 */
function getSchemeColors(schemeId, mode) {
    const scheme = builtinSchemes[schemeId];
    if (!scheme) return null;

    // 检查是否兼容
    if (scheme.modes && !scheme.modes.includes(mode)) {
        return null;
    }

    // 如果有按模式的颜色定义
    if (scheme.colors && typeof scheme.colors.light === 'object') {
        return scheme.colors[mode] || scheme.colors.dark || null;
    }

    return scheme.colors;
}

/**
 * 生成首屏主题 CSS
 * 在 JS 加载前应用正确的主题颜色，避免闪烁
 * 支持 locked 配置，首屏使用锁定的配色方案
 */
function generateInitialThemeCSS() {
    const theme = extractThemeConfig();
    if (!theme) return '';

    // 确定默认主题
    let defaultMode = theme.default;
    if (defaultMode === 'auto') {
        defaultMode = 'dark'; // auto 时使用 dark 作为首屏默认
    }

    // 获取颜色配置（优先使用 locked 方案）
    let colors = theme[defaultMode];

    if (theme.locked && theme.locked[defaultMode]) {
        const schemeColors = getSchemeColors(theme.locked[defaultMode], defaultMode);
        if (schemeColors) {
            colors = schemeColors;
        }
    }

    if (!colors) return '';

    const accentRgb = hexToRgb(colors.accent);
    const bgPrimaryRgb = hexToRgb(colors.bgPrimary);
    const isLight = defaultMode === 'light';

    // 衍生色透明度配置
    const derive = isLight ? {
        accentDim: 0.1,
        gridColor: 0.05,
        notice: 0.08,
        hover: 0.08,
        active: 0.15,
        shadowSm: 0.05,
        shadowMd: 0.1,
        glow: 0.2,
        navbarScrolled: 1,
        cardBorderStrong: 0.5,
        cardBorderMuted: 0.25,
    } : {
        accentDim: 0.1,
        gridColor: 0.03,
        notice: 0.05,
        hover: 0.1,
        active: 0.2,
        shadowSm: 0.3,
        shadowMd: 0.5,
        glow: 0.3,
        navbarScrolled: 0.98,
        cardBorderStrong: 0.4,
        cardBorderMuted: 0.2,
    };

    return `<style id="theme-initial">
      :root {
        /* 核心 */
        --bg-primary: ${colors.bgPrimary};
        --bg-secondary: ${colors.bgSecondary};
        --text-primary: ${colors.textPrimary};
        --text-secondary: ${colors.textSecondary};
        --accent: ${colors.accent};
        --accent-deep: ${darkenColor(colors.accent, 0.2)};
        --border: ${colors.border};

        /* 衍生 */
        --accent-dim: rgba(${accentRgb}, ${derive.accentDim});
        --grid-color: rgba(${accentRgb}, ${derive.gridColor});
        --notice-bg-warning: rgba(255, 149, 0, ${derive.notice});
        --notice-bg-info: rgba(0, 161, 255, ${derive.notice});
        --notice-bg-success: rgba(39, 201, 63, ${derive.notice});

        /* P0 交互状态 */
        --hover-bg: rgba(${accentRgb}, ${derive.hover});
        --active-bg: rgba(${accentRgb}, ${derive.active});
        --focus-ring: ${colors.accent};

        /* P1 阴影深度 */
        --shadow-sm: rgba(0, 0, 0, ${derive.shadowSm});
        --shadow-md: rgba(0, 0, 0, ${derive.shadowMd});
        --glow: rgba(${accentRgb}, ${derive.glow});
        --glow-subtle: rgba(${accentRgb}, 0.08);
        --navbar-bg-scrolled: rgba(${bgPrimaryRgb}, ${derive.navbarScrolled});

        /* P3 贡献图格子 */
        --contribution-1: rgba(${accentRgb}, 0.2);
        --contribution-2: rgba(${accentRgb}, 0.4);
        --contribution-3: rgba(${accentRgb}, 0.6);
        --contribution-4: ${colors.accent};

        /* P4 分割线 */
        --divider-glow: rgba(${accentRgb}, 0.4);

        /* 卡片边框层次 */
        --card-border-strong: rgba(${accentRgb}, ${derive.cardBorderStrong});
        --card-border-muted: rgba(${accentRgb}, ${derive.cardBorderMuted});

        /* 玻璃光泽系统 */
        --glass-border-top: ${isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)'};
        --glass-border-bottom: ${isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.5)'};
        --glass-border-side: ${isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)'};
        --glass-outer-shadow: ${isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.4)'};
        --glass-inner-glow: rgba(${accentRgb}, 0.03);
        --glass-hover-border: rgba(${accentRgb}, ${isLight ? 0.25 : 0.15});
        --glass-hover-glow: rgba(${accentRgb}, 0.05);

        /* P2 终端（默认跟随主主题） */
        --terminal-bg: ${colors.bgSecondary};
        --terminal-text: ${colors.textSecondary};
        --terminal-prompt: ${colors.accent};
        --terminal-cursor: ${colors.accent};
      }
    </style>`;
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
                                <i class="${link.icon}"></i>
                            </div>
                            <div class="link-content">
                                <span class="link-text">${link.name}</span>
                                <span class="link-description">${link.description}</span>
                            </div>
                        </div>
                        <span class="link-indicator"></span>
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
                            <div class="music-player" id="music-player" data-config="${musicConfigJSON}">
                                <button class="music-btn music-btn--prev" id="music-prev" title="上一曲" aria-label="上一曲">
                                    <i class="fa-solid fa-backward-step"></i>
                                </button>
                                <button class="music-btn music-btn--play" id="music-play" title="播放" aria-label="播放">
                                    <i class="fa-solid fa-play" id="music-play-icon"></i>
                                </button>
                                <button class="music-btn music-btn--next" id="music-next" title="下一曲" aria-label="下一曲">
                                    <i class="fa-solid fa-forward-step"></i>
                                </button>
                                <div class="music-progress">
                                    <div class="music-progress-fill" id="music-progress-fill"></div>
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
            '                                <i class="fa-solid fa-arrow-right rss-article-arrow"></i>\n' +
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

        const menusContent = navContent.substring(startIndex, endIndex);

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

// 生成导航链接 HTML（移动端）
function generateNavLinksMobileHTML(rssConfig, projectsConfig) {
    let html = '';

    // Posts 链接
    if (rssConfig.enabled) {
        html += '\n                <a href="#rss-section" class="nav-sidebar-link" data-section="rss-section">文章</a>';
    }

    // Projects 链接
    if (projectsConfig.enabled) {
        html += '\n                <a href="#projects-section" class="nav-sidebar-link" data-section="projects-section">项目</a>';
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

// 生成自定义菜单 HTML（移动端）
function generateCustomMenusMobileHTML(menus) {
    if (!menus || menus.length === 0) return '';

    return menus.map(menu => {
        const itemsHTML = menu.items.map(item => {
            const externalAttrs = item.external ? 'target="_blank" rel="noopener noreferrer"' : '';
            return `                <a href="${escapeHTML(item.url)}" ${externalAttrs}>${escapeHTML(item.name)}</a>`;
        }).join('\n                ');

        return `
            <div class="nav-sidebar-dropdown">
                <button class="nav-sidebar-dropdown-toggle">
                    <span>${escapeHTML(menu.name)}</span>
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
                <div class="nav-sidebar-dropdown-items">
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
                            <i class="fa-solid fa-file-code"></i>
                            <span class="project-name">${escapeHTML(mainRepo.name)}</span>
                            <div class="project-stats">
                                <span class="project-stat"><i class="fa-solid fa-star"></i> ${mainStarsText}</span>
                                <span class="project-stat"><i class="fa-solid fa-code-fork"></i> ${mainForksText}</span>
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
                                <span class="language-dot" style="background-color: ${mainRepo.languageColor}"></span>
                                ${escapeHTML(mainRepo.language || 'Unknown')}
                            </span>
                            <i class="fa-solid fa-arrow-up-right-from-square project-arrow"></i>
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
                                <i class="fa-solid fa-file-code"></i>
                                <span class="project-mini-stars"><i class="fa-solid fa-star"></i> ${starsText}</span>
                            </div>
                            <div class="project-mini-body">
                                <span class="project-mini-name">${escapeHTML(repo.name)}</span>
                            </div>
                            <div class="project-mini-footer">
                                <span class="project-language project-language-mini">
                                    <span class="language-dot language-dot-mini" style="background-color: ${repo.languageColor}"></span>
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

// 从 config.js 提取所有配置
const config = {
    // SEO
    title: extractString(/title:\s*['"`]([^'"`]+)['"`]/, 'MoeWah - 技术博主 / 开源爱好者 / AI 探索者'),
    description: extractString(/description:\s*['"`]([^'"`]+)['"`]/, 'Hi，欢迎访问 MoeWah 的个人主页'),
    keywords: extractArray(/keywords:\s*\[([\s\S]*?)\]/, ['MoeWah', '技术博客', 'Astro', 'Docker']),
    ogTitle: extractNestedString(/og:\s*\{([\s\S]*?)\}/, 'title', 'MoeWah - 个人主页'),
    ogDescription: extractNestedString(/og:\s*\{([\s\S]*?)\}/, 'description', '开源爱好者 / Astro爱好者 / AI探索者'),
    ogImage: extractNestedString(/og:\s*\{([\s\S]*?)\}/, 'image', 'https://www.moewah.com/images/avatar.webp'),

    // Profile
    name: extractNestedString(/profile:\s*\{([\s\S]*?)\}/, 'name', 'MoeWah'),
    avatar: extractNestedString(/profile:\s*\{([\s\S]*?)\}/, 'avatar', 'images/avatar.webp'),
    taglinePrefix: extractNestedString(/tagline:\s*\{([\s\S]*?)\}/, 'prefix', '🐾'),
    taglineHighlight: extractNestedString(/tagline:\s*\{([\s\S]*?)\}/, 'highlight', '万物皆可萌！'),

    // Identity & Interests
    identity: extractArray(/identity:\s*\[([\s\S]*?)\]/, ['开源爱好者', 'Astro爱好者', 'AI探索者']),
    interests: extractArray(/interests:\s*\[([\s\S]*?)\]/, ['Astro & 前端开发', 'Docker & 容器技术']),

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

// 读取模板
const templatePath = path.join(__dirname, '../templates/index.template.html');
if (!fs.existsSync(templatePath)) {
    console.error('❌ 找不到 templates/index.template.html');
    process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf8');

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
        // Theme Initial CSS (首屏主题，避免闪烁)
        .replace(/{{THEME_INITIAL}}/g, generateInitialThemeCSS())

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

// Nav Links
        .replace(/{{NAV_POSTS_LINK}}/g, config.rss.enabled ? '<a href="#rss-section" class="nav-link" data-section="rss-section">文章</a>' : '')
        .replace(/{{NAV_PROJECTS_LINK}}/g, config.projects.enabled ? '<a href="#projects-section" class="nav-link" data-section="projects-section">项目</a>' : '')
        .replace(/{{NAV_LINKS_LINK}}/g, config.linksConfig.enabled ? '<a href="#links-container" class="nav-link" data-section="links-container">链接</a>' : '')
        .replace(/{{NAV_DONATION_LINK}}/g, '')
        .replace(/{{NAV_POSTS_LINK_MOBILE}}/g, config.rss.enabled ? '<a href="#rss-section" class="nav-sidebar-link" data-section="rss-section">文章</a>' : '')
        .replace(/{{NAV_PROJECTS_LINK_MOBILE}}/g, config.projects.enabled ? '<a href="#projects-section" class="nav-sidebar-link" data-section="projects-section">项目</a>' : '')
        .replace(/{{NAV_LINKS_LINK_MOBILE}}/g, config.linksConfig.enabled ? '<a href="#links-container" class="nav-sidebar-link" data-section="links-container">链接</a>' : '')
        .replace(/{{NAV_DONATION_LINK_MOBILE}}/g, '')
        .replace(/{{NAV_CUSTOM_MENUS}}/g, generateCustomMenusHTML(config.nav?.menus))
        .replace(/{{NAV_CUSTOM_MENUS_MOBILE}}/g, generateCustomMenusMobileHTML(config.nav?.menus))

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

    // 生成 favicon HTML 链接（必须）
    let faviconLinks = '';
    if (faviconPath) {
        if (appleTouchPath) {
            faviconLinks = `<link rel="icon" type="image/x-icon" href="${faviconPath}" />
        <link rel="apple-touch-icon" href="${appleTouchPath}" />`;
        } else {
            faviconLinks = `<link rel="icon" type="image/x-icon" href="${faviconPath}" />`;
        }
    }

    // 将 favicon 链接注入 HTML
    html = html.replace(/{{FAVICON_LINKS}}/g, faviconLinks);

    // 压缩内联 CSS（<style> 标签内的 CSS，包括 theme-initial 和 Critical CSS）
    const htmlBeforeInlineCSS = Buffer.byteLength(html, 'utf8');
    html = processInlineCSS(html, minifyConfig);
    const htmlAfterInlineCSS = Buffer.byteLength(html, 'utf8');
    if (minifyConfig.minifyCSS && minifyConfig.minify) {
        console.log('📋 内联 CSS: ' + formatSize(htmlBeforeInlineCSS) + ' → ' + formatSize(htmlAfterInlineCSS) + ' (节省 ' + calcReduction(htmlBeforeInlineCSS, htmlAfterInlineCSS) + ')');
    }

    // 压缩并写入 HTML
    const processedHTML = await processHTML(html, minifyConfig);
    const htmlSize = {
        original: Buffer.byteLength(html, 'utf8'),
        minified: Buffer.byteLength(processedHTML, 'utf8')
    };
    fs.writeFileSync(path.join(distDir, 'index.html'), processedHTML, 'utf8');
    console.log('📄 HTML: ' + formatSize(htmlSize.original) + ' → ' + formatSize(htmlSize.minified) + ' (节省 ' + calcReduction(htmlSize.original, htmlSize.minified) + ')');

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
    await processFile('src/app.js', 'app.js');
    await processFile('src/style.css', 'style.css');
    await processFile('src/config.js', 'config.js');
    await processFile('src/theme-utils.js', 'theme-utils.js');
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
