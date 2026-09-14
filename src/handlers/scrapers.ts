/**
 * Manual scraper trigger handler.
 *
 * POST /api/scrapers/run
 *   Body: { county: string, mode?: "daily" | "monthly" }
 *
 * Starts the scraper for the requested county in the background
 * and returns immediately. The scrape runs via ctx.waitUntil().
 */

import type { Env, AuthUser } from "../types";
import { requireAdmin } from "../auth";
import { jsonOk, jsonError } from "../router";
import { scrapeHarris } from "../scrapers/harris";
import { scrapePublicSearch } from "../scrapers/publicsearch";
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

  let task: Promise<void>;

  if (county === "harris") {
    task = scrapeHarris(env, slashRange);
  } else if (PUBLICSEARCH_COUNTIES.includes(county)) {
    task = scrapePublicSearch(env, [county], isoRange);
  } else if (county === "travis") {
    task = scrapeTravis(env, slashRange);
  } else {
    return jsonError(`No scraper configured for county "${county}"`, 400);
  }

  ctx.waitUntil(
    task.catch(err => console.error(`[scraper-api] ${county} failed:`, err))
  );

  return jsonOk({
    status:  "started",
    county:  row.name,
    mode,
    dateRange: mode === "daily" ? isoRange : isoRange,
    message: `Scraping ${row.name} (${mode}) — check Jobs for results`,
  });
}
