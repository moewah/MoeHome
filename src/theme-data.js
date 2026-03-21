/**
 * 主题数据模块 - 构建/运行时共享
 *
 * 这个文件同时被 build.js 和 theme-utils.js 引用
 * 确保配色方案和衍生色配置只需维护一处
 */

/**
 * 主题相关常量（单一真实来源）
 */
const THEME_CONSTANTS = {
  STORAGE_KEY: "homepage_theme",
  THEME_ATTRIBUTE: "data-theme",
};

/**
 * 内置预设配色方案
 */
const builtinSchemes = {
  // === 系统默认方案 ===
  coralOrange: {
    id: "coralOrange",
    name: "珊瑚橙 (默认)",
    icon: "fa-palette",
    isDefault: true,
    modes: ["light"],
    colors: {
      accent: "#C6613F",
      bgPrimary: "#F8F2ED",
      bgSecondary: "#FFF",
      textPrimary: "#3D3630",
      textSecondary: "#8B7E75",
      border: "#EDE4DC",
    },
  },
  cyberGreen: {
    id: "cyberGreen",
    name: "赛博绿 (默认)",
    icon: "fa-bolt",
    isDefault: true,
    modes: ["dark"],
    colors: {
      accent: "#00ff9f",
      bgPrimary: "#0a0a0a",
      bgSecondary: "#111111",
      textPrimary: "#e8e8e8",
      textSecondary: "#888888",
      border: "#222222",
    },
  },
  // === 社区配色方案 ===
  catppuccinMocha: {
    id: "catppuccinMocha",
    name: "摩卡色",
    icon: "fa-mug-hot",
    modes: ["dark"],
    colors: {
      accent: "#89b4fa",
      bgPrimary: "#1e1e2e",
      bgSecondary: "#181825",
      textPrimary: "#cdd6f4",
      textSecondary: "#a6adc8",
      border: "#313244",
    },
  },
  kanagawaDragon: {
    id: "kanagawaDragon",
    name: "浮世绘",
    icon: "fa-dragon",
    modes: ["dark"],
    colors: {
      accent: "#c4746e",
      bgPrimary: "#181616",
      bgSecondary: "#1d1c1c",
      textPrimary: "#c5c9c5",
      textSecondary: "#7a8382",
      border: "#282727",
    },
  },
  rosePineMoon: {
    id: "rosePineMoon",
    name: "鸢尾紫",
    icon: "fa-moon",
    modes: ["dark"],
    colors: {
      accent: "#c4a7e7",
      bgPrimary: "#232136",
      bgSecondary: "#2a273f",
      textPrimary: "#e0def4",
      textSecondary: "#6e6a86",
      border: "#393552",
    },
  },
  nordSnowStorm: {
    id: "nordSnowStorm",
    name: "冰川青",
    icon: "fa-snowflake",
    modes: ["light"],
    colors: {
      accent: "#88C0D0",
      bgPrimary: "#E5E9F0",
      bgSecondary: "#ECEFF4",
      textPrimary: "#2E3440",
      textSecondary: "#4C566A",
      border: "#D8DEE9",
    },
  },
  gruvboxLight: {
    id: "gruvboxLight",
    name: "复古风",
    icon: "fa-compact-disc",
    modes: ["light"],
    colors: {
      accent: "#af3a03",
      bgPrimary: "#f2e5bc",
      bgSecondary: "#fbf1c7",
      textPrimary: "#3c3836",
      textSecondary: "#665c54",
      border: "#d5c4a1",
    },
  },
  ayuLight: {
    id: "ayuLight",
    name: "简约风",
    icon: "fa-feather",
    modes: ["light"],
    colors: {
      accent: "#ff9940",
      bgPrimary: "#f3f3f3",
      bgSecondary: "#fafafa",
      textPrimary: "#5c6166",
      textSecondary: "#8a9199",
      border: "#e6e6e6",
    },
  },
};

/**
 * 衍生色透明度配置
 */
const deriveConfig = {
  light: {
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
  },
  dark: {
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
  },
};

/**
 * Hex 转 RGB 字符串
 * @param {string} hex - #00ff9f 或 #fff
 * @returns {string} - "0, 255, 159"
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }
  const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (shortResult) {
    return `${parseInt(shortResult[1] + shortResult[1], 16)}, ${parseInt(shortResult[2] + shortResult[2], 16)}, ${parseInt(shortResult[3] + shortResult[3], 16)}`;
  }
  return "0, 0, 0";
}

/**
 * 将 hex 颜色加深指定比例
 * @param {string} hex - #00ff9f 或 #fff
 * @param {number} amount - 加深比例 (0-1)
 * @returns {string} - 加深后的 hex 颜色
 */
