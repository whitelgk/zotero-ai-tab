// src/modules/preferenceScript.ts
import { config } from "../../package.json";
import { getString } from "../utils/locale";
// --- 导入新的 prefs 函数和类型 ---
import {
  getAIConfigProfiles,
  saveAIConfigProfiles,
  getAIConfigByName,
  AIConfigProfile,
  AIConfigProfiles
} from "../utils/prefs";
// --- 结束导入 ---
// 定义按钮配置接口
interface ButtonConfig {
  id: string;
  label: string;
  action: string;
  prompt: string;
}

// --- 全局变量存储当前窗口和文档引用 ---
let prefsWindow: Window | null = null;
let prefsDocument: Document | null = null;
let addonRef: string | null = null; // 存储 addonRef

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  /*if (!addon.data.prefs) {
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
  }*/
  // --- 调用新的初始化函数 ---
  await loadAndPopulateConfigProfiles(); // 加载并填充配置方案下拉菜单
  setupInputListeners(); // 设置输入框监听器（如果需要实时反馈）
  ButtonsConfig(); // 加载自定义按钮配置 (保持不变)
  // setupTemperatureControl(); // 温度控制逻辑将包含在 loadProfileIntoInputs 中
  // bindPrefEvents(); // 旧的事件绑定可能不再需要
  // updatePrefsUI(); // 旧的表格渲染不再需要
  // --- 结束调用 ---

  ztoolkit.log("Preference scripts registered and UI initialized.");
}

// --- 新增：加载并填充配置方案下拉菜单 ---
async function loadAndPopulateConfigProfiles() {
  if (!prefsDocument || !prefsWindow) {
       ztoolkit.log("ERROR: Prefs document or window not available in loadAndPopulateConfigProfiles.");
       return;
  }
  ztoolkit.log("Loading and populating AI config profiles..."); 

  const selectElement = prefsDocument.getElementById("ai-config-profile-select") as HTMLSelectElement;
  if (!selectElement) {
      ztoolkit.log("ERROR: Profile select element not found.");
      return;
  }
  selectElement.options.length = 0;

  const profilesData = getAIConfigProfiles();
  const profiles = profilesData.profiles;
  const activeProfileName = profilesData.activeProfileName;
  let activeIndex = -1; // 初始化为 -1

  if (profiles.length === 0) {
      // 没有配置时显示提示，并加载默认空值
      const item = prefsDocument.createElement("option") as HTMLOptionElement;
      item.textContent = "无配置 (请保存)"; // 使用 textContent
      item.value = "";
      item.disabled = true; // 设置 disabled 属性
      selectElement.appendChild(item);
      loadProfileIntoInputs(null); // 加载空/默认值
      activeIndex = 0; // 即使是禁用项，索引也是 0
      ztoolkit.log("No profiles found, displaying default.");
  } else {
      let activeIndex = 0;
      profiles.forEach((profile, index) => {
          if (!prefsDocument) {
              ztoolkit.log("ERROR: prefsDocument is null when creating option element.");
              return;
          }
          const item = prefsDocument.createElement("option") as HTMLOptionElement;
          item.textContent = profile.name; // 使用 textContent
          item.value = profile.name;
          selectElement.appendChild(item);
          if (profile.name === activeProfileName) {
              activeIndex = index; // 记录活动配置的索引
          }
      });

      // 如果没有找到活动的，默认选中第一个
      if (activeIndex === -1 && profiles.length > 0) {
        activeIndex = 0;
        // (可选) 更新存储中的 activeProfileName
        // profilesData.activeProfileName = profiles[0].name;
        // saveAIConfigProfiles(profilesData);
    }

      // 选中活动配置
      //selectElement.selectedIndex = activeIndex;
      // 加载活动配置到输入框
      const activeProfile = activeIndex !== -1 ? profiles[activeIndex] : null;
      loadProfileIntoInputs(activeProfile);
      ztoolkit.log(`Loaded ${profiles.length} profiles. Active: ${activeProfile?.name || 'None'}`);
  }

  if (activeIndex !== -1) {
      selectElement.selectedIndex = activeIndex;
      ztoolkit.log(`Prefs: Set selectedIndex to ${activeIndex}`);
  }
  // 初始时禁用删除按钮（除非有选中的有效配置）
  updateDeleteButtonState();
}

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant integrated into Zotero. Be concise and focus on academic tasks.";

