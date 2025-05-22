// src/modules/chatLogic.ts
import { ChatUIElements, addMessageToDisplay, showThinkingIndicator, updateInputState } from "./chatUI"; // 导入 UI 更新函数
import * as llmService from "./llmService"; // 导入 LLM 服务
import {
    ActiveAIConfig, // 导入活动配置类型
    getActiveAIConfig, // 导入获取活动配置的函数
    getAIConfigProfiles, // 获取所有配置
    saveAIConfigProfiles, // 保存配置（用于更新 activeProfileName）
    getAIConfigByName, // 根据名称获取配置
    AIConfigProfile // 导入配置类型
} from "../utils/prefs"; // 导入 AI 配置类型
import { getPref, setPref } from "../utils/prefs"; // 用于获取首选项
import * as textUtils from "../utils/textUtils"; // 导入文本工具
import * as chatHistoryStorage from "../utils/chatHistoryStorage"; // <--- 引入存储模块

// --- 模块级状态变量 ---
let currentUIElements: ChatUIElements | null = null; // 当前激活的 UI 元素引用
let currentConfig: ActiveAIConfig | null = null; // 使用新的类型
let currentSessionId: string | null = null; // <--- 当前会话 ID
let isSending = false; // 防止重复发送的状态标志
const LAST_SESSION_ID_KEY = "lastUsedSessionId"; // Pref key for last session

/**
 * 初始化聊天逻辑，绑定事件监听器
 * @param uiElements - ChatUI 模块创建的 UI 元素引用
 * @param config - 当前的 AI 配置
 */
