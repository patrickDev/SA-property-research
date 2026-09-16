/**
 * Leads handler — surfaces OPR foreclosure documents as actionable leads.
 *
 * Unlike /api/properties (which requires BCAD import), /api/leads works
 * immediately from OPR scrape results. Each lead is an OPR document
 * (LIS PENDENS, APPOINTMENT, NOTICE) with grantor/grantee info.
 *
 * GET /api/leads
 *   ?county=bexar
 *   ?documentType=LIS   (prefix match: LIS PENDENS, APPOINTMENT, NOTICE, SUBSTITUTION)
 *   ?matched=true|false (true = linked to a BCAD property, false = unmatched)
 *   ?from=YYYY-MM-DD    (recording_date >=)
 *   ?to=YYYY-MM-DD      (recording_date <=)
 *   ?limit=50&offset=0
 */

import type { Env, AuthUser } from "../types";
import { jsonOk } from "../router";

export async function handleListLeads(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  _user: AuthUser
): Promise<Response> {
  const url    = new URL(request.url);
  const p      = url.searchParams;

  const county      = p.get("county")       ?? undefined;
  const docType     = p.get("documentType") ?? undefined;
  const matched     = p.has("matched") ? p.get("matched") === "true" : undefined;
  const from        = p.get("from")         ?? undefined;
  const to          = p.get("to")           ?? undefined;
  const limit       = Math.min(parseInt(p.get("limit")  ?? "50"),  200);
  const offset      = parseInt(p.get("offset") ?? "0");

  const conditions: string[] = [];
  const bindings:   (string | number)[] = [];

  if (county) {
    conditions.push("UPPER(od.county) = UPPER(?)");
    bindings.push(county);
  }
  if (docType) {
    conditions.push("UPPER(od.document_type) LIKE UPPER(?)");
    bindings.push(`${docType}%`);
  }
  if (from) {
    conditions.push("od.recording_date >= ?");
    bindings.push(from);
  }
  if (to) {
    conditions.push("od.recording_date <= ?");
    bindings.push(to);
  }
  if (matched === true) {
    conditions.push("opl.property_id IS NOT NULL");
  } else if (matched === false) {
    conditions.push("(opl.id IS NULL OR opl.property_id IS NULL)");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT od.id) AS total
    FROM opr_documents od
    LEFT JOIN opr_property_links opl ON opl.opr_document_id = od.id
    ${where}
  `).bind(...bindings).first<{ total: number }>();

  const total = countRow?.total ?? 0;

  const rows = await env.DB.prepare(`
    SELECT
      od.id,
      od.county,
      od.document_number,
      od.recording_date,
      od.document_type,
      od.grantor,
      od.grantee,
      od.loan_amount,
      od.legal_description,
      od.property_address,
      od.import_date,
      opl.property_id,
      opl.match_confidence,
      p.property_address  AS bcad_address,
      p.city              AS bcad_city,
      p.total_appraised_value,
      o.owner_name,
      o.mailing_address,
      o.mailing_city,
      o.mailing_state,
      o.mailing_zip,
      o.phone
    FROM opr_documents od
    LEFT JOIN opr_property_links opl ON opl.opr_document_id = od.id
    LEFT JOIN properties p           ON p.id = opl.property_id
    LEFT JOIN owners o               ON o.property_id = p.id
    ${where}
    ORDER BY od.recording_date DESC, od.id DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset).all<Record<string, unknown>>();

  return jsonOk({
    total,
    limit,
    offset,
    leads: rows.results ?? [],
  });
}
