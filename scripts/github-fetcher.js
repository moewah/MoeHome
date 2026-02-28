/**
 * GitHub User Repositories Fetcher
 * 构建时获取 GitHub 用户公开仓库信息，运行时零请求
 */

const https = require('https');

// GitHub 语言颜色映射
const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  PHP: '#4F5D95',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#239120',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Scala: '#c22d40',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Dart: '#00B4AB',
  Lua: '#000080',
  Perl: '#39457E',
  R: '#198CE7',
  Haskell: '#5e5086',
  Elixir: '#6e4a7e',
  Clojure: '#db5855',
  Makefile: '#427819',
  Dockerfile: '#384d54',
  Vim: '#199f4b',
  Emacs: '#c065db',
  PowerShell: '#012456',
  Blade: '#f7523f',
  Astro: '#ff5a03',
  Default: '#8b949e',
};

// 获取语言对应的颜色
function getLanguageColor(language) {
  if (!language) return LANGUAGE_COLORS.Default;
  return LANGUAGE_COLORS[language] || LANGUAGE_COLORS.Default;
}

// 从 URL 提取 GitHub 用户名
function parseGitHubUser(url) {
  // 支持多种格式：
  // https://github.com/username
  // https://github.com/username/
  // github.com/username
  const match = url.match(/github\.com\/([^/]+)/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

// HTTPS GET 请求封装
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'MoeHome-Build-Script/1.0',
          'Accept': 'application/vnd.github.v3+json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`JSON 解析失败: ${e.message}`));
            }
          } else if (res.statusCode === 403) {
            reject(new Error('GitHub API 限流，请稍后重试'));
          } else if (res.statusCode === 404) {
            reject(new Error('用户不存在'));
          } else {
            reject(new Error(`请求失败: HTTP ${res.statusCode}`));
          }
        });
      }
    );
    req.on('error', (e) => reject(new Error(`网络错误: ${e.message}`)));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
  });
}

// 获取用户公开仓库列表
async function fetchUserRepos(username, count, excludePatterns) {
  console.log(`\n📦 正在获取 GitHub 用户 ${username} 的公开仓库...`);

  try {
    // GitHub API: 获取用户公开仓库（按更新时间排序，每页100个）
    const url = `https://api.github.com/users/${username}/repos?sort=updated&per_page=100`;
    const repos = await httpsGet(url);

    if (!Array.isArray(repos)) {
      throw new Error('API 返回数据格式异常');
    }

    // 过滤并处理仓库
    let filteredRepos = repos
      .filter((repo) => {
        // 排除 fork 的仓库
        if (repo.fork) return false;
        // 排除私有仓库
        if (repo.private) return false;
        // 排除匹配的仓库名
        if (excludePatterns && excludePatterns.length > 0) {
          for (const pattern of excludePatterns) {
            try {
              const regex = new RegExp(pattern, 'i');
              if (regex.test(repo.name)) return false;
            } catch (e) {
              // 如果正则无效，使用精确匹配
              if (repo.name.toLowerCase() === pattern.toLowerCase()) return false;
            }
          }
        }
        return true;
      })
      // 按 star 数降序排序
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      // 取前 count 个
      .slice(0, count || 4);

    // 格式化输出
    const result = filteredRepos.map((repo) => ({
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || '暂无描述',
      url: repo.html_url,
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      language: repo.language,
      languageColor: getLanguageColor(repo.language),
      isArchived: repo.archived || false,
      topics: repo.topics || [],
      homepage: repo.homepage || null,
    }));

    // 输出获取结果
    result.forEach((repo) => {
      console.log(`  ✓ ${repo.name}: ⭐ ${repo.stars} | 🍴 ${repo.forks} | ${repo.language || 'Unknown'}`);
    });
    console.log(`  📊 成功获取 ${result.length} 个仓库\n`);

    return result;
  } catch (error) {
    console.error(`  ⚠️  获取仓库失败: ${error.message}\n`);
    return [];
  }
}

// 格式化数字（如 1280 -> 1.3k）
function formatNumber(num) {
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toString();
}

module.exports = {
  fetchUserRepos,
  parseGitHubUser,
  getLanguageColor,
  formatNumber,
  LANGUAGE_COLORS,
};