import type { Env, AuthUser, ImportJobRow, JobResponse } from "../types";
import { jsonOk, jsonError } from "../router";

function formatJob(row: ImportJobRow): JobResponse {
  return {
    jobId: row.id,
    status: row.status,
    jobType: row.job_type,
    totalRecords: row.total_records,
    processedRecords: row.processed_records,
    failedRecords: row.failed_records,
    errors: row.errors ? (JSON.parse(row.errors) as string[]) : [],
    downloadUrl: row.result_download_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** GET /api/jobs/:jobId */
export async function handleGetJob(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  params: Record<string, string>,
  _user: AuthUser
): Promise<Response> {
  const { jobId } = params;
  if (!jobId) return jsonError("Missing jobId", 400);

  const row = await env.DB.prepare(
    "SELECT * FROM import_jobs WHERE id = ?"
  )
    .bind(jobId)
    .first<ImportJobRow>();

  if (!row) return jsonError("Job not found", 404);

  return jsonOk(formatJob(row));
}

/** GET /api/jobs/:jobId/download — streams the generated CSV from R2 */
export async function handleDownloadJob(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  params: Record<string, string>,
  _user: AuthUser
): Promise<Response> {
  const { jobId } = params;
  if (!jobId) return jsonError("Missing jobId", 400);

  const row = await env.DB.prepare(
    "SELECT result_r2_key, status FROM import_jobs WHERE id = ?"
  )
    .bind(jobId)
    .first<{ result_r2_key: string | null; status: string }>();

  if (!row) return jsonError("Job not found", 404);
  if (row.status !== "completed") {
    return jsonError("Export not yet ready", 202);
  }
  if (!row.result_r2_key) return jsonError("No file available", 404);

  const object = await env.FILES_BUCKET.get(row.result_r2_key);
  if (!object) return jsonError("File not found in storage", 404);

  const filename = `bexar-export-${jobId}.csv`;
  return new Response(object.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** GET /api/jobs — list recent jobs (optional ?type=bcad_import|opr_import|csv_export) */
export async function handleListJobs(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  _user: AuthUser
): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  let query = "SELECT * FROM import_jobs";
  const bindings: string[] = [];
  if (type) {
    query += " WHERE job_type = ?";
    bindings.push(type);
  }
  query += " ORDER BY created_at DESC LIMIT 50";

  const stmt = env.DB.prepare(query);
  const result = bindings.length
    ? await stmt.bind(...bindings).all<ImportJobRow>()
    : await stmt.all<ImportJobRow>();

  return jsonOk({ jobs: (result.results ?? []).map(formatJob) });
}