// --- 新增：将配置方案加载到输入框 ---
function loadProfileIntoInputs(profile: AIConfigProfile | null) {
  if (!prefsDocument || !addonRef) return;
  ztoolkit.log(`Loading profile into inputs: ${profile?.name || 'None/Default'}`);

  const apiKeyInput = prefsDocument.getElementById(`pref-${addonRef}-apiKey`) as HTMLInputElement;
  const endpointInput = prefsDocument.getElementById(`pref-${addonRef}-apiEndpoint`) as HTMLInputElement;
  const modelInput = prefsDocument.getElementById(`pref-${addonRef}-modelName`) as HTMLInputElement;
  const tempInput = prefsDocument.getElementById(`pref-${addonRef}-temperature`) as HTMLInputElement;
  const promptInput = prefsDocument.getElementById(`pref-${addonRef}-systemPrompt`) as HTMLTextAreaElement;

  if (!apiKeyInput || !endpointInput || !modelInput || !tempInput || !promptInput) {
      ztoolkit.log("ERROR: One or more input elements not found for loading profile.");
      return;
  }

  apiKeyInput.value = profile?.apiKey || "";
  endpointInput.value = profile?.apiEndpoint || "";
  modelInput.value = profile?.modelName || "";
  promptInput.value = profile?.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  // 处理温度 (从 int*10 转为 float 显示)
  const tempInt = profile?.temperature;
  let tempFloat = 0.7; // 默认值
  if (typeof tempInt === 'number' && Number.isInteger(tempInt)) {
      const calculatedFloat = tempInt / 10.0;
      if (calculatedFloat >= 0 && calculatedFloat <= 2) {
          tempFloat = calculatedFloat;
      }
  }
  tempInput.value = tempFloat.toFixed(1); // 显示一位小数

  ztoolkit.log("Inputs populated with profile data.");
}

// --- 新增：处理下拉菜单选择变化 ---
export function handleProfileSelectChange(selectedName: string) {
  if (!prefsDocument || !prefsWindow) return;
  ztoolkit.log(`Profile selection changed: ${selectedName}`);

  const profile = getAIConfigByName(selectedName);
  if (profile) {
      loadProfileIntoInputs(profile);
      const profilesData = getAIConfigProfiles();
      profilesData.activeProfileName = selectedName;
      saveAIConfigProfiles(profilesData);
      ztoolkit.log(`Set "${selectedName}" as active profile.`);
  } else {
      ztoolkit.log(`WARN: Selected profile "${selectedName}" not found.`);
      loadProfileIntoInputs(null);
      const profilesData = getAIConfigProfiles();
      profilesData.activeProfileName = undefined;
      saveAIConfigProfiles(profilesData);
  }
  updateDeleteButtonState();
}

