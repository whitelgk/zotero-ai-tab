// src/modules/chatUI.ts

/**
 * 定义聊天界面元素的接口
 */
export interface ChatUIElements {
    optionsBarContainer: HTMLDivElement; // <--- 新增
    profileSelectElement: HTMLSelectElement; 
    chatContainer: HTMLDivElement;
    chatInput: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;
    thinkingIndicator: HTMLParagraphElement;
    buttonsContainer: HTMLDivElement; // 添加按钮容器引用
    // 可以根据需要添加其他元素引用
}

/**
 * 创建聊天界面的基本 DOM 结构
 * @param parentElement - 将要附加 UI 元素的父容器 (通常是侧边栏的 body)
 * @returns 包含关键 UI 元素引用的对象
 */
export function createChatInterface(parentElement: HTMLElement): ChatUIElements {
    const doc = parentElement.ownerDocument;
    if (!doc) {
        throw new Error("ChatUI: Document not found for creating interface.");
    }
    ztoolkit.log("ChatUI: Creating chat interface elements including options bar...");

    // --- 使用原生 DOM API 创建 UI 元素 ---
    // (这部分代码基本是从你原来的 readerTab.ts 的 onRender 中迁移过来的)
    
    // --- 创建选项栏容器 ---
    const optionsBarContainer = doc.createElement("div");
    optionsBarContainer.id = "ai-chat-options-bar";
    optionsBarContainer.style.display = "flex";
    optionsBarContainer.style.flexWrap = "wrap"; // 允许换行
    optionsBarContainer.style.gap = "8px"; // 元素间距
    optionsBarContainer.style.padding = "5px";
    optionsBarContainer.style.borderBottom = "1px solid var(--border-color)";
    optionsBarContainer.style.marginBottom = "5px";
    optionsBarContainer.style.flexShrink = "0"; // 防止被压缩
    optionsBarContainer.style.alignItems = "center"; // <--- 添加此行，垂直居中对齐
    optionsBarContainer.style.position = "relative"; // <--- 添加此行，为内部绝对定位的弹窗提供基准
    parentElement.appendChild(optionsBarContainer); // 添加到顶部

    // +++ 修改：创建 html:select +++
    const profileSelectElement = doc.createElement("select") as HTMLSelectElement; // 创建 select
    profileSelectElement.id = "sidebar-config-profile-select";
    profileSelectElement.style.marginRight = "8px";
    // 添加一个加载中的占位符 option
    const loadingItem = doc.createElement("option") as HTMLOptionElement; // 创建 option
    loadingItem.textContent = "AI..."; // 使用 textContent
    loadingItem.value = "";
    loadingItem.disabled = true;
    profileSelectElement.appendChild(loadingItem); // 直接添加到 select
    optionsBarContainer.appendChild(profileSelectElement);
    // +++ 结束修改 +++

    // 创建聊天显示区域
    const chatContainer = doc.createElement("div");
    chatContainer.id = "ai-chat-display";
    chatContainer.style.flexGrow = "1";
    chatContainer.style.overflowY = "auto";
    chatContainer.style.padding = "5px";
    chatContainer.style.border = "1px solid var(--border-color)";
    chatContainer.style.marginBottom = "5px";
    chatContainer.style.backgroundColor = "var(--material-background)";
    chatContainer.style.color = "var(--text-color-primary)";
    chatContainer.style.maxHeight = "calc(100vh - 400px)"; // 保留 maxHeight
    chatContainer.style.minHeight = "100px";
    parentElement.appendChild(chatContainer); // 直接添加到父元素

    // 创建思考指示器
    const thinkingIndicator = doc.createElement("p");
    thinkingIndicator.id = "ai-thinking-indicator";
    thinkingIndicator.textContent = "AI is thinking...";
    thinkingIndicator.style.display = "none";
    thinkingIndicator.style.fontStyle = "italic";
    thinkingIndicator.style.color = "var(--text-color-secondary)";
    thinkingIndicator.style.margin = "0 0 5px 5px";
    thinkingIndicator.style.flexShrink = "0";
    parentElement.appendChild(thinkingIndicator); // 添加到父元素

    // 创建输入框
    const chatInput = doc.createElement("textarea");
    chatInput.id = "ai-chat-input";
    chatInput.rows = 3;
    chatInput.placeholder = "Type your message...";
    chatInput.style.width = "calc(100% - 10px)"; // 考虑父元素的 padding
    chatInput.style.resize = "none";
    chatInput.style.marginBottom = "5px";
    chatInput.style.flexShrink = "0";
    chatInput.style.backgroundColor = "var(--material-input-background)";
    chatInput.style.color = "var(--text-color-primary)";
    chatInput.style.border = "1px solid var(--border-color)";
    parentElement.appendChild(chatInput); // 添加到父元素

    // 创建按钮容器 (用于自定义按钮)
    const buttonsContainer = doc.createElement("div");
    buttonsContainer.id = "ai-chat-buttons";
    buttonsContainer.style.display = "flex";
    buttonsContainer.style.flexWrap = "wrap";
    buttonsContainer.style.gap = "5px";
    buttonsContainer.style.marginBottom = "5px";
    buttonsContainer.style.flexShrink = "0";
    parentElement.appendChild(buttonsContainer); // 添加到父元素

    // 创建 Send 按钮容器 (为了右对齐)
    const sendButtonContainer = doc.createElement("div");
    sendButtonContainer.style.display = "flex";
    sendButtonContainer.style.justifyContent = "flex-end";
    sendButtonContainer.style.flexShrink = "0";
    parentElement.appendChild(sendButtonContainer); // 添加到父元素

    // 创建 Send 按钮
    const sendButton = doc.createElement("button");
    sendButton.id = "ai-chat-send";
    sendButton.textContent = "Send";
    // sendButton.classList.add("button-toolbar"); // 可选样式
    sendButtonContainer.appendChild(sendButton); // 添加到 Send 按钮容器

    ztoolkit.log("ChatUI: Interface elements created and appended.");

    // 返回元素引用
    return {
        optionsBarContainer, // <--- 返回引用
        profileSelectElement, // 返回 select 引用
        chatContainer,
        chatInput,
        sendButton,
        thinkingIndicator,
        buttonsContainer, // 返回按钮容器的引用
    };
}

