/**
 * Theme Utils - 主题切换工具函数
 * 支持 auto/dark/light 三种主题模式
 */

const ThemeManager = {
    STORAGE_KEY: 'moewah-theme-preference',
    THEME_ATTRIBUTE: 'data-theme',
    
    themes: {
        light: {
            name: '浅色',
            icon: 'fa-sun',
            colors: {
                '--bg-primary': '#ffffff',
                '--bg-secondary': '#f5f5f5',
                '--text-primary': '#1a1a1a',
                '--text-secondary': '#666666',
                '--accent': '#00cc7a',
                '--accent-dim': 'rgba(0, 204, 122, 0.1)',
                '--border': '#e0e0e0',
                '--grid-color': 'rgba(0, 204, 122, 0.05)',
                '--notice-warning-bg': 'rgba(255, 149, 0, 0.08)',
                '--notice-info-bg': 'rgba(0, 161, 255, 0.08)',
                '--notice-success-bg': 'rgba(39, 201, 63, 0.08)',
            }
        },
        dark: {
            name: '深色',
            icon: 'fa-moon',
            colors: {
                '--bg-primary': '#0a0a0a',
                '--bg-secondary': '#111111',
                '--text-primary': '#e8e8e8',
                '--text-secondary': '#888888',
                '--accent': '#00ff9f',
                '--accent-dim': 'rgba(0, 255, 159, 0.1)',
                '--border': '#222222',
                '--grid-color': 'rgba(0, 255, 159, 0.03)',
                '--notice-warning-bg': 'rgba(255, 149, 0, 0.05)',
                '--notice-info-bg': 'rgba(0, 161, 255, 0.05)',
                '--notice-success-bg': 'rgba(39, 201, 63, 0.05)',
            }
        }
    },

    init() {
        const savedTheme = this.getSavedTheme();
        const effectiveTheme = this.getEffectiveTheme(savedTheme);
        this.applyTheme(effectiveTheme);
        this.setupSystemThemeListener();
    },

    getSavedTheme() {
        return localStorage.getItem(this.STORAGE_KEY) || 'auto';
    },

    setSavedTheme(theme) {
        if (!['auto', 'light', 'dark'].includes(theme)) {
            console.warn('Invalid theme:', theme);
            return;
        }
        localStorage.setItem(this.STORAGE_KEY, theme);
        this.applyTheme(this.getEffectiveTheme(theme));
        this.emitThemeChange(theme);
    },

    getEffectiveTheme(savedTheme) {
        if (savedTheme === 'auto') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return savedTheme;
    },

    getCurrentMode() {
        return this.getSavedTheme();
    },

    getEffectiveMode() {
        return this.getEffectiveTheme(this.getSavedTheme());
    },

    applyTheme(themeName) {
        const theme = this.themes[themeName];
        if (!theme) {
            console.warn('Theme not found:', themeName);
            return;
        }

        document.documentElement.setAttribute(this.THEME_ATTRIBUTE, themeName);
        
        Object.entries(theme.colors).forEach(([property, value]) => {
            document.documentElement.style.setProperty(property, value);
        });

        this.updateThemeToggleIcon(theme.icon);
    },

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

    updateThemeToggleIcon(themeName) {
        const toggleIcon = document.querySelector('.theme-toggle i');
        if (toggleIcon) {
            toggleIcon.className = 'fa-solid fa-circle-half-stroke';
        }
    },

    emitThemeChange(theme) {
        const event = new CustomEvent('themechange', {
            detail: {
                mode: theme,
                effectiveTheme: this.getEffectiveTheme(theme)
            }
        });
        document.dispatchEvent(event);
    },

    getNextTheme() {
        const current = this.getSavedTheme();
        const cycle = ['auto', 'light', 'dark'];
        const currentIndex = cycle.indexOf(current);
        return cycle[(currentIndex + 1) % cycle.length];
    },

    toggle() {
        const nextTheme = this.getNextTheme();
        this.setSavedTheme(nextTheme);
        return nextTheme;
    },

    getThemeLabel(theme) {
        const labels = {
            auto: '跟随系统',
            light: '浅色',
            dark: '深色'
        };
        return labels[theme] || theme;
    },

    getThemeIcon(theme) {
        const icons = {
            auto: 'fa-desktop',
            light: 'fa-sun',
            dark: 'fa-moon'
        };
        return icons[theme] || 'fa-circle';
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}
