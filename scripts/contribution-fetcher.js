/**
 * GitHub 贡献热力图数据获取模块
 * 通过 GitHub Events API 获取真实贡献数据
 */

const https = require('https');

/**
 * 获取 GitHub 用户贡献数据
 * @param {string} username - GitHub 用户名
 * @param {boolean} useRealData - 是否使用真实数据
 * @returns {Promise<{levels: number[], counts: number[], dates: string[], total: number}>} 贡献数据
 */
async function fetchUserContributions(username, useRealData = true) {
    if (!useRealData) {
        console.log('  📊 使用随机贡献数据（配置已禁用真实数据）');
        return generateRandomContributions();
    }

    if (!username) {
        console.log('  ⚠️ 未配置 GitHub 用户名，使用随机贡献数据');
        return generateRandomContributions();
    }

    console.log(`📊 正在获取 GitHub 用户 ${username} 的贡献数据...`);

    try {
        const events = await fetchPublicEvents(username);
        const result = buildContributionLevels(events, 78);
        console.log(`  ✓ 成功解析贡献数据: ${result.total} 次事件`);
        return result;
    } catch (error) {
        console.log(`  ⚠️ 获取贡献数据失败: ${error.message}，使用随机数据`);
        return generateRandomContributions();
    }
}

/**
 * 从 GitHub Events API 获取公开事件
 * @param {string} username - GitHub 用户名
 * @returns {Promise<Array>} 事件数组
 */
function fetchPublicEvents(username) {
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/users/${username}/events/public?per_page=100`;
        
        const req = https.get(url, {
            headers: {
                'User-Agent': 'MoeWah-Homepage',
                'Accept': 'application/vnd.github.v3+json'
            }
        }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const events = JSON.parse(data);
                        resolve(events);
                    } catch (e) {
                        reject(new Error('JSON 解析失败'));
                    }
                } else if (res.statusCode === 403) {
                    reject(new Error('API 速率限制'));
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
    });
}

/**
 * 将事件数据转换为贡献级别数组
 * @param {Array} events - GitHub 事件数组
 * @param {number} days - 天数（默认 78 天 = 13 周）
 * @returns {{levels: number[], counts: number[], dates: string[], total: number}}
 */
function buildContributionLevels(events, days = 78) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 初始化每天的贡献数
    const dailyCounts = {};

    // 统计每个日期的事件数
    events.forEach(event => {
        if (event.created_at) {
            const date = event.created_at.split('T')[0];
            dailyCounts[date] = (dailyCounts[date] || 0) + 1;
        }
    });

    // 生成最近 N 天的级别数组
    const levels = [];
    const counts = [];
    const dates = [];
    let total = 0;

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const count = dailyCounts[dateStr] || 0;
        const level = countToLevel(count);

        levels.push(level);
        counts.push(count);
        dates.push(dateStr);
        if (count > 0) total += count;
    }

    return { levels, counts, dates, total };
}

/**
 * 将事件数转换为贡献级别 (0-4)
 * @param {number} count - 事件数
 * @returns {number} 级别 0-4
 */
function countToLevel(count) {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 4) return 2;
    if (count <= 6) return 3;
    return 4;
}

/**
 * 生成随机贡献数据（备用方案）
 * @returns {{levels: number[], counts: number[], dates: string[], total: number}}
 */
function generateRandomContributions() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const levels = [];
    const counts = [];
    const dates = [];
    let total = 0;

    for (let i = 77; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const count = Math.random() > 0.3 ? Math.floor(Math.random() * 8) : 0;
        const level = countToLevel(count);

        levels.push(level);
        counts.push(count);
        dates.push(dateStr);
        if (count > 0) total += count;
    }

    return {
        levels,
        counts,
        dates,
        total: Math.floor(Math.random() * 100) + 10
    };
}

module.exports = {
    fetchUserContributions
};