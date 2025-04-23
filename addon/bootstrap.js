/* eslint-disable no-undef */

/**
 * Most of this code is from Zotero team's official Make It Red example[1]
 * or the Zotero 7 documentation[2].
 * [1] https://github.com/zotero/make-it-red
 * [2] https://www.zotero.org/support/dev/zotero_7_for_developers
 */

var chromeHandle;
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { Zotero } = ChromeUtils.import("resource://zotero/Zotero.jsm");

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;

  // String 'rootURI' introduced in Zotero 7
  if (!rootURI) {
    rootURI = resourceURI.spec;
  }

  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "__addonRef__", rootURI + "content/"],
  ]);

  /**
   * Global variables for plugin code.
   * The `_globalThis` is the global root variable of the plugin sandbox environment
   * and all child variables assigned to it is globally accessible.
   * See `src/index.ts` for details.
   */
  const ctx = {
    rootURI,
  };
  ctx._globalThis = ctx;

  Services.scriptloader.loadSubScript(
    `${rootURI}/content/scripts/__addonRef__.js`,
    ctx,
  );
  Zotero.__addonInstance__.hooks.onStartup();
  Services.wm.addListener(WindowListener);
Zotero.debug("Bootstrap: Window listener added."); // 添加日志
}
/*
async function onMainWindowLoad({ window }, reason) {
  Zotero.__addonInstance__?.hooks.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, reason) {
  Zotero.__addonInstance__?.hooks.onMainWindowUnload(window);
}
*/
function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }
  Services.wm.removeListener(WindowListener);
  Zotero.debug("Bootstrap: Window listener removed."); // 添加日志

  if (typeof Zotero === "undefined") {
    Zotero = Components.classes["@zotero.org/Zotero;1"].getService(
      Components.interfaces.nsISupports,
    ).wrappedJSObject;
  }
  Zotero.__addonInstance__?.hooks.onShutdown();

  Cc["@mozilla.org/intl/stringbundle;1"]
    .getService(Components.interfaces.nsIStringBundleService)
    .flushBundles();

  Cu.unload(`${rootURI}/content/scripts/__addonRef__.js`);

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function uninstall(data, reason) {}


// --- WindowListener ---
var WindowListener = {
  onOpenWindow: function (aWindow) {
    // Wait for the window to finish loading
    let domWindow = aWindow.docShell.domWindow;
    domWindow.addEventListener(
      "load",
      function listener() { // 给监听器一个名字，方便调试（可选）
        domWindow.removeEventListener("load", listener, false); // 使用具名函数移除自身
        // Check if this is a Zotero main window
        if (
          domWindow.document.documentElement.getAttribute("windowtype") == "navigator:browser" || // Zotero 6
          domWindow.document.location?.href === "chrome://zotero/content/zoteroPane.xhtml" // Zotero 7
        ) {
          Zotero.debug("WindowListener: Zotero main window loaded."); // 添加日志
          // Call onMainWindowLoad hook if the addon instance exists
          // 使用你的插件实例名称 __addonInstance__ (例如 AIChatTab)
          if (Zotero.AIChatTab && Zotero.AIChatTab.hooks && typeof Zotero.AIChatTab.hooks.onMainWindowLoad === 'function') {
             Zotero.debug("WindowListener: Calling onMainWindowLoad...");
             try {
                Zotero.AIChatTab.hooks.onMainWindowLoad(domWindow); // <--- 调用你插件的钩子
             } catch (e) {
                Zotero.debug("WindowListener: Error calling onMainWindowLoad:", e);
             }
          } else {
             Zotero.debug("WindowListener: Addon instance or onMainWindowLoad hook not found.");
          }
        }
      },
      false
    );
  },
  onCloseWindow: function (aWindow) {
      // 可选：在这里处理窗口关闭事件，例如调用 onMainWindowUnload
      let domWindow = aWindow.docShell.domWindow;
       if (
          domWindow.document.documentElement.getAttribute("windowtype") == "navigator:browser" ||
          domWindow.document.location?.href === "chrome://zotero/content/zoteroPane.xhtml"
        ) {
             Zotero.debug("WindowListener: Zotero main window closing.");
             if (Zotero.AIChatTab && Zotero.AIChatTab.hooks && typeof Zotero.AIChatTab.hooks.onMainWindowUnload === 'function') {
                 Zotero.debug("WindowListener: Calling onMainWindowUnload...");
                 try {
                     Zotero.AIChatTab.hooks.onMainWindowUnload(domWindow); // <--- 调用你插件的钩子
                 } catch (e) {
                     Zotero.debug("WindowListener: Error calling onMainWindowUnload:", e);
                 }
             } else {
                 Zotero.debug("WindowListener: Addon instance or onMainWindowUnload hook not found.");
             }
        }
  },
  onWindowTitleChange: function (aWindow, aTitle) {},
};
