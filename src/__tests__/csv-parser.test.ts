/**
 * Tests: CSV parsing and column mapping
 */

import { describe, it, expect } from "vitest";
import {
  parseCsv,
  parseCsvRow,
  bcadHeaderToField,
  oprHeaderToField,
} from "../services/csv-parser";

describe("parseCsvRow", () => {
  it("parses a simple row", () => {
    expect(parseCsvRow("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields with commas", () => {
    expect(parseCsvRow('"hello, world",b,c')).toEqual(["hello, world", "b", "c"]);
  });

  it("handles escaped double-quotes inside quoted fields", () => {
    expect(parseCsvRow('"say ""hi""",b')).toEqual(['say "hi"', "b"]);
  });

  it("handles empty fields", () => {
    expect(parseCsvRow("a,,c")).toEqual(["a", "", "c"]);
  });

  it("handles a single field", () => {
    expect(parseCsvRow("abc")).toEqual(["abc"]);
  });

  it("handles trailing comma", () => {
    expect(parseCsvRow("a,b,")).toEqual(["a", "b", ""]);
  });
});

describe("parseCsv", () => {
  it("parses a well-formed CSV", () => {
    const csv = `Name,Age,City\nAlice,30,Austin\nBob,25,Dallas`;
    const { headers, rows, errors } = parseCsv(csv);
    expect(headers).toEqual(["Name", "Age", "City"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Name: "Alice", Age: "30", City: "Austin" });
    expect(errors).toHaveLength(0);
  });

  it("handles CRLF line endings", () => {
    const csv = "A,B\r\n1,2\r\n3,4";
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ A: "1", B: "2" });
  });

  it("skips blank lines", () => {
    const csv = "A,B\n1,2\n\n3,4\n";
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(2);
  });

  it("handles quoted field containing newline", () => {
    const csv = `Name,Bio\nAlice,"Line one\nLine two"`;
    const { rows } = parseCsv(csv);
    expect(rows[0]?.["Bio"]).toBe("Line one\nLine two");
  });

  it("returns error for empty CSV", () => {
    const { errors } = parseCsv("");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("handles BCAD-style CSV with property IDs", () => {
    const csv = [
      "Property ID,Owner Name,Building Area (Sq Ft)",
      "10234567,SMITH LLC,12500",
    ].join("\n");
    const { rows } = parseCsv(csv);
    expect(rows[0]?.["Property ID"]).toBe("10234567");
    expect(rows[0]?.["Building Area (Sq Ft)"]).toBe("12500");
  });
});

describe("bcadHeaderToField", () => {
  it("maps 'Property ID' → 'propertyId'", () => {
    expect(bcadHeaderToField("Property ID")).toBe("propertyId");
  });

  it("maps 'Account Number' → 'propertyId'", () => {
    expect(bcadHeaderToField("Account Number")).toBe("propertyId");
  });

  it("maps 'Building Area (Sq Ft)' → 'buildingAreaSqFt'", () => {
    expect(bcadHeaderToField("Building Area (Sq Ft)")).toBe("buildingAreaSqFt");
  });

  it("maps 'Situs Address' → 'propertyAddress'", () => {
    expect(bcadHeaderToField("Situs Address")).toBe("propertyAddress");
  });

  it("maps 'Total Appraised Value' → 'totalAppraisedValue'", () => {
    expect(bcadHeaderToField("Total Appraised Value")).toBe("totalAppraisedValue");
  });

  it("is case-insensitive", () => {
    expect(bcadHeaderToField("PROPERTY ID")).toBe("propertyId");
    expect(bcadHeaderToField("property id")).toBe("propertyId");
  });

  it("returns undefined for unknown headers", () => {
    expect(bcadHeaderToField("Foobar Column")).toBeUndefined();
  });
});

describe("oprHeaderToField", () => {
  it("maps 'Document Number' → 'documentNumber'", () => {
    expect(oprHeaderToField("Document Number")).toBe("documentNumber");
  });

  it("maps 'Instrument Number' → 'documentNumber'", () => {
    expect(oprHeaderToField("Instrument Number")).toBe("documentNumber");
  });

  it("maps 'Recording Date' → 'recordingDate'", () => {
    expect(oprHeaderToField("Recording Date")).toBe("recordingDate");
  });

  it("maps 'Grantor' → 'grantor'", () => {
    expect(oprHeaderToField("Grantor")).toBe("grantor");
  });
});
