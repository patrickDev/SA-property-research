/**
 * BCAD Enricher — Bexar County OPR-driven property enrichment
 *
 * After OPR documents (Appointment / Substitution of Trustee) are imported,
 * this enricher looks up each unmatched document's property address on the
 * TrueAutomation portal (propaccess.trueautomation.com) to retrieve full
 * BCAD property data: owner, appraised value, use code, building details.
 *
 * Runs after the daily OPR scrape. Processes up to MAX_PER_RUN documents
 * per execution to stay within Worker wall-clock limits.
 */

import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";
import type { Env } from "../types";
import { generateUUID } from "../services/dedup";

const SEARCH_URL  = "https://propaccess.trueautomation.com/clientdb/?cid=110";
const DETAIL_BASE = "https://propaccess.trueautomation.com/clientdb/Property.aspx";
const CID         = "110";
const MAX_PER_RUN = 20;

// ── Address parser ─────────────────────────────────────────────────────────────

/** Split "1234 MAIN ST SAN ANTONIO TX 78205" into { num, name } */
function parseAddress(addr: string): { num: string; name: string } | null {
  if (!addr) return null;
  const clean = addr.trim().toUpperCase();
  const m = clean.match(/^(\d+[A-Z]?)\s+(.+?)(?:\s*,|\s+(?:SAN ANTONIO|AUSTIN|HOUSTON|DALLAS|DENTON|TX\b|\d{5})).*$/i);
  if (m) return { num: m[1]!.trim(), name: m[2]!.trim().split(/\s+/).slice(0, 3).join(" ") };

  // Fallback: first token = number, next 2 tokens = street name
  const parts = clean.split(/\s+/);
  if (parts.length >= 2 && /^\d+[A-Z]?$/.test(parts[0]!)) {
    return { num: parts[0]!, name: parts.slice(1, 3).join(" ") };
  }
  return null;
}

// ── TrueAutomation search ─────────────────────────────────────────────────────

/** Search by street number + name, return the first matching prop_id or null */
async function searchProperty(
  page: Page,
  streetNum: string,
  streetName: string
): Promise<string | null> {
  await page.goto(SEARCH_URL, { waitUntil: "networkidle2", timeout: 30_000 });

  // Fill street number
  const numSel = "input[id*='txtStreetNum'], input[name*='txtStreetNum'], #txtStreetNum";
  const nameSel = "input[id*='txtStreetName'], input[name*='txtStreetName'], #txtStreetName";

  const numInput  = await page.$(numSel);
  const nameInput = await page.$(nameSel);
  if (!numInput || !nameInput) {
    console.warn("[bcad-enricher] Could not find search fields");
    return null;
  }

  await numInput.click({ clickCount: 3 });
  await numInput.type(streetNum, { delay: 20 });
  await nameInput.click({ clickCount: 3 });
  await nameInput.type(streetName, { delay: 20 });

  // Set property type to Real
  await page.evaluate(() => {
    const sel = document.querySelector<HTMLSelectElement>(
      "select[id*='ddlPropType'], select[name*='ddlPropType']"
    );
    if (sel) {
      const opt = Array.from(sel.options).find(o => /^R(eal)?$/i.test(o.value) || /real/i.test(o.text));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change")); }
    }
  });

  // Submit search
  const btnSel = "input[id*='btnSearch'], input[value='Search'], button[id*='btnSearch']";
  const btn = await page.$(btnSel);
  if (btn) await btn.click();
  else await page.keyboard.press("Enter");

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20_000 }).catch(() => {});

  // Extract first result's prop_id from result table links
  const propId = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href*='prop_id='], a[href*='Property.aspx']"));
    if (!links.length) return null;
    const href = (links[0] as HTMLAnchorElement).href;
    const m = href.match(/prop_id=(\d+)/i);
    return m ? m[1] : null;
  }) as string | null;

  return propId;
}

// ── Property detail extraction ────────────────────────────────────────────────

