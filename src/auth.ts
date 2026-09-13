/**
 * Authentication and authorization via Cloudflare Access.
 *
 * Cloudflare Access places a signed JWT in the `CF-Access-Jwt-Assertion`
 * request header.  We validate it using the JWKS published at
 * https://<team>.cloudflareaccess.com/cdn-cgi/access/certs
 *
 * Roles are stored in the `users` D1 table.  On first authenticated request
 * the user row is auto-created with role = 'viewer'.  Admins must be promoted
 * directly via D1 (or a future admin API).
 *
 * FALLBACK (no Cloudflare Access):
 * If CF_ACCESS_TEAM_DOMAIN is not set the middleware accepts any request and
 * uses the X-User-Email header to identify the caller (development only).
 * Do NOT run in this mode in production.
 */

import type { Env, AuthUser, UserRow } from "./types";

const ACCESS_JWT_HEADER = "CF-Access-Jwt-Assertion";
const DEV_EMAIL_HEADER = "X-User-Email";

// ─── JWT helpers (Web Crypto) ─────────────────────────────────────────────────

interface AccessJwtPayload {
  sub: string;   // unique user ID from Cloudflare Access
  email: string;
  aud: string | string[];
  exp: number;
  iat: number;
}

interface JwksKey {
  kty: string;
  use: string;
  kid: string;
  n: string;
  e: string;
  alg: string;
}

interface JwksResponse {
  keys: JwksKey[];
}

// Cache the JWKS in module scope so we don't fetch it on every request
let jwksCache: Map<string, CryptoKey> | null = null;
let jwksCacheExpiry = 0;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getJwks(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (jwksCache && now < jwksCacheExpiry) return jwksCache;

  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const resp = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 3600 } } as RequestInit);
  if (!resp.ok) throw new Error(`JWKS fetch failed: ${resp.status}`);

  const jwks = await resp.json() as JwksResponse;
  const keys = new Map<string, CryptoKey>();

  for (const key of jwks.keys) {
    if (key.kty !== "RSA" || key.use !== "sig") continue;
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      key as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    keys.set(key.kid, cryptoKey);
  }

  jwksCache = keys;
  jwksCacheExpiry = now + JWKS_CACHE_TTL_MS;
  return keys;
}

function base64UrlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  audience: string
): Promise<AccessJwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT structure");

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))) as { kid?: string; alg?: string };
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as AccessJwtPayload;

  // Validate expiry
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("JWT has expired");
  }

  // Validate audience
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(audience)) {
    throw new Error("JWT audience mismatch");
  }

  // Verify signature
  const keys = await getJwks(teamDomain);
  const kid = header.kid ?? "";
  const key = keys.get(kid);
  if (!key) throw new Error(`Unknown JWT key ID: ${kid}`);

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signingInput);
  if (!valid) throw new Error("JWT signature verification failed");

  return payload;
}

// ─── User provisioning ────────────────────────────────────────────────────────

async function upsertUser(env: Env, id: string, email: string): Promise<AuthUser> {
  const now = new Date().toISOString();

  // Check if user already exists
  const existing = await env.DB.prepare(
    "SELECT id, email, role FROM users WHERE id = ?"
  )
    .bind(id)
    .first<UserRow>();

  if (existing) {
    // Update last_login
    await env.DB.prepare("UPDATE users SET last_login = ? WHERE id = ?")
      .bind(now, id)
      .run();
    return { id: existing.id, email: existing.email, role: existing.role };
  }

  // First user ever gets admin; everyone else starts as viewer
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM users")
    .first<{ n: number }>();
  const role = (count?.n ?? 0) === 0 ? "admin" : "viewer";

  await env.DB.prepare(
    "INSERT INTO users (id, email, role, created_at, last_login) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, email, role, now, now)
    .run();

  return { id, email, role };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Authenticate the incoming request.
 *
 * @returns AuthUser if the request is authenticated, null if unauthenticated.
 *          Throws if credentials are present but invalid.
 */
export async function authenticate(
  request: Request,
  env: Env
): Promise<AuthUser | null> {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const audience = env.CF_ACCESS_AUDIENCE;

  // ── Development mode (no Cloudflare Access configured) ──────────────────
  if (!teamDomain || !audience) {
    const email = request.headers.get(DEV_EMAIL_HEADER);
    if (!email) return null;

    // Look up or create user
    const row = await env.DB.prepare(
      "SELECT id, email, role FROM users WHERE email = ? LIMIT 1"
    )
      .bind(email)
      .first<UserRow>();

    if (row) return { id: row.id, email: row.email, role: row.role };

    // Auto-create in dev mode
    const id = crypto.randomUUID();
    return upsertUser(env, id, email);
  }

  // ── Cloudflare Access mode ───────────────────────────────────────────────
  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (!token) return null;

  const payload = await verifyAccessJwt(token, teamDomain, audience);
  return upsertUser(env, payload.sub, payload.email);
}

/**
 * Require authentication; return a 401 Response if not authenticated.
 */
export async function requireAuth(
  request: Request,
  env: Env
): Promise<{ user: AuthUser } | { response: Response }> {
  try {
    const user = await authenticate(request, env);
    if (!user) {
      return {
        response: new Response(
          JSON.stringify({ error: "Unauthorized: authentication required" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        ),
      };
    }
    return { user };
  } catch (err) {
    return {
      response: new Response(
        JSON.stringify({ error: `Authentication failed: ${String(err)}` }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
}

/**
 * Require admin role; return a 403 Response if the user is not an admin.
 */
export function requireAdmin(user: AuthUser): Response | null {
  if (user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden: admin role required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

/** Return true if the user has permission to view owner PII. */
export function canViewPii(user: AuthUser): boolean {
  return user.role === "admin";
}
