// src/modules/chatLogic.ts
import { ChatUIElements, addMessageToDisplay, showThinkingIndicator, updateInputState } from "./chatUI"; // 导入 UI 更新函数
import * as llmService from "./llmService"; // 导入 LLM 服务
import { getPref, setPref } from "../utils/prefs"; // 导入 AI 配置类型
import * as textUtils from "../utils/textUtils"; // 导入文本工具
import * as chatHistoryStorage from "../utils/chatHistoryStorage"; // <--- 引入存储模块
import * as modelManager from "./modelManager"; // <--- 导入 modelManager
import * as embeddingService from "./embeddingService"; // <--- 导入 Embedding 服务
import * as vectorStorage from "../utils/vectorStorage"; // <--- 导入向量存储
import * as textChunker from "../utils/textChunker"; // <--- 导入文本分块
import { getRagConfig } from "../utils/prefs"; // <--- 导入 RAG 配置获取
import * as fileHandler from "./fileHandler"; // <--- 导入 fileHandler

// --- 模块级状态变量 ---
let currentUIElements: ChatUIElements | null = null; // 当前激活的 UI 元素引用
//let currentConfig: AIChatConfig | null = null; // 当前使用的 AI 配置
let currentSessionId: string | null = null; // <--- 当前会话 ID
let isSending = false; // 防止重复发送的状态标志
const LAST_SESSION_ID_KEY = "lastUsedSessionId"; // Pref key for last session

/**
 * 初始化聊天逻辑，绑定事件监听器
 * @param uiElements - ChatUI 模块创建的 UI 元素引用
 * @param config - 当前的 AI 配置
 */
