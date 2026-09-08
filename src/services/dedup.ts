/**
 * Deduplication helpers.
 *
 * Strategy:
 *  - BCAD imports: deduplicate per property_id within the same source_file_hash.
 *    A second upload of the same file will skip already-imported rows.
 *    A new file can update existing property records (upsert).
 *  - OPR imports: deduplicate by document_number (UNIQUE constraint in D1).
 *    INSERT OR IGNORE is used so re-importing the same document is a no-op.
 *  - Job-level dedup: if a job with the same (job_type, source_file_hash)
 *    is already completed, reject the upload with a conflict response.
 *
 * Unit tests: src/__tests__/dedup.test.ts
 */

import type { Env } from "../types";

/**
 * Check whether a completed import job already exists for a given file hash.
 *
 * @returns The existing job ID if a duplicate is found, null otherwise.
 */
export async function findDuplicateJob(
  env: Env,
  jobType: "bcad_import" | "opr_import",
  fileHash: string
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM import_jobs
     WHERE job_type = ? AND source_file_hash = ? AND status = 'completed'
     LIMIT 1`
  )
    .bind(jobType, fileHash)
    .first<{ id: string }>();

  return row?.id ?? null;
}

/**
 * Compute a SHA-256 hex digest of a Uint8Array (e.g., file bytes).
 * Uses the Web Crypto API available in all Workers environments.
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a cryptographically random UUID v4.
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}