interface BcadDetail {
  propId:              string;
  geographicId:        string | null;
  ownerName:           string | null;
  mailingAddress:      string | null;
  mailingCity:         string | null;
  mailingState:        string | null;
  mailingZip:          string | null;
  propertyAddress:     string | null;
  propertyUseCode:     string | null;
  propertyUseDesc:     string | null;
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
  await page.goto(url, { waitUntil: "networkidle2", timeout: 20_000 });

  const fn = new Function(`
    function text(sel) {
      const el = document.querySelector(sel);
      return el ? (el.innerText || el.textContent || "").trim() : null;
    }
    function num(val) {
      if (!val) return null;
      const n = parseFloat(val.replace(/[^0-9.]/g, ""));
      return isNaN(n) ? null : n;
    }

    // Owner info — TrueAutomation typically puts owner in a table with label "Owner"
    const ownerRow = Array.from(document.querySelectorAll("tr, .field-row")).find(
      r => /owner/i.test(r.textContent || "")
    );
    const ownerName = ownerRow
      ? (ownerRow.querySelectorAll("td")[1] || ownerRow.querySelectorAll("td")[0])?.innerText?.trim() || null
      : text("[id*='Owner'], [class*='owner-name']");

    // Geographic ID
    const geoEl = Array.from(document.querySelectorAll("td, span, div")).find(
      el => /geographic/i.test(el.previousSibling?.textContent || el.parentElement?.textContent || "")
    );
    const geographicId = text("[id*='Geographic'], [class*='geo-id']") ||
      (geoEl ? geoEl.textContent?.trim() : null);

    // Property use
    const useEl = Array.from(document.querySelectorAll("td")).find(
      el => /state code|use code|property use/i.test(el.previousElementSibling?.textContent || "")
    );
    const propertyUseCode = useEl ? useEl.textContent?.trim() || null : null;

    // Values — look for appraised value table
    function findValueRow(label) {
      const rows = document.querySelectorAll("tr");
      for (const row of rows) {
        if (new RegExp(label, "i").test(row.textContent || "")) {
          const tds = row.querySelectorAll("td");
          const lastTd = tds[tds.length - 1];
          return lastTd ? lastTd.textContent?.replace(/[^0-9.]/g, "") || null : null;
        }
      }
      return null;
    }

    return {
      geographicId: geographicId || null,
      ownerName: ownerName || null,
      propertyUseCode: propertyUseCode || null,
      land:        num(findValueRow("land")),
      improvement: num(findValueRow("improvement|building")),
      total:       num(findValueRow("total appraised|total value|market value")),
      landAcres:   num(findValueRow("land acres|area.*acres")),
      buildingSqFt: num(findValueRow("building.*sq|sq.*ft|living area")),
      mailingCity:  text("[id*='MailCity'], [class*='mail-city']"),
      mailingState: text("[id*='MailState'], [class*='mail-state']"),
      mailingZip:   text("[id*='MailZip'], [class*='mail-zip']"),
      propertyAddr: text("[id*='SiteAddress'], [id*='PropAddr'], [class*='site-address']"),
      exemption:    text("[id*='Exempt'], [class*='exemption']"),
    };
  `);

  const raw = await page.evaluate(fn as () => Record<string, unknown>);
  if (!raw) return null;