// --- 新增：处理保存当前配置按钮点击 ---
export function handleSaveCurrentProfile() {
  if (!prefsDocument || !prefsWindow || !addonRef) return;
  ztoolkit.log("Save Current Profile button clicked.");

  // 1. 从输入框读取当前值
  const apiKey = (prefsDocument.getElementById(`pref-${addonRef}-apiKey`) as HTMLInputElement).value;
  const apiEndpoint = (prefsDocument.getElementById(`pref-${addonRef}-apiEndpoint`) as HTMLInputElement).value;
  const modelName = (prefsDocument.getElementById(`pref-${addonRef}-modelName`) as HTMLInputElement).value;
  const systemPrompt = (prefsDocument.getElementById(`pref-${addonRef}-systemPrompt`) as HTMLTextAreaElement).value;

  // 读取并转换温度
  const tempInput = prefsDocument.getElementById(`pref-${addonRef}-temperature`) as HTMLInputElement;
  let temperatureInt = 7; // 默认 int*10
  try {
      const tempFloat = parseFloat(tempInput.value);
      if (!isNaN(tempFloat) && tempFloat >= 0 && tempFloat <= 2) {
          temperatureInt = Math.round(tempFloat * 10);
      } else {
           ztoolkit.log("Invalid temperature input, using default 0.7 (int 7).");
      }
  } catch (e) {
       ztoolkit.log("Error parsing temperature, using default 0.7 (int 7).", e);
  }

  // 2. 提示用户输入配置名称
  const profileName = prefsWindow.prompt("请输入配置方案的名称:", "");
  if (!profileName) {
      ztoolkit.log("Profile save cancelled by user.");
      return; // 用户取消
  }

  // 3. 创建新的配置对象
  const newProfile: AIConfigProfile = {
      name: profileName,
      apiKey,
      apiEndpoint,
      modelName,
      temperature: temperatureInt,
      systemPrompt
  };

  // 4. 加载现有配置，添加或更新，然后保存
  const profilesData = getAIConfigProfiles();
  const existingIndex = profilesData.profiles.findIndex(p => p.name === profileName);

  if (existingIndex !== -1) {
      // 更新现有配置
      if (!prefsWindow.confirm(`配置 "${profileName}" 已存在，是否覆盖？`)) {
          ztoolkit.log("Profile overwrite cancelled.");
          return;
      }
      profilesData.profiles[existingIndex] = newProfile;
      ztoolkit.log(`Profile "${profileName}" updated.`);
  } else {
      // 添加新配置
      profilesData.profiles.push(newProfile);
      ztoolkit.log(`Profile "${profileName}" added.`);
  }

  // 5. 将新保存/更新的配置设为活动配置
  profilesData.activeProfileName = profileName;

  // 6. 保存回 Prefs
  if (saveAIConfigProfiles(profilesData)) {
      ztoolkit.log("Profiles saved successfully.");
      // 7. 重新加载下拉菜单
      loadAndPopulateConfigProfiles();
      // (可选) 显示成功提示
      prefsWindow.alert(`配置 "${profileName}" 已保存并设为活动配置。`);
  } else {
      ztoolkit.log("ERROR: Failed to save profiles.");
      prefsWindow.alert("保存配置失败，请查看 Zotero 错误日志。");
  }
}

// --- 新增：处理删除选中配置按钮点击 ---
export function handleDeleteSelectedProfile() {
  if (!prefsDocument || !prefsWindow) return;
  ztoolkit.log("Delete Selected Profile button clicked.");

  const selectElement = prefsDocument.getElementById("ai-config-profile-select") as XUL.MenuList;
  if (!selectElement || selectElement.selectedItem === null) {
       ztoolkit.log("No profile selected for deletion.");
       return;
  }
  const selectedName = selectElement.value; // 获取选中的值 (名称)

  if (!selectedName) {
      ztoolkit.log("Cannot delete empty selection.");
      return;
  }

  // 确认删除
  if (!prefsWindow.confirm(`确定要删除配置 "${selectedName}" 吗？此操作无法撤销。`)) {
      ztoolkit.log("Profile deletion cancelled.");
      return;
  }

  // 加载配置，过滤掉要删除的，然后保存
  const profilesData = getAIConfigProfiles();
  const initialLength = profilesData.profiles.length;
  profilesData.profiles = profilesData.profiles.filter(p => p.name !== selectedName);

  if (profilesData.profiles.length < initialLength) {
      ztoolkit.log(`Profile "${selectedName}" removed.`);
      // 如果删除的是活动配置，清除活动名称或设为第一个
      if (profilesData.activeProfileName === selectedName) {
          profilesData.activeProfileName = profilesData.profiles.length > 0 ? profilesData.profiles[0].name : undefined;
          ztoolkit.log(`Deleted profile was active. New active profile: ${profilesData.activeProfileName || 'None'}`);
      }

      // 保存回 Prefs
      if (saveAIConfigProfiles(profilesData)) {
          ztoolkit.log("Profiles saved after deletion.");
          // 重新加载下拉菜单和输入框
          loadAndPopulateConfigProfiles();
          prefsWindow.alert(`配置 "${selectedName}" 已删除。`);
      } else {
          ztoolkit.log("ERROR: Failed to save profiles after deletion.");
          prefsWindow.alert("删除配置失败，请查看 Zotero 错误日志。");
      }
  } else {
      ztoolkit.log(`WARN: Profile "${selectedName}" not found for deletion.`);
  }
}

