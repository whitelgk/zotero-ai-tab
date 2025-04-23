// src/utils/textUtils.ts (或 util.ts)

/**
 * 清理Zotero文本格式，去除PDF链接和其他格式
 * @param text 包含Zotero格式的文本
 * @returns 清理后的纯文本
 */
export function cleanZoteroFormattedText(text: string): string {
    if (!text) return "";

    // 去除类似 ([pdf](zotero://open-pdf/library/items/5DUCCXAI?page=7)) 的格式
    const pdfLinkRegex = /\s*\(?\[(?:pdf|attachment)\]\(zotero:\/\/[^\)]+\)\)?/gi;
    let cleanedText = text.replace(pdfLinkRegex, '');

    // 去除其他可能的Zotero格式标记，如引用标记等
    const citeKeyRegex = /\s*\[@[a-zA-Z0-9_-]+\]/g;
    cleanedText = cleanedText.replace(citeKeyRegex, '');

    // 去除可能的HTML标签
    cleanedText = cleanedText.replace(/<[^>]*>/g, '');

    // 去除多余空格
    cleanedText = cleanedText.trim().replace(/\s+/g, ' ');

    return cleanedText;
}