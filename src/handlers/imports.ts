/**
 * Import handlers: BCAD and OPR file upload endpoints.
 *
 * Flow:
 *  1. Receive multipart/form-data with a "file" field
 *  2. Compute SHA-256 hash of the file bytes
 *  3. Reject if a completed job already exists for this hash (dedup)
 *  4. Store file in R2
 *  5. Create an import_jobs record
 *  6. Enqueue a queue message with the jobId
 *  7. Return { jobId }
 *
 * Note: only CSV files are accepted.  Excel files (.xlsx/.xls) must be
 * exported to CSV by the user before uploading.
 */

import type { Env, AuthUser } from "../types";
import { jsonOk, jsonError } from "../router";
import { requireAdmin } from "../auth";
import { sha256Hex, generateUUID, findDuplicateJob } from "../services/dedup";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

async function handleImport(
  request: Request,
  env: Env,
  user: AuthUser,
  jobType: "bcad_import" | "opr_import"
): Promise<Response> {
  // Only admins can upload files
  const adminError = requireAdmin(user);
  if (adminError) return adminError;

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Request must be multipart/form-data", 400);
  }

  const fileEntry = formData.get("file");
  // Workers FormData returns File objects for file fields; string for text fields.
  if (!fileEntry || typeof fileEntry === "string") {
    return jsonError('Form field "file" is required and must be a file', 400);
  }
  // Cast to File-like interface (Cloudflare Workers Blob subtype)
  const file = fileEntry as File;

  // Validate content type
  const contentType = file.type.toLowerCase();
  if (!contentType.includes("csv") && !contentType.includes("text")) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv") {
      return jsonError(
        "Only CSV files are supported. Please export your Excel file as CSV before uploading.",
        415
      );
    }
  }

  // Check size
  if (file.size > MAX_FILE_BYTES) {
    return jsonError(
      `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
      413
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = await sha256Hex(bytes);

  // Dedup: reject if this exact file was already imported successfully
  const existingJobId = await findDuplicateJob(env, jobType, fileHash);
  if (existingJobId) {
    return jsonError(
      `This file has already been imported (job: ${existingJobId}). ` +
        `If the data has changed, export a new file with a different name/contents.`,
      409
    );
  }

  // Store file in R2
  const r2Key = `imports/${jobType}/${fileHash}/${file.name}`;
  await env.FILES_BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: "text/csv" },
    customMetadata: {
      originalName: file.name,
      uploadedBy: user.email,
      jobType,
    },
  });

  // Create job record
  const jobId = generateUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO import_jobs
       (id, job_type, status, source_file_name, source_file_r2_key,
        source_file_hash, total_records, processed_records, failed_records,
        errors, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?, ?, 0, 0, 0, '[]', ?, ?)`
  )
    .bind(jobId, jobType, file.name, r2Key, fileHash, now, now)
    .run();

  // Enqueue processing
  await env.IMPORT_QUEUE.send({
    jobId,
    type: jobType,
    batchOffset: 0,
    batchSize: 500,
  });

  return jsonOk({ jobId, status: "pending", message: "Import queued" }, 202);
}

/** POST /api/imports/bcad */
export async function handleBcadImport(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  return handleImport(request, env, user, "bcad_import");
}

/** POST /api/imports/opr */
export async function handleOprImport(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  return handleImport(request, env, user, "opr_import");
}