export function initChat(uiElements: ChatUIElements, /* config: AIChatConfig */) {
    ztoolkit.log("ChatLogic: Initializing chat logic...");
    currentUIElements = uiElements;
    //currentConfig = config;
    isSending = false; // 重置发送状态

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

    chatInput.onkeypress = (e: KeyboardEvent) => { // 直接赋值给 onkeypress
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };
    // 或者:
    // chatInput.removeEventListener("keypress", handleInputKeyPress); // 先移除 (需要将处理函数提取出来)
    // chatInput.addEventListener("keypress", handleInputKeyPress); // 再添加

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

// --- 新增：处理文件上传/处理的入口 ---
async function handleProcessFile() {
    if (!currentSessionId || !currentUIElements || !currentUIElements.chatContainer) return;
    ztoolkit.log("ChatLogic: handleProcessFile called.");

    // 1. 选择文件
    const file = await fileHandler.selectFile("application/pdf, text/plain, .md"); // 限制文件类型
    if (!file) {
        ztoolkit.log("ChatLogic: No file selected by user.");
        return;
    }
    const fileId = file.name; // 使用文件名作为临时 ID

    // 2. 显示处理中提示
    addMessageToDisplay(currentUIElements.chatContainer, "system", `正在处理文件: ${file.name}...`);

    try {
        // 3. 提取文本
        const text = await fileHandler.readFileContent(file); // <--- 调用 fileHandler
        if (!text) throw new Error("未能提取文件内容。");

        // 4. 分块
        const chunks = textChunker.chunkTextSimple(text);
        if (chunks.length === 0) throw new Error("未能将文件分块。");

        // 5. 获取 Embeddings (需要 embeddingService)
        const vectors = await embeddingService.getEmbeddings(chunks);
        if (vectors.length !== chunks.length) throw new Error("获取 Embeddings 的数量与块数量不匹配。");

        // 6. 存储向量 (需要 vectorStorage)
        const chunkRecords = chunks.map((chunkText, index) => ({
            text: chunkText,
            vector: vectors[index]
        }));
        await vectorStorage.storeEmbeddings(currentSessionId, fileId, chunkRecords);

        // 7. 显示成功提示
        addMessageToDisplay(currentUIElements.chatContainer, "system", `文件 "${file.name}" 处理完成 (${chunks.length} 块)，现在可以基于它提问了。`);

    } catch (error: any) {
        ztoolkit.log("ERROR: ChatLogic - Error processing file:", error);
        addMessageToDisplay(currentUIElements.chatContainer, "error", `处理文件 "${file?.name || '未知文件'}" 时出错: ${error.message}`);
    }
}

/**
 * 处理发送消息的逻辑
 */
export async function handleSendMessage() {
    const ragConfig = getRagConfig(); // <--- 添加这行来获取配置
    ztoolkit.log("ChatLogic: handleSendMessage triggered.");

    // 检查依赖项和状态
    if (isSending) {
        ztoolkit.log("ChatLogic: Already sending, ignoring request.");
        return; // 如果正在发送，则忽略
    }
    if (isSending || !currentUIElements || !currentUIElements.chatInput || !currentUIElements.sendButton || !currentUIElements.thinkingIndicator || !currentUIElements.chatContainer) {
        ztoolkit.log("ERROR: ChatLogic handleSendMessage - Missing UI elements or config.");
        return;
    }

    // --- 获取当前模型配置、系统提示和温度 ---
    const currentModel = modelManager.getCurrentModelConfig();
    const systemPrompt = getPref("systemPrompt" as any) as string || "You are a helpful assistant.";
    const tempInt = getPref("temperature" as any) as number; // 获取整数温度
    let temperatureFloat = 0.7; // 默认值
    if (typeof tempInt === 'number' && Number.isInteger(tempInt) && tempInt >= 0 && tempInt <= 20) {
         temperatureFloat = tempInt / 10.0;
    } else {
         ztoolkit.log(`ChatLogic: Invalid temperature pref (${tempInt}), using default 0.7`);
    }
    ztoolkit.log(`ChatLogic: Using Model: ${currentModel.id}, Temperature: ${temperatureFloat}`);
    // --- 结束获取配置 ---

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
    let history = chatHistoryStorage.loadChatHistory(currentSessionId); // 1. 加载当前会话历史
    history.push({ role: "user", content: cleanedMessage });          // 2. 添加用户消息
    chatHistoryStorage.saveChatHistory(currentSessionId, history);    // 3. 保存更新后的历史


    let contextText = ""; // 用于存储 RAG 检索到的上下文

    // --- RAG 流程 ---
    if (ragConfig.useRag) {
        ztoolkit.log("ChatLogic: RAG enabled, attempting retrieval...");
        try {
            // 1. 获取问题 Embedding
            const queryVectorResponse = await embeddingService.getEmbeddings([cleanedMessage]); // API 需要数组
            if (queryVectorResponse.length > 0) {
                const queryVector = queryVectorResponse[0];
                // 2. 查找相似块
                const similarChunks = await vectorStorage.findSimilarChunks(currentSessionId, queryVector);
                if (similarChunks.length > 0) {
                    // 3. 构建上下文文本
                    contextText = "请根据以下信息回答问题：\n\n---\n";
                    contextText += similarChunks.map(chunk => chunk.text).join("\n\n---\n");
                    contextText += "\n\n---";
                    ztoolkit.log(`ChatLogic: Retrieved ${similarChunks.length} relevant chunks.`);
                } else {
                    ztoolkit.log("ChatLogic: No relevant chunks found for the query.");
                }
            } else {
                 ztoolkit.log("ERROR: ChatLogic - Failed to get embedding for the query.");
            }
        } catch (error: any) {
            ztoolkit.log("ERROR: ChatLogic - Error during RAG retrieval:", error);
            addMessageToDisplay(currentUIElements.chatContainer, "error", `RAG 检索出错: ${error.message}`);
            // 可以选择是否继续发送（不带上下文），或者直接中止
            // isSending = false; updateInputState(...); showThinkingIndicator(...); return;
        }
    } else {
        ztoolkit.log("ChatLogic: RAG is disabled.");
    }
    // --- 结束 RAG 流程 ---

    // 对话历史 (截断)
    const historyForPrompt = [...history]; // 复制一份历史记录
    // 确保历史记录不会无限增长 (可选，例如只保留最近 N 条)
    const maxHistoryLength = 10; // 示例：最多保留 10 条对话历史 (5轮)
    if (historyForPrompt.length > maxHistoryLength + 1) { // +1 是因为 system prompt
        historyForPrompt.splice(1, historyForPrompt.length - (maxHistoryLength + 1)); // 从第二条开始删除旧消息
        ztoolkit.log(`ChatLogic: Trimmed message history to ${maxHistoryLength} messages.`);
    }

    
    let aiResponse = "";
    let requestError: Error | null = null;

    try {
        ztoolkit.log("ChatLogic: Calling llmService.getCompletion...");
        // --- 修改：传递模型配置、系统提示和温度 ---
        aiResponse = await llmService.getCompletion(
            historyForPrompt, // <--- 修改这里！传递处理后的历史记录
            currentModel,   // 传递当前模型配置
            systemPrompt,   // 传递系统提示
            temperatureFloat // 传递温度
        );
        // --- 结束修改 ---
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
    while (container.firstChild) { container.removeChild(container.firstChild); }
    ztoolkit.log("ChatLogic: Rendering options bar...");

    // --- 新增：处理文件按钮 ---
    const processFileButton = doc.createElement("button");
    processFileButton.textContent = "处理文件 (RAG)";
    processFileButton.title = "选择 PDF 或 TXT 文件进行处理以用于问答";
    processFileButton.onclick = handleProcessFile; // <--- 绑定新的处理函数
    container.appendChild(processFileButton);
    // --- 结束新增 ---

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

function toggleHistoryPopup(anchorButton: HTMLButtonElement) {
    ztoolkit.log("toggleHistoryPopup: Function called."); // 日志 1
    if (!currentUIElements || !currentUIElements.optionsBarContainer) {
        ztoolkit.log("ERROR: toggleHistoryPopup - UI elements not available."); // 日志 2
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
        doc.removeEventListener("click", clickOutsideHandler, true);
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
        // --- 修改：计算相对于 optionsBarContainer 的位置 ---
        // 我们需要 optionsBarContainer 是一个 positioned ancestor (relative, absolute, fixed, sticky)
        // 如果 optionsBarContainer 本身没有设置 position，absolute 定位会相对于 body 或更上层。
        // 为确保准确，可以给 optionsBarContainer 添加 position: relative (如果它还没有)
        // 在 chatUI.ts 中修改 optionsBarContainer.style.position = "relative"; (如果需要)
        const buttonTopRelativeToContainer = anchorButton.offsetTop; // 按钮顶部相对于父元素的位置
        const buttonHeight = anchorButton.offsetHeight; // 按钮的高度
        const buttonLeftRelativeToContainer = anchorButton.offsetLeft; // 按钮左侧相对于父元素的位置

        historyPopup.style.top = `${buttonTopRelativeToContainer + buttonHeight + 2}px`; // 在按钮正下方
        historyPopup.style.left = `${buttonLeftRelativeToContainer}px`; // 与按钮左侧对齐
        // --- 结束修改 ---
        ztoolkit.log(`toggleHistoryPopup: Popup position set (fixed) - top: ${historyPopup.style.top}, left: ${historyPopup.style.left}`); // 日志 6
    } catch (e) {
         ztoolkit.log("ERROR: toggleHistoryPopup - Error calculating popup position:", e); // 日志 7
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
        // --- 修改：添加回 optionsBarContainer ---
        // 确保 optionsBarContainer 有 position: relative 或 absolute 等，以便 absolute 定位的子元素正确显示
        if (currentUIElements.optionsBarContainer.style.position !== 'relative' && currentUIElements.optionsBarContainer.style.position !== 'absolute' && currentUIElements.optionsBarContainer.style.position !== 'fixed' && currentUIElements.optionsBarContainer.style.position !== 'sticky') {
            ztoolkit.log("Warning: optionsBarContainer might need 'position: relative' for absolute positioning of popup.");
            // 可以考虑在这里动态添加，但不推荐，最好在 chatUI.ts 中设置好
            // currentUIElements.optionsBarContainer.style.position = "relative";
       }
       currentUIElements.optionsBarContainer.appendChild(historyPopup);
        // --- 结束修改 ---
        ztoolkit.log("toggleHistoryPopup: Popup appended to document body."); // 日志 10
    } catch (e) {
         ztoolkit.log("ERROR: toggleHistoryPopup - Error appending popup to DOM:", e); // 日志 11
         historyPopup = null;
         return;
    }

    // (可选) 添加点击外部关闭弹窗的逻辑
    const clickOutsideHandler = (event: MouseEvent) => {
        if (historyPopup && !historyPopup.contains(event.target as Node) && event.target !== anchorButton) {
            ztoolkit.log("toggleHistoryPopup: Click outside detected, removing popup.");
            if (historyPopup.parentNode) {
                historyPopup.parentNode.removeChild(historyPopup);
            }
            historyPopup = null;
            doc.removeEventListener("click", clickOutsideHandler, true); // 移除监听器
        }
    };
    // 使用 setTimeout 确保当前点击事件结束后再添加监听器
    setTimeout(() => {
        doc.addEventListener("click", clickOutsideHandler, true);
        ztoolkit.log("toggleHistoryPopup: clickOutsideHandler added."); // 日志 12s
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
    //currentConfig = null;
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