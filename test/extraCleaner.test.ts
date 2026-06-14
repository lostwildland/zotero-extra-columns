import { assert } from "chai";
import { ExtraCleaner, type ExtraCleanProgress } from "../src/extraCleaner";

interface MockExtraRow {
  itemID: number;
  value: string;
}

interface MockItemState {
  extra: string;
  saved: number;
}

describe("extraCleaner", function () {
  let previousZotero: unknown;

  beforeEach(function () {
    previousZotero = (globalThis as { Zotero?: unknown }).Zotero;
  });

  afterEach(function () {
    (globalThis as { Zotero?: unknown }).Zotero = previousZotero;
  });

  it("cleans the full library when no scope is provided", async function () {
    const mock = installZoteroMock([
      { itemID: 1, value: "scored: 7\ntitleTranslation: A" },
      { itemID: 2, value: "Scored: 5" },
      { itemID: 3, value: "titleTranslation: C" },
    ]);
    const cleaner = new ExtraCleaner();

    assert.deepEqual(await cleaner.preview("scored"), {
      itemsChanged: 2,
      linesRemoved: 2,
    });

    const progress: ExtraCleanProgress[] = [];
    const result = await cleaner.clean("scored", (nextProgress) => {
      progress.push(nextProgress);
    });

    assert.deepEqual(result, {
      itemsChanged: 2,
      linesRemoved: 2,
      failedItems: [],
    });
    assert.deepEqual(mock.savedItemIDs, [1, 2]);
    assert.equal(mock.items.get(1)?.extra, "titleTranslation: A");
    assert.equal(mock.items.get(2)?.extra, "");
    assert.equal(mock.items.get(3)?.extra, "titleTranslation: C");
    assert.deepEqual(
      progress.map((step) => step.totalItems),
      [2, 2, 2],
    );
  });

  it("limits preview and cleanup to scoped item IDs", async function () {
    const mock = installZoteroMock([
      { itemID: 1, value: "scored: 7\ntitleTranslation: A" },
      { itemID: 2, value: "scored: 5" },
      { itemID: 3, value: "Scored: 9" },
    ]);
    const cleaner = new ExtraCleaner();
    const scope = { itemIDs: [1, 1, 3] };

    assert.deepEqual(await cleaner.preview("scored", scope), {
      itemsChanged: 2,
      linesRemoved: 2,
    });
    assert.deepEqual(mock.queries[0], [99, 1, 3]);

    const result = await cleaner.clean("scored", scope);

    assert.deepEqual(result, {
      itemsChanged: 2,
      linesRemoved: 2,
      failedItems: [],
    });
    assert.deepEqual(mock.queries[1], [99, 1, 3]);
    assert.deepEqual(mock.savedItemIDs, [1, 3]);
    assert.equal(mock.items.get(1)?.extra, "titleTranslation: A");
    assert.equal(mock.items.get(2)?.extra, "scored: 5");
    assert.equal(mock.items.get(3)?.extra, "");
  });

  it("does not query or save for an empty scoped selection", async function () {
    const mock = installZoteroMock([
      { itemID: 1, value: "scored: 7" },
      { itemID: 2, value: "scored: 5" },
    ]);
    const cleaner = new ExtraCleaner();

    assert.deepEqual(await cleaner.preview("scored", { itemIDs: [] }), {
      itemsChanged: 0,
      linesRemoved: 0,
    });

    const progress: ExtraCleanProgress[] = [];
    const result = await cleaner.clean(
      "scored",
      { itemIDs: [] },
      (nextProgress) => {
        progress.push(nextProgress);
      },
    );

    assert.deepEqual(result, {
      itemsChanged: 0,
      linesRemoved: 0,
      failedItems: [],
    });
    assert.deepEqual(mock.queries, []);
    assert.deepEqual(mock.savedItemIDs, []);
    assert.deepEqual(progress, [
      {
        processedItems: 0,
        totalItems: 0,
        itemsChanged: 0,
        linesRemoved: 0,
        failedItems: 0,
      },
    ]);
  });

  it("reports progress against scoped cleanup candidates", async function () {
    const mock = installZoteroMock([
      { itemID: 1, value: "scored: 7" },
      { itemID: 2, value: "scored: 5" },
      { itemID: 3, value: "titleTranslation: C" },
    ]);
    const cleaner = new ExtraCleaner();
    const progress: ExtraCleanProgress[] = [];

    await cleaner.clean("scored", { itemIDs: [1, 3] }, (nextProgress) => {
      progress.push(nextProgress);
    });

    assert.deepEqual(mock.savedItemIDs, [1]);
    assert.deepEqual(
      progress.map((step) => [step.processedItems, step.totalItems]),
      [
        [0, 1],
        [1, 1],
      ],
    );
  });
});

function installZoteroMock(rows: MockExtraRow[]) {
  const queries: unknown[][] = [];
  const savedItemIDs: number[] = [];
  const errors: unknown[] = [];
  const items = new Map<number, MockItemState>(
    rows.map((row) => [row.itemID, { extra: row.value, saved: 0 }]),
  );

  (globalThis as { Zotero?: unknown }).Zotero = {
    ItemFields: {
      getID(fieldName: string) {
        assert.equal(fieldName, "extra");
        return 99;
      },
    },
    DB: {
      async queryAsync(_sql: string, params: unknown[]) {
        queries.push([...params]);
        const selectedItemIDs = params.slice(1) as number[];
        return rows
          .filter(
            (row) =>
              selectedItemIDs.length === 0 ||
              selectedItemIDs.includes(row.itemID),
          )
          .map((row) => ({
            itemID: row.itemID,
            value: row.value,
          }));
      },
    },
    Items: {
      async getAsync(itemID: number) {
        const item = items.get(itemID);
        if (!item) {
          throw new Error(`Missing mock item ${itemID}`);
        }

        return {
          setField(fieldName: string, value: string) {
            assert.equal(fieldName, "extra");
            item.extra = value;
          },
          async saveTx() {
            item.saved += 1;
            savedItemIDs.push(itemID);
            return true;
          },
        };
      },
    },
    logError(error: unknown) {
      errors.push(error);
    },
  };

  return {
    errors,
    items,
    queries,
    savedItemIDs,
  };
}
