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

  // ========== 主题配色 ==========
  theme: {
    // 默认主题模式
    // 可选值: 'light' | 'dark' | 'auto'
    default: "auto",

    // 默认配色方案（页面打开时的初始配色，用户仍可自由切换）
    // 可选值: null(使用defaults) | 'amberOrange' | 'nordSnowStorm' | 'gruvboxLight' | 'ayuLight' | 'cyberGreen' | 'catppuccinMocha' | 'kanagawaDragon' | 'rosePineMoon'
    defaultScheme: {
      light: null, // 亮色模式: null(使用amberOrange) | amberOrange | nordSnowStorm | gruvboxLight | ayuLight
      dark: null, // 暗色模式: null(使用cyberGreen) | cyberGreen | catppuccinMocha | kanagawaDragon | rosePineMoon
    },

    // 兜底配色方案（当 defaultScheme 为 null 或不可用时使用）
    defaults: {
      light: {
        accent: "#D97706", // 琥珀橙（Claude 暖灰风格）
        bgPrimary: "#FBF8F3", // 暖白（米白带暖调）
        bgSecondary: "#F5F2ED", // 暖灰（卡片背景）
        textPrimary: "#1C1917", // 深炭灰（Stone 900）
        textSecondary: "#57534E", // 暖中灰（Stone 600）- WCAG AA 对比度 5.2:1
        border: "#E7E5E4", // 暖浅灰边框（Stone 200）
      },
      dark: {
        accent: "#00ff9f",
        bgPrimary: "#0a0a0a",
        bgSecondary: "#111111",
        textPrimary: "#e8e8e8",
        textSecondary: "#888888",
        border: "#222222",
      },
    },
  },

  // ========== 导航栏配置 ==========
  nav: {
    enabled: true,

    // 品牌区配置
    brand: {
      showPrompt: true, // 显示 $ 符号
      hoverText: "~/whoami", // hover 打字机效果文字
    },

    // 自定义二级菜单
    menus: [], // 默认空，示例：
    // menus: [
    //   {
    //     name: 'Resources',
    //     items: [
    //       { name: '工具推荐', url: 'https://...', external: true },
    //       { name: '友情链接', url: 'https://...', external: true },
    //     ]
    //   }
    // ],
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

  // ========== Favicon 配置 ==========
  favicon: {
    path: "", // 自定义 favicon 路径（如 "images/favicon.ico"），留空则从头像自动生成
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

  // ========== 动画配置 ==========
  animation: {
    fadeInDelay: 1000, // ms
    typingSpeed: 60, // ms per character（打字速度）
    quoteDisplayTime: 4000, // ms（每条语录显示时间）
    quoteDeleteSpeed: 42, // ms per character（删除速度，比打字快）
  },

  // ========== RSS 文章配置 ==========
  rss: {
    enabled: false, // 设置为 true 启用
    url: "https://yourblog.com/rss.xml", // 你的博客 RSS 地址
    count: 4,
    openInNewTab: true,
    title: {
      text: "Recent Posts",
      icon: "fa-solid fa-newspaper",
    },
    display: {
      showDate: true,
      showDescription: true,
      maxDescriptionLength: 100,
    },
  },

  // ========== GitHub 项目展示配置 ==========
  projects: {
    enabled: false, // 设置为 false 可禁用此模块
    title: {
      text: "Projects",
      icon: "fa-solid fa-folder-open",
    },
    // GitHub 用户主页地址，构建时自动获取公开仓库
    githubUser: "https://github.com/yourusername", // 替换为你的 GitHub 主页
    // 显示数量限制（按 star 数排序后取前 N 个）
    count: 5,
    // 排除的仓库名（可选，支持正则）
    exclude: [".github"], // 排除 .github 仓库
  },

  // ========== GitHub 贡献图配置 ==========
  contribution: {
    enabled: true, // 是否启用贡献图
    useRealData: true, // true=真实数据, false=随机数据
    // GitHub 用户名（留空则从 projects.githubUser 自动提取）
    githubUser: "",
  },

  // ========== 链接模块配置 ==========
  linksConfig: {
    enabled: true, // 改成 false 禁用整个链接导航模块
    title: {
      text: "Quick Links",
      icon: "fa-solid fa-link",
    },
  },

  // ========== 社交链接 ==========
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

  // ========== Donation Config ==========
  donation: {
    enabled: false, // 设置为 true 启用
    title: {
      text: "Support Me",
      icon: "fa-solid fa-mug-hot",
    },
    message: "如果我的内容对你有帮助，欢迎请我喝杯咖啡~",
    // 支付方式配置（建议启用2-3个，骨架屏最多显示3个按钮）
    methods: [
      {
        name: "微信支付",
        key: "wechat",
        icon: "fa-brands fa-weixin",
        qrImage: "images/wechat.png", // 图片路径相对于 src/ 目录
        enabled: true,
      },
      {
        name: "支付宝",
        key: "alipay",
        icon: "fa-brands fa-alipay",
        qrImage: "images/alipay.png",
        enabled: true,
      },
      {
        name: "PayPal",
        key: "paypal",
        icon: "fa-brands fa-paypal",
        url: "https://www.paypal.com/paypalme/yourname",
        enabled: true,
      },
      {
        name: "爱发电",
        key: "afdian",
        icon: "fa-solid fa-heart",
        url: "https://afdian.com/a/yourname",
        enabled: true,
      },
    ],
  },

  // ========== 滚动进度按钮配置 ==========
  scrollProgress: {
    enabled: true, // 是否启用滚动进度按钮
    showThreshold: 30, // 显示阈值（px），滚动超过此距离即显示
    smoothScroll: true, // 点击是否平滑滚动返回顶部
  },

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
