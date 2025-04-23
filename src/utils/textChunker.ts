// src/utils/textChunker.ts

/**
 * 将文本分割成指定大小的块，并带有重叠。
 * 这是一个简单的基于字符数的实现。
 * @param text 要分割的原始文本
 * @param chunkSize 每个块的目标大小（字符数）
 * @param chunkOverlap 块之间的重叠大小（字符数）
 * @returns 分割后的文本块数组
 */
export function chunkTextSimple(
    text: string,
    chunkSize: number = 500, // 默认块大小 500 字符
    chunkOverlap: number = 50   // 默认重叠 50 字符
): string[] {
    if (!text) return [];
    if (chunkOverlap >= chunkSize) {
        chunkOverlap = Math.floor(chunkSize / 5); // 防止重叠大于块大小，设置一个默认重叠
        ztoolkit.log(`Warning: Chunk overlap (${chunkOverlap}) was >= chunk size (${chunkSize}). Adjusted overlap to ${chunkOverlap}.`);
    }

    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
        const endIndex = Math.min(startIndex + chunkSize, text.length);
        chunks.push(text.substring(startIndex, endIndex));

        // 计算下一个块的起始位置
        startIndex += chunkSize - chunkOverlap;

        // 如果最后一块太短，并且不是第一块，可以考虑与前一块合并或做其他处理
        // 这里简单处理：只要还有内容就继续分块
        if (endIndex === text.length) {
            break; // 到达文本末尾
        }
    }

    ztoolkit.log(`Chunker: Split text (${text.length} chars) into ${chunks.length} chunks (size: ${chunkSize}, overlap: ${chunkOverlap})`);
    return chunks;
}

// TODO: 未来可以考虑更智能的分块策略，例如：
// - 按段落或句子分割，然后组合成接近 chunkSize 的块。
// - 使用 Tokenizer 计算 Token 数进行分块（需要引入 Tokenizer 库）。