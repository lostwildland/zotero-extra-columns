import type { ExtraCleaner } from "./extraCleaner";
import type { ExtraFieldDefinition } from "./extraParser";

const TOOL_MENU_ID = "tools-extra-columns";
const ITEM_CONTEXT_MENU_ID = "item-context-extra-columns";
const MENU_ICON = "extra-columns-menu.svg";

type AnyMenuContext = _ZoteroTypes.MenuManager.MenuContext;

export class ExtraMenu {
  private registeredMenuIDs: string[] = [];

  constructor(
    private readonly pluginID: string,
    private readonly addonRef: string,
    private readonly cleaner: ExtraCleaner,
    private readonly refreshFields: () => Promise<ExtraFieldDefinition[]>,
  ) {}

  private get menuIconURL(): string {
    return `chrome://${this.addonRef}/content/icons/${MENU_ICON}`;
  }

  register(definitions: ExtraFieldDefinition[]): void {
    this.unregisterAll();

    this.registerMenu({
      menuID: TOOL_MENU_ID,
      target: "main/menubar/tools",
      definitions,
    });

    this.registerMenu({
      menuID: ITEM_CONTEXT_MENU_ID,
      target: "main/library/item",
      definitions,
    });
  }

  unregisterAll(): void {
    for (const menuID of this.registeredMenuIDs) {
      Zotero.MenuManager.unregisterMenu(menuID);
    }
    this.registeredMenuIDs = [];
  }

  private registerMenu(options: {
    menuID: string;
    target: _ZoteroTypes.MenuManager.ValidTarget;
    definitions: ExtraFieldDefinition[];
  }): void {
    const registeredMenuID = Zotero.MenuManager.registerMenu({
      menuID: options.menuID,
      pluginID: this.pluginID,
      target: options.target,
      menus: [
        {
          menuType: "submenu",
          icon: this.menuIconURL,
          onShowing: (_event, context) => {
            setMenuLabel(context, menuText("root"));
            setMenuIcon(context, this.menuIconURL);
            if (options.target === "main/library/item") {
              context.setVisible(Boolean(context.items?.length));
            }
          },
          menus: [
            {
              menuType: "submenu",
              onShowing: (_event, context) => {
                setMenuLabel(context, menuText("clean"));
              },
              menus: this.createCleanFieldMenus(options.definitions),
            },
          ],
        },
      ],
    });

    if (registeredMenuID) {
      this.registeredMenuIDs.push(registeredMenuID);
    }
  }

  private createCleanFieldMenus(
    definitions: ExtraFieldDefinition[],
  ): _ZoteroTypes.MenuManager.MenuData[] {
    if (definitions.length === 0) {
      return [
        {
          menuType: "menuitem",
          onShowing: (_event, context) => {
            setMenuLabel(context, menuText("noFields"));
            context.setEnabled(false);
          },
        },
      ];
    }

    return definitions.map((definition) => ({
      menuType: "menuitem",
      onShowing: (_event, context) => {
        setMenuLabel(
          context,
          menuText("cleanItem", definition.label, definition.count),
        );
      },
      onCommand: (_event, context) => {
        this.cleanField(definition, context).catch((error) => {
          Zotero.logError(
            error instanceof Error ? error : new Error(String(error)),
          );
          alertError(context, error);
        });
      },
    }));
  }

  private async cleanField(
    definition: ExtraFieldDefinition,
    context: AnyMenuContext,
  ): Promise<void> {
    const preview = await this.cleaner.preview(definition.canonicalKey);
    if (preview.linesRemoved === 0) {
      alertInfo(context, message("nothingToClean", definition.label));
      await this.refreshFields();
      return;
    }

    const confirmed = confirmAction(
      context,
      message(
        "confirmClean",
        definition.label,
        preview.itemsChanged,
        preview.linesRemoved,
      ),
    );
    if (!confirmed) {
      return;
    }

    const result = await this.cleaner.clean(definition.canonicalKey);
    await this.refreshFields();
    Zotero.ItemTreeManager.refreshColumns();

    alertInfo(
      context,
      message(
        "cleanDone",
        definition.label,
        result.itemsChanged,
        result.linesRemoved,
        result.failedItems.length,
      ),
    );
  }
}

