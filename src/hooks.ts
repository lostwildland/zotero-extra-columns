import { config } from "../package.json";
import { ColumnPickerOrganizer } from "./columnPickerOrganizer";
import { ExtraCleaner } from "./extraCleaner";
import { ExtraColumnRegistry } from "./extraColumnRegistry";
import { ExtraMenu } from "./extraMenu";
import type { ExtraFieldDefinition } from "./extraParser";
import { ExtraSection } from "./extraSection";

const ITEM_EVENTS = new Set(["add", "modify", "delete", "trash", "untrash"]);

async function onStartup() {
  await Zotero.initializationPromise;

  const rescanDelayMS = getRescanDelay();
  const registry = new ExtraColumnRegistry(config.addonID);
  const cleaner = new ExtraCleaner();
  const menuRef: { current?: ExtraMenu } = {};
  const menu = new ExtraMenu(
    config.addonID,
    config.addonRef,
    cleaner,
    (): Promise<ExtraFieldDefinition[]> =>
      menuRef.current
        ? refreshExtraFields(registry, menuRef.current)
        : Promise.resolve([]),
  );
  menuRef.current = menu;
  const columnPickerOrganizer = new ColumnPickerOrganizer(registry);
  const section = new ExtraSection(config.addonID, config.addonRef);

  addon.data.cleaner = cleaner;
  addon.data.columnPickerOrganizer = columnPickerOrganizer;
  addon.data.menu = menu;
  addon.data.registry = registry;
  addon.data.section = section;

  try {
    section.register();
    prepareMainWindows(columnPickerOrganizer);

    addon.data.notifierID = Zotero.Notifier.registerObserver(
      {
        notify: (event, type) => {
          if (type !== "item" || !ITEM_EVENTS.has(event)) {
            return;
          }
          registry.scheduleScan(rescanDelayMS, (definitions) =>
            menu.register(definitions),
          );
          section.scheduleRefresh(rescanDelayMS);
          Zotero.ItemTreeManager.refreshColumns();
        },
      },
      ["item"],
      config.addonRef,
    );

    refreshExtraFields(registry, menu).catch(recordStartupError);
  } catch (error) {
    recordStartupError(error);
  } finally {
    addon.data.initialized = true;
  }
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  prepareMainWindow(win, addon.data.columnPickerOrganizer);
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  return;
}

function onShutdown(): void {
  if (addon.data.notifierID) {
    Zotero.Notifier.unregisterObserver(addon.data.notifierID);
    delete addon.data.notifierID;
  }

  addon.data.menu?.unregisterAll();
  addon.data.columnPickerOrganizer?.unpatchAll();
  addon.data.section?.unregister();
  addon.data.registry?.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - plugin instance is intentionally dynamic.
  delete Zotero[config.addonInstance];
}

async function refreshExtraFields(
  registry: ExtraColumnRegistry,
  menu: ExtraMenu,
): Promise<ExtraFieldDefinition[]> {
  const definitions = await registry.scanAndRegister();
  menu.register(definitions);
  return definitions;
}

function prepareMainWindows(
  columnPickerOrganizer: ColumnPickerOrganizer,
): void {
  for (const win of Zotero.getMainWindows()) {
    prepareMainWindow(win, columnPickerOrganizer);
  }
}

function prepareMainWindow(
  win: _ZoteroTypes.MainWindow,
  columnPickerOrganizer?: ColumnPickerOrganizer,
): void {
  win.MozXULElement.insertFTLIfNeeded(`${config.addonRef}-mainWindow.ftl`);
  columnPickerOrganizer?.patchMainWindow(win);
}

function getRescanDelay(): number {
  const value = Zotero.Prefs.get(`${config.prefsPrefix}.rescanDelayMS`);
  return typeof value === "number" && value >= 0 ? value : 750;
}

function recordStartupError(error: unknown): void {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  addon.data.startupError = message;
  Zotero.logError(error instanceof Error ? error : new Error(message));
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
