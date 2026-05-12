import { assert } from "chai";
import {
  canonicalizeExtraKey,
  discoverExtraFieldDefinitions,
  getExtraFieldValue,
  labelForExtraKey,
  normalizeExtraKey,
  parseExtraFields,
  removeExtraFieldLines,
} from "../src/extraParser";

describe("extraParser", function () {
  it("parses current Extra key-value syntax", function () {
    const entries = parseExtraFields(
      "titleTranslation: 中文标题\narXiv:2605.03210\nplain text",
    );

    assert.equal(entries.length, 2);
    assert.equal(entries[0].canonicalKey, "title-translation");
    assert.equal(entries[0].value, "中文标题");
    assert.equal(entries[1].canonicalKey, "arxiv");
    assert.equal(entries[1].label, "arXiv");
  });

  it("parses deprecated citeproc syntax", function () {
    const entries = parseExtraFields(
      "{:original-date: 1999}\n{:PMCID: PMC123}",
    );

    assert.deepEqual(
      entries.map((entry) => [entry.canonicalKey, entry.value, entry.syntax]),
      [
        ["original-date", "1999", "citeproc"],
        ["pmcid", "PMC123", "citeproc"],
      ],
    );
  });

  it("normalizes and labels common keys", function () {
    assert.equal(normalizeExtraKey("titleTranslation"), "title-translation");
    assert.equal(canonicalizeExtraKey("arXiv"), "arxiv");
    assert.equal(labelForExtraKey("titleTranslation"), "Title Translation");
    assert.equal(labelForExtraKey("arXiv"), "arXiv");
  });

  it("returns first value for a canonical key", function () {
    const extra = "arXiv: 2605.03210\narxiv: 9999.99999";

    assert.equal(getExtraFieldValue(extra, "arxiv"), "2605.03210");
  });

  it("discovers unique field definitions", function () {
    const definitions = discoverExtraFieldDefinitions([
      "arXiv: 2605.03210\nDOI: 10.48550/arXiv.2605.03210",
      "titleTranslation: 中文标题",
    ]);

    assert.deepEqual(
      definitions.map((definition) => definition.canonicalKey).sort(),
      ["arxiv", "doi", "title-translation"],
    );
  });

  it("counts repeated fields across item rows", function () {
    const definitions = discoverExtraFieldDefinitions([
      "zh: https://www.thepaper.cn/newsDetail_forward_26402600",
      "zh: https://www.thepaper.cn/newsDetail_forward_26402600",
    ]);

    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].canonicalKey, "zh");
    assert.equal(definitions[0].count, 2);
  });

  it("removes all lines for a canonical key", function () {
    const result = removeExtraFieldLines(
      "titleTranslation: 中文标题\nplain text\nTitle Translation: 第二个标题\narXiv:2605.03210",
      "title-translation",
    );

    assert.equal(result.removed, 2);
    assert.equal(result.extra, "plain text\narXiv:2605.03210");
  });
});
