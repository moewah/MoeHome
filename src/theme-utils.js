/**
 * Theme Manager - 主题管理器
 * 支持 config 驱动的多配色方案系统
 *
 * 核心设计：Mode（模式）与 Scheme（配色方案）分离
 * - Mode = light/dark，决定衍生色规则（透明度、阴影、玻璃效果）
 * - Scheme = 命名配色集合，独立于模式的颜色组合
 *
 * 用户切换只在当前会话生效，刷新后恢复 config 定义的默认值
 */

const ThemeManager = {
    THEME_ATTRIBUTE: 'data-theme',

    /**
     * 默认主题配置（作为 fallback）
     */
    defaults: {
        light: {
            accent: '#C6613F',
            bgPrimary: '#FAF9F5',
            bgSecondary: '#F0EEE6',
            textPrimary: '#141413',
            textSecondary: '#87867F',
            border: '#E8E6DC',
        },
        dark: {
            accent: '#00ff9f',
            bgPrimary: '#0a0a0a',
            bgSecondary: '#111111',
            textPrimary: '#e8e8e8',
            textSecondary: '#888888',
            border: '#222222',
        }
    },

    /**
     * 内置预设配色方案
     */
    builtinSchemes: {
        // === 系统默认方案 ===
        coralOrange: {
            id: 'coralOrange',
            name: '珊瑚橙 (默认)',
            icon: 'fa-palette',
            isDefault: true, // 标记为系统默认
            modes: ['light'],
            colors: {
                accent: '#C6613F',      // 珊瑚橙 - 温暖专业的品牌色
                bgPrimary: '#FAF9F5',   // 暖白 - 主背景色
                bgSecondary: '#F0EEE6', // 柔暖灰 - 卡片/次背景
                textPrimary: '#141413', // 近黑 - 主文本
                textSecondary: '#87867F', // 中性灰 - 次文本
                border: '#E8E6DC',      // 淡边框
            }
        },
        cyberGreen: {
            id: 'cyberGreen',
            name: '赛博绿 (默认)',
            icon: 'fa-bolt',
            isDefault: true, // 标记为系统默认
            modes: ['dark'],
            colors: {
                accent: '#00ff9f',      // 赛博绿
                bgPrimary: '#0a0a0a',   // 纯黑
                bgSecondary: '#111111', // 深灰
                textPrimary: '#e8e8e8', // 亮白
                textSecondary: '#888888', // 中灰
                border: '#222222',      // 深灰边框
            }
        },
        // === 社区配色方案 ===
        catppuccinMocha: {
            id: 'catppuccinMocha',
            name: '摩卡色',
            icon: 'fa-mug-hot',
            modes: ['dark'],
            colors: {
                accent: '#89b4fa',
                bgPrimary: '#1e1e2e',
                bgSecondary: '#181825',
                textPrimary: '#cdd6f4',
                textSecondary: '#a6adc8',
                border: '#313244',
            }
        },
        kanagawaDragon: {
            id: 'kanagawaDragon',
            name: '浮世绘',
            icon: 'fa-dragon',
            modes: ['dark'],
            colors: {
                accent: '#c4746e',
                bgPrimary: '#181616',
                bgSecondary: '#1d1c1c',
                textPrimary: '#c5c9c5',
                textSecondary: '#7a8382',
                border: '#282727',
            }
        },
        rosePineMoon: {
            id: 'rosePineMoon',
            name: '鸢尾紫',
            icon: 'fa-moon',
            modes: ['dark'],
            colors: {
                accent: '#c4a7e7',      // iris - 鸢尾紫，Rose Pine 标志性色彩
                bgPrimary: '#232136',   // base - 深邃夜空，主背景
                bgSecondary: '#2a273f', // surface - 柔和表面，卡片背景
                textPrimary: '#e0def4', // text - 柔光白，主文本
                textSecondary: '#6e6a86', // muted - 静谧灰，次文本
                border: '#393552',      // overlay - 悬浮边框
            }
        },
        nordSnowStorm: {
            id: 'nordSnowStorm',
            name: '冰川青',
            icon: 'fa-snowflake',
            modes: ['light'],
            colors: {
                accent: '#88C0D0',      // nord8 - Frost 青色，Nord 标志性色彩
                bgPrimary: '#ECEFF4',   // nord6 - Snow Storm 最亮，纯净北极白
                bgSecondary: '#E5E9F0', // nord5 - Snow Storm 次亮，柔和雪白
                textPrimary: '#2E3440', // nord0 - Polar Night 最暗，深邃北极夜
                textSecondary: '#4C566A', // nord3 - Polar Night 柔和，可读性极佳
                border: '#D8DEE9',      // nord4 - Snow Storm 边框，淡雅分隔
            }
        },
        gruvboxLight: {
            id: 'gruvboxLight',
            name: '复古风',
            icon: 'fa-compact-disc',
            modes: ['light'],
            colors: {
                accent: '#af3a03',
                bgPrimary: '#fbf1c7',
                bgSecondary: '#f2e5bc',
                textPrimary: '#3c3836',
                textSecondary: '#665c54',
                border: '#d5c4a1',
            }
        },
        ayuLight: {
            id: 'ayuLight',
            name: '简约风',
            icon: 'fa-feather',
            modes: ['light'],
            colors: {
                accent: '#ff9940',
                bgPrimary: '#fafafa',
                bgSecondary: '#f3f3f3',
                textPrimary: '#5c6166',
                textSecondary: '#8a9199',
                border: '#e6e6e6',
            }
        }
    },

    /**
     * 衍生色配置（固定透明度）
     */
    deriveConfig: {
        light: {
            accentDimOpacity: 0.1,
            gridColorOpacity: 0.05,
            noticeOpacity: 0.08,
            hoverOpacity: 0.08,
            activeOpacity: 0.15,
            shadowSmOpacity: 0.05,
            shadowMdOpacity: 0.1,
            glowOpacity: 0.2,
            glowSubtleOpacity: 0.08,
            navbarScrolledOpacity: 1,
            cardBorderStrong: 0.5,
            cardBorderMuted: 0.25,
        },
        dark: {
            accentDimOpacity: 0.1,
            gridColorOpacity: 0.03,
            noticeOpacity: 0.05,
            hoverOpacity: 0.1,
            activeOpacity: 0.2,
            shadowSmOpacity: 0.3,
            shadowMdOpacity: 0.5,
            glowOpacity: 0.3,
            glowSubtleOpacity: 0.08,
            navbarScrolledOpacity: 0.98,
            cardBorderStrong: 0.4,
            cardBorderMuted: 0.2,
        }
    },

    /**
     * 运行时主题数据
     */
    themes: {
        light: { name: 'Light', icon: 'fa-sun', colors: {} },
        dark: { name: 'Dark', icon: 'fa-moon', colors: {} }
    },

    /**
     * 配色方案运行时数据
     */
    schemes: {},

    /**
     * 默认配置（从 config 加载）
     */
    defaultMode: 'light',
    defaultScheme: {
        light: null,
        dark: null
    },

    /**
     * 当前会话状态（刷新后重置）
     * undefined = 未设置，使用 defaultScheme
     * null = 用户明确选择 defaults
     * string = 用户选择的配色方案 ID
     */
    activeMode: undefined,
    activeSchemes: {
        light: undefined,
        dark: undefined
    },

    /**
     * 初始化主题系统
     */
    init() {
        this.loadConfig();
        const effectiveTheme = this.getEffectiveTheme(this.getSavedTheme());
        this.applyTheme(effectiveTheme);
        this.setupSystemThemeListener();
    },

    /**
     * 从 config 加载主题配置
     */
    loadConfig() {
        const config = window.HOMEPAGE_CONFIG?.theme;
        if (!config) {
            this.themes.light.colors = this.buildColors('light', this.defaults.light, null);
            this.themes.dark.colors = this.buildColors('dark', this.defaults.dark, null);
            this.initBuiltinSchemes();
            return;
        }

        this.defaultMode = config.default || 'light';

        if (config.defaultScheme) {
            this.defaultScheme.light = config.defaultScheme.light || null;
            this.defaultScheme.dark = config.defaultScheme.dark || null;
        }
        if (config.locked && !config.defaultScheme) {
            this.defaultScheme.light = config.locked.light || null;
            this.defaultScheme.dark = config.locked.dark || null;
            console.info('[Theme] 检测到旧版 locked 配置，已自动迁移为 defaultScheme');
        }

        const defaultsConfig = config.defaults || {};
        const lightDefaults = { ...this.defaults.light, ...(defaultsConfig.light || {}) };
        const darkDefaults = { ...this.defaults.dark, ...(defaultsConfig.dark || {}) };

        if (config.light && !config.defaults) {
            this.themes.light.colors = this.buildColors('light', { ...this.defaults.light, ...config.light }, null);
            this.themes.dark.colors = this.buildColors('dark', { ...this.defaults.dark, ...config.dark }, null);
            console.info('[Theme] 检测到旧版配置格式，已自动迁移');
        } else {
            this.themes.light.colors = this.buildColors('light', lightDefaults, null);
            this.themes.dark.colors = this.buildColors('dark', darkDefaults, null);
        }

        this.initBuiltinSchemes();
    },

    /**
     * 初始化内置配色方案
     */
    initBuiltinSchemes() {
        Object.entries(this.builtinSchemes).forEach(([id, scheme]) => {
            if (!this.schemes[id]) {
                this.schemes[id] = { ...scheme };
            }
        });
    },

    /**
     * 获取模式适用的配色方案
     */
    getActiveScheme(mode) {
        const savedSchemeId = this.activeSchemes[mode];

        // 用户明确选择使用 defaults
        if (savedSchemeId === null) {
            return null;
        }

        // 用户选择了特定配色方案
        if (savedSchemeId) {
            const scheme = this.schemes[savedSchemeId];
            if (scheme && this.isSchemeCompatible(scheme, mode)) {
                return scheme;
            }
        }

        // 使用默认配色方案
        if (this.defaultScheme[mode]) {
            const scheme = this.schemes[this.defaultScheme[mode]];
            if (scheme && this.isSchemeCompatible(scheme, mode)) {
                return scheme;
            }
        }

        return null;
    },

    /**
     * 检查方案是否适用于指定模式
     */
    isSchemeCompatible(scheme, mode) {
        return !scheme.modes || scheme.modes.includes(mode);
    },

    /**
     * 设置配色方案（只在当前会话生效）
     */
    setScheme(schemeId, mode) {
        this.activeSchemes[mode] = schemeId;

        const currentMode = this.getEffectiveMode();
        if (currentMode === mode) {
            this.applyTheme(mode);
        }

        this.emitSchemeChange(schemeId, mode);
        return true;
    },

    /**
     * 获取模式可用的配色方案列表
     */
    getAvailableSchemes(mode) {
        return Object.values(this.schemes).filter(scheme =>
            this.isSchemeCompatible(scheme, mode)
        );
    },

    /**
     * 从配色方案获取颜色配置
     */
    getSchemeColors(scheme, mode) {
        if (scheme.colors && typeof scheme.colors.light === 'object') {
            return scheme.colors[mode] || scheme.colors.dark || scheme.colors;
        }
        return scheme.colors;
    },

    /**
     * 构建完整的 CSS 变量对象
     */
    buildColors(mode, colors, terminal) {
        const derive = this.deriveConfig[mode];
        const accentRgb = this.hexToRgb(colors.accent);
        const bgPrimaryRgb = this.hexToRgb(colors.bgPrimary);

        this.validateColors(colors);

        const terminalColors = this.mergeTerminalConfig(mode, terminal, colors);

        return {
            '--bg-primary': colors.bgPrimary,
            '--bg-secondary': colors.bgSecondary,
            '--text-primary': colors.textPrimary,
            '--text-secondary': colors.textSecondary,
            '--accent': colors.accent,
            '--accent-deep': this.darkenColor(colors.accent, 0.2),
            '--border': colors.border,

            '--accent-dim': `rgba(${accentRgb}, ${derive.accentDimOpacity})`,
            '--grid-color': `rgba(${accentRgb}, ${derive.gridColorOpacity})`,
            '--notice-bg-warning': `rgba(255, 149, 0, ${derive.noticeOpacity})`,
            '--notice-bg-info': `rgba(0, 161, 255, ${derive.noticeOpacity})`,
            '--notice-bg-success': `rgba(39, 201, 63, ${derive.noticeOpacity})`,

            '--hover-bg': `rgba(${accentRgb}, ${derive.hoverOpacity})`,
            '--active-bg': `rgba(${accentRgb}, ${derive.activeOpacity})`,
            '--focus-ring': colors.accent,

            '--shadow-sm': `rgba(0, 0, 0, ${derive.shadowSmOpacity})`,
            '--shadow-md': `rgba(0, 0, 0, ${derive.shadowMdOpacity})`,
            '--glow': `rgba(${accentRgb}, ${derive.glowOpacity})`,
            '--glow-subtle': `rgba(${accentRgb}, ${derive.glowSubtleOpacity})`,
            '--navbar-bg-scrolled': `rgba(${bgPrimaryRgb}, ${derive.navbarScrolledOpacity})`,

            '--contribution-1': `rgba(${accentRgb}, 0.2)`,
            '--contribution-2': `rgba(${accentRgb}, 0.4)`,
            '--contribution-3': `rgba(${accentRgb}, 0.6)`,
            '--contribution-4': colors.accent,

            '--divider-glow': `rgba(${accentRgb}, 0.4)`,
            '--card-border-strong': `rgba(${accentRgb}, ${derive.cardBorderStrong})`,
            '--card-border-muted': `rgba(${accentRgb}, ${derive.cardBorderMuted})`,

            '--glass-border-top': mode === 'light' ? `rgba(0, 0, 0, 0.04)` : `rgba(255, 255, 255, 0.08)`,
            '--glass-border-bottom': mode === 'light' ? `rgba(0, 0, 0, 0.08)` : `rgba(0, 0, 0, 0.5)`,
            '--glass-border-side': mode === 'light' ? `rgba(0, 0, 0, 0.03)` : `rgba(255, 255, 255, 0.03)`,
            '--glass-outer-shadow': mode === 'light' ? `rgba(0, 0, 0, 0.1)` : `rgba(0, 0, 0, 0.4)`,
            '--glass-inner-glow': `rgba(${accentRgb}, 0.03)`,
            '--glass-hover-border': `rgba(${accentRgb}, ${mode === 'light' ? 0.25 : 0.15})`,
            '--glass-hover-glow': `rgba(${accentRgb}, 0.05)`,

            '--terminal-bg': terminalColors.bg,
            '--terminal-text': terminalColors.text,
            '--terminal-prompt': terminalColors.prompt,
            '--terminal-cursor': terminalColors.cursor,
        };
    },

    /**
     * 合并终端配置
     */
    mergeTerminalConfig(mode, terminal, colors) {
        const defaults = {
            bg: colors.bgSecondary,
            text: colors.textSecondary,
            prompt: colors.accent,
            cursor: colors.accent,
        };

        if (!terminal) return defaults;

        return {
            bg: terminal.bg || defaults.bg,
            text: terminal.text || defaults.text,
            prompt: terminal.prompt || defaults.prompt,
            cursor: terminal.cursor || defaults.cursor,
        };
    },

    /**
     * 校验颜色格式
     */
    validateColors(colors) {
        const hexPattern = /^#([a-f\d]{3}|[a-f\d]{6})$/i;
        const fields = ['accent', 'bgPrimary', 'bgSecondary', 'textPrimary', 'textSecondary', 'border'];

        fields.forEach(field => {
            if (colors[field] && !hexPattern.test(colors[field])) {
                console.warn(`[Theme] ${field} 颜色格式无效，应为 hex 格式: ${colors[field]}`);
            }
        });
    },

    /**
     * Hex 转 RGB 字符串
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
        }
        const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
        if (shortResult) {
            return `${parseInt(shortResult[1] + shortResult[1], 16)}, ${parseInt(shortResult[2] + shortResult[2], 16)}, ${parseInt(shortResult[3] + shortResult[3], 16)}`;
        }
        console.warn('[Theme] 无效的颜色格式:', hex);
        return '0, 0, 0';
    },

    /**
     * 将 hex 颜色加深指定比例
     */
    darkenColor(hex, amount) {
        const rgb = this.hexToRgb(hex).split(', ').map(Number);
        const darkened = rgb.map(channel => Math.max(0, Math.round(channel * (1 - amount))));
        return `#${darkened.map(c => c.toString(16).padStart(2, '0')).join('')}`;
    },

    /**
     * 获取当前主题模式
     */
    getSavedTheme() {
        return this.activeMode !== undefined ? this.activeMode : this.defaultMode;
    },

    /**
     * 设置主题模式（只在当前会话生效）
     */
    setSavedTheme(theme) {
        if (!['auto', 'light', 'dark'].includes(theme)) {
            console.warn('[Theme] 无效的主题:', theme);
            return;
        }

        this.activeMode = theme;
        this.applyTheme(this.getEffectiveTheme(theme));
        this.emitThemeChange(theme);
    },

    /**
     * 获取实际生效的主题
     */
    getEffectiveTheme(savedTheme) {
        if (savedTheme === 'auto') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return savedTheme;
    },

    /**
     * 获取当前模式
     */
    getCurrentMode() {
        return this.getSavedTheme();
    },

    /**
     * 获取实际生效模式
     */
    getEffectiveMode() {
        return this.getEffectiveTheme(this.getSavedTheme());
    },

    /**
     * 应用主题到 DOM
     */
    applyTheme(themeName) {
        const scheme = this.getActiveScheme(themeName);

        let colors;
        if (scheme) {
            const schemeColors = this.getSchemeColors(scheme, themeName);
            colors = this.buildColors(themeName, schemeColors, null);
        } else {
            colors = this.themes[themeName].colors;
        }

        document.documentElement.setAttribute(this.THEME_ATTRIBUTE, themeName);

        Object.entries(colors).forEach(([property, value]) => {
            document.documentElement.style.setProperty(property, value);
        });
    },

    /**
     * 监听系统主题变化
     */
    setupSystemThemeListener() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = (e) => {
            if (this.getSavedTheme() === 'auto') {
                const newTheme = e.matches ? 'dark' : 'light';
                this.applyTheme(newTheme);
                this.emitThemeChange('auto');
            }
        };

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleChange);
        } else if (mediaQuery.addListener) {
            mediaQuery.addListener(handleChange);
        }
    },

    /**
     * 触发主题变更事件
     */
    emitThemeChange(theme) {
        const event = new CustomEvent('themechange', {
            detail: {
                mode: theme,
                effectiveTheme: this.getEffectiveTheme(theme)
            }
        });
        document.dispatchEvent(event);
    },

    /**
     * 触发配色方案变更事件
     */
    emitSchemeChange(schemeId, mode) {
        const event = new CustomEvent('schemechange', {
            detail: {
                schemeId,
                mode,
                scheme: schemeId ? this.schemes[schemeId] : null
            }
        });
        document.dispatchEvent(event);
    },

    /**
     * 获取下一个主题（循环切换）
     */
    getNextTheme() {
        const current = this.getSavedTheme();
        const cycle = ['auto', 'light', 'dark'];
        const currentIndex = cycle.indexOf(current);
        return cycle[(currentIndex + 1) % cycle.length];
    },

    /**
     * 切换主题
     */
    toggle() {
        const nextTheme = this.getNextTheme();
        this.setSavedTheme(nextTheme);
        return nextTheme;
    },

    /**
     * 获取主题标签
     */
    getThemeLabel(theme) {
        const labels = { auto: '跟随系统', light: '浅色', dark: '暗色' };
        return labels[theme] || theme;
    },

    /**
     * 获取主题图标
     */
    getThemeIcon(theme) {
        const icons = { auto: 'fa-desktop', light: 'fa-sun', dark: 'fa-moon' };
        return icons[theme] || 'fa-circle';
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}