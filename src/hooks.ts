import { getString, initLocale, getLocaleID } from "./utils/locale"; // 添加 getLocaleID
import { registerPrefsScripts, addButton, saveButtons } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import * as reader from "./modules/reader"; // <--- 导入新的 reader 模块

async function onStartup() {
  // --- 在 await 之前添加日志 ---
  try {
    // 尝试获取 ztoolkit，看是否初始化成功
    if (typeof ztoolkit !== 'undefined' && ztoolkit.log) {
      ztoolkit.log("Hooks: Top of onStartup reached."); // 日志 Alpha
    } else {
      // 如果 ztoolkit 没有定义，尝试用 Zotero.debug
      Zotero.debug("Hooks: Top of onStartup reached, but ztoolkit is not defined yet.");
    }
  } catch (e) {
    Zotero.debug("Hooks: Error at top of onStartup: " + e);
  }
  // --- 结束添加 ---

  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  // --- 在 initLocale 之前添加日志 ---
  try {
    ztoolkit.log("Hooks: After await, before initLocale."); // 日志 Beta
  } catch (e) { Zotero.debug("Hooks: Error before initLocale: " + e); }
  // --- 结束添加 ---

  initLocale(); // initLocale 是否会抛错？

  // --- 在注册首选项之前添加日志 ---
  try {
    ztoolkit.log("Hooks: After initLocale, before registering prefs."); // 日志 Gamma
  } catch (e) { Zotero.debug("Hooks: Error before registering prefs: " + e); }
  // --- 结束添加 ---

  // --- 明确注册首选项面板 ---
  try {
    ztoolkit.log("Attempting to register preferences pane..."); // 日志 1

    // --- 恢复或添加以下代码 ---
    const prefsPaneOptions = {
      pluginID: addon.data.config.addonID, // 使用 package.json 中的 ID
      src: rootURI + "content/preferences.xhtml", // 确认路径
      // 你可以选择用硬编码标签测试，或者用 getString
      // label: "AI Chat Test Prefs", // 硬编码测试标签
      label: getString("pref-title"), // 使用 FTL 文件中的标签 (确保 FTL 正确)
      image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`, // 确认图标存在
    };
    ztoolkit.log("Preferences pane options:", JSON.stringify(prefsPaneOptions)); // 日志 2
    Zotero.PreferencePanes.register(prefsPaneOptions); // <--- 实际注册调用
    // --- 结束恢复或添加 ---

    ztoolkit.log("Finished attempting to register preferences pane."); // 日志 3
  } catch (e) {
    Zotero.debug("Hooks: Error registering preferences pane: " + e);
    if (e instanceof Error) Zotero.debug(e.stack);
  }

  // --- 在注册侧边栏之前添加日志 ---
  try {
    ztoolkit.log("Hooks: Before registering reader tab."); // 日志 Delta
  } catch (e) { Zotero.debug("Hooks: Error before registering reader tab: " + e); }
  // --- 结束添加 ---


  try {
    ztoolkit.log("Hooks: Attempting to register reader section via reader module..."); // 日志 A
    reader.registerReaderSection(); // <--- 调用新的注册函数
    ztoolkit.log("Hooks: Finished attempting to register reader section."); // 日志 B
  } catch (e) {
    // ztoolkit.log("ERROR:","Error registering reader tab:", e); // <--- 注意：你之前的日志显示这里报错了！
    Zotero.debug("Hooks: Error registering reader section: " + e);
    if (e instanceof Error) Zotero.debug(e.stack);
  }
  Zotero.debug("Hooks: onStartup function finished (all done)."); // 确保这个日志在最后
  // ... (注释掉的其他代码) ...
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll(); // Toolkit 会自动移除它创建的 UI 元素和监听器
  // addon.data.dialog?.window?.close(); // 模板示例
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  // addon.data.dialog?.window?.close(); // 模板示例
  // Remove addon object
  addon.data.alive = false;
  // @ts-ignore - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * 处理 Notify 事件 (模板示例，根据需要保留或修改)
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);
  // if (
  //   event == "select" &&
  //   type == "tab" &&
  //   extraData[ids[0]].type == "reader"
  // ) {
  //   BasicExampleFactory.exampleNotifierCallback();
  // } else {
  //   return;
  // }
}

/**
 * 处理首选项 UI 事件
 */
export function onPrefsEvent(type: string, data: { [key: string]: any }) {
  ztoolkit.log("onPrefsEvent triggered", type, data);
  switch (type) {
    case "load":
      ztoolkit.log("Preferences window loaded");
      registerPrefsScripts(data.window);
      break;
    case "addButton":
      ztoolkit.log("Add button event triggered");
      addButton();
      break;
    case "saveButtons":
      ztoolkit.log("Save buttons event triggered");
      saveButtons();
      break;
    default:
      ztoolkit.log(`Unknown preference event type: ${type}`);
  }
}

// 新的事件处理函数：保存放大后的整数
function handleTemperatureInputInt(event: Event) {
  const inputElement = event.target as HTMLInputElement;
  const newValueString = inputElement.value;
  const newValueNumber = parseFloat(newValueString);

  // 验证输入的数字是否在有效范围内 [0, 2]
  if (!isNaN(newValueNumber) && newValueNumber >= 0 && newValueNumber <= 2) {
    // 将有效的浮点数放大10倍并四舍五入为整数进行存储
    const valueToSaveInt = Math.round(newValueNumber * 10);
    addon.api.setPref("temperature", valueToSaveInt); // <--- 修改点：保存整数
    ztoolkit.log(`Temperature preference saved as int*10: ${valueToSaveInt}`);
  } else {
    ztoolkit.log(`Invalid temperature input, not saving: ${newValueString}`);
  }
}


// --- 保留模板的其他钩子函数 (onShortcuts, onDialogEvents)，如果需要 ---
// function onShortcuts(type: string) { ... }
// function onDialogEvents(type: string) { ... }
// --- 结束保留 ---


export default {
  onStartup,
  onShutdown,
  onMainWindowUnload,
  onNotify, // 保留或移除
  onPrefsEvent,
};