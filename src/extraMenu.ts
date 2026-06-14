import type {
  ExtraCleaner,
  ExtraCleanProgress,
  ExtraCleanScope,
} from "./extraCleaner";
import {
  discoverExtraFieldDefinitions,
  type ExtraFieldDefinition,
} from "./extraParser";

const TOOL_MENU_ID = "tools-extra-columns";
const ITEM_CONTEXT_MENU_ID = "item-context-extra-columns";
const MENU_ICON = "extra-columns-menu.svg";

type AnyMenuContext = _ZoteroTypes.MenuManager.MenuContext;
type CleanMode = "all" | "selected";

interface CleanFieldOptions {
  mode: CleanMode;
  scope?: ExtraCleanScope;
  selectionCount?: number;
}

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
    const isItemContext = options.target === "main/library/item";
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
            if (isItemContext) {
              context.setVisible(Boolean(context.items?.length));
            }
          },
          menus: isItemContext
            ? [
                {
                  menuType: "submenu",
                  onShowing: (_event, context) => {
                    setMenuLabel(context, menuText("cleanSelected"));
                    context.setVisible(Boolean(context.items?.length));
                  },
                  menus: this.createCleanFieldMenus({
                    definitions: options.definitions,
                    mode: "selected",
                  }),
                },
                {
                  menuType: "submenu",
                  onShowing: (_event, context) => {
                    setMenuLabel(context, menuText("cleanAllContext"));
                  },
                  menus: this.createCleanFieldMenus({
                    definitions: options.definitions,
                    mode: "all",
                  }),
                },
              ]
            : [
                {
                  menuType: "submenu",
                  onShowing: (_event, context) => {
                    setMenuLabel(context, menuText("cleanAll"));
                  },
                  menus: this.createCleanFieldMenus({
                    definitions: options.definitions,
                    mode: "all",
                  }),
                },
              ],
        },
      ],
    });

    if (registeredMenuID) {
      this.registeredMenuIDs.push(registeredMenuID);
    }
  }

  private createCleanFieldMenus(options: {
    definitions: ExtraFieldDefinition[];
    mode: CleanMode;
  }): _ZoteroTypes.MenuManager.MenuData[] {
    const { definitions, mode } = options;
    if (definitions.length === 0) {
      return [
        {
          menuType: "menuitem",
          onShowing: (_event, context) => {
            setMenuLabel(
              context,
              menuText(mode === "selected" ? "noSelectedFields" : "noFields"),
            );
            context.setEnabled(false);
          },
        },
      ];
    }

    const fieldMenus = definitions.map((definition) => ({
      menuType: "menuitem" as const,
      onShowing: (_event: Event, context: AnyMenuContext) => {
        const scopedDefinition =
          mode === "selected"
            ? findSelectedDefinition(context, definition.canonicalKey)
            : definition;

        context.setVisible(Boolean(scopedDefinition));
        context.setEnabled(Boolean(scopedDefinition));
        setMenuLabel(
          context,
          menuText(
            "cleanItem",
            scopedDefinition?.label || definition.label,
            scopedDefinition?.count || definition.count,
          ),
        );
      },
      onCommand: (_event: Event, context: AnyMenuContext) => {
        const scopedDefinition =
          mode === "selected"
            ? findSelectedDefinition(context, definition.canonicalKey)
            : definition;
        if (!scopedDefinition) {
          return;
        }

        this.cleanField(
          scopedDefinition,
          context,
          cleanOptions(context, mode),
        ).catch((error) => {
          Zotero.logError(
            error instanceof Error ? error : new Error(String(error)),
          );
          alertError(context, error);
        });
      },
    }));

    if (mode !== "selected") {
      return fieldMenus;
    }

    return [
      {
        menuType: "menuitem",
        onShowing: (_event, context) => {
          setMenuLabel(context, menuText("noSelectedFields"));
          context.setEnabled(false);
          context.setVisible(getSelectedDefinitions(context).length === 0);
        },
      },
      ...fieldMenus,
    ];
  }

  private async cleanField(
    definition: ExtraFieldDefinition,
    context: AnyMenuContext,
    options: CleanFieldOptions,
  ): Promise<void> {
    const preview = await this.cleaner.preview(
      definition.canonicalKey,
      options.scope,
    );
    if (preview.linesRemoved === 0) {
      alertInfo(
        context,
        options.mode === "selected"
          ? message("nothingToCleanSelected", definition.label)
          : message("nothingToClean", definition.label),
      );
      await this.refreshFields();
      return;
    }

    const confirmed = confirmAction(
      context,
      options.mode === "selected"
        ? message(
            "confirmCleanSelected",
            definition.label,
            options.selectionCount || 0,
            preview.itemsChanged,
            preview.linesRemoved,
          )
        : message(
            "confirmClean",
            definition.label,
            preview.itemsChanged,
            preview.linesRemoved,
          ),
    );
    if (!confirmed) {
      return;
    }

    const progressWindow = createCleanProgressWindow(
      context,
      this.menuIconURL,
      definition.label,
      preview.itemsChanged,
    );

    const result = await this.cleaner
      .clean(definition.canonicalKey, options.scope, progressWindow.update)
      .catch((error) => {
        progressWindow.fail(errorMessage(error));
        throw error;
      });
    progressWindow.finish(result.failedItems.length);
    await this.refreshFields();
    Zotero.ItemTreeManager.refreshColumns();

    alertInfo(
      context,
      options.mode === "selected"
        ? message(
            "cleanSelectedDone",
            definition.label,
            options.selectionCount || 0,
            result.itemsChanged,
            result.linesRemoved,
            result.failedItems.length,
          )
        : message(
            "cleanDone",
            definition.label,
            result.itemsChanged,
            result.linesRemoved,
            result.failedItems.length,
          ),
    );
  }
}

