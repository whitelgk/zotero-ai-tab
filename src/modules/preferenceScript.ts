import { config } from "../../package.json";
import { getString } from "../utils/locale";
import * as modelManager from "./modelManager"; // <--- 导入模型管理器
import { getPref, setPref } from "../utils/prefs"; // <--- 导入 prefs 函数

// 定义按钮配置接口
interface ButtonConfig {
  id: string;
  label: string;
  action: string;
  prompt: string;
}

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      columns: [
        {
          dataKey: "title",
          label: getString("prefs-table-title"),
          fixedWidth: true,
          width: 100,
        },
        {
          dataKey: "detail",
          label: getString("prefs-table-detail"),
        },
      ],
      rows: [
        {
          title: "Orange",
          detail: "It's juicy",
        },
        {
          title: "Banana",
          detail: "It's sweet",
        },
        {
          title: "Apple",
          detail: "I mean the fruit APPLE",
        },
      ],
    };
  } else {
    addon.data.prefs.window = _window;
  }
  initializePreferenceUI(_window.document);
  //bindPrefEvents(); // 绑定通用事件
  setupModelSelection(_window.document); // <--- 设置模型选择下拉菜单
  setupRagSettings(_window.document); // <--- 设置 RAG 开关和相关设置的显示/隐藏
  ButtonsConfig(); // 加载自定义按钮
  setupTemperatureControl(); // 设置温度控制
  ztoolkit.log("Preference scripts registered and UI setup initiated.");
}


