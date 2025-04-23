// src/modules/aiService.ts
//import { getAIChatConfig } from "../utils/prefs"; // 从偏好设置中获取 AI 配置
import { getString } from "../utils/locale"; // 用于本地化字符串
import { ModelConfig, getApiKeyForModel, getEndpointForModel } from "./modelManager"; // <--- 导入模型配置和获取函数

// --- 接口定义 (保持或调整) ---

// 标准文本消息
interface ChatMessage {
    role: "system" | "user" | "assistant"; // 消息角色：系统、用户或助手
    content: string; // 消息内容
}

// 多模态消息内容部分
interface TextContentPart { type: "text"; text: string; }
interface ImageContentPart { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto"; }; }
type VisionMessageContent = (TextContentPart | ImageContentPart)[];

// 支持多模态的消息接口
interface VisionChatMessage {
    role: "system" | "user" | "assistant";
    content: string | VisionMessageContent; // content 可以是字符串或数组
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
 * 向指定的 AI 服务发送消息并获取回复。
 * @param messages 包含系统提示和对话历史的消息数组 (可以是纯文本或多模态)
 * @param modelConfig 当前要使用的模型配置对象
 * @param systemPrompt 系统提示词 (从 prefs 或其他地方传入)
 * @param temperature 温度参数 (从 prefs 或其他地方传入)
 * @returns AI 的回复字符串
 * @throws 如果配置缺失、网络错误、API 错误或响应格式无效，则抛出 Error 对象
 */
export async function getCompletion(
    messages: (TextChatMessage | VisionChatMessage)[], // 接受两种消息类型
    modelConfig: ModelConfig,
    systemPrompt: string,
    temperature: number
): Promise<string> {

    ztoolkit.log("llmService: getCompletion called with model:", modelConfig.id);

    // --- 1. 获取 API Key 和 Endpoint ---
    const apiKey = getApiKeyForModel(modelConfig.id);
    const apiEndpoint = getEndpointForModel(modelConfig.id);

    if (!apiKey) {
        const errorMsg = getString("error-missing-apikey") + ` (for model: ${modelConfig.name})`;
        ztoolkit.log("ERROR:", errorMsg);
        throw new Error(errorMsg);
    }
    if (!apiEndpoint) {
        const errorMsg = getString("error-missing-endpoint") + ` (for model: ${modelConfig.name})`;
        ztoolkit.log("ERROR:", errorMsg);
        throw new Error(errorMsg);
    }
    ztoolkit.log(`llmService: Using Endpoint: ${apiEndpoint}, Model Identifier: ${modelConfig.modelIdentifier}`);

    // 构建请求头
    const headers = {
        "Content-Type": "application/json", // 内容类型为 JSON
        "Authorization": `Bearer ${apiKey}`, // 使用 API Key 进行认证
    };

    // --- 3. 构建发送给 API 的消息列表 (添加系统提示) ---
    // 注意：我们需要确保 messages 数组中的类型与 modelConfig.type 匹配
    // 但这里为了简化，暂时假设调用者 (chatLogic) 已经传入了正确的格式
    const messagesToSend: (TextChatMessage | VisionChatMessage)[] = [
        { role: "system", content: systemPrompt || "You are a helpful assistant." },
        ...messages, // 传入的对话历史和当前用户消息
    ];

    // --- 4. 构建请求体 ---
    const bodyPayload: any = {
        model: modelConfig.modelIdentifier, // 使用 modelConfig 中的标识符
        messages: messagesToSend,
        temperature: temperature,
        // 可以根据需要添加其他 API 支持的参数，如 max_tokens, top_p 等
        // if (modelConfig.id === 'some-model-with-specific-param') {
        //     bodyPayload.specificParam = 'value';
        // }
    };

    // 对于某些 API (如阿里云通义千问)，可能需要在顶层传递参数
    // if (apiEndpoint.includes("dashscope.aliyuncs.com")) {
    //     bodyPayload = {
    //         model: modelConfig.modelIdentifier,
    //         input: { messages: messagesToSend },
    //         parameters: { temperature: temperature }
    //     };
    //     // 注意：通义的多模态 API 可能有不同的结构，需要查阅其文档
    // }


    const body = JSON.stringify(bodyPayload);
    ztoolkit.log("llmService: Constructed request body:", body); // 注意：日志中可能包含敏感信息（如消息内容）

    // --- 5. 发送请求并处理响应 (与之前类似) ---
    try {
        ztoolkit.log("llmService: Sending fetch request...");
        const response = await fetch(apiEndpoint, {
            method: "POST",
            headers: headers,
            body: body,
        });
        ztoolkit.log(`llmService: Received fetch response status: ${response.status}`);

        if (!response.ok) {
            // ... (错误处理逻辑，基本不变，可以加上 modelConfig.name 方便定位) ...
            let errorData: any = {};
            let errorText = `${response.status} ${response.statusText} (Model: ${modelConfig.name})`;
             try {
                errorData = await response.json();
                const message = (errorData as AIResponseFormat)?.error?.message || '';
                if (message) errorText += `. ${message}`;
            } catch (e) { /* ... */ }
            ztoolkit.log("ERROR:", `API Error (fetch): ${errorText}`, errorData);
            throw new Error(errorText);
        }

        let data: AIResponseFormat;
        try {
            data = await response.json() as AIResponseFormat;
            ztoolkit.log("llmService: Parsed successful response:", data);
        } catch (e: any) {
             ztoolkit.log("ERROR:", "Failed to parse successful JSON response:", e);
            throw new Error(`Error parsing successful AI response: ${e.message || 'Unknown parsing error'}`);
        }

        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
            return content.trim();
        } else {
            ztoolkit.log("ERROR:", "Invalid successful API response structure (fetch)", data);
            throw new Error(getString("error-invalid-response") || "Error: Received invalid response structure from AI.");
        }

    } catch (error: any) {
        ztoolkit.log("ERROR:", "llmService: Failed during fetch or response processing", error);
        if (error instanceof Error) {
            const baseMessage = getString("error-network") || "Error: Network request failed.";
            // 避免重复添加 "Network request failed"
            if (!error.message.startsWith(baseMessage)) {
                 error.message = `${baseMessage} ${error.message}`;
            }
            throw error;
        } else {
            throw new Error(getString("error-network") || `Error: Network request failed. ${String(error)}`);
        }
    }
}

