/**
 * PublicSearch.us Scraper — Dallas & Denton counties
 * (same platform as Bexar: *.tx.publicsearch.us)
 *
 * Searches Real Property records recorded in the prior calendar month,
 * extracts all results, converts to OPR-compatible CSV, and uploads.
 *
 * Usage:
 *   node scripts/scrapers/publicsearch-county.js dallas
 *   node scripts/scrapers/publicsearch-county.js denton
 *
 * Env vars:
 *   WORKER_URL   – base URL of the deployed Worker (no trailing slash)
 *   WORKER_EMAIL – email with admin role (X-User-Email header)
 */

'use strict';

const { chromium } = require('playwright');
const { uploadCsv }  = require('./upload');

const COUNTIES = {
  dallas: { url: 'https://dallas.tx.publicsearch.us', name: 'Dallas' },
  denton: { url: 'https://denton.tx.publicsearch.us', name: 'Denton' },
  bexar:  { url: 'https://bexar.tx.publicsearch.us',  name: 'Bexar'  },
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function lastMonthRange() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso   = d => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

// ── CSV builder ───────────────────────────────────────────────────────────────

function rowsToCsv(rows) {
  const headers = ['Document Number','Recording Date','Document Type','Grantor','Grantee','Legal Description','Property Address','Loan Amount'];
  const escape  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

// ── Main scraper ──────────────────────────────────────────────────────────────

async function scrape(countyKey) {
  const county = COUNTIES[countyKey?.toLowerCase()];
  if (!county) {
    console.error(`Unknown county "${countyKey}". Valid: ${Object.keys(COUNTIES).join(', ')}`);
    process.exit(1);
  }

  const { from, to } = lastMonthRange();
  console.log(`${county.name} County (PublicSearch.us): ${from} → ${to}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page    = await context.newPage();
  page.setDefaultTimeout(60_000);

  // Navigate to the search results page directly via URL params
  const searchUrl = `${county.url}/results?department=RP&dateFrom=${from}&dateTo=${to}&limit=100&offset=0`;
  await page.goto(searchUrl, { waitUntil: 'networkidle' });

  const allRows = [];
  let offset    = 0;
  const limit   = 100;

  while (true) {
    // Wait for result rows to render
    await page.waitForSelector('[data-testid="instrument-row"], tr.result-row, .result-card, table tbody tr', {
      timeout: 30_000,
    }).catch(() => {});

    const rows = await extractRows(page);
    if (!rows.length) break;
    allRows.push(...rows);
    console.log(`  offset=${offset}: ${rows.length} records`);

    // Check for more pages — look for a "Next" button or total count
    const nextBtn = page.locator('button[aria-label*="Next"], button:has-text("Next"), [data-testid="pagination-next"]').first();
    const hasNext = (await nextBtn.count()) > 0 && (await nextBtn.isEnabled().catch(() => false));
    if (!hasNext) break;

    offset += limit;
    const nextUrl = `${county.url}/results?department=RP&dateFrom=${from}&dateTo=${to}&limit=${limit}&offset=${offset}`;
    await page.goto(nextUrl, { waitUntil: 'networkidle' });
  }

  await browser.close();

  if (!allRows.length) {
    console.log('No records found.');
    return;
  }

  console.log(`Total: ${allRows.length} records`);
  const csv = rowsToCsv(allRows);
  await uploadCsv(csv, county.name, 'opr');
}

async function extractRows(page) {
  const out = [];

  // PublicSearch.us renders results in a table or card grid
  // Try table rows first
  const tableRows = await page.locator('table tbody tr').all();
  if (tableRows.length) {
    for (const row of tableRows) {
      const cells = await row.locator('td').all();
      if (cells.length < 3) continue;
      const text = async c => (await c.innerText()).trim().replace(/\s+/g, ' ');
      out.push({
        'Document Number': await text(cells[0]),
        'Recording Date':  await text(cells[1]),
        'Document Type':   await text(cells[2]),
        'Grantor':         cells[3] ? await text(cells[3]) : '',
        'Grantee':         cells[4] ? await text(cells[4]) : '',
        'Legal Description': cells[5] ? await text(cells[5]) : '',
        'Property Address':  cells[6] ? await text(cells[6]) : '',
        'Loan Amount':       cells[7] ? await text(cells[7]) : '',
      });
    }
    return out;
  }

  // Fall back to data-attribute rows (React-rendered cards)
  const cards = await page.locator('[data-testid="instrument-row"], .instrument-card').all();
  for (const card of cards) {
    const get = async sel => {
      const el = card.locator(sel).first();
      return (await el.count()) ? (await el.innerText()).trim() : '';
    };
    out.push({
      'Document Number': await get('[data-field="instrumentNumber"], .doc-number'),
      'Recording Date':  await get('[data-field="recordedDate"], .recorded-date'),
      'Document Type':   await get('[data-field="docType"], .doc-type'),
      'Grantor':         await get('[data-field="grantor"], .grantor'),
      'Grantee':         await get('[data-field="grantee"], .grantee'),
      'Legal Description': await get('[data-field="legalDescription"], .legal-desc'),
      'Property Address':  await get('[data-field="address"], .address'),
      'Loan Amount':       await get('[data-field="consideration"], .consideration'),
    });
  }
  return out.filter(r => r['Document Number']);
}

const countyArg = process.argv[2];
scrape(countyArg).catch(err => { console.error(err); process.exit(1); });
