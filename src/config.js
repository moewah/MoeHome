/**
 * MoeWah Homepage Configuration
 * 所有可配置内容集中管理，便于维护和更新
 */

window.HOMEPAGE_CONFIG = {
  // ========== SEO 配置（由 build.js 注入到 HTML） ==========
  seo: {
    title: "MoeWah - 技术博主 / 开源爱好者 / AI 探索者",
    description:
      "Hi，欢迎访问 MoeWah 的个人主页。这里是我的数字实验室，与我一起探索技术边界：从 Proxmox 虚拟化到 Docker 容器编排。记录 MoeWah 的自动化实践之路，涵盖 Astro 静态建站、AI 绘图流与 Google SEO 优化方案。",
    keywords: [
      "MoeWah",
      "技术博客",
      "Astro",
      "Docker",
      "Proxmox",
      "NAS",
      "私有云",
      "AI工具",
      "ComfyUI",
      "自动化部署",
      "Google SEO",
      "前端开发",
      "虚拟化",
    ],
    og: {
      title: "MoeWah - 个人主页",
      description: "开源爱好者 / Astro爱好者 / AI探索者 - 与我一起探索技术边界",
      image: "images/avatar.webp",
    },
  },

  // ========== 个人信息 ==========
  profile: {
    name: "MoeWah",
    tagline: {
      prefix: "🐾",
      text: "Meow~",
      highlight: "万物皆可萌！",
    },
    avatar: "images/avatar.webp",
  },

  // ========== 身份标签 ==========
  identity: ["开源爱好者", "AI探索者", "自动化实践者", "技术博主"],

  // ========== 兴趣领域 ==========
  interests: [
    "Docker & 容器技术",
    "Proxmox & 虚拟化",
    "NAS & 私有云",
    "AI工具 & ComfyUI",
    "自动化部署",
    "Google SEO",
  ],

  // ========== 终端配置 ==========
  terminal: {
    title: "🐾 meow@tribe:~|",
    prompts: [
      {
        command: "whoami",
        output: "identity", // 自动从 identity 数组生成
      },
      {
        command: "cat interests.txt",
        output: "interests", // 自动从 interests 数组生成
      },
      {
        command: "./wisdom.sh",
        output: "dynamic", // 循环播放名人语录
      },
    ],
  },

  // ========== 名人语录配置 ==========
  quotes: [
    "Empty your mind, be formless, shapeless, like water...",
    "Be water, my friend.",
    "The time you enjoy wasting is not wasted time.",
    "I know that I know nothing.",
    "The only important thing in life is to be yourself.",
    "The only way to true freedom is to be able to walk away.",
    "Inspiration is perishable. Act on it immediately.",
    "Who looks outside, dreams; who looks inside, awakes.",
    "You have to figure out what your own aptitudes are.",
    "You have to compete within your own area of competence.",
  ],

  // ========== 链接配置 ==========
  links: [
    {
      name: "Blog",
      description: "技术文章 & 教程",
      url: "https://yourblog.com",
      icon: "fa-solid fa-pen-nib",
      brand: "blog",
      external: true,
      color: "#00ff9f",
      enabled: true,
    },
    {
      name: "GitHub",
      description: "开源项目 & 代码",
      url: "https://github.com/yourid",
      icon: "fa-brands fa-github",
      brand: "github",
      external: true,
      color: "#58a6ff",
      enabled: true,
    },
    {
      name: "Email",
      description: "联系 & 合作",
      url: "mailto:example@email.com",
      icon: "fa-solid fa-envelope",
      brand: "email",
      external: false,
      color: "#ea4335",
      enabled: true,
    },
    {
      name: "Telegram",
      description: "即时通讯",
      url: "https://t.me/yourid",
      icon: "fa-brands fa-telegram",
      brand: "telegram",
      external: true,
      color: "#229ED9",
      enabled: true,
    },
    {
      name: "Discord",
      description: "社区交流",
      url: "https://discord.gg/yourid",
      icon: "fa-brands fa-discord",
      brand: "discord",
      external: true,
      color: "#5865F2",
      enabled: true,
    },
    {
      name: "Bilibili",
      description: "视频教程",
      url: "https://space.bilibili.com/yourid",
      icon: "fa-brands fa-bilibili",
      brand: "bilibili",
      external: true,
      color: "#00A1D6",
      enabled: true,
    },
    {
      name: "Photos",
      description: "摄影作品",
      url: "https://yourphotos.com",
      icon: "fa-solid fa-images",
      brand: "photos",
      external: true,
      color: "#FF9500",
      enabled: true,
    },
    {
      name: "Weibo",
      description: "微博",
      url: "https://weibo.com/yourid",
      icon: "fa-brands fa-weibo",
      brand: "weibo",
      external: true,
      color: "#E6162D",
      enabled: true,
    },
    {
      name: "X",
      description: "X (Twitter)",
      url: "https://x.com/yourid",
      icon: "fa-brands fa-x-twitter",
      brand: "x",
      external: true,
      color: "#C0C0C0",
      enabled: true,
    },
  ],

  // ========== 页脚配置 ==========
  footer: {
    text: "Powered by",
    link: {
      text: "喵斯基部落",
      url: "#",
    },
  },

  // ========== 安全提示配置 ==========
  notice: {
    enabled: true,
    type: "warning", // warning | info | success
    icon: "fa-solid fa-shield-halved",
    text: "声明：本人不会主动邀请或联系任何人，任何冒用本人名义的一切事物，请务必谨防受骗！",
  },

  // ========== 动画配置 ==========
  animation: {
    fadeInDelay: 1000, // ms
    typingSpeed: 60, // ms per character（打字速度）
    quoteDisplayTime: 4000, // ms（每条语录显示时间）
    quoteDeleteSpeed: 42, // ms per character（删除速度，比打字快）
  },

  // ========== 主题配色 ==========
  theme: {
    accent: "#00ff9f",
    accentSecondary: "#00cc7a",
    bgPrimary: "#0a0a0a",
    bgSecondary: "#111111",
    textPrimary: "#e8e8e8",
    textSecondary: "#888888",
    border: "#222222",
  },

  // ========== 统计代码配置 ==========
  analytics: {
    // Google Analytics - 填写 Measurement ID 启用
    // enabled: true 启用，false 禁用
    googleAnalytics: {
      enabled: false,
      id: "G-XXXXXXXXXX",
    },
    // Microsoft Clarity - 填写 Project ID 启用
    // enabled: true 启用，false 禁用
    microsoftClarity: {
      enabled: false,
      id: "xxxxxxxxxxxx",
    },
    // Umami - 完整脚本标签，留空则不启用
    // 示例: '<script defer src="https://umami.example.com/script.js" data-website-id="xxx"></script>'
    umami: "",
    // 自定义脚本 - 支持任意第三方统计代码
    // 留空数组则不启用
    customScripts: [],
  },
};

// 格式化输出函数
function formatIdentity() {
  return window.HOMEPAGE_CONFIG.identity.join(" / ");
}

function formatInterests() {
  return window.HOMEPAGE_CONFIG.interests.join(" / ");
}
