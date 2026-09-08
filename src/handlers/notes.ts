/**
 * Property notes and call-status handlers.
 *
 * POST /api/properties/:propertyId/notes
 * POST /api/properties/:propertyId/call-status
 *
 * Every write records the authenticated user's identity and a timestamp.
 * If APP_USAGE_MODE = outreach and the owner has do_not_contact = 1,
 * creating a "Contacted" status entry is blocked.
 */

import type { Env, AuthUser, CallStatusValue, OwnerRow } from "../types";
import { CALL_STATUS_VALUES } from "../types";
import { jsonOk, jsonError } from "../router";

/** POST /api/properties/:propertyId/notes */
export async function handleAddNote(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const { propertyId } = params;
  if (!propertyId) return jsonError("Missing propertyId", 400);

  let body: { note?: string };
  try {
    body = (await request.json()) as { note?: string };
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const note = body.note?.trim();
  if (!note) return jsonError('"note" field is required', 400);

  // Verify property exists
  const exists = await env.DB.prepare(
    "SELECT id FROM properties WHERE id = ?"
  )
    .bind(propertyId)
    .first<{ id: string }>();
  if (!exists) return jsonError("Property not found", 404);

  const now = new Date().toISOString();

  // Ensure user row exists (needed for FK constraint)
  await ensureUserExists(env, user, now);

  await env.DB.prepare(
    `INSERT INTO property_notes (property_id, note, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(propertyId, note, user.id, now)
    .run();

  return jsonOk({ message: "Note added", propertyId, note, createdAt: now }, 201);
}

/** POST /api/properties/:propertyId/call-status */
export async function handleAddCallStatus(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  params: Record<string, string>,
  user: AuthUser
): Promise<Response> {
  const { propertyId } = params;
  if (!propertyId) return jsonError("Missing propertyId", 400);

  let body: { status?: string; note?: string };
  try {
    body = (await request.json()) as { status?: string; note?: string };
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const status = body.status as CallStatusValue | undefined;
  if (!status || !(CALL_STATUS_VALUES as readonly string[]).includes(status)) {
    return jsonError(
      `"status" must be one of: ${CALL_STATUS_VALUES.join(", ")}`,
      400
    );
  }

  // Verify property exists
  const exists = await env.DB.prepare(
    "SELECT id FROM properties WHERE id = ?"
  )
    .bind(propertyId)
    .first<{ id: string }>();
  if (!exists) return jsonError("Property not found", 404);

  // Outreach mode: block "Contacted" if do_not_contact = 1
  if (env.APP_USAGE_MODE === "outreach" && status === "Contacted") {
    const owner = await env.DB.prepare(
      "SELECT do_not_contact FROM owners WHERE property_id = ? LIMIT 1"
    )
      .bind(propertyId)
      .first<Pick<OwnerRow, "do_not_contact">>();

    if (owner?.do_not_contact === 1) {
      return jsonError(
        'Cannot set status to "Contacted": owner is marked Do Not Contact',
        409
      );
    }
  }

  const now = new Date().toISOString();

  // Ensure user row exists (FK constraint)
  await ensureUserExists(env, user, now);

  await env.DB.prepare(
    `INSERT INTO call_status (property_id, status, note, changed_by_user_id, changed_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(propertyId, status, body.note?.trim() ?? null, user.id, now)
    .run();

  return jsonOk(
    { message: "Call status updated", propertyId, status, changedAt: now },
    201
  );
}

/** Upsert user row so FK constraints don't fail when auth is in dev mode. */
async function ensureUserExists(
  env: Env,
  user: AuthUser,
  now: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, email, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`
  )
    .bind(user.id, user.email, user.role, now)
    .run();
}
