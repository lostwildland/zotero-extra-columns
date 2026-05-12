import { BasicTool } from "zotero-plugin-toolkit";
import { config } from "../package.json";
import Addon from "./addon";

const basicTool = new BasicTool();
const zoteroGlobal = basicTool.getGlobal("Zotero") as _ZoteroTypes.Zotero &
  Record<string, unknown>;

if (!zoteroGlobal[config.addonInstance]) {
  const instance = new Addon();
  _globalThis.addon = instance;
  zoteroGlobal[config.addonInstance] = instance;
  defineGlobal("Zotero");
}

function defineGlobal(name: Parameters<BasicTool["getGlobal"]>[0]): void {
  Object.defineProperty(_globalThis, name, {
    get() {
      return basicTool.getGlobal(name);
    },
  });
}
