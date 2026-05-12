import { removeExtraFieldLines } from "./extraParser";

export interface ExtraCleanPreview {
  itemsChanged: number;
  linesRemoved: number;
}

export interface ExtraCleanResult extends ExtraCleanPreview {
  failedItems: number[];
}

export interface ExtraCleanProgress {
  processedItems: number;
  totalItems: number;
  itemsChanged: number;
  linesRemoved: number;
  failedItems: number;
}

interface ExtraRow {
  itemID: number;
  extra: string;
}

interface ExtraCleanCandidate {
  row: ExtraRow;
  removal: ReturnType<typeof removeExtraFieldLines>;
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

  async clean(
    canonicalKey: string,
    onProgress?: (progress: ExtraCleanProgress) => void,
  ): Promise<ExtraCleanResult> {
    const rows = await this.getExtraRows();
    const candidates: ExtraCleanCandidate[] = [];

    for (const row of rows) {
      const removal = removeExtraFieldLines(row.extra, canonicalKey);
      if (removal.removed > 0) {
        candidates.push({ row, removal });
      }
    }

    let itemsChanged = 0;
    let linesRemoved = 0;
    const failedItems: number[] = [];
    let processedItems = 0;

    emitProgress(onProgress, {
      processedItems,
      totalItems: candidates.length,
      itemsChanged,
      linesRemoved,
      failedItems: failedItems.length,
    });

    for (const candidate of candidates) {
      try {
        const item = await Zotero.Items.getAsync(candidate.row.itemID);
        item.setField("extra", candidate.removal.extra);
        await item.saveTx();
        itemsChanged += 1;
        linesRemoved += candidate.removal.removed;
      } catch (error) {
        failedItems.push(candidate.row.itemID);
        Zotero.logError(
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        processedItems += 1;
        emitProgress(onProgress, {
          processedItems,
          totalItems: candidates.length,
          itemsChanged,
          linesRemoved,
          failedItems: failedItems.length,
        });
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

function emitProgress(
  onProgress: ((progress: ExtraCleanProgress) => void) | undefined,
  progress: ExtraCleanProgress,
): void {
  if (!onProgress) {
    return;
  }
  try {
    onProgress(progress);
  } catch (error) {
    Zotero.logError(error instanceof Error ? error : new Error(String(error)));
  }
}