export function initChat(uiElements: ChatUIElements) {
    ztoolkit.log("ChatLogic: Initializing chat logic...");
    currentUIElements = uiElements;
    isSending = false; // 重置发送状态

    // --- 新增：获取当前活动的 AI 配置 ---
    try {
        currentConfig = getActiveAIConfig(); // 在内部获取活动配置
        ztoolkit.log("ChatLogic: Initial active AI config loaded:", currentConfig ? 'OK' : 'Failed');
        if (!currentConfig) {
             // 处理无法加载配置的情况，可能显示错误或使用默认值
             addMessageToDisplay(uiElements.chatContainer, "error", "无法加载 AI 配置，请检查偏好设置。");
             // 可以阻止后续初始化或使用一个安全的默认配置
             return;
        }
    } catch (e) {
        ztoolkit.log("ERROR: ChatLogic init - Failed to get active AI config:", e);
        addMessageToDisplay(uiElements.chatContainer, "error", `加载 AI 配置时出错: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }
    // --- 结束新增 ---

    // 确保元素存在
    if (!currentUIElements || !currentUIElements.sendButton || !currentUIElements.chatInput) {
        ztoolkit.log("ERROR: ChatLogic init - Missing required UI elements.");
        return;
    }

    // --- 1. 加载或创建会话 ID ---
    const lastSessionId = getPref(LAST_SESSION_ID_KEY as any) as string | undefined;
    const existingSessions = chatHistoryStorage.getSessionList(); // 获取所有已存在的 session ID
    if (lastSessionId && existingSessions.includes(lastSessionId)) { // 检查 lastSessionId 是否有效
        currentSessionId = lastSessionId;
        ztoolkit.log(`ChatLogic: Loaded last used session ID: ${currentSessionId}`);
    } else {
        currentSessionId = chatHistoryStorage.createNewSession(); // 创建新的
        ztoolkit.log(`ChatLogic: Created new session ID: ${currentSessionId}`);
    }

    // --- 2. 保存当前会话 ID ---
    if (currentSessionId) {
        setPref(LAST_SESSION_ID_KEY as any, currentSessionId);
    } else {
         ztoolkit.log("ERROR: ChatLogic init - Failed to get or create a session ID.");
         // 可能需要显示错误给用户或阻止后续操作
         return;
    }
    if (!currentUIElements) {
        ztoolkit.log("ERROR: ChatLogic init - UI elements not available.");
        return;
    }

    // --- 绑定事件监听器 ---
    // 移除旧监听器 (如果存在)，防止重复绑定
    const sendButton = currentUIElements.sendButton;
    const chatInput = currentUIElements.chatInput;

    // 使用 .onclick 或先 removeEventListener 确保只有一个监听器
    sendButton.onclick = handleSendMessage; // 直接赋值给 onclick
    // 或者:
    // sendButton.removeEventListener("click", handleSendMessage); // 先移除
    // sendButton.addEventListener("click", handleSendMessage); // 再添加

    chatInput.onkeypress = (e: Event) => {
        const keyboardEvent = e as KeyboardEvent; // 类型断言
        if (keyboardEvent.key === "Enter" && !keyboardEvent.shiftKey) {
            keyboardEvent.preventDefault();
            handleSendMessage();
        }
    };
    // 或者:
    // chatInput.removeEventListener("keypress", handleInputKeyPress); // 先移除 (需要将处理函数提取出来)
    // chatInput.addEventListener("keypress", handleInputKeyPress); // 再添加

    // --- 新增：填充并绑定侧边栏配置下拉菜单 ---
    loadAndPopulateSidebarProfiles(uiElements.profileSelectElement);
    uiElements.profileSelectElement.addEventListener('change', handleSidebarProfileChange); // 使用 command 事件 for menulist
    // 如果使用 html:select, 用 'change' 事件:
    // currentUIElements.profileSelectElement.addEventListener('change', handleSidebarProfileChange);
    // --- 结束新增 ---

    // --- 3. 渲染顶部选项栏 ---
    renderOptionsBar(); // 调用新函数来创建按钮

    // --- 4. 加载并显示历史记录 ---
    loadAndDisplayHistory(currentSessionId); // 使用当前 session ID 加载


    // 添加初始欢迎消息
    addMessageToDisplay(currentUIElements.chatContainer, "assistant", "您好！我能为您提供什么帮助？");

    ztoolkit.log("ChatLogic: Initialization complete, event listeners bound.");
}

/**
 * 加载并显示指定会话的聊天记录
 * @param sessionId 要加载的会话 ID
 */
function loadAndDisplayHistory(sessionId: string) {
    if (!currentUIElements || !currentUIElements.chatContainer) {
        ztoolkit.log("ERROR: loadAndDisplayHistory - UI elements not available.");
        return;
    }
    ztoolkit.log(`ChatLogic: Loading history for session ${sessionId}`);

    // 1. 清空当前聊天显示区域
    const container = currentUIElements.chatContainer;
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    // 2. 从存储模块加载历史记录
    const history = chatHistoryStorage.loadChatHistory(sessionId);

    // 3. 使用 chatUI 模块渲染历史记录
    history.forEach(msg => {
        addMessageToDisplay(container, msg.role, msg.content);
    });

    // 4. 如果历史记录为空，显示欢迎消息
    if (history.length === 0) {
        addMessageToDisplay(container, "assistant", "您好！我能为您提供什么帮助？");
    }

    ztoolkit.log(`ChatLogic: Displayed ${history.length} messages for session ${sessionId}`);
}

// --- 新增：填充侧边栏配置下拉菜单 ---
function loadAndPopulateSidebarProfiles(selectElement: HTMLSelectElement) { // 类型改为 HTMLSelectElement
    if (!selectElement) {
        ztoolkit.log("Sidebar select element is not a menulist or not found.");
        return;
    }
    ztoolkit.log("ChatLogic: Populating sidebar profile select...");

    const doc = selectElement.ownerDocument;
    if (!doc) {
         ztoolkit.log("ERROR: Sidebar document not found.");
         return;
    }

    selectElement.options.length = 0; // 清空 select

    const profilesData = getAIConfigProfiles();
    const profiles = profilesData.profiles;
    const activeProfileName = profilesData.activeProfileName;
    let activeIndex = -1;

    if (profiles.length === 0) {
        const item = doc.createElement("option") as HTMLOptionElement;
        item.textContent = "无配置";
        item.value = "";
        item.disabled = true;
        selectElement.appendChild(item);
        activeIndex = 0;
    } else {
        profiles.forEach((profile, index) => {
            const item = doc.createElement("option") as HTMLOptionElement;
            item.textContent = profile.name;
            item.value = profile.name;
            selectElement.appendChild(item);
            if (profile.name === activeProfileName) {
                activeIndex = index;
            }
        });
        if (activeIndex === -1 && profiles.length > 0) {
            activeIndex = 0;
        }
    }

    // --- 设置选中状态 (使用 setTimeout) ---
    if (activeIndex !== -1) {
        selectElement.selectedIndex = activeIndex;
        ztoolkit.log(`Sidebar: Set selectedIndex to ${activeIndex}`);
    }
    
    ztoolkit.log(`ChatLogic: Sidebar profile select populated. Active index: ${'selectedIndex' in selectElement ? selectElement.selectedIndex : 'N/A'}`);
}

// --- 新增：处理侧边栏配置切换 ---
function handleSidebarProfileChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const selectedName = selectElement.value;
    ztoolkit.log(`ChatLogic: Sidebar profile changed to: ${selectedName}`);

    if (!selectedName) return; // 忽略空选项

    const newProfileData = getAIConfigByName(selectedName); // 获取完整配置 (temp 是 int*10)

    if (newProfileData && currentUIElements) {
        // 更新活动配置名称并保存
        const profilesData = getAIConfigProfiles();
        profilesData.activeProfileName = selectedName;
        if (saveAIConfigProfiles(profilesData)) {
             ztoolkit.log(`ChatLogic: Active profile name saved: ${selectedName}`);
            // 重新获取处理后的活动配置 (包含转换后的 temp float)
            currentConfig = getActiveAIConfig();
            if (currentConfig) {
                ztoolkit.log(`ChatLogic: currentConfig updated successfully for ${selectedName}.`);
                // (可选) 给用户一个提示，比如短暂改变按钮文本或添加一条系统消息
                addMessageToDisplay(currentUIElements.chatContainer, "assistant", `已切换到 AI 配置: ${selectedName}`);
            } else {
                 ztoolkit.log(`ERROR: ChatLogic - Failed to reload active config after switching to ${selectedName}.`);
                 addMessageToDisplay(currentUIElements.chatContainer, "error", `切换到配置 "${selectedName}" 后加载失败。`);
            }
        } else {
             ztoolkit.log(`ERROR: ChatLogic - Failed to save active profile name ${selectedName}.`);
             addMessageToDisplay(currentUIElements.chatContainer, "error", `保存活动配置 "${selectedName}" 失败。`);
             // 恢复下拉菜单到切换前的状态？（可选）
             if ('selectedIndex' in selectElement && currentConfig) {
                 const oldProfile = getAIConfigProfiles().profiles.find(p => p.apiKey === currentConfig?.apiKey /*或其他唯一标识*/);
                 if(oldProfile) selectElement.value = oldProfile.name;
             }
        }
    } else {
         ztoolkit.log(`WARN: ChatLogic - Could not find profile data for selected name: ${selectedName}`);
         addMessageToDisplay(currentUIElements!.chatContainer, "error", `找不到名为 "${selectedName}" 的配置。`);
    }
}

/**
 * 处理发送消息的逻辑
 */
export async function handleSendMessage() {
    ztoolkit.log("ChatLogic: handleSendMessage triggered.");

    // 检查依赖项和状态
    if (isSending) {
        ztoolkit.log("ChatLogic: Already sending, ignoring request.");
        return; // 如果正在发送，则忽略
    }
    if (isSending || !currentUIElements || !currentConfig || !currentUIElements.chatInput || !currentUIElements.sendButton || !currentUIElements.thinkingIndicator || !currentUIElements.chatContainer) {
        ztoolkit.log("ERROR: ChatLogic handleSendMessage - Missing UI elements or config.");
        if (!currentConfig && currentUIElements) {
            addMessageToDisplay(currentUIElements.chatContainer, "error", "无法发送消息：AI 配置未加载。");
        }
        return;
    }

    const message = currentUIElements.chatInput.value.trim();
    if (!message) {
        ztoolkit.log("ChatLogic: Message is empty, doing nothing.");
        return; // 消息为空，不发送
    }

    // 清理 Zotero 格式 (虽然 customButtons 可能已清理，但直接发送时也需要)
    const cleanedMessage = textUtils.cleanZoteroFormattedText(message);
    if (cleanedMessage !== message) {
        ztoolkit.log("ChatLogic: Cleaned Zotero format from direct input.");
        // 可以选择是否更新输入框，或者只使用清理后的文本发送
        // currentUIElements.chatInput.value = cleanedMessage;
    }

    isSending = true; // 设置发送状态标志
    ztoolkit.log("ChatLogic: Sending message:", cleanedMessage);

    // 更新 UI: 禁用输入，显示思考
    updateInputState(currentUIElements.chatInput, currentUIElements.sendButton, true);
    showThinkingIndicator(currentUIElements.thinkingIndicator, true);
    ztoolkit.log("ChatLogic: UI state updated (sending).");

    // 添加用户消息到显示和历史记录
    addMessageToDisplay(currentUIElements.chatContainer, "user", cleanedMessage);
    currentUIElements.chatInput.value = ""; // 清空输入框

    // --- 加载、更新、保存历史记录 ---
    if (currentSessionId === null) {
        ztoolkit.log("ERROR: Cannot save message - currentSessionId is null");
        return;
    }

    let history = chatHistoryStorage.loadChatHistory(currentSessionId); // 1. 加载当前会话历史
    history.push({ role: "user", content: cleanedMessage });          // 2. 添加用户消息
    chatHistoryStorage.saveChatHistory(currentSessionId, history);    // 3. 保存更新后的历史

    // 准备发送给 AI 的消息列表 (包含系统提示和历史)
    const messagesToSend: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: currentConfig.systemPrompt || "You are a helpful assistant." },
        ...history, // 使用模块级的历史记录
        // 注意：这里不需要再添加一次 user message，因为它已经在 chatHistory 里了
    ];
    // 确保历史记录不会无限增长 (可选，例如只保留最近 N 条)
    const maxHistoryLength = 10; // 示例：最多保留 10 条对话历史 (5轮)
    if (messagesToSend.length > maxHistoryLength + 1) { // +1 是因为 system prompt
        messagesToSend.splice(1, messagesToSend.length - (maxHistoryLength + 1)); // 从第二条开始删除旧消息
        ztoolkit.log(`ChatLogic: Trimmed message history to ${maxHistoryLength} messages.`);
    }


    let aiResponse = "";
    let requestError: Error | null = null;

    try {
        ztoolkit.log("ChatLogic: Calling llmService.getCompletion...");
        aiResponse = await llmService.getCompletion(messagesToSend);
        ztoolkit.log("ChatLogic: llmService.getCompletion finished.");
    } catch (error: any) {
        requestError = error;
        ztoolkit.log("ERROR:", "ChatLogic: Error caught from llmService.getCompletion:", error);
    } finally {
        ztoolkit.log("ChatLogic: Entering finally block.");
        // 恢复 UI 状态
        if (currentUIElements) { // 再次检查，以防万一
            updateInputState(currentUIElements.chatInput, currentUIElements.sendButton, false);
            showThinkingIndicator(currentUIElements.thinkingIndicator, false);
            ztoolkit.log("ChatLogic: UI state restored in finally.");

            if (requestError) {
                addMessageToDisplay(currentUIElements.chatContainer, "error", `An error occurred: ${requestError.message || 'Unknown error'}`);
            } else if (aiResponse) {
                addMessageToDisplay(currentUIElements.chatContainer, "assistant", aiResponse);
                let finalHistory = chatHistoryStorage.loadChatHistory(currentSessionId); // 1. 再次加载 (确保一致性)
                finalHistory.push({ role: "assistant", content: aiResponse });       // 2. 添加 AI 回复
                chatHistoryStorage.saveChatHistory(currentSessionId, finalHistory); // 3. 保存最终历史
            } else {
                ztoolkit.log("ChatLogic: No response and no error in finally.");
                // 可以选择添加一条提示消息
                // addMessageToDisplay(currentUIElements.chatContainer, "error", "Received an empty response from the AI.");
            }
            currentUIElements.chatInput.focus(); // 让输入框重新获得焦点
        }
        isSending = false; // 重置发送状态标志
        ztoolkit.log("ChatLogic: Exiting finally block, isSending set to false.");
    }
}
/*
// (可选) 处理条目切换或标签页销毁的函数
export function handleItemChange(item: Zotero.Item | null) {
    ztoolkit.log(`ChatLogic: handleItemChange - New item ID: ${item?.id}. Clearing chat history.`);
    // 当条目切换时，清空当前聊天记录
    // 未来可以实现按条目保存和加载聊天记录
    chatHistory = [];
    // 可能还需要清空聊天界面显示
    if (currentUIElements?.chatContainer) {
        while (currentUIElements.chatContainer.firstChild) {
            currentUIElements.chatContainer.removeChild(currentUIElements.chatContainer.firstChild);
        }
        // 可以重新添加欢迎消息
         addMessageToDisplay(currentUIElements.chatContainer, "assistant", "您好！我能为您提供什么帮助？");
    }
}
*/
/**
 * 处理“新增对话”按钮点击
 */
function handleNewChat() {
    ztoolkit.log("ChatLogic: Handling New Chat button click.");
    if (isSending) {
        ztoolkit.log("ChatLogic: Cannot start new chat while sending.");
        return; // 正在发送时不允许新建
    }
    const newSessionId = chatHistoryStorage.createNewSession(); // 创建新会话 ID
    if (!newSessionId) {
        ztoolkit.log("ERROR: ChatLogic - Failed to create new session ID.");
        return;
    }
    currentSessionId = newSessionId; // 更新当前会话 ID
    setPref(LAST_SESSION_ID_KEY as any, currentSessionId); // 保存为最后使用的 ID
    loadAndDisplayHistory(currentSessionId); // 加载并显示（将是空的+欢迎语）
    //updateHistoryDropdown(); // 更新下拉菜单的显示
    ztoolkit.log(`ChatLogic: Switched to new session: ${currentSessionId}`);
}

/**
 * 处理切换历史对话
 * @param sessionId 要切换到的会话 ID
 */
function handleSwitchChat(sessionId: string) {
    ztoolkit.log(`ChatLogic: Handling Switch Chat to ${sessionId}`);
    if (isSending || sessionId === currentSessionId || !sessionId) {
        ztoolkit.log(`ChatLogic: Switch chat ignored (sending=${isSending}, sameId=${sessionId === currentSessionId}, noSessionId=${!sessionId})`);
        return; // 正在发送、已经是当前会话或 sessionID 无效则忽略
    }
    currentSessionId = sessionId; // 更新当前会话 ID
    setPref(LAST_SESSION_ID_KEY as any, currentSessionId); // 保存为最后使用的 ID
    loadAndDisplayHistory(currentSessionId); // 加载并显示选中会话的历史
    //updateHistoryDropdown(); // 更新下拉菜单的显示（主要是确保选中项正确）
    ztoolkit.log(`ChatLogic: Switched to session: ${currentSessionId}`);
}

/**
 * 渲染顶部的选项栏按钮和下拉菜单
 */
function renderOptionsBar() {
    if (!currentUIElements || !currentUIElements.optionsBarContainer) {
        ztoolkit.log("ERROR: renderOptionsBar - UI elements not available.");
        return;
    }
    const doc = currentUIElements.optionsBarContainer.ownerDocument;
    if (!doc) {
        ztoolkit.log("ERROR: renderOptionsBar - Document not found.");
        return;
    }

    const container = currentUIElements.optionsBarContainer;
    // 清空旧内容
    const profileSelect = container.querySelector("#sidebar-config-profile-select");
    while (container.firstChild && container.firstChild !== profileSelect) {
         container.removeChild(container.firstChild);
    }
     while (container.lastChild && container.lastChild !== profileSelect) {
         container.removeChild(container.lastChild);
    }
    ztoolkit.log("ChatLogic: Rendering options bar (New Chat, History)...");

    // --- 确保 profileSelect 在最左边 (如果它不在) ---
    if (profileSelect && container.firstChild !== profileSelect) {
        container.insertBefore(profileSelect, container.firstChild);
    }

    // 1. 新增对话按钮
    const newChatButton = doc.createElement("button");
    newChatButton.textContent = "新增对话";
    newChatButton.title = "开始一个新的聊天会话";
    newChatButton.onclick = handleNewChat; // 绑定处理函数
    container.appendChild(newChatButton);

    // 2. 历史记录下拉菜单
    const historyButton = doc.createElement("button");
    historyButton.id = "chat-history-button"; // 给个 ID
    historyButton.textContent = "历史记录";
    historyButton.title = "查看和管理历史对话";
    container.appendChild(historyButton);

    historyButton.onclick = () => {
        ztoolkit.log("History button clicked!");
        // 在这里实现弹出历史记录列表的逻辑
        toggleHistoryPopup(historyButton); // 调用一个新函数来处理弹窗
    }

    // 填充下拉菜单选项 (调用更新函数)
    //updateHistoryDropdown();

/*    // 绑定下拉菜单的 change 事件
    historySelect.onchange = (event) => {
        const selectedSessionId = (event.target as HTMLSelectElement).value;
        if (selectedSessionId) { // 确保不是默认的提示选项
            handleSwitchChat(selectedSessionId); // 切换会话
        }
    };*/

    // 3. (占位) 其他按钮...
    // ...

    ztoolkit.log("ChatLogic: Options bar rendered.");
}


/**
 * 创建历史记录列表中的单个条目元素
 * @param doc - The document object
 * @param sessionId - The session ID for this item
 * @returns The HTMLElement for the history item
 */
function createHistoryItemElement(doc: Document, sessionId: string): HTMLElement {
    const itemElement = doc.createElement("div");
    itemElement.style.display = "flex";
    itemElement.style.justifyContent = "space-between";
    itemElement.style.alignItems = "center";
    itemElement.style.padding = "5px 0";
    itemElement.style.borderBottom = "1px solid var(--border-color-secondary)";
    itemElement.style.cursor = "pointer";

    // 会话名称部分
    const nameSpan = doc.createElement("span");
    nameSpan.textContent = chatHistoryStorage.getSessionName(sessionId);
    nameSpan.style.flexGrow = "1"; // 占据多余空间
    nameSpan.style.marginRight = "10px"; // 与删除按钮间距
    nameSpan.style.overflow = "hidden"; // 防止名称过长溢出
    nameSpan.style.textOverflow = "ellipsis";
    nameSpan.style.whiteSpace = "nowrap";
    // 点击名称切换会话
    nameSpan.onclick = (e) => {
        e.stopPropagation(); // 阻止事件冒泡到外层 div 的关闭逻辑
        handleSwitchChat(sessionId);
        // 关闭弹窗
        if (historyPopup && historyPopup.parentNode) {
            historyPopup.parentNode.removeChild(historyPopup);
            historyPopup = null;
        }
    };
    itemElement.appendChild(nameSpan);

    // 删除按钮 (×)
    const deleteButton = doc.createElement("span");
    deleteButton.textContent = "×";
    deleteButton.title = "删除此对话";
    deleteButton.style.color = "red";
    deleteButton.style.fontWeight = "bold";
    deleteButton.style.cursor = "pointer";
    deleteButton.style.padding = "0 5px"; // 增加点击区域
    // 点击删除按钮
    deleteButton.onclick = (e) => {
        e.stopPropagation(); // 阻止事件冒泡
        ztoolkit.log("Delete button clicked for session:", sessionId); // <--- 添加日志确认点击
        
        ztoolkit.log("Attempting direct deletion for session:", sessionId);
        chatHistoryStorage.deleteSession(sessionId);
        ztoolkit.log(`Deleted session (direct): ${sessionId}`);

        // 刷新弹窗内容
        if (historyPopup && historyPopup.parentNode) {
            ztoolkit.log("Refreshing history popup content in place.");
            // 1. 清空弹窗现有内容
            while (historyPopup.firstChild) {
                historyPopup.removeChild(historyPopup.firstChild);
            }
    
            // 2. 重新获取并填充列表
            const sessionList = chatHistoryStorage.getSessionList();
            sessionList.sort((a, b) => parseInt(b.split('_')[1] || '0') - parseInt(a.split('_')[1] || '0')); // 降序
    
            if (sessionList.length === 0) {
                const noHistoryItem = doc.createElement("div");
                noHistoryItem.textContent = "没有历史记录";
                // ... (设置样式) ...
                historyPopup.appendChild(noHistoryItem);
            } else {
                sessionList.forEach(sid => { // 使用不同的变量名 sid
                    try {
                        const historyItem = createHistoryItemElement(doc, sid); // 重新创建列表项
                        historyPopup!.appendChild(historyItem);
                    } catch (err) {
                        ztoolkit.log(`ERROR: Error creating history item during refresh for ${sid}:`, err);
                    }
                });
            }
            ztoolkit.log("History popup content refreshed.");
        }
        // 如果删除的是当前会话，需要切换到别的会话或新建
        if (currentSessionId === sessionId) {
            const sessionList = chatHistoryStorage.getSessionList();
            if (sessionList.length > 0) {
                handleSwitchChat(sessionList[0]);
            } else {
                handleNewChat();
            }
        }
            

        /*
        const sessionName = chatHistoryStorage.getSessionName(sessionId); // 获取名称用于提示
        // --- 修改：使用 Zotero 的 Prompt 服务替代 confirm ---
        const promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                      .getService(Components.interfaces.nsIPromptService);
        const flags = promptService.BUTTON_TITLE_YES * promptService.BUTTON_POS_0 +
                      promptService.BUTTON_TITLE_NO * promptService.BUTTON_POS_1;
        const check = { value: false }; // 用于接收用户的选择
    
        const buttonPressed = promptService.confirmEx(
            null, // 父窗口，null 通常可以
            "确认删除", // 对话框标题
            `确定要删除对话 "${sessionName}"?\n这个操作无法撤销。`, // 提示信息
            flags, // 按钮配置 (是/否)
            null, null, null, // 其他按钮文本 (不需要)
            check // 接收结果的对象
        );
    
        // promptService.BUTTON_POS_0 表示用户点击了第一个按钮（“是”）
        if (buttonPressed === promptService.BUTTON_POS_0) {
             ztoolkit.log("User confirmed deletion for session:", sessionId); // <--- 添加日志确认同意
            chatHistoryStorage.deleteSession(sessionId);
            ztoolkit.log(`Deleted session: ${sessionId}`);
    
            // 刷新弹窗内容
            if (historyPopup && historyPopup.parentNode) {
                const anchorButton = doc.getElementById("chat-history-button") as HTMLButtonElement;
                historyPopup.parentNode.removeChild(historyPopup);
                historyPopup = null;
                 // --- 添加：移除外部点击监听器 ---
                doc.removeEventListener("click", clickOutsideHandler, true); // 确保移除旧的监听器
                // --- 结束添加 ---
                if (anchorButton) {
                    // 稍微延迟一下再重新打开，给 DOM 一点时间反应
                    setTimeout(() => toggleHistoryPopup(anchorButton), 50);
                }
            }
            // 如果删除的是当前会话，需要切换到别的会话或新建
            if (currentSessionId === sessionId) {
                const sessionList = chatHistoryStorage.getSessionList();
                if (sessionList.length > 0) {
                    // 切换到最新的会话（列表已排序）
                    handleSwitchChat(sessionList[0]);
                } else {
                    handleNewChat(); // 如果没有历史了，则新建
                }
            }
        } else {
             ztoolkit.log("User cancelled deletion for session:", sessionId); // <--- 添加日志确认取消
        }*/
        // --- 结束修改 ---
    };
    itemElement.appendChild(deleteButton);

    // 鼠标悬浮效果 (可选)
    itemElement.onmouseenter = () => itemElement.style.backgroundColor = "var(--material-hover-background)";
    itemElement.onmouseleave = () => itemElement.style.backgroundColor = "";

    return itemElement;
}



let historyPopup: HTMLDivElement | null = null; // 用于存储弹窗元素的引用
let clickOutsideHandler: ((event: Event) => void) | null = null;
function toggleHistoryPopup(anchorButton: HTMLButtonElement) {
    ztoolkit.log("toggleHistoryPopup: Function called."); // 日志 1
    if (!currentUIElements || !currentUIElements.optionsBarContainer || !currentUIElements.profileSelectElement) {
        ztoolkit.log("ERROR: toggleHistoryPopup - UI elements (optionsBarContainer or profileSelectElement) not available."); // 日志 2
        return;
   }
    const doc = currentUIElements.optionsBarContainer.ownerDocument;
    if (!doc) {
        ztoolkit.log("ERROR: toggleHistoryPopup - Document not found."); // 日志 3
        return;
    }

    // 如果弹窗已存在，则移除它
    if (historyPopup && historyPopup.parentNode) {
        ztoolkit.log("toggleHistoryPopup: Popup exists, removing it."); // 日志 4
        historyPopup.parentNode.removeChild(historyPopup);
        historyPopup = null;
        if (clickOutsideHandler) {
            doc.removeEventListener("click", clickOutsideHandler, true);
            clickOutsideHandler = null; // 清理引用
            ztoolkit.log("toggleHistoryPopup: Removed clickOutsideHandler.");
        }
        return;
    }
    ztoolkit.log("toggleHistoryPopup: Creating new popup."); // 日志 5

    // 创建弹窗容器
    historyPopup = doc.createElement("div");
    historyPopup.id = "chat-history-popup";
    // --- 弹窗样式 (需要仔细调整) ---
    historyPopup.style.position = "absolute";
    historyPopup.style.backgroundColor = "var(--material-background, white)";
    historyPopup.style.border = "1px solid var(--border-color, black)";
    historyPopup.style.padding = "10px";
    historyPopup.style.zIndex = "1000"; // 确保在顶层
    historyPopup.style.maxHeight = "300px"; // 限制最大高度
    historyPopup.style.overflowY = "auto"; // 超出时滚动
    historyPopup.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
    historyPopup.style.minWidth = "200px"; // 最小宽度

    // 定位弹窗 (示例：在按钮下方)
    try {
        const profileSelect = currentUIElements.profileSelectElement; // 获取切换 AI 的下拉菜单
        const container = currentUIElements.optionsBarContainer; // 父容器

        // 确保父容器有相对定位基准
        if (container.style.position !== 'relative' && container.style.position !== 'absolute' && container.style.position !== 'fixed' && container.style.position !== 'sticky') {
            ztoolkit.log("Warning: optionsBarContainer might need 'position: relative' for absolute positioning of popup.");
            container.style.position = "relative"; // 强制设置
        }

        // 计算 profileSelect 相对于 container 的位置
        const selectTopRelativeToContainer = profileSelect.offsetTop;
        const selectHeight = profileSelect.offsetHeight;
        const selectLeftRelativeToContainer = profileSelect.offsetLeft;

        historyPopup.style.position = "absolute"; // 确保是 absolute
        historyPopup.style.top = `${selectTopRelativeToContainer + selectHeight + 2}px`; // 在下拉菜单正下方
        historyPopup.style.left = `${selectLeftRelativeToContainer}px`; // 与下拉菜单左侧对齐
        // (可选) 如果希望菜单稍微宽一点或窄一点，可以在这里设置 minWidth 或 width
        // historyPopup.style.minWidth = `${profileSelect.offsetWidth}px`; // 例如，和下拉菜单一样宽

        ztoolkit.log(`toggleHistoryPopup: Popup position set based on profileSelect - top: ${historyPopup.style.top}, left: ${historyPopup.style.left}`);
    } catch (e) {
        ztoolkit.log("ERROR: toggleHistoryPopup - Error calculating popup position based on profileSelect:", e);
        historyPopup = null;
        return;
    }

    // 获取并填充历史记录
    const sessionList = chatHistoryStorage.getSessionList();
    ztoolkit.log(`toggleHistoryPopup: Found ${sessionList.length} sessions.`); // 日志 8
    sessionList.sort((a, b) => parseInt(b.split('_')[1] || '0') - parseInt(a.split('_')[1] || '0')); // 降序

    if (sessionList.length === 0) {
        const noHistoryItem = doc.createElement("div");
        noHistoryItem.textContent = "没有历史记录";
        noHistoryItem.style.padding = "5px";
        noHistoryItem.style.color = "var(--text-color-secondary)";
        historyPopup.appendChild(noHistoryItem);
    } else {
        sessionList.forEach(sessionId => {
            try {
                const historyItem = createHistoryItemElement(doc, sessionId);
                historyPopup!.appendChild(historyItem);
            } catch (e) {
                 ztoolkit.log(`ERROR: toggleHistoryPopup - Error creating history item for ${sessionId}:`, e); // 日志 9
            }
        });
    }

    // 将弹窗添加到选项栏容器中（或其他合适的父元素）
    try {
        currentUIElements.optionsBarContainer.appendChild(historyPopup);
        ztoolkit.log("toggleHistoryPopup: Popup appended to optionsBarContainer.");
    } catch (e) {
        ztoolkit.log("ERROR: toggleHistoryPopup - Error appending popup to DOM:", e);
        historyPopup = null;
        return;
    }

    // (可选) 添加点击外部关闭弹窗的逻辑
    clickOutsideHandler = (event: Event) => { // <--- 参数类型保持为 Event
        // 直接使用 event.target，不需要检查 instanceof MouseEvent
        // 因为 MouseEvent is not defined 的错误是在引用 MouseEvent 这个词时发生的
        if (
            historyPopup &&
            event.target && // 确保 event.target 存在
            !historyPopup.contains(event.target as Node) && // (event.target as Node) 是安全的
            event.target !== anchorButton
        ) {
            ztoolkit.log("toggleHistoryPopup: Click outside detected, removing popup.");
            if (historyPopup.parentNode) {
                historyPopup.parentNode.removeChild(historyPopup);
            }
            historyPopup = null;
            if (clickOutsideHandler) { // 确保 clickOutsideHandler 仍然是当前的函数引用
                doc.removeEventListener("click", clickOutsideHandler, true);
                clickOutsideHandler = null; // 清理引用
                ztoolkit.log("toggleHistoryPopup: Removed clickOutsideHandler from inside handler.");
            }
        }
    };

    setTimeout(() => {
        if (clickOutsideHandler) { // 确保处理函数仍然存在
            doc.addEventListener("click", clickOutsideHandler, true);
            ztoolkit.log("toggleHistoryPopup: clickOutsideHandler added.");
        }
    }, 0);
}


/**
 * 更新历史记录下拉菜单的内容和选中状态
 *//*
function updateHistoryDropdown() {
    if (!currentUIElements || !currentUIElements.optionsBarContainer) return;
    const doc = currentUIElements.optionsBarContainer.ownerDocument;
    if (!doc) return;
    const historySelect = doc.getElementById("chat-history-select") as HTMLSelectElement | null;
    if (!historySelect) {
        ztoolkit.log("ERROR: updateHistoryDropdown - Select element not found.");
        return; // 如果下拉菜单还没创建好，就退出
    }

    // 清空现有选项
    while (historySelect.options.length > 0) { historySelect.remove(0); }

    // 添加一个默认的、不可选的提示选项
    const defaultOption = doc.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "-- 历史记录 --";
    defaultOption.disabled = true;
    historySelect.appendChild(defaultOption);

    // 获取所有会话 ID
    const sessionList = chatHistoryStorage.getSessionList();
    ztoolkit.log(`ChatLogic: Updating history dropdown with ${sessionList.length} sessions.`);

    // 按创建时间降序排序 (假设 session ID 包含时间戳)
    sessionList.sort((a, b) => {
        const timeA = parseInt(a.split('_')[1] || '0');
        const timeB = parseInt(b.split('_')[1] || '0');
        return timeB - timeA; // 降序
    });

    // 为每个会话 ID 创建一个选项
    sessionList.forEach(sessionId => {
        const option = doc.createElement("option");
        option.value = sessionId;
        option.textContent = chatHistoryStorage.getSessionName(sessionId); // 显示会话名称
        historySelect.appendChild(option);
    });

    // 设置当前选中的会话
    if (currentSessionId && sessionList.includes(currentSessionId)) {
        historySelect.value = currentSessionId;
    } else {
        historySelect.value = ""; // 如果当前 session ID 无效或不在列表里，选中默认提示项
    }
    ztoolkit.log(`ChatLogic: History dropdown updated. Selected: ${historySelect.value}`);
}
*/

export function handleDestroy() {
    ztoolkit.log("ChatLogic: handleDestroy called. Cleaning up state.");
    // 清理状态变量
    currentUIElements = null;
    currentConfig = null;
    currentSessionId = null; // 清理当前会话 ID
    isSending = false;
    // 这里不需要移除事件监听器，因为父元素 (body) 会被 Zotero 清理
}


// (如果需要将 handleInputKeyPress 提取出来)
// function handleInputKeyPress(e: KeyboardEvent) {
//     if (e.key === "Enter" && !e.shiftKey) {
//         e.preventDefault();
//         handleSendMessage();
//     }
// }
