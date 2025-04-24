// typings/custom-types.d.ts

// 定义单个 AI 配置方案的结构
interface AIConfigProfile {
    name: string;
    apiKey: string;
    apiEndpoint: string;
    modelName: string;
    temperature: number; // 存储时仍为 int*10
    systemPrompt: string;
  }
  
  // 定义存储所有配置方案和活动方案名称的结构
  interface AIConfigProfiles {
    profiles: AIConfigProfile[];
    activeProfileName?: string;
  }
  
  // 扩展 Zotero 的 Prefs 类型
  declare namespace _ZoteroTypes {
    interface Prefs {
      PluginPrefsMap: {
        // 只添加新的或需要覆盖类型的键
        "aiConfigProfiles"?: string; // 存储为 JSON 字符串
        "useEmbeddingModel"?: boolean;
        "embeddingApiKey"?: string;
        "embeddingApiEndpoint"?: string;
        "embeddingModelName"?: string;
        "customButtons"?: string;
        "chatSessionList"?: string;
        [key: string]: any; // 保留动态 key
      };
    }
  }
  
  // 将接口暴露到全局，以便 prefs.ts 可以访问
  // （或者在 prefs.ts 中使用相对路径导入这个文件）
  declare global {
      interface globalThis {
          AIConfigProfile: AIConfigProfile;
          AIConfigProfiles: AIConfigProfiles;
      }
  }
