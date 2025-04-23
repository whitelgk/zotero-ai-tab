// src/modules/modelManager.ts
import { getPref, setPref } from "../utils/prefs";

// 定义模型配置的接口
export interface ModelConfig {
    id: string; // 唯一标识符, e.g., "gpt-4o", "qwen-vl-max"
    name: string; // 用户友好的显示名称, e.g., "GPT-4o", "通义千问-VL"
    type: "text" | "multimodal"; // 模型类型
    apiEndpoint?: string; // 此模型特定的 Endpoint (可选, 覆盖全局设置)
    apiKeyPref?: string; // 此模型特定的 API Key Prefs 键名 (可选, 覆盖全局设置)
    modelIdentifier: string; // 调用 API 时使用的模型名称/ID
    // 可以添加其他模型特有的属性，例如上下文窗口大小等
}

// --- 模型列表 ---
// 这里硬编码一些示例模型，你可以根据需要修改或从配置加载
// !! 注意：你需要确保用户在设置中为这些模型配置了对应的 API Key 和 Endpoint !!
// !! apiKeyPref 指向的是 Zotero Prefs 中的键名后缀，例如 'apiKeyOpenAI', 'apiKeyQwen' !!
const SUPPORTED_MODELS: ModelConfig[] = [
    {
        id: "deepseek-v3",
        name: "DeepSeek V3 阿里云",
        type: "text",
        apiKeyPref: "apiKey", 
        apiEndpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", 
        modelIdentifier: "deepseek-v3"
    },
    {
        id: "deepseek-reasoner",
        name: "DeepSeek-R1",
        type: "text",
        apiKeyPref: "apiKey", 
        apiEndpoint: "https://api.deepseek.com/chat/completions", 
        modelIdentifier: "deepseek-reasoner"
    },
    {
        id: "gpt-4o",
        name: "GPT-4o (OpenAI)",
        type: "multimodal", // GPT-4o 支持多模态
        apiKeyPref: "apiKey", // 假设使用全局 apiKey
        modelIdentifier: "gpt-4o"
    },
    {
        id: "qwen-max-latest",
        name: "通义千问-Max (阿里云)",
        type: "text",
        apiKeyPref: "apiKey",
        apiEndpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", // 示例 Endpoint
        modelIdentifier: "qwen-max-latest" // 示例模型标识符
    },
    
    // ... 可以添加更多模型 ...
];

const CURRENT_MODEL_ID_KEY = "currentModelId"; // Prefs key for storing the selected model ID
const DEFAULT_MODEL_ID = "gpt-4o"; // 默认选择的模型 ID

/**
 * 获取所有支持的模型配置列表
 * @param type 可选，过滤模型类型 'text' 或 'multimodal'
 * @returns 模型配置数组
 */
export function getSupportedModels(type?: "text" | "multimodal"): ModelConfig[] {
    if (type) {
        return SUPPORTED_MODELS.filter(model => model.type === type);
    }
    return [...SUPPORTED_MODELS]; // 返回副本防止外部修改
}

/**
 * 根据 ID 获取模型配置
 * @param modelId 模型 ID
 * @returns 模型配置对象，如果找不到则返回 undefined
 */
export function getModelConfigById(modelId: string): ModelConfig | undefined {
    return SUPPORTED_MODELS.find(model => model.id === modelId);
}

/**
 * 获取当前选中的模型 ID
 * @returns 当前选中的模型 ID，如果未设置或无效则返回默认 ID
 */
export function getCurrentModelId(): string {
    const storedId = getPref(CURRENT_MODEL_ID_KEY as any) as string | undefined;
    // 检查存储的 ID 是否在支持列表中，如果不在则返回默认值
    if (storedId && SUPPORTED_MODELS.some(model => model.id === storedId)) {
        return storedId;
    }
    return DEFAULT_MODEL_ID; // 返回默认模型 ID
}

/**
 * 设置当前选中的模型 ID
 * @param modelId 要设置的模型 ID
 */
export function setCurrentModelId(modelId: string) {
    // 验证 modelId 是否有效
    if (SUPPORTED_MODELS.some(model => model.id === modelId)) {
        setPref(CURRENT_MODEL_ID_KEY as any, modelId);
        ztoolkit.log(`ModelManager: Current model set to ${modelId}`);
    } else {
        ztoolkit.log(`ERROR: ModelManager - Attempted to set invalid model ID: ${modelId}`);
    }
}

/**
 * 获取当前选中的模型的完整配置
 * @returns 当前模型的配置对象，如果找不到则返回默认模型的配置
 */
export function getCurrentModelConfig(): ModelConfig {
    const modelId = getCurrentModelId();
    const config = getModelConfigById(modelId);
    if (config) {
        return config;
    }
    // 如果当前选中的 ID 无效（理论上不应发生，因为 getCurrentModelId 有默认值），返回默认配置
    return getModelConfigById(DEFAULT_MODEL_ID)!; // 使用 ! 断言默认模型一定存在
}

/**
 * 获取指定模型的 API Key
 * @param modelId 模型 ID
 * @returns API Key 字符串，如果未配置则返回空字符串
 */
export function getApiKeyForModel(modelId: string): string {
    const config = getModelConfigById(modelId);
    const apiKeyPrefKey = config?.apiKeyPref || "apiKey"; // 优先使用模型特定 Key，否则用全局 Key
    try {
        return getPref(apiKeyPrefKey as any) as string || "";
    } catch (e) {
        ztoolkit.log(`Error getting API key for pref ${apiKeyPrefKey}:`, e);
        return "";
    }
}

/**
 * 获取指定模型的 API Endpoint
 * @param modelId 模型 ID
 * @returns API Endpoint 字符串，如果未配置则返回全局 Endpoint
 */
export function getEndpointForModel(modelId: string): string {
    const config = getModelConfigById(modelId);
    // 优先使用模型特定 Endpoint，否则用全局 Endpoint
    if (config?.apiEndpoint) {
        return config.apiEndpoint;
    }
    try {
        return getPref("apiEndpoint" as any) as string || ""; // 回退到全局设置
    } catch (e) {
        ztoolkit.log("Error getting global API endpoint:", e);
        return "";
    }
}