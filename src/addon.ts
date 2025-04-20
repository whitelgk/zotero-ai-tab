// src/addon.ts
import { config } from "../package.json";
import { ColumnOptions, DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import * as prefsUtils from "./utils/prefs"; // <--- 导入 prefs 工具

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
      columns: Array<ColumnOptions>;
      rows: Array<{ [dataKey: string]: string }>;
    };
    dialog?: DialogHelper;
  };
  public hooks: typeof hooks;
  // 将工具函数挂载到 api 对象上
  public api: {
    getPref: typeof prefsUtils.getPref;
    setPref: typeof prefsUtils.setPref;
    clearPref: typeof prefsUtils.clearPref;
    getAIChatConfig: typeof prefsUtils.getAIChatConfig;
  };

  constructor() {
    Zotero.debug("Addon.ts: Constructor starting..."); // 日志 Addon-Start
    this.data = {
      alive: true,
      config,
      env: __env__,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    // 在构造函数中赋值
    this.api = {
      getPref: prefsUtils.getPref,
      setPref: prefsUtils.setPref,
      clearPref: prefsUtils.clearPref,
      getAIChatConfig: prefsUtils.getAIChatConfig,
    };
    Zotero.debug("Addon.ts: Constructor finished."); // 日志 Addon-End
  }
}

export default Addon;