/**
 * Property search and detail handlers.
 *
 * PII stripping:
 *  - Owner name and mailing address are only returned for admin users.
 *  - For viewer users these fields are replaced with null.
 *
 * Filtering:
 *  city, commercial, propertyUse, minBuildingSqFt, maxBuildingSqFt,
 *  minBuildingSqM, maxBuildingSqM, minLandAcres, maxLandAcres,
 *  minMarketValue, maxMarketValue, ownerName (admin only),
 *  documentType, recordedAfter, recordedBefore, matchConfidence
 */

import type {
  Env,
  AuthUser,
  PropertyRow,
  OwnerRow,
  ImprovementRow,
  OprDocumentRow,
  OprPropertyLinkRow,
  PropertySearchParams,
} from "../types";
import { canViewPii } from "../auth";
import { jsonOk, jsonError } from "../router";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function stripOwnerPii(owner: OwnerRow | null, viewPii: boolean) {
  if (!owner) return null;
  return {
    id: owner.id,
    property_id: owner.property_id,
    owner_name: viewPii ? owner.owner_name : null,
    mailing_address: viewPii ? owner.mailing_address : null,
    mailing_city: viewPii ? owner.mailing_city : null,
    mailing_state: viewPii ? owner.mailing_state : null,
    mailing_zip: viewPii ? owner.mailing_zip : null,
    do_not_contact: owner.do_not_contact,
    do_not_contact_source: viewPii ? owner.do_not_contact_source : null,
    consent_or_basis_note: viewPii ? owner.consent_or_basis_note : null,
  };
}

function parseSearchParams(url: URL): PropertySearchParams {
  const p = url.searchParams;
  const num = (key: string) => {
    const v = p.get(key);
    return v !== null && v !== "" ? parseFloat(v) : undefined;
  };
  return {
    city: p.get("city") ?? undefined,
    commercial: p.has("commercial")
      ? p.get("commercial") === "true" || p.get("commercial") === "1"
      : undefined,
    propertyUse: p.get("propertyUse") ?? undefined,
    minBuildingSqFt: num("minBuildingSqFt"),
    maxBuildingSqFt: num("maxBuildingSqFt"),
    minBuildingSqM: num("minBuildingSqM"),
    maxBuildingSqM: num("maxBuildingSqM"),
    minLandAcres: num("minLandAcres"),
    maxLandAcres: num("maxLandAcres"),
    minMarketValue: num("minMarketValue"),
    maxMarketValue: num("maxMarketValue"),
    ownerName: p.get("ownerName") ?? undefined,
    documentType: p.get("documentType") ?? undefined,
    recordedAfter: p.get("recordedAfter") ?? undefined,
    recordedBefore: p.get("recordedBefore") ?? undefined,
    matchConfidence: (p.get("matchConfidence") as PropertySearchParams["matchConfidence"]) ?? undefined,
    limit: Math.min(num("limit") ?? 50, 200),
    offset: num("offset") ?? 0,
  };
}

// ─── GET /api/properties ──────────────────────────────────────────────────────