function setMenuLabel(context: AnyMenuContext, label: string): void {
  context.menuElem.setAttribute("label", label);
}

function setMenuIcon(context: AnyMenuContext, iconURL: string): void {
  context.menuElem.classList.add("menu-iconic");
  context.menuElem.setAttribute("image", iconURL);
  context.menuElem.style.listStyleImage = `url("${iconURL}")`;
}

function menuText(key: "root" | "clean" | "noFields"): string;
function menuText(key: "cleanItem", label: string, count: number): string;
function menuText(key: string, label?: string, count?: number): string {
  const zh = isChineseLocale();
  if (key === "root") {
    return "Extra Columns";
  }
  if (key === "clean") {
    return zh ? "清理 Extra 字段" : "Clean Extra Field";
  }
  if (key === "noFields") {
    return zh ? "没有可清理字段" : "No Extra fields found";
  }
  return zh ? `删除 ${label}（${count}）` : `Remove ${label} (${count})`;
}

function confirmAction(context: AnyMenuContext, text: string): boolean {
  return getWindow(context).confirm(text);
}

function alertInfo(context: AnyMenuContext, text: string): void {
  getWindow(context).alert(text);
}

function alertError(context: AnyMenuContext, error: unknown): void {
  alertInfo(context, message("error", errorMessage(error)));
}

function getWindow(context: AnyMenuContext): Window {
  const win = context.menuElem.ownerGlobal;
  if (!win) {
    throw new Error("Menu window is unavailable");
  }
  return win as Window;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function message(key: "nothingToClean", label: string): string;
function message(
  key: "confirmClean",
  label: string,
  itemsChanged: number,
  linesRemoved: number,
): string;
function message(
  key: "cleanDone",
  label: string,
  itemsChanged: number,
  linesRemoved: number,
  failedItems: number,
): string;
function message(key: "error", detail: string): string;
function message(key: string, ...args: Array<number | string>): string {
  const zh = isChineseLocale();
  if (key === "nothingToClean") {
    return zh
      ? `没有找到可清理的「${args[0]}」字段。`
      : `No removable "${args[0]}" fields were found.`;
  }
  if (key === "confirmClean") {
    return zh
      ? `确定要从所有条目的 Extra 栏删除「${args[0]}」吗？\n\n将影响 ${args[1]} 个条目，删除 ${args[2]} 行。\n此操作会直接修改 Zotero 数据，请确认已同步或备份。`
      : `Remove "${args[0]}" from the Extra field of all items?\n\nThis will affect ${args[1]} items and remove ${args[2]} lines.\nThis directly modifies Zotero data, so make sure your library is synced or backed up.`;
  }
  if (key === "cleanDone") {
    const failedItems = Number(args[3]);
    const failedSuffix = failedItems
      ? zh
        ? `\n${failedItems} 个条目清理失败，详情见 Zotero 日志。`
        : `\n${failedItems} items failed. Check the Zotero log for details.`
      : "";
    return zh
      ? `已清理「${args[0]}」。\n\n修改 ${args[1]} 个条目，删除 ${args[2]} 行。${failedSuffix}`
      : `Cleaned "${args[0]}".\n\nUpdated ${args[1]} items and removed ${args[2]} lines.${failedSuffix}`;
  }
  return zh
    ? `清理 Extra 字段时出错：${args[0]}`
    : `Failed to clean Extra field: ${args[0]}`;
}

function isChineseLocale(): boolean {
  const zotero = Zotero as typeof Zotero & { locale?: string };
  const locale =
    zotero.locale || String(Zotero.Prefs.get("intl.locale.requested") || "");
  return locale.toLowerCase().startsWith("zh");
}
