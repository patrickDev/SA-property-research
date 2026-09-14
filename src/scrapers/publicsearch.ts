/**
 * PublicSearch.us Browser Rendering scraper
 * Covers: Bexar  (bexar.tx.publicsearch.us)   — APPT + SUB doc types only
 *         Dallas (dallas.tx.publicsearch.us)   — all RP records
 *         Denton (denton.tx.publicsearch.us)   — all RP records
 *
 * Uses Cloudflare Browser Rendering (@cloudflare/puppeteer) because these are
 * React SPAs that require JavaScript execution to render search results.
 *
 * Collects records from the prior calendar month.
 * Optional docTypes field filters by instrument type (comma-separated codes).
 */

import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";
import type { Env } from "../types";
import { buildOprCsv, lastMonthIsoRange, submitScraperResult } from "./pipeline";

const COUNTIES: Record<string, { url: string; name: string; docTypes?: string }> = {
  bexar:  { url: "https://bexar.tx.publicsearch.us",  name: "Bexar",  docTypes: "APPT,SUB" },
  dallas: { url: "https://dallas.tx.publicsearch.us", name: "Dallas", docTypes: "APPT,SUB" },
  denton: { url: "https://denton.tx.publicsearch.us", name: "Denton", docTypes: "APPT,SUB" },
};

const PAGE_SIZE = 100;

// ── Row extraction ────────────────────────────────────────────────────────────

async function extractRows(page: Page): Promise<Record<string, string>[]> {
  await page.waitForSelector(
    "table tbody tr, [data-testid='instrument-row'], [class*='noResults']",
    { timeout: 20_000 }
  ).catch(() => {});

  // page.evaluate runs inside the remote browser — suppress TS DOM errors
  // by passing the function as a typed string-form callback
  const fn = new Function(`
    const rows = [];
    const trs = document.querySelectorAll("table tbody tr");
    if (trs.length > 0) {
      trs.forEach(tr => {
        const cells = [...tr.querySelectorAll("td")].map(td => (td.innerText || "").trim());
        if (cells[0]) rows.push({
          "Document Number": cells[0]||"", "Recording Date": cells[1]||"",
          "Document Type":   cells[2]||"", "Grantor":        cells[3]||"",
          "Grantee":         cells[4]||"", "Legal Description": cells[5]||"",
          "Property Address": cells[6]||"","Loan Amount":    cells[7]||"",
        });
      });
      return rows;
    }
    const cards = document.querySelectorAll(
      "[data-testid='instrument-row'],[class*='resultRow'],[class*='InstrumentRow']"
    );
    cards.forEach(card => {
      const get = sel => { const el = card.querySelector(sel); return el ? (el.innerText||"").trim() : ""; };
      rows.push({
        "Document Number":   get("[data-field='instrumentNumber'],[class*='docNumber']"),
        "Recording Date":    get("[data-field='recordedDate'],[class*='recordedDate']"),
        "Document Type":     get("[data-field='docType'],[class*='docType']"),
        "Grantor":           get("[data-field='grantor'],[class*='grantor']"),
        "Grantee":           get("[data-field='grantee'],[class*='grantee']"),
        "Legal Description": get("[data-field='legalDescription'],[class*='legal']"),
        "Property Address":  get("[data-field='address'],[class*='address']"),
        "Loan Amount":       get("[data-field='consideration'],[class*='consideration']"),
      });
    });
    return rows.filter(r => r["Document Number"]);
  `);
  return (page.evaluate(fn as () => Record<string, string>[]));
}

// ── Per-county scrape ─────────────────────────────────────────────────────────

async function scrapeCounty(
  env: Env,
  browser: Browser,
  countyKey: string
): Promise<void> {
  const meta   = COUNTIES[countyKey] ?? { url: "", name: countyKey };
  const county = meta.name;
  const { from, to } = lastMonthIsoRange();
  console.log(`[${county}] Scraping ${from} → ${to}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const allRows: Record<string, string>[] = [];
  let offset = 0;

  try {
    while (true) {
      const docTypeParam = meta.docTypes ? `&docTypes=${meta.docTypes}` : "";
      const url =
        `${meta.url}/results?department=RP&dateFrom=${from}&dateTo=${to}` +
        `${docTypeParam}&limit=${PAGE_SIZE}&offset=${offset}`;
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });

      const rows = await extractRows(page);
      console.log(`[${county}] offset=${offset}: ${rows.length} rows`);
      if (!rows.length) break;

      allRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  } finally {
    await page.close();
  }

  console.log(`[${county}] Total: ${allRows.length} records`);
  if (!allRows.length) return;

  const csv = buildOprCsv(allRows);
  await submitScraperResult(env, {
    county,
    jobType:    "opr_import",
    csvContent: csv,
    label:      `${county} County RP records ${from}–${to}`,
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scrapePublicSearch(
  env: Env,
  counties = ["dallas", "denton"]
): Promise<void> {
  const browser = await puppeteer.connect(env.BROWSER);
  try {
    for (const key of counties) {
      await scrapeCounty(env, browser, key).catch(err =>
        console.error(`[${key}] scrape failed:`, err)
      );
    }
  } finally {
    await browser.close();
  }
}
