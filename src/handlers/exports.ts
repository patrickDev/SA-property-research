/**
 * CSV export handler.
 *
 * POST /api/exports/commercial-properties
 *  - Accepts the same filter params as GET /api/properties
 *  - Creates a csv_export job and enqueues it
 *  - Returns { jobId }
 *
 * The actual CSV generation happens in the queue consumer
 * (src/queue/export-processor.ts).
 */

import type { Env, AuthUser } from "../types";
import { requireAdmin } from "../auth";
import { jsonOk, jsonError } from "../router";
import { generateUUID } from "../services/dedup";

export async function handleCreateExport(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const adminError = requireAdmin(user);
  if (adminError) return adminError;

  // Accept filters from JSON body or query string
  let filters: Record<string, string> = {};
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      filters = (await request.json()) as Record<string, string>;
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
  } else {
    const url = new URL(request.url);
    for (const [key, value] of url.searchParams.entries()) {
      filters[key] = value;
    }
  }

  const jobId = generateUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO import_jobs
       (id, job_type, status, source_file_name, source_file_r2_key,
        source_file_hash, total_records, processed_records, failed_records,
        errors, created_at, updated_at)
     VALUES (?, 'csv_export', 'pending', ?, NULL, NULL, 0, 0, 0, '[]', ?, ?)`
  )
    .bind(jobId, `export-${jobId}.csv`, now, now)
    .run();

  // Encode filters as the "file" content (the export processor reads them from the job)
  // We store the filters JSON in source_file_name for the export processor to parse.
  await env.DB.prepare(
    "UPDATE import_jobs SET source_file_name = ? WHERE id = ?"
  )
    .bind(JSON.stringify({ filters, requestedBy: user.email }), jobId)
    .run();

  await env.EXPORT_QUEUE.send({
    jobId,
    type: "csv_export",
    batchOffset: 0,
    batchSize: 0,
  });

  return jsonOk({ jobId, status: "pending" }, 202);
}
