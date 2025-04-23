// src/utils/prefs.ts
import { config } from "../../package.json";
import { ModelConfig } from "../modules/modelManager"; // <--- 导入 ModelConfig 接口

type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];

const PREFS_PREFIX = config.prefsPrefix;

/**
 * Get preference value.
 * Wrapper of `Zotero.Prefs.get`.
 * @param key
 */
export function getPref<K extends keyof PluginPrefsMap>(key: K) {
  // 添加日志记录获取的键
  // ztoolkit.log(`Prefs: Getting pref - ${PREFS_PREFIX}.${key}`);
  try {
      const value = Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true);
      // ztoolkit.log(`Prefs: Got value for ${key}:`, value);
      return value as PluginPrefsMap[K];
  } catch (e) {
      ztoolkit.log(`ERROR: Prefs - Failed to get pref ${key}:`, e);
      // 根据键的类型返回一个合理的默认值或抛出错误
      // 这里简单返回 undefined，让调用者处理
      return undefined;
  }
}

/**
 * Set preference value.
 * Wrapper of `Zotero.Prefs.set`.
 * @param key
 * @param value
 */
export function setPref<K extends keyof PluginPrefsMap>(
  key: K,
  value: PluginPrefsMap[K],
) {
  // 添加日志记录设置的键和值
  // ztoolkit.log(`Prefs: Setting pref - ${PREFS_PREFIX}.${key} to:`, value);
  try {
      return Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
  } catch (e) {
      ztoolkit.log(`ERROR: Prefs - Failed to set pref ${key}:`, e);
      return false; // 或抛出错误
  }
}

/**
 * Clear preference value.
 * Wrapper of `Zotero.Prefs.clear`.
 * @param key
 */
export function clearPref(key: keyof PluginPrefsMap) { // <--- 明确 key 的类型
  // 添加日志记录清除的键
  // ztoolkit.log(`Prefs: Clearing pref - ${PREFS_PREFIX}.${key}`);
  try {
      return Zotero.Prefs.clear(`${PREFS_PREFIX}.${key}`, true);
  } catch (e) {
      ztoolkit.log(`ERROR: Prefs - Failed to clear pref ${key}:`, e);
      return false; // 或抛出错误
  }
}

/**
 * 安全获取首选项，如果不存在或发生错误则返回默认值
 */
function getSafePref<T>(key: keyof PluginPrefsMap, defaultValue: T): T { // <--- 明确 key 的类型
  try {
    const value = getPref(key); // 使用我们自己的 getPref
    return value === undefined ? defaultValue : (value as T);
  } catch (e) {
    // getPref 内部已经记录了错误
    return defaultValue;
  }
}

// --- 弃用 getAIChatConfig ---
/*
// 获取所有 AI 配置
export function getAIChatConfig() {
  const tempInt = getPref("temperature"); // 读取存储的整数 (int*10)
  ztoolkit.log(`getAIChatConfig: Raw temperature pref (int*10): ${tempInt}`); // 添加日志

  // 计算实际的浮点温度值
  let temperatureFloat: number;
  if (typeof tempInt === 'number' && Number.isInteger(tempInt)) {
    temperatureFloat = tempInt / 10.0; // 缩小10倍
    // 确保值在合理范围，防止存储错误导致异常值传递给 API
    if (temperatureFloat < 0 || temperatureFloat > 2) {
      ztoolkit.log(`getAIChatConfig: Calculated temp ${temperatureFloat} out of range, using default 0.7`);
      temperatureFloat = 0.7;
    }
  } else {
    // 如果读取的值无效，使用默认值
    ztoolkit.log(`getAIChatConfig: Invalid stored temp, using default 0.7`);
    temperatureFloat = 0.7;
  }
  ztoolkit.log(`getAIChatConfig: Returning temperature float: ${temperatureFloat}`); // 添加日志

  // 安全获取embedding模型配置
  const useEmbeddingModel = getSafePref<boolean>("useEmbeddingModel", false);
  
  // 根据是否启用embedding模型返回不同的配置
  const result = {
    apiKey: getPref("apiKey"),
    apiEndpoint: getPref("apiEndpoint"),
    modelName: getPref("modelName"),
    temperature: temperatureFloat,
    systemPrompt: getPref("systemPrompt"),
    useEmbeddingModel
  };
  
  // 如果启用了embedding模型，添加相关配置
  if (useEmbeddingModel) {
    return {
      ...result,
      embeddingApiKey: getSafePref<string>("embeddingApiKey", ""),
      embeddingApiEndpoint: getSafePref<string>("embeddingApiEndpoint", ""),
      embeddingModelName: getSafePref<string>("embeddingModelName", "")
    };
  }
  
  return result;
}

export type AIChatConfig = ReturnType<typeof getAIChatConfig>;
*/

// --- 新增：获取 RAG 相关配置 ---
export interface RagConfig {
  useRag: boolean;
  embeddingApiKey: string;
  embeddingApiEndpoint: string;
  embeddingModelName: string;
  embeddingDimensions?: number;
}

export function getRagConfig(): RagConfig {
  const useRag = getSafePref("useRag", false); // 默认禁用 RAG

  // 只有在启用 RAG 时才获取其他 Embedding 配置
  if (useRag) {
      return {
          useRag: true,
          embeddingApiKey: getSafePref("embeddingApiKey", ""),
          embeddingApiEndpoint: getSafePref("embeddingApiEndpoint", "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"), // 提供默认值
          embeddingModelName: getSafePref("embeddingModelName", "text-embedding-v3"), // 提供默认值
          embeddingDimensions: getSafePref("embeddingDimensions", undefined), // 维度是可选的
      };
  } else {
      // 如果禁用 RAG，返回禁用状态，其他值为空或默认
      return {
          useRag: false,
          embeddingApiKey: "",
          embeddingApiEndpoint: "",
          embeddingModelName: "",
          embeddingDimensions: undefined,
      };
  }
}