export async function handleSearchProperties(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const url = new URL(request.url);
  const search = parseSearchParams(url);
  const viewPii = canViewPii(user);

  // ownerName filter is only allowed for admin
  if (search.ownerName && !viewPii) {
    return jsonError("ownerName filter requires admin role", 403);
  }

  // Convert sqM filters to sqFt for DB query
  // (DB stores sqFt; sqM filters are transparently converted)
  const minSqFt =
    search.minBuildingSqFt ??
    (search.minBuildingSqM !== undefined
      ? search.minBuildingSqM / 0.092903
      : undefined);
  const maxSqFt =
    search.maxBuildingSqFt ??
    (search.maxBuildingSqM !== undefined
      ? search.maxBuildingSqM / 0.092903
      : undefined);

  // Build dynamic query
  const conditions: string[] = [];
  const bindings: (string | number | boolean)[] = [];

  if (search.city) {
    conditions.push("UPPER(p.city) = UPPER(?)");
    bindings.push(search.city);
  }
  if (search.commercial !== undefined) {
    conditions.push("p.commercial = ?");
    bindings.push(search.commercial ? 1 : 0);
  }
  if (search.propertyUse) {
    conditions.push(
      "(UPPER(p.property_use_code) = UPPER(?) OR UPPER(p.property_use_description) LIKE UPPER(?))"
    );
    bindings.push(search.propertyUse, `%${search.propertyUse}%`);
  }
  if (minSqFt !== undefined) {
    conditions.push("p.building_area_sq_ft >= ?");
    bindings.push(minSqFt);
  }
  if (maxSqFt !== undefined) {
    conditions.push("p.building_area_sq_ft <= ?");
    bindings.push(maxSqFt);
  }
  if (search.minLandAcres !== undefined) {
    conditions.push("p.land_area_acres >= ?");
    bindings.push(search.minLandAcres);
  }
  if (search.maxLandAcres !== undefined) {
    conditions.push("p.land_area_acres <= ?");
    bindings.push(search.maxLandAcres);
  }
  if (search.minMarketValue !== undefined) {
    conditions.push("p.total_appraised_value >= ?");
    bindings.push(search.minMarketValue);
  }
  if (search.maxMarketValue !== undefined) {
    conditions.push("p.total_appraised_value <= ?");
    bindings.push(search.maxMarketValue);
  }

  // OPR-based filters require a JOIN
  let oprJoin = "";
  let oprCountJoin = "";
  if (search.documentType || search.recordedAfter || search.recordedBefore || search.matchConfidence) {
    oprJoin =
      "LEFT JOIN opr_property_links opl ON opl.property_id = p.id " +
      "LEFT JOIN opr_documents opr ON opr.id = opl.opr_document_id";
    oprCountJoin = oprJoin;

    if (search.documentType) {
      conditions.push("UPPER(opr.document_type) LIKE UPPER(?)");
      bindings.push(`%${search.documentType}%`);
    }
    if (search.recordedAfter) {
      conditions.push("opr.recording_date >= ?");
      bindings.push(search.recordedAfter);
    }
    if (search.recordedBefore) {
      conditions.push("opr.recording_date <= ?");
      bindings.push(search.recordedBefore);
    }
    if (search.matchConfidence) {
      conditions.push("opl.match_confidence = ?");
      bindings.push(search.matchConfidence);
    }
  }

  // ownerName filter requires JOIN to owners
  let ownerJoin = "";
  if (search.ownerName) {
    ownerJoin = "JOIN owners o ON o.property_id = p.id";
    conditions.push("UPPER(o.owner_name) LIKE UPPER(?)");
    bindings.push(`%${search.ownerName}%`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total for pagination
  const countQuery = `
    SELECT COUNT(DISTINCT p.id) AS total
    FROM properties p
    ${ownerJoin}
    ${oprCountJoin}
    ${whereClause}
  `;

  const countResult = await env.DB.prepare(countQuery)
    .bind(...bindings)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  // Fetch page
  const dataQuery = `
    SELECT DISTINCT p.*
    FROM properties p
    ${ownerJoin}
    ${oprJoin}
    ${whereClause}
    ORDER BY p.id
    LIMIT ? OFFSET ?
  `;

  const dataResult = await env.DB.prepare(dataQuery)
    .bind(...bindings, search.limit ?? 50, search.offset ?? 0)
    .all<PropertyRow>();

  const properties = dataResult.results ?? [];

  // For each property, get owner (PII-stripped if needed)
  const propertyIds = properties.map((p) => p.id);
  let owners: OwnerRow[] = [];
  if (propertyIds.length > 0) {
    const placeholders = propertyIds.map(() => "?").join(",");
    const ownerResult = await env.DB.prepare(
      `SELECT * FROM owners WHERE property_id IN (${placeholders})`
    )
      .bind(...propertyIds)
      .all<OwnerRow>();
    owners = ownerResult.results ?? [];
  }
  const ownerByPropId = new Map(owners.map((o) => [o.property_id, o]));

  const responseItems = properties.map((p) => ({
    ...p,
    owner: stripOwnerPii(ownerByPropId.get(p.id) ?? null, viewPii),
  }));

  return jsonOk({
    total,
    limit: search.limit ?? 50,
    offset: search.offset ?? 0,
    properties: responseItems,
  });
}

// ─── GET /api/properties/:propertyId ─────────────────────────────────────────

export async function handleGetProperty(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const { propertyId } = params;
  if (!propertyId) return jsonError("Missing propertyId", 400);
  const viewPii = canViewPii(user);

  const property = await env.DB.prepare(
    "SELECT * FROM properties WHERE id = ?"
  )
    .bind(propertyId)
    .first<PropertyRow>();

  if (!property) return jsonError("Property not found", 404);

  // Owner
  const owner = await env.DB.prepare(
    "SELECT * FROM owners WHERE property_id = ? LIMIT 1"
  )
    .bind(propertyId)
    .first<OwnerRow>();

  // Improvements
  const improvementsResult = await env.DB.prepare(
    "SELECT * FROM property_improvements WHERE property_id = ?"
  )
    .bind(propertyId)
    .all<ImprovementRow>();

  // OPR links with documents
  const oprResult = await env.DB.prepare(
    `SELECT opr.*, opl.match_confidence, opl.id AS link_id
     FROM opr_property_links opl
     JOIN opr_documents opr ON opr.id = opl.opr_document_id
     WHERE opl.property_id = ?
     ORDER BY opr.recording_date DESC`
  )
    .bind(propertyId)
    .all<OprDocumentRow & { match_confidence: string; link_id: number }>();

  // Notes
  const notesResult = await env.DB.prepare(
    "SELECT * FROM property_notes WHERE property_id = ? ORDER BY created_at DESC"
  )
    .bind(propertyId)
    .all();

  // Call status history
  const statusResult = await env.DB.prepare(
    "SELECT * FROM call_status WHERE property_id = ? ORDER BY changed_at DESC"
  )
    .bind(propertyId)
    .all();

  // Current call status (most recent)
  const currentStatus =
    statusResult.results && statusResult.results.length > 0
      ? (statusResult.results[0] as { status: string }).status
      : null;

  return jsonOk({
    property,
    owner: stripOwnerPii(owner ?? null, viewPii),
    improvements: improvementsResult.results ?? [],
    oprHistory: oprResult.results ?? [],
    notes: notesResult.results ?? [],
    callStatus: {
      current: currentStatus,
      history: statusResult.results ?? [],
    },
  });
}
