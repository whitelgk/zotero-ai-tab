// src/utils/prefs.ts
import { config } from "../../package.json";

type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];

const PREFS_PREFIX = config.prefsPrefix;

/**
 * Get preference value.
 * Wrapper of `Zotero.Prefs.get`.
 * @param key
 */
export function getPref<K extends keyof PluginPrefsMap>(key: K) {
  return Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true) as PluginPrefsMap[K];
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
  return Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
}

/**
 * Clear preference value.
 * Wrapper of `Zotero.Prefs.clear`.
 * @param key
 */
export function clearPref(key: string) {
  return Zotero.Prefs.clear(`${PREFS_PREFIX}.${key}`, true);
}

/**
 * 安全获取首选项，如果不存在或发生错误则返回默认值
 */
function getSafePref<T>(key: string, defaultValue: T): T {
  try {
    const value = Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true);
    return value === undefined ? defaultValue : (value as T);
  } catch (e) {
    ztoolkit.log(`getSafePref: Error getting ${key}, using default:`, e);
    return defaultValue;
  }
}

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