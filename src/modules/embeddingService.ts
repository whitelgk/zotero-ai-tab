// src/modules/embeddingService.ts
import { getRagConfig } from "../utils/prefs"; // 获取 RAG 配置
import { getString } from "../utils/locale";

// 定义 Embedding API 响应格式 (根据你的文档)
interface EmbeddingData {
    embedding: number[];
    index: number;
    object: "embedding";
}
interface EmbeddingResponseFormat {
    data?: EmbeddingData[];
    model?: string;
    object?: string;
    usage?: {
        prompt_tokens?: number;
        total_tokens?: number;
    };
    error?: { message?: string; type?: string; code?: string; };
    id?: string;
}

const MAX_BATCH_SIZE = 10; // API 允许的最大批处理大小

/**
 * 获取一组文本的 Embedding 向量。
 * @param texts - 要获取 Embedding 的文本字符串数组。
 * @returns 一个 Promise，解析为包含对应向量的二维数组 number[][]。
 * @throws 如果配置缺失、网络错误、API 错误或响应格式无效，则抛出 Error 对象。
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
        return [];
    }

    const config = getRagConfig(); // 获取 RAG 配置
    if (!config.useRag) {
        ztoolkit.log("EmbeddingService: RAG is disabled, skipping embedding.");
        // 或者可以抛出错误，取决于你的设计
        // throw new Error("RAG is disabled in settings.");
         return texts.map(() => []); // 返回空向量数组，表示未处理
    }

    if (!config.embeddingApiKey) {
        throw new Error(getString("error-missing-embedding-apikey") || "Error: Embedding API Key not configured.");
    }
    if (!config.embeddingApiEndpoint) {
        throw new Error(getString("error-missing-embedding-endpoint") || "Error: Embedding API Endpoint not configured.");
    }
    if (!config.embeddingModelName) {
        throw new Error(getString("error-missing-embedding-model") || "Error: Embedding Model Name not configured.");
    }

    ztoolkit.log(`EmbeddingService: Getting embeddings for ${texts.length} text(s) using model ${config.embeddingModelName}`);

    const allEmbeddings: (number[] | null)[] = new Array(texts.length).fill(null); // 初始化结果数组
    const batches: string[][] = [];

    // --- 分批处理 ---
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        batches.push(texts.slice(i, i + MAX_BATCH_SIZE));
    }
    ztoolkit.log(`EmbeddingService: Processing in ${batches.length} batch(es).`);

    let currentBatchIndex = 0;
    for (const batch of batches) {
        const batchStartIndex = currentBatchIndex * MAX_BATCH_SIZE;
        ztoolkit.log(`EmbeddingService: Processing batch ${currentBatchIndex + 1}/${batches.length} (indices ${batchStartIndex} to ${batchStartIndex + batch.length - 1})`);

        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.embeddingApiKey}`,
        };

        const bodyPayload: any = {
            model: config.embeddingModelName,
            input: batch,
            encoding_format: "float", // 根据文档
        };
        if (config.embeddingDimensions) {
            bodyPayload.dimensions = config.embeddingDimensions;
        }

        const body = JSON.stringify(bodyPayload);

        try {
            const response = await fetch(config.embeddingApiEndpoint, {
                method: "POST",
                headers: headers,
                body: body,
            });

            if (!response.ok) {
                // ... (类似 llmService 的错误处理) ...
                let errorData: any = {};
                let errorText = `${response.status} ${response.statusText} (Embedding Model: ${config.embeddingModelName})`;
                try {
                    errorData = await response.json();
                    errorText += `. ${errorData?.error?.message || ''}`;
                } catch (e) { /* ... */ }
                ztoolkit.log("ERROR:", `Embedding API Error: ${errorText}`, errorData);
                throw new Error(errorText);
            }

            const data = await response.json() as EmbeddingResponseFormat;

            if (!data.data || !Array.isArray(data.data)) {
                ztoolkit.log("ERROR:", "Invalid Embedding API response structure", data);
                throw new Error("Invalid response structure from Embedding API.");
            }

            // 将批次结果填入总结果数组
            data.data.forEach(item => {
                const originalIndex = batchStartIndex + item.index; // 计算在原始 texts 数组中的索引
                if (originalIndex < allEmbeddings.length) {
                    allEmbeddings[originalIndex] = item.embedding;
                } else {
                     ztoolkit.log(`Warning: Received embedding index ${item.index} for batch starting at ${batchStartIndex}, which is out of bounds for original texts array (length ${texts.length}).`);
                }
            });
            ztoolkit.log(`EmbeddingService: Batch ${currentBatchIndex + 1} processed successfully.`);

        } catch (error: any) {
            ztoolkit.log("ERROR:", `Failed to get embeddings for batch ${currentBatchIndex + 1}:`, error);
            // 可以选择继续处理下一批，或者直接抛出错误中断整个过程
            // 这里选择中断
            throw error;
        }
        currentBatchIndex++;
    }

    // 检查是否有 null 值（表示某批次失败或索引错误）
    if (allEmbeddings.some(e => e === null)) {
         ztoolkit.log("ERROR: Some embeddings could not be retrieved.");
         // 可以选择抛出错误或返回部分结果
         // throw new Error("Failed to retrieve some embeddings.");
         // 或者返回过滤掉 null 的结果，但这可能导致与原始文本不匹配
    }


    ztoolkit.log(`EmbeddingService: Finished getting embeddings for ${allEmbeddings.filter(e => e !== null).length} text(s).`);
    // 过滤掉可能的 null 值并返回
    return allEmbeddings.filter(e => e !== null) as number[][];
}