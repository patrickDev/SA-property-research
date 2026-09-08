/**
 * Tests: CSV export field escaping and property filtering helpers
 */

import { describe, it, expect } from "vitest";
import {
  escapeCsvField,
  toCsvRow,
  toCsvString,
} from "../services/csv-exporter";

describe("escapeCsvField", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
  });

  it("quotes fields containing commas", () => {
    expect(escapeCsvField("Smith, John")).toBe('"Smith, John"');
  });

  it("quotes fields containing double-quotes and escapes them", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes fields containing newlines", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("returns empty string for null", () => {
    expect(escapeCsvField(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("converts numbers to strings", () => {
    expect(escapeCsvField(12345)).toBe("12345");
    expect(escapeCsvField(0)).toBe("0");
  });

  it("converts booleans to strings", () => {
    expect(escapeCsvField(true)).toBe("true");
    expect(escapeCsvField(false)).toBe("false");
  });

  it("handles empty string", () => {
    expect(escapeCsvField("")).toBe("");
  });
});

describe("toCsvRow", () => {
  it("joins fields with commas", () => {
    expect(toCsvRow(["a", "b", "c"])).toBe("a,b,c");
  });

  it("handles mixed types", () => {
    expect(toCsvRow(["Smith LLC", 12500, null])).toBe("Smith LLC,12500,");
  });

  it("handles field with comma", () => {
    expect(toCsvRow(["Smith, John", "TX"])).toBe('"Smith, John",TX');
  });
});

describe("toCsvString", () => {
  it("generates correct CSV with headers and rows", () => {
    const headers = ["Name", "Value"];
    const rows = [
      ["Alice", 100],
      ["Bob", 200],
    ];
    const result = toCsvString(headers, rows);
    const lines = result.split("\r\n");
    expect(lines[0]).toBe("Name,Value");
    expect(lines[1]).toBe("Alice,100");
    expect(lines[2]).toBe("Bob,200");
  });

  it("uses CRLF line endings (RFC 4180)", () => {
    const result = toCsvString(["A"], [["1"], ["2"]]);
    expect(result).toContain("\r\n");
    expect(result).not.toContain("\n\r");
  });

  it("handles empty rows array", () => {
    const result = toCsvString(["A", "B"], []);
    expect(result).toBe("A,B");
  });

  it("correctly quotes values with special characters", () => {
    const result = toCsvString(
      ["Owner", "Address"],
      [["Smith, Corp", "123 Main St"]]
    );
    expect(result).toContain('"Smith, Corp"');
  });
});
