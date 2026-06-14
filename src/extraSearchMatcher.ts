import { canonicalizeExtraKey, parseExtraFields } from "./extraParser";

export const EXTRA_SEARCH_CONDITION_PREFIX = "extraField:";

export type ExtraSearchOperator =
  | "is"
  | "isNot"
  | "contains"
  | "doesNotContain"
  | "beginsWith";

export interface ExtraSearchConditionID {
  condition: string;
  canonicalKey: string;
}

export function encodeExtraSearchCondition(canonicalKey: string): string {
  return `${EXTRA_SEARCH_CONDITION_PREFIX}${encodeURIComponent(
    canonicalizeExtraKey(canonicalKey),
  )}`;
}

export function decodeExtraSearchCondition(
  condition: string,
): ExtraSearchConditionID | null {
  if (!condition.startsWith(EXTRA_SEARCH_CONDITION_PREFIX)) {
    return null;
  }

  const encodedKey = condition.slice(EXTRA_SEARCH_CONDITION_PREFIX.length);
  if (!encodedKey) {
    return null;
  }

  try {
    const canonicalKey = canonicalizeExtraKey(decodeURIComponent(encodedKey));
    return canonicalKey ? { condition, canonicalKey } : null;
  } catch (_error) {
    return null;
  }
}

export function isExtraSearchCondition(condition: string): boolean {
  return Boolean(decodeExtraSearchCondition(condition));
}

export function matchExtraField(
  extra: unknown,
  canonicalKey: string,
  operator: ExtraSearchOperator,
  query: unknown,
): boolean {
  const targetKey = canonicalizeExtraKey(canonicalKey);
  const queryValue = String(query ?? "");
  const values = parseExtraFields(extra)
    .filter((entry) => entry.canonicalKey === targetKey)
    .map((entry) => entry.value);

  const hasPositiveMatch = values.some((value) =>
    matchesPositiveOperator(value, operator, queryValue),
  );

  switch (operator) {
    case "is":
    case "contains":
    case "beginsWith":
      return hasPositiveMatch;

    case "isNot":
    case "doesNotContain":
      return !hasPositiveMatch;
  }
}

function matchesPositiveOperator(
  value: string,
  operator: ExtraSearchOperator,
  query: string,
): boolean {
  switch (operator) {
    case "is":
    case "isNot":
      return value === query;

    case "contains":
    case "doesNotContain":
      return value.includes(query);

    case "beginsWith":
      return value.startsWith(query);
  }
}