/**
 * 向聊天显示区域添加一条消息
 * @param container - 聊天容器元素
 * @param role - 消息角色 ('user', 'assistant', 'error')
 * @param content - 消息内容
 */
export function addMessageToDisplay(
    container: HTMLDivElement,
    role: "user" | "assistant" | "error",
    content: string
) {
    const doc = container.ownerDocument;
    if (!doc) return;

    const messageElement = doc.createElement("div");
    messageElement.style.marginBottom = "10px";
    messageElement.style.padding = "8px";
    messageElement.style.borderRadius = "4px";
    messageElement.style.maxWidth = "85%";
    messageElement.style.overflowWrap = "break-word"; // 确保长单词换行
    messageElement.style.wordBreak = "break-all";
    messageElement.style.backgroundColor = role === "user" ? "var(--material-toolbar-background)" : (role === 'error' ? 'var(--material-error-background)' : 'var(--material-surface)');
    messageElement.style.textAlign = role === "user" ? "right" : "left";
    messageElement.style.marginLeft = role === 'assistant' || role === 'error' ? '0' : 'auto';
    messageElement.style.marginRight = role === 'user' ? '0' : 'auto';
    messageElement.style.border = role === 'error' ? '1px solid var(--material-error-border)' : 'none';
    messageElement.style.color = role === 'error' ? 'var(--material-error-color)' : 'var(--text-color-primary)'; // 统一设置文本颜色
    messageElement.style.userSelect = "text"; // <--- 明确允许文本选择

    const roleStrong = doc.createElement("strong");
    roleStrong.textContent = role === 'user' ? 'You: ' : (role === 'error' ? 'System: ' : 'AI: ');
    roleStrong.style.color = role === 'error' ? 'var(--material-error-color)' : 'var(--text-color-secondary)';
    roleStrong.style.display = 'block';
    roleStrong.style.marginBottom = '4px'; // 角色和内容间加点间距

    const contentSpan = doc.createElement("span");
    contentSpan.textContent = content; // 直接设置文本内容，避免 XSS
    contentSpan.style.whiteSpace = "pre-wrap"; // <--- 允许保留换行和空格，并自动换行
    contentSpan.style.userSelect = "text"; // <--- 明确允许文本选择 (也可以只在这里设置)
    contentSpan.style.cursor = "text"; // <--- 将鼠标指针改为文本选择样式

    messageElement.appendChild(roleStrong);
    messageElement.appendChild(contentSpan);
    container.appendChild(messageElement);

    // 滚动到底部
    container.scrollTop = container.scrollHeight;
    // ztoolkit.log(`ChatUI: Message added - Role: ${role}`);
}

/**
 * 控制思考指示器的显示/隐藏
 * @param indicator - 思考指示器元素
 * @param show - 是否显示
 */
export function showThinkingIndicator(indicator: HTMLParagraphElement, show: boolean) {
    indicator.style.display = show ? "block" : "none";
    // ztoolkit.log(`ChatUI: Thinking indicator display set to ${show ? 'block' : 'none'}`);
}

/**
 * 更新输入框和发送按钮的禁用状态
 * @param input - 输入框元素
 * @param sendButton - 发送按钮元素
 * @param disabled - 是否禁用
 */
export function updateInputState(
    input: HTMLTextAreaElement,
    sendButton: HTMLButtonElement,
    disabled: boolean
) {
    input.disabled = disabled;
    sendButton.disabled = disabled;
    // ztoolkit.log(`ChatUI: Input state set to disabled=${disabled}`);
}
