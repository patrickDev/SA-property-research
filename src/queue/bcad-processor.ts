/**
 * BCAD import queue processor.
 *
 * Reads the uploaded CSV from R2, parses it, and upserts records into D1:
 *  - properties (upsert)
 *  - owners (upsert per property)
 *  - property_improvements (delete-then-insert per property, then reaggregate)
 *
 * After each property is upserted, we attempt to match existing OPR documents
 * and create opr_property_links if not already present.
 *
 * Converts sq ft → sq m using the documented formula (× 0.092903).
 * A property with no improvements is NOT marked commercial=1.
 */

import type { Env, ImportJobRow, BcadCsvRow } from "../types";
import { parseCsv, bcadHeaderToField } from "../services/csv-parser";
import { normalizeAddress, normalizeLegalDescription } from "../services/address-normalizer";
import { SQ_FT_TO_SQ_M } from "../services/csv-exporter";
import { matchOprToProperty, type MatchInput, type OprDocInput } from "../services/matcher";

// ─── CSV → typed row ──────────────────────────────────────────────────────────

function mapBcadRow(raw: Record<string, string>): BcadCsvRow | null {
  const mapped: Record<string, string | number> = {};

  for (const [header, value] of Object.entries(raw)) {
    const field = bcadHeaderToField(header);
    if (field) mapped[field] = value.trim();
  }

  const propertyId = (mapped["propertyId"] as string | undefined)?.trim();
  if (!propertyId) return null; // Row without a property ID is unusable

  const numField = (key: string): number | undefined => {
    const v = mapped[key] as string | undefined;
    if (!v) return undefined;
    const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
    return isNaN(n) ? undefined : n;
  };

  return {
    propertyId,
    geographicId: mapped["geographicId"] as string | undefined,
    ownerName: mapped["ownerName"] as string | undefined,
    ownerMailingAddress: mapped["ownerMailingAddress"] as string | undefined,
    ownerMailingCity: mapped["ownerMailingCity"] as string | undefined,
    ownerMailingState: mapped["ownerMailingState"] as string | undefined,
    ownerMailingZip: mapped["ownerMailingZip"] as string | undefined,
    propertyAddress: mapped["propertyAddress"] as string | undefined,
    city: mapped["city"] as string | undefined,
    zipCode: mapped["zipCode"] as string | undefined,
    legalDescription: mapped["legalDescription"] as string | undefined,
    propertyUseCode: mapped["propertyUseCode"] as string | undefined,
    propertyUseDescription: mapped["propertyUseDescription"] as string | undefined,
    buildingType: mapped["buildingType"] as string | undefined,
    buildingAreaSqFt: numField("buildingAreaSqFt"),
    landAreaSqFt: numField("landAreaSqFt"),
    landAreaAcres: numField("landAreaAcres"),
    improvementValue: numField("improvementValue"),
    landValue: numField("landValue"),
    totalAppraisedValue: numField("totalAppraisedValue"),
    exemptionStatus: mapped["exemptionStatus"] as string | undefined,
  };
}

// ─── Commercial use-code heuristic ────────────────────────────────────────────
// BCAD use codes starting with these prefixes indicate commercial property.
// This list is a reasonable starting point; operators should adjust as needed.
const COMMERCIAL_USE_CODE_PREFIXES = [
  "A",  // Retail
  "B",  // Office
  "C",  // Commercial
  "D",  // Industrial
  "E",  // Hotels / Motels
  "F",  // Multi-family (4+ units)
  "G",  // Special commercial
];

function isCommercialUseCode(code: string | undefined): boolean {
  if (!code) return false;
  return COMMERCIAL_USE_CODE_PREFIXES.some((prefix) =>
    code.toUpperCase().startsWith(prefix)
  );
}

// ─── Main processor ───────────────────────────────────────────────────────────