interface CleanProgressWindow {
  update(progress: ExtraCleanProgress): void;
  finish(failedItems: number): void;
  fail(detail: string): void;
}

function createCleanProgressWindow(
  context: AnyMenuContext,
  iconURL: string,
  label: string,
  totalItems: number,
): CleanProgressWindow {
  const win = new Zotero.ProgressWindow({
    window: getWindow(context),
    closeOnClick: true,
  });
  win.changeHeadline(message("progressHeadline", label), iconURL);
  const line = new win.ItemProgress(
    iconURL,
    message("progressLine", 0, totalItems),
  );
  line.setProgress(0);
  win.show();

  return {
    update(progress) {
      const total = progress.totalItems || totalItems;
      const percent =
        total > 0 ? Math.floor((progress.processedItems / total) * 100) : 100;
      line.setText(message("progressLine", progress.processedItems, total));
      line.setProgress(Math.min(100, Math.max(0, percent)));
    },
    finish(failedItems) {
      if (failedItems > 0) {
        line.setText(message("progressDoneWithFailures", failedItems));
        line.setError();
      } else {
        line.setText(message("progressDone"));
        line.setProgress(100);
      }
      win.startCloseTimer(4000);
    },
    fail(detail) {
      line.setText(message("progressFailed", detail));
      line.setError();
      win.startCloseTimer(8000);
    },
  };
}

function setMenuLabel(context: AnyMenuContext, label: string): void {
  context.menuElem.setAttribute("label", label);
}

function setMenuIcon(context: AnyMenuContext, iconURL: string): void {
  context.menuElem.classList.add("menu-iconic");
  context.menuElem.setAttribute("image", iconURL);
  context.menuElem.style.listStyleImage = `url("${iconURL}")`;
}

