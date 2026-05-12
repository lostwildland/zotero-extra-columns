export interface ExtraEntry {
  rawKey: string;
  normalizedKey: string;
  canonicalKey: string;
  label: string;
  value: string;
  line: number;
  syntax: "colon" | "citeproc";
}

export interface ExtraFieldDefinition {
  canonicalKey: string;
  label: string;
  rawKeys: string[];
  count: number;
}

export interface ExtraRemovalResult {
  extra: string;
  removed: number;
}

const KEY_VALUE_RE = /^([A-Za-z][A-Za-z0-9 _-]*):\s*(.+)$/;
const CITEPROC_RE = /^\{:\s*([A-Za-z][A-Za-z0-9 _-]*)\s*:\s*(.+)\}$/;

const KEY_ALIASES: Record<string, string> = {
  arxiv: "arxiv",
  "ar-xiv": "arxiv",
};

const LABELS: Record<string, string> = {
  "abstract-translation": "Abstract Translation",
  arxiv: "arXiv",
  "citation-key": "Citation Key",
  doi: "DOI",
  isbn: "ISBN",
  issn: "ISSN",
  "original-date": "Original Date",
  pmcid: "PMCID",
  pmid: "PMID",
  "title-translation": "Title Translation",
  url: "URL",
};

export function parseExtraFields(extra: unknown): ExtraEntry[] {
  if (typeof extra !== "string" || extra.trim() === "") {
    return [];
  }

  return extra
    .split(/\r?\n/g)
    .map((line, index) => parseExtraLine(line, index + 1))
    .filter((entry): entry is ExtraEntry => Boolean(entry));
}

export function getExtraFieldValue(
  extra: unknown,
  canonicalKey: string,
): string {
  const targetKey = canonicalizeExtraKey(canonicalKey);
  return (
    parseExtraFields(extra).find((entry) => entry.canonicalKey === targetKey)
      ?.value || ""
  );
}

export function discoverExtraFieldDefinitions(
  extras: Iterable<unknown>,
): ExtraFieldDefinition[] {
  const definitions = new Map<string, ExtraFieldDefinition>();

  for (const extra of extras) {
    for (const entry of parseExtraFields(extra)) {
      const existing = definitions.get(entry.canonicalKey);
      if (existing) {
        existing.count += 1;
        if (!existing.rawKeys.includes(entry.rawKey)) {
          existing.rawKeys.push(entry.rawKey);
        }
      } else {
        definitions.set(entry.canonicalKey, {
          canonicalKey: entry.canonicalKey,
          label: entry.label,
          rawKeys: [entry.rawKey],
          count: 1,
        });
      }
    }
  }

  return Array.from(definitions.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
}

export function removeExtraFieldLines(
  extra: unknown,
  canonicalKey: string,
): ExtraRemovalResult {
  if (typeof extra !== "string" || extra.trim() === "") {
    return { extra: "", removed: 0 };
  }

  const targetKey = canonicalizeExtraKey(canonicalKey);
  let removed = 0;
  const remainingLines = extra.split(/\r?\n/g).filter((line, index) => {
    const entry = parseExtraLine(line, index + 1);
    if (entry?.canonicalKey === targetKey) {
      removed += 1;
      return false;
    }
    return true;
  });

  const nextExtra = remainingLines.some((line) => line.trim() !== "")
    ? remainingLines.join("\n")
    : "";

  return { extra: nextExtra, removed };
}

export function normalizeExtraKey(key: string): string {
  return key
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function canonicalizeExtraKey(key: string): string {
  const normalized = normalizeExtraKey(key);
  return KEY_ALIASES[normalized] || normalized;
}

export function labelForExtraKey(rawKey: string): string {
  const canonicalKey = canonicalizeExtraKey(rawKey);
  if (LABELS[canonicalKey]) {
    return LABELS[canonicalKey];
  }
  return canonicalKey
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^[a-z]{2,4}\d*$/i.test(part) && part === part.toUpperCase()) {
        return part;
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function parseExtraLine(line: string, lineNumber: number): ExtraEntry | null {
  const match = line.match(KEY_VALUE_RE);
  const citeprocMatch = match ? null : line.match(CITEPROC_RE);
  const parts = match || citeprocMatch;
  if (!parts) {
    return null;
  }

  const rawKey = parts[1].trim();
  const value = parts[2].trim();
  if (!rawKey || !value) {
    return null;
  }

  const normalizedKey = normalizeExtraKey(rawKey);
  const canonicalKey = canonicalizeExtraKey(rawKey);
  return {
    rawKey,
    normalizedKey,
    canonicalKey,
    label: labelForExtraKey(rawKey),
    value,
    line: lineNumber,
    syntax: match ? "colon" : "citeproc",
  };
}
