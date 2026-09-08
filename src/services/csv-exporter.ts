/**
 * CSV export utilities.
 *
 * Generates a compliant RFC 4180 CSV string with:
 *  - Quoted fields containing commas, double-quotes, or newlines
 *  - Double-quote escaping ("")
 *  - CRLF line endings (RFC 4180 standard)
 */

/** Escape a single CSV field value. */
export function escapeCsvField(
  value: string | number | boolean | null | undefined
): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Quote if the string contains comma, double-quote, or newline
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Convert an array of field values to a single CSV row string (no newline). */
export function toCsvRow(
  fields: (string | number | boolean | null | undefined)[]
): string {
  return fields.map(escapeCsvField).join(",");
}

/**
 * Build a complete CSV document string (with CRLF line endings).
 *
 * @param headers Array of column header strings
 * @param rows    Array of row data arrays (same order as headers)
 */
export function toCsvString(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const lines: string[] = [toCsvRow(headers)];
  for (const row of rows) {
    lines.push(toCsvRow(row));
  }
  return lines.join("\r\n");
}

/** Column headers for the commercial-property export CSV. */
export const EXPORT_HEADERS = [
  "Owner Name",
  "Owner Mailing Address",
  "Property Address",
  "City",
  "ZIP Code",
  "Property ID",
  "Geographic ID",
  "Legal Description",
  "Property Use Code",
  "Property Use Description",
  "Building Type",
  "Building Area Sq Ft",
  "Building Area Sq M",
  "Land Area Sq Ft",
  "Land Area Acres",
  "Improvement Value",
  "Land Value",
  "Total Market Value",
  "Latest OPR Document Number",
  "Latest OPR Document Type",
  "Latest OPR Recording Date",
  "Match Confidence",
  "Grantor",
  "Grantee",
  "Call Status",
  "Notes",
  "Data Source",
  "Last Updated",
] as const;

/** Square foot → square meter conversion factor. */
export const SQ_FT_TO_SQ_M = 0.092903;

/** Convert square feet to square meters. */
export function sqFtToSqM(sqFt: number | null | undefined): number | null {
  if (sqFt === null || sqFt === undefined) return null;
  return Math.round(sqFt * SQ_FT_TO_SQ_M * 100) / 100;
}
