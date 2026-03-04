/**
 * Theme Manager - 主题管理器
 * 支持 config 驱动的双主题系统
 *
 * 配置优先级：config.js > defaults
 */

const ThemeManager = {
    STORAGE_KEY: 'moewah-theme-preference',
    THEME_ATTRIBUTE: 'data-theme',

    /**
     * 默认主题配置（作为 fallback）
     */
    defaults: {
        light: {
            accent: '#00cc7a',
            bgPrimary: '#ffffff',
            bgSecondary: '#f5f5f5',
            textPrimary: '#1a1a1a',
            textSecondary: '#666666',
            border: '#e0e0e0',
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
     * 衍生色配置（固定透明度）
     */
    deriveConfig: {
        light: {
            // 现有衍生
            accentDimOpacity: 0.1,
            gridColorOpacity: 0.05,
            noticeOpacity: 0.08,
            // P0 交互状态
            hoverOpacity: 0.08,
            activeOpacity: 0.15,
            // P1 阴影深度
            shadowSmOpacity: 0.05,
            shadowMdOpacity: 0.1,
            glowOpacity: 0.2,
            glowSubtleOpacity: 0.08,
            navbarScrolledOpacity: 0.72,
            // 卡片边框层次
            cardBorderStrong: 0.5,
            cardBorderMuted: 0.25,
        },
        dark: {
            // 现有衍生
            accentDimOpacity: 0.1,
            gridColorOpacity: 0.03,
            noticeOpacity: 0.05,
            // P0 交互状态
            hoverOpacity: 0.1,
            activeOpacity: 0.2,
            // P1 阴影深度
            shadowSmOpacity: 0.3,
            shadowMdOpacity: 0.5,
            glowOpacity: 0.3,
            glowSubtleOpacity: 0.08,
            navbarScrolledOpacity: 0.72,
            // 卡片边框层次
            cardBorderStrong: 0.4,
            cardBorderMuted: 0.2,
        }
    },

    /**
     * 运行时主题数据（由 loadConfig 填充）
     */
    themes: {
        light: { name: '浅色', icon: 'fa-sun', colors: {} },
        dark: { name: '深色', icon: 'fa-moon', colors: {} }
    },

    /**
     * 初始化主题系统
     */
    init() {
        this.loadConfig();
        const savedTheme = this.getSavedTheme();
        const effectiveTheme = this.getEffectiveTheme(savedTheme);
        this.applyTheme(effectiveTheme);
        this.setupSystemThemeListener();
    },

    /**
     * 从 config 加载主题配置，合并到 defaults
     */
    loadConfig() {
        const config = window.HOMEPAGE_CONFIG?.theme;
        if (!config) {
            this.themes.light.colors = this.buildColors('light', this.defaults.light, null);
            this.themes.dark.colors = this.buildColors('dark', this.defaults.dark, null);
            return;
        }

        // 检测旧版格式
        if (this.isLegacyConfig(config)) {
            this.migrateLegacyConfig(config);
            return;
        }

        // 新版格式：合并配置
        this.themes.light.colors = this.buildColors(
            'light',
            { ...this.defaults.light, ...(config.light || {}) },
            config.light?.terminal || null
        );
        this.themes.dark.colors = this.buildColors(
            'dark',
            { ...this.defaults.dark, ...(config.dark || {}) },
            config.dark?.terminal || null
        );
    },

    /**
     * 检测是否为旧版配置格式
     */
    isLegacyConfig(config) {
        return config.accent && !config.light && !config.dark;
    },

    /**
     * 迁移旧版配置（应用到 dark 主题）
     */
    migrateLegacyConfig(config) {
        console.info('[Theme] 检测到旧版配置格式，已自动应用为 dark 主题');

        this.themes.dark.colors = this.buildColors('dark', {
            ...this.defaults.dark,
            accent: config.accent,
            bgPrimary: config.bgPrimary || this.defaults.dark.bgPrimary,
            bgSecondary: config.bgSecondary || this.defaults.dark.bgSecondary,
            textPrimary: config.textPrimary || this.defaults.dark.textPrimary,
            textSecondary: config.textSecondary || this.defaults.dark.textSecondary,
            border: config.border || this.defaults.dark.border,
        }, null);

        this.themes.light.colors = this.buildColors('light', this.defaults.light, null);
    },

    /**
     * 构建完整的 CSS 变量对象
     * @param {string} mode - 'light' | 'dark'
     * @param {Object} colors - 核心颜色配置
     * @param {Object|null} terminal - 终端配置（可选）
     * @returns {Object} CSS 变量键值对
     */
    buildColors(mode, colors, terminal) {
        const derive = this.deriveConfig[mode];
        const accentRgb = this.hexToRgb(colors.accent);
        const bgPrimaryRgb = this.hexToRgb(colors.bgPrimary);

        // 校验颜色格式
        this.validateColors(colors);

        // 合并终端配置
        const terminalColors = this.mergeTerminalConfig(mode, terminal, colors);

        return {
            // === 核心颜色 ===
            '--bg-primary': colors.bgPrimary,
            '--bg-secondary': colors.bgSecondary,
            '--text-primary': colors.textPrimary,
            '--text-secondary': colors.textSecondary,
            '--accent': colors.accent,
            '--accent-deep': this.darkenColor(colors.accent, 0.2),
            '--border': colors.border,

            // === 现有衍生 ===
            '--accent-dim': `rgba(${accentRgb}, ${derive.accentDimOpacity})`,
            '--grid-color': `rgba(${accentRgb}, ${derive.gridColorOpacity})`,
            '--notice-bg-warning': `rgba(255, 149, 0, ${derive.noticeOpacity})`,
            '--notice-bg-info': `rgba(0, 161, 255, ${derive.noticeOpacity})`,
            '--notice-bg-success': `rgba(39, 201, 63, ${derive.noticeOpacity})`,

            // === P0 交互状态 ===
            '--hover-bg': `rgba(${accentRgb}, ${derive.hoverOpacity})`,
            '--active-bg': `rgba(${accentRgb}, ${derive.activeOpacity})`,
            '--focus-ring': colors.accent,

            // === P1 阴影深度 ===
            '--shadow-sm': `rgba(0, 0, 0, ${derive.shadowSmOpacity})`,
            '--shadow-md': `rgba(0, 0, 0, ${derive.shadowMdOpacity})`,
            '--glow': `rgba(${accentRgb}, ${derive.glowOpacity})`,
            '--glow-subtle': `rgba(${accentRgb}, ${derive.glowSubtleOpacity})`,
            '--navbar-bg-scrolled': `rgba(${bgPrimaryRgb}, ${derive.navbarScrolledOpacity})`,

            // === P3 贡献图格子 ===
            '--contribution-1': `rgba(${accentRgb}, 0.2)`,
            '--contribution-2': `rgba(${accentRgb}, 0.4)`,
            '--contribution-3': `rgba(${accentRgb}, 0.6)`,
            '--contribution-4': colors.accent,

            // === P4 分割线 ===
            '--divider-glow': `rgba(${accentRgb}, 0.4)`,

            // === 卡片边框层次 ===
            '--card-border-strong': `rgba(${accentRgb}, ${derive.cardBorderStrong})`,
            '--card-border-muted': `rgba(${accentRgb}, ${derive.cardBorderMuted})`,

            // === P2 终端配色 ===
            '--terminal-bg': terminalColors.bg,
            '--terminal-text': terminalColors.text,
            '--terminal-prompt': terminalColors.prompt,
            '--terminal-cursor': terminalColors.cursor,
        };
    },

    /**
     * 合并终端配置
     * @param {string} mode - 'light' | 'dark'
     * @param {Object|null} terminal - 用户配置的终端颜色
     * @param {Object} colors - 核心颜色配置（用于默认值）
     * @returns {Object} 终端颜色配置
     */
    mergeTerminalConfig(mode, terminal, colors) {
        // 默认跟随主主题
        const defaults = {
            bg: colors.bgSecondary,
            text: colors.textSecondary,
            prompt: colors.accent,
            cursor: colors.accent,
        };

        if (!terminal) {
            return defaults;
        }

        // 用户配置覆盖默认值
        return {
            bg: terminal.bg || defaults.bg,
            text: terminal.text || defaults.text,
            prompt: terminal.prompt || defaults.prompt,
            cursor: terminal.cursor || defaults.cursor,
        };
    },

    /**
     * 校验颜色格式
     * @param {Object} colors - 颜色配置对象
     */
    validateColors(colors) {
        const hexPattern = /^#([a-f\d]{3}|[a-f\d]{6})$/i;
        const fields = ['accent', 'bgPrimary', 'bgSecondary', 'textPrimary', 'textSecondary', 'border'];

        fields.forEach(field => {
            if (colors[field] && !hexPattern.test(colors[field])) {
                console.warn(`[Theme] ${field} 颜色格式无效，应为 hex 格式 (#RGB 或 #RRGGBB): ${colors[field]}`);
            }
        });
    },

    /**
     * Hex 转 RGB 字符串
     * @param {string} hex - #00ff9f 或 #fff
     * @returns {string} - "0, 255, 159"
     */
    hexToRgb(hex) {
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
        // fallback
        console.warn('[Theme] 无效的颜色格式:', hex);
        return '0, 0, 0';
    },

    /**
     * 将 hex 颜色加深指定比例
     * @param {string} hex - #00ff9f 或 #fff
     * @param {number} amount - 加深比例 (0-1)
     * @returns {string} - 加深后的 hex 颜色
     */
    darkenColor(hex, amount) {
        // 先转换为 RGB
        const rgb = this.hexToRgb(hex).split(', ').map(Number);

        // 加深每个通道
        const darkened = rgb.map(channel => {
            return Math.max(0, Math.round(channel * (1 - amount)));
        });

        // 转回 hex
        return `#${darkened.map(c => c.toString(16).padStart(2, '0')).join('')}`;
    },

    /**
     * 获取保存的主题偏好
     */
    getSavedTheme() {
        return localStorage.getItem(this.STORAGE_KEY) || 'auto';
    },

    /**
     * 设置并保存主题
     */
    setSavedTheme(theme) {
        if (!['auto', 'light', 'dark'].includes(theme)) {
            console.warn('[Theme] 无效的主题:', theme);
            return;
        }
        localStorage.setItem(this.STORAGE_KEY, theme);
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
        const theme = this.themes[themeName];
        if (!theme) {
            console.warn('[Theme] 未找到主题:', themeName);
            return;
        }

        document.documentElement.setAttribute(this.THEME_ATTRIBUTE, themeName);

        Object.entries(theme.colors).forEach(([property, value]) => {
            document.documentElement.style.setProperty(property, value);
        });

        this.updateThemeToggleIcon(theme.icon);
    },

    /**
     * 监听系统主题变化
     */
    setupSystemThemeListener() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = (e) => {
            if (this.getSavedTheme() === 'auto') {
                this.applyTheme(e.matches ? 'dark' : 'light');
            }
        };

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleChange);
        } else if (mediaQuery.addListener) {
            mediaQuery.addListener(handleChange);
        }
    },

    /**
     * 更新主题切换按钮图标
     */
    updateThemeToggleIcon(themeName) {
        const toggleIcon = document.querySelector('.theme-toggle i');
        if (toggleIcon) {
            toggleIcon.className = 'fa-solid fa-circle-half-stroke';
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