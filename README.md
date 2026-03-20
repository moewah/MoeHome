# MoeHome 个人主页

**个人品牌的中心化入口**

MoeHome 不是传统意义上的"博客"或"作品集"，而是一张精心设计的数字名片——将分散的社交资产（GitHub、Twitter、博客、音乐品味）聚合为统一的品牌体验。

配置驱动、静态优先，支持多主题配色、GitHub 集成、RSS 聚合，专注性能与视觉体验。

![License](https://img.shields.io/badge/License-MIT-green)

## 页面预览

**暗色主题**
![暗色主题预览](./src/images/screenshot-dark.png)

**亮色主题**
![亮色主题预览](./src/images/screenshot-light.png)

## 特性

- 🎨 **配置驱动** - 所有内容在 config.js 中管理，无需修改代码
- 🔍 **SEO 友好** - 构建生成纯静态 HTML，搜索引擎完美支持
- 🔒 **邮箱反爬虫** - mailto 链接动态编码，防止被爬虫抓取邮箱地址
- ✨ **精致视觉** - 网格背景、玻璃光泽卡片、自定义光标、终端打字机
- 🎨 **多主题配色** - 跟随系统、浅色、暗色三种模式，八种精选配色方案，通过 config.js 锁定心仪色彩
- 📱 **响应式设计** - 完美适配移动端和桌面端，支持触摸手势
- 🚀 **零运行时依赖** - 前端无框架，构建时自动压缩优化
- 📦 **易部署** - 构建输出即插即用，支持任意静态托管
- 🐙 **GitHub 集成** - 自动展示项目和贡献图（支持真实/随机数据）
- 📰 **RSS 聚合** - 构建时预获取博客文章，无运行时延迟
- 🎵 **音乐播放器** - 支持 Meting API 和本地音乐，简约设计融入页面
- 📝 **Memos 动态** - 集成 Memos 实例，时间线布局，支持图片/音视频/Markdown
- 💬 **留言板** - 终端风格弹幕交互，支持 Waline/Artalk 评论系统
- 📊 **多统计支持** - Google Analytics、Clarity、Umami、自定义脚本

## 快速开始

### 安装

```bash
git clone https://github.com/moewah/MoeHome.git
cd MoeHome
npm install  # 安装开发依赖
```

### 开发

```bash
# 修改 src/config.js 配置你的内容
# 构建生成静态页面
npm run build

# 本地预览
npm run serve
# 访问 http://localhost:8080
```

## 配置说明

所有配置都在 `src/config.js` 文件中，按页面渲染顺序：

### 站点基础配置

```javascript
site: {
    name: 'YourName',                            // 站点名称（用于标题后缀）
    tagline: '技术博主 / 开源爱好者 / AI 探索者',  // 站点标语（用于首页标题）
    url: 'https://example.com',                  // 站点完整 URL（用于 OG 图片等绝对路径）
    ogImage: 'https://example.com/images/avatar.webp', // 默认 OG 图片
}
```

| 配置 | 说明 |
|------|------|
| `name` | 站点名称，用于页面标题后缀 |
| `tagline` | 站点标语，用于首页标题 |
| `url` | 站点完整 URL，用于生成 OG 图片等绝对路径 |
| `ogImage` | 默认 Open Graph 图片，所有页面共用 |

### 首页 SEO 配置

```javascript
seo: {
    title: 'YourName - 技术博主 / 开源爱好者 / AI 探索者',
    description: 'Hi，欢迎访问我的个人主页...',
    keywords: ['YourName', '技术博客', 'Astro', 'Docker'],
    og: {
        title: 'YourName - 个人主页',
        description: '开源爱好者 / Astro爱好者 / AI探索者',
        image: 'https://example.com/images/avatar.webp',
    },
}
```

### 独立页面 SEO 配置

每个独立页面可定义自己的 SEO 信息，标题自动生成为 `{{page.title}} | {{site.name}}`：

```javascript
pages: {
    moments: {
        title: '动态',
        tagline: '我的碎片化分享...',
        description: '个人动态，记录生活点滴',
        keywords: ['动态', '瞬间', '生活记录'],
    },
    guestbook: {
        title: '留言',
        tagline: '欢迎在这里留下你的足迹...',
        description: '留言板，欢迎留言交流',
        keywords: ['留言板', '评论', '交流'],
    },
}
```

| 配置 | 说明 |
|------|------|
| `title` | 页面标题（自动追加站点名称） |
| `tagline` | 页面标语（显示在页面标题下） |
| `description` | 页面描述（meta 标签） |
| `keywords` | 关键词数组 |

### 主题配色

支持模式切换和配色方案切换，用户切换只在当前会话生效，刷新后恢复默认配置。

#### 模式切换

| 模式 | 说明 |
|------|------|
| `light` | 浅色模式 |
| `dark` | 深色模式 |
| `auto` | 跟随系统 |

#### 内置配色方案

| 方案 ID | 名称 | 类型 | 说明 |
|---------|------|------|------|
| `coralOrange` | 珊瑚橙 | 亮色 | 系统默认 |
| `nordSnowStorm` | 冰川青 | 亮色 | Nord 霜雪青色调 |
| `gruvboxLight` | 复古风 | 亮色 | 复古暖色调 |
| `ayuLight` | 简约风 | 亮色 | 简约清爽 |
| `cyberGreen` | 赛博绿 | 暗色 | 系统默认 |
| `catppuccinMocha` | 摩卡色 | 暗色 | 柔和粉彩 |
| `kanagawaDragon` | 浮世绘 | 暗色 | 浮世绘风格 |
| `rosePineMoon` | 鸢尾紫 | 暗色 | 优雅鸢尾紫 |

#### 配置示例

```javascript
theme: {
    // 默认模式: 'light' | 'dark' | 'auto'
    default: 'light',

    // 默认配色方案（刷新后恢复此配置）
    defaultScheme: {
        light: 'gruvboxLight',  // 亮色: null(使用内置默认coralOrange) | coralOrange | nordSnowStorm | gruvboxLight | ayuLight
        dark: 'catppuccinMocha' // 暗色: null(使用内置默认cyberGreen) | cyberGreen | catppuccinMocha | kanagawaDragon | rosePineMoon
    }
}
```

| 配置 | 说明 |
|------|------|
| `default` | 首屏默认模式 |
| `defaultScheme` | 默认配色方案，用户切换后刷新恢复此配置，设为 `null` 使用内置默认配色 |

**衍生色**：悬停、阴影、玻璃光泽等颜色自动计算，无需手动配置。

### 导航栏配置

支持顶部固定导航栏，包含品牌区、导航链接、主题切换和移动端菜单：

```javascript
nav: {
    enabled: true,

    // 品牌区配置
    brand: {
        showPrompt: true,       // 显示 $ 符号
        hoverText: '~/whoami',  // 自动循环打字机效果文字
    },

    // 自定义二级菜单（可选）
    menus: [
        {
            name: 'Resources',
            items: [
                { name: '工具推荐', url: 'https://example.com/tools', external: true },
                { name: '友情链接', url: 'https://example.com/links', external: true },
            ]
        }
    ],
}
```

| 配置 | 说明 |
|------|------|
| `brand.showPrompt` | 是否显示 `$` 符号 |
| `brand.hoverText` | 自动循环打字机效果显示的文字（与名字交替显示） |
| `menus` | 自定义二级菜单数组 |

**主题设置**：点击配色按钮展开菜单，选择模式（auto/light/dark）和配色方案。

**移动端手势**：支持从屏幕右边缘向左滑动打开侧边栏，侧边栏内向右滑动关闭。

### 基础信息

```javascript
profile: {
    name: 'YourName',
    tagline: {
        prefix: '🐾',
        highlight: '欢迎来到我的主页！'
    },
    avatar: 'images/avatar.webp'
}
```

### Favicon 配置

```javascript
favicon: {
    path: '',    // 自定义 favicon 路径（如 'images/favicon.ico'），留空则从头像自动生成
}
```

| 配置 | 说明 |
|------|------|
| `path` | 自定义 favicon 文件路径，留空则从头像自动生成 |

**自动生成尺寸**：16×16、32×32（ICO 文件）、180×180（Apple Touch Icon）

### 终端内容

```javascript
identity: ['开源爱好者', '前端开发者', 'AI探索者'],
interests: ['前端开发', '容器技术', '自动化部署'],
gear: ['设备1', '设备2', '设备3'],  // 装备列表（可选）

terminal: {
    title: '🐾 user@host:~|',
    prompts: [
        { command: 'whoami', output: 'identity' },
        { command: 'cat interests.txt', output: 'interests' },
        { command: 'cat gear.txt', output: 'gear' },      // 装备列表
        { command: './wisdom.sh', output: 'dynamic' }
    ]
}
```

| 配置 | 说明 |
|------|------|
| `identity` | 身份标签数组 |
| `interests` | 兴趣领域数组 |
| `gear` | 装备列表数组，留空则不显示 `cat gear.txt` 命令 |

### 名人语录

```javascript
quotes: [
    "Empty your mind, be formless, shapeless, like water...",
    "Be water, my friend."
]
```

### 音乐播放器

简约风格的音乐播放器，位于头像与终端之间：

```javascript
music: {
    enabled: true,              // 是否启用（禁用时显示分割线）
    volume: 0.5,                // 默认音量 (0-1)
    autoplay: false,            // 是否自动播放（大多数浏览器会阻止）
    playMode: 'list',           // 播放模式: list=列表循环, one=单曲循环, random=随机
    mode: 'meting',             // 音乐来源: meting=在线API, local=本地文件

    // Meting API 模式
    meting: {
        server: 'netease',      // 平台: netease | tencent | kugou | xiami | baidu
        type: 'playlist',       // 类型: song | playlist | album | search | artist
        id: '10046455237',      // 歌单/单曲 ID
        apis: [                 // API 列表（按顺序尝试）
            'https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r',
        ],
    },

    // 本地音乐模式（音乐文件放 src/music/ 目录）
    local: ['music/song1.mp3', 'music/song2.mp3'],
}
```

| 配置 | 说明 |
|------|------|
| `enabled` | 是否启用，禁用时显示原分割线 |
| `autoplay` | 是否自动播放（浏览器可能阻止） |
| `mode` | `meting`=在线音乐，`local`=本地文件 |
| `meting.server` | 音乐平台：`netease`/`tencent`/`kugou` 等 |
| `meting.id` | 歌单 ID，从平台分享链接中获取 |
| `local` | 本地音乐路径数组，相对于 `src/` 目录 |

### 动画配置

控制页面动画效果：

```javascript
animation: {
    fadeInDelay: 1000,      // 页面淡入延迟 (ms)
    typingSpeed: 60,        // 打字速度 (ms/字符)
    quoteDisplayTime: 4000, // 语录显示时间 (ms)
    quoteDeleteSpeed: 42,   // 删除速度 (ms/字符)
}
```

### 博客文章 RSS

从自定义 RSS 源获取最新文章，构建时预获取：

```javascript
rss: {
    enabled: true,
    url: 'https://yourblog.com/rss.xml',
    count: 4,
    openInNewTab: true,
    title: {
        text: 'Recent Posts',
        icon: 'fa-solid fa-newspaper'
    },
    display: {
        showDate: true,
        showDescription: true,
        maxDescriptionLength: 100
    }
}
```

### GitHub 模块

项目展示和贡献图共用 GitHub 用户配置：

```javascript
projects: {
    enabled: true,
    title: {
        text: '我的项目',       // 模块标题
        icon: 'fa-solid fa-folder-open',
    },
    githubUser: 'https://github.com/yourusername',
    count: 5,
    exclude: ['.github'],
}

contribution: {
    enabled: true,
    useRealData: true,      // true=真实数据, false=随机数据
    githubUser: '',         // 留空则自动使用 projects.githubUser
}
```

| 配置 | 说明 |
|------|------|
| `projects.title` | 模块标题配置 |
| `projects.githubUser` | GitHub 用户主页地址 |
| `projects.count` | 显示项目数量（按 star 降序） |
| `projects.exclude` | 排除的仓库名（支持正则匹配） |
| `contribution.useRealData` | `true`=API 获取真实数据，`false`=随机数据 |

### Memos 动态

集成 Memos 实例，展示个人动态/碎碎念：

```javascript
moments: {
    enabled: true,
    memosUrl: 'https://your-memos-instance.com/',  // Memos 实例地址
    count: 10,                                      // 获取数量
    tags: ['标签1', '标签2'],                       // 标签过滤（可选，留空获取所有公开动态）
    showSkeleton: true,                             // 显示骨架屏
}
```

| 配置 | 说明 |
|------|------|
| `memosUrl` | Memos 实例地址，末尾带 `/` |
| `count` | 每次获取的动态数量 |
| `tags` | 标签过滤数组，留空获取所有公开动态 |
| `showSkeleton` | 是否显示骨架屏加载状态 |

**功能特性**：
- 时间线布局 + 玻璃卡片设计
- 图片灯箱（键盘导航、触摸滑动）
- 音视频播放器（自定义控件、全屏支持）
- 文档附件预览（PDF/Word/Excel）
- 完整 Markdown 渲染（代码高亮、表格、TODO）
- 无限滚动、标签筛选、置顶动态

### 留言板

终端风格留言板，支持弹幕交互：

```javascript
guestbook: {
    enabled: true,
    provider: 'waline',                            // 评论系统: waline | artalk
    server: 'https://your-waline.vercel.app',      // 服务器地址
    site: 'MoeHome',                               // 站点名称（仅 Artalk）
    placeholder: '欢迎留下你的信号...',              // 评论框占位文字
    limits: {
        comments: { newest: 30, hot: 30 },         // 评论列表限制
        barrage: { pinned: 5, hot: 10, latest: 5 } // 弹幕限制
    }
}
```

| 配置 | 说明 |
|------|------|
| `provider` | 评论系统：`waline` 或 `artalk` |
| `server` | 服务器地址，Waline/Artalk 部署后的访问地址 |
| `site` | 站点名称，仅 Artalk 需要 |
| `placeholder` | 评论框占位文字 |
| `limits.comments` | 评论列表数量限制 |
| `limits.barrage` | 弹幕显示数量限制 |

**弹幕机制**：从评论数据中筛选，支持置顶、热门（高赞）、最新三种类型。

### 链接模块配置

控制链接导航模块的整体开关和标题显示：

```javascript
linksConfig: {
    enabled: true,    // 改成 false 禁用整个链接导航模块
    title: {
        text: 'Quick Links',
        icon: 'fa-solid fa-link',
    },
},
```

### 社交链接

```javascript
links: [
    {
        name: 'Blog',
        description: '技术文章 & 教程',
        url: 'https://yourblog.com',
        icon: 'fa-solid fa-pen-nib',
        brand: 'blog',
        external: true,
        color: '#00ff9f',
        enabled: true
    },
    {
        name: 'Email',
        description: '联系 & 合作',
        url: 'mailto:admin@example.com',
        icon: 'fa-solid fa-envelope',
        brand: 'email',
        external: false,
        color: '#ea4335',
        antiCrawler: true,  // 邮箱反爬虫保护，对邮箱地址编码防止被抓取
        enabled: true
    }
]
```

| 配置 | 说明 |
|------|------|
| `name` | 按钮显示名称 |
| `url` | 链接地址 |
| `icon` | Font Awesome 图标类 |
| `color` | 按钮主题颜色 |
| `enabled` | 是否显示 |
| `antiCrawler` | 邮箱反爬虫保护（仅 mailto 链接有效），开启后邮箱地址会被编码 |

**邮箱反爬虫原理**：开启后，`mailto:admin@example.com` 会被转换为 `onclick="location.href='mailto:'+atob('...')"` 的形式，爬虫无法通过正则匹配或 HTML 解析获取邮箱，但用户点击仍可正常唤起邮件客户端。

### 赞赏支持

支持二维码扫码和外链跳转两种支付方式：

```javascript
donation: {
    enabled: true,
    title: {
        text: '赞助支持',
        icon: 'fa-solid fa-mug-hot',
    },
    message: '如果我的内容对你有帮助，欢迎请我喝杯咖啡~',
    methods: [
        { name: '微信支付', key: 'wechat', icon: 'fa-brands fa-weixin', qrImage: 'images/wechat.png', enabled: true },
        { name: '支付宝', key: 'alipay', icon: 'fa-brands fa-alipay', qrImage: 'images/alipay.png', enabled: true },
        { name: '爱发电', key: 'afdian', icon: 'fa-solid fa-heart', url: 'https://ifdian.net/a/yourname', enabled: true },
        { name: 'PayPal', key: 'paypal', icon: 'fa-brands fa-paypal', url: 'https://www.paypal.com/paypalme/yourname', enabled: false },
    ],
},
```

| 配置 | 说明 |
|------|------|
| `title` | 模块标题配置 |
| `message` | 提示文字 |
| `qrImage` | 二维码图片路径（扫码支付） |
| `url` | 外链支付地址（跳转支付） |

**图标颜色**：默认使用主题 `accent` 配色，悬停时背景变品牌色、图标变白色。

> **建议**：启用 2-3 个支付方式为宜，骨架屏加载时最多显示 3 个按钮占位。

### 页脚

```javascript
footer: {
    copyright: {
        year: '2018-2026',
        name: 'Your Name',
        url: 'https://yourblog.com/'
    },
    icp: {
        enabled: false,           // 是否显示备案号
        number: '京ICP备XXXXXXXX号'
    }
}
```

### 安全提示

页面顶部公告栏，可用于防诈骗声明等：

```javascript
notice: {
    enabled: true,
    type: 'warning',               // warning | info | success
    icon: 'fa-solid fa-shield-halved',
    text: '声明：本人不会主动邀请或联系任何人...',
}
```

| 配置 | 说明 |
|------|------|
| `type` | 提示类型：`warning`(黄)、`info`(蓝)、`success`(绿) |
| `icon` | Font Awesome 图标类 |
| `text` | 提示文字 |

### 统计代码

支持多种统计工具配置，构建时注入到 HTML `<head>` 中：

```javascript
analytics: {
    // Google Analytics - enabled 启用开关，id 填写 Measurement ID
    googleAnalytics: {
        enabled: true,
        id: 'G-XXXXXXXXXX'
    },
    // Microsoft Clarity - enabled 启用开关，id 填写 Project ID
    microsoftClarity: {
        enabled: true,
        id: 'xxxxxxxxxxxx'
    },
    // Umami - 完整脚本标签，留空则不启用
    // 支持自定义参数如 data-host, data-domains 等
    umami: '<script defer src="https://umami.example.com/script.js" data-website-id="xxx"></script>',
    // 自定义脚本 - 数组形式，留空则不启用
    customScripts: [
        '<script>console.log("custom analytics")</script>'
    ]
}
```

| 配置项 | 禁用方式 |
|--------|---------|
| Google Analytics | `enabled: false` |
| Microsoft Clarity | `enabled: false` |
| Umami | `umami: ''` 留空 |
| customScripts | `customScripts: []` 空数组 |

## 项目结构

```
MoeHome/
├── src/
│   ├── app.js              # 页面交互逻辑
│   ├── config.js           # 配置文件
│   ├── style.css           # 样式文件
│   ├── theme-utils.js      # 主题工具函数
│   ├── theme-data.js       # 主题配色数据（构建/运行时共享）
│   ├── moments.js          # Memos 动态模块
│   ├── guestbook.js        # 留言板模块
│   ├── music/              # 本地音乐文件（可选）
│   └── images/             # 图片资源
│       ├── avatar.webp     # 默认头像
│       ├── screenshot-dark.png   # 暗色主题预览
│       ├── screenshot-light.png  # 亮色主题预览
│       └── wechat.png      # 微信赞赏码
├── scripts/
│   ├── build.js            # 构建脚本
│   ├── contribution-fetcher.js  # GitHub 贡献数据获取
│   ├── github-fetcher.js   # GitHub 项目数据获取
│   ├── minify.js           # 压缩优化模块
│   └── rss-parser.js       # RSS 解析器
├── templates/
│   ├── index.template.html # 首页模板
│   ├── moments.template.html   # 动态页面模板
│   ├── guestbook.template.html # 留言板模板
│   ├── 404.template.html   # 404 页面模板
│   └── partials/           # 模板片段
│       ├── navbar.html     # 导航栏
│       └── footer.html     # 页脚
├── dist/                   # 构建输出（部署用）
├── package.json
└── README.md
```

## 部署

构建后上传 `dist/` 目录到任意静态托管服务：

```bash
npm run build
# 上传 dist/ 目录
```

支持的平台：

- GitHub Pages
- Vercel
- Netlify
- Cloudflare Pages
- 阿里云 OSS
- 腾讯云 COS
- 自己的 Nginx 服务器

## 技术栈

### 运行时

- HTML5 + CSS3 + Vanilla JavaScript
- Font Awesome 6 图标

### 字体策略

采用"西文优先 + 系统回退"策略，零外部中文字体加载，性能友好：

| 变量 | 用途 | 字体栈 |
|------|------|--------|
| `--font-sans` | 正文/界面 | Avenir Next → SF Pro Text → PingFang SC → Microsoft YaHei → 系统回退 |
| `--font-mono` | 终端/代码 | JetBrains Mono（Google Fonts）→ SF Mono → Cascadia Code → 系统回退 |
| `--font-display` | 大标题/名言 | Iowan Old Style → Palatino Linotype → Noto Serif SC → Georgia |

**设计亮点**：
- 西文优先（Avenir Next）确保英文渲染精致
- 完整 Emoji 回退链（Apple Color Emoji → Segoe UI Emoji → Noto Color Emoji）
- 仅加载 JetBrains Mono 等宽字体（约 30KB），中文使用系统字体避免大文件加载
- 国内 Google Fonts 镜像加速

### 开发依赖（仅构建时）

| 依赖 | 用途 |
|------|------|
| terser | JavaScript 压缩 |
| lightningcss | CSS 压缩 |
| html-minifier-terser | HTML 压缩 |
| sharp | 图片压缩（WebP/PNG/JPEG） |

### 环境变量配置

构建时支持环境变量控制压缩行为：

```bash
# 启用/禁用压缩（默认启用）
MINIFY=true npm run build

# 单独控制各类资源
MINIFY_JS=true MINIFY_CSS=true MINIFY_HTML=true npm run build

# 图片压缩质量 (1-100)
IMAGE_QUALITY=80 npm run build

# 禁用图片压缩
COMPRESS_IMAGES=false npm run build
```

## 赞赏/捐赠

如果这个项目对你有帮助，欢迎请我喝杯咖啡：

### 微信支付

<img src="./src/images/wechat.png" alt="微信支付" width="200">

## 开源协议

MIT License - 随意修改和使用

本项目使用了以下开源项目：

- [Memos](https://github.com/usememos/memos) - MIT License
- [Waline](https://github.com/walinejs/waline) - MIT License
- [Artalk](https://github.com/ArtalkJS/Artalk) - MIT License

---

如果喜欢这个项目，欢迎 Star ⭐️
