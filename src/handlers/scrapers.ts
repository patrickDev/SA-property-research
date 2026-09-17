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
import { enrichUnmatchedDocuments } from "../scrapers/bcad-enricher";
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

  // After Bexar OPR scrape, automatically enrich unmatched docs with BCAD data
  let enrichResult: { enriched: number; failed: number; skipped: number } | null = null;
  if (jobId && county === "bexar") {
    console.log("[scraper-api] Bexar OPR done — running BCAD enrichment");
    enrichResult = await enrichUnmatchedDocuments(env).catch((err: unknown) => {
      console.error("[scraper-api] enrichment failed:", err);
      return null;
    });
  }

  return jsonOk({
    status:       jobId ? "queued" : "no_new_records",
    county:       row.name,
    mode,
    jobId:        jobId ?? null,
    dateRange:    isoRange,
    enrichment:   enrichResult,
    message:      jobId
      ? `Scraped ${row.name} (${mode}) — job ${jobId} queued${enrichResult ? `, enriched ${enrichResult.enriched} record(s)` : ""}`
      : `No new records found for ${row.name} (${mode})`,
  });
}

/** GET /api/scrapers/enrich-debug — inspect TrueAutomation search page HTML */
export async function handleEnrichDebug(
  request: Request,
  _env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const adminError = requireAdmin(user);
  if (adminError) return adminError;

  const url  = new URL(request.url);
  const name = url.searchParams.get("name") ?? "WARLOCK KATRINA";

  const BASE = "https://propaccess.trueautomation.com/clientdb";
  const CID  = "110";

  try {
    // Step 1: GET search page directly (not root redirect)
    const getResp = await fetch(`${BASE}/propertysearch.aspx?cid=${CID}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    const getHtml = await getResp.text();
    // Parse Set-Cookie headers into Cookie request header (name=value pairs only)
    const rawCookies: string[] = (getResp.headers as any).getSetCookie?.() ?? [];
    const cookies = rawCookies.length
      ? rawCookies.map((h: string) => h.split(";")[0]!.trim()).join("; ")
      : (getResp.headers.get("set-cookie") ?? "").split(",").map((h: string) => h.split(";")[0]!.trim()).join("; ");

    // Extract hidden fields for display (truncated)
    const hiddenFields: Record<string, string> = {};
    for (const m of getHtml.matchAll(/name="(__[^"]+)"\s+[^>]*value="([^"]*)"/gi)) {
      hiddenFields[m[1]!] = m[2]!.slice(0, 40);
    }

    // Extract all input names to find the owner name field
    const inputNames = [...getHtml.matchAll(/name="([^"]*Owner[^"]*)"/gi)].map(m => m[1]);
    const btnNames   = [...getHtml.matchAll(/name="([^"]*btn[^"]*)"/gi)].map(m => m[1]);
    const allInputs  = [...getHtml.matchAll(/name="([^"]+)"/gi)].map(m => m[1]).slice(0, 40);

    // Step 2: POST with owner name — use FULL hidden field values (not truncated)
    const extractFull = (fieldName: string): string => {
      const m = getHtml.match(new RegExp(`name="${fieldName}"[^>]*value="([^"]*)"`, "i"))
             ?? getHtml.match(new RegExp(`value="([^"]*)"[^>]*name="${fieldName}"`, "i"));
      return m ? m[1]! : "";
    };
    const viewState = extractFull("__VIEWSTATE");
    const eventVal  = extractFull("__EVENTVALIDATION");
    const ownerField = inputNames[0] ?? "ctl00$cphBody$txtOwnerName";
    const btnField   = btnNames.find(b => /search/i.test(b ?? "")) ?? "ctl00$cphBody$btnSearch";

    const body = new URLSearchParams({
      "__EVENTTARGET":                      "",
      "__EVENTARGUMENT":                    "",
      "__VIEWSTATE":                        viewState,
      "__EVENTVALIDATION":                  eventVal,
      "propertySearchOptions:searchText":   name,
      "propertySearchOptions:search":       "Search",
      "propertySearchOptions:taxyear":      String(new Date().getFullYear()),
      "propertySearchOptions:propertyType": "R",
    });

    const postResp = await fetch(`${BASE}/propertysearch.aspx?cid=${CID}`, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookies,
        "Referer": `${BASE}/propertysearch.aspx?cid=${CID}`,
      },
      body: body.toString(),
    });
    const postHtml = await postResp.text();

    // Extract prop_id links
    const propLinks = [...postHtml.matchAll(/prop_id=(\d+)/gi)].map(m => m[1]);

    // Fetch first property detail page to inspect HTML structure
    let detailHtml = "";
    const firstPropId = propLinks[0];
    if (firstPropId) {
      const year = new Date().getFullYear();
      const detailResp = await fetch(
        `${BASE}/Property.aspx?prop_id=${firstPropId}&cid=${CID}&year=${year}`,
        { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" } }
      );
      detailHtml = await detailResp.text();
    }

    return jsonOk({
      searchName: name,
      getStatus:  getResp.status,
      postStatus: postResp.status,
      hiddenFields,
      ownerInputsFound: inputNames,
      btnInputsFound:   btnNames,
      allInputNames:    allInputs,
      propIdsFound: propLinks,
      cookies,
      viewStateLengths: { viewState: viewState.length, eventVal: eventVal.length },
      postHtmlSnippet: postHtml.slice(0, 1000),
      detailHtmlLen: detailHtml.length,
      detailTop: detailHtml.slice(9000, 14000),
    });
  } catch (e) {
    return jsonError(`Debug failed: ${String(e)}`, 500);
  }
}

/** POST /api/scrapers/enrich — run BCAD enrichment on unmatched Bexar OPR docs */
export async function handleEnrichScraper(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const adminError = requireAdmin(user);
  if (adminError) return adminError;

  try {
    const result = await enrichUnmatchedDocuments(env);
    return jsonOk({
      status: "completed",
      ...result,
      message: `Enriched ${result.enriched} document(s) with BCAD property data`,
    });
  } catch (err) {
    console.error("[enrich-api] failed:", err);
    return jsonError(`Enrichment failed: ${String(err).slice(0, 200)}`, 500);
  }
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
