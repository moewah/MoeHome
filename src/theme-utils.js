/**
 * Theme Manager - 主题管理器
 * 支持 config 驱动的多配色方案系统
 *
 * 核心设计：Mode（模式）与 Scheme（配色方案）分离
 * - Mode = light/dark，决定衍生色规则（透明度、阴影、玻璃效果）
 * - Scheme = 命名配色集合，独立于模式的颜色组合
 *
 * 配置优先级：locked[mode] > localStorage scheme > defaults[mode]
 */

const ThemeManager = {
    STORAGE_KEY: 'moewah-theme-preference',
    THEME_ATTRIBUTE: 'data-theme',

    /**
     * 默认主题配置（作为 fallback）
     */
    defaults: {
        light: {
            accent: '#D97706',
            bgPrimary: '#FBF8F3',
            bgSecondary: '#F5F2ED',
            textPrimary: '#1C1917',
            textSecondary: '#57534E',
            border: '#E7E5E4',
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
     * 基于 Ghostty/Kitty 终端最受欢迎的主题
     */
    builtinSchemes: {
        // ========== 暗色主题 ==========
        catppuccinMocha: {
            id: 'catppuccinMocha',
            name: 'Catppuccin Mocha',
            icon: 'fa-mug-hot',
            modes: ['dark'],
            colors: {
                accent: '#89b4fa',       // blue
                bgPrimary: '#1e1e2e',   // base
                bgSecondary: '#181825', // mantle
                textPrimary: '#cdd6f4', // text
                textSecondary: '#a6adc8', // subtext0
                border: '#313244',      // surface0
            }
        },
        kanagawaDragon: {
            id: 'kanagawaDragon',
            name: 'Kanagawa Dragon',
            icon: 'fa-dragon',
            modes: ['dark'],
            colors: {
                accent: '#c4746e',       // autumn red (signature)
                bgPrimary: '#181616',   // dragon black
                bgSecondary: '#1d1c1c', // dragon sumi ink 0
                textPrimary: '#c5c9c5', // dragon white
                textSecondary: '#7a8382', // dragon ash
                border: '#282727',      // dragon sumi ink 1
            }
        },
        oneDarkPro: {
            id: 'oneDarkPro',
            name: 'One Dark Pro',
            icon: 'fa-circle-half-stroke',
            modes: ['dark'],
            colors: {
                accent: '#61afef',       // blue (signature)
                bgPrimary: '#282c34',   // background
                bgSecondary: '#2c313a', // current line
                textPrimary: '#abb2bf', // foreground
                textSecondary: '#5c6370', // comment
                border: '#3e4451',      // gutter
            }
        },
        // ========== 亮色主题 ==========
        oneLight: {
            id: 'oneLight',
            name: 'One Light',
            icon: 'fa-circle-half-stroke',
            modes: ['light'],
            colors: {
                accent: '#4078f2',       // blue (signature)
                bgPrimary: '#fafafa',   // background
                bgSecondary: '#f0f0f0', // current line
                textPrimary: '#383a42', // foreground
                textSecondary: '#a0a1a7', // comment
                border: '#e5e5e6',      // gutter
            }
        },
        gruvboxLight: {
            id: 'gruvboxLight',
            name: 'Gruvbox Light',
            icon: 'fa-fire',
            modes: ['light'],
            colors: {
                accent: '#af3a03',      // orange (signature)
                bgPrimary: '#fbf1c7',  // bg0
                bgSecondary: '#f2e5bc', // bg1
                textPrimary: '#3c3836', // fg1
                textSecondary: '#665c54', // fg2
                border: '#d5c4a1',     // bg2
            }
        },
        ayuLight: {
            id: 'ayuLight',
            name: 'Ayu Light',
            icon: 'fa-feather',
            modes: ['light'],
            colors: {
                accent: '#ff9940',       // orange accent
                bgPrimary: '#fafafa',   // main background
                bgSecondary: '#f3f3f3', // panel background
                textPrimary: '#5c6166', // primary foreground
                textSecondary: '#8a9199', // ui foreground
                border: '#e6e6e6',      // ui border
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
        light: { name: '浅色', icon: 'fa-sun', colors: {} },
        dark: { name: '深色', icon: 'fa-moon', colors: {} }
    },

    /**
     * 配色方案运行时数据
     */
    schemes: {},

    /**
     * 锁定配置
     */
    locked: {
        light: null,
        dark: null
    },

    /**
     * 当前选中的配色方案
     */
    activeSchemes: {
        light: null,
        dark: null
    },

    /**
     * 初始化主题系统
     */
    init() {
        this.loadConfig();
        this.loadSavedSchemes();
        const savedTheme = this.getSavedTheme();
        const effectiveTheme = this.getEffectiveTheme(savedTheme);
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

        // 加载锁定配置
        if (config.locked) {
            this.locked.light = config.locked.light || null;
            this.locked.dark = config.locked.dark || null;
        }

        // 加载默认配色
        const defaultsConfig = config.defaults || {};
        const lightDefaults = { ...this.defaults.light, ...(defaultsConfig.light || {}) };
        const darkDefaults = { ...this.defaults.dark, ...(defaultsConfig.dark || {}) };

        // 检测旧版格式
        if (config.light && !config.defaults) {
            this.themes.light.colors = this.buildColors('light', { ...this.defaults.light, ...config.light }, null);
            this.themes.dark.colors = this.buildColors('dark', { ...this.defaults.dark, ...config.dark }, null);
            console.info('[Theme] 检测到旧版配置格式，已自动迁移');
        } else {
            this.themes.light.colors = this.buildColors('light', lightDefaults, null);
            this.themes.dark.colors = this.buildColors('dark', darkDefaults, null);
        }

        // 初始化内置方案
        this.initBuiltinSchemes();

        // 加载用户自定义方案
        if (config.schemes) {
            Object.entries(config.schemes).forEach(([id, scheme]) => {
                this.schemes[id] = {
                    id,
                    name: scheme.name || id,
                    icon: scheme.icon || 'fa-palette',
                    modes: scheme.modes || ['light', 'dark'],
                    colors: scheme.colors
                };
            });
        }
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
     * 安全解析 localStorage 数据
     * 兼容旧版本纯字符串格式（"dark", "light", "auto"）
     */
    safeParseStorage(saved) {
        if (!saved) return null;
        // 处理旧版本纯字符串格式
        if (saved === 'dark' || saved === 'light' || saved === 'auto') {
            return { mode: saved };
        }
        try {
            return JSON.parse(saved);
        } catch (e) {
            return null;
        }
    },

    /**
     * 加载保存的配色方案设置
     */
    loadSavedSchemes() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const data = this.safeParseStorage(saved);
                if (data) {
                    if (data.schemeLight !== undefined) {
                        this.activeSchemes.light = data.schemeLight;
                    }
                    if (data.schemeDark !== undefined) {
                        this.activeSchemes.dark = data.schemeDark;
                    }
                }
            }
        } catch (e) {
            console.warn('[Theme] 无法读取保存的配色方案:', e);
        }
    },

    /**
     * 获取模式适用的配色方案
     */
    getActiveScheme(mode) {
        if (this.locked[mode]) {
            const scheme = this.schemes[this.locked[mode]];
            if (scheme && this.isSchemeCompatible(scheme, mode)) {
                return scheme;
            }
        }

        const savedSchemeId = this.activeSchemes[mode];
        if (savedSchemeId) {
            const scheme = this.schemes[savedSchemeId];
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
     * 设置配色方案
     */
    setScheme(schemeId, mode) {
        if (this.locked[mode]) {
            console.warn(`[Theme] 模式 ${mode} 的配色方案已被锁定为 ${this.locked[mode]}`);
            return false;
        }

        this.activeSchemes[mode] = schemeId;
        this.saveSchemes();

        const currentMode = this.getEffectiveMode();
        if (currentMode === mode) {
            this.applyTheme(mode);
        }

        this.emitSchemeChange(schemeId, mode);
        return true;
    },

    /**
     * 保存配色方案设置
     */
    saveSchemes() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            const data = saved ? this.safeParseStorage(saved) : { mode: 'auto' };
            if (!data) {
                this.resetStorage();
                return;
            }
            data.schemeLight = this.activeSchemes.light;
            data.schemeDark = this.activeSchemes.dark;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[Theme] 无法保存配色方案:', e);
        }
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

            '--glass-border-top': mode === 'light'
                ? `rgba(0, 0, 0, 0.04)`
                : `rgba(255, 255, 255, 0.08)`,
            '--glass-border-bottom': mode === 'light'
                ? `rgba(0, 0, 0, 0.08)`
                : `rgba(0, 0, 0, 0.5)`,
            '--glass-border-side': mode === 'light'
                ? `rgba(0, 0, 0, 0.03)`
                : `rgba(255, 255, 255, 0.03)`,
            '--glass-outer-shadow': mode === 'light'
                ? `rgba(0, 0, 0, 0.1)`
                : `rgba(0, 0, 0, 0.4)`,
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

        if (!terminal) {
            return defaults;
        }

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
     * 获取保存的主题偏好
     */
    getSavedTheme() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const data = this.safeParseStorage(saved);
                return data?.mode || 'auto';
            }
        } catch (e) {
            // 忽略解析错误
        }
        return 'auto';
    },

    /**
     * 设置并保存主题
     */
    setSavedTheme(theme) {
        if (!['auto', 'light', 'dark'].includes(theme)) {
            console.warn('[Theme] 无效的主题:', theme);
            return;
        }

        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            const data = saved ? this.safeParseStorage(saved) : { mode: 'auto' };
            if (!data) {
                this.resetStorage();
                return;
            }
            data.mode = theme;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[Theme] 无法保存主题:', e);
        }

        this.applyTheme(this.getEffectiveTheme(theme));
        this.emitThemeChange(theme);
    },

    /**
     * 重置存储格式
     */
    resetStorage() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ mode: 'auto' }));
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
        const labels = {
            auto: '跟随系统',
            light: '浅色',
            dark: '深色'
        };
        return labels[theme] || theme;
    },

    /**
     * 获取主题图标
     */
    getThemeIcon(theme) {
        const icons = {
            auto: 'fa-desktop',
            light: 'fa-sun',
            dark: 'fa-moon'
        };
        return icons[theme] || 'fa-circle';
    }
};

// 模块导出支持
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}