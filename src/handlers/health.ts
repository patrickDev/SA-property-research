import type { Env } from "../types";
import { jsonOk } from "../router";

export async function handleHealth(
  _request: Request,
  env: Env
): Promise<Response> {
  // Probe D1 availability
  let dbOk = false;
  try {
    await env.DB.prepare("SELECT 1").run();
    dbOk = true;
  } catch {
    // DB not ready
  }

  const body = {
    status: dbOk ? "ok" : "degraded",
    db: dbOk ? "ok" : "unavailable",
    timestamp: new Date().toISOString(),
  };

  return jsonOk(body, dbOk ? 200 : 503);
}
