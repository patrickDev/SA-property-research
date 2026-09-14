/**
 * Shared scraper pipeline.
 *
 * Takes a CSV string produced by a county scraper and feeds it into
 * the existing import pipeline: R2 → import_jobs → IMPORT_QUEUE.
 * The queue consumer then runs the OPR processor exactly as if the
 * file had been manually uploaded via the dashboard.
 */

import type { Env } from "../types";
import { sha256Hex, generateUUID } from "../services/dedup";

export interface ScraperResult {
  county: string;
  jobType: "opr_import" | "bcad_import";
  csvContent: string;
  label: string; // human-readable description for job name
}

export async function submitScraperResult(
  env: Env,
  result: ScraperResult
): Promise<string> {
  const { county, jobType, csvContent, label } = result;

  const bytes    = new TextEncoder().encode(csvContent);
  const fileHash = await sha256Hex(bytes);
  const filename = `${county.toLowerCase()}-scrape-${Date.now()}.csv`;
  const r2Key    = `imports/${jobType}/${fileHash}/${filename}`;

  // Skip if this exact content was already imported
  const existing = await env.DB.prepare(
    `SELECT id FROM import_jobs WHERE job_type = ? AND source_file_hash = ? AND status = 'completed' LIMIT 1`
  ).bind(jobType, fileHash).first<{ id: string }>();
  if (existing) {
    console.log(`[scraper] ${county} — duplicate content, skipping (job: ${existing.id})`);
    return existing.id;
  }

  // Store in R2
  await env.FILES_BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: "text/csv" },
    customMetadata: { originalName: filename, uploadedBy: "scraper", jobType, label },
  });

  // Create import job
  const jobId = generateUUID();
  const now   = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO import_jobs
       (id, county, job_type, status, source_file_name, source_file_r2_key,
        source_file_hash, total_records, processed_records, failed_records,
        errors, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, 0, 0, 0, '[]', ?, ?)`
  ).bind(jobId, county, jobType, filename, r2Key, fileHash, now, now).run();

  // Enqueue processing
  await env.IMPORT_QUEUE.send({ jobId, type: jobType, batchOffset: 0, batchSize: 500 });

  console.log(`[scraper] ${county} — queued job ${jobId} (${bytes.length} bytes)`);
  return jobId;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

const OPR_HEADERS = [
  "Document Number", "Recording Date", "Document Type",
  "Grantor", "Grantee", "Legal Description", "Property Address", "Loan Amount",
];

export function buildOprCsv(rows: Record<string, string>[]): string {
  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const lines = [OPR_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(OPR_HEADERS.map(h => esc(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns { from: "MM/DD/YYYY", to: "MM/DD/YYYY" } for the prior calendar month */
export function lastMonthSlashRange(): { from: string; to: string } {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt   = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  return { from: fmt(start), to: fmt(end) };
}

/** Returns { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } for the prior calendar month */
export function lastMonthIsoRange(): { from: string; to: string } {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    from: start.toISOString().slice(0, 10),
    to:   end.toISOString().slice(0, 10),
  };
}

/** Returns { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } for yesterday (UTC) */
export function lastYesterdayIsoRange(): { from: string; to: string } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  const s = d.toISOString().slice(0, 10);
  return { from: s, to: s };
}

/** Returns { from: "MM/DD/YYYY", to: "MM/DD/YYYY" } for yesterday (UTC) */
export function lastYesterdaySlashRange(): { from: string; to: string } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  const fmt = (dt: Date) =>
    `${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}/${dt.getUTCFullYear()}`;
  return { from: fmt(d), to: fmt(d) };
}
