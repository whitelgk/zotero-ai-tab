// src/modules/aiService.ts
import { getAIChatConfig } from "../utils/prefs"; // 从偏好设置中获取 AI 配置
import { getString } from "../utils/locale"; // 用于本地化字符串

// 定义聊天消息接口
interface ChatMessage {
    role: "system" | "user" | "assistant"; // 消息角色：系统、用户或助手
    content: string; // 消息内容
}

// 定义 AI 响应格式的接口（可选但推荐，用于替代 `as any`）
interface AIResponseFormat {
    choices?: { // AI 返回的选择项
        message?: { // 每条消息
            content?: string; // 消息内容
        };
    }[];
    error?: { // 错误信息
        message?: string; // 错误消息
        type?: string; // 错误类型
        param?: any; // 错误参数
        code?: string; // 错误代码
    };
}

// 文本分块接口（可用于分块处理文本）
interface TextChunk {
    content: string; // 文本内容
    // 可添加其他元数据，如位置信息等
}

/**
 * 向配置的 AI 服务发送消息并获取回复。
 * @param messages 包含系统提示和对话历史的消息数组
 * @returns AI 的回复字符串
 * @throws 如果配置缺失、网络错误、API 错误或响应格式无效，则抛出 Error 对象
 */
export async function getCompletion(messages: ChatMessage[]): Promise<string> {
    let config;
    try {
        config = getAIChatConfig(); // 从偏好设置中获取 AI 配置
        ztoolkit.log("getCompletion: AI Config obtained:", JSON.stringify(config));
    } catch (e) {
        const errorMsg = "Error getting AI configuration from preferences."; // 配置获取失败
        ztoolkit.log("ERROR:", errorMsg, e);
        throw new Error(errorMsg); // 获取配置失败，直接抛错
    }

    // 检查 API Key 和 Endpoint 是否配置
    if (!config.apiKey) {
        const errorMsg = getString("error-missing-apikey") || "Error: API Key not configured in preferences."; // 报错API Key 缺失
        ztoolkit.log("ERROR:", errorMsg);
        throw new Error(errorMsg);
    }
    if (!config.apiEndpoint) {
        const errorMsg = getString("error-missing-endpoint") || "Error: API Endpoint not configured in preferences."; // 报错API Endpoint 缺失
        ztoolkit.log("ERROR:", errorMsg);
        throw new Error(errorMsg);
    }

    // 构建请求头
    const headers = {
        "Content-Type": "application/json", // 内容类型为 JSON
        "Authorization": `Bearer ${config.apiKey}`, // 使用 API Key 进行认证
    };

    // 构建请求体
    const body = JSON.stringify({
        model: config.modelName || "gpt-3.5-turbo", // 默认模型为 gpt-3.5-turbo
        messages: messages, // 消息数组
        temperature: config.temperature, // 确保这是正确的浮点数
    });
    ztoolkit.log("Constructed request body:", body);

    try {
        ztoolkit.log("Sending request to AI (fetch):", { endpoint: config.apiEndpoint, model: config.modelName, temp: config.temperature });

        // 发送 fetch 请求
        const response = await fetch(config.apiEndpoint, {
            method: "POST", // 请求方法为 POST
            headers: headers, // 请求头
            body: body, // 请求体
        });

        ztoolkit.log(`Received fetch response status: ${response.status}`);

        // 检查 HTTP 状态码
        if (!response.ok) {
            let errorData: any = {}; // 存储可能的 JSON 错误体
            let errorText = `${response.status} ${response.statusText}`; // 初始错误文本
            try {
                // 尝试解析 JSON 错误体
                errorData = await response.json();
                const message = (errorData as AIResponseFormat)?.error?.message || '';
                if (message) {
                    errorText += `. ${message}`; // 添加错误消息
                }
                ztoolkit.log("Parsed API error response:", errorData);
            } catch (e) {
                // 如果解析 JSON 失败，尝试获取原始文本
                try {
                    const text = await response.text();
                    errorText += `. ${text}`; // 添加原始文本
                    ztoolkit.log("Failed to parse error JSON, raw response text:", text);
                } catch (e2) {
                    ztoolkit.log("Failed to parse error JSON and failed to get raw text.");
                }
            }
            ztoolkit.log("ERROR:", `API Error (fetch): ${errorText}`, errorData);
            throw new Error(errorText); // 抛出包含详细信息的错误
        }

        // 如果请求成功 (status 2xx)
        let data: AIResponseFormat; // 使用我们定义的接口类型
        try {
            data = await response.json() as AIResponseFormat; // 解析 JSON 响应
            ztoolkit.log("Received and parsed successful response from AI (fetch):", data);
        } catch (e: any) {
            ztoolkit.log("ERROR:", "Failed to parse successful JSON response:", e, await response.text().catch(() => "")); // 记录原始文本（如果可能）
            throw new Error(`Error parsing successful AI response: ${e.message || 'Unknown parsing error'}`);
        }

        // 检查响应结构并提取内容
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
            return content.trim(); // 返回提取到的内容
        } else {
            ztoolkit.log("ERROR:", "Invalid successful API response structure (fetch)", data);
            throw new Error(getString("error-invalid-response") || "Error: Received invalid response structure from AI."); // 抛出结构错误
        }

    } catch (error: any) {
        // 捕获 fetch 本身的错误 (如网络问题) 或上面抛出的错误
        ztoolkit.log("ERROR:", "Failed during fetch or response processing", error);
        // 重新抛出错误，如果已经是 Error 对象就直接抛，否则包装一下
        if (error instanceof Error) {
            // 可以附加网络错误的本地化字符串，但保留原始错误信息
            const baseMessage = getString("error-network") || "Error: Network request failed.";
            error.message = `${baseMessage} ${error.message}`;
            throw error;
        } else {
            throw new Error(getString("error-network") || `Error: Network request failed. ${String(error)}`);
        }
    }
}

