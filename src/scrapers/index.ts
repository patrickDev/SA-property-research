/**
 * County scraper orchestrator — called by the Worker's scheduled handler.
 *
 * Modes:
 *   "daily"   — cron "0 9 * * *"  (9 AM UTC = 3 AM CT, every day)
 *               Scrapes yesterday's APPT/SUB filings, then enriches
 *               unmatched Bexar documents with BCAD data via TrueAutomation.
 *
 *   "monthly" — cron "0 8 1 * *"  (1st of month, 8 AM UTC)
 *               Full prior-month catch-up run across all active counties.
 *
 * Currently supported scrapers:
 *   Harris  — ASP.NET form scraping (pure fetch, no browser)
 *   Bexar   — PublicSearch.us via Browser Rendering
 *   Dallas  — PublicSearch.us via Browser Rendering
 *   Denton  — PublicSearch.us via Browser Rendering
 *   Travis  — tccsearch.org via Browser Rendering (requires credentials)
 */

import type { Env } from "../types";
import { scrapeHarris } from "./harris";
import { scrapePublicSearch } from "./publicsearch";
import { scrapeTravis } from "./travis";
import { enrichUnmatchedDocuments } from "./bcad-enricher";
import {
  lastMonthIsoRange, lastMonthSlashRange,
  lastYesterdayIsoRange, lastYesterdaySlashRange,
} from "./pipeline";

const PUBLICSEARCH_COUNTIES = ["bexar", "dallas", "denton"];

export async function runScrapers(
  env: Env,
  mode: "daily" | "monthly" = "monthly"
): Promise<void> {
  console.log(`[scrapers] Starting ${mode} county scrape`);

  const isoRange   = mode === "daily" ? lastYesterdayIsoRange()  : lastMonthIsoRange();
  const slashRange = mode === "daily" ? lastYesterdaySlashRange() : lastMonthSlashRange();

  // Load active county configs
  const result = await env.DB.prepare(
    "SELECT LOWER(name) AS key FROM county_configs WHERE active = 1"
  ).all<{ key: string }>();

  const activeKeys = new Set((result.results ?? []).map(r => r.key));
  console.log("[scrapers] Active counties:", [...activeKeys].join(", "));

  const psCounties = PUBLICSEARCH_COUNTIES.filter(k => activeKeys.has(k));

  // Run each scraper; failures are caught per-county so others still run
  const tasks: Promise<void>[] = [];

  if (activeKeys.has("harris")) {
    tasks.push(
      scrapeHarris(env, slashRange).catch(err =>
        console.error("[scrapers] Harris failed:", err)
      )
    );
  }

  if (psCounties.length > 0) {
    tasks.push(
      scrapePublicSearch(env, psCounties, isoRange).catch(err =>
        console.error("[scrapers] PublicSearch failed:", err)
      )
    );
  }

  if (activeKeys.has("travis")) {
    tasks.push(
      scrapeTravis(env, slashRange).catch(err =>
        console.error("[scrapers] Travis failed:", err)
      )
    );
  }

  await Promise.all(tasks);
  console.log("[scrapers] OPR scraping done");

  // Daily mode: enrich new Bexar documents with BCAD property data
  if (mode === "daily") {
    await enrichUnmatchedDocuments(env).catch(err =>
      console.error("[scrapers] BCAD enrichment failed:", err)
    );
  }

  console.log("[scrapers] Done");
}