export async function processBcadImport(
  env: Env,
  job: ImportJobRow
): Promise<void> {
  const r2Key = job.source_file_r2_key;
  if (!r2Key) throw new Error("Job has no source_file_r2_key");

  // Read file from R2
  const object = await env.FILES_BUCKET.get(r2Key);
  if (!object) throw new Error(`R2 object not found: ${r2Key}`);

  const text = await object.text();
  const { rows, errors: parseErrors } = parseCsv(text);

  const now = new Date().toISOString();
  const dataSource = `BCAD import ${job.id}`;
  const fileHash = job.source_file_hash ?? "";
  const jobErrors: string[] = [...parseErrors];
  let processed = 0;
  let failed = 0;

  // Update job: processing + total count
  await env.DB.prepare(
    "UPDATE import_jobs SET status='processing', total_records=?, updated_at=? WHERE id=?"
  )
    .bind(rows.length, now, job.id)
    .run();

  // Process in batches of 50 (D1 batch limit is 100 statements)
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);

    for (const rawRow of chunk) {
      const row = mapBcadRow(rawRow);
      if (!row) {
        failed++;
        jobErrors.push(`Row ${i + 1}: missing Property ID`);
        continue;
      }

      try {
        await upsertBcadRow(env, row, dataSource, fileHash, now);
        processed++;
      } catch (err) {
        failed++;
        jobErrors.push(`Property ${row.propertyId}: ${String(err)}`);
      }
    }

    // Update progress after each chunk
    await env.DB.prepare(
      "UPDATE import_jobs SET processed_records=?, failed_records=?, errors=?, updated_at=? WHERE id=?"
    )
      .bind(
        processed,
        failed,
        JSON.stringify(jobErrors.slice(0, 100)), // cap stored errors
        new Date().toISOString(),
        job.id
      )
      .run();
  }

  // Mark job complete
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

