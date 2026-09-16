/**
 * BCAD Enricher — Bexar County OPR-driven property enrichment
 *
 * After OPR documents are imported, this enricher looks up each unmatched
 * document on the TrueAutomation portal (propaccess.trueautomation.com)
 * to retrieve full BCAD property data: owner, appraised value, use code,
 * building details.
 *
 * Search strategy:
 *  1. If property address is present: search by street address (most accurate)
 *  2. For LIS PENDENS / NOTICE: grantor = property owner → search by owner name
 *  3. For APPOINTMENT / SUBSTITUTION: grantor = lender → try grantee name
 *
 * Processes up to MAX_PER_RUN documents per call to stay within Worker limits.
 */

import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";
import type { Env } from "../types";

const SEARCH_URL  = "https://propaccess.trueautomation.com/clientdb/?cid=110";
const DETAIL_BASE = "https://propaccess.trueautomation.com/clientdb/Property.aspx";
const CID         = "110";
const MAX_PER_RUN = 15;

// ── Address parser ─────────────────────────────────────────────────────────────

function parseAddress(addr: string): { num: string; name: string } | null {
  if (!addr) return null;
  const clean = addr.trim().toUpperCase();
  const m = clean.match(/^(\d+[A-Z]?)\s+(.+?)(?:\s*,|\s+(?:SAN ANTONIO|AUSTIN|HOUSTON|DALLAS|DENTON|TX\b|\d{5})).*$/i);
  if (m) return { num: m[1]!.trim(), name: m[2]!.trim().split(/\s+/).slice(0, 3).join(" ") };
  const parts = clean.split(/\s+/);
  if (parts.length >= 2 && /^\d+[A-Z]?$/.test(parts[0]!)) {
    return { num: parts[0]!, name: parts.slice(1, 3).join(" ") };
  }
  return null;
}

// ── TrueAutomation search ─────────────────────────────────────────────────────

async function extractFirstPropId(page: Page): Promise<string | null> {
  return (page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href*='prop_id='], a[href*='Property.aspx']"));
    if (!links.length) return null;
    const href = (links[0] as HTMLAnchorElement).href;
    const m = href.match(/prop_id=(\d+)/i);
    return m ? m[1]! : null;
  }) as Promise<string | null>);
}

/** Search by owner name, return the first matching prop_id or null */
async function searchByOwnerName(page: Page, ownerName: string): Promise<string | null> {
  await page.goto(SEARCH_URL, { waitUntil: "load", timeout: 30_000 });

  const typed = await (page.evaluate((name: string) => {
    const sels = [
      "input[id*='txtOwner']", "input[name*='txtOwner']",
      "input[id*='Owner']",    "input[placeholder*='owner' i]",
    ];
    for (const sel of sels) {
      const el = document.querySelector<HTMLInputElement>(sel);
      if (!el) continue;
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(el, name);
      else el.value = name;
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur",   { bubbles: true }));
      return sel;
    }
    return null;
  }, ownerName) as Promise<string | null>);

  if (!typed) return null;

  const btnSel = "input[id*='btnSearch'], input[value='Search'], button[id*='btnSearch']";
  const btn = await page.$(btnSel);
  if (btn) await btn.click();
  else await page.keyboard.press("Enter");

  await page.waitForNavigation({ waitUntil: "load", timeout: 20_000 }).catch(() => {});
  return extractFirstPropId(page);
}

