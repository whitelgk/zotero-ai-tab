// src/utils/chatHistoryStorage.ts (初步使用 Prefs)
import { getPref, setPref, clearPref } from "./prefs";

interface ChatMessage { role: "user" | "assistant"; content: string; }
const SESSION_LIST_KEY = "chatSessionList"; // 存储会话 ID 列表的 Pref Key
const SESSION_PREFIX = "chatHistory."; // 每个会话历史的 Pref Key 前缀
const SESSION_NAME_PREFIX = "chatName."; // (可选) 存储会话名称的前缀

// 获取所有会话 ID
export function getSessionList(): string[] {
    try {
        const listJson = getPref(SESSION_LIST_KEY as any) as string | undefined;
        return listJson ? JSON.parse(listJson) : [];
    } catch (e) {
        ztoolkit.log("Error getting session list:", e);
        return [];
    }
}

// 保存会话 ID 列表
function saveSessionList(list: string[]) {
    try {
        setPref(SESSION_LIST_KEY as any, JSON.stringify(list));
    } catch (e) {
        ztoolkit.log("Error saving session list:", e);
    }
}

// 创建新会话
export function createNewSession(): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const list = getSessionList();
    list.push(sessionId);
    saveSessionList(list);
    // (可选) 设置默认名称
    setSessionName(sessionId, `对话 ${new Date().toLocaleString()}`);
    return sessionId;
}

// 加载聊天记录
export function loadChatHistory(sessionId: string): ChatMessage[] {
    try {
        const historyJson = getPref((SESSION_PREFIX + sessionId) as any) as string | undefined;
        return historyJson ? JSON.parse(historyJson) : [];
    } catch (e) {
        ztoolkit.log(`Error loading chat history for ${sessionId}:`, e);
        return [];
    }
}

// 保存聊天记录
export function saveChatHistory(sessionId: string, history: ChatMessage[]) {
    try {
        setPref((SESSION_PREFIX + sessionId) as any, JSON.stringify(history));
    } catch (e) {
        ztoolkit.log(`Error saving chat history for ${sessionId}:`, e);
    }
}

// 删除会话
export function deleteSession(sessionId: string) {
    try {
        clearPref((SESSION_PREFIX + sessionId) as any); // 删除历史记录
        clearPref((SESSION_NAME_PREFIX + sessionId) as any); // (可选) 删除名称
        const list = getSessionList();
        const newList = list.filter(id => id !== sessionId);
        saveSessionList(newList);
    } catch (e) {
        ztoolkit.log(`Error deleting session ${sessionId}:`, e);
    }
}

 // (可选) 获取会话名称
export function getSessionName(sessionId: string): string {
    try {
        return getPref((SESSION_NAME_PREFIX + sessionId) as any) as string || `对话 ${sessionId.substring(8, 12)}`; // 默认名称
    } catch {
        return `对话 ${sessionId.substring(8, 12)}`;
    }
}

// (可选) 设置会话名称
export function setSessionName(sessionId: string, name: string) {
    try {
        setPref((SESSION_NAME_PREFIX + sessionId) as any, name);
    } catch (e) {
        ztoolkit.log(`Error setting session name for ${sessionId}:`, e);
    }
}