// --- 初始化 UI 并绑定事件 ---
function initializePreferenceUI(doc: Document) {
  ztoolkit.log("Initializing preference UI values and bindings...");

  // 定义需要处理的 Prefs 和对应的元素 ID
  const prefBindings = [
      //{ key: "apiKey", elementId: `pref-${config.addonRef}-apiKey`, type: "string" },
      //{ key: "apiEndpoint", elementId: `pref-${config.addonRef}-apiEndpoint`, type: "string" },
      //{ key: "systemPrompt", elementId: `pref-${config.addonRef}-systemPrompt`, type: "string" },
      //{ key: "apiKeyQwen", elementId: `pref-${config.addonRef}-apiKeyQwen`, type: "string" },
      //{ key: "apiKeyDeepseek", elementId: `pref-${config.addonRef}-apiKeyDeepseek`, type: "string" },
      // currentModelId 由 setupModelSelection 处理
      { key: "useRag", elementId: "aiChatTab-useRag-checkbox", type: "boolean" },
      //{ key: "embeddingApiKey", elementId: `pref-${config.addonRef}-embeddingApiKey`, type: "string" },
      //{ key: "embeddingApiEndpoint", elementId: `pref-${config.addonRef}-embeddingApiEndpoint`, type: "string" },
      //{ key: "embeddingModelName", elementId: `pref-${config.addonRef}-embeddingModelName`, type: "string" },
      //{ key: "embeddingDimensions", elementId: `pref-${config.addonRef}-embeddingDimensions`, type: "number" }, // 注意类型
  ];

  prefBindings.forEach(({ key, elementId, type }) => {
      const element = doc.getElementById(elementId) as any; // 使用 any 避免类型检查复杂性
      if (!element) {
          ztoolkit.log(`Warning: Element with ID ${elementId} not found.`);
          return;
      }

      // 1. 加载初始值
      let initialValue: any = getPref(key as any); // 使用正确的类型断言
      ztoolkit.log(`Loading value for ${key}:`, initialValue);

      // 2.只处理 checkbox (或其他保留的 XUL 控件)
      if (element.tagName === "checkbox" && key === "useRag") {
           element.checked = !!initialValue;
           const embeddingSettingsBox = doc.getElementById("aiChatTab-embedding-settings") as XUL.VBox;
           if (embeddingSettingsBox) {
               embeddingSettingsBox.hidden = !element.checked;
           }
      }

      // 3. 绑定事件监听器以保存更改
      const eventType = (element.tagName === "checkbox" || element.tagName === "menulist") ? "command" : "change";
      const handler = (event: Event) => {
        let valueToSave: any;
        const target = event.target as any;

        if (target.tagName === "checkbox" && key === "useRag") {
             valueToSave = target.checked;
        }
        // else if (target.tagName === '...') { /* 处理其他保留的 XUL 控件 */ }
        else {
             return; // 只处理我们关心的控件
        }

          try {
              if (valueToSave !== undefined) { // 只有在值有效时才保存
                   setPref(key as any, valueToSave);
                   ztoolkit.log(`Saved pref ${key} with value:`, valueToSave);
              }
          } catch (e) {
              ztoolkit.log(`Error saving pref ${key}:`, e);
          }
      };
      element.removeEventListener(eventType, handler);
      element.addEventListener(eventType, handler);
  });
  
  function setupHtmlInput(key: string, containerId: string, inputType: string = "text", isTextArea: boolean = false, rows?: number) {
      const container = doc.getElementById(containerId);
      if (!container) {
          ztoolkit.log(`ERROR: Container element #${containerId} not found for key ${key}`);
          return;
      }
      while (container.firstChild) { container.removeChild(container.firstChild); } // 清空

      const element = doc.createElementNS("http://www.w3.org/1999/xhtml", isTextArea ? "textarea" : "input") as HTMLInputElement | HTMLTextAreaElement;

      if (!isTextArea) {
          (element as HTMLInputElement).type = inputType;
      } else if (rows) {
          (element as HTMLTextAreaElement).rows = rows;
      }
      element.style.width = "100%"; // 填充容器
      element.value = getPref(key as any) ?? ""; // 加载初始值

      element.addEventListener("change", (event) => {
          const target = event.target as HTMLInputElement | HTMLTextAreaElement;
          let valueToSave: string | number | undefined = target.value;

          // 特殊处理 number 类型
          if (inputType === 'number') {
              const strVal = target.value.trim();
              if (strVal === "") {
                  valueToSave = undefined; // 保存 undefined 表示清空
                  // 注意：Zotero Prefs 不能直接存 undefined，但 setPref 内部可能处理或忽略
                  // 或者我们可以选择保存一个特殊值如 null 或 0，取决于你的逻辑
                  // 这里我们尝试让 setPref 处理 undefined
                  ztoolkit.log(`Attempting to clear pref ${key}`);
              } else {
                  const numVal = parseInt(strVal, 10); // 假设 embeddingDimensions 是整数
                  if (isNaN(numVal)) {
                      ztoolkit.log(`Invalid number input for ${key}: ${strVal}. Not saving.`);
                      // 恢复显示上次的值
                      const lastVal = getPref(key as any);
                      target.value = lastVal !== undefined ? String(lastVal) : "";
                      return; // 不保存无效值
                  }
                  valueToSave = numVal;
              }
          }

          try {
              // 只有当值不是 undefined 时才调用 setPref，或者你需要明确清除它
              if (valueToSave !== undefined) {
                  setPref(key as any, valueToSave);
                  ztoolkit.log(`Saved pref ${key} with value:`, valueToSave);
              } else {
                  // 如果想在输入为空时清除 Pref，可以在这里调用 clearPref
                  // clearPref(key as any);
                  // ztoolkit.log(`Cleared pref ${key}`);
                  // 或者让 setPref(key, undefined) 处理（行为可能依赖 Zotero 版本）
                  setPref(key as any, valueToSave); // 尝试设置 undefined
              }
          } catch (e) {
              ztoolkit.log(`Error saving pref ${key}:`, e);
          }
      });

      container.appendChild(element);
      ztoolkit.log(`${key} HTML ${isTextArea ? 'textarea' : 'input'} control setup completed`);
  }

  // --- 为每个被替换的控件调用 setupHtmlInput ---
  setupHtmlInput("apiKey", `pref-${config.addonRef}-apiKey-container`, "password");
  setupHtmlInput("apiEndpoint", `pref-${config.addonRef}-apiEndpoint-container`, "text");
  setupHtmlInput("systemPrompt", `pref-${config.addonRef}-systemPrompt-container`, "text", true, 3); // isTextArea=true, rows=3
  setupHtmlInput("apiKeyQwen", `pref-${config.addonRef}-apiKeyQwen-container`, "password");
  setupHtmlInput("apiKeyDeepseek", `pref-${config.addonRef}-apiKeyDeepseek-container`, "password");
  setupHtmlInput("embeddingApiKey", `pref-${config.addonRef}-embeddingApiKey-container`, "password");
  setupHtmlInput("embeddingApiEndpoint", `pref-${config.addonRef}-embeddingApiEndpoint-container`, "text");
  setupHtmlInput("embeddingModelName", `pref-${config.addonRef}-embeddingModelName-container`, "text");
  setupHtmlInput("embeddingDimensions", `pref-${config.addonRef}-embeddingDimensions-container`, "number"); // inputType='number'
  ztoolkit.log("Preference UI values and bindings initialized.");
}


