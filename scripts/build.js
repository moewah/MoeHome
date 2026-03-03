/**
 * MoeWah Homepage - Build Script
 * 构建脚本：读取 config.js 生成完全静态化的 HTML
 */

const fs = require('fs');
const path = require('path');
const { getRSSArticles } = require('./rss-parser');
const { fetchUserRepos, parseGitHubUser, formatNumber } = require('./github-fetcher');
const { fetchUserContributions } = require('./contribution-fetcher');

// 定义路径
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// 清理 dist 目录
function cleanDist() {
    if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
        console.log('🧹 已清理 dist 目录');
    }
    fs.mkdirSync(distDir, { recursive: true });
}

// 读取配置文件
const configContent = fs.readFileSync(path.join(rootDir, 'src/config.js'), 'utf8');

// 提取字符串值
function extractString(pattern, fallback = '') {
    const match = configContent.match(pattern);
    if (match && match[1]) {
        return match[1].trim();
    }
    return fallback;
}

// 提取数组
function extractArray(pattern, fallback = []) {
    const match = configContent.match(pattern);
    if (match && match[1]) {
        try {
            const arrayContent = match[1];
            const items = arrayContent.match(/['"`]([^'"`]+)['"`]/g);
            if (items) {
                return items.map(item => item.replace(/['"`]/g, '').trim());
            }
        } catch (e) {
            return fallback;
        }
    }
    return fallback;
}

// 提取嵌套字符串
function extractNestedString(parentPattern, key, fallback = '') {
    const parentMatch = configContent.match(parentPattern);
    if (parentMatch && parentMatch[1]) {
        const keyPattern = new RegExp(key + ':\\s*[\'"`]([^\'"`]+)[\'"`]');
        const keyMatch = parentMatch[1].match(keyPattern);
        if (keyMatch && keyMatch[1]) {
            return keyMatch[1].trim();
        }
    }
    return fallback;
}