async function upsertBcadRow(
  env: Env,
  row: BcadCsvRow,
  dataSource: string,
  fileHash: string,
  now: string
): Promise<void> {
  const { normalized: addrNorm } = normalizeAddress(row.propertyAddress);
  const legalNorm = normalizeLegalDescription(row.legalDescription);

  // Determine if property has improvements (commercial requires at least one)
  const hasBuildingArea =
    row.buildingAreaSqFt !== undefined && row.buildingAreaSqFt > 0;
  const commercial =
    hasBuildingArea && isCommercialUseCode(row.propertyUseCode) ? 1 : 0;

  // Compute sq m for improvement
  const buildingSqM =
    row.buildingAreaSqFt !== undefined
      ? Math.round(row.buildingAreaSqFt * SQ_FT_TO_SQ_M * 100) / 100
      : null;

  // Aggregate area from the single improvement row this CSV line represents
  // (multi-improvement properties have one CSV row per improvement)
  const aggSqFt = hasBuildingArea ? row.buildingAreaSqFt : null;
  const aggSqM = buildingSqM;

  // Upsert property
  await env.DB.prepare(
    `INSERT INTO properties
       (id, geographic_id, property_address, property_address_normalized,
        city, zip_code, legal_description, legal_description_normalized,
        property_use_code, property_use_description, commercial,
        improvement_value, land_value, total_appraised_value,
        land_area_sq_ft, land_area_acres,
        building_area_sq_ft, building_area_sq_m,
        exemption_status, data_source, source_file_hash, import_date, last_updated)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       geographic_id              = excluded.geographic_id,
       property_address           = excluded.property_address,
       property_address_normalized= excluded.property_address_normalized,
       city                       = excluded.city,
       zip_code                   = excluded.zip_code,
       legal_description          = excluded.legal_description,
       legal_description_normalized=excluded.legal_description_normalized,
       property_use_code          = excluded.property_use_code,
       property_use_description   = excluded.property_use_description,
       commercial                 = excluded.commercial,
       improvement_value          = excluded.improvement_value,
       land_value                 = excluded.land_value,
       total_appraised_value      = excluded.total_appraised_value,
       land_area_sq_ft            = excluded.land_area_sq_ft,
       land_area_acres            = excluded.land_area_acres,
       building_area_sq_ft        = excluded.building_area_sq_ft,
       building_area_sq_m         = excluded.building_area_sq_m,
       exemption_status           = excluded.exemption_status,
       data_source                = excluded.data_source,
       source_file_hash           = excluded.source_file_hash,
       last_updated               = excluded.last_updated`
  )
    .bind(
      row.propertyId,
      row.geographicId ?? null,
      row.propertyAddress ?? null,
      addrNorm || null,
      row.city ?? null,
      row.zipCode ?? null,
      row.legalDescription ?? null,
      legalNorm || null,
      row.propertyUseCode ?? null,
      row.propertyUseDescription ?? null,
      commercial,
      row.improvementValue ?? null,
      row.landValue ?? null,
      row.totalAppraisedValue ?? null,
      row.landAreaSqFt ?? null,
      row.landAreaAcres ?? null,
      aggSqFt ?? null,
      aggSqM ?? null,
      row.exemptionStatus ?? null,
      dataSource,
      fileHash,
      now,
      now
    )
    .run();

  // Upsert owner (replace if same property_id already present)
  await env.DB.prepare(
    `INSERT INTO owners
       (property_id, owner_name, mailing_address, mailing_city,
        mailing_state, mailing_zip, data_source, import_date, last_updated)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(rowid) DO NOTHING`
  );
  // Since owners doesn't have a unique constraint on property_id,
  // we DELETE+INSERT to keep one row per property.
  await env.DB.prepare(
    "DELETE FROM owners WHERE property_id = ?"
  )
    .bind(row.propertyId)
    .run();

  await env.DB.prepare(
    `INSERT INTO owners
       (property_id, owner_name, mailing_address, mailing_city,
        mailing_state, mailing_zip, data_source, import_date, last_updated)
     VALUES (?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      row.propertyId,
      row.ownerName ?? null,
      row.ownerMailingAddress ?? null,
      row.ownerMailingCity ?? null,
      row.ownerMailingState ?? null,
      row.ownerMailingZip ?? null,
      dataSource,
      now,
      now
    )
    .run();

  // Upsert improvement (one per CSV row; BCAD may have multi-row properties)
  // Delete existing improvements for this property first, then re-insert
  // so aggregates stay accurate.
  await env.DB.prepare(
    "DELETE FROM property_improvements WHERE property_id = ?"
  )
    .bind(row.propertyId)
    .run();

  if (hasBuildingArea) {
    await env.DB.prepare(
      `INSERT INTO property_improvements
         (property_id, building_type, building_area_sq_ft, building_area_sq_m,
          improvement_value, data_source, import_date)
       VALUES (?,?,?,?,?,?,?)`
    )
      .bind(
        row.propertyId,
        row.buildingType ?? null,
        row.buildingAreaSqFt ?? null,
        buildingSqM,
        row.improvementValue ?? null,
        dataSource,
        now
      )
      .run();
  }

  // Recompute aggregate building area on the property row
  await env.DB.prepare(
    `UPDATE properties SET
       building_area_sq_ft = (
         SELECT SUM(building_area_sq_ft) FROM property_improvements WHERE property_id = ?
       ),
       building_area_sq_m = (
         SELECT ROUND(SUM(building_area_sq_ft) * 0.092903, 2)
         FROM property_improvements WHERE property_id = ?
       ),
       last_updated = ?
     WHERE id = ?`
  )
    .bind(row.propertyId, row.propertyId, now, row.propertyId)
    .run();

  // A property with no improvement rows is vacant land → commercial=0
  await env.DB.prepare(
    `UPDATE properties SET commercial = CASE
       WHEN (SELECT COUNT(*) FROM property_improvements WHERE property_id = ?) = 0 THEN 0
       ELSE commercial
     END
     WHERE id = ?`
  )
    .bind(row.propertyId, row.propertyId)
    .run();

  // Attempt to match with existing OPR documents
  await linkPropertyToOpr(env, row.propertyId, {
    propertyId: row.propertyId,
    geographicId: row.geographicId ?? null,
    propertyAddressNormalized: addrNorm || null,
    legalDescriptionNormalized: legalNorm || null,
  });
}

async function linkPropertyToOpr(
  env: Env,
  propertyId: string,
  propMatch: MatchInput
): Promise<void> {
  // Fetch OPR documents not yet linked to this property
  const unlinkedOpr = await env.DB.prepare(
    `SELECT od.*
     FROM opr_documents od
     WHERE NOT EXISTS (
       SELECT 1 FROM opr_property_links opl
       WHERE opl.opr_document_id = od.id AND opl.property_id = ?
     )
     ORDER BY od.recording_date DESC
     LIMIT 200`
  )
    .bind(propertyId)
    .all<{
      id: number;
      property_address_normalized: string | null;
      legal_description_normalized: string | null;
    }>();

  const now = new Date().toISOString();

  for (const opr of unlinkedOpr.results ?? []) {
    const oprDoc: OprDocInput = {
      propertyAddressNormalized: opr.property_address_normalized,
      legalDescriptionNormalized: opr.legal_description_normalized,
    };
    const result = matchOprToProperty(oprDoc, propMatch);

    if (result.confidence !== "unmatched") {
      await env.DB.prepare(
        `INSERT INTO opr_property_links (opr_document_id, property_id, match_confidence, created_at)
         VALUES (?,?,?,?)`
      )
        .bind(opr.id, propertyId, result.confidence, now)
        .run();
    }
  }
}
