/**
 * BCAD ↔ OPR matching logic.
 *
 * Matching priority (highest confidence first):
 *  1. exact_id          — BCAD Property ID found in OPR document fields
 *  2. exact_geographic  — BCAD Geographic ID found in OPR document fields
 *  3. exact_legal       — Normalized legal description exact match
 *  4. fuzzy_address     — Normalized address similarity ≥ FUZZY_THRESHOLD
 *  5. needs_review      — Legal desc matches but address conflicts (or vice versa)
 *  6. unmatched         — No reliable link found
 *
 * Unit tests: src/__tests__/matcher.test.ts
 */

import type { MatchConfidence } from "../types";

/**
 * Combined similarity score threshold for fuzzy address matching.
 * A value of 0.85 means 85% similarity between two normalized address strings.
 */
export const FUZZY_THRESHOLD = 0.85;

// ─── String distance helpers ─────────────────────────────────────────────────

/**
 * Standard Levenshtein edit distance.
 * Time: O(m·n), Space: O(m·n).  Acceptable for typical address lengths.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Allocate a (m+1) × (n+1) matrix
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    for (let j = 0; j <= n; j++) {
      dp[i]![j] = i === 0 ? j : j === 0 ? i : 0;
    }
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] =
          1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
  }
  return dp[m]![n]!;
}

/**
 * Character-level similarity: 1 − (edit distance / max length).
 */
export function charSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Token-level Jaccard similarity: |A ∩ B| / |A ∪ B| on space-split tokens.
 */
export function tokenSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Combined similarity: average of character and token similarity.
 * This reduces sensitivity to single-character typos while still
 * catching token-order differences.
 */
export function combinedSimilarity(a: string, b: string): number {
  return (charSimilarity(a, b) + tokenSimilarity(a, b)) / 2;
}

// ─── Match logic ─────────────────────────────────────────────────────────────

export interface MatchInput {
  /** Normalized BCAD property ID (for exact_id check) */
  propertyId: string;
  /** Normalized BCAD geographic ID */
  geographicId?: string | null;
  /** Normalized property address (from properties table) */
  propertyAddressNormalized?: string | null;
  /** Normalized legal description (from properties table) */
  legalDescriptionNormalized?: string | null;
}

export interface OprDocInput {
  /** If the OPR doc references a BCAD property ID directly */
  bcadPropertyId?: string | null;
  /** If the OPR doc references a BCAD geographic ID directly */
  bcadGeographicId?: string | null;
  /** Normalized OPR property address */
  propertyAddressNormalized?: string | null;
  /** Normalized OPR legal description */
  legalDescriptionNormalized?: string | null;
}

export interface MatchResult {
  confidence: MatchConfidence;
  /** Similarity score when confidence is fuzzy_address (0–1) */
  similarity?: number;
}

/**
 * Determine how confidently an OPR document links to a BCAD property.
 *
 * Rules:
 * - If both legal desc and address match → exact_legal
 * - If legal desc matches but address conflicts → needs_review
 * - If only legal desc matches (no address on one side) → exact_legal
 * - If address similarity ≥ FUZZY_THRESHOLD → fuzzy_address
 * - Otherwise → unmatched
 */
export function matchOprToProperty(
  opr: OprDocInput,
  prop: MatchInput
): MatchResult {
  // 1. Exact Property ID
  if (opr.bcadPropertyId && opr.bcadPropertyId === prop.propertyId) {
    return { confidence: "exact_id" };
  }

  // 2. Exact Geographic ID
  if (
    opr.bcadGeographicId &&
    prop.geographicId &&
    opr.bcadGeographicId === prop.geographicId
  ) {
    return { confidence: "exact_geographic" };
  }

  // 3. Legal description exact match
  const legalMatch =
    opr.legalDescriptionNormalized &&
    prop.legalDescriptionNormalized &&
    opr.legalDescriptionNormalized.length > 0 &&
    prop.legalDescriptionNormalized.length > 0 &&
    opr.legalDescriptionNormalized === prop.legalDescriptionNormalized;

  if (legalMatch) {
    const oprAddr = opr.propertyAddressNormalized;
    const propAddr = prop.propertyAddressNormalized;

    // Both addresses present and they conflict → needs_review
    if (
      oprAddr &&
      propAddr &&
      oprAddr.length > 0 &&
      propAddr.length > 0 &&
      oprAddr !== propAddr
    ) {
      return { confidence: "needs_review" };
    }
    // Legal matches (addresses agree or one is absent)
    return { confidence: "exact_legal" };
  }

  // 4. Fuzzy address match
  const oprAddr = opr.propertyAddressNormalized;
  const propAddr = prop.propertyAddressNormalized;
  if (oprAddr && propAddr && oprAddr.length > 0 && propAddr.length > 0) {
    const similarity = combinedSimilarity(oprAddr, propAddr);
    if (similarity >= FUZZY_THRESHOLD) {
      return { confidence: "fuzzy_address", similarity };
    }
  }

  return { confidence: "unmatched" };
}
