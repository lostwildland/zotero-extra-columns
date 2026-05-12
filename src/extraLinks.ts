import type { ExtraEntry } from "./extraParser";

export function linkForExtraEntry(entry: ExtraEntry): string | null {
  const value = entry.value.trim();
  if (isExternalURL(value)) {
    return value;
  }

  if (entry.canonicalKey === "doi") {
    return `https://doi.org/${stripDOIPrefix(value)}`;
  }

  if (entry.canonicalKey === "arxiv") {
    const id = value.replace(/^arxiv:\s*/i, "").trim();
    if (/^\d{4}\.\d{4,5}(v\d+)?$/i.test(id)) {
      return `https://arxiv.org/abs/${id}`;
    }
  }

  return null;
}

function isExternalURL(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function stripDOIPrefix(value: string): string {
  return value
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .trim();
}
