/**
 * Texas Property Search
 * Cloudflare Worker — main entry point
 *
 * Handles:
 *   fetch    → HTTP API + dashboard
 *   queue    → Async import/export processing
 *   scheduled → Daily retention cleanup
 */

import type { Env, QueueMessage } from "./types";
import { Router } from "./router";
import { handleHealth } from "./handlers/health";
import { handleBcadImport, handleOprImport } from "./handlers/imports";
import { handleGetJob, handleListJobs, handleDownloadJob } from "./handlers/jobs";
import {
  handleSearchProperties,
  handleGetProperty,
  handleUpdateOwnerPhone,
} from "./handlers/properties";
import { handleListCounties, handleAddCounty, handleDeleteCounty } from "./handlers/counties";
import { handleCreateExport } from "./handlers/exports";
import { handleRunScraper, handleDebugScraper } from "./handlers/scrapers";
import { handleAddNote, handleAddCallStatus } from "./handlers/notes";
import { handleQueue } from "./queue/consumer";
import { handleRetention } from "./queue/retention-processor";
import { runScrapers } from "./scrapers/index";
import { DASHBOARD_HTML } from "./dashboard";

// ─── Router setup ─────────────────────────────────────────────────────────────

const router = new Router();

// Health check (unauthenticated)
router.get("/api/health", (req, env) => handleHealth(req, env), true);

// Counties
router.get("/api/counties", handleListCounties);
router.post("/api/counties", handleAddCounty);
router.delete("/api/counties/:county", handleDeleteCounty);

// Imports (admin only, enforced inside handler)
router.post("/api/imports/bcad", handleBcadImport);
router.post("/api/imports/opr", handleOprImport);

// Jobs
router.get("/api/jobs", handleListJobs);
router.get("/api/jobs/:jobId", handleGetJob);
router.get("/api/jobs/:jobId/download", handleDownloadJob);

// Properties
router.get("/api/properties", handleSearchProperties);
router.get("/api/properties/:propertyId", handleGetProperty);

// Notes & call status
router.post("/api/properties/:propertyId/notes", handleAddNote);
router.post("/api/properties/:propertyId/call-status", handleAddCallStatus);
router.post("/api/properties/:propertyId/phone", handleUpdateOwnerPhone);

// Exports (admin only, enforced inside handler)
router.post("/api/exports/commercial-properties", handleCreateExport);

// Manual scraper trigger (admin only, enforced inside handler)
router.post("/api/scrapers/run", handleRunScraper);
router.get("/api/scrapers/debug", handleDebugScraper);

// ─── Fetch handler ────────────────────────────────────────────────────────────

async function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // API routes
  if (url.pathname.startsWith("/api/")) {
    const response = await router.handle(request, env, ctx);
    return addCorsHeaders(response);
  }

  // Dashboard — serve for all non-API GET requests
  if (request.method === "GET") {
    return new Response(DASHBOARD_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

// ─── CORS helpers ─────────────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, CF-Access-Jwt-Assertion, X-User-Email",
    "Access-Control-Max-Age": "86400",
  };
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  if (controller.cron === "0 9 * * *") {
    // Daily at 9 AM UTC (3 AM CT) — scrape yesterday's filings + BCAD enrichment
    ctx.waitUntil(runScrapers(env, "daily"));
  } else if (controller.cron === "0 8 1 * *") {
    // 1st of month at 8 AM UTC — full prior-month catch-up
    ctx.waitUntil(runScrapers(env, "monthly"));
  } else {
    // Default daily cron (0 2 * * *) — retention cleanup
    await handleRetention(controller, env, ctx);
  }
}

export default {
  fetch: handleFetch,
  queue: handleQueue,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env, QueueMessage>;
