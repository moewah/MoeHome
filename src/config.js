/**
 * MoeWah Homepage Configuration
 * 所有可配置内容集中管理，便于维护和更新
 */

window.HOMEPAGE_CONFIG = {
  // ========== 站点基础配置 ==========
  // 这些是网站的核心信息，会被所有页面引用
  site: {
    name: "YourName", // 站点名称（用于标题后缀）
    tagline: "技术博主 / 开源爱好者 / AI 探索者", // 站点标语（用于首页标题）
    url: "", // 站点完整 URL（用于 OG 图片等绝对路径）- 空值使用相对路径
    ogImage: "/images/avatar.webp", // 默认 OG 图片（所有页面共用）
  },

  // ========== SEO 配置（首页专用） ==========
  // 首页使用完整的自定义 SEO 内容
  // 内页会自动生成标准格式的标题和描述
  seo: {
    title: "YourName - 技术博主 / 开源爱好者 / AI 探索者",
    description: "Hi，欢迎访问我的个人主页。这里是技术分享与生活记录的空间。",
    keywords: [
      "YourName",
      "技术博客",
      "Astro",
      "Docker",
      "NAS",
      "私有云",
      "AI工具",
      "自动化部署",
    ],
    og: {
      title: "YourName - 个人主页",
      description: "开源爱好者 / AI探索者 - 与我一起探索技术边界",
      image: "https://example.com/images/avatar.webp",
    },
  },

  // ========== 独立页面 SEO 配置 ==========
  // 每个独立页面可以定义自己的 SEO 信息
  // 标题格式自动生成为: "{{page.title}} | {{site.name}}"
  // 描述格式自动生成为: "{{page.description}} - {{site.name}}"（如果未定义 description）
  pages: {
    // 404 页面
    404: {
      title: "页面未找到",
      description: "抱歉，您访问的页面不存在或已被删除",
      robots: "noindex, nofollow", // 特殊配置：不索引
    },
    // 动态页面
    moments: {
      title: "动态",
      icon: "fa-solid fa-bolt", // 菜单图标
      tagline: "我的碎片化分享，这里记录分享实用经验、生活点滴、瞬间感悟。",
      description: "个人动态，记录生活点滴与瞬间感悟",
      keywords: ["动态", "瞬间", "生活记录"],
    },
    // 留言板页面
    guestbook: {
      title: "留言",
      icon: "fa-solid fa-comments", // 菜单图标
      tagline: "欢迎在这里留下你的足迹，分享你的想法和建议。",
      description: "留言板，欢迎留下你的信号",
      keywords: ["留言板", "评论", "交流"],
    },
    // 未来可继续添加其他独立页面...
    // about: {
    //   title: "关于",
    //   description: "关于我",
    // },
  },

  // ========== 主题配色 ==========
  theme: {
    // 默认主题模式
    // 可选值: 'light' | 'dark' | 'auto'
    default: "auto",

    // 默认配色方案（页面打开时的初始配色，用户仍可自由切换）
    // 可选值: null(使用内置默认) | 'coralOrange' | 'nordSnowStorm' | 'gruvboxLight' | 'ayuLight' | 'cyberGreen' | 'catppuccinMocha' | 'kanagawaDragon' | 'rosePineMoon'
    defaultScheme: {
      light: null, // 亮色模式: null(使用内置默认) | coralOrange | nordSnowStorm | gruvboxLight | ayuLight
      dark: null, // 暗色模式: null(使用内置默认) | cyberGreen | catppuccinMocha | kanagawaDragon | rosePineMoon
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
    menus: [
      // 示例配置 - 可删除或修改
      // {
      //   name: "Resources",           // 菜单名称
      //   icon: "fa-solid fa-bookmark", // 可选，自定义图标（Font Awesome 类名）
      //   items: [
      //     {
      //       name: "工具推荐",
      //       url: "https://example.com/tools",
      //       external: true,           // 是否新标签打开
      //     },
      //     {
      //       name: "友情链接",
      //       url: "https://example.com/links",
      //       external: true,
      //     },
      //   ],
      // },
    ], // 默认空数组 = 不显示自定义菜单
  },

  // ========== 个人信息 ==========
  profile: {
    name: "YourName",
    tagline: {
      prefix: "🐾",
      highlight: "欢迎来到我的主页！",
    },
    avatar: "images/avatar.webp",
  },

  // ========== Favicon 配置 ==========
  favicon: {
    path: "", // 自定义 favicon 路径（如 "images/favicon.ico"），留空则从头像自动生成
  },

  // ========== 身份标签 ==========
  identity: ["Hi, I'm YourName.", "开源爱好者", "AI探索者", "自动化实践者"],

  // ========== 兴趣领域 ==========
  interests: ["Docker & 容器技术", "NAS & 私有云", "AI工具", "自动化部署"],

  // ========== 装备列表 ==========
  // 填写你的装备，会在终端显示 `cat gear.txt` 命令
  // 留空数组 [] 则不显示此命令
  gear: [
    // "设备1",
    // "设备2",
    // "设备3",
  ],

  // ========== 终端配置 ==========
  terminal: {
    title: "🐾 user@host:~|",
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
        command: "cat gear.txt",
        output: "gear", // 自动从 gear 数组生成（留空则不显示）
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

  // ========== 音乐播放器配置 ==========
  music: {
    enabled: false, // 是否启用音乐播放器（启用后替换头像与终端之间的分割线）
    volume: 0.5, // 默认音量 (0-1，0.5代表50%音量)
    autoplay: false, // 是否自动播放（注意：大多数浏览器会阻止自动播放）

    // 播放模式："list"=列表循环, "one"=单曲循环, "random"=随机播放
    playMode: "list",

    // 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
    mode: "meting",

    // Meting API 配置（当 mode 为 "meting" 时使用）
    meting: {
      // 音乐平台：netease, tencent, kugou, xiami, baidu
      server: "netease",
      // 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
      type: "playlist",
      // 歌单/专辑/单曲 ID 或搜索关键词
      id: "",
      // API 地址列表（按顺序尝试）
      apis: [
        "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
        "https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
        "https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
      ],
    },

    // 本地音乐配置（当 mode 为 "local" 时使用）
    // 填写相对于 config.js 的音乐文件路径
    local: [
      // "music/song1.mp3",
      // "music/song2.mp3",
    ],
  },

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
      text: "近期更新",
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
      text: "我的项目",
      icon: "fa-solid fa-folder-open",
    },
    // GitHub 用户主页地址，构建时自动获取公开仓库
    // 支持格式：https://github.com/username 或 github.com/username
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

  // ========== 个人动态配置 ==========
  moments: {
    enabled: false, // 是否启用动态模块
    memosUrl: "https://your-memos-instance.com/", // Memos 实例地址
    count: 10, // 获取数量
    tags: [], // 标签过滤（可选，留空获取所有公开动态）
    showSkeleton: true, // 显示骨架屏
  },

  // ========== 留言板配置 ==========
  // 极简配置：只需指定评论系统和服务器地址
  // 其他选项均使用合理默认值，由系统自动处理
  guestbook: {
    // 是否启用留言板功能
    enabled: false,

    // 评论系统: 'artalk' | 'waline'
    provider: "waline",

    // 服务器地址（必填）
    // Artalk: 如 "http://localhost:23366"
    // Waline: 如 "https://your-waline.vercel.app"
    server: "https://your-waline.vercel.app",

    // 站点名称（仅 Artalk 需要，Waline 忽略此项）
    site: "MoeHome",

    // 可选：评论框占位文字（留空使用默认）
    placeholder: "欢迎留下你的信号...",

    // ========== 数量限制配置 ==========
    // 控制评论列表和弹幕的显示数量，优化性能
    // 注意：comments 限制是指"总评论数"（根评论 + 嵌套回复），而非仅根评论数
    limits: {
      // 评论列表限制（总评论数 = 根评论 + 回复）
      comments: {
        newest: 30, // 默认列表（按时间降序）最多显示总评论数
        hot: 30, // 热门列表（按点赞降序）最多显示总评论数
      },
      // 弹幕限制（从评论数据中筛选）
      barrage: {
        pinned: 5, // 置顶弹幕最多条数
        hot: 10, // 热门弹幕最多条数（点赞 ≥ 10 的评论）
        latest: 5, // 最新弹幕最多条数
      },
    },
  },

  // ========== 链接模块配置 ==========
  linksConfig: {
    enabled: true, // 改成 false 禁用整个链接导航模块
    title: {
      text: "链接导航",
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
      name: "Photos",
      description: "摄影作品",
      url: "#",
      icon: "fa-solid fa-images",
      brand: "photos",
      external: true,
      color: "#FF9500",
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
      name: "X",
      description: "X (Twitter)",
      url: "https://x.com/yourid",
      icon: "fa-brands fa-x-twitter",
      brand: "x",
      external: true,
      color: "#C0C0C0",
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
      name: "Email",
      description: "联系 & 合作",
      url: "mailto:example@email.com",
      icon: "fa-solid fa-envelope",
      brand: "email",
      external: false,
      color: "#ea4335",
      antiCrawler: true, // 反爬虫保护，对邮箱地址编码防止被抓取
      enabled: true,
    },
  ],

  // ========== 赞赏支持配置 ==========
  donation: {
    enabled: false, // 设置为 true 启用
    title: {
      text: "赞助支持",
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
        name: "爱发电",
        key: "afdian",
        icon: "fa-solid fa-heart",
        url: "https://ifdian.net/a/yourname",
        enabled: true,
      },
      {
        name: "PayPal",
        key: "paypal",
        icon: "fa-brands fa-paypal",
        url: "https://www.paypal.com/paypalme/yourname",
        enabled: false,
      },
    ],
  },

  // ========== 页脚配置 ==========
  footer: {
    // 版权信息配置
    copyright: {
      year: "2018-2026", // 版权年份
      name: "Your Name", // 版权名称
      url: "https://yourblog.com/", // 链接地址
    },
    // ICP 备案号配置（中国大陆网站需要）
    icp: {
      enabled: false, // 是否显示备案号
      number: "京ICP备XXXXXXXX号", // 备案号
      url: "https://beian.miit.gov.cn/", // 备案查询地址，一般不需要修改
    },
  },

  // ========== 安全提示配置 ==========
  notice: {
    enabled: false,
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
