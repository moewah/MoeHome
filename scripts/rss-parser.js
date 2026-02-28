/**
 * MoeWah Homepage - RSS Parser Module
 * RSS 解析模块：获取并解析 RSS feed
 * 使用 Node.js 原生 http/https 模块，安全无命令注入风险
 */

const https = require('https');
const http = require('http');

/**
 * 获取远程 RSS 内容
 * @param {string} url - RSS feed URL
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<string>} RSS XML 内容
 */
function fetchRSS(url, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;

        const timer = setTimeout(() => {
            reject(new Error('RSS fetch timeout'));
        }, timeout);

        client.get(url, (res) => {
            let data = '';

            // 处理重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                clearTimeout(timer);
                fetchRSS(res.headers.location, timeout).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                clearTimeout(timer);
                reject(new Error('RSS fetch failed with status: ' + res.statusCode));
                return;
            }

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                clearTimeout(timer);
                resolve(data);
            });
        }).on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

/**
 * 解析 RSS XML 并提取文章信息
 * @param {string} xml - RSS XML 内容
 * @param {number} count - 返回文章数量
 * @returns {Array} 文章列表
 */
function parseRSS(xml, count) {
    count = count || 5;
    const articles = [];

    // 匹配 <item> 标签内容
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && articles.length < count) {
        const itemContent = match[1];

        // 提取标题
        const titleMatch = itemContent.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '';

        // 提取链接
        const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/i);
        const link = linkMatch ? linkMatch[1].trim() : '';

        // 提取描述
        const descMatch = itemContent.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i);
        let description = descMatch ? (descMatch[1] || descMatch[2] || '').trim() : '';

        // 清理 HTML 标签
        description = description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

        // 提取发布日期
        const dateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        const pubDate = dateMatch ? dateMatch[1].trim() : '';

        if (title && link) {
            articles.push({
                title: title,
                link: link,
                description: description,
                pubDate: formatDate(pubDate),
            });
        }
    }

    return articles;
}

/**
 * 格式化日期
 * @param {string} dateStr - 日期字符串
 * @returns {string} 格式化后的日期
 */
function formatDate(dateStr) {
    if (!dateStr) return '';

    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '';

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return year + '-' + month + '-' + day;
    } catch (e) {
        return '';
    }
}

/**
 * 获取并解析 RSS feed
 * @param {string} url - RSS feed URL
 * @param {number} count - 返回文章数量
 * @returns {Promise<Array>} 文章列表
 */
async function getRSSArticles(url, count) {
    count = count || 5;
    try {
        console.log('📡 正在获取 RSS: ' + url);
        const xml = await fetchRSS(url);
        const articles = parseRSS(xml, count);
        console.log('✅ 成功解析 ' + articles.length + ' 篇文章');
        return articles;
    } catch (error) {
        console.error('❌ RSS 获取失败: ' + error.message);
        return [];
    }
}

module.exports = {
    fetchRSS: fetchRSS,
    parseRSS: parseRSS,
    getRSSArticles: getRSSArticles,
};