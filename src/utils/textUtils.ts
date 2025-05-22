// src/utils/textUtils.ts (或 util.ts)

/**
 * 判断字符串是否主要包含中文字符
 * @param str 待检查的字符串
 * @returns 如果包含中文字符则返回 true，否则返回 false
 */
function containsChinese(str: string): boolean {
    if (!str) return false;
    // 正则表达式匹配中文字符的 Unicode 范围
    // \u4E00-\u9FFF 是 CJK Unified Ideographs (中日韩统一表意文字)
    // \u3400-\u4DBF 是 CJK Unified Ideographs Extension A
    // \uF900-\uFAFF 是 CJK Compatibility Ideographs
    // 可以根据需要调整范围，但 \u4E00-\u9FFF 通常足够
    return /[\u4E00-\u9FFF]/.test(str);
}

/**
 * 清理Zotero文本格式，去除PDF链接和其他格式
 * @param text 包含Zotero格式的文本
 * @returns 清理后的纯文本
 */
export function cleanZoteroFormattedText(text: string): string {
    if (!text) return "";

    // 1. 去除所有 Zotero 链接，格式类似 ([显示文本](zotero://...))
    const zoteroGenericLinkRegex = /\s*\(?\[[^\]]+\]\(zotero:\/\/[^\)]+\)\)?/gi;
    let cleanedText = text.replace(zoteroGenericLinkRegex, '');

    // 2. 去除其他可能的Zotero格式标记，如引用标记等 ([@citekey])
    const citeKeyRegex = /\s*\[@[a-zA-Z0-9_-]+\]/g;
    cleanedText = cleanedText.replace(citeKeyRegex, '');

    // 3. 去除可能的HTML标签
    cleanedText = cleanedText.replace(/<[^>]*>/g, '');

    // 4. 处理双引号（包括中文引号“ ” 和英文引号 " "）内的文本
    const quotesRegex = /(["“])(.*?)(["”])/g;
    cleanedText = cleanedText.replace(quotesRegex, (match, openQuote, contentInQuotes, closeQuote) => {
        let processedContent = contentInQuotes;

        if (containsChinese(contentInQuotes)) {
            // 如果内容包含中文，则移除所有空格
            processedContent = contentInQuotes.replace(/\s+/g, '');
        } else {
            // 如果内容不含中文（视为英文或西文），则将多个连续空格替换为单个空格，并去除首尾空格
            // 这一步也顺便处理了英文内容中可能存在的多余空格
            processedContent = contentInQuotes.trim().replace(/\s+/g, ' ');
        }
        return `${openQuote}${processedContent}${closeQuote}`;
    });

    // 5. 去除整体文本的多余空格（首尾空格，以及多个连续空格替换为单个空格）
    //    这一步在处理完引号内空格后进行，以确保不会在引号外引入不必要的单个空格
    //    并且可以清理掉因移除 Zotero 链接等操作可能产生的连续空格
    cleanedText = cleanedText.trim().replace(/\s+/g, ' ');

    return cleanedText;
}
