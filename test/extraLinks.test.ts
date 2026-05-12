import { assert } from "chai";
import { linkForExtraEntry } from "../src/extraLinks";
import { parseExtraFields } from "../src/extraParser";

describe("extraLinks", function () {
  it("links arXiv and DOI values", function () {
    const [arxiv, doi] = parseExtraFields(
      "arXiv:2605.03210\nDOI: 10.48550/ARXIV.2605.03210",
    );

    assert.equal(linkForExtraEntry(arxiv), "https://arxiv.org/abs/2605.03210");
    assert.equal(
      linkForExtraEntry(doi),
      "https://doi.org/10.48550/ARXIV.2605.03210",
    );
  });

  it("links external protocol URLs", function () {
    const [entry] = parseExtraFields(
      "Post Newsletter: obsidian://open?vault=insight&file=area%2Fneuritis%2Fnewsletter-2026-05-12",
    );

    assert.equal(
      linkForExtraEntry(entry),
      "obsidian://open?vault=insight&file=area%2Fneuritis%2Fnewsletter-2026-05-12",
    );
  });
});
