// src/modules/reader.ts
import { getLocaleID } from "../utils/locale";
import * as chatUI from "./chatUI"; // 导入 UI 模块
import * as chatLogic from "./chatLogic"; // 导入逻辑模块
import * as customButtons from "./customButtons"; // 导入按钮模块
//import { getAIChatConfig } from "../utils/prefs"; // 获取配置

/**
 * 注册 AI 聊天侧边栏到 Zotero 阅读器
 */
export function registerReaderSection() {
    ztoolkit.log("Reader: Registering AI Chat Section...");
    try {
        Zotero.ItemPaneManager.registerSection({
            paneID: "ai-chat-tab", // 保持唯一标识
            pluginID: addon.data.config.addonID,
            header: {
                l10nID: getLocaleID("item-section-aiChat-head-text"),
                icon: `chrome://${addon.data.config.addonRef}/content/icons/icon.png`, // 确认图标路径
            },
            sidenav: {
                l10nID: getLocaleID("item-section-aiChat-sidenav-tooltip"),
                icon: `chrome://${addon.data.config.addonRef}/content/icons/icon.png`,
            },

            // 渲染标签页内容 - 现在只负责创建根容器和调用其他模块
            onRender: ({ body, item, tabType }) => {
                ztoolkit.log(`Reader: onRender called. tabType: ${tabType}, Item ID: ${item?.id}`);
                const doc = body.ownerDocument;
                if (!doc) {
                    ztoolkit.log("ERROR: Reader onRender - Document not found.");
                    return;
                }

                // 1. 清空 body 并设置基本布局
                while (body.firstChild) { body.removeChild(body.firstChild); }
                body.style.display = "flex";
                body.style.flexDirection = "column";
                body.style.height = "100%";
                body.style.overflow = "hidden";
                body.style.padding = "5px"; // 统一在这里设置 padding
                ztoolkit.log("Reader: onRender - Body cleared and layout set.");

                try {
                    // 2. 创建 UI 结构 (调用 chatUI 模块)
                    // createChatInterface 需要返回包含各元素引用的对象
                    const uiElements = chatUI.createChatInterface(body);
                    ztoolkit.log("Reader: onRender - Chat interface created by chatUI.");

                    // 3. 创建自定义按钮 (调用 customButtons 模块)
                    // createCustomButtons 需要知道将按钮添加到哪里，以及输入框和发送回调
                    // 注意：这里我们将 sendMessageCallback 定义为调用 chatLogic 的方法
                    const sendMessageCallback = () => {
                        // 确保 chatLogic 已经初始化并可以调用其发送方法
                        if (chatLogic.handleSendMessage) {
                            chatLogic.handleSendMessage();
                        } else {
                            ztoolkit.log("ERROR: chatLogic.handleSendMessage is not available.");
                        }
                    };
                    customButtons.createCustomButtons(uiElements.buttonsContainer, uiElements.chatInput, sendMessageCallback);
                    ztoolkit.log("Reader: onRender - Custom buttons created by customButtons.");

                    // 4. 初始化聊天逻辑 (调用 chatLogic 模块)
                    // initChat 需要 UI 元素引用和 AI 配置
                    //const config = getAIChatConfig(); // 获取配置
                    chatLogic.initChat(uiElements); // 传递 UI 元素和配置
                    ztoolkit.log("Reader: onRender - Chat logic initialized by chatLogic.");

                    // 5. (可选) 添加初始欢迎消息 (可以移到 chatLogic.initChat 内部)
                    // chatUI.addMessageToDisplay(uiElements.chatContainer, "assistant", "您好！我能为您提供什么帮助？");
                    // ztoolkit.log("Reader: onRender - Initial message added (optional).");

                } catch (e) {
                    ztoolkit.log("ERROR: Reader onRender - Error during UI/Logic initialization:", e);
                    const errorDiv = doc.createElement("div");
                    errorDiv.textContent = `Error rendering AI Chat UI: ${e instanceof Error ? e.message : String(e)}`;
                    errorDiv.style.color = "red";
                    body.appendChild(errorDiv);
                }
                ztoolkit.log("Reader: onRender finished.");
            },

            // onItemChange 和 onDestroy 可以根据需要保留或简化
            onItemChange: ({ item, setEnabled, tabType }) => {
                ztoolkit.log(`Reader: onItemChange - tabType: ${tabType}, Item ID: ${item?.id}`);
                // 可以在这里通知 chatLogic 清理状态或做其他处理
                // chatLogic.handleItemChange(item); // 示例
                setEnabled(tabType === "reader" || tabType === "library");
                return true;
            },
            onDestroy: () => {
                ztoolkit.log("Reader: onDestroy called.");
                // 可以在这里通知 chatLogic 清理状态
                chatLogic.handleDestroy(); // 清理 chatLogic 的状态
                // chatLogic.handleDestroy(); // 示例
            },
        });
        ztoolkit.log("Reader: AI Chat Section registered successfully.");
    } catch (e) {
        ztoolkit.log("ERROR:", "Reader: Error registering AI Chat Section:", e);
        if (e instanceof Error) Zotero.debug(e.stack); // 打印堆栈信息
    }
}