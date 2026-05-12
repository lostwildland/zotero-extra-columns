import {
  discoverExtraFieldDefinitions,
  getExtraFieldValue,
  type ExtraFieldDefinition,
} from "./extraParser";

const COLUMN_PREFIX = "extra";
const PERSISTED_COLUMN_PROPS = ["width", "hidden", "sortDirection"];

export class ExtraColumnRegistry {
  private registeredColumns = new Map<string, string>();
  private fieldDefinitions: ExtraFieldDefinition[] = [];
  private scanPromise: Promise<ExtraFieldDefinition[]> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly pluginID: string) {}

  async scanAndRegister(): Promise<ExtraFieldDefinition[]> {
    if (this.scanPromise) {
      return this.scanPromise;
    }

    this.scanPromise = this.scanAndRegisterInternal().finally(() => {
      this.scanPromise = null;
    });

    return this.scanPromise;
  }

  getFieldDefinitions(): ExtraFieldDefinition[] {
    return this.fieldDefinitions.map((definition) => ({
      ...definition,
      rawKeys: [...definition.rawKeys],
    }));
  }

  getRegisteredDataKeys(): Set<string> {
    return new Set(this.registeredColumns.values());
  }

  scheduleScan(
    delayMS: number,
    onScan?: (definitions: ExtraFieldDefinition[]) => void,
  ): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
    }
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.scanAndRegister()
        .then((definitions) => onScan?.(definitions))
        .catch((error) => Zotero.logError(error));
    }, delayMS);
  }

  unregisterAll(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }

    for (const registeredDataKey of this.registeredColumns.values()) {
      Zotero.ItemTreeManager.unregisterColumn(registeredDataKey);
    }
    this.registeredColumns.clear();
  }

  private async scanAndRegisterInternal(): Promise<ExtraFieldDefinition[]> {
    const extras = await this.getStoredExtraValues();
    const definitions = discoverExtraFieldDefinitions(extras);
    this.fieldDefinitions = definitions;
    let didRegister = false;
    let didUnregister = false;
    const activeKeys = new Set(
      definitions.map((definition) => definition.canonicalKey),
    );

    for (const [canonicalKey, registeredDataKey] of this.registeredColumns) {
      if (!activeKeys.has(canonicalKey)) {
        Zotero.ItemTreeManager.unregisterColumn(registeredDataKey);
        this.registeredColumns.delete(canonicalKey);
        didUnregister = true;
      }
    }

    for (const definition of definitions) {
      if (this.registeredColumns.has(definition.canonicalKey)) {
        continue;
      }
      didRegister = this.registerColumn(definition) || didRegister;
    }

    if (didRegister || didUnregister) {
      Zotero.debug(
        `Extra Columns: registered ${this.registeredColumns.size} Extra-backed columns`,
      );
    }

    return this.getFieldDefinitions();
  }

  private async getStoredExtraValues(): Promise<string[]> {
    const extraFieldID = Zotero.ItemFields.getID("extra");
    const sql =
      "SELECT V.value " +
      "FROM itemData D " +
      "JOIN itemDataValues V USING (valueID) " +
      "JOIN items I USING (itemID) " +
      "LEFT JOIN deletedItems DI USING (itemID) " +
      "WHERE D.fieldID=? AND DI.itemID IS NULL";
    return Zotero.DB.columnQueryAsync(sql, [extraFieldID]);
  }

  private registerColumn(definition: ExtraFieldDefinition): boolean {
    const dataKey = `${COLUMN_PREFIX}-${definition.canonicalKey}`;
    const registeredDataKey = Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: definition.label,
      pluginID: this.pluginID,
      enabledTreeIDs: ["main"],
      showInColumnPicker: true,
      columnPickerSubMenu: true,
      flex: 1,
      minWidth: 72,
      width: suggestedColumnWidth(definition),
      dataProvider: (item) =>
        getExtraFieldValue(getItemExtra(item), definition.canonicalKey),
      zoteroPersist: PERSISTED_COLUMN_PROPS,
    });

    if (!registeredDataKey) {
      return false;
    }

    this.registeredColumns.set(definition.canonicalKey, registeredDataKey);
    return true;
  }
}

function getItemExtra(item: Zotero.Item): string {
  const extra = item.getField("extra");
  return typeof extra === "string" ? extra : "";
}

function suggestedColumnWidth(definition: ExtraFieldDefinition): string {
  if (definition.canonicalKey === "arxiv") {
    return "120";
  }
  if (definition.canonicalKey.includes("translation")) {
    return "240";
  }
  if (["doi", "url"].includes(definition.canonicalKey)) {
    return "220";
  }
  return "160";
}