/** Search by street address, return the first matching prop_id or null */
async function searchByAddress(page: Page, streetNum: string, streetName: string): Promise<string | null> {
  await page.goto(SEARCH_URL, { waitUntil: "load", timeout: 30_000 });

  const numSel  = "input[id*='txtStreetNum'], input[name*='txtStreetNum'], #txtStreetNum";
  const nameSel = "input[id*='txtStreetName'], input[name*='txtStreetName'], #txtStreetName";

  const numInput  = await page.$(numSel);
  const nameInput = await page.$(nameSel);
  if (!numInput || !nameInput) return null;

  await numInput.click({ clickCount: 3 });
  await numInput.type(streetNum, { delay: 20 });
  await nameInput.click({ clickCount: 3 });
  await nameInput.type(streetName, { delay: 20 });

  await (page.evaluate(() => {
    const sel = document.querySelector<HTMLSelectElement>(
      "select[id*='ddlPropType'], select[name*='ddlPropType']"
    );
    if (sel) {
      const opt = Array.from(sel.options).find(o => /^R(eal)?$/i.test(o.value) || /real/i.test(o.text));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change")); }
    }
  }) as Promise<void>);

  const btnSel = "input[id*='btnSearch'], input[value='Search'], button[id*='btnSearch']";
  const btn = await page.$(btnSel);
  if (btn) await btn.click();
  else await page.keyboard.press("Enter");

  await page.waitForNavigation({ waitUntil: "load", timeout: 20_000 }).catch(() => {});
  return extractFirstPropId(page);
}

// ── Property detail extraction ────────────────────────────────────────────────

interface BcadDetail {
  propId:              string;
  geographicId:        string | null;
  ownerName:           string | null;
  mailingCity:         string | null;
  mailingState:        string | null;
  mailingZip:          string | null;
  propertyAddress:     string | null;
  propertyUseCode:     string | null;
  landValue:           number | null;
  improvementValue:    number | null;
  totalAppraisedValue: number | null;
  landAreaAcres:       number | null;
  buildingAreaSqFt:    number | null;
  exemptionStatus:     string | null;
}

async function extractDetail(page: Page, propId: string): Promise<BcadDetail | null> {
  const year = new Date().getFullYear();
  const url  = `${DETAIL_BASE}?prop_id=${propId}&cid=${CID}&year=${year}`;
  await page.goto(url, { waitUntil: "load", timeout: 20_000 });

  const raw = await (page.evaluate(() => {
    const txt = (sel: string): string | null => {
      const el = document.querySelector(sel);
      return el ? ((el as HTMLElement).innerText || el.textContent || "").trim() || null : null;
    };
    const numStr = (val: string | null): number | null => {
      if (!val) return null;
      const n = parseFloat(val.replace(/[^0-9.]/g, ""));
      return isNaN(n) ? null : n;
    };
    const findValueRow = (label: string): string | null => {
      for (const row of Array.from(document.querySelectorAll("tr"))) {
        if (new RegExp(label, "i").test(row.textContent || "")) {
          const tds = row.querySelectorAll("td");
          const last = tds[tds.length - 1];
          return last ? last.textContent?.replace(/[^0-9.]/g, "") || null : null;
        }
      }
      return null;
    };

    const ownerRow = Array.from(document.querySelectorAll("tr, .field-row")).find(
      r => /\bowner\b/i.test(r.textContent || "")
    );
    const ownerName = ownerRow
      ? ((ownerRow.querySelectorAll("td")[1] || ownerRow.querySelectorAll("td")[0]) as HTMLElement | undefined)?.innerText?.trim() || null
      : txt("[id*='Owner'], [class*='owner-name']");

    const geographicId = txt("[id*='Geographic'], [class*='geo-id']");

    const useEl = Array.from(document.querySelectorAll("td")).find(
      el => /state code|use code|property use/i.test(el.previousElementSibling?.textContent || "")
    );
    const propertyUseCode = useEl ? useEl.textContent?.trim() || null : null;

    return {
      geographicId:    geographicId || null,
      ownerName:       ownerName   || null,
      propertyUseCode: propertyUseCode || null,
      land:            numStr(findValueRow("land")),
      improvement:     numStr(findValueRow("improvement|building")),
      total:           numStr(findValueRow("total appraised|total value|market value")),
      landAcres:       numStr(findValueRow("land acres|area.*acres")),
      buildingSqFt:    numStr(findValueRow("building.*sq|sq.*ft|living area")),
      mailingCity:     txt("[id*='MailCity'], [class*='mail-city']"),
      mailingState:    txt("[id*='MailState'], [class*='mail-state']"),
      mailingZip:      txt("[id*='MailZip'], [class*='mail-zip']"),
      propertyAddr:    txt("[id*='SiteAddress'], [id*='PropAddr'], [class*='site-address']"),
      exemption:       txt("[id*='Exempt'], [class*='exemption']"),
    };
  }) as Promise<Record<string, unknown>>);

  if (!raw) return null;

  return {
    propId,
    geographicId:        (raw["geographicId"] as string | null) ?? null,
    ownerName:           (raw["ownerName"] as string | null) ?? null,
    mailingCity:         (raw["mailingCity"] as string | null) ?? null,
    mailingState:        (raw["mailingState"] as string | null) ?? null,
    mailingZip:          (raw["mailingZip"] as string | null) ?? null,
    propertyAddress:     (raw["propertyAddr"] as string | null) ?? null,
    propertyUseCode:     (raw["propertyUseCode"] as string | null) ?? null,
    landValue:           (raw["land"] as number | null) ?? null,
    improvementValue:    (raw["improvement"] as number | null) ?? null,
    totalAppraisedValue: (raw["total"] as number | null) ?? null,
    landAreaAcres:       (raw["landAcres"] as number | null) ?? null,
    buildingAreaSqFt:    (raw["buildingSqFt"] as number | null) ?? null,
    exemptionStatus:     (raw["exemption"] as string | null) ?? null,
  };
}

