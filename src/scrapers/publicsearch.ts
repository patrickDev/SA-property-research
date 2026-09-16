/**
 * PublicSearch.us Browser Rendering scraper
 * Covers: Bexar  (bexar.tx.publicsearch.us)   — APPT + SUB doc types only
 *         Dallas (dallas.tx.publicsearch.us)   — all RP records
 *         Denton (denton.tx.publicsearch.us)   — all RP records
 *
 * Uses Cloudflare Browser Rendering (@cloudflare/puppeteer) because these are
 * React SPAs that require JavaScript execution to render search results.
 *
 * Strategy: submit the Quick Search form directly (typing in the search box
 * and pressing Enter). Hard-navigating to /results?... bypasses the React app's
 * Redux state management and the app never fetches data.
 */

import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";
import type { Env } from "../types";
import { buildOprCsv, lastMonthIsoRange, submitScraperResult } from "./pipeline";
import type { DateRange } from "./harris";

const COUNTIES: Record<string, { url: string; name: string; docTypes?: string }> = {
  bexar:  { url: "https://bexar.tx.publicsearch.us",  name: "Bexar",  docTypes: "APPT,SUB,LIS,NTS" },
  dallas: { url: "https://dallas.tx.publicsearch.us", name: "Dallas", docTypes: "APPT,SUB,LIS,NTS" },
  denton: { url: "https://denton.tx.publicsearch.us", name: "Denton", docTypes: "APPT,SUB,LIS,NTS" },
};

type RowRecord = Record<string, string>;

// ── Row extraction ────────────────────────────────────────────────────────────

