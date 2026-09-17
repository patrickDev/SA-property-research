/**
 * BCAD Enricher — Bexar County OPR-driven property enrichment
 *
 * After OPR documents are imported, this enricher looks up each unmatched
 * document on the TrueAutomation portal (propaccess.trueautomation.com)
 * to retrieve full BCAD property data: owner, appraised value, use code.
 *
 * Uses plain fetch() (no Browser Rendering) to avoid quota limits.
 * TrueAutomation is a server-rendered ASP.NET app — no JS needed.
 *
 * Search strategy:
 *  1. For LIS PENDENS / NOTICE: grantor = property owner → search by owner name
 *  2. For APPOINTMENT / SUBSTITUTION: grantor = lender → search by grantor anyway
 *     (may not match, but worth trying)
 *
 * Processes up to MAX_PER_RUN documents per call.
 */

import type { Env } from "../types";

const BASE_URL    = "https://propaccess.trueautomation.com/clientdb";
const CID         = "110";
const MAX_PER_RUN = 15;

// ── ASP.NET ViewState / form helpers ──────────────────────────────────────────

/** Extract a hidden form field value from HTML */
function extractHidden(html: string, name: string): string {
  const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, "i"))
           ?? html.match(new RegExp(`value="([^"]*)"[^>]*name="${name}"`, "i"));
  return m ? m[1]! : "";
}

/** Parse the first prop_id link from a results page */
function extractPropId(html: string): string | null {
  const m = html.match(/prop_id=(\d+)/i);
  return m ? m[1]! : null;
}


function parseNum(val: string | null): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

// ── TrueAutomation search (fetch-based) ───────────────────────────────────────

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

/** Parse Set-Cookie headers into a Cookie request header string (name=value pairs only) */
function parseCookies(resp: Response): string {
  // getSetCookie() returns each Set-Cookie as a separate entry
  const setCookieHeaders: string[] = (resp.headers as any).getSetCookie?.() ?? [];
  if (setCookieHeaders.length) {
    return setCookieHeaders.map(h => h.split(";")[0]!.trim()).join("; ");
  }
  // Fallback: single get() returns comma-joined values
  const raw = resp.headers.get("set-cookie") ?? "";
  return raw.split(",").map(h => h.split(";")[0]!.trim()).join("; ");
}

/** Load the search page and return { html, cookies, viewState, eventValidation } */
async function loadSearchPage(): Promise<{
  html: string;
  cookies: string;
  viewState: string;
  eventValidation: string;
}> {
  // Load the search page directly to get correct ViewState
  const resp = await fetch(`${BASE_URL}/propertysearch.aspx?cid=${CID}`, { headers: HEADERS });
  const html = await resp.text();
  const cookies = parseCookies(resp);
  return {
    html,
    cookies,
    viewState:       extractHidden(html, "__VIEWSTATE"),
    eventValidation: extractHidden(html, "__EVENTVALIDATION"),
  };
}

/** Search by owner name, return first prop_id or null */
async function searchByOwnerName(ownerName: string): Promise<string | null> {
  const page = await loadSearchPage();

  // Use quick search (searchText) — the Advanced ownerName form requires a separate postback to activate
  const body = new URLSearchParams({
    "__EVENTTARGET":                       "",
    "__EVENTARGUMENT":                     "",
    "__VIEWSTATE":                         page.viewState,
    "__EVENTVALIDATION":                   page.eventValidation,
    "propertySearchOptions:searchText":    ownerName,
    "propertySearchOptions:search":        "Search",
    "propertySearchOptions:taxyear":       String(new Date().getFullYear()),
    "propertySearchOptions:propertyType":  "R",
  });

  const resp = await fetch(`${BASE_URL}/propertysearch.aspx?cid=${CID}`, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": page.cookies,
      "Referer": `${BASE_URL}/propertysearch.aspx?cid=${CID}`,
    },
    body: body.toString(),
  });

  const html = await resp.text();
  return extractPropId(html);
}

// ── Property detail extraction (fetch-based) ──────────────────────────────────

interface BcadDetail {
  propId:              string;
  geographicId:        string | null;
  ownerName:           string | null;
  mailingAddress:      string | null;
  mailingCity:         string | null;
  mailingState:        string | null;
  mailingZip:          string | null;
  phone:               string | null;
  propertyAddress:     string | null;
  propertyUseCode:     string | null;
  landValue:           number | null;
  improvementValue:    number | null;
  totalAppraisedValue: number | null;
  landAreaAcres:       number | null;
  buildingAreaSqFt:    number | null;
  exemptionStatus:     string | null;
}