function menuText(
  key:
    | "root"
    | "cleanAll"
    | "cleanAllContext"
    | "cleanSelected"
    | "noFields"
    | "noSelectedFields",
): string;
function menuText(key: "cleanItem", label: string, count: number): string;
function menuText(key: string, label?: string, count?: number): string {
  const zh = isChineseLocale();
  if (key === "root") {
    return "Extra Columns";
  }
  if (key === "cleanAll") {
    return zh ? "清理 Extra 字段" : "Clean Extra Field";
  }
  if (key === "cleanAllContext") {
    return zh ? "清理所有条目的 Extra 字段" : "Clean Extra Field (All Items)";
  }
  if (key === "cleanSelected") {
    return zh ? "清理选中条目的 Extra 字段" : "Clean Selected Extra Field";
  }
  if (key === "noFields") {
    return zh ? "没有可清理字段" : "No Extra fields found";
  }
  if (key === "noSelectedFields") {
    return zh
      ? "选中条目没有可清理字段"
      : "No Extra fields found in selected items";
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
function message(key: "nothingToCleanSelected", label: string): string;
function message(key: "progressHeadline", label: string): string;
function message(key: "progressLine", processed: number, total: number): string;
function message(key: "progressDone"): string;
function message(key: "progressDoneWithFailures", failedItems: number): string;
function message(key: "progressFailed", detail: string): string;
function message(
  key: "confirmClean",
  label: string,
  itemsChanged: number,
  linesRemoved: number,
): string;
function message(
  key: "confirmCleanSelected",
  label: string,
  selectionCount: number,
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
function message(
  key: "cleanSelectedDone",
  label: string,
  selectionCount: number,
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
  if (key === "nothingToCleanSelected") {
    return zh
      ? `选中条目中没有找到可清理的「${args[0]}」字段。`
      : `No removable "${args[0]}" fields were found in selected items.`;
  }
  if (key === "progressHeadline") {
    return zh ? `正在清理「${args[0]}」` : `Cleaning "${args[0]}"`;
  }
  if (key === "progressLine") {
    return zh
      ? `已处理 ${args[0]} / ${args[1]} 个条目`
      : `Processed ${args[0]} of ${args[1]} items`;
  }
  if (key === "progressDone") {
    return zh ? "清理完成" : "Cleanup complete";
  }
  if (key === "progressDoneWithFailures") {
    return zh
      ? `清理完成，${args[0]} 个条目失败`
      : `Cleanup complete with ${args[0]} failures`;
  }
  if (key === "progressFailed") {
    return zh ? `清理失败：${args[0]}` : `Cleanup failed: ${args[0]}`;
  }
  if (key === "confirmClean") {
    return zh
      ? `确定要从所有条目的 Extra 栏删除「${args[0]}」吗？\n\n将影响 ${args[1]} 个条目，删除 ${args[2]} 行。\n此操作会直接修改 Zotero 数据，请确认已同步或备份。`
      : `Remove "${args[0]}" from the Extra field of all items?\n\nThis will affect ${args[1]} items and remove ${args[2]} lines.\nThis directly modifies Zotero data, so make sure your library is synced or backed up.`;
  }
  if (key === "confirmCleanSelected") {
    return zh
      ? `确定要从当前选中的 ${args[1]} 个条目的 Extra 栏删除「${args[0]}」吗？\n\n将实际影响 ${args[2]} 个条目，删除 ${args[3]} 行。未选中的条目不会被修改。\n此操作会直接修改 Zotero 数据，请确认已同步或备份。`
      : `Remove "${args[0]}" from the Extra field of the ${args[1]} selected items?\n\nThis will affect ${args[2]} selected items and remove ${args[3]} lines. Unselected items will not be modified.\nThis directly modifies Zotero data, so make sure your library is synced or backed up.`;
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
  if (key === "cleanSelectedDone") {
    const failedItems = Number(args[4]);
    const failedSuffix = failedItems
      ? zh
        ? `\n${failedItems} 个条目清理失败，详情见 Zotero 日志。`
        : `\n${failedItems} items failed. Check the Zotero log for details.`
      : "";
    return zh
      ? `已清理选中条目的「${args[0]}」。\n\n选中 ${args[1]} 个条目，修改 ${args[2]} 个条目，删除 ${args[3]} 行。${failedSuffix}`
      : `Cleaned "${args[0]}" from selected items.\n\nSelected ${args[1]} items, updated ${args[2]} items, and removed ${args[3]} lines.${failedSuffix}`;
  }
  return zh
    ? `清理 Extra 字段时出错：${args[0]}`
    : `Failed to clean Extra field: ${args[0]}`;
}

function cleanOptions(
  context: AnyMenuContext,
  mode: CleanMode,
): CleanFieldOptions {
  if (mode === "all") {
    return { mode };
  }

  const selectedItems = getSelectedItems(context);
  return {
    mode,
    scope: {
      itemIDs: selectedItems.map((item) => item.id),
    },
    selectionCount: selectedItems.length,
  };
}

function findSelectedDefinition(
  context: AnyMenuContext,
  canonicalKey: string,
): ExtraFieldDefinition | undefined {
  return getSelectedDefinitions(context).find(
    (definition) => definition.canonicalKey === canonicalKey,
  );
}

function getSelectedDefinitions(
  context: AnyMenuContext,
): ExtraFieldDefinition[] {
  return discoverExtraFieldDefinitions(
    getSelectedItems(context).map(getItemExtra),
  );
}

function getSelectedItems(context: AnyMenuContext): Zotero.Item[] {
  return Array.isArray(context.items) ? context.items : [];
}

function getItemExtra(item: Zotero.Item): string {
  const extra = item.getField("extra");
  return typeof extra === "string" ? extra : "";
}

function isChineseLocale(): boolean {
  const zotero = Zotero as typeof Zotero & { locale?: string };
  const locale =
    zotero.locale || String(Zotero.Prefs.get("intl.locale.requested") || "");
  return locale.toLowerCase().startsWith("zh");
}
