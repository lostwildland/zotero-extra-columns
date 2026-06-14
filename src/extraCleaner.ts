import { removeExtraFieldLines } from "./extraParser";

export interface ExtraCleanScope {
  itemIDs?: readonly number[];
}

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

export type ExtraCleanProgressHandler = (progress: ExtraCleanProgress) => void;

interface ExtraRow {
  itemID: number;
  extra: string;
}

interface ExtraCleanCandidate {
  row: ExtraRow;
  removal: ReturnType<typeof removeExtraFieldLines>;
}

export class ExtraCleaner {
  async preview(
    canonicalKey: string,
    scope?: ExtraCleanScope,
  ): Promise<ExtraCleanPreview> {
    const rows = await this.getExtraRows(scope);
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
    onProgress?: ExtraCleanProgressHandler,
  ): Promise<ExtraCleanResult>;
  async clean(
    canonicalKey: string,
    scope?: ExtraCleanScope,
    onProgress?: ExtraCleanProgressHandler,
  ): Promise<ExtraCleanResult>;
  async clean(
    canonicalKey: string,
    scopeOrOnProgress?: ExtraCleanScope | ExtraCleanProgressHandler,
    onProgress?: ExtraCleanProgressHandler,
  ): Promise<ExtraCleanResult> {
    const scope =
      typeof scopeOrOnProgress === "function" ? undefined : scopeOrOnProgress;
    const progressHandler =
      typeof scopeOrOnProgress === "function" ? scopeOrOnProgress : onProgress;
    const rows = await this.getExtraRows(scope);
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

    emitProgress(progressHandler, {
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
        emitProgress(progressHandler, {
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

  private async getExtraRows(scope?: ExtraCleanScope): Promise<ExtraRow[]> {
    const itemIDs = uniqueItemIDs(scope?.itemIDs);
    if (scope?.itemIDs && itemIDs.length === 0) {
      return [];
    }

    const extraFieldID = Zotero.ItemFields.getID("extra");
    const sql =
      "SELECT D.itemID, V.value " +
      "FROM itemData D " +
      "JOIN itemDataValues V USING (valueID) " +
      "JOIN items I USING (itemID) " +
      "LEFT JOIN deletedItems DI USING (itemID) " +
      "WHERE D.fieldID=? AND DI.itemID IS NULL" +
      (itemIDs.length
        ? ` AND D.itemID IN (${itemIDs.map(() => "?").join(",")})`
        : "");
    const rows =
      (await Zotero.DB.queryAsync(sql, [extraFieldID, ...itemIDs])) || [];

    return rows.map((row) => ({
      itemID: Number(row.itemID),
      extra:
        typeof row.value === "string" ? row.value : String(row.value || ""),
    }));
  }
}

function emitProgress(
  onProgress: ExtraCleanProgressHandler | undefined,
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

function uniqueItemIDs(itemIDs: readonly number[] | undefined): number[] {
  if (!itemIDs) {
    return [];
  }
  return Array.from(
    new Set(itemIDs.filter((itemID) => Number.isInteger(itemID) && itemID > 0)),
  );
}
