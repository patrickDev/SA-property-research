/**
 * Integration tests for all API endpoints.
 *
 * Runs in the @cloudflare/vitest-pool-workers environment:
 *  - SELF.fetch dispatches through the full Worker (router → auth → handler)
 *  - env.DB is a fresh Miniflare D1 instance per test run
 *  - Dev-mode auth: no CF_ACCESS_TEAM_DOMAIN set → X-User-Email header accepted
 */

import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import migrationSql from "../db/migrations/0001_initial.sql?raw";

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEWER_EMAIL = "viewer@test.com";
const ADMIN_EMAIL = "admin@test.com";
const PROP_ID = "TEST-PROP-001";
const JOB_ID = "test-job-001";
const NOW = new Date().toISOString();

// ─── Request helpers ──────────────────────────────────────────────────────────

function get(path: string, email?: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: email ? { "X-User-Email": email } : {},
  });
}

function post(path: string, email: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "X-User-Email": email,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Apply DB schema. Miniflare exec() splits on newlines (not semicolons), so we
  // strip line comments, split on semicolons ourselves, and use batch() instead.
  const stmts = migrationSql
    .replace(/--[^\n]*/g, "")   // strip line comments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => env.DB.prepare(s));
  await env.DB.batch(stmts);

  // Seed admin user (must exist before first request so role is 'admin')
  await env.DB.prepare(
    `INSERT INTO users (id, email, role, created_at) VALUES (?, ?, 'admin', ?)`
  )
    .bind("admin-uid", ADMIN_EMAIL, NOW)
    .run();

  // Seed a commercial property
  await env.DB.prepare(
    `INSERT INTO properties
       (id, property_address, city, zip_code, commercial,
        improvement_value, land_value, total_appraised_value,
        data_source, import_date, last_updated)
     VALUES (?, '123 Main St', 'San Antonio', '78201', 1,
             500000, 100000, 600000, 'test', ?, ?)`
  )
    .bind(PROP_ID, NOW, NOW)
    .run();

  // Seed owner for that property
  await env.DB.prepare(
    `INSERT INTO owners
       (property_id, owner_name, mailing_address, mailing_city,
        mailing_state, mailing_zip, data_source, import_date, last_updated)
     VALUES (?, 'John Doe', '456 Oak Ave', 'San Antonio', 'TX', '78201', 'test', ?, ?)`
  )
    .bind(PROP_ID, NOW, NOW)
    .run();

  // Seed a completed import job
  await env.DB.prepare(
    `INSERT INTO import_jobs
       (id, job_type, status, total_records, processed_records,
        failed_records, errors, created_at, updated_at)
     VALUES (?, 'bcad_import', 'completed', 10, 10, 0, '[]', ?, ?)`
  )
    .bind(JOB_ID, NOW, NOW)
    .run();
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

describe("GET /", () => {
  it("serves the dashboard HTML", async () => {
    const res = await SELF.fetch(get("/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("<!DOCTYPE html>");
  });
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 with status ok when DB is available", async () => {
    const res = await SELF.fetch(get("/api/health"));
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; db: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
  });

  it("does not require authentication", async () => {
    // No email header — should still succeed (public route)
    const res = await SELF.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
  });
});

// ─── Authentication ───────────────────────────────────────────────────────────

describe("Authentication", () => {
  it("returns 401 with no credentials on a protected route", async () => {
    const res = await SELF.fetch(get("/api/properties"));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Unauthorized");
  });

  it("accepts X-User-Email header in dev mode", async () => {
    const res = await SELF.fetch(get("/api/properties", VIEWER_EMAIL));
    expect(res.status).toBe(200);
  });
});

// ─── Properties list ──────────────────────────────────────────────────────────

describe("GET /api/properties", () => {
  it("returns paginated result shape", async () => {
    const res = await SELF.fetch(get("/api/properties", VIEWER_EMAIL));
    expect(res.status).toBe(200);
    const body = await res.json() as {
      total: number;
      limit: number;
      offset: number;
      properties: unknown[];
    };
    expect(typeof body.total).toBe("number");
    expect(typeof body.limit).toBe("number");
    expect(typeof body.offset).toBe("number");
    expect(Array.isArray(body.properties)).toBe(true);
  });

  it("includes seeded property in results", async () => {
    const res = await SELF.fetch(get("/api/properties", VIEWER_EMAIL));
    const body = await res.json() as { properties: Array<{ id: string }> };
    const ids = body.properties.map((p) => p.id);
    expect(ids).toContain(PROP_ID);
  });

  it("strips owner PII (owner_name = null) for viewer role", async () => {
    const res = await SELF.fetch(get("/api/properties", VIEWER_EMAIL));
    const body = await res.json() as {
      properties: Array<{ owner: { owner_name: string | null } | null }>;
    };
    const prop = body.properties.find((p: { id?: string }) => p.id === PROP_ID);
    expect(prop?.owner).not.toBeNull();
    expect(prop?.owner?.owner_name).toBeNull();
  });

  it("returns owner PII for admin role", async () => {
    const res = await SELF.fetch(get("/api/properties", ADMIN_EMAIL));
    const body = await res.json() as {
      properties: Array<{ id: string; owner: { owner_name: string | null } | null }>;
    };
    const prop = body.properties.find((p) => p.id === PROP_ID);
    expect(prop?.owner?.owner_name).toBe("John Doe");
  });

  it("filters by commercial=true", async () => {
    const res = await SELF.fetch(
      get("/api/properties?commercial=true", VIEWER_EMAIL)
    );
    const body = await res.json() as { properties: Array<{ commercial: number }> };
    expect(body.properties.length).toBeGreaterThan(0);
    expect(body.properties.every((p) => p.commercial === 1)).toBe(true);
  });

  it("filters by commercial=false returns no results (none seeded)", async () => {
    const res = await SELF.fetch(
      get("/api/properties?commercial=false", VIEWER_EMAIL)
    );
    const body = await res.json() as { properties: unknown[]; total: number };
    expect(body.total).toBe(0);
  });

  it("filters by city (case-insensitive)", async () => {
    const res = await SELF.fetch(
      get("/api/properties?city=san+antonio", VIEWER_EMAIL)
    );
    const body = await res.json() as { total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it("returns 403 when viewer uses ownerName filter", async () => {
    const res = await SELF.fetch(
      get("/api/properties?ownerName=John", VIEWER_EMAIL)
    );
    expect(res.status).toBe(403);
  });

  it("allows admin to use ownerName filter", async () => {
    const res = await SELF.fetch(
      get("/api/properties?ownerName=John", ADMIN_EMAIL)
    );
    expect(res.status).toBe(200);
  });

  it("respects limit and offset pagination params", async () => {
    const res = await SELF.fetch(
      get("/api/properties?limit=1&offset=0", VIEWER_EMAIL)
    );
    const body = await res.json() as { limit: number; offset: number; properties: unknown[] };
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(0);
    expect(body.properties.length).toBeLessThanOrEqual(1);
  });
});

// ─── Property detail ──────────────────────────────────────────────────────────

describe("GET /api/properties/:propertyId", () => {
  it("returns full property detail with all sub-resources", async () => {
    const res = await SELF.fetch(
      get(`/api/properties/${PROP_ID}`, VIEWER_EMAIL)
    );
    expect(res.status).toBe(200);
    const body = await res.json() as {
      property: { id: string };
      owner: unknown;
      improvements: unknown[];
      oprHistory: unknown[];
      notes: unknown[];
      callStatus: { current: string | null; history: unknown[] };
    };
    expect(body.property.id).toBe(PROP_ID);
    expect(Array.isArray(body.improvements)).toBe(true);
    expect(Array.isArray(body.oprHistory)).toBe(true);
    expect(Array.isArray(body.notes)).toBe(true);
    expect(body.callStatus).toHaveProperty("current");
    expect(Array.isArray(body.callStatus.history)).toBe(true);
  });

  it("strips owner PII for viewer", async () => {
    const res = await SELF.fetch(
      get(`/api/properties/${PROP_ID}`, VIEWER_EMAIL)
    );
    const body = await res.json() as { owner: { owner_name: string | null } };
    expect(body.owner.owner_name).toBeNull();
  });

  it("returns owner PII for admin", async () => {
    const res = await SELF.fetch(
      get(`/api/properties/${PROP_ID}`, ADMIN_EMAIL)
    );
    const body = await res.json() as { owner: { owner_name: string | null } };
    expect(body.owner.owner_name).toBe("John Doe");
  });

  it("returns 404 for unknown property", async () => {
    const res = await SELF.fetch(
      get("/api/properties/DOES-NOT-EXIST", VIEWER_EMAIL)
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("not found");
  });
});

// ─── Jobs ─────────────────────────────────────────────────────────────────────

describe("GET /api/jobs", () => {
  it("returns jobs array", async () => {
    const res = await SELF.fetch(get("/api/jobs", VIEWER_EMAIL));
    expect(res.status).toBe(200);
    const body = await res.json() as { jobs: unknown[] };
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs.length).toBeGreaterThanOrEqual(1);
  });

  it("filters jobs by type", async () => {
    const res = await SELF.fetch(
      get("/api/jobs?type=bcad_import", VIEWER_EMAIL)
    );
    const body = await res.json() as { jobs: Array<{ jobType: string }> };
    expect(body.jobs.every((j) => j.jobType === "bcad_import")).toBe(true);
  });

  it("returns empty array for a type with no jobs", async () => {
    const res = await SELF.fetch(
      get("/api/jobs?type=csv_export", VIEWER_EMAIL)
    );
    const body = await res.json() as { jobs: unknown[] };
    expect(body.jobs.length).toBe(0);
  });
});

describe("GET /api/jobs/:jobId", () => {
  it("returns job detail with correct shape", async () => {
    const res = await SELF.fetch(get(`/api/jobs/${JOB_ID}`, VIEWER_EMAIL));
    expect(res.status).toBe(200);
    const body = await res.json() as {
      jobId: string;
      status: string;
      jobType: string;
      totalRecords: number;
      processedRecords: number;
      failedRecords: number;
      errors: string[];
    };
    expect(body.jobId).toBe(JOB_ID);
    expect(body.status).toBe("completed");
    expect(body.jobType).toBe("bcad_import");
    expect(body.totalRecords).toBe(10);
    expect(body.processedRecords).toBe(10);
    expect(body.failedRecords).toBe(0);
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("returns 404 for unknown job", async () => {
    const res = await SELF.fetch(get("/api/jobs/no-such-job", VIEWER_EMAIL));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/jobs/:jobId/download", () => {
  it("returns 404 for unknown job", async () => {
    const res = await SELF.fetch(
      get("/api/jobs/no-such-job/download", VIEWER_EMAIL)
    );
    expect(res.status).toBe(404);
  });

  it("returns 202 when job exists but has no file yet", async () => {
    // Seed a pending job (no result_r2_key)
    await env.DB.prepare(
      `INSERT INTO import_jobs
         (id, job_type, status, total_records, processed_records,
          failed_records, errors, created_at, updated_at)
       VALUES ('pending-job-001', 'bcad_import', 'pending', 0, 0, 0, '[]', ?, ?)`
    )
      .bind(NOW, NOW)
      .run();

    const res = await SELF.fetch(
      get("/api/jobs/pending-job-001/download", VIEWER_EMAIL)
    );
    expect(res.status).toBe(202);
  });
});

// ─── Notes ────────────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/notes", () => {
  it("adds a note and returns 201", async () => {
    const res = await SELF.fetch(
      post(`/api/properties/${PROP_ID}/notes`, VIEWER_EMAIL, {
        note: "Visited site, looks commercial",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json() as {
      message: string;
      propertyId: string;
      note: string;
      createdAt: string;
    };
    expect(body.message).toBe("Note added");
    expect(body.propertyId).toBe(PROP_ID);
    expect(body.note).toBe("Visited site, looks commercial");
    expect(typeof body.createdAt).toBe("string");
  });

  it("persists the note so it appears in property detail", async () => {
    await SELF.fetch(
      post(`/api/properties/${PROP_ID}/notes`, VIEWER_EMAIL, {
        note: "Follow-up scheduled",
      })
    );
    const res = await SELF.fetch(
      get(`/api/properties/${PROP_ID}`, VIEWER_EMAIL)
    );
    const body = await res.json() as { notes: Array<{ note: string }> };
    const notes = body.notes.map((n) => n.note);
    expect(notes).toContain("Follow-up scheduled");
  });

  it("returns 400 when note field is missing", async () => {
    const res = await SELF.fetch(
      post(`/api/properties/${PROP_ID}/notes`, VIEWER_EMAIL, {})
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty note string", async () => {
    const res = await SELF.fetch(
      post(`/api/properties/${PROP_ID}/notes`, VIEWER_EMAIL, { note: "  " })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown property", async () => {
    const res = await SELF.fetch(
      post("/api/properties/UNKNOWN-PROP/notes", VIEWER_EMAIL, { note: "hi" })
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await SELF.fetch(
      new Request(`http://localhost/api/properties/${PROP_ID}/notes`, {
        method: "POST",
        headers: {
          "X-User-Email": VIEWER_EMAIL,
          "Content-Type": "application/json",
        },
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
  });
});

// ─── Call status ──────────────────────────────────────────────────────────────

describe("POST /api/properties/:propertyId/call-status", () => {
  it("sets call status to New and returns 201", async () => {
    const res = await SELF.fetch(
      post(`/api/properties/${PROP_ID}/call-status`, VIEWER_EMAIL, {
        status: "New",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json() as {
      message: string;
      propertyId: string;
      status: string;
    };
    expect(body.message).toBe("Call status updated");
    expect(body.status).toBe("New");
    expect(body.propertyId).toBe(PROP_ID);
  });

  it("persists call status visible in property detail", async () => {
    await SELF.fetch(
      post(`/api/properties/${PROP_ID}/call-status`, VIEWER_EMAIL, {
        status: "Interested",
      })
    );
    const res = await SELF.fetch(
      get(`/api/properties/${PROP_ID}`, VIEWER_EMAIL)
    );
    const body = await res.json() as {
      callStatus: { current: string; history: unknown[] };
    };
    expect(body.callStatus.current).toBe("Interested");
    expect(body.callStatus.history.length).toBeGreaterThan(0);
  });

  it("accepts an optional note field", async () => {
    const res = await SELF.fetch(
      post(`/api/properties/${PROP_ID}/call-status`, VIEWER_EMAIL, {
        status: "Follow Up",
        note: "Call back Thursday",
      })
    );
    expect(res.status).toBe(201);
  });

  it("returns 400 for an invalid status value", async () => {
    const res = await SELF.fetch(
      post(`/api/properties/${PROP_ID}/call-status`, VIEWER_EMAIL, {
        status: "NotAStatus",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("status");
  });

  it("returns 400 when status field is missing", async () => {
    const res = await SELF.fetch(
      post(`/api/properties/${PROP_ID}/call-status`, VIEWER_EMAIL, {})
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown property", async () => {
    const res = await SELF.fetch(
      post("/api/properties/UNKNOWN-PROP/call-status", VIEWER_EMAIL, {
        status: "New",
      })
    );
    expect(res.status).toBe(404);
  });
});
