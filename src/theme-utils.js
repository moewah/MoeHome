/**
 * Theme Manager - 主题管理器
 * 支持 config 驱动的多配色方案系统
 *
 * 核心设计：Mode（模式）与 Scheme（配色方案）分离
 * - Mode = light/dark，决定衍生色规则（透明度、阴影、玻璃效果）
 * - Scheme = 命名配色集合，独立于模式的颜色组合
 *
 * 持久化策略：
 * - 用户选择存储在 localStorage，跨会话保持
 * - 存储键：homepage_theme → { mode, schemes }
 */

// 从内联脚本注入的全局变量获取主题数据
// 这些变量由 generateThemeInitScript() 在 <head> 中设置，确保 ThemeManager 初始化前数据已就绪
(function() {
  // 确保在浏览器环境
  if (typeof window === 'undefined') return;

const ThemeManager = {
  // ========== 常量定义 ==========
  THEME_ATTRIBUTE: "data-theme",
  STORAGE_KEY: "homepage_theme",

  /**
   * 内置预设配色方案（从内联脚本注入的全局变量获取）
   */
  get builtinSchemes() {
    return window.THEME_SCHEMES || {};
  },

  /**
   * 衍生色配置（从内联脚本注入的全局变量获取）
   */
  get deriveConfig() {
    return window.THEME_DERIVE_CONFIG || {};
  },

  // ========== 运行时状态 ==========
  themes: {
    light: { name: "Light", icon: "fa-sun", colors: {} },
    dark: { name: "Dark", icon: "fa-moon", colors: {} },
  },
  schemes: {},

  // 默认配置（从 config 加载）
  defaultMode: "light",
  defaultScheme: {
    light: null,
    dark: null,
  },

  // 当前状态（从 localStorage 恢复）
  activeMode: undefined,
  activeSchemes: {
    light: undefined,
    dark: undefined,
  },

  // ========== 存储层 ==========

  /**
   * 从 localStorage 加载持久化状态
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (e) {
      console.warn("[Theme] 无法读取 localStorage:", e);
      return null;
    }
  },

  /**
   * 保存当前状态到 localStorage
   */
  saveToStorage() {
    try {
      const data = {
        mode: this.activeMode,
        schemes: this.activeSchemes,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("[Theme] 无法写入 localStorage:", e);
    }
  },

  /**
   * 清除持久化存储
   */
  clearStorage() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  },

  // ========== 初始化 ==========

  /**
   * 获取系统默认配色（从 isDefault: true 的方案中获取）
   */
  getDefaultColors(mode) {
    const defaultScheme = Object.values(this.builtinSchemes).find(
      (scheme) => scheme.isDefault && scheme.modes?.includes(mode),
    );
    return defaultScheme?.colors || null;
  },

  /**
   * 初始化主题系统
   */
  init() {
    // 1. 初始化内置方案
    this.initBuiltinSchemes();

    // 2. 从 localStorage 恢复用户选择
    this.restoreFromStorage();

    // 3. 从 config 加载默认配置
    this.loadConfig();

    // 4. 应用主题
    const effectiveTheme = this.getEffectiveTheme(this.getSavedTheme());
    this.applyTheme(effectiveTheme);

    // 5. 监听系统主题变化
    this.setupSystemThemeListener();
  },

  /**
   * 从 localStorage 恢复用户选择
   */
  restoreFromStorage() {
    const stored = this.loadFromStorage();
    if (!stored) return;

    if (stored.mode && ["auto", "light", "dark"].includes(stored.mode)) {
      this.activeMode = stored.mode;
    }

    if (stored.schemes) {
      if (stored.schemes.light !== undefined) {
        this.activeSchemes.light = stored.schemes.light;
      }
      if (stored.schemes.dark !== undefined) {
        this.activeSchemes.dark = stored.schemes.dark;
      }
    }
  },

  /**
   * 从 config 加载主题配置
   */
  loadConfig() {
    const config = window.HOMEPAGE_CONFIG?.theme;
    if (!config) {
      const lightColors = this.getDefaultColors("light");
      const darkColors = this.getDefaultColors("dark");
      this.themes.light.colors = this.buildColors("light", lightColors);
      this.themes.dark.colors = this.buildColors("dark", darkColors);
      return;
    }

    if (this.activeMode === undefined) {
      this.defaultMode = config.default || "light";
    }

    if (config.defaultScheme) {
      this.defaultScheme.light = config.defaultScheme.light || null;
      this.defaultScheme.dark = config.defaultScheme.dark || null;
    }
    if (config.locked && !config.defaultScheme) {
      this.defaultScheme.light = config.locked.light || null;
      this.defaultScheme.dark = config.locked.dark || null;
      console.info("[Theme] 检测到旧版 locked 配置，已自动迁移为 defaultScheme");
    }

    const lightColors = this.getDefaultColors("light");
    const darkColors = this.getDefaultColors("dark");

    if (config.light && !config.defaults) {
      this.themes.light.colors = this.buildColors("light", { ...lightColors, ...config.light });
      this.themes.dark.colors = this.buildColors("dark", { ...darkColors, ...config.dark });
      console.info("[Theme] 检测到旧版配置格式，已自动迁移");
    } else {
      this.themes.light.colors = this.buildColors("light", lightColors);
      this.themes.dark.colors = this.buildColors("dark", darkColors);
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

  // ========== 配色方案管理 ==========

  /**
   * 获取模式适用的配色方案
   */
  getActiveScheme(mode) {
    const savedSchemeId = this.activeSchemes[mode];

    if (savedSchemeId === null) return null;

    if (savedSchemeId) {
      const scheme = this.schemes[savedSchemeId];
      if (scheme && this.isSchemeCompatible(scheme, mode)) {
        return scheme;
      }
    }

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
   * 设置配色方案（持久化保存）
   */
  setScheme(schemeId, mode) {
    this.activeSchemes[mode] = schemeId;
    this.saveToStorage();

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
    return Object.values(this.schemes).filter((scheme) =>
      this.isSchemeCompatible(scheme, mode),
    );
  },

  /**
   * 从配色方案获取颜色配置
   */
  getSchemeColors(scheme, mode) {
    if (scheme.colors && typeof scheme.colors.light === "object") {
      return scheme.colors[mode] || scheme.colors.dark || scheme.colors;
    }
    return scheme.colors;
  },

  // ========== 主题模式管理 ==========

  /**
   * 获取当前主题模式设置
   */
  getSavedTheme() {
    return this.activeMode !== undefined ? this.activeMode : this.defaultMode;
  },

  /**
   * 设置主题模式（持久化保存）
   */
  setSavedTheme(theme) {
    if (!["auto", "light", "dark"].includes(theme)) {
      console.warn("[Theme] 无效的主题:", theme);
      return;
    }

    this.activeMode = theme;
    this.saveToStorage();
    this.applyTheme(this.getEffectiveTheme(theme));
    this.emitThemeChange(theme);
  },

  /**
   * 获取实际生效的主题
   */
  getEffectiveTheme(savedTheme) {
    if (savedTheme === "auto") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
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
   * 获取下一个主题（循环切换）
   */
  getNextTheme() {
    const current = this.getSavedTheme();
    const cycle = ["auto", "light", "dark"];
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

  // ========== 主题应用 ==========

  /**
   * 应用主题到 DOM
   */
  applyTheme(themeName) {
    const scheme = this.getActiveScheme(themeName);

    let colors;
    if (scheme) {
      colors = this.getSchemeColors(scheme, themeName);
    } else {
      colors = this.themes[themeName].colors;
    }

    document.documentElement.setAttribute(this.THEME_ATTRIBUTE, themeName);

    const cssVars = this.buildCSSVariablesArray(colors, themeName);
    cssVars.forEach(([property, value]) => {
      document.documentElement.style.setProperty(property, value);
    });
  },

  /**
   * 构建 CSS 变量数组
   */
  buildCSSVariablesArray(colors, mode) {
    const derive = this.deriveConfig[mode] || {};
    const accentRgb = this.hexToRgb(colors.accent);
    const bgPrimaryRgb = this.hexToRgb(colors.bgPrimary);
    const isLight = mode === "light";

    return [
      ["--bg-primary", colors.bgPrimary],
      ["--bg-secondary", colors.bgSecondary],
      ["--text-primary", colors.textPrimary],
      ["--text-secondary", colors.textSecondary],
      ["--accent", colors.accent],
      ["--accent-rgb", accentRgb],
      ["--accent-deep", this.darkenColor(colors.accent, 0.2)],
      ["--border", colors.border],
      ["--accent-dim", `rgba(${accentRgb},${derive.accentDim || 0.1})`],
      ["--grid-color", `rgba(${accentRgb},${derive.gridColor || 0.05})`],
      ["--notice-bg-warning", `rgba(255,149,0,${derive.notice || 0.08})`],
      ["--notice-bg-info", `rgba(0,161,255,${derive.notice || 0.08})`],
      ["--notice-bg-success", `rgba(39,201,63,${derive.notice || 0.08})`],
      ["--hover-bg", `rgba(${accentRgb},${derive.hover || 0.08})`],
      ["--active-bg", `rgba(${accentRgb},${derive.active || 0.15})`],
      ["--focus-ring", colors.accent],
      ["--shadow-sm", `rgba(0,0,0,${derive.shadowSm || 0.05})`],
      ["--shadow-md", `rgba(0,0,0,${derive.shadowMd || 0.1})`],
      ["--glow", `rgba(${accentRgb},${derive.glow || 0.2})`],
      ["--glow-subtle", `rgba(${accentRgb},0.08)`],
      ["--navbar-bg-scrolled", `rgba(${bgPrimaryRgb},${derive.navbarScrolled || 1})`],
      ["--contribution-1", `rgba(${accentRgb},0.2)`],
      ["--contribution-2", `rgba(${accentRgb},0.4)`],
      ["--contribution-3", `rgba(${accentRgb},0.6)`],
      ["--contribution-4", colors.accent],
      ["--divider-glow", `rgba(${accentRgb},0.4)`],
      ["--card-border-strong", `rgba(${accentRgb},${derive.cardBorderStrong || 0.5})`],
      ["--card-border-muted", `rgba(${accentRgb},${derive.cardBorderMuted || 0.25})`],
      ["--glass-border-top", isLight ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)"],
      ["--glass-border-bottom", isLight ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.5)"],
      ["--glass-border-side", isLight ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.03)"],
      ["--glass-outer-shadow", isLight ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.4)"],
      ["--glass-hover-border", `rgba(${accentRgb},${isLight ? "0.25" : "0.15"})`],
      ["--btn-glass-border-top", isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.08)"],
      ["--btn-glass-border-bottom", isLight ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.5)"],
      ["--btn-glass-shadow", isLight ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.4)"],
      ["--btn-glass-inner-tint", isLight ? "rgba(0,0,0,0.03)" : `rgba(${accentRgb},0.03)`],
      ["--btn-glass-hover-border", isLight ? "rgba(0,0,0,0.2)" : `rgba(${accentRgb},0.15)`],
      ["--btn-glass-active-glow", isLight ? "rgba(0,0,0,0.06)" : `rgba(${accentRgb},0.05)`],
      ["--terminal-bg", colors.bgSecondary],
      ["--terminal-text", colors.textSecondary],
      ["--terminal-prompt", colors.accent],
      ["--terminal-cursor", colors.accent],
    ];
  },

  /**
   * 构建完整颜色对象（用于初始化 themes）
   */
  buildColors(mode, colors) {
    const result = {};
    this.buildCSSVariablesArray(colors, mode).forEach(([key, value]) => {
      result[key] = value;
    });
    return result;
  },

  /**
   * 监听系统主题变化
   */
  setupSystemThemeListener() {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e) => {
      if (this.getSavedTheme() === "auto") {
        const newTheme = e.matches ? "dark" : "light";
        this.applyTheme(newTheme);
        this.emitThemeChange("auto");
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
    }
  },

  // ========== 工具函数 ==========

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
    console.warn("[Theme] 无效的颜色格式:", hex);
    return "0, 0, 0";
  },

  /**
   * 将 hex 颜色加深指定比例
   */
  darkenColor(hex, amount) {
    const rgb = this.hexToRgb(hex).split(", ").map(Number);
    const darkened = rgb.map((channel) =>
      Math.max(0, Math.round(channel * (1 - amount))),
    );
    return `#${darkened.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  },

  // ========== 事件系统 ==========

  /**
   * 触发主题变更事件
   */
  emitThemeChange(theme) {
    const event = new CustomEvent("themechange", {
      detail: {
        mode: theme,
        effectiveTheme: this.getEffectiveTheme(theme),
      },
    });
    document.dispatchEvent(event);
  },

  /**
   * 触发配色方案变更事件
   */
  emitSchemeChange(schemeId, mode) {
    const event = new CustomEvent("schemechange", {
      detail: {
        schemeId,
        mode,
        scheme: schemeId ? this.schemes[schemeId] : null,
      },
    });
    document.dispatchEvent(event);
  },

  /**
   * 获取主题标签
   */
  getThemeLabel(theme) {
    const labels = { auto: "跟随系统", light: "浅色", dark: "暗色" };
    return labels[theme] || theme;
  },

  /**
   * 获取主题图标
   */
  getThemeIcon(theme) {
    const icons = { auto: "fa-desktop", light: "fa-sun", dark: "fa-moon" };
    return icons[theme] || "fa-circle";
  },
};

  // 导出到全局
  window.ThemeManager = ThemeManager;

  // 兼容 Node.js 导出
  if (typeof module !== "undefined" && module.exports) {
    module.exports = ThemeManager;
  }
})();