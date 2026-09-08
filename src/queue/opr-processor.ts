/**
 * OPR import queue processor.
 *
 * Parses the OPR CSV, upserts opr_documents (deduplicated by document_number),
 * then matches each document against all existing properties using the
 * matching priority defined in matcher.ts.
 *
 * Unmatched documents are stored with property_id = NULL in opr_property_links.
 */

import type { Env, ImportJobRow, OprCsvRow } from "../types";
import { parseCsv, oprHeaderToField } from "../services/csv-parser";
import {
  normalizeAddress,
  normalizeLegalDescription,
} from "../services/address-normalizer";
import {
  matchOprToProperty,
  type MatchInput,
  type OprDocInput,
} from "../services/matcher";

// ─── CSV → typed row ──────────────────────────────────────────────────────────

function mapOprRow(raw: Record<string, string>): OprCsvRow | null {
  const mapped: Record<string, string> = {};

  for (const [header, value] of Object.entries(raw)) {
    const field = oprHeaderToField(header);
    if (field) mapped[field] = value.trim();
  }

  const documentNumber = mapped["documentNumber"]?.trim();
  if (!documentNumber) return null;

  return {
    documentNumber,
    recordingDate: mapped["recordingDate"] || undefined,
    documentType: mapped["documentType"] || undefined,
    grantor: mapped["grantor"] || undefined,
    grantee: mapped["grantee"] || undefined,
    legalDescription: mapped["legalDescription"] || undefined,
    propertyAddress: mapped["propertyAddress"] || undefined,
  };
}

// ─── Main processor ───────────────────────────────────────────────────────────

export async function processOprImport(
  env: Env,
  job: ImportJobRow
): Promise<void> {
  const r2Key = job.source_file_r2_key;
  if (!r2Key) throw new Error("Job has no source_file_r2_key");

  const object = await env.FILES_BUCKET.get(r2Key);
  if (!object) throw new Error(`R2 object not found: ${r2Key}`);

  const text = await object.text();
  const { rows, errors: parseErrors } = parseCsv(text);

  const now = new Date().toISOString();
  const dataSource = `OPR import ${job.id}`;
  const fileHash = job.source_file_hash ?? "";
  const jobErrors: string[] = [...parseErrors];
  let processed = 0;
  let failed = 0;

  await env.DB.prepare(
    "UPDATE import_jobs SET status='processing', total_records=?, updated_at=? WHERE id=?"
  )
    .bind(rows.length, now, job.id)
    .run();

  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);

    for (const rawRow of chunk) {
      const row = mapOprRow(rawRow);
      if (!row) {
        failed++;
        jobErrors.push(`Row ${i + 1}: missing Document Number`);
        continue;
      }

      try {
        await upsertOprRow(env, row, dataSource, fileHash, now);
        processed++;
      } catch (err) {
        failed++;
        jobErrors.push(`Document ${row.documentNumber}: ${String(err)}`);
      }
    }

    await env.DB.prepare(
      "UPDATE import_jobs SET processed_records=?, failed_records=?, errors=?, updated_at=? WHERE id=?"
    )
      .bind(
        processed,
        failed,
        JSON.stringify(jobErrors.slice(0, 100)),
        new Date().toISOString(),
        job.id
      )
      .run();
  }

  await env.DB.prepare(
    `UPDATE import_jobs
     SET status=?, processed_records=?, failed_records=?, errors=?, updated_at=?
     WHERE id=?`
  )
    .bind(
      failed === rows.length && rows.length > 0 ? "failed" : "completed",
      processed,
      failed,
      JSON.stringify(jobErrors.slice(0, 100)),
      new Date().toISOString(),
      job.id
    )
    .run();
}

