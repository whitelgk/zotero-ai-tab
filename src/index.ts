// src/index.ts
Zotero.debug("Index.ts: Starting execution..."); // 日志 Index-Start

import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "./addon";
import { config } from "../package.json";

const basicTool = new BasicTool();

// @ts-ignore - Plugin instance is not typed
if (!basicTool.getGlobal("Zotero")[config.addonInstance]) {
  Zotero.debug("Index.ts: Creating Addon instance..."); // 日志 Index-Create
  _globalThis.addon = new Addon();
  Zotero.debug("Index.ts: Addon instance created."); // 日志 Index-Created
  defineGlobal("ztoolkit", () => {
    return _globalThis.addon.data.ztoolkit;
  });
  // @ts-ignore - Plugin instance is not typed
  Zotero[config.addonInstance] = addon;
} else {
  Zotero.debug("Index.ts: Addon instance already exists."); // 日志 Index-Exists
}

function defineGlobal(name: Parameters<BasicTool["getGlobal"]>[0]): void;
function defineGlobal(name: string, getter: () => any): void;
function defineGlobal(name: string, getter?: () => any) {
  Object.defineProperty(_globalThis, name, {
    get() {
      return getter ? getter() : basicTool.getGlobal(name);
    },
  });
}

Zotero.debug("Index.ts: Finished execution."); // 日志 Index-End