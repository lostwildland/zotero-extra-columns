import { assert } from "chai";
import {
  decodeExtraSearchCondition,
  encodeExtraSearchCondition,
  matchExtraField,
} from "../src/extraSearchMatcher";

describe("extraSearchMatcher", function () {
  it("encodes and decodes stable Extra search condition IDs", function () {
    const keys = ["fulltext", "Quality Score", "titleTranslation", "A B/C"];

    assert.deepEqual(
      keys.map((key) =>
        decodeExtraSearchCondition(encodeExtraSearchCondition(key)),
      ),
      [
        {
          condition: "extraField:fulltext",
          canonicalKey: "fulltext",
        },
        {
          condition: "extraField:quality-score",
          canonicalKey: "quality-score",
        },
        {
          condition: "extraField:title-translation",
          canonicalKey: "title-translation",
        },
        {
          condition: "extraField:a-b%2Fc",
          canonicalKey: "a-b/c",
        },
      ],
    );
  });

  it("matches positive text operators against parsed Extra fields", function () {
    const extra =
      "fulltext: obsidian://open?vault=insight&file=Raw/A\nQuality Score: 7";

    assert.isTrue(
      matchExtraField(
        extra,
        "fulltext",
        "is",
        "obsidian://open?vault=insight&file=Raw/A",
      ),
    );
    assert.isFalse(matchExtraField(extra, "fulltext", "is", "Raw/A"));
    assert.isTrue(matchExtraField(extra, "fulltext", "contains", "Raw/"));
    assert.isTrue(
      matchExtraField(extra, "fulltext", "beginsWith", "obsidian://"),
    );
    assert.isFalse(matchExtraField(extra, "quality-score", "beginsWith", "8"));
  });

  it("treats duplicate keys as a match when any value satisfies the condition", function () {
    const extra = "fulltext: first\nFulltext: second";

    assert.isTrue(matchExtraField(extra, "fulltext", "is", "second"));
    assert.isTrue(matchExtraField(extra, "fulltext", "contains", "fir"));
    assert.isFalse(matchExtraField(extra, "fulltext", "contains", "third"));
  });

  it("matches negative operators when no value satisfies the positive condition", function () {
    const extra = "fulltext: Raw/A\nQuality Score: 7";

    assert.isTrue(matchExtraField(extra, "missing", "isNot", "anything"));
    assert.isTrue(
      matchExtraField(extra, "missing", "doesNotContain", "anything"),
    );
    assert.isTrue(matchExtraField(extra, "fulltext", "isNot", "Raw/B"));
    assert.isFalse(matchExtraField(extra, "fulltext", "isNot", "Raw/A"));
    assert.isTrue(
      matchExtraField(extra, "fulltext", "doesNotContain", "Raw/B"),
    );
    assert.isFalse(
      matchExtraField(extra, "fulltext", "doesNotContain", "Raw/"),
    );
  });

  it("uses JavaScript string semantics for empty query values", function () {
    const extra = "fulltext: Raw/A";

    assert.isFalse(matchExtraField("", "fulltext", "contains", ""));
    assert.isTrue(matchExtraField(extra, "fulltext", "contains", ""));
    assert.isFalse(matchExtraField(extra, "fulltext", "doesNotContain", ""));
    assert.isTrue(matchExtraField("", "fulltext", "doesNotContain", ""));
  });
});