async function fetchDetail(propId: string): Promise<BcadDetail | null> {
  const year = new Date().getFullYear();
  const url  = `${BASE_URL}/Property.aspx?prop_id=${propId}&cid=${CID}&year=${year}`;
  const resp = await fetch(url, { headers: HEADERS });
  const html = await resp.text();

  if (!html.includes("prop_id")) return null;

  // Match <td>LABEL</td><td>VALUE</td> — handles values with inner HTML tags like <BR>
  const tdVal = (label: string): string | null => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = html.match(new RegExp(`<td[^>]*>\\s*${escaped}\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]{0,500}?)<\\/td>`, "i"));
    if (!m) return null;
    return m[1]!
      .replace(/<BR\s*\/?>/gi, " | ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim() || null;
  };

  // Currency value after a label: finds <td class="currency">$VALUE</td>
  const currencyAfter = (label: string): number | null => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = html.match(new RegExp(`${escaped}[\\s\\S]{0,400}?<td[^>]*class="currency"[^>]*>([^<]{1,50})<\\/td>`, "i"));
    return m ? parseNum(m[1]!) : null;
  };

  // Owner name: <td>Name:</td><td>VALUE</td>
  const ownerName = tdVal("Name:");

  // Mailing address: <td>Mailing Address:</td><td>STREET <BR> CITY, STATE ZIP</td>
  const mailingRaw = tdVal("Mailing Address:");
  let mailingAddress: string | null = null;
  let mailingCity: string | null = null;
  let mailingState: string | null = null;
  let mailingZip: string | null = null;
  if (mailingRaw) {
    const parts = mailingRaw.split("|").map(s => s.trim());
    mailingAddress = parts[0] || null;
    const cityPart = parts[1] ?? "";
    const cityStateZip = cityPart.match(/^(.*?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (cityStateZip) {
      mailingCity  = cityStateZip[1]!.trim() || null;
      mailingState = cityStateZip[2]!.trim() || null;
      mailingZip   = cityStateZip[3]!.trim() || null;
    } else {
      mailingCity = cityPart || null;
    }
  }

  // Physical address: <td>Address:</td><td>STREET <BR> CITY, STATE ZIP</td>
  const addrRaw = tdVal("Address:");
  let propertyAddress: string | null = null;
  if (addrRaw) {
    const parts = addrRaw.split("|").map(s => s.trim());
    propertyAddress = parts[0] || null; // just the street portion
  }

  return {
    propId,
    geographicId:        tdVal("Geographic ID:"),
    ownerName,
    mailingAddress,
    mailingCity,
    mailingState,
    mailingZip,
    phone:               tdVal("Phone:"),
    propertyAddress,
    propertyUseCode:     tdVal("Property Use Code:") ?? tdVal("Property Use Description:"),
    landValue:           currencyAfter("Land Homesite Value"),
    improvementValue:    currencyAfter("Improvement Homesite Value"),
    totalAppraisedValue: currencyAfter("Appraised Value") ?? currencyAfter("Market Value"),
    landAreaAcres:       parseNum(tdVal("Land Acres:") ?? tdVal("Acres:")),
    buildingAreaSqFt:    parseNum(tdVal("Building Area:") ?? tdVal("Sq Ft:")),
    exemptionStatus:     tdVal("Exemptions:"),
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
        property_address      = COALESCE(?, property_address),
        property_use_code     = COALESCE(?, property_use_code),
        total_appraised_value = COALESCE(?, total_appraised_value),
        improvement_value     = COALESCE(?, improvement_value),
        land_value            = COALESCE(?, land_value),
        last_updated          = ?
      WHERE id = ?
    `).bind(
      detail.geographicId, detail.propertyAddress, detail.propertyUseCode,
      detail.totalAppraisedValue, detail.improvementValue, detail.landValue, now, id
    ).run();
    // Update owner with fresh data (overwrite NULLs, preserve manually-set phone)
    if (detail.ownerName) {
      await env.DB.prepare(`
        UPDATE owners SET
          owner_name      = ?,
          mailing_address = COALESCE(?, mailing_address),
          mailing_city    = COALESCE(?, mailing_city),
          mailing_state   = COALESCE(?, mailing_state),
          mailing_zip     = COALESCE(?, mailing_zip),
          phone           = COALESCE(phone, ?),
          last_updated    = ?
        WHERE property_id = ?
      `).bind(
        detail.ownerName,
        detail.mailingAddress, detail.mailingCity, detail.mailingState,
        detail.mailingZip, detail.phone, now, id
      ).run().catch(() => {});
    }
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
      INSERT INTO owners (property_id, owner_name, mailing_address, mailing_city, mailing_state, mailing_zip,
                          phone, data_source, import_date, last_updated)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, detail.ownerName,
      detail.mailingAddress, detail.mailingCity, detail.mailingState, detail.mailingZip,
      detail.phone,
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

// ── Main export ───────────────────────────────────────────────────────────────

export async function enrichUnmatchedDocuments(
  env: Env
): Promise<{ enriched: number; failed: number; skipped: number }> {
  console.log("[bcad-enricher] Starting fetch-based enrichment");

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

  let enriched = 0;
  let failed   = 0;
  let skipped  = 0;

  for (const doc of docs) {
    try {
      // Pick best search name: grantor for LIS/NOTICE (= property owner), else grantor or grantee
      const name = doc.grantor || doc.grantee;
      if (!name) {
        skipped++;
        continue;
      }

      const propId = await searchByOwnerName(name);
      if (!propId) {
        console.log(`[bcad-enricher] doc ${doc.id}: no BCAD match for "${name}"`);
        failed++;
        continue;
      }

      const detail = await fetchDetail(propId);
      if (!detail) {
        console.log(`[bcad-enricher] doc ${doc.id}: could not fetch detail for prop ${propId}`);
        failed++;
        continue;
      }

      const propertyId = await upsertProperty(env, detail, doc.county);
      await linkOprDocument(env, doc.id, propertyId);
      enriched++;
      console.log(`[bcad-enricher] doc ${doc.id}: linked → ${propertyId} (owner: ${detail.ownerName})`);

      // Brief pause to be polite to the BCAD portal
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`[bcad-enricher] doc ${doc.id} failed:`, err);
      failed++;
    }
  }

  console.log(`[bcad-enricher] Done — enriched: ${enriched}, failed: ${failed}, skipped: ${skipped}`);
  return { enriched, failed, skipped };
}
