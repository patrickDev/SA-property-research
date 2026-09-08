/**
 * Tests: square-foot ↔ square-meter conversion
 */

import { describe, it, expect } from "vitest";
import { sqFtToSqM, SQ_FT_TO_SQ_M } from "../services/csv-exporter";

describe("sqFtToSqM", () => {
  it("converts 1 sq ft using documented factor (rounds to 2 decimal places)", () => {
    // 1 * 0.092903 = 0.092903 → rounds to 0.09 at 2 decimal places
    expect(sqFtToSqM(1)).toBe(0.09);
  });

  it("converts 1000 sq ft correctly", () => {
    expect(sqFtToSqM(1000)).toBeCloseTo(92.9, 1);
  });

  it("converts 10000 sq ft (≈929 sq m)", () => {
    expect(sqFtToSqM(10000)).toBeCloseTo(929.03, 1);
  });

  it("uses the documented factor constant", () => {
    expect(SQ_FT_TO_SQ_M).toBe(0.092903);
  });

  it("returns null for null input", () => {
    expect(sqFtToSqM(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(sqFtToSqM(undefined)).toBeNull();
  });

  it("rounds to 2 decimal places", () => {
    // 500 * 0.092903 = 46.4515 → 46.45
    expect(sqFtToSqM(500)).toBe(46.45);
  });

  it("handles 0 sq ft → 0 sq m", () => {
    expect(sqFtToSqM(0)).toBe(0);
  });

  it("inverse: 1 sq m ≈ 10.764 sq ft", () => {
    // sqFtToSqM(10.764) ≈ 1.0
    const sqFt = 1 / SQ_FT_TO_SQ_M;
    expect(sqFtToSqM(sqFt)).toBeCloseTo(1.0, 2);
  });
});
