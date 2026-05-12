import { linkForExtraEntry } from "./extraLinks";
import { parseExtraFields } from "./extraParser";

const SECTION_ID = "extra-fields";

export class ExtraSection {
  private registeredPaneID: string | false = false;
  private refresh: (() => Promise<void>) | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly pluginID: string,
    private readonly addonRef: string,
  ) {}

  register(): void {
    if (this.registeredPaneID) {
      return;
    }

    this.registeredPaneID = Zotero.ItemPaneManager.registerSection({
      paneID: SECTION_ID,
      pluginID: this.pluginID,
      header: {
        l10nID: "extra-columns-section-head",
        icon: `chrome://${this.addonRef}/content/icons/extra-columns.svg`,
      },
      sidenav: {
        l10nID: "extra-columns-section-sidenav",
        icon: `chrome://${this.addonRef}/content/icons/extra-columns.svg`,
      },
      onInit: ({ refresh }) => {
        this.refresh = refresh;
      },
      onDestroy: () => {
        this.refresh = null;
      },
      onItemChange: ({ item, tabType, setEnabled, setSectionSummary }) => {
        const entries = parseExtraFields(getItemExtra(item));
        setEnabled(tabType === "library" && entries.length > 0);
        setSectionSummary(entries.length ? `${entries.length}` : "");
      },
      onRender: ({ doc, body, item }) => {
        renderSection(doc, body, item);
      },
    });
  }

  scheduleRefresh(delayMS: number): void {
    if (!this.refresh) {
      return;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refresh?.().catch((error) => Zotero.logError(error));
    }, delayMS);
  }

  unregister(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.registeredPaneID) {
      Zotero.ItemPaneManager.unregisterSection(this.registeredPaneID);
      this.registeredPaneID = false;
    }
  }
}

function renderSection(doc: Document, body: HTMLDivElement, item: Zotero.Item) {
  body.replaceChildren();
  body.appendChild(createStyle(doc));

  const entries = parseExtraFields(getItemExtra(item));
  const list = doc.createElement("div");
  list.className = "zec-field-list";

  for (const entry of entries) {
    const row = doc.createElement("div");
    row.className = "zec-field-row";

    const key = doc.createElement("div");
    key.className = "zec-field-key";
    key.textContent = entry.label;

    const value = doc.createElement("div");
    value.className = "zec-field-value";
    const url = linkForExtraEntry(entry);
    if (url) {
      const link = doc.createElement("a");
      link.href = url;
      link.textContent = entry.value;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        Zotero.launchURL(url);
      });
      value.appendChild(link);
    } else {
      value.textContent = entry.value;
    }

    row.append(key, value);
    list.appendChild(row);
  }

  body.appendChild(list);
}

function createStyle(doc: Document): HTMLStyleElement {
  const style = doc.createElement("style");
  style.textContent = `
    .zec-field-list {
      display: grid;
      gap: 5px;
      padding: 4px 0 8px;
    }
    .zec-field-row {
      display: grid;
      grid-template-columns: minmax(88px, 28%) minmax(0, 1fr);
      column-gap: 12px;
      align-items: start;
    }
    .zec-field-key {
      color: var(--fill-secondary);
      font-weight: 600;
      text-align: right;
      overflow-wrap: anywhere;
    }
    .zec-field-value {
      user-select: text;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .zec-field-value a {
      color: var(--accent-blue);
      text-decoration: none;
    }
    .zec-field-value a:hover {
      text-decoration: underline;
    }
  `;
  return style;
}

function getItemExtra(item: Zotero.Item): string {
  const extra = item.getField("extra");
  return typeof extra === "string" ? extra : "";
}
