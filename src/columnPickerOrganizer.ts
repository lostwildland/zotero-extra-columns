import type { ExtraColumnRegistry } from "./extraColumnRegistry";

interface PatchedItemsView {
  buildColumnPickerMenu?: (menupopup: XULMenuPopupElement) => void;
  _getColumns?: () => Array<{ dataKey?: string }>;
}

interface PatchedWindow {
  ZoteroPane?: {
    itemsView?: PatchedItemsView;
  };
}

interface PatchRecord {
  itemsView: PatchedItemsView;
  originalBuildColumnPickerMenu: (menupopup: XULMenuPopupElement) => void;
}

const MORE_COLUMNS_POPUP_ANON_ID = "zotero-column-picker-more-menu-popup";
const EXTRA_COLUMNS_MENU_ANON_ID = "zotero-column-picker-extra-columns-menu";
const EXTRA_COLUMNS_SEPARATOR_ANON_ID =
  "zotero-column-picker-extra-columns-separator";

export class ColumnPickerOrganizer {
  private patches: PatchRecord[] = [];

  constructor(private readonly registry: ExtraColumnRegistry) {}

  patchMainWindow(win: Window): void {
    const itemsView = (win as unknown as PatchedWindow).ZoteroPane?.itemsView;
    if (!itemsView?.buildColumnPickerMenu || !itemsView._getColumns) {
      return;
    }
    if (this.patches.some((patch) => patch.itemsView === itemsView)) {
      return;
    }

    const originalBuildColumnPickerMenu = itemsView.buildColumnPickerMenu;
    const organizeExtraColumns = this.organizeExtraColumns.bind(this);
    itemsView.buildColumnPickerMenu = function (
      this: PatchedItemsView,
      menupopup: XULMenuPopupElement,
    ) {
      originalBuildColumnPickerMenu.call(this, menupopup);
      organizeExtraColumns(this, menupopup);
    };

    this.patches.push({ itemsView, originalBuildColumnPickerMenu });
  }

  unpatchAll(): void {
    for (const patch of this.patches) {
      patch.itemsView.buildColumnPickerMenu =
        patch.originalBuildColumnPickerMenu;
    }
    this.patches = [];
  }

  private organizeExtraColumns(
    itemsView: PatchedItemsView,
    menupopup: XULMenuPopupElement,
  ): void {
    const extraDataKeys = this.registry.getRegisteredDataKeys();
    if (extraDataKeys.size === 0) {
      return;
    }

    const moreColumnsPopup = menupopup.querySelector(
      `[anonid="${MORE_COLUMNS_POPUP_ANON_ID}"]`,
    );
    if (!moreColumnsPopup) {
      return;
    }

    const columns = itemsView._getColumns?.() || [];
    const extraMenuItems = Array.from(moreColumnsPopup.children).filter(
      (child): child is XULMenuItemElement => {
        if (child.localName !== "menuitem") {
          return false;
        }
        const columnIndex = Number(child.getAttribute("colindex"));
        const dataKey = columns[columnIndex]?.dataKey;
        return typeof dataKey === "string" && extraDataKeys.has(dataKey);
      },
    );

    if (extraMenuItems.length === 0) {
      return;
    }

    const doc = menupopup.ownerDocument;
    if (!doc) {
      return;
    }
    const extraMenu = doc.createXULElement("menu");
    extraMenu.setAttribute("label", "Extra");
    extraMenu.setAttribute("anonid", EXTRA_COLUMNS_MENU_ANON_ID);

    const extraPopup = doc.createXULElement("menupopup");
    extraMenu.appendChild(extraPopup);
    for (const item of extraMenuItems) {
      extraPopup.appendChild(item);
    }

    if (moreColumnsPopup.firstChild) {
      const separator = doc.createXULElement("menuseparator");
      separator.setAttribute("anonid", EXTRA_COLUMNS_SEPARATOR_ANON_ID);
      moreColumnsPopup.insertBefore(separator, moreColumnsPopup.firstChild);
      moreColumnsPopup.insertBefore(extraMenu, separator);
    } else {
      moreColumnsPopup.appendChild(extraMenu);
    }
  }
}
