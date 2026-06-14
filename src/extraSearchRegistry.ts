import type { ExtraFieldDefinition } from "./extraParser";
import {
  decodeStoredExtraSearchCondition,
  decodeExtraSearchCondition,
  encodeExtraSearchCondition,
  matchExtraField,
  type ExtraSearchOperator,
} from "./extraSearchMatcher";

type SearchConditionData = {
  name: string;
  localized?: string;
  operators?: Record<string, boolean>;
  flags?: Record<string, unknown>;
  special?: boolean;
};

type SearchCondition = {
  id: number | string;
  condition: string;
  mode?: string | false;
  operator: string;
  value: unknown;
  required?: boolean;
};

type SearchInstance = {
  _conditions?: Record<string, SearchCondition>;
  _sql?: string | null;
  _sqlParams?: unknown;
  _requireData?: (dataType: string) => void;
  libraryID?: number | null;
  getConditions(): Record<string, SearchCondition>;
  hasPostSearchFilter(): boolean;
  search(asTempTable?: boolean): Promise<number[] | string>;
};

type SearchPrototype = {
  getConditions: SearchInstance["getConditions"];
  hasPostSearchFilter: SearchInstance["hasPostSearchFilter"];
  search: SearchInstance["search"];
};

type SearchConstructor = {
  prototype: SearchPrototype;
  idsToTempTable?: (
    ids: number[],
    options?: { idColumn?: string },
  ) => Promise<string>;
};

const EXTRA_SEARCH_OPERATORS: Record<ExtraSearchOperator, boolean> = {
  is: true,
  isNot: true,
  contains: true,
  doesNotContain: true,
  beginsWith: true,
};

let tempTableCounter = 0;

export class ExtraSearchRegistry {
  private definitions = new Map<string, ExtraFieldDefinition>();
  private originals?: {
    get: (condition: string) => SearchConditionData | undefined;
    getConditions: SearchPrototype["getConditions"];
    getLocalizedName: (condition: string) => string;
    getStandardConditions: () => SearchConditionData[];
    hasPostSearchFilter: SearchPrototype["hasPostSearchFilter"];
    hasOperator: (condition: string, operator?: string) => boolean;
    search: SearchPrototype["search"];
  };

  updateDefinitions(definitions: ExtraFieldDefinition[]): void {
    this.definitions.clear();
    for (const definition of definitions) {
      this.definitions.set(definition.canonicalKey, {
        ...definition,
        rawKeys: [...definition.rawKeys],
      });
    }
  }

  register(): void {
    if (this.originals) {
      return;
    }

    const searchConditions = Zotero.SearchConditions;
    const searchPrototype = (Zotero.Search as SearchConstructor).prototype;
    this.originals = {
      get: searchConditions.get.bind(searchConditions),
      getConditions: searchPrototype.getConditions,
      getLocalizedName:
        searchConditions.getLocalizedName.bind(searchConditions),
      getStandardConditions:
        searchConditions.getStandardConditions.bind(searchConditions),
      hasPostSearchFilter: searchPrototype.hasPostSearchFilter,
      hasOperator: searchConditions.hasOperator.bind(searchConditions),
      search: searchPrototype.search,
    };

    searchConditions.get = (condition: string) => {
      const decoded = decodeExtraSearchCondition(condition);
      if (decoded) {
        return this.getConditionData(decoded.canonicalKey);
      }
      return this.originals?.get(condition);
    };

    searchConditions.getLocalizedName = (condition: string) => {
      const decoded = decodeExtraSearchCondition(condition);
      if (decoded) {
        return this.getLocalizedName(decoded.canonicalKey);
      }
      return this.originals?.getLocalizedName(condition) || condition;
    };

    searchConditions.getStandardConditions = () => {
      const standardConditions = this.originals?.getStandardConditions() || [];
      const extraConditions = Array.from(this.definitions.values()).map(
        (definition) => ({
          name: encodeExtraSearchCondition(definition.canonicalKey),
          localized: this.getLocalizedName(definition.canonicalKey),
          operators: EXTRA_SEARCH_OPERATORS,
        }),
      );
      return [...standardConditions, ...extraConditions].sort((a, b) =>
        compareSearchConditions(a, b),
      );
    };

    searchConditions.hasOperator = (condition: string, operator?: string) => {
      const decoded = decodeExtraSearchCondition(condition);
      if (decoded) {
        return Boolean(
          operator && EXTRA_SEARCH_OPERATORS[operator as ExtraSearchOperator],
        );
      }
      return this.originals?.hasOperator(condition, operator) || false;
    };

    const searchWithExtraConditions = this.searchWithExtraConditions.bind(this);
    const getDisplayConditions = this.getDisplayConditions.bind(this);
    searchPrototype.getConditions = function patchedGetConditions(
      this: SearchInstance,
    ) {
      return getDisplayConditions(this);
    };
    const hasExtraSearchConditions = this.hasExtraSearchConditions.bind(this);
    const originalHasPostSearchFilter = this.originals.hasPostSearchFilter;
    searchPrototype.hasPostSearchFilter = function patchedHasPostSearchFilter(
      this: SearchInstance,
    ) {
      return (
        hasExtraSearchConditions(this) || originalHasPostSearchFilter.call(this)
      );
    };
    searchPrototype.search = async function patchedSearch(
      this: SearchInstance,
      asTempTable?: boolean,
    ) {
      return searchWithExtraConditions(this, asTempTable);
    };
  }

