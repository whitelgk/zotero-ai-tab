// addon/prefs.js
/* eslint-disable no-undef */
pref("apiKey", ""); // API Key (敏感信息，考虑更好的存储方式，但 prefs 是最简单的起点)
pref("apiEndpoint", "https://api.openai.com/v1/chat/completions"); // 默认 OpenAI 端点
//pref("modelName", "gpt-3.5-turbo"); // 默认模型
pref("temperature", 7); // 默认温度
pref("systemPrompt", "You are a helpful assistant integrated into Zotero. Be concise and focus on academic tasks."); // 默认系统提示prompt
// 特定模型 Keys
pref("apiKeyQwen", "");
pref("apiKeyDeepseek", "");
// ... 其他模型 keys ...

// 模型选择
pref("currentModelId", "gpt-4o"); // 你的默认模型 ID

// RAG 设置
pref("useRag", false); // 默认关闭
pref("embeddingApiKey", "");
pref("embeddingApiEndpoint", "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"); // 你的默认值
pref("embeddingModelName", "text-embedding-v3"); // 你的默认值
pref("embeddingDimensions", 1024); // 默认维度或留空 ''

// 自定义按钮 (默认值可以是一个空数组的 JSON 字符串)
pref("customButtons", "[]");

// 聊天历史
pref("lastUsedSessionId", "");
pref("chatSessionList", "[]");
// chatHistory.xxx 和 chatName.xxx 是动态生成的，不需要在这里定义默认值