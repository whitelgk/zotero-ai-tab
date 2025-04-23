// src/modules/fileHandler.ts
import { ZoteroToolkit } from "zotero-plugin-toolkit"; // 可能需要 Toolkit

/**
 * 触发文件选择对话框，并调用回调函数处理选中的文件。
 * @param accept - 可选，一个包含 MIME 类型或文件扩展名的字符串，用于限制可选文件类型 (e.g., "application/pdf, text/plain, .md")
 * @returns 一个 Promise，解析为用户选择的 File 对象，如果用户取消则解析为 null。
 */
export function selectFile(accept?: string): Promise<File | null> {
    return new Promise((resolve) => {
        const doc = Zotero.getMainWindow().document; // 获取主窗口文档对象
        if (!doc) {
            ztoolkit.log("ERROR: FileHandler - Could not get main window document.");
            resolve(null);
            return;
        }

        // 创建隐藏的文件输入元素
        const fileInput = doc.createElementNS("http://www.w3.org/1999/xhtml", "input") as HTMLInputElement;
        fileInput.type = "file";
        if (accept) {
            fileInput.accept = accept;
        }
        fileInput.style.display = "none"; // 隐藏元素

        // 定义 change 事件处理器
        const changeHandler = (event: Event) => {
            const target = event.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                ztoolkit.log(`FileHandler: File selected: ${target.files[0].name}`);
                resolve(target.files[0]); // 返回选中的第一个文件
            } else {
                ztoolkit.log("FileHandler: No file selected (change event).");
                resolve(null); // 没有选择文件
            }
            // 清理：移除事件监听器和元素
            fileInput.removeEventListener("change", changeHandler);
            doc.documentElement.removeChild(fileInput);
        };

        // 定义 cancel 事件处理器 (虽然不常用，但可以处理某些取消场景)
        // 注意：用户直接关闭文件选择框通常不会触发 cancel 事件，而是 change 事件没有文件。
        const cancelHandler = () => {
             ztoolkit.log("FileHandler: File selection cancelled.");
             resolve(null);
             fileInput.removeEventListener("cancel", cancelHandler);
             doc.documentElement.removeChild(fileInput);
        }

        fileInput.addEventListener("change", changeHandler);
        fileInput.addEventListener("cancel", cancelHandler); // 添加 cancel 监听

        // 将元素添加到 DOM 并触发点击
        doc.documentElement.appendChild(fileInput);
        fileInput.click(); // 触发文件选择对话框
        ztoolkit.log("FileHandler: File input clicked, awaiting user selection...");

        // (可选) 添加一个超时或窗口焦点丢失的检测来处理用户未选择直接关闭对话框的情况
        // 但通常 change 事件在未选择时也会触发（files 列表为空）
    });
}

// --- 临时方案：假设 pdfjsLib 在全局可用 (可能需要你在 index.ts 或 hooks.ts 中手动加载) ---
declare const pdfjsLib: any; // 声明全局变量类型

/**
 * 读取文件内容并返回文本字符串。
 * @param file - 要读取的 File 对象。
 * @returns 一个 Promise，解析为提取的文本内容，如果失败则 reject。
 */
export function readFileContent(file: File): Promise<string> {
    return new Promise(async (resolve, reject) => { // <--- 改为 async
        ztoolkit.log(`FileHandler: Reading content of ${file.name} (${file.type})`);
        const reader = new FileReader();

        reader.onload = async (event) => { // <--- 改为 async
            if (!event.target?.result) {
                reject(new Error("FileReader onload event target result is null."));
                return;
            }

            try {
                if (file.type === "application/pdf") {
                    ztoolkit.log("FileHandler: Processing PDF...");
                    // --- PDF 处理逻辑 ---
                    const arrayBuffer = event.target.result as ArrayBuffer;

                    // --- 配置 Worker ---
                    // !! 重要：你需要确保 pdf.worker.js 被复制到插件目录，并提供正确的路径 !!
                    // 路径相对于 Zotero 插件的根目录
                    const workerSrc = `chrome://${addon.data.config.addonRef}/content/pdf.worker.mjs`; // 假设 worker 在 content 目录下
                    try {
                         // 尝试访问全局 pdfjsLib 并设置 workerSrc
                         if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
                             pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
                             ztoolkit.log("FileHandler: pdf.js worker source set to:", workerSrc);
                         } else {
                             throw new Error("pdfjsLib or GlobalWorkerOptions not available.");
                         }
                    } catch(workerError) {
                         ztoolkit.log("ERROR: FileHandler - Failed to set pdf.js worker source:", workerError);
                         // 可以尝试不设置 workerSrc 继续，但性能会差很多，或者直接 reject
                         // reject(new Error("Failed to configure PDF worker."));
                         // return;
                    }


                    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                    const pdfDoc = await loadingTask.promise;
                    ztoolkit.log(`FileHandler: PDF loaded with ${pdfDoc.numPages} pages.`);

                    let fullText = "";
                    for (let i = 1; i <= pdfDoc.numPages; i++) {
                        const page = await pdfDoc.getPage(i);
                        const textContent = await page.getTextContent();
                        // textContent.items 是一个包含 { str: string, ... } 对象的数组
                        const pageText = textContent.items.map((item: any) => item.str).join(" ");
                        fullText += pageText + "\n\n"; // 每页后加换行
                    }
                    ztoolkit.log(`FileHandler: Extracted text from PDF (${fullText.length} chars).`);
                    resolve(fullText.trim());
                    // --- 结束 PDF 处理 ---
                } else {
                    // TXT/MD 等文本文件
                    const content = event.target.result as string;
                    ztoolkit.log(`FileHandler: Successfully read text content (${content.length} chars).`);
                    resolve(content);
                }
            } catch (error) {
                ztoolkit.log("ERROR: FileHandler - Error processing file content:", error);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        };

        reader.onerror = (event) => {
            ztoolkit.log("ERROR: FileHandler - FileReader error:", reader.error);
            reject(new Error(`FileReader error: ${reader.error?.message || 'Unknown error'}`));
        };

        // --- 根据文件类型选择读取方式 ---
        if (file.type === "application/pdf") {
            reader.readAsArrayBuffer(file); // PDF 读取为 ArrayBuffer
        } else if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
            reader.readAsText(file); // 文本读取为 Text
        } else {
            reject(new Error(`Unsupported file type: ${file.type || 'Unknown'}`));
        }
    });
}