// --- 设置模型选择下拉菜单 ---
function setupModelSelection(doc: Document) {
  ztoolkit.log("Setting up model selection using HTML select...");
  const containerId = "aiChatTab-model-select-container";
  const container = doc.getElementById(containerId);
  if (!container) {
      ztoolkit.log(`ERROR: Model select container element #${containerId} not found.`);
      return;
  }
  while (container.firstChild) { container.removeChild(container.firstChild); } // 清空容器

  // 创建 HTML select 元素
  const selectElement = doc.createElementNS("http://www.w3.org/1999/xhtml", "select") as HTMLSelectElement;
  selectElement.style.flex = "1"; // 让 select 元素填充容器
  // selectElement.style.maxWidth = "300px"; // 可以设置一个最大宽度

  // 获取支持的模型并填充选项
  const models = modelManager.getSupportedModels();
  ztoolkit.log(`Found ${models.length} supported models for HTML select.`);
  models.forEach(model => {
      const optionElement = doc.createElementNS("http://www.w3.org/1999/xhtml", "option") as HTMLOptionElement;
      optionElement.textContent = model.name; // 显示用户友好的名称
      optionElement.value = model.id; // 值为模型的唯一 ID
      selectElement.appendChild(optionElement);
  });

  // --- 从 Prefs 加载并设置初始值 ---
  try {
        const currentModelId = modelManager.getCurrentModelId(); // 这个函数内部会处理默认值
        selectElement.value = currentModelId;
        ztoolkit.log(`HTML Model select initialized. Current model ID from prefs: ${currentModelId}. Select value set to: ${selectElement.value}`);
        if (selectElement.value !== currentModelId) {
            ztoolkit.log(`Warning: HTML select value (${selectElement.value}) does not match intended value (${currentModelId}) after setting.`);
        }
    } catch (e) { ztoolkit.log("ERROR: Failed to set initial model selection value for HTML select:", e); }

    // --- 监听并保存更改 ---
  const handler = (event: Event) => {
      const selectedId = (event.target as HTMLSelectElement).value;
      try {
          setPref("currentModelId" as any, selectedId);
          ztoolkit.log(`User selected model (HTML select): ${selectedId}`);
      } catch (e) {
           ztoolkit.log(`Error saving pref currentModelId from HTML select:`, e);
      }
  };
  selectElement.addEventListener("change", handler); // 监听 change 事件

  // 将 HTML select 添加到容器
  container.appendChild(selectElement);
  ztoolkit.log("Model selection HTML select control setup completed.");
  
}

// --- 新增：模型选择变化的处理函数 ---
function handleModelSelectionChange(event: Event) {
  const selectedId = (event.target as XUL.Menulist).value;
  try {
      setPref("currentModelId" as any, selectedId); // <--- 保存选择
      ztoolkit.log(`User selected model: ${selectedId}`);
  } catch (e) {
       ztoolkit.log(`Error saving pref currentModelId:`, e);
  }
}

// --- 新增：设置 RAG 相关 UI ---
function setupRagSettings(doc: Document) {
  ztoolkit.log("Setting up RAG settings...");
  const ragCheckbox = doc.getElementById("aiChatTab-useRag-checkbox") as XUL.Checkbox;
  const embeddingSettingsBox = doc.getElementById("aiChatTab-embedding-settings") as XUL.VBox;

  if (!ragCheckbox || !embeddingSettingsBox) {
      ztoolkit.log("ERROR: RAG checkbox or embedding settings box not found.");
      return;
  }

  /*// 根据初始状态设置显隐
  const initialRagState = getPref("useRag" as any); // 直接获取布尔值
  embeddingSettingsBox.hidden = !initialRagState;
  ztoolkit.log(`Initial RAG state: ${initialRagState}, Embedding settings hidden: ${embeddingSettingsBox.hidden}`);
  */

  // 监听 Checkbox 变化
  const handler = () => {
       const useRag = ragCheckbox.checked;
       embeddingSettingsBox.hidden = !useRag;
       ztoolkit.log(`RAG checkbox toggled. New state: ${useRag}, Embedding settings hidden: ${embeddingSettingsBox.hidden}`);
       // 保存操作由 initializePreferenceUI 中的监听器处理
  };
  ragCheckbox.removeEventListener("command", handler);
  ragCheckbox.addEventListener("command", handler);
}

