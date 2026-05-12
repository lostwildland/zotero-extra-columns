import { assert } from "chai";
import { config } from "../package.json";

describe("startup", function () {
  it("initializes the plugin without startup errors", function () {
    const instance = Zotero[config.addonInstance] as typeof addon | undefined;

    assert.isOk(instance);
    assert.isTrue(instance?.data.initialized);
    assert.isUndefined(instance?.data.startupError);
  });
});