// --- 新增：更新删除按钮的禁用状态 ---
function updateDeleteButtonState() {
  if (!prefsDocument) return;
  const deleteButton = prefsDocument.getElementById("delete-config-profile-button") as HTMLButtonElement; // XUL button 也可以
  // *** 修改：获取 html:select ***
  const selectElement = prefsDocument.getElementById("ai-config-profile-select") as HTMLSelectElement;
  // *** 结束修改 ***
  if (deleteButton && selectElement) {
      deleteButton.disabled = !selectElement.value;
  }
}

// --- 新增：设置输入框监听器 (可选，用于实时反馈或验证) ---
function setupInputListeners() {
  if (!prefsDocument || !addonRef) return;
  // 示例：监听 API Key 输入
  // const apiKeyInput = prefsDocument.getElementById(`pref-${addonRef}-apiKey`) as HTMLInputElement;
  // apiKeyInput?.addEventListener('input', (event) => {
  //     const currentValue = (event.target as HTMLInputElement).value;
  //     // 可以在这里做一些实时验证或提示
  //     ztoolkit.log(`API Key input changed: ${currentValue}`);
  // });
  // 可以为其他输入框添加类似监听器
}

// --- 在 onPrefsEvent 中添加新的 case ---
// (需要修改 hooks.ts 中的 onPrefsEvent 调用)
export function handlePrefsEvent(type: string, data: { window: Window, [key: string]: any }) {
  ztoolkit.log("handlePrefsEvent triggered", type, data);
  prefsWindow = data.window; // 确保 window 对象被设置
  prefsDocument = data.window.document;
  addonRef = addon.data.config.addonRef;

  switch (type) {
    case "load":
        ztoolkit.log("Preferences window loaded");
        registerPrefsScripts(data.window);
        break;
    case "profileSelectChange": // 事件名不变，来自 onchange
        ztoolkit.log("Profile select change event triggered");
        if (data.selectedName !== undefined) {
            handleProfileSelectChange(data.selectedName);
        } else {
            ztoolkit.log("WARN: profileSelectChange event missing selectedName.");
        }
        break;
    case "saveCurrentProfile":
      ztoolkit.log("Save current profile event triggered");
      handleSaveCurrentProfile();
      break;
    case "deleteSelectedProfile":
      ztoolkit.log("Delete selected profile event triggered");
      handleDeleteSelectedProfile();
      break;
    case "addButton": // 自定义按钮相关，保持
      ztoolkit.log("Add button event triggered");
      addButton();
      break;
    case "saveButtons": // 自定义按钮相关，保持
      ztoolkit.log("Save buttons event triggered");
      saveButtons();
      break;
    default:
      ztoolkit.log(`Unknown preference event type: ${type}`);
  }
}

/*async function updatePrefsUI() {
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
}*/

// 设置温度控制
/*function setupTemperatureControl() {
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
}*/

/*function bindPrefEvents() {
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
}*/

// 加载按钮配置
function ButtonsConfig() {
  ztoolkit.log("Loading buttons configuration...");
  
  if (!prefsWindow) { // <--- 修改这里
    ztoolkit.log("ERROR: prefs window not available for loading buttons");
    return;
  }

  const doc = prefsWindow.document; // <--- 可以直接用 prefsWindow.document
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
  
  if (!prefsWindow) { // <--- 修改这里
    ztoolkit.log("ERROR: prefs window not available for saving buttons");
    return;
  }

  const doc = prefsWindow.document;
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
  
  if (!prefsWindow) { // <--- 修改这里
    ztoolkit.log("ERROR: prefs window not available for adding button");
    return;
  }
  
  const doc = prefsWindow.document;
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
