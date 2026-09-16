/**
 * Manual scraper trigger handler.
 *
 * POST /api/scrapers/run
 *   Body: { county: string, mode?: "daily" | "monthly" }
 *
 * Runs the scraper synchronously and waits for it to finish before
 * responding. This avoids ctx.waitUntil() wall-time limits that cause
 * Browser Rendering scrapers to be killed silently mid-run.
 */

import type { Env, AuthUser } from "../types";
import { requireAdmin } from "../auth";
import { jsonOk, jsonError } from "../router";
import { scrapeHarris } from "../scrapers/harris";
import { scrapePublicSearch, debugScrapePublicSearch } from "../scrapers/publicsearch";
import { scrapeTravis } from "../scrapers/travis";
import {
  lastMonthIsoRange, lastMonthSlashRange,
  lastYesterdayIsoRange, lastYesterdaySlashRange,
} from "../scrapers/pipeline";

const PUBLICSEARCH_COUNTIES = ["bexar", "dallas", "denton"];

export async function handleRunScraper(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  _params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const adminError = requireAdmin(user);
  if (adminError) return adminError;

  let body: { county?: string; mode?: string } = {};
  try { body = await request.json(); } catch { /* empty body */ }

  const county = (body.county ?? "").toLowerCase().trim();
  const mode   = body.mode === "monthly" ? "monthly" : "daily";

  if (!county) return jsonError("county is required", 400);

  // Verify county is active
  const row = await env.DB.prepare(
    "SELECT name FROM county_configs WHERE LOWER(name) = ? AND active = 1"
  ).bind(county).first<{ name: string }>();
  if (!row) return jsonError(`County "${county}" not found or inactive`, 404);

  const isoRange   = mode === "daily" ? lastYesterdayIsoRange()  : lastMonthIsoRange();
  const slashRange = mode === "daily" ? lastYesterdaySlashRange() : lastMonthSlashRange();

  let jobId: string | undefined;

  try {
    if (county === "harris") {
      jobId = await scrapeHarris(env, slashRange);
    } else if (PUBLICSEARCH_COUNTIES.includes(county)) {
      jobId = await scrapePublicSearch(env, [county], isoRange);
    } else if (county === "travis") {
      jobId = await scrapeTravis(env, slashRange);
    } else {
      return jsonError(`No scraper configured for county "${county}"`, 400);
    }
  } catch (err) {
    console.error(`[scraper-api] ${county} failed:`, err);
    return jsonError(`Scraper failed: ${String(err).slice(0, 200)}`, 500);
  }

  return jsonOk({
    status:    jobId ? "queued" : "no_new_records",
    county:    row.name,
    mode,
    jobId:     jobId ?? null,
    dateRange: isoRange,
    message:   jobId
      ? `Scraping ${row.name} (${mode}) — job ${jobId} queued`
      : `No new records found for ${row.name} (${mode})`,
  });
}

/** GET /api/scrapers/debug?county=bexar&from=2026-08-01&to=2026-08-31 */
export async function handleDebugScraper(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const adminError = requireAdmin(user);
  if (adminError) return adminError;

  const url    = new URL(request.url);
  const county = (url.searchParams.get("county") ?? "bexar").toLowerCase();
  const from   = url.searchParams.get("from") ?? lastMonthIsoRange().from;
  const to     = url.searchParams.get("to")   ?? lastMonthIsoRange().to;
  const term   = url.searchParams.get("term") ?? "APPT";

  try {
    const result = await debugScrapePublicSearch(env, county, { from, to }, term);
    return jsonOk(result);
  } catch (e) {
    return jsonError(`Debug scrape failed: ${String(e)}`, 500);
  }
}
