/**
 * Cloudflare Queues consumer.
 *
 * Handles both IMPORT_QUEUE (bcad_import, opr_import) and EXPORT_QUEUE
 * (csv_export) messages.  Each message contains a jobId; the processor
 * reads the full job from D1 before starting work.
 *
 * Retry safety:
 *  - Jobs are idempotent: processors skip rows already processed
 *    (via UNIQUE constraints and ON CONFLICT DO NOTHING).
 *  - If a batch fails, the queue retries up to max_retries times.
 *  - After max_retries, the message lands in the dead-letter queue.
 */

import type { Env, QueueMessage, ImportJobRow } from "../types";
import { processBcadImport } from "./bcad-processor";
import { processOprImport } from "./opr-processor";
import { processExport } from "./export-processor";

export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    const { jobId, type } = message.body;

    try {
      const job = await env.DB.prepare(
        "SELECT * FROM import_jobs WHERE id = ?"
      )
        .bind(jobId)
        .first<ImportJobRow>();

      if (!job) {
        console.error(`[queue] Job not found: ${jobId}`);
        message.ack(); // Don't retry a missing job
        continue;
      }

      if (job.status === "completed") {
        // Already done (duplicate delivery); ack and skip
        message.ack();
        continue;
      }

      switch (type) {
        case "bcad_import":
          await processBcadImport(env, job);
          break;
        case "opr_import":
          await processOprImport(env, job);
          break;
        case "csv_export":
          await processExport(env, job);
          break;
        default:
          console.error(`[queue] Unknown job type: ${String(type)}`);
          message.ack();
          continue;
      }

      message.ack();
    } catch (err) {
      console.error(`[queue] Job ${jobId} failed: ${String(err)}`);

      // Mark job as failed in D1 so the UI can show the error
      try {
        const errMsg = String(err);
        await env.DB.prepare(
          `UPDATE import_jobs
           SET status='failed',
               errors=JSON_ARRAY(?),
               updated_at=?
           WHERE id=? AND status != 'completed'`
        )
          .bind(errMsg, new Date().toISOString(), jobId)
          .run();
      } catch {
        // Ignore D1 error in error handler
      }

      // Retry by not acking (queue will retry up to max_retries)
      message.retry();
    }
  }
}