async function extractRows(page: Page): Promise<RowRecord[]> {
  await page.waitForSelector(
    "table tbody tr, [data-testid='instrument-row'], [class*='noResults'], [class*='NoResults']",
    { timeout: 20_000 }
  ).catch(() => {});

  return (page.evaluate(() => {
    const rows: Record<string, string>[] = [];
    const trs = document.querySelectorAll("table tbody tr");
    if (trs.length > 0) {
      trs.forEach(tr => {
        const cells = Array.from(tr.querySelectorAll("td")).map(td => (td.innerText || "").trim());
        if (cells[0]) rows.push({
          "Document Number":   cells[0] || "",
          "Recording Date":    cells[1] || "",
          "Document Type":     cells[2] || "",
          "Grantor":           cells[3] || "",
          "Grantee":           cells[4] || "",
          "Legal Description": cells[5] || "",
          "Property Address":  cells[6] || "",
          "Loan Amount":       cells[7] || "",
        });
      });
      return rows;
    }
    const cards = document.querySelectorAll(
      "[data-testid='instrument-row'],[class*='resultRow'],[class*='InstrumentRow']"
    );
    cards.forEach(card => {
      const get = (sel: string) => {
        const el = card.querySelector<HTMLElement>(sel);
        return el ? (el.innerText || "").trim() : "";
      };
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
  }) as Promise<RowRecord[]>);
}

// ── Submit the Quick Search form ───────────────────────────────────────────────

/**
 * Submit the home-page Quick Search form with the given search term.
 * This triggers React's internal Redux navigation, so the results page
 * actually fetches data.
 */
async function submitQuickSearch(page: Page, searchTerm: string): Promise<void> {
  // Wait for the Quick Search input to appear (#searchInputBox is the React id)
  await page.waitForSelector(
    "#searchInputBox, input[id*='searchInput' i], input[placeholder*='Search' i], input[type='search']",
    { timeout: 15_000 }
  ).catch(() => {});

  // Small pause for React to fully hydrate
  await new Promise(r => setTimeout(r, 1500));

  // Click the search box, clear it, and type the search term
  const typed = await (page.evaluate((term: string) => {
    const sels = [
      "#searchInputBox",
      "input[id*='searchInput' i]",
      "input[placeholder*='Search' i]",
      "input[type='search']",
      ".basic-search input[type='text']",
    ];
    for (const sel of sels) {
      const el = document.querySelector<HTMLInputElement>(sel);
      if (el) {
        el.focus();
        el.select();
        // Set value and fire React's synthetic events
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, term);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          el.value = term;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur",   { bubbles: true }));
        return sel;
      }
    }
    return null;
  }, searchTerm) as Promise<string | null>);

  console.log(`[publicsearch] typed "${searchTerm}" via selector: ${typed}`);
  if (!typed) {
    console.warn("[publicsearch] Could not find search input — trying keyboard fallback");
  }

  // Submit the form: try clicking the submit button first, then fall back to Enter
  const submitted = await (page.evaluate(() => {
    const sels = [
      "button[type='submit']",
      "input[type='submit']",
      ".basic-search button[type='submit']",
      "button[class*='search' i][type='submit']",
      "form button",
    ];
    for (const sel of sels) {
      const btn = document.querySelector<HTMLElement>(sel);
      if (btn) { btn.click(); return sel; }
    }
    return null;
  }) as Promise<string | null>);

  if (!submitted) {
    // Fallback: press Enter in the input
    await page.keyboard.press("Enter");
    console.log("[publicsearch] Submitted via Enter key");
  } else {
    console.log(`[publicsearch] Submitted via button: ${submitted}`);
  }

  // Wait for results to load
  await page.waitForSelector(
    "table tbody tr, [data-testid='instrument-row'], [class*='noResults'], [class*='NoResults']",
    { timeout: 25_000 }
  ).catch(() => {});
}

// ── Pagination ─────────────────────────────────────────────────────────────────

async function goNext(page: Page): Promise<boolean> {
  return (page.evaluate(() => {
    const btn = document.querySelector<HTMLButtonElement | HTMLAnchorElement>(
      "[aria-label='Next page'], [data-testid='nextPage'], button.next, a[rel='next']"
    );
    if (!btn) return false;
    if ((btn as HTMLButtonElement).disabled) return false;
    if (btn.getAttribute("aria-disabled") === "true") return false;
    btn.click();
    return true;
  }) as Promise<boolean>);
}

// ── Date filtering ─────────────────────────────────────────────────────────────

/** Keep only rows whose Recording Date falls within [from, to] (ISO dates) */
function filterByDate(rows: RowRecord[], from: string, to: string): RowRecord[] {
  const fromMs = new Date(from).getTime();
  const toMs   = new Date(to).getTime() + 86_400_000; // inclusive end
  return rows.filter(row => {
    const raw = row["Recording Date"] || "";
    if (!raw) return true; // keep if no date
    // Handle M/D/YYYY format
    const d = new Date(raw);
    if (isNaN(d.getTime())) return true;
    return d.getTime() >= fromMs && d.getTime() < toMs;
  });
}

// ── Per-county scrape ─────────────────────────────────────────────────────────

async function scrapeCounty(
  env: Env,
  browser: Browser,
  countyKey: string,
  dateRange?: DateRange
): Promise<string | undefined> {
  const meta   = COUNTIES[countyKey] ?? { url: "", name: countyKey };
  const county = meta.name;
  const { from, to } = dateRange ?? lastMonthIsoRange();
  console.log(`[${county}] Scraping ${from} → ${to}`);

  const docTypes    = (meta.docTypes ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const searchTerms = docTypes.length ? docTypes : [""];
  const allRows: RowRecord[] = [];
  const seen = new Set<string>();

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    for (const term of searchTerms) {
      console.log(`[${county}] Searching for term: "${term}"`);

      // Load home page fresh for each search term
      await page.goto(meta.url + "/", { waitUntil: "load", timeout: 30_000 });

      // Submit the quick search form
      await submitQuickSearch(page, term);

      let pageNum = 0;
      while (true) {
        const rawRows = await extractRows(page);
        const rows    = filterByDate(rawRows, from, to);
        console.log(`[${county}] term=${term} page=${pageNum}: ${rawRows.length} raw → ${rows.length} in range`);

        for (const row of rows) {
          const key = row["Document Number"];
          if (key && !seen.has(key)) { seen.add(key); allRows.push(row); }
        }

        // Stop paginating if this page had no in-range records (we've gone past our date range)
        if (!rawRows.length) break;
        pageNum++;
        const hasNext = await goNext(page);
        if (!hasNext) break;
        await page.waitForSelector(
          "table tbody tr, [data-testid='instrument-row'], [class*='noResults']",
          { timeout: 20_000 }
        ).catch(() => {});
      }
    }
  } finally {
    await page.close();
  }

  console.log(`[${county}] Total: ${allRows.length} records in date range`);
  if (!allRows.length) return undefined;

  const csv = buildOprCsv(allRows);
  return submitScraperResult(env, {
    county,
    jobType:    "opr_import",
    csvContent: csv,
    label:      `${county} County RP records ${from}–${to}`,
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scrapePublicSearch(
  env: Env,
  counties = ["bexar", "dallas", "denton"],
  dateRange?: DateRange
): Promise<string | undefined> {
  const browser = await puppeteer.launch(env.BROWSER);
  let lastJobId: string | undefined;
  try {
    for (const key of counties) {
      const jobId = await scrapeCounty(env, browser, key, dateRange).catch((err: unknown) => {
        console.error(`[${key}] scrape failed:`, err);
        return undefined;
      });
      if (jobId) lastJobId = jobId;
    }
  } finally {
    await browser.close();
  }
  return lastJobId;
}

/** Debug-only: inspect form submission and return first 10 rows */
export async function debugScrapePublicSearch(
  env: Env,
  county: string,
  dateRange: DateRange
): Promise<Record<string, unknown>> {
  const meta = COUNTIES[county] ?? { url: `https://${county}.tx.publicsearch.us`, name: county };
  const { from, to } = dateRange;

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Load home page
    await page.goto(meta.url + "/", { waitUntil: "load", timeout: 30_000 });

    // Inspect home page inputs before submitting
    const formInfo = await (page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input")).map(el => ({
        id: el.id, type: el.type, placeholder: el.placeholder.slice(0, 60),
        className: el.className.slice(0, 60),
      }));
      const buttons = Array.from(document.querySelectorAll("button")).map(el => ({
        type: el.type, text: (el.innerText || "").trim().slice(0, 50),
        className: el.className.slice(0, 60),
      }));
      return { title: document.title, url: location.href, inputs, buttons };
    }) as Promise<Record<string, unknown>>);

    // Submit quick search
    await submitQuickSearch(page, "APPT");

    const afterInfo = await (page.evaluate(() => ({
      title:   document.title,
      url:     location.href,
      trCount: document.querySelectorAll("table tbody tr").length,
    })) as Promise<{ title: string; url: string; trCount: number }>);

    const rows = await extractRows(page);
    const filtered = filterByDate(rows, from, to);

    await page.close();
    return { formInfo, afterInfo, totalRows: rows.length, filteredRows: filtered.length, sampleRows: filtered.slice(0, 10) };
  } finally {
    await browser.close();
  }
}
