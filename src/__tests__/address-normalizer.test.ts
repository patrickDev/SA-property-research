/**
 * Tests: address normalization
 */

import { describe, it, expect } from "vitest";
import {
  normalizeAddress,
  normalizeLegalDescription,
} from "../services/address-normalizer";

describe("normalizeAddress", () => {
  it("uppercases the address", () => {
    expect(normalizeAddress("123 main st").normalized).toBe("123 MAIN STREET");
  });

  it("expands street type abbreviations", () => {
    expect(normalizeAddress("100 Oak Ave").normalized).toContain("AVENUE");
    expect(normalizeAddress("500 River Blvd").normalized).toContain("BOULEVARD");
    expect(normalizeAddress("200 Pine Dr").normalized).toContain("DRIVE");
    expect(normalizeAddress("300 Elm Rd").normalized).toContain("ROAD");
    expect(normalizeAddress("400 Cedar Ln").normalized).toContain("LANE");
    expect(normalizeAddress("10 Park Ct").normalized).toContain("COURT");
  });

  it("expands directionals", () => {
    expect(normalizeAddress("1 N Main St").normalized).toContain("NORTH");
    expect(normalizeAddress("1 S Main St").normalized).toContain("SOUTH");
    expect(normalizeAddress("1 E Main St").normalized).toContain("EAST");
    expect(normalizeAddress("1 W Main St").normalized).toContain("WEST");
    expect(normalizeAddress("1 NE Main St").normalized).toContain("NORTHEAST");
    expect(normalizeAddress("1 SW Main St").normalized).toContain("SOUTHWEST");
  });

  it("strips punctuation", () => {
    const result = normalizeAddress("100 Oak Ave., Apt. 2B");
    expect(result.normalized).not.toContain(".");
    expect(result.normalized).not.toContain(",");
  });

  it("collapses multiple spaces", () => {
    const result = normalizeAddress("100   Main   St");
    expect(result.normalized).toBe("100 MAIN STREET");
  });

  it("extracts suite designator", () => {
    const result = normalizeAddress("100 Main St Ste 200");
    expect(result.suite).toContain("STE");
    expect(result.normalized).not.toContain("STE");
  });

  it("extracts apartment designator", () => {
    const result = normalizeAddress("456 Oak Ave APT 3B");
    expect(result.suite).toBeTruthy();
    expect(result.normalized).not.toContain("APT");
  });

  it("returns empty string for null input", () => {
    expect(normalizeAddress(null).normalized).toBe("");
    expect(normalizeAddress(undefined).normalized).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(normalizeAddress("").normalized).toBe("");
  });

  it("produces consistent results for the same input", () => {
    const a = normalizeAddress("123 Commerce St San Antonio TX 78205").normalized;
    const b = normalizeAddress("123 Commerce St San Antonio TX 78205").normalized;
    expect(a).toBe(b);
  });

  it("normalizes BCAD-style address with full suite", () => {
    const result = normalizeAddress("4400 BABCOCK RD STE 200");
    expect(result.normalized).toContain("BABCOCK ROAD");
    expect(result.suite).toBeTruthy();
  });
});

describe("normalizeLegalDescription", () => {
  it("uppercases and strips punctuation", () => {
    const result = normalizeLegalDescription(
      "LOT 5, BLK 12 DOWNTOWN COMMERCIAL SUBDIVISION UNIT 3"
    );
    expect(result).toBe(
      "LOT 5 BLK 12 DOWNTOWN COMMERCIAL SUBDIVISION UNIT 3"
    );
  });

  it("returns empty string for null", () => {
    expect(normalizeLegalDescription(null)).toBe("");
  });

  it("collapses whitespace", () => {
    expect(normalizeLegalDescription("LOT  5  BLK  12")).toBe("LOT 5 BLK 12");
  });
});
