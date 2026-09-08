/**
 * Address normalization utilities.
 *
 * Normalization steps:
 *  1. Uppercase
 *  2. Extract and strip suite/unit suffix into a separate field
 *  3. Strip punctuation (non-alphanumeric, non-space)
 *  4. Expand common street-type and directional abbreviations
 *  5. Collapse multiple spaces
 *
 * Unit tests: src/__tests__/address-normalizer.test.ts
 */

/** Street-type and directional abbreviation expansions */
const ABBREVIATIONS: Readonly<Record<string, string>> = {
  // Street types
  ALY: "ALLEY",
  AVE: "AVENUE",
  AV: "AVENUE",
  BLVD: "BOULEVARD",
  BVLD: "BOULEVARD",
  CIR: "CIRCLE",
  CT: "COURT",
  CV: "COVE",
  DR: "DRIVE",
  EXPY: "EXPRESSWAY",
  FWY: "FREEWAY",
  HWY: "HIGHWAY",
  LN: "LANE",
  PKWY: "PARKWAY",
  PL: "PLACE",
  RD: "ROAD",
  SQ: "SQUARE",
  ST: "STREET",
  TER: "TERRACE",
  TRL: "TRAIL",
  // Directionals
  N: "NORTH",
  S: "SOUTH",
  E: "EAST",
  W: "WEST",
  NE: "NORTHEAST",
  NW: "NORTHWEST",
  SE: "SOUTHEAST",
  SW: "SOUTHWEST",
};

/**
 * Regex to match common suite/unit designators and their values.
 * Examples: "STE 100", "SUITE A", "APT 2B", "#301", "UNIT 4", "BLDG B".
 */
const SUITE_RE =
  /\b(?:STE|SUITE|APT|APARTMENT|UNIT|#|BLDG|BUILDING|FLOOR|FL|RM|ROOM)\s*[#\-]?\s*[\w\d]+\b/gi;

export interface NormalizedAddress {
  /** Fully normalized address string for comparison/indexing */
  normalized: string;
  /** Extracted suite/unit designator (if any), not included in normalized */
  suite?: string;
}

/**
 * Normalize a property or mailing address for consistent matching.
 * Returns the normalized string and optionally the extracted suite/unit.
 */
export function normalizeAddress(
  address: string | null | undefined
): NormalizedAddress {
  if (!address) return { normalized: "" };

  let addr = address.toUpperCase();

  // Extract suite/unit
  const suiteMatches = addr.match(SUITE_RE);
  const suite = suiteMatches ? suiteMatches[0] : undefined;
  if (suite) {
    addr = addr.replace(SUITE_RE, "");
  }

  // Strip non-alphanumeric, non-space characters
  addr = addr.replace(/[^A-Z0-9 ]/g, " ");

  // Expand abbreviations (word boundary matching via split/rejoin)
  const expanded = addr
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ABBREVIATIONS[word] ?? word);

  const normalized = expanded.join(" ").trim();

  return {
    normalized,
    suite: suite
      ? suite
          .toUpperCase()
          .replace(/[^A-Z0-9 ]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : undefined,
  };
}

/**
 * Normalize a legal description for matching.
 * Strips punctuation, uppercases, and collapses whitespace.
 */
export function normalizeLegalDescription(
  desc: string | null | undefined
): string {
  if (!desc) return "";
  return desc
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
