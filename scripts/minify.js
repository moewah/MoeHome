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

/**
 * 压缩 HTML 中的内联 CSS（<style> 标签内的 CSS）
 * @param {string} html - HTML 代码
 * @param {object} config - 压缩配置
 * @returns {string} 处理后的 HTML
 */
function processInlineCSS(html, config) {
    if (!config.minifyCSS || !config.minify) {
        return html;
    }

    // 匹配所有 <style> 标签并压缩其内容
    return html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (match, attrs, css) => {
        // 跳过已压缩的（没有换行符的内容）
        if (!css.includes('\n')) {
            return match;
        }
        const minifiedCSS = minifyCSS(css.trim());
        return `<style${attrs}>${minifiedCSS}</style>`;
    });
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

// ========== Favicon 生成 ==========

/**
 * 从图片生成多尺寸 favicon
 * @param {Buffer} sourceBuffer - 源图片 Buffer
 * @param {string} destPath - 输出路径（.ico 文件）
 * @returns {Promise<{success: boolean, sizes: number[]}>}
 */
async function generateFavicon(sourceBuffer, destPath) {
    try {
        const sharp = require('sharp');

        // 生成多种尺寸：16x16, 32x32, 180x180 (Apple Touch Icon)
        const sizes = [16, 32, 180];
        const pngBuffers = [];

        for (const size of sizes) {
            const pngBuffer = await sharp(sourceBuffer)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toBuffer();
            pngBuffers.push({ size, buffer: pngBuffer });
        }

        // 生成 ICO 文件（包含 16x16 和 32x32）
        const icoBuffer = await createICO(pngBuffers.filter(p => p.size <= 32).map(p => p.buffer));
        fs.writeFileSync(destPath, icoBuffer);

        // 生成 Apple Touch Icon (180x180)
        const appleTouchPath = destPath.replace('.ico', '-apple-touch.png');
        const appleTouchBuffer = pngBuffers.find(p => p.size === 180).buffer;
        fs.writeFileSync(appleTouchPath, appleTouchBuffer);

        return {
            success: true,
            sizes,
            icoPath: destPath,
            appleTouchPath
        };
    } catch (error) {
        console.error('  ⚠️ Favicon 生成失败:', error.message);
        return { success: false, sizes: [] };
    }
}

/**
 * 创建 ICO 格式文件
 * @param {Buffer[]} pngBuffers - PNG Buffer 数组
 * @returns {Buffer}
 */
async function createICO(pngBuffers) {
    // ICO 文件格式：
    // - ICONDIR header (6 bytes)
    // - ICONDIRENTRY for each image (16 bytes each)
    // - Image data (PNG)

    const numImages = pngBuffers.length;
    const headerSize = 6;
    const entrySize = 16;

    // 计算数据偏移量
    let dataOffset = headerSize + (numImages * entrySize);

    // 收集图片数据
    const images = [];
    for (const pngBuffer of pngBuffers) {
        const img = await require('sharp')(pngBuffer).metadata();
        images.push({
            width: img.width,
            height: img.height,
            data: pngBuffer
        });
    }

    // 构建 ICO 文件
    const parts = [];

    // ICONDIR header
    const iconDir = Buffer.alloc(6);
    iconDir.writeUInt16LE(0, 0);      // Reserved
    iconDir.writeUInt16LE(1, 2);      // Type (1 = ICO)
    iconDir.writeUInt16LE(numImages, 4);  // Number of images
    parts.push(iconDir);

    // ICONDIRENTRY for each image
    let currentOffset = dataOffset;
    for (const img of images) {
        const entry = Buffer.alloc(16);
        entry.writeUInt8(img.width === 256 ? 0 : img.width, 0);   // Width
        entry.writeUInt8(img.height === 256 ? 0 : img.height, 1); // Height
        entry.writeUInt8(0, 2);        // Color palette
        entry.writeUInt8(0, 3);        // Reserved
        entry.writeUInt16LE(1, 4);     // Color planes
        entry.writeUInt16LE(32, 6);    // Bits per pixel
        entry.writeUInt32LE(img.data.length, 8);  // Size of image data
        entry.writeUInt32LE(currentOffset, 12);   // Offset to image data
        parts.push(entry);
        currentOffset += img.data.length;
    }

    // Image data
    for (const img of images) {
        parts.push(img.data);
    }

    return Buffer.concat(parts);
}

// ========== 导出 ==========

module.exports = {
    getMinifyConfig,
    minifyJS,
    minifyCSS,
    minifyHTML,
    processInlineCSS,
    compressImage,
    processJSFile,
    processCSSFile,
    processHTML,
    processImageFile,
    isImage,
    getImageFormat,
    formatSize,
    calcReduction,
    generateFavicon
};