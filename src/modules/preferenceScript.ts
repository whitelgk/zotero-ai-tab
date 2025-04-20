import { config } from "../../package.json";
import { getString } from "../utils/locale";

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
  updatePrefsUI();
  bindPrefEvents();
  ButtonsConfig();
  setupTemperatureControl();
}

async function updatePrefsUI() {
  // You can initialize some UI elements on prefs window
  // with addon.data.prefs.window.document
  // Or bind some events to the elements
  const renderLock = ztoolkit.getGlobal("Zotero").Promise.defer();
  if (addon.data.prefs?.window == undefined) return;
  const tableHelper = new ztoolkit.VirtualizedTable(addon.data.prefs?.window)
    .setContainerId(`${config.addonRef}-table-container`)
    .setProp({
      id: `${config.addonRef}-prefs-table`,
      // Do not use setLocale, as it modifies the Zotero.Intl.strings
      // Set locales directly to columns
      columns: addon.data.prefs?.columns,
      showHeader: true,
      multiSelect: true,
      staticColumns: true,
      disableFontSizeScaling: true,
    })
    .setProp("getRowCount", () => addon.data.prefs?.rows.length || 0)
    .setProp(
      "getRowData",
      (index) =>
        addon.data.prefs?.rows[index] || {
          title: "no data",
          detail: "no data",
        },
    )
    // Show a progress window when selection changes
    .setProp("onSelectionChange", (selection) => {
      new ztoolkit.ProgressWindow(config.addonName)
        .createLine({
          text: `Selected line: ${addon.data.prefs?.rows
            .filter((v, i) => selection.isSelected(i))
            .map((row) => row.title)
            .join(",")}`,
          progress: 100,
        })
        .show();
    })
    // When pressing delete, delete selected line and refresh table.
    // Returning false to prevent default event.
    .setProp("onKeyDown", (event: KeyboardEvent) => {
      if (event.key == "Delete" || (Zotero.isMac && event.key == "Backspace")) {
        addon.data.prefs!.rows =
          addon.data.prefs?.rows.filter(
            (v, i) => !tableHelper.treeInstance.selection.isSelected(i),
          ) || [];
        tableHelper.render();
        return false;
      }
      return true;
    })
    // For find-as-you-type
    .setProp(
      "getRowString",
      (index) => addon.data.prefs?.rows[index].title || "",
    )
    // Render the table.
    .render(-1, () => {
      renderLock.resolve();
    });
  await renderLock.promise;
  ztoolkit.log("Preference table rendered!");
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
  const temperatureInput = doc.getElementById(`pref-${addonRef}-temperature`) as HTMLInputElement;
  
  if (!temperatureInput) {
    ztoolkit.log("ERROR: temperature input element not found");
    return;
  }
  
  // 从首选项获取保存的温度整数值（已乘以10的值）
  let tempInt: number;
  try {
    tempInt = Number(Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.temperature`, true));
    ztoolkit.log(`Retrieved temperature preference (int*10): ${tempInt}`);
  } catch (e) {
    // 如果获取失败或不是有效的数字，使用默认值7（等于0.7）
    ztoolkit.log("Failed to get temperature preference, using default 7 (0.7)", e);
    tempInt = 7;
  }
  
  // 确保tempInt是有效的整数值
  if (typeof tempInt !== 'number' || !Number.isInteger(tempInt) || tempInt < 0 || tempInt > 20) {
    ztoolkit.log(`Invalid temperature value: ${tempInt}, defaulting to 7 (0.7)`);
    tempInt = 7;
    
    // 保存默认值
    try {
      Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.temperature`, tempInt, true);
      ztoolkit.log(`Saved default temperature value: ${tempInt}`);
    } catch (e) {
      ztoolkit.log("Error saving default temperature value:", e);
    }
  }
  
  // 将整数值转换为浮点数（除以10）并设置到输入框
  const tempFloat = tempInt / 10.0;
  temperatureInput.value = tempFloat.toFixed(1); // 格式化为一位小数
  ztoolkit.log(`Set temperature input value to ${temperatureInput.value}`);
  
  // 添加事件监听器，当温度值变化时保存
  temperatureInput.addEventListener("change", () => {
    try {
      // 获取输入值并解析为浮点数
      const newValueString = temperatureInput.value;
      const newValueFloat = parseFloat(newValueString);
      
      // 验证是否为有效数字且在范围内
      if (!isNaN(newValueFloat) && newValueFloat >= 0 && newValueFloat <= 2) {
        // 将浮点数乘以10并四舍五入为整数进行存储
        const valueToSaveInt = Math.round(newValueFloat * 10);
        
        // 保存整数值
        Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.temperature`, valueToSaveInt, true);
        ztoolkit.log(`Saved temperature preference as int*10: ${valueToSaveInt}`);
        
        // 对输入框的值进行格式化，确保显示一位小数
        temperatureInput.value = newValueFloat.toFixed(1);
      } else {
        // 如果输入无效，恢复为上一个有效值
        ztoolkit.log(`Invalid temperature input: ${newValueString}, reverting`);
        temperatureInput.value = tempFloat.toFixed(1);
      }
    } catch (e) {
      ztoolkit.log("Error saving temperature preference:", e);
    }
  });
  
  ztoolkit.log("Temperature control setup completed");
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