async function upsertOprRow(
  env: Env,
  row: OprCsvRow,
  dataSource: string,
  fileHash: string,
  now: string
): Promise<void> {
  const { normalized: addrNorm } = normalizeAddress(row.propertyAddress);
  const legalNorm = normalizeLegalDescription(row.legalDescription);

  // Insert or ignore (deduplicate by document_number)
  const result = await env.DB.prepare(
    `INSERT INTO opr_documents
       (document_number, recording_date, document_type, grantor, grantee,
        legal_description, legal_description_normalized,
        property_address, property_address_normalized,
        data_source, source_file_hash, import_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(document_number) DO NOTHING`
  )
    .bind(
      row.documentNumber,
      row.recordingDate ?? null,
      row.documentType ?? null,
      row.grantor ?? null,
      row.grantee ?? null,
      row.legalDescription ?? null,
      legalNorm || null,
      row.propertyAddress ?? null,
      addrNorm || null,
      dataSource,
      fileHash,
      now
    )
    .run();

  // Get the document ID (may have been from a previous import)
  const docRow = await env.DB.prepare(
    "SELECT id FROM opr_documents WHERE document_number = ?"
  )
    .bind(row.documentNumber)
    .first<{ id: number }>();

  if (!docRow) return;
  const docId = docRow.id;

  // Skip matching if links already exist for this document
  const existingLinks = await env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM opr_property_links WHERE opr_document_id = ?"
  )
    .bind(docId)
    .first<{ cnt: number }>();

  if (existingLinks && existingLinks.cnt > 0) return;

  // Match against all properties
  const oprInput: OprDocInput = {
    propertyAddressNormalized: addrNorm || null,
    legalDescriptionNormalized: legalNorm || null,
  };

  // Fetch candidate properties (address-indexed for efficiency)
  // We run two candidate queries: exact legal desc, then fuzzy address
  const candidates = await env.DB.prepare(
    `SELECT id, geographic_id,
            property_address_normalized,
            legal_description_normalized
     FROM properties
     WHERE (
       (legal_description_normalized IS NOT NULL AND legal_description_normalized != '' AND
        legal_description_normalized = ?)
       OR
       (property_address_normalized IS NOT NULL AND property_address_normalized != '')
     )
     LIMIT 50`
  )
    .bind(legalNorm || "___NO_MATCH___")
    .all<{
      id: string;
      geographic_id: string | null;
      property_address_normalized: string | null;
      legal_description_normalized: string | null;
    }>();

  let bestConfidence: string = "unmatched";
  let bestPropertyId: string | null = null;
  let bestSimilarity = 0;

  for (const prop of candidates.results ?? []) {
    const matchResult = matchOprToProperty(oprInput, {
      propertyId: prop.id,
      geographicId: prop.geographic_id,
      propertyAddressNormalized: prop.property_address_normalized,
      legalDescriptionNormalized: prop.legal_description_normalized,
    });

    // Pick the highest-confidence match
    const priority = confidencePriority(matchResult.confidence);
    const bestPriority = confidencePriority(
      bestConfidence as typeof matchResult.confidence
    );

    if (
      priority > bestPriority ||
      (priority === bestPriority &&
        (matchResult.similarity ?? 0) > bestSimilarity)
    ) {
      bestConfidence = matchResult.confidence;
      bestPropertyId = prop.id;
      bestSimilarity = matchResult.similarity ?? 0;
    }
  }

  // Insert link (or unmatched record)
  const finalConfidence =
    bestPropertyId ? bestConfidence : "unmatched";
  const finalPropertyId = bestPropertyId ?? null;

  await env.DB.prepare(
    `INSERT INTO opr_property_links (opr_document_id, property_id, match_confidence, created_at)
     VALUES (?,?,?,?)`
  )
    .bind(docId, finalPropertyId, finalConfidence, now)
    .run();

  // Suppress unused variable warning
  void result;
}

function confidencePriority(confidence: string): number {
  const priorities: Record<string, number> = {
    exact_id: 5,
    exact_geographic: 4,
    exact_legal: 3,
    fuzzy_address: 2,
    needs_review: 1,
    unmatched: 0,
  };
  return priorities[confidence] ?? 0;
}
