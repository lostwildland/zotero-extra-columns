import { removeExtraFieldLines } from "./extraParser";

export interface ExtraCleanPreview {
  itemsChanged: number;
  linesRemoved: number;
}

export interface ExtraCleanResult extends ExtraCleanPreview {
  failedItems: number[];
}

interface ExtraRow {
  itemID: number;
  extra: string;
}

export class ExtraCleaner {
  async preview(canonicalKey: string): Promise<ExtraCleanPreview> {
    const rows = await this.getExtraRows();
    let itemsChanged = 0;
    let linesRemoved = 0;

    for (const row of rows) {
      const removal = removeExtraFieldLines(row.extra, canonicalKey);
      if (removal.removed > 0) {
        itemsChanged += 1;
        linesRemoved += removal.removed;
      }
    }

    return { itemsChanged, linesRemoved };
  }

  async clean(canonicalKey: string): Promise<ExtraCleanResult> {
    const rows = await this.getExtraRows();
    let itemsChanged = 0;
    let linesRemoved = 0;
    const failedItems: number[] = [];

    for (const row of rows) {
      const removal = removeExtraFieldLines(row.extra, canonicalKey);
      if (removal.removed === 0) {
        continue;
      }

      try {
        const item = await Zotero.Items.getAsync(row.itemID);
        item.setField("extra", removal.extra);
        await item.saveTx();
        itemsChanged += 1;
        linesRemoved += removal.removed;
      } catch (error) {
        failedItems.push(row.itemID);
        Zotero.logError(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    return { itemsChanged, linesRemoved, failedItems };
  }

  private async getExtraRows(): Promise<ExtraRow[]> {
    const extraFieldID = Zotero.ItemFields.getID("extra");
    const sql =
      "SELECT D.itemID, V.value " +
      "FROM itemData D " +
      "JOIN itemDataValues V USING (valueID) " +
      "JOIN items I USING (itemID) " +
      "LEFT JOIN deletedItems DI USING (itemID) " +
      "WHERE D.fieldID=? AND DI.itemID IS NULL";
    const rows = (await Zotero.DB.queryAsync(sql, [extraFieldID])) || [];

    return rows.map((row) => ({
      itemID: Number(row.itemID),
      extra:
        typeof row.value === "string" ? row.value : String(row.value || ""),
    }));
  }
}
