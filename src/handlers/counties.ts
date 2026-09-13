/**
 * County configuration handlers.
 * GET /api/counties        — list all configured counties with live stats
 * POST /api/counties       — add a new county (admin only)
 * DELETE /api/counties/:name — remove a county config (admin only, data preserved)
 */

import type { Env, AuthUser } from "../types";
import { requireAdmin } from "../auth";
import { jsonOk, jsonError } from "../router";

interface CountyConfig {
  id: number;
  name: string;
  display_name: string;
  city: string | null;
  state: string;
  bcad_url: string | null;
  opr_url: string | null;
  active: number;
  created_at: string;
}

// ─── GET /api/counties ────────────────────────────────────────────────────────

export async function handleListCounties(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  _user: AuthUser
): Promise<Response> {
  // All configured counties with property stats in one query
  const countiesResult = await env.DB.prepare(`
    SELECT
      c.id, c.name, c.display_name, c.city, c.state,
      c.bcad_url, c.opr_url, c.active, c.created_at,
      COUNT(DISTINCT p.id)                                          AS total_properties,
      COALESCE(SUM(CASE WHEN p.commercial = 1 THEN 1 ELSE 0 END),0) AS commercial_properties,
      COALESCE(SUM(p.total_appraised_value), 0)                    AS total_appraised_value,
      MAX(p.import_date)                                            AS last_bcad_import
    FROM county_configs c
    LEFT JOIN properties p ON UPPER(p.county) = UPPER(c.name)
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all<CountyConfig & {
    total_properties: number;
    commercial_properties: number;
    total_appraised_value: number;
    last_bcad_import: string | null;
  }>();

  // OPR import dates per county (separate query — opr_documents table)
  const oprResult = await env.DB.prepare(`
    SELECT UPPER(county) AS county_upper, MAX(import_date) AS last_opr_import
    FROM opr_documents
    GROUP BY UPPER(county)
  `).all<{ county_upper: string; last_opr_import: string }>();

  const oprMap = new Map(
    (oprResult.results ?? []).map((r) => [r.county_upper, r.last_opr_import])
  );

  const counties = (countiesResult.results ?? []).map((c) => ({
    ...c,
    last_opr_import: oprMap.get(c.name.toUpperCase()) ?? null,
  }));

  // Global totals across all counties
  const totals = counties.reduce(
    (acc, c) => ({
      total_properties: acc.total_properties + (c.total_properties ?? 0),
      commercial_properties: acc.commercial_properties + (c.commercial_properties ?? 0),
      total_appraised_value: acc.total_appraised_value + (c.total_appraised_value ?? 0),
    }),
    { total_properties: 0, commercial_properties: 0, total_appraised_value: 0 }
  );

  return jsonOk({ counties, totals });
}

// ─── POST /api/counties ───────────────────────────────────────────────────────

export async function handleAddCounty(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  _params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;

  let body: {
    name?: string;
    display_name?: string;
    city?: string;
    state?: string;
    bcad_url?: string;
    opr_url?: string;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const name = body.name?.trim();
  if (!name) return jsonError("County name is required", 400);

  const display_name = body.display_name?.trim() || `${name} County`;
  const city = body.city?.trim() || null;
  const state = body.state?.trim() || "TX";
  const bcad_url = body.bcad_url?.trim() || null;
  const opr_url = body.opr_url?.trim() || null;
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(`
      INSERT INTO county_configs (name, display_name, city, state, bcad_url, opr_url, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(name, display_name, city, state, bcad_url, opr_url, now).run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      return jsonError(`County "${name}" is already configured`, 409);
    }
    throw err;
  }

  return jsonOk({ name, display_name, city, state }, 201);
}

// ─── DELETE /api/counties/:county ────────────────────────────────────────────

export async function handleDeleteCounty(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;

  const { county } = params;
  if (!county) return jsonError("Missing county name", 400);

  await env.DB.prepare("DELETE FROM county_configs WHERE UPPER(name) = UPPER(?)")
    .bind(county)
    .run();

  return jsonOk({ deleted: county });
}
