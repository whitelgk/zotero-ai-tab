// src/utils/vectorStorage.ts
import { config } from "../../package.json";

const DB_NAME = `${config.addonRef}_VectorStore`;
const DB_VERSION = 1;
const STORE_NAME = "chunks";

interface ChunkRecord {
    id: string; // 唯一 ID，例如 "sessionId_fileId_chunkIndex"
    sessionId: string;
    fileId: string; // 文件标识符 (可以是 Zotero Item Key 或文件名)
    chunkIndex: number;
    text: string;
    vector: number[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

// --- 初始化数据库 ---
function getDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            ztoolkit.log("VectorStorage: Opening IndexedDB...");
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                ztoolkit.log("ERROR: VectorStorage - IndexedDB error:", request.error);
                reject(new Error(`IndexedDB error: ${request.error?.message}`));
                dbPromise = null; // 重置 Promise 以便重试
            };

            request.onsuccess = (event) => {
                ztoolkit.log("VectorStorage: IndexedDB opened successfully.");
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                ztoolkit.log("VectorStorage: IndexedDB upgrade needed.");
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    ztoolkit.log(`VectorStorage: Creating object store: ${STORE_NAME}`);
                    const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
                    // 创建索引，加速按 sessionId 或 fileId 查找
                    store.createIndex("sessionId", "sessionId", { unique: false });
                    store.createIndex("fileId", "fileId", { unique: false });
                    ztoolkit.log("VectorStorage: Object store and indexes created.");
                }
            };
        });
    }
    return dbPromise;
}

// --- 存储 Embeddings ---
export async function storeEmbeddings(
    sessionId: string,
    fileId: string,
    chunks: { text: string; vector: number[] }[]
): Promise<void> {
    if (!chunks || chunks.length === 0) return;
    ztoolkit.log(`VectorStorage: Storing ${chunks.length} chunks for file ${fileId} in session ${sessionId}`);

    try {
        const db = await getDb();
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        const putPromises: Promise<IDBValidKey>[] = [];
        chunks.forEach((chunk, index) => {
            const record: ChunkRecord = {
                id: `${sessionId}_${fileId}_${index}`, // 生成唯一 ID
                sessionId,
                fileId,
                chunkIndex: index,
                text: chunk.text,
                vector: chunk.vector,
            };
            putPromises.push(new Promise((resolve, reject) => {
                 const req = store.put(record);
                 req.onsuccess = () => resolve(req.result);
                 req.onerror = () => reject(req.error);
            }));
        });

        await Promise.all(putPromises);
        ztoolkit.log(`VectorStorage: Successfully stored ${chunks.length} chunks.`);

    } catch (error) {
        ztoolkit.log("ERROR: VectorStorage - Failed to store embeddings:", error);
        throw error; // 重新抛出错误
    }
}

// --- 计算余弦相似度 ---
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
        return 0; // 或者抛出错误
    }

    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
        return 0; // 避免除以零
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}


// --- 查找相似块 ---
export async function findSimilarChunks(
    sessionId: string,
    queryVector: number[],
    topK: number = 3 // 默认返回最相似的 3 个
): Promise<{ text: string; score: number }[]> {
    ztoolkit.log(`VectorStorage: Finding top ${topK} similar chunks for session ${sessionId}`);
    if (!queryVector || queryVector.length === 0) return [];

    try {
        const db = await getDb();
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index("sessionId"); // 使用 sessionId 索引

        const results: { text: string; score: number }[] = [];

        // 使用索引获取当前会话的所有记录
        return new Promise((resolve, reject) => {
            const request = index.getAll(sessionId); // 获取当前 session 的所有记录

            request.onerror = (event) => {
                ztoolkit.log("ERROR: VectorStorage - Error getting records by session:", request.error);
                reject(new Error(`Error getting records by session: ${request.error?.message}`));
            };

            request.onsuccess = (event) => {
                const records = request.result as ChunkRecord[];
                ztoolkit.log(`VectorStorage: Retrieved ${records.length} records for session ${sessionId}`);

                if (!records || records.length === 0) {
                    resolve([]); // 没有记录，直接返回空
                    return;
                }

                // 计算所有记录与查询向量的相似度
                const scoredRecords = records.map(record => ({
                    text: record.text,
                    score: cosineSimilarity(queryVector, record.vector)
                }));

                // 按相似度降序排序
                scoredRecords.sort((a, b) => b.score - a.score);

                // 返回 Top-K 结果
                resolve(scoredRecords.slice(0, topK));
                ztoolkit.log(`VectorStorage: Found ${scoredRecords.slice(0, topK).length} similar chunks.`);
            };
        });

    } catch (error) {
        ztoolkit.log("ERROR: VectorStorage - Failed to find similar chunks:", error);
        throw error;
    }
}

// --- (可选) 清理函数 ---
export async function clearSessionData(sessionId: string): Promise<void> {
     ztoolkit.log(`VectorStorage: Clearing data for session ${sessionId}`);
     try {
        const db = await getDb();
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index("sessionId");
        const request = index.openKeyCursor(IDBKeyRange.only(sessionId)); // 获取该 session 的所有 key

        return new Promise((resolve, reject) => {
            const deletePromises: Promise<void>[] = [];
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    deletePromises.push(new Promise((res, rej) => {
                         const deleteReq = store.delete(cursor.primaryKey);
                         deleteReq.onsuccess = () => res();
                         deleteReq.onerror = () => rej(deleteReq.error);
                    }));
                    cursor.continue();
                } else {
                    // 所有 key 都已处理完毕
                    Promise.all(deletePromises).then(() => {
                         ztoolkit.log(`VectorStorage: Data cleared for session ${sessionId}`);
                         resolve();
                    }).catch(reject);
                }
            };
             request.onerror = (event) => {
                ztoolkit.log("ERROR: VectorStorage - Error opening key cursor for deletion:", request.error);
                reject(new Error(`Error clearing session data: ${request.error?.message}`));
            };
        });
     } catch (error) {
         ztoolkit.log("ERROR: VectorStorage - Failed to clear session data:", error);
        throw error;
     }
}