// --- 新增：RAG 开关变化的处理函数 ---
function handleRagCheckboxChange(event: Event) {
  const ragCheckbox = event.target as XUL.Checkbox;
  const embeddingSettingsBox = ragCheckbox.ownerDocument.getElementById("aiChatTab-embedding-settings") as XUL.VBox;
  if (embeddingSettingsBox) {
      const useRag = ragCheckbox.checked;
      embeddingSettingsBox.hidden = !useRag;
      ztoolkit.log(`RAG checkbox toggled. New state: ${useRag}, Embedding settings hidden: ${embeddingSettingsBox.hidden}`);
      // 保存操作由 initializePreferenceUI 中的监听器处理
  }
}

// 设置温度控制
function setupTemperatureControl() {
  if (!addon.data.prefs?.window) {
    ztoolkit.log("ERROR: prefs window not available for temperature control");
    return;
  }
  
  const doc = addon.data.prefs.window.document;
  if (!doc) {
    ztoolkit.log("ERROR: prefs document not available for temperature control");
    return;
  }
  
  const addonRef = addon.data.config.addonRef;
  const containerId = `pref-${addonRef}-temperature-input-container`; // <--- 容器 ID
  const container = doc.getElementById(containerId); // <--- 获取容器

  if (!container) {
    ztoolkit.log(`ERROR: temperature container element #${containerId} not found`);
    return;
  }

  // 清空容器（如果需要重新渲染）
  while (container.firstChild) { container.removeChild(container.firstChild); }

  // 创建 HTML input 元素
  const temperatureInput = doc.createElementNS("http://www.w3.org/1999/xhtml", "input") as HTMLInputElement;
  temperatureInput.type = "number";
  temperatureInput.min = "0";
  temperatureInput.max = "2";
  temperatureInput.step = "0.1";
  temperatureInput.style.width = "60px"; // 设置宽度
  // temperatureInput.classList.add("some-class"); // 可以添加 CSS 类
  
  // 从首选项获取保存的温度整数值（已乘以10的值）
  let tempInt: number;
  try {
    tempInt = Number(getPref("temperature" as any)); // 直接用 getPref
    if (typeof tempInt !== 'number' || !Number.isInteger(tempInt) || tempInt < 0 || tempInt > 20) {
        ztoolkit.log(`Invalid stored temperature value: ${tempInt}, defaulting to 7`);
        tempInt = 7; // 默认 0.7 * 10
        setPref("temperature" as any, tempInt); // 保存默认值
    }
  } catch (e) {
      ztoolkit.log("Failed to get temperature preference, using default 7", e);
      tempInt = 7;
      setPref("temperature" as any, tempInt);
  }
  
  // --- 设置 spinner 的初始整数值 ---
  const tempFloat = tempInt / 10.0;
  temperatureInput.value = tempFloat.toFixed(1);
  ztoolkit.log(`Set temperature HTML input initial value to ${temperatureInput.value}`);


  const handler = (event: Event) => {
    try {
      const inputElement = event.target as HTMLInputElement; // <--- 类型改为 HTMLInputElement
      const newValueString = inputElement.value;
      const newValueFloat = parseFloat(newValueString);

      if (!isNaN(newValueFloat) && newValueFloat >= 0 && newValueFloat <= 2) {
        // 将有效的浮点数放大10倍并四舍五入为整数进行存储
        const valueToSaveInt = Math.round(newValueFloat * 10);
        setPref("temperature", valueToSaveInt); // <--- 保存整数
        ztoolkit.log(`Saved temperature preference as int: ${valueToSaveInt}`);
        // 可选：如果用户输入了多位小数，规范化显示
        inputElement.value = (valueToSaveInt / 10.0).toFixed(1);
      } else {
        // 输入无效，恢复到上次保存的值
        const lastValidTempInt = Number(getPref("temperature" as any)) || 7;
        inputElement.value = (lastValidTempInt / 10.0).toFixed(1);
        ztoolkit.log(`Invalid temperature input '${newValueString}', reverted to ${inputElement.value}`);
      }
    } catch (e) {
      ztoolkit.log("Error saving temperature preference from input:", e);
    }
  };
  temperatureInput.addEventListener("change", handler); // 监听 change 事件

  // 将 HTML input 添加到容器
  container.appendChild(temperatureInput);
  ztoolkit.log("Temperature HTML input control setup completed");
}


