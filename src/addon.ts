import { config } from "../package.json";
import type { ColumnPickerOrganizer } from "./columnPickerOrganizer";
import type { ExtraCleaner } from "./extraCleaner";
import type { ExtraColumnRegistry } from "./extraColumnRegistry";
import type { ExtraMenu } from "./extraMenu";
import type { ExtraSection } from "./extraSection";
import hooks from "./hooks";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    initialized: boolean;
    cleaner?: ExtraCleaner;
    columnPickerOrganizer?: ColumnPickerOrganizer;
    menu?: ExtraMenu;
    notifierID?: string;
    registry?: ExtraColumnRegistry;
    section?: ExtraSection;
    startupError?: string;
  };

  public hooks: typeof hooks;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
    };
    this.hooks = hooks;
  }
}

export default Addon;
