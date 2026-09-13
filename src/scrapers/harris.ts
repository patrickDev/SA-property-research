/**
 * Harris County Clerk – Real Property scraper
 * https://www.cclerk.hctx.net/Applications/WebSearch/RP.aspx
 *
 * Uses plain fetch + ASP.NET VIEWSTATE handling — no browser required.
 *
 * Collects all APP (Appointment of Substitute Trustee) documents
 * recorded in the prior calendar month, then submits via pipeline.
 */

import type { Env } from "../types";
import { buildOprCsv, lastMonthSlashRange, submitScraperResult } from "./pipeline";

const BASE_URL  = "https://www.cclerk.hctx.net/Applications/WebSearch/RP.aspx";
const DOC_TYPE  = "APP";
const COUNTY    = "Harris";

// ASP.NET field names (discovered from page HTML)
const FIELD_FROM   = "ctl00$ContentPlaceHolder1$txtFrom";
const FIELD_TO     = "ctl00$ContentPlaceHolder1$txtTo";
const FIELD_ITYPE  = "ctl00$ContentPlaceHolder1$txtInstrumentType";
const FIELD_SEARCH = "ctl00$ContentPlaceHolder1$btnSearch";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract a hidden ASP.NET field value from HTML */
function extractHidden(html: string, name: string): string {
  const re = new RegExp(`<input[^>]+name="${name}"[^>]+value="([^"]*)"`, "i");
  return html.match(re)?.[1] ?? "";
}

/** Extract all ASP.NET hidden state fields at once */
function extractAspNetState(html: string) {
  return {
    __VIEWSTATE:          extractHidden(html, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: extractHidden(html, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION:    extractHidden(html, "__EVENTVALIDATION"),
    __EVENTTARGET:        "",
    __EVENTARGUMENT:      "",
  };
}

/** Build a URLSearchParams for an ASP.NET POST */
function buildForm(
  state: ReturnType<typeof extractAspNetState>,
  extra: Record<string, string>
): URLSearchParams {
  const p = new URLSearchParams({ ...state, ...extra });
  return p;
}

/** Parse result table rows from Harris County HTML */
function parseRows(html: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  // Find the GridView table (Harris uses id="ctl00_ContentPlaceHolder1_GridView1")
  const tableMatch = html.match(
    /<table[^>]*id="ctl00_ContentPlaceHolder1_GridView1"[^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch?.[1]) return rows;

  const tableHtml = tableMatch[1];
  const rowMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  // Skip first row (header)
  for (let i = 1; i < rowMatches.length; i++) {
    const rowContent = rowMatches[i]?.[1];
    if (!rowContent) continue;
    const cells = [...rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
      (m[1] ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim()
    );
    if (cells.length >= 3 && cells[0]) {
      rows.push({
        "Document Number":   cells[0] ?? "",
        "Recording Date":    cells[1] ?? "",
        "Document Type":     cells[2] ?? "",
        "Grantor":           cells[3] ?? "",
        "Grantee":           cells[4] ?? "",
        "Legal Description": cells[5] ?? "",
        "Property Address":  cells[6] ?? "",
        "Loan Amount":       cells[7] ?? "",
      });
    }
  }
  return rows;
}

/** Check if there is a "Next" page link and return the __doPostBack argument */
function nextPageTarget(html: string): string | null {
  // Harris uses pagination links like: __doPostBack('ctl00$ContentPlaceHolder1$GridView1','Page$2')
  const re = /__doPostBack\('(ctl00\$ContentPlaceHolder1\$GridView1)','(Page\$\d+)'\)/g;
  let last: string | null = null;
  let match;
  // The "Next" link is the last pager link in the HTML
  while ((match = re.exec(html)) !== null) {
    last = match[2] ?? null; // e.g. "Page$2"
  }
  // We need to track which page we're on and find the next one
  return last;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function scrapeHarris(env: Env): Promise<void> {
  console.log("[harris] Starting scrape");
  const { from, to } = lastMonthSlashRange();
  console.log(`[harris] Date range: ${from} → ${to}, type: ${DOC_TYPE}`);

  // Step 1 — GET the form to capture VIEWSTATE
  const initResp = await fetch(BASE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; TXPropertySearch/1.0)" },
  });
  if (!initResp.ok) throw new Error(`[harris] Initial GET failed: ${initResp.status}`);
  const initHtml = await initResp.text();
  const cookies  = initResp.headers.get("set-cookie") ?? "" as string;

  let state = extractAspNetState(initHtml);

  // Step 2 — POST search form
  const searchForm = buildForm(state, {
    [FIELD_FROM]:   from,
    [FIELD_TO]:     to,
    [FIELD_ITYPE]:  DOC_TYPE,
    [FIELD_SEARCH]: "Search",
  });

  const searchResp = await fetch(BASE_URL, {
    method:  "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":   "Mozilla/5.0 (compatible; TXPropertySearch/1.0)",
      "Cookie":       cookies,
      "Referer":      BASE_URL,
    },
    body: searchForm.toString(),
  });
  if (!searchResp.ok) throw new Error(`[harris] Search POST failed: ${searchResp.status}`);

  const allRows: Record<string, string>[] = [];
  let html = await searchResp.text();
  let page = 1;

  while (true) {
    const rows = parseRows(html);
    console.log(`[harris] Page ${page}: ${rows.length} rows`);
    allRows.push(...rows);

    // Find next page target — must track current page ourselves
    const nextTarget = `Page$${page + 1}`;
    // Check if this page link exists in the HTML
    if (!html.includes(`'Page$${page + 1}'`)) break;

    state = extractAspNetState(html);
    const pageForm = buildForm(state, {
      __EVENTTARGET:   "ctl00$ContentPlaceHolder1$GridView1",
      __EVENTARGUMENT: nextTarget,
      [FIELD_FROM]:    from,
      [FIELD_TO]:      to,
      [FIELD_ITYPE]:   DOC_TYPE,
    });

    const pageResp = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":   "Mozilla/5.0 (compatible; TXPropertySearch/1.0)",
        "Cookie":       cookies,
        "Referer":      BASE_URL,
      },
      body: pageForm.toString(),
    });
    if (!pageResp.ok) break;
    html = await pageResp.text();
    page++;
  }

  console.log(`[harris] Total rows collected: ${allRows.length}`);
  if (!allRows.length) {
    console.log("[harris] No records — nothing to import");
    return;
  }

  const csv = buildOprCsv(allRows);
  await submitScraperResult(env, {
    county:     COUNTY,
    jobType:    "opr_import",
    csvContent: csv,
    label:      `Harris County APP docs ${from}–${to}`,
  });
}