function bindPrefEvents() {
  addon.data
    .prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-enable`,
    )
    ?.addEventListener("command", (e: Event) => {
      ztoolkit.log(e);
      addon.data.prefs!.window.alert(
        `Successfully changed to ${(e.target as XUL.Checkbox).checked}!`,
      );
    });

  addon.data
    .prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-input`,
    )
    ?.addEventListener("change", (e: Event) => {
      ztoolkit.log(e);
      addon.data.prefs!.window.alert(
        `Successfully changed to ${(e.target as HTMLInputElement).value}!`,
      );
    });
}

// 加载按钮配置
function ButtonsConfig() {
  ztoolkit.log("Loading buttons configuration...");
  
  if (!addon.data.prefs?.window) {
    ztoolkit.log("ERROR: prefs window not available for loading buttons");
    return;
  }
  
  const doc = addon.data.prefs.window.document;
  if (!doc) {
    ztoolkit.log("ERROR: prefs document not available for loading buttons");
    return;
  }
  
  const container = doc.getElementById("buttons-container") as HTMLElement;
  if (!container) {
    ztoolkit.log("ERROR: buttons-container not found");
    return;
  }
  
  ztoolkit.log("Clearing buttons container");
  
  // 清空容器
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  
  // 获取存储的按钮配置
  let buttonsConfig: ButtonConfig[] = [];
  try {
    // 使用Zotero.Prefs直接获取，避免使用as any类型断言
    const storedConfig = Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.customButtons`, true);
    ztoolkit.log("Retrieved stored buttons config:", storedConfig);
    
    if (storedConfig && typeof storedConfig === 'string') {
      try {
        buttonsConfig = JSON.parse(storedConfig);
        ztoolkit.log(`Parsed ${buttonsConfig.length} button(s) from config`);
      } catch (parseError) {
        ztoolkit.log("Error parsing button config JSON:", parseError);
      }
    }
  } catch (e) {
    ztoolkit.log("Error loading buttons config:", e);
  }
  
  // 如果没有配置，添加默认按钮
  if (buttonsConfig.length === 0) {
    ztoolkit.log("No buttons configured, creating defaults");
    buttonsConfig = [
      {
        id: "summarize",
        label: "总结文本",
        action: "summarize",
        prompt: "请总结该文章的主要内容，包括主要观点、方法和结论。"
      },
      {
        id: "translate",
        label: "翻译文本",
        action: "translate",
        prompt: "请将以下文本翻译成中文："
      },
      {
        id: "explain",
        label: "解释文本",
        action: "explain",
        prompt: "请解释以下文本的含义："
      }
    ];
  }
  
  // 渲染按钮配置
  buttonsConfig.forEach((button, index) => {
    ztoolkit.log(`Creating button row for ${button.label}`);
    const buttonRow = createButtonRow(doc, button, index);
    container.appendChild(buttonRow);
  });
  
  ztoolkit.log("Buttons configuration loaded successfully");
}

// 创建按钮配置行
function createButtonRow(doc: Document, button: ButtonConfig, index: number): HTMLElement {
  const row = doc.createElement("div");
  row.style.display = "flex";
  row.style.marginBottom = "5px";
  row.style.alignItems = "center";
  
  // 标签输入
  const labelInput = doc.createElement("input");
  labelInput.type = "text";
  labelInput.value = button.label;
  labelInput.placeholder = "按钮标签";
  labelInput.style.flex = "1";
  labelInput.style.marginRight = "5px";
  labelInput.setAttribute("data-index", index.toString());
  labelInput.setAttribute("data-field", "label");
  
  // 动作选择
  const actionSelect = doc.createElement("select");
  actionSelect.style.flex = "1";
  actionSelect.style.marginRight = "5px";
  actionSelect.setAttribute("data-index", index.toString());
  actionSelect.setAttribute("data-field", "action");
  
  const actions = [
    { value: "summarize", label: "总结文本" },
    { value: "translate", label: "翻译文本" },
    { value: "explain", label: "解释文本" },
    { value: "custom", label: "自定义" }
  ];
  
  actions.forEach(action => {
    const option = doc.createElement("option");
    option.value = action.value;
    option.textContent = action.label;
    if (action.value === button.action) {
      option.selected = true;
    }
    actionSelect.appendChild(option);
  });
  
  // 提示词输入
  const promptInput = doc.createElement("input");
  promptInput.type = "text";
  promptInput.value = button.prompt;
  promptInput.placeholder = "提示词";
  promptInput.style.flex = "2";
  promptInput.style.marginRight = "5px";
  promptInput.setAttribute("data-index", index.toString());
  promptInput.setAttribute("data-field", "prompt");
  
  // 删除按钮
  const deleteButton = doc.createElement("button");
  deleteButton.textContent = "删除";
  deleteButton.setAttribute("data-index", index.toString());
  deleteButton.onclick = () => {
    const container = doc.getElementById("buttons-container");
    if (container) {
      container.removeChild(row);
    }
  };
  
  row.appendChild(labelInput);
  row.appendChild(actionSelect);
  row.appendChild(promptInput);
  row.appendChild(deleteButton);
  
  return row;
}

// 保存按钮配置
export function saveButtons() {
  ztoolkit.log("Saving buttons configuration...");
  
  if (!addon.data.prefs?.window) {
    ztoolkit.log("ERROR: prefs window not available for saving buttons");
    return;
  }
  
  const doc = addon.data.prefs.window.document;
  if (!doc) {
    ztoolkit.log("ERROR: prefs document not available for saving buttons");
    return;
  }
  
  const container = doc.getElementById("buttons-container") as HTMLElement;
  if (!container) {
    ztoolkit.log("ERROR: buttons-container not found");
    return;
  }
  
  const buttonsConfig: ButtonConfig[] = [];
  
  // 收集所有按钮配置
  Array.from(container.children).forEach((row, index) => {
    const labelInput = row.querySelector(`input[data-field="label"]`) as HTMLInputElement;
    const actionSelect = row.querySelector(`select[data-field="action"]`) as HTMLSelectElement;
    const promptInput = row.querySelector(`input[data-field="prompt"]`) as HTMLInputElement;
    
    if (labelInput && actionSelect && promptInput) {
      buttonsConfig.push({
        id: `button-${index}`,
        label: labelInput.value,
        action: actionSelect.value,
        prompt: promptInput.value
      });
    }
  });
  
  // 保存配置
  try {
    const jsonString = JSON.stringify(buttonsConfig);
    ztoolkit.log(`Saving ${buttonsConfig.length} buttons, JSON:`, jsonString);
    
    Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.customButtons`, jsonString, true);
    ztoolkit.log("Buttons config saved successfully");
    
    // 显示成功消息
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: "按钮配置已保存",
        progress: 100,
      })
      .show();
  } catch (e) {
    ztoolkit.log("Error saving buttons config:", e);
    
    // 显示错误消息
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: `保存按钮配置失败: ${e}`,
        progress: 100,
        type: "error"
      })
      .show();
  }
}

// 添加新按钮
export function addButton() {
  ztoolkit.log("Adding new button...");
  
  if (!addon.data.prefs?.window) {
    ztoolkit.log("ERROR: prefs window not available for adding button");
    return;
  }
  
  const doc = addon.data.prefs.window.document;
  if (!doc) {
    ztoolkit.log("ERROR: prefs document not available for adding button");
    return;
  }
  
  const container = doc.getElementById("buttons-container") as HTMLElement;
  if (!container) {
    ztoolkit.log("ERROR: buttons-container not found");
    return;
  }
  
  // 获取当前按钮数量
  const currentButtons = container.children.length;
  ztoolkit.log(`Current button count: ${currentButtons}`);
  
  // 创建新按钮配置
  const newButton: ButtonConfig = {
    id: `button-${Date.now()}`,
    label: "新按钮",
    action: "custom",
    prompt: "请输入提示词"
  };
  
  // 创建并添加按钮行
  const buttonRow = createButtonRow(doc, newButton, currentButtons);
  container.appendChild(buttonRow);
  ztoolkit.log("New button added successfully");
}
