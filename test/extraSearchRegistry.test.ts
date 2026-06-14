import { assert } from "chai";
import { ExtraSearchRegistry } from "../src/extraSearchRegistry";
import { encodeExtraSearchCondition } from "../src/extraSearchMatcher";

describe("extraSearchRegistry", function () {
  let previousZotero: unknown;
  let previousAddon: unknown;

  beforeEach(function () {
    previousZotero = (globalThis as { Zotero?: unknown }).Zotero;
    previousAddon = (globalThis as { addon?: unknown }).addon;
  });

  afterEach(function () {
    (globalThis as { Zotero?: unknown }).Zotero = previousZotero;
    (globalThis as { addon?: unknown }).addon = previousAddon;
  });

  it("adds Extra field conditions without removing native conditions", function () {
    installBaseZoteroMock();
    const registry = new ExtraSearchRegistry();
    registry.updateDefinitions([
      {
        canonicalKey: "fulltext",
        label: "Fulltext",
        rawKeys: ["fulltext"],
        count: 2,
      },
    ]);
    installAddonMock(registry);

    registry.register();
    try {
      const conditions = Zotero.SearchConditions.getStandardConditions();

      assert.deepInclude(conditions, {
        name: "title",
        localized: "Title",
        operators: { contains: true },
      });
      assert.deepInclude(conditions, {
        name: "extra/fulltext",
        localized: "Extra: Fulltext",
        operators: {
          is: true,
          isNot: true,
          contains: true,
          doesNotContain: true,
          beginsWith: true,
        },
      });
      assert.equal(
        Zotero.SearchConditions.getLocalizedName("extra/fulltext"),
        "Extra: Fulltext",
      );
      assert.isTrue(
        Zotero.SearchConditions.hasOperator("extra/fulltext", "contains"),
      );
      assert.isFalse(
        Zotero.SearchConditions.hasOperator("extra/fulltext", "isGreaterThan"),
      );
    } finally {
      registry.unpatchAll();
    }
  });

  it("displays load-safe stored Extra conditions as Extra field menu conditions", function () {
    installBaseZoteroMock();
    const registry = new ExtraSearchRegistry();
    registry.updateDefinitions([
      {
        canonicalKey: "fulltext",
        label: "Fulltext",
        rawKeys: ["fulltext"],
        count: 2,
      },
    ]);
    installAddonMock(registry);

    registry.register();
    try {
      const search = new Zotero.Search();
      search._conditions = {
        1: {
          id: 1,
          condition: "extra",
          mode: "fulltext",
          operator: "contains",
          value: "Raw/",
          required: false,
        },
      };

      assert.deepEqual(search.getConditions(), {
        1: {
          id: 1,
          condition: "extra/fulltext",
          mode: false,
          operator: "contains",
          value: "Raw/",
          required: false,
        },
      });
    } finally {
      registry.unpatchAll();
    }
  });

  it("replaces Extra field search conditions with tempTable conditions", async function () {
    const mock = installSearchZoteroMock();
    const registry = new ExtraSearchRegistry();
    registry.updateDefinitions([
      {
        canonicalKey: "fulltext",
        label: "Fulltext",
        rawKeys: ["fulltext"],
        count: 2,
      },
    ]);
    installAddonMock(registry);

    registry.register();
    try {
      const extraCondition = encodeExtraSearchCondition("fulltext");
      const search = new Zotero.Search();
      search.libraryID = 1;
      search._conditions = {
        1: {
          id: 1,
          condition: "title",
          operator: "contains",
          value: "AI",
          required: false,
        },
        2: {
          id: 2,
          condition: extraCondition,
          operator: "contains",
          value: "Raw/",
          required: true,
        },
      };

      const result = await search.search();

      assert.deepEqual(result, [2, 4]);
      assert.equal(mock.originalSearchCalls.length, 1);
      assert.equal(
        mock.originalSearchCalls[0].conditions[2].condition,
        "tempTable",
      );
      assert.equal(mock.originalSearchCalls[0].conditions[2].operator, "is");
      assert.equal(mock.originalSearchCalls[0].conditions[2].required, true);
      assert.match(
        String(mock.originalSearchCalls[0].conditions[2].value),
        /^tmpSearchResults_/,
      );
      assert.deepEqual(search._conditions[2].condition, extraCondition);
      assert.include(mock.sql[0], "SELECT I.itemID, V.value");
      assert.deepEqual(mock.params[0], [99, 1]);
      assert.deepEqual(mock.idsToTempTableCalls, [
        { ids: [2, 4], options: { idColumn: "id" } },
      ]);
      assert.include(mock.sql[mock.sql.length - 1], "DROP TABLE IF EXISTS");
    } finally {
      registry.unpatchAll();
    }
  });

  it("marks Extra field searches as post-search filters for scoped saved searches", async function () {
    const mock = installSearchZoteroMock();
    const registry = new ExtraSearchRegistry();
    registry.updateDefinitions([
      {
        canonicalKey: "fulltext",
        label: "Fulltext",
        rawKeys: ["fulltext"],
        count: 2,
      },
    ]);
    installAddonMock(registry);

    registry.register();
    try {
      const scope = new Zotero.Search();
      scope.libraryID = 1;
      scope._conditions = {
        1: {
          id: 1,
          condition: encodeExtraSearchCondition("fulltext"),
          operator: "contains",
          value: "Raw/",
          required: false,
        },
      };
      const outer = new Zotero.Search();
      outer._scope = scope;

      assert.isTrue(scope.hasPostSearchFilter());
      assert.deepEqual(await outer.search(), [2, 4]);
      assert.deepEqual(mock.scopeExecutionPaths, ["search"]);
      assert.equal(
        mock.originalSearchCalls[0].conditions[1].condition,
        "tempTable",
      );
    } finally {
      registry.unpatchAll();
    }
  });

  it("migrates legacy persisted Extra field conditions to load-safe conditions", async function () {
    const mock = installSearchZoteroMock();
    const registry = new ExtraSearchRegistry();
    installAddonMock(registry);

    registry.register();
    try {
      await registry.migratePersistedConditions();

      assert.deepEqual(mock.updates, [
        {
          condition: "extra/column",
          savedSearchID: 8,
          searchConditionID: 5,
        },
      ]);
      assert.deepEqual(mock.reloads, [{ id: 8, dataTypes: ["conditions"] }]);
    } finally {
      registry.unpatchAll();
    }
  });
});

