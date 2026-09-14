/**
 * Travis County Clerk – Real Property scraper
 * https://tccsearch.org
 *
 * Uses Cloudflare Browser Rendering (@cloudflare/puppeteer) because the site
 * is an Infragistics ASP.NET SPA that requires JS for login and search.
 *
 * Credentials stored as Worker secrets:
 *   TRAVIS_USERNAME   — login name
 *   TRAVIS_PASSWORD   — password
 *
 * Collects all Real Property records from the prior calendar month,
 * then submits via the shared OPR import pipeline.
 */

import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";
import type { Env } from "../types";
import { buildOprCsv, lastMonthSlashRange, submitScraperResult } from "./pipeline";
import type { DateRange } from "./harris";

const BASE_URL   = "https://tccsearch.org";
const LOGIN_URL  = `${BASE_URL}/default.aspx`;
const SEARCH_URL = `${BASE_URL}/SearchNadr.aspx`;
const COUNTY     = "Travis";

// ── Login ─────────────────────────────────────────────────────────────────────

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30_000 });

  // Infragistics WebTextEditor controls wrap actual inputs — try both selectors
  const usernameInput = await page.$("input[id*='txtLogonName']") ??
                        await page.$("#LoginForm1_txtLogonName_Input");
  const passwordInput = await page.$("input[id*='txtPassword']") ??
                        await page.$("#LoginForm1_txtPassword_Input");

  if (!usernameInput || !passwordInput) {
    // Fallback: type into any visible text/password inputs
    const inputs = await page.$$("input[type='text'], input[type='password']");
    if (inputs.length >= 2) {
      await inputs[0]!.click({ clickCount: 3 });
      await inputs[0]!.type(username, { delay: 30 });
      await inputs[1]!.click({ clickCount: 3 });
      await inputs[1]!.type(password, { delay: 30 });
    } else {
      throw new Error("[travis] Could not locate login fields");
    }
  } else {
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(username, { delay: 30 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 30 });
  }

  // Click login button
  const loginBtn = await page.$("input[id*='btnLogon'], button[id*='btnLogon']");
  if (loginBtn) {
    await loginBtn.click();
  } else {
    await page.evaluate(() => {
      const btn =
        document.querySelector<HTMLElement>("input[id*='btnLogon']") ??
        document.querySelector<HTMLElement>("button[id*='btnLogon']");
      btn?.click();
    });
  }

  // Wait for navigation — could land on disclaimer or search page
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20_000 }).catch(() => {});
  console.log(`[travis] After login: ${page.url()}`);
}

// ── Disclaimer acceptance ─────────────────────────────────────────────────────

async function acceptDisclaimer(page: Page): Promise<void> {
  // Some sessions show a disclaimer; accept if present
  const url = page.url();
  if (url.toLowerCase().includes("disclaimer") || url.toLowerCase().includes("agree")) {
    const agreeLink = await page.$("a[href*='Agree'], input[value*='Agree'], a[href*='acknowledge']");
    if (agreeLink) {
      await agreeLink.click();
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15_000 }).catch(() => {});
      console.log(`[travis] Disclaimer accepted, now at: ${page.url()}`);
    }
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

async function navigateToSearch(page: Page): Promise<void> {
  if (!page.url().includes("SearchNadr")) {
    await page.goto(SEARCH_URL, { waitUntil: "networkidle2", timeout: 20_000 });
    console.log(`[travis] Navigated to search: ${page.url()}`);
  }
}

