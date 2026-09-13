/**
 * County scraper orchestrator — called by the Worker's scheduled handler
 * on cron: "0 8 1 * *"  (1st of each month, 8 AM UTC = 2 AM CT)
 *
 * Reads active counties from county_configs, runs the appropriate scraper,
 * and feeds results into the existing OPR import pipeline.
 *
 * Currently supported:
 *   Harris  — ASP.NET form scraping (pure fetch, no browser)
 *   Dallas  — PublicSearch.us via Browser Rendering
 *   Denton  — PublicSearch.us via Browser Rendering
 *   Travis  — inactive (requires login)
 */

import type { Env } from "../types";
import { scrapeHarris } from "./harris";
import { scrapePublicSearch } from "./publicsearch";

const PUBLICSEARCH_COUNTIES = ["dallas", "denton"];

export async function runScrapers(env: Env): Promise<void> {
  console.log("[scrapers] Starting monthly county scrape");

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
      scrapeHarris(env).catch(err =>
        console.error("[scrapers] Harris failed:", err)
      )
    );
  }

  if (psCounties.length > 0) {
    tasks.push(
      scrapePublicSearch(env, psCounties).catch(err =>
        console.error("[scrapers] PublicSearch failed:", err)
      )
    );
  }

  await Promise.all(tasks);
  console.log("[scrapers] Done");
}
