/**
 * Harris County Clerk – Real Property Scraper
 * https://www.cclerk.hctx.net/Applications/WebSearch/RP.aspx
 *
 * Searches for all "APP" (Appointment of Substitute Trustee) documents
 * recorded in the prior calendar month, exports to CSV, and uploads.
 *
 * Usage:
 *   node scripts/scrapers/harris-county.js
 *
 * Env vars:
 *   WORKER_URL   – base URL of the deployed Worker (no trailing slash)
 *   WORKER_EMAIL – email with admin role (used as X-User-Email header)
 */

'use strict';

const { chromium } = require('playwright');
const { uploadCsv }  = require('./upload');

const SEARCH_URL = 'https://www.cclerk.hctx.net/Applications/WebSearch/RP.aspx';
const DOC_TYPE   = 'APP';   // Appointment of Substitute Trustee
const COUNTY     = 'Harris';

// ── Date helpers ──────────────────────────────────────────────────────────────

function lastMonthRange() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt   = d => `${String(d.getMonth() + 1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  return { from: fmt(start), to: fmt(end) };
}

// ── CSV builder ───────────────────────────────────────────────────────────────

function rowsToCsv(rows) {
  const headers = ['Document Number','Recording Date','Document Type','Grantor','Grantee','Legal Description','Property Address','Loan Amount'];
  const escape  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

// ── Main scraper ──────────────────────────────────────────────────────────────

async function scrape() {
  const { from, to } = lastMonthRange();
  console.log(`Harris County: searching ${DOC_TYPE} from ${from} to ${to}`);

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  // Longer timeout for government sites
  page.setDefaultTimeout(60_000);

  await page.goto(SEARCH_URL, { waitUntil: 'networkidle' });

  // Fill date range
  await page.fill('#ctl00_ContentPlaceHolder1_txtFrom', from);
  await page.fill('#ctl00_ContentPlaceHolder1_txtTo',   to);

  // Set instrument type — try select first, fall back to text input
  try {
    const sel = page.locator('#ctl00_ContentPlaceHolder1_ddlInstrumentType');
    const exists = await sel.count();
    if (exists) {
      // Try to select option whose text or value contains DOC_TYPE
      await sel.selectOption({ label: new RegExp(DOC_TYPE, 'i') }).catch(async () => {
        await sel.selectOption({ value: DOC_TYPE }).catch(() => {});
      });
    } else {
      await page.fill('#ctl00_ContentPlaceHolder1_txtInstrumentType', DOC_TYPE);
    }
  } catch (_) {
    // Best effort — some pages use a text field
    await page.fill('#ctl00_ContentPlaceHolder1_txtInstrumentType', DOC_TYPE).catch(() => {});
  }

  // Submit
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('#ctl00_ContentPlaceHolder1_btnSearch'),
  ]);

  const allRows = [];

  // Paginate through all result pages
  let pageNum = 1;
  while (true) {
    console.log(`  → page ${pageNum}`);
    const rows = await extractRows(page);
    allRows.push(...rows);
    console.log(`     ${rows.length} records`);

    // Look for a "Next" page link
    const nextLink = page.locator('a', { hasText: /^(Next|>|\u203a)$/i }).first();
    const hasNext  = (await nextLink.count()) > 0 && await nextLink.isEnabled();
    if (!hasNext) break;

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      nextLink.click(),
    ]);
    pageNum++;
  }

  await browser.close();

  if (!allRows.length) {
    console.log('No records found — nothing to upload.');
    return;
  }

  console.log(`Total records: ${allRows.length}`);
  const csv = rowsToCsv(allRows);
  await uploadCsv(csv, COUNTY, 'opr');
}

async function extractRows(page) {
  // Results table — Harris County uses a GridView with id containing "GridView"
  const table = page.locator('table[id*="GridView"], table[id*="gvResults"], table.results').first();
  if (!(await table.count())) return [];

  const rows  = await table.locator('tr').all();
  const out   = [];

  // First row is header — skip it
  for (let i = 1; i < rows.length; i++) {
    const cells = await rows[i].locator('td').all();
    if (cells.length < 4) continue;

    const text = async c => (await c.innerText()).trim();

    // Typical column order for Harris County RP search:
    // Instrument#  |  Record Date  |  Inst Type  |  Grantor  |  Grantee  |  Legal  |  Consideration
    const record = {
      'Document Number': await text(cells[0]),
      'Recording Date':  await text(cells[1]),
      'Document Type':   await text(cells[2]),
      'Grantor':         cells[3] ? await text(cells[3]) : '',
      'Grantee':         cells[4] ? await text(cells[4]) : '',
      'Legal Description': cells[5] ? await text(cells[5]) : '',
      'Property Address':  cells[6] ? await text(cells[6]) : '',
      'Loan Amount':       cells[7] ? await text(cells[7]) : '',
    };

    if (record['Document Number']) out.push(record);
  }
  return out;
}

scrape().catch(err => { console.error(err); process.exit(1); });
