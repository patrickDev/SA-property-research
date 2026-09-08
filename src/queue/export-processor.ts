/**
 * CSV export queue processor.
 *
 * Reads filter criteria from the job record, queries D1 for matching
 * commercial properties (with owner PII, OPR data, notes, call status),
 * generates a CSV, uploads it to R2, and updates the job with a download URL.
 */

import type { Env, ImportJobRow } from "../types";
import { toCsvString, EXPORT_HEADERS, SQ_FT_TO_SQ_M } from "../services/csv-exporter";

interface ExportJobMeta {
  filters: Record<string, string>;
  requestedBy: string;
}

export async function processExport(
  env: Env,
  job: ImportJobRow
): Promise<void> {
  // Parse filters stored in source_file_name
  let meta: ExportJobMeta = { filters: {}, requestedBy: "unknown" };
  try {
    meta = JSON.parse(job.source_file_name ?? "{}") as ExportJobMeta;
  } catch {
    // Ignore parse errors — use empty filters
  }

  const filters = meta.filters;
  const now = new Date().toISOString();

  await env.DB.prepare(
    "UPDATE import_jobs SET status='processing', updated_at=? WHERE id=?"
  )
    .bind(now, job.id)
    .run();

  // ── Build query ───────────────────────────────────────────────────────────

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (filters["commercial"] === "true" || filters["commercial"] === "1") {
    conditions.push("p.commercial = 1");
  }
  if (filters["city"]) {
    conditions.push("UPPER(p.city) = UPPER(?)");
    bindings.push(filters["city"]);
  }
  if (filters["propertyUse"]) {
    conditions.push("(UPPER(p.property_use_code) = UPPER(?) OR UPPER(p.property_use_description) LIKE UPPER(?))");
    bindings.push(filters["propertyUse"], `%${filters["propertyUse"]}%`);
  }
  const minSqFt = filters["minBuildingSqFt"]
    ? parseFloat(filters["minBuildingSqFt"])
    : filters["minBuildingSqM"]
    ? parseFloat(filters["minBuildingSqM"]) / SQ_FT_TO_SQ_M
    : null;
  const maxSqFt = filters["maxBuildingSqFt"]
    ? parseFloat(filters["maxBuildingSqFt"])
    : filters["maxBuildingSqM"]
    ? parseFloat(filters["maxBuildingSqM"]) / SQ_FT_TO_SQ_M
    : null;
  if (minSqFt !== null) { conditions.push("p.building_area_sq_ft >= ?"); bindings.push(minSqFt); }
  if (maxSqFt !== null) { conditions.push("p.building_area_sq_ft <= ?"); bindings.push(maxSqFt); }
  if (filters["minLandAcres"]) { conditions.push("p.land_area_acres >= ?"); bindings.push(parseFloat(filters["minLandAcres"])); }
  if (filters["maxLandAcres"]) { conditions.push("p.land_area_acres <= ?"); bindings.push(parseFloat(filters["maxLandAcres"])); }
  if (filters["minMarketValue"]) { conditions.push("p.total_appraised_value >= ?"); bindings.push(parseFloat(filters["minMarketValue"])); }
  if (filters["maxMarketValue"]) { conditions.push("p.total_appraised_value <= ?"); bindings.push(parseFloat(filters["maxMarketValue"])); }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Fetch properties (paginate in case of large result sets)
  const PAGE = 500;
  let offset = 0;
  const allRows: (string | number | null)[][] = [];

  while (true) {
    const dataResult = await env.DB.prepare(
      `SELECT p.*,
              o.owner_name, o.mailing_address, o.mailing_city, o.mailing_state, o.mailing_zip,
              (SELECT pi2.building_type FROM property_improvements pi2 WHERE pi2.property_id = p.id LIMIT 1) AS bldg_type,
              (SELECT cs.status FROM call_status cs WHERE cs.property_id = p.id ORDER BY cs.changed_at DESC LIMIT 1) AS latest_call_status,
              (SELECT GROUP_CONCAT(pn.note, ' | ') FROM property_notes pn WHERE pn.property_id = p.id ORDER BY pn.created_at DESC LIMIT 3) AS notes_concat,
              opr.document_number AS opr_doc_num,
              opr.document_type AS opr_doc_type,
              opr.recording_date AS opr_recording_date,
              opl.match_confidence,
              opr.grantor AS opr_grantor,
              opr.grantee AS opr_grantee
       FROM properties p
       LEFT JOIN owners o ON o.property_id = p.id
       LEFT JOIN (
         SELECT opl2.property_id, MAX(opr2.recording_date) AS latest_date
         FROM opr_property_links opl2
         JOIN opr_documents opr2 ON opr2.id = opl2.opr_document_id
         GROUP BY opl2.property_id
       ) latest_opr ON latest_opr.property_id = p.id
       LEFT JOIN opr_property_links opl ON opl.property_id = p.id
         AND opl.opr_document_id = (
           SELECT opl3.opr_document_id
           FROM opr_property_links opl3
           JOIN opr_documents opr3 ON opr3.id = opl3.opr_document_id
           WHERE opl3.property_id = p.id
           ORDER BY opr3.recording_date DESC LIMIT 1
         )
       LEFT JOIN opr_documents opr ON opr.id = opl.opr_document_id
       ${whereClause}
       ORDER BY p.id
       LIMIT ? OFFSET ?`
    )
      .bind(...bindings, PAGE, offset)
      .all<Record<string, string | number | null>>();

    const pageRows = dataResult.results ?? [];
    if (pageRows.length === 0) break;

    for (const r of pageRows) {
      allRows.push([
        r["owner_name"] ?? null,
        r["mailing_address"] ?? null,
        r["property_address"] ?? null,
        r["city"] ?? null,
        r["zip_code"] ?? null,
        r["id"] ?? null,
        r["geographic_id"] ?? null,
        r["legal_description"] ?? null,
        r["property_use_code"] ?? null,
        r["property_use_description"] ?? null,
        r["bldg_type"] ?? null,
        r["building_area_sq_ft"] ?? null,
        r["building_area_sq_m"] ?? null,
        r["land_area_sq_ft"] ?? null,
        r["land_area_acres"] ?? null,
        r["improvement_value"] ?? null,
        r["land_value"] ?? null,
        r["total_appraised_value"] ?? null,
        r["opr_doc_num"] ?? null,
        r["opr_doc_type"] ?? null,
        r["opr_recording_date"] ?? null,
        r["match_confidence"] ?? null,
        r["opr_grantor"] ?? null,
        r["opr_grantee"] ?? null,
        r["latest_call_status"] ?? null,
        r["notes_concat"] ?? null,
        r["data_source"] ?? null,
        r["last_updated"] ?? null,
      ]);
    }

    offset += PAGE;
    if (pageRows.length < PAGE) break;
  }

  // Generate CSV
  const csv = toCsvString(Array.from(EXPORT_HEADERS), allRows);
  const csvBytes = new TextEncoder().encode(csv);

  // Upload to R2
  const r2Key = `exports/${job.id}.csv`;
  await env.FILES_BUCKET.put(r2Key, csvBytes, {
    httpMetadata: { contentType: "text/csv" },
    customMetadata: { jobId: job.id, exportedAt: now },
  });

  const downloadUrl = `/api/jobs/${job.id}/download`;

  await env.DB.prepare(
    `UPDATE import_jobs
     SET status='completed', total_records=?, processed_records=?,
         result_r2_key=?, result_download_url=?, updated_at=?
     WHERE id=?`
  )
    .bind(allRows.length, allRows.length, r2Key, downloadUrl, new Date().toISOString(), job.id)
    .run();
}
