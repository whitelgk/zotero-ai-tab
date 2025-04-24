// src/utils/prefs.ts
import { config } from "../../package.json";

// --- 从 typings/prefs.d.ts 导入接口 ---
type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];
type AIConfigProfile = globalThis.AIConfigProfile; // 使用 globalThis 访问全局类型
type AIConfigProfiles = globalThis.AIConfigProfiles; // 使用 globalThis 访问全局类型
// --- 结束导入 ---

const PREFS_PREFIX = config.prefsPrefix;
const PROFILES_KEY = `${PREFS_PREFIX}.aiConfigProfiles`;

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

// --- 新增：获取所有 AI 配置方案 ---
export function getAIConfigProfiles(): AIConfigProfiles {
  const defaultValue: AIConfigProfiles = { profiles: [], activeProfileName: undefined };
  try {
      const jsonString = Zotero.Prefs.get(PROFILES_KEY, true) as string | undefined;
      if (jsonString) {
          const parsed = JSON.parse(jsonString);
          // 基本验证，确保至少有 profiles 数组
          if (parsed && Array.isArray(parsed.profiles)) {
              return parsed;
          }
      }
      return defaultValue;
  } catch (e) {
      ztoolkit.log("Error getting or parsing AI Config Profiles, returning default:", e);
      return defaultValue;
  }
}

// --- 新增：保存所有 AI 配置方案 ---
export function saveAIConfigProfiles(profilesData: AIConfigProfiles): boolean {
  try {
      const jsonString = JSON.stringify(profilesData);
      Zotero.Prefs.set(PROFILES_KEY, jsonString, true);
      return true;
  } catch (e) {
      ztoolkit.log("Error saving AI Config Profiles:", e);
      return false;
  }
}

// --- 新增：根据名称获取单个配置方案 ---
// (注意：返回的 temperature 仍是 int*10)
export function getAIConfigByName(name: string): AIConfigProfile | undefined {
  const profilesData = getAIConfigProfiles();
  return profilesData.profiles.find(p => p.name === name);
}


// --- 重构：获取当前活动的 AI 配置 ---
// 这个函数现在负责决定使用哪个配置方案
export function getActiveAIConfig() {
  const profilesData = getAIConfigProfiles();
  let activeProfile: AIConfigProfile | undefined = undefined;

  // 1. 尝试根据 activeProfileName 查找
  if (profilesData.activeProfileName) {
      activeProfile = profilesData.profiles.find(p => p.name === profilesData.activeProfileName);
      if (activeProfile) {
           ztoolkit.log(`getActiveAIConfig: Found active profile by name: ${profilesData.activeProfileName}`);
      } else {
           ztoolkit.log(`getActiveAIConfig: Active profile name "${profilesData.activeProfileName}" not found in profiles.`);
      }
  } else {
       ztoolkit.log(`getActiveAIConfig: No active profile name set.`);
  }

  // 2. 如果找不到活动的，或者没有设置活动名称，尝试使用第一个配置
  if (!activeProfile && profilesData.profiles.length > 0) {
      activeProfile = profilesData.profiles[0];
      ztoolkit.log(`getActiveAIConfig: Using first available profile: ${activeProfile.name}`);
      // (可选) 将第一个设为活动配置并保存？看需求
      // profilesData.activeProfileName = activeProfile.name;
      // saveAIConfigProfiles(profilesData);
  }

  // 3. 如果连第一个配置都没有，使用硬编码的默认值或旧的独立 Prefs 值
  if (!activeProfile) {
      ztoolkit.log(`getActiveAIConfig: No profiles found, using fallback default values.`);
      activeProfile = {
          name: "Default (Fallback)", // 给个名字
          apiKey: getPref("apiKey") || "", // 从旧 Prefs 读取
          apiEndpoint: getPref("apiEndpoint") || "https://api.openai.com/v1/chat/completions",
          modelName: getPref("modelName") || "gpt-3.5-turbo",
          temperature: getPref("temperature") || 7, // 旧的 int*10
          systemPrompt: getPref("systemPrompt") || "You are a helpful assistant."
      };
  }

  // --- 处理温度值 (从 int*10 转换为 float) ---
  const tempInt = activeProfile.temperature;
  let temperatureFloat: number;
  if (typeof tempInt === 'number' && Number.isInteger(tempInt)) {
      temperatureFloat = tempInt / 10.0;
      if (temperatureFloat < 0 || temperatureFloat > 2) {
          ztoolkit.log(`getActiveAIConfig: Calculated temp ${temperatureFloat} for profile "${activeProfile.name}" out of range, using default 0.7`);
          temperatureFloat = 0.7;
      }
  } else {
      ztoolkit.log(`getActiveAIConfig: Invalid stored temp for profile "${activeProfile.name}", using default 0.7`);
      temperatureFloat = 0.7;
  }
  ztoolkit.log(`getActiveAIConfig: Returning config for "${activeProfile.name}" with temp float: ${temperatureFloat}`);
  // --- 结束温度处理 ---

  // --- (可选) 处理 Embedding 配置 ---
  const useEmbeddingModel = getSafePref<boolean>("useEmbeddingModel", false);
  const baseResult = {
      // 返回处理后的配置，确保 temperature 是浮点数
      apiKey: activeProfile.apiKey,
      apiEndpoint: activeProfile.apiEndpoint,
      modelName: activeProfile.modelName,
      temperature: temperatureFloat, // 使用转换后的浮点数
      systemPrompt: activeProfile.systemPrompt,
      useEmbeddingModel
  };

  if (useEmbeddingModel) {
      return {
          ...baseResult,
          embeddingApiKey: getSafePref<string>("embeddingApiKey", ""),
          embeddingApiEndpoint: getSafePref<string>("embeddingApiEndpoint", ""),
          embeddingModelName: getSafePref<string>("embeddingModelName", "")
      };
  }
  return baseResult;
}


// 导出新的类型，方便其他模块使用
export type { AIConfigProfile, AIConfigProfiles };
// 导出修改后的配置类型
export type ActiveAIConfig = ReturnType<typeof getActiveAIConfig>;