  unpatchAll(): void {
    if (!this.originals) {
      return;
    }

    Zotero.SearchConditions.get = this.originals.get;
    Zotero.SearchConditions.getLocalizedName = this.originals.getLocalizedName;
    Zotero.SearchConditions.getStandardConditions =
      this.originals.getStandardConditions;
    Zotero.SearchConditions.hasOperator = this.originals.hasOperator;
    (Zotero.Search as SearchConstructor).prototype.getConditions =
      this.originals.getConditions;
    (Zotero.Search as SearchConstructor).prototype.search =
      this.originals.search;
    (Zotero.Search as SearchConstructor).prototype.hasPostSearchFilter =
      this.originals.hasPostSearchFilter;
    this.originals = undefined;
  }

  async searchWithExtraConditions(
    search: SearchInstance,
    asTempTable?: boolean,
  ): Promise<number[] | string> {
    if (!this.originals) {
      throw new Error("Extra search registry is not registered");
    }

    const extraConditions = this.getExtraConditions(search);
    if (extraConditions.length === 0) {
      return this.originals.search.call(search, asTempTable);
    }

    const originalConditions = search._conditions;
    const originalSQL = search._sql;
    const originalSQLParams = search._sqlParams;
    const tempTables: string[] = [];

    try {
      const replacementConditions: Record<string, SearchCondition> = {
        ...(originalConditions || {}),
      };

      for (const [id, condition] of extraConditions) {
        const decoded = decodeStoredExtraSearchCondition(
          condition.condition,
          condition.mode,
        );
        if (!decoded) {
          continue;
        }

        const itemIDs = await this.getMatchingItemIDs(
          decoded.canonicalKey,
          condition.operator as ExtraSearchOperator,
          condition.value,
          search.libraryID ?? null,
        );
        const tempTable = await createTempTable(itemIDs);
        tempTables.push(tempTable);
        replacementConditions[id] = {
          ...condition,
          condition: "tempTable",
          mode: false,
          operator: "is",
          value: tempTable,
        };
      }

      search._conditions = replacementConditions;
      search._sql = null;
      search._sqlParams = false;
      return await this.originals.search.call(search, asTempTable);
    } finally {
      search._conditions = originalConditions;
      search._sql = originalSQL;
      search._sqlParams = originalSQLParams;
      await dropTempTables(tempTables);
    }
  }

  private getConditionData(canonicalKey: string): SearchConditionData {
    return {
      name: encodeExtraSearchCondition(canonicalKey),
      operators: EXTRA_SEARCH_OPERATORS,
    };
  }

  private getLocalizedName(canonicalKey: string): string {
    const label = this.definitions.get(canonicalKey)?.label || canonicalKey;
    return `Extra: ${label}`;
  }

  private async getMatchingItemIDs(
    canonicalKey: string,
    operator: ExtraSearchOperator,
    value: unknown,
    libraryID: number | null,
  ): Promise<number[]> {
    const extraFieldID = Zotero.ItemFields.getID("extra");
    const sql =
      "SELECT I.itemID, V.value " +
      "FROM items I " +
      "LEFT JOIN itemData D ON D.itemID=I.itemID AND D.fieldID=? " +
      "LEFT JOIN itemDataValues V USING (valueID) " +
      "LEFT JOIN deletedItems DI ON DI.itemID=I.itemID " +
      "WHERE DI.itemID IS NULL" +
      (libraryID !== null ? " AND I.libraryID=?" : "");
    const params =
      libraryID !== null ? [extraFieldID, libraryID] : [extraFieldID];
    const rows = (await Zotero.DB.queryAsync(sql, params as unknown[])) || [];

    return rows
      .filter((row) =>
        matchExtraField(row.value, canonicalKey, operator, value),
      )
      .map((row) => Number(row.itemID))
      .filter((itemID) => Number.isInteger(itemID) && itemID > 0);
  }

