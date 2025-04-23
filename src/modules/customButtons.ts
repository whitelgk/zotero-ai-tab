// src/modules/customButtons.ts
import { getPref } from "../utils/prefs"; // 用于获取首选项
import * as textUtils from "../utils/textUtils"; // 导入文本处理工具

// 定义按钮配置接口 (与 preferenceScript.ts 中的保持一致)
interface ButtonConfig {
    id: string;
    label: string;
    action: string; // 'summarize', 'translate', 'explain', 'custom' 等
    prompt: string;
}

/**
 * 创建并渲染自定义按钮
 * @param parentElement - 用于放置按钮行的父容器 (通常是 chatUI 创建的 buttonsContainer)
 * @param chatInput - 聊天输入框的引用，用于获取或设置文本
 * @param sendMessageCallback - 发送消息的回调函数 (通常是 chatLogic.handleSendMessage)
 */
export function createCustomButtons(
    parentElement: HTMLDivElement,
    chatInput: HTMLTextAreaElement,
    sendMessageCallback: () => void
) {
    const doc = parentElement.ownerDocument;
    if (!doc) {
        ztoolkit.log("ERROR: CustomButtons - Document not found.");
        return;
    }
    ztoolkit.log("CustomButtons: Creating custom buttons...");

    // 清空现有按钮
    while (parentElement.firstChild) {
        parentElement.removeChild(parentElement.firstChild);
    }

    // --- 加载按钮配置 ---
    let buttonsConfig: ButtonConfig[] = [];
    try {
        const storedConfig = getPref("customButtons" as any); // 获取存储的配置
        if (storedConfig && typeof storedConfig === 'string') {
            buttonsConfig = JSON.parse(storedConfig);
            ztoolkit.log(`CustomButtons: Loaded ${buttonsConfig.length} button(s) from prefs.`);
        } else {
            ztoolkit.log("CustomButtons: No valid button config found in prefs, using defaults.");
            // 如果没有配置或配置无效，使用默认按钮
            buttonsConfig = getDefaultButtons();
        }
    } catch (e) {
        ztoolkit.log("ERROR: CustomButtons - Error loading or parsing buttons config:", e);
        buttonsConfig = getDefaultButtons(); // 出错时也使用默认按钮
    }

    // --- 渲染按钮 ---
    if (buttonsConfig.length === 0) {
        ztoolkit.log("CustomButtons: No buttons to render (including defaults).");
        return; // 没有按钮需要渲染
    }

    // 计算行数，每行最多放 4 个按钮
    const buttonsPerRow = 4;
    const numRows = Math.ceil(buttonsConfig.length / buttonsPerRow);

    for (let i = 0; i < numRows; i++) {
        const rowElement = doc.createElement("div");
        rowElement.style.display = "flex";
        rowElement.style.width = "100%";
        rowElement.style.gap = "5px"; // 按钮间距
        if (i < numRows - 1) { // 除了最后一行，其他行底部加间距
            rowElement.style.marginBottom = "5px";
        }

        for (let j = 0; j < buttonsPerRow; j++) {
            const buttonIndex = i * buttonsPerRow + j;
            if (buttonIndex < buttonsConfig.length) {
                const buttonConfig = buttonsConfig[buttonIndex];
                const buttonElement = doc.createElement("button");
                buttonElement.textContent = buttonConfig.label;
                buttonElement.title = buttonConfig.prompt; // 鼠标悬浮显示提示词
                buttonElement.style.flex = "1"; // 按钮等宽填充
                // buttonElement.classList.add("button-toolbar"); // 可选样式

                // --- 绑定点击事件 ---
                buttonElement.addEventListener("click", () => {
                    handleButtonClick(buttonConfig, chatInput, sendMessageCallback);
                });

                rowElement.appendChild(buttonElement);
            } else {
                // 如果一行不足 4 个按钮，添加占位符保持对齐
                const spacer = doc.createElement("div");
                spacer.style.flex = "1";
                rowElement.appendChild(spacer);
            }
        }
        parentElement.appendChild(rowElement);
    }
    ztoolkit.log(`CustomButtons: Rendered ${buttonsConfig.length} buttons.`);
}

/**
 * 处理自定义按钮点击事件
 * @param buttonConfig - 被点击按钮的配置
 * @param chatInput - 聊天输入框元素
 * @param sendMessageCallback - 发送消息的回调函数
 */
function handleButtonClick(
    buttonConfig: ButtonConfig,
    chatInput: HTMLTextAreaElement,
    sendMessageCallback: () => void
) {
    ztoolkit.log(`CustomButtons: Button clicked - Label: ${buttonConfig.label}, Action: ${buttonConfig.action}`);

    // 1. 获取需要处理的文本
    let textToProcess = "";
    // 优先使用 Zotero 阅读器中选中的文本 (如果当前在阅读器上下文)
    try {
        // 检查是否在 Reader 上下文，并尝试获取选中文本
        const reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID); // 获取当前 Reader 实例
        if (reader) {
            const selectedText = reader.getSelectedText(); // 获取选中文本
            if (selectedText && selectedText.trim()) {
                textToProcess = selectedText.trim();
                ztoolkit.log("CustomButtons: Using selected text from reader:", textToProcess);
            }
        }
    } catch (e) {
        ztoolkit.log("CustomButtons: Could not get selected text from reader (maybe not in reader tab).", e);
    }

    // 如果没有选中文本，则使用输入框中的文本
    if (!textToProcess) {
        textToProcess = chatInput.value.trim();
        ztoolkit.log("CustomButtons: Using text from input:", textToProcess);
    }

    // 如果仍然没有文本，提示用户
    if (!textToProcess) {
        // 可以在 chatUI 中添加一个显示临时消息的功能，或者简单地 log
        ztoolkit.log("CustomButtons: No text selected or entered.");
        // alert("Please select text in the reader or type in the input box."); // 避免使用 alert
        return;
    }

    // 2. 清理文本格式 (移除 Zotero 链接等)
    const cleanedText = textUtils.cleanZoteroFormattedText(textToProcess);
    if (cleanedText !== textToProcess) {
        ztoolkit.log("CustomButtons: Cleaned Zotero format from text.");
    }

    // 3. 构建最终要发送的消息 (提示词 + 清理后的文本)
    //    确保提示词和文本之间有换行符或其他分隔符
    const messageToSend = `${buttonConfig.prompt}\n\n---\n\n${cleanedText}`;
    ztoolkit.log("CustomButtons: Constructed message to send:", messageToSend);

    // 4. 将构建好的消息放入输入框 (覆盖原始内容)
    chatInput.value = messageToSend;

    // 5. 调用发送消息的回调函数
    sendMessageCallback();
    ztoolkit.log("CustomButtons: sendMessageCallback invoked.");
}

/**
 * 获取默认的按钮配置
 * @returns 默认按钮配置数组
 */
function getDefaultButtons(): ButtonConfig[] {
    return [
        {
            id: "summarize-default",
            label: "总结文本",
            action: "summarize",
            prompt: "请总结以下文本的主要内容，包括主要观点、方法和结论等等。"
        },
        {
            id: "translate-default",
            label: "翻译文本",
            action: "translate",
            prompt: "请将以下文本翻译成中文："
        },
        {
            id: "explain-default",
            label: "解释文本",
            action: "explain",
            prompt: "请解释以下文本的含义："
        }
    ];
}