// ── DB operations ─────────────────────────────────────────────────────────────

async function upsertProperty(env: Env, detail: BcadDetail, county: string): Promise<string> {
  const now = new Date().toISOString();
  const id  = `BCAD-${county.toUpperCase()}-${detail.propId}`;

  const existing = await env.DB.prepare("SELECT id FROM properties WHERE id = ?")
    .bind(id).first<{ id: string }>();

  if (existing) {
    await env.DB.prepare(`
      UPDATE properties SET
        geographic_id         = COALESCE(?, geographic_id),
        total_appraised_value = COALESCE(?, total_appraised_value),
        improvement_value     = COALESCE(?, improvement_value),
        land_value            = COALESCE(?, land_value),
        last_updated          = ?
      WHERE id = ?
    `).bind(
      detail.geographicId, detail.totalAppraisedValue,
      detail.improvementValue, detail.landValue, now, id
    ).run();
    return id;
  }

  const sqM = detail.buildingAreaSqFt ? detail.buildingAreaSqFt * 0.092903 : null;
  await env.DB.prepare(`
    INSERT INTO properties (
      id, county, geographic_id, property_address, city, state,
      property_use_code, commercial,
      improvement_value, land_value, total_appraised_value,
      land_area_acres, building_area_sq_ft, building_area_sq_m,
      exemption_status, data_source, import_date, last_updated
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, county, detail.geographicId, detail.propertyAddress,
    "San Antonio", "TX",
    detail.propertyUseCode,
    0,
    detail.improvementValue, detail.landValue, detail.totalAppraisedValue,
    detail.landAreaAcres, detail.buildingAreaSqFt, sqM,
    detail.exemptionStatus, "bcad_enrichment", now, now
  ).run();

  if (detail.ownerName) {
    await env.DB.prepare(`
      INSERT INTO owners (property_id, owner_name, mailing_city, mailing_state, mailing_zip,
                          data_source, import_date, last_updated)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(
      id, detail.ownerName,
      detail.mailingCity, detail.mailingState, detail.mailingZip,
      "bcad_enrichment", now, now
    ).run().catch(() => {});
  }

  return id;
}

