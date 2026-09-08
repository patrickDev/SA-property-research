/**
 * Retention cleanup — runs daily via a Cloudflare Workers cron trigger.
 *
 * Deletes:
 *  - Source import files from R2 older than RETENTION_DAYS_SOURCE_FILES days
 *  - Generated export CSVs from R2 older than RETENTION_DAYS_GENERATED_CSV days
 *
 * Each deleted file is recorded in deleted_files_log for audit purposes.
 * Database records imported from those files are NOT deleted.
 */

import type { Env } from "../types";

const DEFAULT_SOURCE_DAYS = 30;
const DEFAULT_CSV_DAYS = 7;

export async function handleRetention(
  _controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const sourceDays =
    parseInt(env.RETENTION_DAYS_SOURCE_FILES ?? "") || DEFAULT_SOURCE_DAYS;
  const csvDays =
    parseInt(env.RETENTION_DAYS_GENERATED_CSV ?? "") || DEFAULT_CSV_DAYS;

  await cleanupFiles(env, "imports/", sourceDays);
  await cleanupFiles(env, "exports/", csvDays);
}

async function cleanupFiles(
  env: Env,
  prefix: string,
  retentionDays: number
): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffIso = cutoff.toISOString();

  // List R2 objects with the given prefix
  let cursor: string | undefined;
  const now = new Date().toISOString();

  do {
    const listed = await env.FILES_BUCKET.list({
      prefix,
      cursor,
      limit: 100,
    });

    for (const obj of listed.objects) {
      const uploadedAt = obj.uploaded.toISOString();
      if (uploadedAt < cutoffIso) {
        // Delete from R2
        await env.FILES_BUCKET.delete(obj.key);

        // Log deletion for audit
        await env.DB.prepare(
          `INSERT INTO deleted_files_log (file_hash, original_name, r2_key, deleted_at)
           VALUES (?, ?, ?, ?)`
        )
          .bind(
            obj.checksums.md5 ?? null,
            obj.key.split("/").pop() ?? obj.key,
            obj.key,
            now
          )
          .run();

        // Update import_job: clear r2 key so download endpoint returns 404
        if (prefix.startsWith("exports/")) {
          await env.DB.prepare(
            "UPDATE import_jobs SET result_r2_key = NULL WHERE result_r2_key = ?"
          )
            .bind(obj.key)
            .run();
        } else {
          await env.DB.prepare(
            "UPDATE import_jobs SET source_file_r2_key = NULL WHERE source_file_r2_key = ?"
          )
            .bind(obj.key)
            .run();
        }
      }
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor !== undefined);
}
