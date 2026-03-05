/**
 * Minify Module - 资源压缩模块
 * 支持 JS/CSS/HTML/图片压缩，通过环境变量控制
 */

const fs = require('fs');
const path = require('path');

// ========== 环境变量配置 ==========

/**
 * 解析布尔环境变量
 * @param {string|undefined} value - 环境变量值
 * @param {boolean} defaultValue - 默认值
 * @returns {boolean}
 */
function parseBoolEnv(value, defaultValue) {
    if (value === undefined) return defaultValue;
    return value === 'true';
}

/**
 * 获取环境变量配置
 */
function getMinifyConfig() {
    // 总开关（默认启用）
    const minify = process.env.MINIFY !== 'false';

    return {
        // 总开关
        minify,
        // JS 压缩（未设置时跟随总开关）
        minifyJS: parseBoolEnv(process.env.MINIFY_JS, minify),
        // CSS 压缩（未设置时跟随总开关）
        minifyCSS: parseBoolEnv(process.env.MINIFY_CSS, minify),
        // HTML 压缩（未设置时跟随总开关）
        minifyHTML: parseBoolEnv(process.env.MINIFY_HTML, minify),
        // 图片压缩（默认启用）
        compressImages: parseBoolEnv(process.env.COMPRESS_IMAGES, minify),
        // 图片质量 (1-100, 默认 80)
        imageQuality: parseInt(process.env.IMAGE_QUALITY, 10) || 80
    };
}

// ========== JS 压缩 ==========

/**
 * 压缩 JavaScript
 * @param {string} code - JS 代码
 * @returns {Promise<string>} 压缩后的代码
 */
async function minifyJS(code) {
    try {
        const { minify } = require('terser');
        const result = await minify(code, {
            compress: {
                drop_console: false,  // 保留 console
                drop_debugger: true,
                dead_code: true,
                unused: true
            },
            mangle: false,  // 不混淆变量名，保持可读性
            format: {
                comments: false  // 移除注释
            }
        });
        return result.code;
    } catch (error) {
        console.error('  ⚠️ JS 压缩失败:', error.message);
        return code;  // 压缩失败返回原代码
    }
}

// ========== CSS 压缩 ==========

/**
 * 压缩 CSS
 * @param {string} css - CSS 代码
 * @returns {string} 压缩后的代码
 */
function minifyCSS(css) {
    try {
        const { transform } = require('lightningcss');
        const result = transform({
            code: Buffer.from(css),
            minify: true,
            sourceMap: false,
            errorRecovery: true  // 容错模式，跳过无效选择器
        });
        return result.code.toString();
    } catch (error) {
        // lightningcss 失败时，使用简单的正则压缩作为 fallback
        console.error('  ⚠️ CSS 压缩失败 (lightningcss):', error.message);
        console.log('  ℹ️ 使用备用压缩方案...');
        return minifyCSSFallback(css);
    }
}

/**
 * CSS 压缩备用方案（正则处理）
 * @param {string} css - CSS 代码
 * @returns {string} 压缩后的代码
 */
function minifyCSSFallback(css) {
    try {
        return css
            .replace(/\/\*[\s\S]*?\*\//g, '')           // 移除注释
            .replace(/^\s+/gm, '')                       // 移除行首空白
            .replace(/\s*([{}:;,>+~])\s*/g, '$1')       // 移除符号周围空白
            .replace(/\s+/g, ' ')                        // 压缩连续空白
            .replace(/;}/g, '}')                         // 移除多余分号
            .replace(/,\s+/g, ',')                       // 压缩选择器逗号后空白
            .trim();
    } catch (error) {
        console.error('  ⚠️ CSS 备用压缩失败:', error.message);
        return css;
    }
}

// ========== HTML 压缩 ==========

/**
 * 压缩 HTML
 * @param {string} html - HTML 代码
 * @returns {Promise<string>} 压缩后的代码
 */
async function minifyHTML(html) {
    try {
        const { minify } = require('html-minifier-terser');
        return await minify(html, {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            removeEmptyAttributes: true,
            minifyCSS: false,  // 已单独处理
            minifyJS: false    // 已单独处理
        });
    } catch (error) {
        console.error('  ⚠️ HTML 压缩失败:', error.message);
        return html;  // 压缩失败返回原代码
    }
}

// ========== 图片压缩 ==========

/**
 * 压缩图片
 * @param {Buffer} buffer - 图片 Buffer
 * @param {string} format - 图片格式 (webp, png, jpeg, jpg)
 * @param {number} quality - 压缩质量 (1-100)
 * @returns {Promise<{buffer: Buffer, changed: boolean}>} 压缩结果
 */
