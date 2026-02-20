/**
 * MoeWah Homepage - Build Script
 * 构建脚本：读取 config.js 生成完全静态化的 HTML
 */

const fs = require('fs');
const path = require('path');

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
    
    // Footer
    footerText: extractNestedString(/footer:\s*\{([\s\S]*?)\}/, 'text', 'Powered by'),
    footerLinkText: extractNestedString(/link:\s*\{([\s\S]*?)\}/, 'text', 'MoeWah'),
    footerLinkUrl: extractNestedString(/link:\s*\{([\s\S]*?)\}/, 'url', 'https://www.moewah.com/')
};

// 读取模板
const templatePath = path.join(__dirname, '../templates/index.template.html');
if (!fs.existsSync(templatePath)) {
    console.error('❌ 找不到 templates/index.template.html');
    process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf8');

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
    .replace(/{{LINKS}}/g, generateLinksHTML(config.links))
    
    // Footer
    .replace(/{{FOOTER_TEXT}}/g, config.footerText)
    .replace(/{{FOOTER_LINK}}/g, config.footerLinkText)
    .replace(/{{FOOTER_URL}}/g, config.footerLinkUrl);

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
        console.log(`📋 复制: ${destFile}`);
    }
};

copyFile('src/app.js', 'app.js');
copyFile('src/style.css', 'style.css');
copyFile('src/config.js', 'config.js');
copyFile('src/images/avatar.webp', 'images/avatar.webp');

console.log('✅ 构建成功！');
console.log(`📄 生成了: ${path.join(distDir, 'index.html')}`);
console.log(`📋 标题: ${config.title}`);
console.log(`🔑 关键词: ${config.keywords.join(', ')}`);