function installBaseZoteroMock() {
  class Search {
    _conditions: Record<string, unknown> = {};

    getConditions() {
      return structuredClone(this._conditions);
    }

    hasPostSearchFilter() {
      return false;
    }

    async search() {
      return [];
    }
  }
  (globalThis as { Zotero?: unknown }).Zotero = {
    Search,
    SearchConditions: {
      get(condition: string) {
        return condition === "title"
          ? { name: "title", operators: { contains: true } }
          : undefined;
      },
      getLocalizedName(condition: string) {
        return condition === "title" ? "Title" : condition;
      },
      getStandardConditions() {
        return [
          {
            name: "title",
            localized: "Title",
            operators: { contains: true },
          },
        ];
      },
      hasOperator(condition: string, operator: string) {
        return condition === "title" && operator === "contains";
      },
    },
  };
}

function installSearchZoteroMock() {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const originalSearchCalls: Array<{
    asTempTable: boolean | undefined;
    conditions: Record<string, unknown>;
  }> = [];
  const scopeExecutionPaths: string[] = [];
  const idsToTempTableCalls: Array<{
    ids: number[];
    options: unknown;
  }> = [];
  const reloads: Array<{ id: number; dataTypes: string[] }> = [];
  const updates: Array<{
    condition: string;
    savedSearchID: number;
    searchConditionID: number;
  }> = [];

  class Search {
    id?: number;
    libraryID: number | null = null;
    _conditions: Record<string, unknown> = {};
    _scope?: Search;
    _sql: string | null = "cached";
    _sqlParams: unknown = ["cached"];

    async search(asTempTable?: boolean) {
      if (this._scope) {
        if (this._scope.hasPostSearchFilter()) {
          scopeExecutionPaths.push("search");
          return this._scope.search(asTempTable);
        }
        scopeExecutionPaths.push("getSQL");
        throw new Error("Scoped Extra search used getSQL()");
      }

      originalSearchCalls.push({
        asTempTable,
        conditions: structuredClone(this._conditions),
      });
      return [2, 4];
    }

    getConditions() {
      return structuredClone(this._conditions);
    }

    hasPostSearchFilter() {
      return false;
    }

    static async idsToTempTable(ids: number[], options: unknown) {
      idsToTempTableCalls.push({ ids, options });
      return "tmpSearchResults_mock";
    }
  }

  (globalThis as { Zotero?: unknown }).Zotero = {
    Search,
    SearchConditions: {
      get(condition: string) {
        return { name: condition, operators: { contains: true } };
      },
      getLocalizedName(condition: string) {
        return condition;
      },
      getStandardConditions() {
        return [];
      },
      hasOperator() {
        return true;
      },
    },
    ItemFields: {
      getID(fieldName: string) {
        assert.equal(fieldName, "extra");
        return 99;
      },
    },
    DB: {
      async queryAsync(nextSQL: string, nextParams: unknown[] = []) {
        sql.push(nextSQL);
        params.push([...nextParams]);
        if (nextSQL.includes("FROM savedSearchConditions")) {
          return [
            {
              savedSearchID: 8,
              searchConditionID: 5,
              condition: "extraField:column",
            },
          ];
        }
        if (nextSQL.startsWith("UPDATE savedSearchConditions")) {
          updates.push({
            condition: String(nextParams[0]),
            savedSearchID: Number(nextParams[1]),
            searchConditionID: Number(nextParams[2]),
          });
          return [];
        }
        if (nextSQL.startsWith("SELECT I.itemID")) {
          return [
            { itemID: 1, value: "fulltext: Other/A" },
            { itemID: 2, value: "fulltext: Raw/A" },
            { itemID: 3, value: "" },
            { itemID: 4, value: "Fulltext: Raw/B" },
          ];
        }
        return [];
      },
    },
    logError() {
      return undefined;
    },
    Searches: {
      get(searchID: number) {
        return {
          id: searchID,
          async reload(dataTypes: string[]) {
            reloads.push({ id: searchID, dataTypes });
          },
        };
      },
    },
  };

  return {
    idsToTempTableCalls,
    originalSearchCalls,
    params,
    reloads,
    scopeExecutionPaths,
    sql,
    updates,
  };
}

function installAddonMock(registry: ExtraSearchRegistry) {
  (globalThis as { addon?: unknown }).addon = {
    data: {
      searchRegistry: registry,
    },
  };
}