// 提取链接数组
function extractLinks() {
    const linksMatch = configContent.match(/links:\s*\[([\s\S]*?)\n\s*\]/);
    if (!linksMatch) return [];

    const linksContent = linksMatch[1];
    const links = [];

    // 匹配每个链接对象
    const linkPattern = /\{[\s\S]*?name:\s*['"`]([^'"`]+)['"`][\s\S]*?description:\s*['"`]([^'"`]+)['"`][\s\S]*?url:\s*['"`]([^'"`]+)['"`][\s\S]*?icon:\s*['"`]([^'"`]+)['"`][\s\S]*?brand:\s*['"`]([^'"`]+)['"`][\s\S]*?external:\s*(true|false)([\s\S]*?)\}/g;

    let match;
    while ((match = linkPattern.exec(linksContent)) !== null) {
        // 提取 color 字段
        let color = '#00ff9f'; // 默认颜色
        const colorMatch = match[7].match(/color:\s*['"`]([^'"`]+)['"`]/);
        if (colorMatch) {
            color = colorMatch[1].trim();
        }

        // 提取 enabled 字段
        let enabled = true;
        const enabledMatch = match[7].match(/enabled:\s*(true|false)/);
        if (enabledMatch) {
            enabled = enabledMatch[1] === 'true';
        }

        links.push({
            name: match[1].trim(),
            description: match[2].trim(),
            url: match[3].trim(),
            icon: match[4].trim(),
            brand: match[5].trim(),
            external: match[6] === 'true',
            color: color,
            enabled: enabled
        });
    }

    return links;
}

// 提取 LinksConfig 配置
function extractLinksConfig() {
    const configMatch = configContent.match(/linksConfig:\s*\{([\s\S]*?)\n\s*\},?\s*\n\s*\/\/ =/);
    if (!configMatch) {
        return {
            enabled: true,
            titleText: '链接导航',
            titleIcon: 'fa-solid fa-link',
        };
    }

    const configStr = configMatch[1];

    const enabledMatch = configStr.match(/enabled:\s*(true|false)/);
    const titleTextMatch = configStr.match(/text:\s*['"`]([^'"`]+)['"`]/);
    const titleIconMatch = configStr.match(/icon:\s*['"`]([^'"`]+)['"`]/);

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : true,
        titleText: titleTextMatch ? titleTextMatch[1].trim() : '链接导航',
        titleIcon: titleIconMatch ? titleIconMatch[1].trim() : 'fa-solid fa-link',
    };
}

// 提取 analytics 子配置值
function extractAnalyticsValue(key, subKey) {
    const pattern = new RegExp(key + ':\\s*\\{([^}]+)\\}', 's');
    const match = configContent.match(pattern);
    if (match && match[1]) {
        const subPattern = new RegExp(subKey + ':\\s*[\'"`]([^\'"`]+)[\'"`]');
        const subMatch = match[1].match(subPattern);
        if (subMatch && subMatch[1]) {
            return subMatch[1].trim();
        }
        const boolPattern = new RegExp(subKey + ':\\s*(true|false)');
        const boolMatch = match[1].match(boolPattern);
        if (boolMatch) {
            return boolMatch[1].trim();
        }
    }
    return '';
}

// 提取 Umami 脚本标签
function extractUmamiScript() {
    // 匹配单引号包裹的内容（允许内部有双引号）
    const singleQuoteMatch = configContent.match(/umami:\s*'([^']+)'/);
    if (singleQuoteMatch && singleQuoteMatch[1]) {
        return singleQuoteMatch[1].trim();
    }
    // 匹配反引号包裹的内容
    const backtickMatch = configContent.match(/umami:\s*`([^`]+)`/);
    if (backtickMatch && backtickMatch[1]) {
        return backtickMatch[1].trim();
    }
    // 匹配双引号包裹的内容
    const doubleQuoteMatch = configContent.match(/umami:\s*"([^"]+)"/);
    if (doubleQuoteMatch && doubleQuoteMatch[1]) {
        return doubleQuoteMatch[1].trim();
    }
    return '';
}

// 提取自定义脚本数组
function extractCustomScripts() {
    const match = configContent.match(/customScripts:\s*\[([\s\S]*?)\n\s*\]/);
    if (!match) return [];

    const scriptsContent = match[1];
    const scriptPattern = /['"`](<script[\s\S]*?<\/script>)['"`]/g;
    const scripts = [];

    let scriptMatch;
    while ((scriptMatch = scriptPattern.exec(scriptsContent)) !== null) {
        scripts.push(scriptMatch[1].trim());
    }

    return scripts;
}

// 提取 RSS 配置
function extractRSSConfig() {
    const rssMatch = configContent.match(/rss:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*\/\/ =/);
    if (!rssMatch) {
        return {
            enabled: false,
            url: '',
            count: 6,
            openInNewTab: true,
            titleText: '近期更新',
            titleIcon: 'fa-solid fa-newspaper',
            showDate: true,
            showDescription: true,
            maxDescriptionLength: 100,
        };
    }

    const rssContent = rssMatch[1];

    const enabledMatch = rssContent.match(/enabled:\s*(true|false)/);
    const urlMatch = rssContent.match(/url:\s*['"`]([^'"`]+)['"`]/);
    const countMatch = rssContent.match(/count:\s*(\d+)/);
    const openInNewTabMatch = rssContent.match(/openInNewTab:\s*(true|false)/);

    // 提取 title 配置
    const titleMatch = rssContent.match(/title:\s*\{([^}]+)\}/);
    let titleText = '最新文章';
    let titleIcon = 'fa-solid fa-rss';
    if (titleMatch) {
        const titleContent = titleMatch[1];
        const textMatch = titleContent.match(/text:\s*['"`]([^'"`]+)['"`]/);
        const iconMatch = titleContent.match(/icon:\s*['"`]([^'"`]+)['"`]/);
        if (textMatch) titleText = textMatch[1].trim();
        if (iconMatch) titleIcon = iconMatch[1].trim();
    }

    // 提取 display 配置
    const displayMatch = rssContent.match(/display:\s*\{([^}]+)\}/);
    let showDate = true;
    let showDescription = true;
    let maxDescriptionLength = 80;
    if (displayMatch) {
        const displayContent = displayMatch[1];
        const showDateMatch = displayContent.match(/showDate:\s*(true|false)/);
        const showDescMatch = displayContent.match(/showDescription:\s*(true|false)/);
        const maxLenMatch = displayContent.match(/maxDescriptionLength:\s*(\d+)/);
        if (showDateMatch) showDate = showDateMatch[1] === 'true';
        if (showDescMatch) showDescription = showDescMatch[1] === 'true';
        if (maxLenMatch) maxDescriptionLength = parseInt(maxLenMatch[1], 10);
    }

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : false,
        url: urlMatch ? urlMatch[1].trim() : '',
        count: countMatch ? parseInt(countMatch[1], 10) : 5,
        openInNewTab: openInNewTabMatch ? openInNewTabMatch[1] === 'true' : true,
        titleText: titleText,
        titleIcon: titleIcon,
        showDate: showDate,
        showDescription: showDescription,
        maxDescriptionLength: maxDescriptionLength,
    };
}

// 生成统计脚本 HTML
function generateAnalyticsHTML(config) {
    let scripts = '';
    
    // Google Analytics
    if (config.gaEnabled && config.gaId) {
        scripts += `
        <!-- Google Analytics -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=${config.gaId}"></script>
        <script>
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${config.gaId}');
        </script>`;
    }
    
    // Microsoft Clarity
    if (config.clarityEnabled && config.clarityId) {
        scripts += `
        <!-- Microsoft Clarity -->
        <script>
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${config.clarityId}");
        </script>`;
    }
    
    // Umami
    if (config.umami) {
        scripts += `
        <!-- Umami Analytics -->
        ${config.umami}`;
    }
    
    // Custom Scripts
    if (config.customScripts && config.customScripts.length > 0) {
        scripts += `
        <!-- Custom Analytics Scripts -->
        ${config.customScripts.join('\n        ')}`;
    }
    
    return scripts;
}

// 生成链接 HTML
function generateLinksHTML(links) {
    // 过滤掉未启用的链接
    const enabledLinks = links.filter(link => link.enabled !== false);

    return enabledLinks.map(link => {
        const externalAttrs = link.external
            ? 'target="_blank" rel="noopener"'
            : '';

        return `                    <a href="${link.url}" class="link" data-brand="${link.brand}" style="--brand-color: ${link.color}" ${externalAttrs}>
                        <div class="link-left">
                            <div class="link-icon-wrapper">
                                <i class="${link.icon}"></i>
                            </div>
                            <div class="link-content">
                                <span class="link-text">${link.name}</span>
                                <span class="link-description">${link.description}</span>
                            </div>
                        </div>
                        <span class="link-indicator"></span>
                    </a>`;
    }).join('\n');
}

// 生成链接模块（含顶部分割线和标题）
function generateLinksSectionHTML(links, linksConfig) {
    // 模块开关检查
    if (!linksConfig.enabled) {
        return '';
    }

    // 过滤掉未启用的链接
    const enabledLinks = links.filter(link => link.enabled !== false);

    // 如果没有启用的链接，返回空字符串（分割线也不显示）
    if (enabledLinks.length === 0) {
        return '';
    }

    const linksHTML = enabledLinks.map(link => {
        const externalAttrs = link.external
            ? 'target="_blank" rel="noopener"'
            : '';

        return `                    <a href="${link.url}" class="link" data-brand="${link.brand}" style="--brand-color: ${link.color}" ${externalAttrs}>
                        <div class="link-left">
                            <div class="link-icon-wrapper">
                                <i class="${link.icon}"></i>
                            </div>
                            <div class="link-content">
                                <span class="link-text">${link.name}</span>
                                <span class="link-description">${link.description}</span>
                            </div>
                        </div>
                        <span class="link-indicator"></span>
                    </a>`;
    }).join('\n');

    return `<div class="divider divider-compact lazy-load" data-delay="4"></div>

                <!-- Links Section -->
                <div class="links-section lazy-load" id="links-container" data-delay="4">
                    <div class="links-header">
                        <i class="${escapeHTML(linksConfig.titleIcon)}"></i>
                        <span class="links-title">${escapeHTML(linksConfig.titleText)}</span>
                    </div>
                    <div class="links">
${linksHTML}
                    </div>
                </div>`;
}

// 生成骨架屏链接占位 HTML
function generateSkeletonLinksHTML(links) {
    const enabledLinks = links.filter(link => link.enabled !== false);
    const count = enabledLinks.length;

    return Array(count).fill(`<div class="skeleton-link skeleton"></div>`).join('\n                    ');
}

// 生成骨架屏链接模块（含顶部分割线和标题）
function generateSkeletonLinksSectionHTML(links, linksConfig) {
    // 模块开关检查
    if (!linksConfig.enabled) {
        return '';
    }

    const enabledLinks = links.filter(link => link.enabled !== false);

    // 如果没有启用的链接，返回空字符串
    if (enabledLinks.length === 0) {
        return '';
    }

    const skeletonLinks = Array(enabledLinks.length).fill(`<div class="skeleton-link skeleton"></div>`).join('\n                    ');

    return `                <div class="skeleton-divider skeleton"></div>
                <div class="skeleton-links-section">
                    <div class="skeleton-links-header skeleton"></div>
                    <div class="skeleton-links">
                    ${skeletonLinks}
                    </div>
                </div>`;
}

// 生成 Notice HTML
function generateNoticeHTML(notice) {
    if (!notice.enabled) {
        return '';
    }

    return `                <!-- Notice -->
                <div class="notice notice-${notice.type}">
                    <div class="notice-icon">
                        <i class="${notice.icon}"></i>
                    </div>
                    <div class="notice-content">
                        ${notice.text}
                    </div>
                </div>`;
}

// 生成骨架屏 Notice 占位 HTML
function generateSkeletonNoticeHTML(notice) {
    if (!notice.enabled) {
        return '';
    }

    return '<div class="skeleton-notice skeleton"></div>';
}

// 生成 RSS 文章列表 HTML（支持3D翻转Masonry布局）
function generateRSSHTML(articles, rssConfig) {
    if (!rssConfig.enabled) {
        return '';
    }

    // RSS 模块前面带分割线
    let result = '<div class="divider divider-compact lazy-load" data-delay="4"></div>\n';

    // 文章数量显示
    const countText = articles.length + ' posts';

    // 空文章列表时显示友好提示
    if (articles.length === 0) {
        result += '<div class="rss-section lazy-load" id="rss-section" data-delay="4">\n' +
            '                    <div class="rss-header">\n' +
            '                        <i class="' + rssConfig.titleIcon + '"></i>\n' +
            '                        <span class="rss-title">' + rssConfig.titleText + '</span>\n' +
            '                        <span class="rss-count">' + countText + '</span>\n' +
            '                    </div>\n' +
            '                    <div class="rss-articles rss-empty">\n' +
            '                        <span class="rss-empty-text">暂无最新文章</span>\n' +
            '                    </div>\n' +
            '                </div>';
        return result;
    }

    const targetAttr = rssConfig.openInNewTab ? ' target="_blank" rel="noopener"' : '';

    // 生成单张卡片HTML
    function generateCardHTML(article, index, isBack) {
        // 截断描述并进行 HTML 转义
        let desc = escapeHTML(article.description || '');
        if (desc.length > rssConfig.maxDescriptionLength) {
            desc = desc.substring(0, rssConfig.maxDescriptionLength) + '...';
        }

        // 生成日期
        const dateHTML = rssConfig.showDate && article.pubDate
            ? '<span class="rss-article-date">' + escapeHTML(article.pubDate) + '</span>'
            : '';

        // 生成描述
        const descHTML = rssConfig.showDescription && desc
            ? '<p class="rss-article-desc">' + desc + '</p>'
            : '';

        // 对链接进行安全校验和转义
        const safeLink = escapeHTML(article.link);

        // 背面卡片额外类名
        const backClass = isBack ? ' rss-article-back' : '';

        return '<a href="' + safeLink + '" class="rss-article' + backClass + '"' + targetAttr + '>\n' +
            '                            <div class="rss-article-content">\n' +
            '                                <span class="rss-article-title">' + escapeHTML(article.title) + '</span>\n' +
            '                                ' + descHTML + '\n' +
            '                            </div>\n' +
            '                            <div class="rss-article-meta">\n' +
            '                                ' + dateHTML + '\n' +
            '                                <i class="fa-solid fa-arrow-right rss-article-arrow"></i>\n' +
            '                            </div>\n' +
            '                        </a>';
    }

    // 生成卡片容器（包含正面和背面）
    function generateCardContainer(article, index, backArticle) {
        const frontCard = generateCardHTML(article, index, false);
        const backCard = backArticle ? generateCardHTML(backArticle, index, true) : '';

        return '<div class="rss-card-container" data-card-index="' + index + '">\n' +
            '                        ' + frontCard + '\n' +
            '                        ' + backCard + '\n' +
            '                    </div>';
    }

    // 将文章分组：主卡片组（前3篇）和额外卡片组（第4篇及以后）
    const primaryArticles = articles.slice(0, 3);
    const extraArticles = articles.slice(3);

    // 生成卡片容器HTML
    const cardContainersHTML = [];

    // 主卡片区域：前3篇文章，支持翻转
    for (let i = 0; i < 3; i++) {
        const frontArticle = primaryArticles[i];
        // 背面文章：从额外文章中取，如果没有则不显示背面
        const backArticle = extraArticles[i] || null;

        if (frontArticle) {
            cardContainersHTML.push(generateCardContainer(frontArticle, i, backArticle));
        }
    }

    // 额外卡片区域：第4篇及以后的文章（如果还有剩余）
    // 这些文章每两篇一组，正面背面
    const remainingArticles = extraArticles.slice(3);
    for (let i = 0; i < remainingArticles.length; i += 2) {
        const frontArticle = remainingArticles[i];
        const backArticle = remainingArticles[i + 1] || null;

        if (frontArticle) {
            cardContainersHTML.push(generateCardContainer(frontArticle, 4 + Math.floor(i / 2), backArticle));
        }
    }

    // 如果有多余卡片，添加has-extra-cards类
    const extraClass = extraArticles.length > 0 ? ' has-extra-cards' : '';

    return '<div class="divider divider-compact lazy-load" data-delay="4"></div>\n' +
        '<div class="rss-section lazy-load" id="rss-section" data-delay="4">\n' +
        '                    <div class="rss-header">\n' +
        '                        <i class="' + escapeHTML(rssConfig.titleIcon) + '"></i>\n' +
        '                        <span class="rss-title">' + escapeHTML(rssConfig.titleText) + '</span>\n' +
        '                        <span class="rss-count">' + countText + '</span>\n' +
        '                    </div>\n' +
        '                    <div class="rss-articles' + extraClass + '">\n' +
        cardContainersHTML.join('\n') + '\n' +
        '                    </div>\n' +
        '                </div>';
}

// 生成骨架屏 RSS 占位 HTML（适配Masonry布局）
function generateSkeletonRSSHTML(rssConfig) {
    if (!rssConfig.enabled) {
        return '';
    }

    // 骨架屏显示3个占位，模拟Masonry布局的前3张卡片
    // 第1张是主卡片（占据两行），第2、3张是次要卡片
    const skeletonArticles = [];
    skeletonArticles.push('                    <div class="skeleton-rss-article skeleton-rss-main skeleton"></div>');
    skeletonArticles.push('                    <div class="skeleton-rss-article skeleton"></div>');
    skeletonArticles.push('                    <div class="skeleton-rss-article skeleton"></div>');

    return '<div class="skeleton-divider skeleton"></div>\n' +
        '                <!-- RSS Articles Skeleton -->\n' +
        '                <div class="skeleton-rss-section">\n' +
        '                    <div class="skeleton-rss-header">\n' +
        '                        <div class="skeleton-rss-icon skeleton"></div>\n' +
        '                        <div class="skeleton-rss-title skeleton"></div>\n' +
        '                        <div class="skeleton-rss-count skeleton"></div>\n' +
        '                    </div>\n' +
        '                    <div class="skeleton-rss-articles">\n' +
                skeletonArticles.join('\n') + '\n' +
        '                    </div>\n' +
        '                </div>';
}

// 提取 Projects 配置
function extractProjectsConfig() {
    const projectsMatch = configContent.match(/projects:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*\/\/ =/);
    if (!projectsMatch) {
        return {
            enabled: false,
            titleText: '我的项目',
            titleIcon: 'fa-solid fa-folder-open',
            githubUser: '',
            count: 4,
            exclude: [],
        };
    }

    const projectsContent = projectsMatch[1];

    const enabledMatch = projectsContent.match(/enabled:\s*(true|false)/);

    // 提取 title 配置
    const titleMatch = projectsContent.match(/title:\s*\{([^}]+)\}/);
    let titleText = '我的项目';
    let titleIcon = 'fa-solid fa-folder-open';
    if (titleMatch) {
        const titleContent = titleMatch[1];
        const textMatch = titleContent.match(/text:\s*['"`]([^'"`]+)['"`]/);
        const iconMatch = titleContent.match(/icon:\s*['"`]([^'"`]+)['"`]/);
        if (textMatch) titleText = textMatch[1].trim();
        if (iconMatch) titleIcon = iconMatch[1].trim();
    }

    // 提取 GitHub 用户地址
    const githubUserMatch = projectsContent.match(/githubUser:\s*['"`]([^'"`]+)['"`]/);
    const githubUser = githubUserMatch ? githubUserMatch[1].trim() : '';

    // 提取数量限制
    const countMatch = projectsContent.match(/count:\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 4;

    // 提取排除列表
    const excludeMatch = projectsContent.match(/exclude:\s*\[([\s\S]*?)\]/);
    let exclude = [];
    if (excludeMatch) {
        const excludeContent = excludeMatch[1];
        const itemMatches = excludeContent.match(/['"`]([^'"`]+)['"`]/g);
        if (itemMatches) {
            exclude = itemMatches.map(m => m.replace(/['"`]/g, '').trim());
        }
    }

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : false,
        titleText: titleText,
        titleIcon: titleIcon,
        githubUser: githubUser,
        count: count,
        exclude: exclude,
    };
}

// 提取 Contribution 配置
function extractContributionConfig() {
    const contribMatch = configContent.match(/contribution:\s*\{([\s\S]*?)\n\s*\}/);
    if (!contribMatch) {
        return {
            enabled: true,
            useRealData: true,
            githubUser: '',
        };
    }

    const contribContent = contribMatch[1];

    const enabledMatch = contribContent.match(/enabled:\s*(true|false)/);
    const useRealDataMatch = contribContent.match(/useRealData:\s*(true|false)/);
    const githubUserMatch = contribContent.match(/githubUser:\s*['"`]([^'"`]+)['"`]/);

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : true,
        useRealData: useRealDataMatch ? useRealDataMatch[1] === 'true' : true,
        githubUser: githubUserMatch ? githubUserMatch[1].trim() : '',
    };
}

// 提取 Nav 配置
function extractNavConfig() {
    // 使用更精确的模式匹配 nav 配置块
    const navMatch = configContent.match(/nav:\s*\{([\s\S]*?)(?=\n\s*\},?\s*\n\s*\/\/ =|\n\s*\},?\s*$)/);
    if (!navMatch) {
        return {
            enabled: true,
            brand: { showPrompt: true, hoverText: '~/whoami' },
            menus: []
        };
    }

    const navContent = navMatch[1];

    const enabledMatch = navContent.match(/enabled:\s*(true|false)/);

    // 提取 brand 配置
    const brandMatch = navContent.match(/brand:\s*\{([^}]+)\}/);
    let brand = { showPrompt: true, hoverText: '~/whoami' };
    if (brandMatch) {
        const brandContent = brandMatch[1];
        const showPromptMatch = brandContent.match(/showPrompt:\s*(true|false)/);
        const hoverTextMatch = brandContent.match(/hoverText:\s*['"`]([^'"`]+)['"`]/);
        brand = {
            showPrompt: showPromptMatch ? showPromptMatch[1] === 'true' : true,
            hoverText: hoverTextMatch ? hoverTextMatch[1].trim() : '~/whoami'
        };
    }

    // 提取 menus 配置
    let menus = [];
    const menusStartMatch = navContent.match(/menus:\s*\[/);
    if (menusStartMatch) {
        const startIndex = menusStartMatch.index + menusStartMatch[0].length;
        let depth = 1;
        let endIndex = startIndex;

        for (let i = startIndex; i < navContent.length && depth > 0; i++) {
            const char = navContent[i];
            if (char === '[' || char === '{') depth++;
            else if (char === ']' || char === '}') depth--;
            if (depth === 0) {
                endIndex = i;
                break;
            }
        }

        const menusContent = navContent.substring(startIndex, endIndex);

        // 使用更精确的方式解析每个菜单对象
        // 找到所有顶层菜单对象的开始位置
        let menuDepth = 0;
        let currentMenuStart = -1;
        const menuBlocks = [];

        for (let i = 0; i < menusContent.length; i++) {
            const char = menusContent[i];
            if (char === '{') {
                if (menuDepth === 0) {
                    currentMenuStart = i;
                }
                menuDepth++;
            } else if (char === '}') {
                menuDepth--;
                if (menuDepth === 0 && currentMenuStart >= 0) {
                    menuBlocks.push(menusContent.substring(currentMenuStart, i + 1));
                    currentMenuStart = -1;
                }
            }
        }

        // 解析每个菜单块
        for (const menuBlock of menuBlocks) {
            const nameMatch = menuBlock.match(/name:\s*['"`]([^'"`]+)['"`]/);
            const iconMatch = menuBlock.match(/icon:\s*['"`]([^'"`]+)['"`]/);

            // 解析 items 数组
            let menuItems = [];
            const itemsStartMatch = menuBlock.match(/items:\s*\[/);
            if (itemsStartMatch) {
                const itemsStartIndex = itemsStartMatch.index + itemsStartMatch[0].length;
                let itemsDepth = 1;
                let itemsEndIndex = itemsStartIndex;

                for (let j = itemsStartIndex; j < menuBlock.length && itemsDepth > 0; j++) {
                    const char = menuBlock[j];
                    if (char === '[' || char === '{') itemsDepth++;
                    else if (char === ']' || char === '}') itemsDepth--;
                    if (itemsDepth === 0) {
                        itemsEndIndex = j;
                        break;
                    }
                }

                const itemsContent = menuBlock.substring(itemsStartIndex, itemsEndIndex);

                // 解析每个 item 对象
                let itemDepth = 0;
                let currentItemStart = -1;

                for (let k = 0; k < itemsContent.length; k++) {
                    const char = itemsContent[k];
                    if (char === '{') {
                        if (itemDepth === 0) {
                            currentItemStart = k;
                        }
                        itemDepth++;
                    } else if (char === '}') {
                        itemDepth--;
                        if (itemDepth === 0 && currentItemStart >= 0) {
                            const itemBlock = itemsContent.substring(currentItemStart, k + 1);

                            const iNameMatch = itemBlock.match(/name:\s*['"`]([^'"`]+)['"`]/);
                            const iUrlMatch = itemBlock.match(/url:\s*['"`]([^'"`]+)['"`]/);
                            const iExternalMatch = itemBlock.match(/external:\s*(true|false)/);

                            if (iNameMatch && iUrlMatch) {
                                menuItems.push({
                                    name: iNameMatch[1].trim(),
                                    url: iUrlMatch[1].trim(),
                                    external: iExternalMatch ? iExternalMatch[1] === 'true' : true
                                });
                            }

                            currentItemStart = -1;
                        }
                    }
                }
            }

            if (nameMatch) {
                menus.push({
                    name: nameMatch[1].trim(),
                    icon: iconMatch ? iconMatch[1].trim() : '',
                    items: menuItems
                });
            }
        }
    }

    return {
        enabled: enabledMatch ? enabledMatch[1] === 'true' : true,
        brand: brand,
        menus: menus
    };
}

// 生成导航链接 HTML（桌面端）
function generateNavLinksHTML(rssConfig, projectsConfig) {
    let html = '';

    // Posts 链接
    if (rssConfig.enabled) {
        html += '\n                    <a href="#rss-section" class="nav-link" data-section="rss-section">Posts</a>';
    }

    // Projects 链接
    if (projectsConfig.enabled) {
        html += '\n                    <a href="#projects-section" class="nav-link" data-section="projects-section">Projects</a>';
    }

    return html;
}

// 生成导航链接 HTML（移动端）
function generateNavLinksMobileHTML(rssConfig, projectsConfig) {
    let html = '';

    // Posts 链接
    if (rssConfig.enabled) {
        html += '\n                <a href="#rss-section" class="nav-sidebar-link" data-section="rss-section">Posts</a>';
    }

    // Projects 链接
    if (projectsConfig.enabled) {
        html += '\n                <a href="#projects-section" class="nav-sidebar-link" data-section="projects-section">Projects</a>';
    }

    return html;
}

// 生成自定义菜单 HTML（桌面端）
function generateCustomMenusHTML(menus) {
    if (!menus || menus.length === 0) return '';

    return menus.map(menu => {
        const itemsHTML = menu.items.map(item => {
            const externalAttrs = item.external ? 'target="_blank" rel="noopener"' : '';
            return `                    <a href="${escapeHTML(item.url)}" ${externalAttrs}>${escapeHTML(item.name)}</a>`;
        }).join('\n                    ');

        return `
                <div class="nav-dropdown">
                    <button class="nav-dropdown-toggle">
                        <span>${escapeHTML(menu.name)}</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                    <div class="nav-dropdown-menu">
                        ${itemsHTML}
                    </div>
                </div>`;
    }).join('');
}

// 生成自定义菜单 HTML（移动端）
function generateCustomMenusMobileHTML(menus) {
    if (!menus || menus.length === 0) return '';

    return menus.map(menu => {
        const itemsHTML = menu.items.map(item => {
            const externalAttrs = item.external ? 'target="_blank" rel="noopener"' : '';
            return `                <a href="${escapeHTML(item.url)}" ${externalAttrs}>${escapeHTML(item.name)}</a>`;
        }).join('\n                ');

        return `
            <div class="nav-sidebar-dropdown">
                <button class="nav-sidebar-dropdown-toggle">
                    <span>${escapeHTML(menu.name)}</span>
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
                <div class="nav-sidebar-dropdown-items">
                    ${itemsHTML}
                </div>
            </div>`;
    }).join('');
}

// 生成项目展示 HTML（仪表盘式布局）
function generateProjectsHTML(repos, projectsConfig, contributionData, contributionConfig) {
    if (!projectsConfig.enabled) {
        return '';
    }
    
    // 即使没有仓库数据，也要显示项目区域但带错误提示
    if (repos.length === 0) {
        return `                <div class="divider divider-compact lazy-load" data-delay="4"></div>

                <!-- Projects Section - Dashboard Style -->
                <div class="projects-section lazy-load error-state" id="projects-section" data-delay="4">
                    <div class="projects-header">
                        <i class="${escapeHTML(projectsConfig.titleIcon)}"></i>
                        <span class="projects-title">${escapeHTML(projectsConfig.titleText)}</span>
                        <span class="projects-badge">0 repos</span>
                    </div>
                    <div class="error-message">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <p>无法加载 GitHub 项目数据。请检查配置或稍后重试。</p>
                    </div>
                </div>`;
    }

    // 生成贡献图格子
    let contributionCells = '';
    
    if (contributionConfig && contributionConfig.enabled) {
        const levels = contributionData?.levels || [];
        for (let i = 0; i < 78; i++) {
            const level = levels[i] ?? 0;
            contributionCells += `<div class="contribution-cell" data-level="${level}"></div>`;
        }
    } else {
        // 禁用时显示空格子
        for (let i = 0; i < 78; i++) {
            contributionCells += `<div class="contribution-cell" data-level="0"></div>`;
        }
    }

    // 第一个项目：大卡片（保留编辑器标签页风格）
    const mainRepo = repos[0];
    const mainStarsText = mainRepo.stars >= 1000 ? formatNumber(mainRepo.stars) : mainRepo.stars.toString();
    const mainForksText = mainRepo.forks >= 1000 ? formatNumber(mainRepo.forks) : mainRepo.forks.toString();

    // 计算进度条宽度（基于star数的相对比例，最小为10%）
    const maxStars = Math.max(...repos.map(r => r.stars), 1); // 确保最小值为1避免除零
    const progressWidth = Math.max(Math.min((mainRepo.stars / maxStars) * 100, 100), 10);

    const mainCardHTML = `                    <a href="${escapeHTML(mainRepo.url)}" class="project-card project-card-main" target="_blank" rel="noopener">
                        <div class="project-tab">
                            <i class="fa-solid fa-file-code"></i>
                            <span class="project-name">${escapeHTML(mainRepo.name)}</span>
                            <div class="project-stats">
                                <span class="project-stat"><i class="fa-solid fa-star"></i> ${mainStarsText}</span>
                                <span class="project-stat"><i class="fa-solid fa-code-fork"></i> ${mainForksText}</span>
                            </div>
                        </div>
                        <div class="project-body">
                            <p class="project-description">${escapeHTML(mainRepo.description)}</p>
                            <div class="project-progress">
                                <div class="project-progress-bar" style="width: ${progressWidth}%"></div>
                            </div>
                        </div>
                        <div class="project-footer">
                            <span class="project-language">
                                <span class="language-dot" style="background-color: ${mainRepo.languageColor}"></span>
                                ${escapeHTML(mainRepo.language || 'Unknown')}
                            </span>
                            <i class="fa-solid fa-arrow-up-right-from-square project-arrow"></i>
                        </div>
                    </a>`;

    // 迷你卡片轮播容器
    const miniCardsCount = repos.slice(1).length;
    const hasCarousel = miniCardsCount > 0;

    // 生成迷你卡片
    const miniCardsHTML = repos.slice(1).map((repo, index) => {
        const starsText = repo.stars >= 1000 ? formatNumber(repo.stars) : repo.stars.toString();
        return `                        <a href="${escapeHTML(repo.url)}" class="project-card project-card-mini" target="_blank" rel="noopener" data-index="${index}">
                            <div class="project-mini-header">
                                <i class="fa-solid fa-file-code"></i>
                                <span class="project-mini-stars"><i class="fa-solid fa-star"></i> ${starsText}</span>
                            </div>
                            <div class="project-mini-body">
                                <span class="project-mini-name">${escapeHTML(repo.name)}</span>
                            </div>
                            <div class="project-mini-footer">
                                <span class="project-language project-language-mini">
                                    <span class="language-dot language-dot-mini" style="background-color: ${repo.languageColor}"></span>
                                    ${escapeHTML(repo.language || 'Unknown')}
                                </span>
                            </div>
                        </a>`;
    }).join('\n');

    return `                <div class="divider divider-compact lazy-load" data-delay="4"></div>

                <!-- Projects Section - Dashboard Style -->
                <div class="projects-section lazy-load" id="projects-section" data-delay="4">
                    <div class="projects-header">
                        <i class="${escapeHTML(projectsConfig.titleIcon)}"></i>
                        <span class="projects-title">${escapeHTML(projectsConfig.titleText)}</span>
                        <span class="projects-badge">${repos.length} repos</span>
                    </div>
                    <!-- Contribution Graph -->
                    <div class="contribution-graph" aria-hidden="true">
                        ${contributionCells}
                    </div>
                    <!-- Projects Container -->
                    <div class="projects-container">
                        <!-- Main Project Card -->
${mainCardHTML}
                        <!-- Mini Cards Carousel -->
${hasCarousel ? `                        <div class="projects-carousel-wrapper" data-total="${miniCardsCount}">
                            <div class="carousel-track">
${miniCardsHTML}
                            </div>
                            <div class="carousel-indicators" role="tablist" aria-label="项目轮播导航"></div>
                        </div>` : ''}
                    </div>
                </div>`;
}

// 生成骨架屏项目占位 HTML（仪表盘式布局）
function generateSkeletonProjectsHTML(projectsConfig) {
    if (!projectsConfig.enabled || !projectsConfig.githubUser) {
        return '';
    }

    const count = Math.min(projectsConfig.count || 4, 4);

    // 贡献图骨架
    let contributionCells = '';
    for (let i = 0; i < 78; i++) {
        contributionCells += '<div class="contribution-cell skeleton"></div>';
    }

    // 主卡片骨架
    const mainCardSkeleton = '<div class="skeleton-project-main skeleton"></div>';

    // 迷你卡片骨架（轮播样式）
    const miniCardsSkeleton = Array(Math.max(0, count - 1))
        .fill('<div class="skeleton-project-mini skeleton"></div>')
        .join('\n                            ');

    return `<div class="skeleton-divider skeleton"></div>

                <!-- Projects Skeleton -->
                <div class="skeleton-projects-section">
                    <div class="skeleton-projects-header skeleton"></div>
                    <div class="skeleton-contribution-graph">
                        ${contributionCells}
                    </div>
                    <div class="skeleton-projects-container">
                        ${mainCardSkeleton}
                        <div class="skeleton-carousel">
                            <div class="skeleton-carousel-track">
                            ${miniCardsSkeleton}
                            </div>
                        </div>
                    </div>
                </div>`;
}

// HTML 转义函数
function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 从 config.js 提取所有配置
const config = {
    // SEO
    title: extractString(/title:\s*['"`]([^'"`]+)['"`]/, 'MoeWah - 技术博主 / 开源爱好者 / AI 探索者'),
    description: extractString(/description:\s*['"`]([^'"`]+)['"`]/, 'Hi，欢迎访问 MoeWah 的个人主页'),
    keywords: extractArray(/keywords:\s*\[([\s\S]*?)\]/, ['MoeWah', '技术博客', 'Astro', 'Docker']),
    ogTitle: extractNestedString(/og:\s*\{([\s\S]*?)\}/, 'title', 'MoeWah - 个人主页'),
    ogDescription: extractNestedString(/og:\s*\{([\s\S]*?)\}/, 'description', '开源爱好者 / Astro爱好者 / AI探索者'),
    ogImage: extractNestedString(/og:\s*\{([\s\S]*?)\}/, 'image', 'https://www.moewah.com/images/avatar.webp'),

    // Profile
    name: extractNestedString(/profile:\s*\{([\s\S]*?)\}/, 'name', 'MoeWah'),
    avatar: extractNestedString(/profile:\s*\{([\s\S]*?)\}/, 'avatar', 'images/avatar.webp'),
    taglinePrefix: extractNestedString(/tagline:\s*\{([\s\S]*?)\}/, 'prefix', '🐾'),
    taglineText: extractNestedString(/tagline:\s*\{([\s\S]*?)\}/, 'text', 'Meow~'),
    taglineHighlight: extractNestedString(/tagline:\s*\{([\s\S]*?)\}/, 'highlight', '万物皆可萌！'),

    // Identity & Interests
    identity: extractArray(/identity:\s*\[([\s\S]*?)\]/, ['开源爱好者', 'Astro爱好者', 'AI探索者']),
    interests: extractArray(/interests:\s*\[([\s\S]*?)\]/, ['Astro & 前端开发', 'Docker & 容器技术']),

    // Terminal
    terminalTitle: extractNestedString(/terminal:\s*\{([\s\S]*?)\}/, 'title', '🐾 meow@tribe:~|'),

    // Links
    links: extractLinks(),
    linksConfig: extractLinksConfig(),

    // Footer
    footerText: extractNestedString(/footer:\s*\{([\s\S]*?)\}/, 'text', 'Powered by'),
    footerLinkText: extractNestedString(/link:\s*\{([\s\S]*?)\}/, 'text', 'MoeWah'),
    footerLinkUrl: extractNestedString(/link:\s*\{([\s\S]*?)\}/, 'url', 'https://www.moewah.com/'),

    // Notice
    noticeEnabled: extractNestedString(/notice:\s*\{([\s\S]*?)\}/, 'enabled', 'true') === 'true',
    noticeType: extractNestedString(/notice:\s*\{([\s\S]*?)\}/, 'type', 'warning'),
    noticeIcon: extractNestedString(/notice:\s*\{([\s\S]*?)\}/, 'icon', 'fa-solid fa-shield-halved'),
    noticeText: extractNestedString(/notice:\s*\{([\s\S]*?)\}/, 'text', '声明：本人不会主动邀请或联系任何人，任何冒用本人名义的一切事物，请务必谨防受骗！'),

    // RSS
    rss: extractRSSConfig(),

    // Projects
    projects: extractProjectsConfig(),

    // Contribution
    contribution: extractContributionConfig(),

    // Nav
    nav: extractNavConfig(),

    // Analytics
    gaEnabled: extractAnalyticsValue('googleAnalytics', 'enabled') === 'true',
    gaId: extractAnalyticsValue('googleAnalytics', 'id'),
    clarityEnabled: extractAnalyticsValue('microsoftClarity', 'enabled') === 'true',
    clarityId: extractAnalyticsValue('microsoftClarity', 'id'),
    umami: extractUmamiScript(),
    customScripts: extractCustomScripts()
};

// 读取模板
const templatePath = path.join(__dirname, '../templates/index.template.html');
if (!fs.existsSync(templatePath)) {
    console.error('❌ 找不到 templates/index.template.html');
    process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf8');

// 主构建函数（异步）
async function build() {
    // 获取 RSS 文章
    let rssArticles = [];
    if (config.rss.enabled && config.rss.url) {
        rssArticles = await getRSSArticles(config.rss.url, config.rss.count);
    }

    // 获取 GitHub 项目信息和贡献数据
    let githubRepos = [];
    let contributionData = null;

    if (config.projects.enabled && config.projects.githubUser) {
        const username = parseGitHubUser(config.projects.githubUser);
        if (username) {
            githubRepos = await fetchUserRepos(
                username,
                config.projects.count,
                config.projects.exclude
            );
            
            // 获取贡献数据
            if (config.contribution.enabled) {
                const contribUser = config.contribution.githubUser 
                    ? parseGitHubUser(config.contribution.githubUser) || username
                    : username;
                contributionData = await fetchUserContributions(contribUser, config.contribution.useRealData);
            }
        }
    }

    // 如果 contribution 启用但 projects 未配置，单独获取贡献数据
    if (config.contribution.enabled && !contributionData && config.contribution.githubUser) {
        const contribUser = parseGitHubUser(config.contribution.githubUser);
        if (contribUser) {
            contributionData = await fetchUserContributions(contribUser, config.contribution.useRealData);
        }
    }

    // 确保贡献数据始终有值
    if (!contributionData) {
        contributionData = await fetchUserContributions(null, false);
    }

    // 替换所有占位符
    let html = template
        // SEO
        .replace(/{{TITLE}}/g, config.title)
        .replace(/{{DESCRIPTION}}/g, config.description)
        .replace(/{{KEYWORDS}}/g, config.keywords.join(', '))
        .replace(/{{OG_TITLE}}/g, config.ogTitle)
        .replace(/{{OG_DESCRIPTION}}/g, config.ogDescription)
        .replace(/{{OG_IMAGE}}/g, config.ogImage)

        // Profile
        .replace(/{{NAME}}/g, config.name)
        .replace(/{{AVATAR}}/g, config.avatar)
        .replace(/{{TAGLINE_PREFIX}}/g, config.taglinePrefix)
        .replace(/{{TAGLINE_TEXT}}/g, config.taglineText)
        .replace(/{{TAGLINE_HIGHLIGHT}}/g, config.taglineHighlight)

        // Terminal
        .replace(/{{TERMINAL_TITLE}}/g, config.terminalTitle)
        .replace(/{{IDENTITY}}/g, config.identity.join(' / '))
        .replace(/{{INTERESTS}}/g, config.interests.join(' / '))

        // Links
        .replace(/{{LINKS_SECTION}}/g, generateLinksSectionHTML(config.links, config.linksConfig))
        .replace(/{{SKELETON_LINKS_SECTION}}/g, generateSkeletonLinksSectionHTML(config.links, config.linksConfig))

        // Notice
        .replace(/{{NOTICE}}/g, generateNoticeHTML({
            enabled: config.noticeEnabled,
            type: config.noticeType,
            icon: config.noticeIcon,
            text: config.noticeText
        }))
        .replace(/{{SKELETON_NOTICE}}/g, generateSkeletonNoticeHTML({
            enabled: config.noticeEnabled
        }))

        // RSS
        .replace(/{{RSS}}/g, generateRSSHTML(rssArticles, config.rss))
        .replace(/{{SKELETON_RSS}}/g, generateSkeletonRSSHTML(config.rss))

        // Projects
        .replace(/{{PROJECTS}}/g, generateProjectsHTML(githubRepos, config.projects, contributionData, config.contribution))
        .replace(/{{SKELETON_PROJECTS}}/g, generateSkeletonProjectsHTML(config.projects))

        // Footer
        .replace(/{{FOOTER_TEXT}}/g, config.footerText)
        .replace(/{{FOOTER_LINK}}/g, config.footerLinkText)
        .replace(/{{FOOTER_URL}}/g, config.footerLinkUrl)

        // Nav Links
        .replace(/{{NAV_POSTS_LINK}}/g, config.rss.enabled ? '<a href="#rss-section" class="nav-link" data-section="rss-section">Posts</a>' : '')
        .replace(/{{NAV_PROJECTS_LINK}}/g, config.projects.enabled ? '<a href="#projects-section" class="nav-link" data-section="projects-section">Projects</a>' : '')
        .replace(/{{NAV_LINKS_LINK}}/g, config.linksConfig.enabled ? '<a href="#links-container" class="nav-link" data-section="links-container">Links</a>' : '')
        .replace(/{{NAV_POSTS_LINK_MOBILE}}/g, config.rss.enabled ? '<a href="#rss-section" class="nav-sidebar-link" data-section="rss-section">Posts</a>' : '')
        .replace(/{{NAV_PROJECTS_LINK_MOBILE}}/g, config.projects.enabled ? '<a href="#projects-section" class="nav-sidebar-link" data-section="projects-section">Projects</a>' : '')
        .replace(/{{NAV_LINKS_LINK_MOBILE}}/g, config.linksConfig.enabled ? '<a href="#links-container" class="nav-sidebar-link" data-section="links-container">Links</a>' : '')
        .replace(/{{NAV_CUSTOM_MENUS}}/g, generateCustomMenusHTML(config.nav?.menus))
        .replace(/{{NAV_CUSTOM_MENUS_MOBILE}}/g, generateCustomMenusMobileHTML(config.nav?.menus))

        // Analytics
        .replace(/{{ANALYTICS}}/g, generateAnalyticsHTML(config));

    // 清理并创建 dist 目录
    cleanDist();

    // 写入 HTML
    fs.writeFileSync(path.join(distDir, 'index.html'), html, 'utf8');

    // 复制静态资源
    const copyFile = (srcFile, destFile) => {
        const srcPath = path.join(rootDir, srcFile);
        const destPath = path.join(distDir, destFile);
        if (fs.existsSync(srcPath)) {
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.copyFileSync(srcPath, destPath);
            console.log('📋 复制: ' + destFile);
        }
    };

    copyFile('src/app.js', 'app.js');
    copyFile('src/style.css', 'style.css');
    copyFile('src/config.js', 'config.js');
    copyFile('src/theme-utils.js', 'theme-utils.js');
    copyFile('src/images/avatar.webp', 'images/avatar.webp');

    console.log('✅ 构建成功！');
    console.log('📄 生成了: ' + path.join(distDir, 'index.html'));
    console.log('📋 标题: ' + config.title);
    console.log('🔑 关键词: ' + config.keywords.join(', '));
    if (config.rss.enabled) {
        console.log('📰 RSS 文章: ' + rssArticles.length + ' 篇');
    }
    if (config.projects.enabled && githubRepos.length > 0) {
        console.log('📦 GitHub 项目: ' + githubRepos.length + ' 个');
    }
}

// 执行构建
build().catch(function(err) {
    console.error('❌ 构建失败:', err);
    process.exit(1);
});