  private hasExtraSearchConditions(search: SearchInstance): boolean {
    return this.getExtraConditions(search).length > 0;
  }

  private getDisplayConditions(
    search: SearchInstance,
  ): Record<string, SearchCondition> {
    if (!this.originals) {
      return search.getConditions();
    }

    const conditions = this.originals.getConditions.call(search);
    for (const condition of Object.values(conditions)) {
      const decoded = decodeStoredExtraSearchCondition(
        condition.condition,
        condition.mode,
      );
      if (!decoded) {
        continue;
      }

      condition.condition = encodeExtraSearchCondition(decoded.canonicalKey);
      condition.mode = false;
    }
    return conditions;
  }

  private getExtraConditions(
    search: SearchInstance,
  ): Array<[string, SearchCondition]> {
    search._requireData?.("conditions");
    return Object.entries(search._conditions || {}).filter(([, condition]) =>
      Boolean(
        decodeStoredExtraSearchCondition(condition.condition, condition.mode),
      ),
    );
  }

  async migratePersistedConditions(): Promise<void> {
    const rows =
      (await Zotero.DB.queryAsync(
        "SELECT savedSearchID, searchConditionID, condition " +
          "FROM savedSearchConditions " +
          "WHERE condition LIKE ?",
        ["extraField:%"],
      )) || [];

    const migratedSearchIDs = new Set<number>();
    for (const row of rows) {
      const decoded = decodeExtraSearchCondition(String(row.condition));
      if (!decoded) {
        continue;
      }

      await Zotero.DB.queryAsync(
        "UPDATE savedSearchConditions SET condition=? " +
          "WHERE savedSearchID=? AND searchConditionID=?",
        [
          encodeExtraSearchCondition(decoded.canonicalKey),
          Number(row.savedSearchID),
          Number(row.searchConditionID),
        ],
      );
      migratedSearchIDs.add(Number(row.savedSearchID));
    }

    for (const searchID of migratedSearchIDs) {
      const search = Zotero.Searches.get(searchID) as
        | {
            reload?: (
              dataTypes: string[],
              reloadUnchanged: boolean,
            ) => Promise<void>;
          }
        | undefined;
      await search?.reload?.(["conditions"], true);
    }
  }
}

function compareSearchConditions(
  a: SearchConditionData,
  b: SearchConditionData,
): number {
  if (a.name === "anyField") {
    return -1;
  }
  if (b.name === "anyField") {
    return 1;
  }
  return (a.localized || a.name).localeCompare(b.localized || b.name);
}

async function createTempTable(itemIDs: number[]): Promise<string> {
  const searchConstructor = Zotero.Search as SearchConstructor;
  if (searchConstructor.idsToTempTable) {
    return searchConstructor.idsToTempTable(Array.from(new Set(itemIDs)), {
      idColumn: "id",
    });
  }

  const tableName = `zecExtraSearch_${Date.now()}_${++tempTableCounter}`;
  await Zotero.DB.queryAsync(
    `CREATE TEMP TABLE ${tableName} (id INTEGER PRIMARY KEY)`,
    [],
    { noCache: true },
  );

  const uniqueItemIDs = Array.from(new Set(itemIDs));
  for (let i = 0; i < uniqueItemIDs.length; i += 500) {
    const chunk = uniqueItemIDs.slice(i, i + 500);
    if (chunk.length === 0) {
      continue;
    }
    await Zotero.DB.queryAsync(
      `INSERT INTO ${tableName} (id) VALUES ${chunk
        .map(() => "(?)")
        .join(",")}`,
      chunk,
      { noCache: true },
    );
  }

  return tableName;
}

async function dropTempTables(tableNames: string[]): Promise<void> {
  for (const tableName of tableNames) {
    try {
      await Zotero.DB.queryAsync(`DROP TABLE IF EXISTS ${tableName}`, [], {
        noCache: true,
      });
    } catch (error) {
      Zotero.logError(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