function darkenColor(hex, amount) {
  const rgb = hexToRgb(hex).split(", ").map(Number);
  const darkened = rgb.map((c) => Math.max(0, Math.round(c * (1 - amount))));
  return `#${darkened.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 从配色方案获取颜色
 * @param {object} scheme - 配色方案对象
 * @param {string} mode - 'light' 或 'dark'
 * @returns {object|null} - 颜色配置
 */
function getSchemeColors(scheme, mode) {
  if (!scheme || !scheme.colors) return null;
  if (typeof scheme.colors.light === "object") {
    return scheme.colors[mode] || scheme.colors.dark || scheme.colors;
  }
  return scheme.colors;
}

/**
 * 检查方案是否适用于指定模式
 * @param {object} scheme - 配色方案对象
 * @param {string} mode - 'light' 或 'dark'
 * @returns {boolean}
 */
function isSchemeCompatible(scheme, mode) {
  return !scheme.modes || scheme.modes.includes(mode);
}

/**
 * 获取系统默认配色
 * @param {string} mode - 'light' 或 'dark'
 * @returns {object|null} - 颜色配置
 */
function getDefaultColors(mode) {
  const scheme = Object.values(builtinSchemes).find(
    (s) => s.isDefault && s.modes && s.modes.includes(mode)
  );
  return scheme ? scheme.colors : null;
}

/**
 * 构建 CSS 变量数组
 * @param {object} colors - 颜色配置
 * @param {string} mode - 'light' 或 'dark'
 * @returns {string[]} - CSS 变量数组 ['--bg-primary:#fff', ...]
 */
function buildCSSVariablesArray(colors, mode) {
  const derive = deriveConfig[mode];
  const accentRgb = hexToRgb(colors.accent);
  const bgPrimaryRgb = hexToRgb(colors.bgPrimary);
  const isLight = mode === "light";

  return [
    "--bg-primary:" + colors.bgPrimary,
    "--bg-secondary:" + colors.bgSecondary,
    "--text-primary:" + colors.textPrimary,
    "--text-secondary:" + colors.textSecondary,
    "--accent:" + colors.accent,
    "--accent-deep:" + darkenColor(colors.accent, 0.2),
    "--border:" + colors.border,
    "--accent-dim:rgba(" + accentRgb + "," + derive.accentDim + ")",
    "--grid-color:rgba(" + accentRgb + "," + derive.gridColor + ")",
    "--notice-bg-warning:rgba(255,149,0," + derive.notice + ")",
    "--notice-bg-info:rgba(0,161,255," + derive.notice + ")",
    "--notice-bg-success:rgba(39,201,63," + derive.notice + ")",
    "--hover-bg:rgba(" + accentRgb + "," + derive.hover + ")",
    "--active-bg:rgba(" + accentRgb + "," + derive.active + ")",
    "--focus-ring:" + colors.accent,
    "--shadow-sm:rgba(0,0,0," + derive.shadowSm + ")",
    "--shadow-md:rgba(0,0,0," + derive.shadowMd + ")",
    "--glow:rgba(" + accentRgb + "," + derive.glow + ")",
    "--glow-subtle:rgba(" + accentRgb + ",0.08)",
    "--navbar-bg-scrolled:rgba(" + bgPrimaryRgb + "," + derive.navbarScrolled + ")",
    "--contribution-1:rgba(" + accentRgb + ",0.2)",
    "--contribution-2:rgba(" + accentRgb + ",0.4)",
    "--contribution-3:rgba(" + accentRgb + ",0.6)",
    "--contribution-4:" + colors.accent,
    "--divider-glow:rgba(" + accentRgb + ",0.4)",
    "--card-border-strong:rgba(" + accentRgb + "," + derive.cardBorderStrong + ")",
    "--card-border-muted:rgba(" + accentRgb + "," + derive.cardBorderMuted + ")",
    "--glass-border-top:" + (isLight ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)"),
    "--glass-border-bottom:" + (isLight ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.5)"),
    "--glass-border-side:" + (isLight ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.03)"),
    "--glass-outer-shadow:" + (isLight ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.4)"),
    "--glass-hover-border:rgba(" + accentRgb + "," + (isLight ? "0.25" : "0.15") + ")",
    "--btn-glass-border-top:" + (isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.08)"),
    "--btn-glass-border-bottom:" + (isLight ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.5)"),
    "--btn-glass-shadow:" + (isLight ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.4)"),
    "--btn-glass-inner-tint:" + (isLight ? "rgba(0,0,0,0.03)" : "rgba(" + accentRgb + ",0.03)"),
    "--btn-glass-hover-border:" + (isLight ? "rgba(0,0,0,0.2)" : "rgba(" + accentRgb + ",0.15)"),
    "--btn-glass-active-glow:" + (isLight ? "rgba(0,0,0,0.06)" : "rgba(" + accentRgb + ",0.05)"),
    "--terminal-bg:" + colors.bgSecondary,
    "--terminal-text:" + colors.textSecondary,
    "--terminal-prompt:" + colors.accent,
    "--terminal-cursor:" + colors.accent,
  ];
}

/**
 * 构建 CSS 变量字符串（用于内联 style）
 * @param {object} colors - 颜色配置
 * @param {string} mode - 'light' 或 'dark'
 * @returns {string} - CSS 变量字符串
 */
function buildStyleString(colors, mode) {
  return buildCSSVariablesArray(colors, mode).join(";");
}

/**
 * 生成内联脚本所需的辅助函数代码
 * 用于 build.js 的 generateThemeInitScript，确保函数逻辑只维护一处
 * @returns {object} - 函数名到源码的映射
 */
function getInlineScriptHelpers() {
  return {
    hexToRgb: function hexToRgb(hex) {
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result) return parseInt(result[1], 16) + "," + parseInt(result[2], 16) + "," + parseInt(result[3], 16);
      var shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
      if (shortResult) return parseInt(shortResult[1] + shortResult[1], 16) + "," + parseInt(shortResult[2] + shortResult[2], 16) + "," + parseInt(shortResult[3] + shortResult[3], 16);
      return "0,0,0";
    }.toString(),

    darkenColor: function darkenColor(hex, amount) {
      var rgb = hexToRgb(hex).split(",").map(Number);
      return "#" + rgb.map(function(c) { return Math.max(0, Math.round(c * (1 - amount))); }).map(function(c) { return c.toString(16).padStart(2, "0"); }).join("");
    }.toString(),

    buildStyleString: function buildStyleString(colors, mode) {
      var d = DERIVE_CONFIG[mode];
      var a = hexToRgb(colors.accent);
      var b = hexToRgb(colors.bgPrimary);
      var isL = mode === "light";
      return "--bg-primary:" + colors.bgPrimary + ";" +
             "--bg-secondary:" + colors.bgSecondary + ";" +
             "--text-primary:" + colors.textPrimary + ";" +
             "--text-secondary:" + colors.textSecondary + ";" +
             "--accent:" + colors.accent + ";" +
             "--accent-deep:" + darkenColor(colors.accent, 0.2) + ";" +
             "--border:" + colors.border + ";" +
             "--accent-dim:rgba(" + a + "," + d.accentDim + ");" +
             "--grid-color:rgba(" + a + "," + d.gridColor + ");" +
             "--notice-bg-warning:rgba(255,149,0," + d.notice + ");" +
             "--notice-bg-info:rgba(0,161,255," + d.notice + ");" +
             "--notice-bg-success:rgba(39,201,63," + d.notice + ");" +
             "--hover-bg:rgba(" + a + "," + d.hover + ");" +
             "--active-bg:rgba(" + a + "," + d.active + ");" +
             "--focus-ring:" + colors.accent + ";" +
             "--shadow-sm:rgba(0,0,0," + d.shadowSm + ");" +
             "--shadow-md:rgba(0,0,0," + d.shadowMd + ");" +
             "--glow:rgba(" + a + "," + d.glow + ");" +
             "--glow-subtle:rgba(" + a + ",0.08);" +
             "--navbar-bg-scrolled:rgba(" + b + "," + d.navbarScrolled + ");" +
             "--contribution-1:rgba(" + a + ",0.2);" +
             "--contribution-2:rgba(" + a + ",0.4);" +
             "--contribution-3:rgba(" + a + ",0.6);" +
             "--contribution-4:" + colors.accent + ";" +
             "--divider-glow:rgba(" + a + ",0.4);" +
             "--card-border-strong:rgba(" + a + "," + d.cardBorderStrong + ");" +
             "--card-border-muted:rgba(" + a + "," + d.cardBorderMuted + ");" +
             "--glass-border-top:" + (isL ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)") + ";" +
             "--glass-border-bottom:" + (isL ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.5)") + ";" +
             "--glass-border-side:rgba(255,255,255,0.03);" +
             "--glass-outer-shadow:" + (isL ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.4)") + ";" +
             "--glass-hover-border:rgba(" + a + "," + (isL ? "0.25" : "0.15") + ");" +
             "--btn-glass-border-top:" + (isL ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.08)") + ";" +
             "--btn-glass-border-bottom:" + (isL ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.5)") + ";" +
             "--btn-glass-shadow:" + (isL ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.4)") + ";" +
             "--btn-glass-inner-tint:" + (isL ? "rgba(0,0,0,0.03)" : "rgba(" + a + ",0.03)") + ";" +
             "--btn-glass-hover-border:" + (isL ? "rgba(0,0,0,0.2)" : "rgba(" + a + ",0.15)") + ";" +
             "--btn-glass-active-glow:" + (isL ? "rgba(0,0,0,0.06)" : "rgba(" + a + ",0.05)") + ";" +
             "--terminal-bg:" + colors.bgSecondary + ";" +
             "--terminal-text:" + colors.textSecondary + ";" +
             "--terminal-prompt:" + colors.accent + ";" +
             "--terminal-cursor:" + colors.accent;
    }.toString(),
  };
}

// 导出（兼容 Node.js 和浏览器）
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
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
    getInlineScriptHelpers,
  };
}