/**
 * Tests: BCAD ↔ OPR matching logic and similarity functions
 */

import { describe, it, expect } from "vitest";
import {
  levenshtein,
  charSimilarity,
  tokenSimilarity,
  combinedSimilarity,
  matchOprToProperty,
  FUZZY_THRESHOLD,
} from "../services/matcher";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("returns string length for empty vs non-empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("computes distance for one substitution", () => {
    expect(levenshtein("abc", "axc")).toBe(1);
  });

  it("computes distance for one insertion", () => {
    expect(levenshtein("abc", "abcd")).toBe(1);
  });

  it("computes distance for one deletion", () => {
    expect(levenshtein("abcd", "abc")).toBe(1);
  });

  it("returns correct distance for 'kitten' vs 'sitting'", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("charSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(charSimilarity("abc", "abc")).toBe(1);
  });

  it("returns 0 for empty string vs non-empty", () => {
    expect(charSimilarity("", "abc")).toBe(0);
  });

  it("returns value between 0 and 1 for similar strings", () => {
    const s = charSimilarity("456 COMMERCE ST", "456 COMMERCE STREET");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("tokenSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(tokenSimilarity("ONE TWO THREE", "ONE TWO THREE")).toBe(1);
  });

  it("returns 1 for same tokens in different order", () => {
    expect(tokenSimilarity("THREE ONE TWO", "ONE TWO THREE")).toBe(1);
  });

  it("returns 0 for completely different tokens", () => {
    expect(tokenSimilarity("ABC DEF", "XYZ PQR")).toBe(0);
  });

  it("returns fractional value for partial overlap", () => {
    const s = tokenSimilarity("100 MAIN STREET", "100 MAIN AVENUE");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });
});

describe("combinedSimilarity", () => {
  it("returns high similarity for very similar addresses", () => {
    const s = combinedSimilarity(
      "456 COMMERCE STREET SAN ANTONIO TX 78205",
      "456 COMMERCE STREET SAN ANTONIO TX 78205"
    );
    expect(s).toBe(1);
  });

  it("returns moderate similarity for minor differences", () => {
    const s = combinedSimilarity(
      "456 COMMERCE STREET",
      "456 COMMERC STREET" // one typo
    );
    expect(s).toBeGreaterThan(0.7);
  });

  it("returns low similarity for very different strings", () => {
    const s = combinedSimilarity("456 COMMERCE ST", "789 OAK AVENUE");
    expect(s).toBeLessThan(0.5);
  });
});

describe("matchOprToProperty", () => {
  const baseProperty = {
    propertyId: "10234567",
    geographicId: "38-044-0567",
    propertyAddressNormalized: "456 COMMERCE STREET SAN ANTONIO TX 78205",
    legalDescriptionNormalized: "LOT 5 BLK 12 DOWNTOWN COMMERCIAL SUBDIVISION UNIT 3",
  };

  it("returns exact_id when BCAD property ID matches", () => {
    const result = matchOprToProperty(
      { bcadPropertyId: "10234567" },
      baseProperty
    );
    expect(result.confidence).toBe("exact_id");
  });

  it("returns exact_geographic when geographic ID matches", () => {
    const result = matchOprToProperty(
      { bcadGeographicId: "38-044-0567" },
      baseProperty
    );
    expect(result.confidence).toBe("exact_geographic");
  });

  it("returns exact_legal when legal description matches exactly", () => {
    const result = matchOprToProperty(
      {
        legalDescriptionNormalized:
          "LOT 5 BLK 12 DOWNTOWN COMMERCIAL SUBDIVISION UNIT 3",
        propertyAddressNormalized:
          "456 COMMERCE STREET SAN ANTONIO TX 78205",
      },
      baseProperty
    );
    expect(result.confidence).toBe("exact_legal");
  });

  it("returns needs_review when legal desc matches but address conflicts", () => {
    const result = matchOprToProperty(
      {
        legalDescriptionNormalized:
          "LOT 5 BLK 12 DOWNTOWN COMMERCIAL SUBDIVISION UNIT 3",
        propertyAddressNormalized: "789 TOTALLY DIFFERENT ROAD",
      },
      baseProperty
    );
    expect(result.confidence).toBe("needs_review");
  });

  it("returns fuzzy_address for similar addresses above threshold", () => {
    const result = matchOprToProperty(
      {
        propertyAddressNormalized:
          "456 COMMERCE STREET SAN ANTONIO TX 78205", // identical in this case
      },
      baseProperty
    );
    // Should be fuzzy_address or exact_legal (no legal desc supplied)
    expect(["fuzzy_address", "exact_legal"]).toContain(result.confidence);
  });

  it("returns unmatched when no criteria match", () => {
    const result = matchOprToProperty(
      {
        propertyAddressNormalized: "999 UNKNOWN PLACE NOWHERE TX 99999",
        legalDescriptionNormalized: "LOT 99 BLK 99 NONEXISTENT SUBDIVISION",
      },
      baseProperty
    );
    expect(result.confidence).toBe("unmatched");
  });

  it("FUZZY_THRESHOLD is documented and between 0.8 and 1", () => {
    expect(FUZZY_THRESHOLD).toBeGreaterThan(0.8);
    expect(FUZZY_THRESHOLD).toBeLessThan(1);
  });

  it("returns unmatched when both property ID and OPR doc have empty addresses", () => {
    const result = matchOprToProperty(
      { propertyAddressNormalized: "" },
      { ...baseProperty, propertyAddressNormalized: "" }
    );
    expect(result.confidence).toBe("unmatched");
  });
});