async function compressImage(buffer, format, quality = 80) {
    try {
        const sharp = require('sharp');
        const formatLower = format.toLowerCase();

        // 获取原始图片信息
        const metadata = await sharp(buffer).metadata();

        // 如果已经是目标格式且质量足够好，只进行有损压缩
        // 对于 webp，只进行质量压缩，不重新编码
        if (formatLower === 'webp' && metadata.format === 'webp') {
            // webp 转 webp 时，只有降低质量才能减小体积
            // 如果原图质量已经很低，可能反而变大
            const result = await sharp(buffer)
                .webp({ quality, effort: 4 })
                .toBuffer();

            // 只有压缩后更小才使用压缩结果
            if (result.length < buffer.length) {
                return { buffer: result, changed: true };
            }
            return { buffer, changed: false };
        }

        // 其他格式的处理
        let image = sharp(buffer);

        if (formatLower === 'webp') {
            image = image.webp({ quality, effort: 4 });
        } else if (formatLower === 'png') {
            image = image.png({ quality, compressionLevel: 6 });
        } else if (formatLower === 'jpeg' || formatLower === 'jpg') {
            image = image.jpeg({ quality, mozjpeg: true });
        }

        const result = await image.toBuffer();

        // 只有压缩后更小才使用压缩结果
        if (result.length < buffer.length) {
            return { buffer: result, changed: true };
        }
        return { buffer, changed: false };
    } catch (error) {
        console.error('  ⚠️ 图片压缩失败:', error.message);
        return { buffer, changed: false };
    }
}

/**
 * 判断文件是否为图片
 * @param {string} filename - 文件名
 * @returns {boolean}
 */
function isImage(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ['.webp', '.png', '.jpg', '.jpeg'].includes(ext);
}

/**
 * 获取图片格式
 * @param {string} filename - 文件名
 * @returns {string} 格式名
 */
function getImageFormat(filename) {
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    return ext === 'jpg' ? 'jpeg' : ext;
}

// ========== 文件处理 ==========

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * 计算压缩率
 * @param {number} original - 原始大小
 * @param {number} minified - 压缩后大小
 * @returns {string} 压缩率百分比
 */
function calcReduction(original, minified) {
    const reduction = ((original - minified) / original * 100).toFixed(1);
    return reduction + '%';
}

/**
 * 处理 JS 文件
 * @param {string} srcPath - 源文件路径
 * @param {string} destPath - 目标文件路径
 * @param {object} config - 压缩配置
 * @returns {Promise<object>} 处理结果
 */
async function processJSFile(srcPath, destPath, config) {
    const originalSize = fs.statSync(srcPath).size;
    const code = fs.readFileSync(srcPath, 'utf8');

    let processedCode = code;
    let processed = false;

    if (config.minifyJS && config.minify) {
        processedCode = await minifyJS(code);
        processed = true;
    }

    fs.writeFileSync(destPath, processedCode, 'utf8');
    const newSize = Buffer.byteLength(processedCode, 'utf8');

    return {
        original: originalSize,
        minified: newSize,
        processed,
        type: 'JS'
    };
}

/**
 * 处理 CSS 文件
 * @param {string} srcPath - 源文件路径
 * @param {string} destPath - 目标文件路径
 * @param {object} config - 压缩配置
 * @returns {object} 处理结果
 */
function processCSSFile(srcPath, destPath, config) {
    const originalSize = fs.statSync(srcPath).size;
    const css = fs.readFileSync(srcPath, 'utf8');

    let processedCSS = css;
    let processed = false;

    if (config.minifyCSS && config.minify) {
        processedCSS = minifyCSS(css);
        processed = true;
    }

    fs.writeFileSync(destPath, processedCSS, 'utf8');
    const newSize = Buffer.byteLength(processedCSS, 'utf8');

    return {
        original: originalSize,
        minified: newSize,
        processed,
        type: 'CSS'
    };
}

/**
 * 处理 HTML 文件
 * @param {string} html - HTML 内容
 * @param {object} config - 压缩配置
 * @returns {Promise<string>} 处理后的 HTML
 */
async function processHTML(html, config) {
    if (config.minifyHTML && config.minify) {
        return await minifyHTML(html);
    }
    return html;
}

/**
 * 处理图片文件
 * @param {string} srcPath - 源文件路径
 * @param {string} destPath - 目标文件路径
 * @param {object} config - 压缩配置
 * @returns {Promise<object>} 处理结果
 */
async function processImageFile(srcPath, destPath, config) {
    const originalBuffer = fs.readFileSync(srcPath);
    const originalSize = originalBuffer.length;
    const format = getImageFormat(srcPath);

    let processedBuffer = originalBuffer;
    let processed = false;

    if (config.compressImages && config.minify) {
        const result = await compressImage(originalBuffer, format, config.imageQuality);
        processedBuffer = result.buffer;
        processed = result.changed;
    }

    fs.writeFileSync(destPath, processedBuffer);

    return {
        original: originalSize,
        minified: processedBuffer.length,
        processed,
        type: 'Image'
    };
}

// ========== 导出 ==========

module.exports = {
    getMinifyConfig,
    minifyJS,
    minifyCSS,
    minifyHTML,
    compressImage,
    processJSFile,
    processCSSFile,
    processHTML,
    processImageFile,
    isImage,
    getImageFormat,
    formatSize,
    calcReduction
};