async function linkOprDocument(env: Env, oprDocId: number, propertyId: string): Promise<void> {
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    "SELECT id FROM opr_property_links WHERE opr_document_id = ?"
  ).bind(oprDocId).first<{ id: number }>();

  if (existing) {
    await env.DB.prepare(
      "UPDATE opr_property_links SET property_id = ?, match_confidence = 'fuzzy_address' WHERE id = ?"
    ).bind(propertyId, existing.id).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO opr_property_links (opr_document_id, property_id, match_confidence, created_at) VALUES (?,?,?,?)"
    ).bind(oprDocId, propertyId, "fuzzy_address", now).run();
  }
}

// ── Owner name selection ───────────────────────────────────────────────────────

/**
 * For LIS PENDENS / NOTICE: grantor = property owner (defendant) → best search term.
 * For APPOINTMENT / SUBSTITUTION: grantor = lender — use anyway as best available.
 */
function getSearchName(
  docType: string,
  grantor: string | null,
  grantee: string | null
): string | null {
  const dt = (docType || "").toUpperCase();
  if (dt.startsWith("LIS") || dt.startsWith("NOTICE")) {
    return grantor || grantee || null;
  }
  return grantor || grantee || null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function enrichUnmatchedDocuments(
  env: Env
): Promise<{ enriched: number; failed: number; skipped: number }> {
  console.log("[bcad-enricher] Starting enrichment");

  const { results: docs } = await env.DB.prepare(`
    SELECT od.id, od.document_type, od.grantor, od.grantee,
           od.property_address, od.county
    FROM opr_documents od
    LEFT JOIN opr_property_links opl ON opl.opr_document_id = od.id
    WHERE LOWER(od.county) = 'bexar'
      AND (opl.id IS NULL OR opl.property_id IS NULL)
      AND od.import_date >= datetime('now', '-60 days')
    ORDER BY od.import_date DESC
    LIMIT ?
  `).bind(MAX_PER_RUN).all<{
    id: number;
    document_type: string | null;
    grantor: string | null;
    grantee: string | null;
    property_address: string | null;
    county: string;
  }>();

  if (!docs?.length) {
    console.log("[bcad-enricher] No unmatched documents — done");
    return { enriched: 0, failed: 0, skipped: 0 };
  }

  console.log(`[bcad-enricher] Enriching up to ${docs.length} documents`);

  const browser: Browser = await puppeteer.launch(env.BROWSER);
  let enriched = 0;
  let failed   = 0;
  let skipped  = 0;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    for (const doc of docs) {
      let propId: string | null = null;

      try {
        // Try address search first (most accurate)
        if (doc.property_address) {
          const parsed = parseAddress(doc.property_address);
          if (parsed) {
            propId = await searchByAddress(page, parsed.num, parsed.name);
          }
        }

        // Fallback: search by owner/grantor name
        if (!propId) {
          const name = getSearchName(doc.document_type ?? "", doc.grantor, doc.grantee);
          if (name) {
            propId = await searchByOwnerName(page, name);
          } else {
            skipped++;
            continue;
          }
        }

        if (!propId) {
          console.log(`[bcad-enricher] doc ${doc.id}: no BCAD match found`);
          failed++;
          continue;
        }

        const detail = await extractDetail(page, propId);
        if (!detail) {
          console.log(`[bcad-enricher] doc ${doc.id}: could not extract detail for prop ${propId}`);
          failed++;
          continue;
        }

        const propertyId = await upsertProperty(env, detail, doc.county);
        await linkOprDocument(env, doc.id, propertyId);
        enriched++;
        console.log(`[bcad-enricher] doc ${doc.id}: linked → ${propertyId}`);

        await new Promise(r => setTimeout(r, 1200));
      } catch (err) {
        console.error(`[bcad-enricher] doc ${doc.id} failed:`, err);
        failed++;
      }
    }

    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`[bcad-enricher] Done — enriched: ${enriched}, failed: ${failed}, skipped: ${skipped}`);
  return { enriched, failed, skipped };
}
