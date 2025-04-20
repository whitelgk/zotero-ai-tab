// addon/prefs.js
/* eslint-disable no-undef */
pref("apiKey", ""); // API Key (敏感信息，考虑更好的存储方式，但 prefs 是最简单的起点)
pref("apiEndpoint", "https://api.openai.com/v1/chat/completions"); // 默认 OpenAI 端点
pref("modelName", "gpt-3.5-turbo"); // 默认模型
pref("temperature", 7); // 默认温度
pref("systemPrompt", "You are a helpful assistant integrated into Zotero. Be concise and focus on academic tasks."); // 默认系统提示prompt