  return {
    propId,
    geographicId:        (raw["geographicId"] as string | null) ?? null,
    ownerName:           (raw["ownerName"] as string | null) ?? null,
    mailingAddress:      null,
    mailingCity:         (raw["mailingCity"] as string | null) ?? null,
    mailingState:        (raw["mailingState"] as string | null) ?? null,
    mailingZip:          (raw["mailingZip"] as string | null) ?? null,
    propertyAddress:     (raw["propertyAddr"] as string | null) ?? null,
    propertyUseCode:     (raw["propertyUseCode"] as string | null) ?? null,
    propertyUseDesc:     null,
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
  // Use BCAD prop ID as primary key (prefixed)
  const id  = `BCAD-${county.toUpperCase()}-${detail.propId}`;

  const existing = await env.DB.prepare(
    "SELECT id FROM properties WHERE id = ?"
  ).bind(id).first<{ id: string }>();

  if (existing) {
    // Update values if they changed
    await env.DB.prepare(`
      UPDATE properties SET
        geographic_id = COALESCE(?, geographic_id),
        total_appraised_value = COALESCE(?, total_appraised_value),
        improvement_value     = COALESCE(?, improvement_value),
        land_value            = COALESCE(?, land_value),
        last_updated = ?
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
      property_use_code, property_use_description, commercial,
      improvement_value, land_value, total_appraised_value,
      land_area_acres, building_area_sq_ft, building_area_sq_m,
      exemption_status, data_source, import_date, last_updated
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, county, detail.geographicId, detail.propertyAddress,
    "San Antonio", "TX",
    detail.propertyUseCode, detail.propertyUseDesc,
    1, // assume commercial (came from OPR appointment)
    detail.improvementValue, detail.landValue, detail.totalAppraisedValue,
    detail.landAreaAcres, detail.buildingAreaSqFt, sqM,
    detail.exemptionStatus, "bcad_enrichment", now, now
  ).run();

  // Insert owner if we have one
  if (detail.ownerName) {
    await env.DB.prepare(`
      INSERT INTO owners (property_id, owner_name, mailing_city, mailing_state, mailing_zip, data_source, import_date, last_updated)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(
      id, detail.ownerName,
      detail.mailingCity, detail.mailingState, detail.mailingZip,
      "bcad_enrichment", now, now
    ).run().catch(() => {}); // owners table may have constraints
  }

  return id;
}

async function linkOprDocument(env: Env, oprDocId: number, propertyId: string): Promise<void> {
  const now = new Date().toISOString();
  // Update existing unmatched link or insert new one
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

// ── Main export ───────────────────────────────────────────────────────────────

export async function enrichUnmatchedDocuments(env: Env): Promise<void> {
  console.log("[bcad-enricher] Starting enrichment");

  // Find recent Bexar OPR documents with no matched property
  const { results: docs } = await env.DB.prepare(`
    SELECT od.id, od.property_address, od.grantor, od.legal_description, od.county
    FROM opr_documents od
    LEFT JOIN opr_property_links opl ON opl.opr_document_id = od.id
    WHERE LOWER(od.county) = 'bexar'
      AND od.property_address IS NOT NULL
      AND od.property_address != ''
      AND (opl.id IS NULL OR opl.property_id IS NULL)
      AND od.import_date >= datetime('now', '-30 days')
    ORDER BY od.import_date DESC
    LIMIT ?
  `).bind(MAX_PER_RUN).all<{
    id: number; property_address: string; grantor: string;
    legal_description: string; county: string;
  }>();

  if (!docs?.length) {
    console.log("[bcad-enricher] No unmatched documents — done");
    return;
  }

  console.log(`[bcad-enricher] Enriching ${docs.length} documents`);

  const browser: Browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    for (const doc of docs) {
      const parsed = parseAddress(doc.property_address);
      if (!parsed) {
        console.log(`[bcad-enricher] doc ${doc.id}: unparseable address "${doc.property_address}"`);
        continue;
      }

      try {
        const propId = await searchProperty(page, parsed.num, parsed.name);
        if (!propId) {
          console.log(`[bcad-enricher] doc ${doc.id}: no match for "${doc.property_address}"`);
          continue;
        }

        const detail = await extractDetail(page, propId);
        if (!detail) {
          console.log(`[bcad-enricher] doc ${doc.id}: could not extract detail for prop ${propId}`);
          continue;
        }

        const propertyId = await upsertProperty(env, detail, doc.county);
        await linkOprDocument(env, doc.id, propertyId);
        console.log(`[bcad-enricher] doc ${doc.id}: linked → property ${propertyId}`);

        // Brief pause between requests to avoid rate limiting
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.error(`[bcad-enricher] doc ${doc.id} failed:`, err);
      }
    }

    await page.close();
  } finally {
    await browser.close();
  }

  console.log("[bcad-enricher] Done");
}