async function submitSearch(page: Page, from: string, to: string): Promise<void> {
  // Wait for search form
  await page.waitForSelector(
    "input[id*='DateFrom'], input[id*='dateFrom'], input[id*='StartDate'], select[id*='DocType']",
    { timeout: 20_000 }
  ).catch(() => {});

  // Fill date range — try multiple common Infragistics/ASP.NET field naming patterns
  const setField = async (patterns: string[], value: string) => {
    for (const sel of patterns) {
      const el = await page.$(`input[id*='${sel}'], input[name*='${sel}']`);
      if (el) {
        await el.click({ clickCount: 3 });
        await el.type(value, { delay: 20 });
        return true;
      }
    }
    return false;
  };

  const fromSet = await setField(["DateFrom", "dateFrom", "StartDate", "BeginDate", "FromDate"], from);
  const toSet   = await setField(["DateTo", "dateTo", "EndDate", "ToDate"], to);
  if (!fromSet || !toSet) {
    console.warn("[travis] Could not set date fields — check selector names on live site");
  }

  // Select document type = "RP" (Real Property)
  const typeSet = await page.evaluate(() => {
    const sel = document.querySelector<HTMLSelectElement>(
      "select[id*='DocType'], select[id*='InstrumentType'], select[id*='RecordType']"
    );
    if (!sel) return false;
    // Find option with value or text matching "RP" or "Real Property"
    const opt = Array.from(sel.options).find(
      o => o.value === "RP" || o.text.includes("Real Property") || o.text === "RP"
    );
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change")); return true; }
    return false;
  });
  if (!typeSet) {
    console.warn("[travis] Could not set document type — will scrape all types");
  }

  // Submit the search form
  const searchBtn = await page.$(
    "input[id*='btnSearch'], input[value='Search'], button[id*='btnSearch']"
  );
  if (searchBtn) {
    await searchBtn.click();
  } else {
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>(
        "input[id*='btnSearch'], input[value='Search'], button[id*='btnSearch']"
      );
      btn?.click();
    });
  }

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => {});
}

// ── Row extraction ────────────────────────────────────────────────────────────

async function extractRows(page: Page): Promise<Record<string, string>[]> {
  await page.waitForSelector("table tbody tr, [class*='noResults'], [class*='NoResults']", {
    timeout: 15_000,
  }).catch(() => {});

  const fn = new Function(`
    const rows = [];
    const trs = document.querySelectorAll("table tbody tr");
    trs.forEach(tr => {
      const cells = [...tr.querySelectorAll("td")].map(td => (td.innerText || "").trim());
      if (cells[0] && !/^(#|No\\.|Num)/i.test(cells[0])) {
        rows.push({
          "Document Number":   cells[0] || "",
          "Recording Date":    cells[1] || "",
          "Document Type":     cells[2] || "",
          "Grantor":           cells[3] || "",
          "Grantee":           cells[4] || "",
          "Legal Description": cells[5] || "",
          "Property Address":  cells[6] || "",
          "Loan Amount":       cells[7] || "",
        });
      }
    });
    return rows;
  `);

  return page.evaluate(fn as () => Record<string, string>[]);
}

// ── Pagination ────────────────────────────────────────────────────────────────

async function goToNextPage(page: Page, currentPage: number): Promise<boolean> {
  // Check for ASP.NET pager link for next page
  const nextExists = await page.evaluate((nextPageNum: number) => {
    const links = Array.from(document.querySelectorAll("a, span"));
    return links.some(el => el.textContent?.trim() === String(nextPageNum));
  }, currentPage + 1);

  if (!nextExists) return false;

  await page.evaluate((nextPageNum: number) => {
    const links = Array.from(document.querySelectorAll("a"));
    const next  = links.find(a => a.textContent?.trim() === String(nextPageNum));
    next?.click();
  }, currentPage + 1);

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20_000 }).catch(() => {});
  return true;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scrapeTravis(env: Env, dateRange?: DateRange): Promise<void> {
  const username = env.TRAVIS_USERNAME;
  const password = env.TRAVIS_PASSWORD;

  if (!username || !password) {
    console.warn("[travis] TRAVIS_USERNAME / TRAVIS_PASSWORD secrets not set — skipping");
    return;
  }

  const { from, to } = dateRange ?? lastMonthSlashRange();
  console.log(`[travis] Scraping ${from} → ${to}`);

  const browser: Browser = await puppeteer.connect(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    await login(page, username, password);
    await acceptDisclaimer(page);
    await navigateToSearch(page);
    await submitSearch(page, from, to);

    const allRows: Record<string, string>[] = [];
    let pageNum = 1;

    while (true) {
      const rows = await extractRows(page);
      console.log(`[travis] Page ${pageNum}: ${rows.length} rows`);
      allRows.push(...rows);

      if (!rows.length) break;
      const hasNext = await goToNextPage(page, pageNum);
      if (!hasNext) break;
      pageNum++;
    }

    await page.close();
    console.log(`[travis] Total: ${allRows.length} records`);
    if (!allRows.length) return;

    const csv = buildOprCsv(allRows);
    await submitScraperResult(env, {
      county:     COUNTY,
      jobType:    "opr_import",
      csvContent: csv,
      label:      `Travis County RP records ${from}–${to}`,
    });
  } finally {
    await browser.close();
  }
}
