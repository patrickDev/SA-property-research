/**
 * Zero-dependency CSV parser that correctly handles:
 *  - RFC 4180 quoting (fields wrapped in double-quotes)
 *  - Embedded commas and newlines within quoted fields
 *  - Escaped double-quotes ("")
 *  - CRLF and LF line endings
 *  - UTF-8 text (Workers always deal with text strings)
 *
 * Unit tests: src/__tests__/csv-parser.test.ts
 */

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

/**
 * Parse a CSV text string into an array of header-keyed row objects.
 *
 * @param text Raw UTF-8 CSV text
 */
export function parseCsv(text: string): ParseResult {
  const errors: string[] = [];

  const rawLines = splitRespectingQuotes(text);

  if (rawLines.length === 0) {
    return { headers: [], rows: [], errors: ["CSV file is empty"] };
  }

  const headers = parseCsvRow(rawLines[0] ?? "").map((h) => h.trim());

  if (headers.length === 0 || headers.every((h) => h === "")) {
    return { headers: [], rows: [], errors: ["CSV has no header row"] };
  }

  const rows: Record<string, string>[] = [];

  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line === undefined || line.trim() === "") continue;

    try {
      const values = parseCsvRow(line);
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j];
        if (key !== undefined && key !== "") {
          row[key] = values[j] ?? "";
        }
      }
      rows.push(row);
    } catch (e) {
      errors.push(`Row ${i + 1}: ${String(e)}`);
    }
  }

  return { headers, rows, errors };
}

/**
 * Split the CSV text into logical lines, respecting quoted newlines.
 * Returns one string per logical CSV row (may contain embedded newlines).
 */
function splitRespectingQuotes(text: string): string[] {
  // Normalize CRLF → LF; standalone CR → LF
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!;

    if (ch === '"') {
      // Escaped double-quote inside a quoted field
      if (inQuotes && normalized[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.length > 0 || lines.length === 0) {
    lines.push(current);
  }

  return lines;
}

/**
 * Parse a single CSV row string into an array of unquoted field values.
 */
export function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        // Do NOT add the quote character itself
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  fields.push(current);
  return fields;
}

// ─── BCAD column mapping ─────────────────────────────────────────────────────

/**
 * Flexible column name aliases — BCAD exports may vary heading capitalisation.
 * Keys are lower-cased header names; values are our canonical field names.
 */
const BCAD_COLUMN_ALIASES: Readonly<Record<string, string>> = {
  // Property ID
  "property id": "propertyId",
  prop_id: "propertyId",
  "account number": "propertyId",
  acct_no: "propertyId",
  // Geographic ID
  "geographic id": "geographicId",
  geo_id: "geographicId",
  "geo id": "geographicId",
  // Owner
  "owner name": "ownerName",
  owner: "ownerName",
  // Mailing address
  "mailing address": "ownerMailingAddress",
  mail_addr: "ownerMailingAddress",
  "owner mailing address": "ownerMailingAddress",
  "mailing city": "ownerMailingCity",
  "mail city": "ownerMailingCity",
  "mailing state": "ownerMailingState",
  "mail state": "ownerMailingState",
  "mailing zip": "ownerMailingZip",
  "mail zip": "ownerMailingZip",
  "mailing zip code": "ownerMailingZip",
  // Property address
  "property address": "propertyAddress",
  "site address": "propertyAddress",
  situs: "propertyAddress",
  "situs address": "propertyAddress",
  city: "city",
  "zip code": "zipCode",
  zip: "zipCode",
  // Legal
  "legal description": "legalDescription",
  legal_desc: "legalDescription",
  // Use code
  "property use code": "propertyUseCode",
  "use code": "propertyUseCode",
  "state code": "propertyUseCode",
  "property use description": "propertyUseDescription",
  "use description": "propertyUseDescription",
  // Building
  "building type": "buildingType",
  "improvement type": "buildingType",
  "building area": "buildingAreaSqFt",
  "building area (sq ft)": "buildingAreaSqFt",
  "bldg area": "buildingAreaSqFt",
  "impr sqft": "buildingAreaSqFt",
  // Land
  "land area (sq ft)": "landAreaSqFt",
  "land area sq ft": "landAreaSqFt",
  "land sqft": "landAreaSqFt",
  "land area (acres)": "landAreaAcres",
  "land acres": "landAreaAcres",
  acres: "landAreaAcres",
  // Values
  "improvement value": "improvementValue",
  "impr value": "improvementValue",
  "imprv val": "improvementValue",
  "land value": "landValue",
  "land val": "landValue",
  "total appraised value": "totalAppraisedValue",
  "market value": "totalAppraisedValue",
  "total value": "totalAppraisedValue",
  "appraised value": "totalAppraisedValue",
  // Exemption
  "exemption status": "exemptionStatus",
  exemptions: "exemptionStatus",
};

/** Map a raw CSV header to its canonical BCAD field name, or undefined. */
export function bcadHeaderToField(header: string): string | undefined {
  return BCAD_COLUMN_ALIASES[header.toLowerCase().trim()];
}

// ─── OPR column mapping ──────────────────────────────────────────────────────

const OPR_COLUMN_ALIASES: Readonly<Record<string, string>> = {
  "document number": "documentNumber",
  "doc number": "documentNumber",
  doc_no: "documentNumber",
  instrument: "documentNumber",
  "instrument number": "documentNumber",
  "recording date": "recordingDate",
  "recorded date": "recordingDate",
  "file date": "recordingDate",
  "document type": "documentType",
  "doc type": "documentType",
  type: "documentType",
  grantor: "grantor",
  grantors: "grantor",
  grantee: "grantee",
  grantees: "grantee",
  "legal description": "legalDescription",
  legal: "legalDescription",
  "property address": "propertyAddress",
  "situs address": "propertyAddress",
  address: "propertyAddress",
};

/** Map a raw CSV header to its canonical OPR field name, or undefined. */
export function oprHeaderToField(header: string): string | undefined {
  return OPR_COLUMN_ALIASES[header.toLowerCase().trim()];
}
