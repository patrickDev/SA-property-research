/**
 * Minimal pattern-matching HTTP router for Cloudflare Workers.
 *
 * Supports:
 *  - Exact segments: /api/health
 *  - Named parameters: /api/properties/:propertyId
 *  - Route-level auth guards (requireAuth, requireAdmin)
 */

import type { Env, AuthUser } from "./types";
import { requireAuth } from "./auth";

export type RouteHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  params: Record<string, string>,
  user: AuthUser
) => Promise<Response>;

interface Route {
  method: string; // "GET", "POST", etc.  "*" = any method.
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
  /** If true, the handler is called without an authenticated user. */
  public?: boolean;
}

export class Router {
  private readonly routes: Route[] = [];

  private add(
    method: string,
    path: string,
    handler: RouteHandler,
    isPublic = false
  ): this {
    const paramNames: string[] = [];
    // 1. Extract :param segments first (before escaping, since ':' is not a regex metachar)
    const withPlaceholders = path.replace(
      /:([A-Za-z_][A-Za-z0-9_]*)/g,
      (_m, name: string) => {
        paramNames.push(name);
        return "\x00PARAM\x00"; // temporary placeholder, safe from regex escaping
      }
    );
    // 2. Escape regex metacharacters in the rest of the path
    const escaped = withPlaceholders.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 3. Restore placeholders as named capture groups
    const regexStr = escaped.replace(/\x00PARAM\x00/g, "([^/]+)");
    this.routes.push({
      method,
      pattern: new RegExp(`^${regexStr}$`),
      paramNames,
      handler,
      public: isPublic,
    });
    return this;
  }

  get(path: string, handler: RouteHandler, isPublic = false): this {
    return this.add("GET", path, handler, isPublic);
  }

  post(path: string, handler: RouteHandler, isPublic = false): this {
    return this.add("POST", path, handler, isPublic);
  }

  put(path: string, handler: RouteHandler, isPublic = false): this {
    return this.add("PUT", path, handler, isPublic);
  }

  delete(path: string, handler: RouteHandler, isPublic = false): this {
    return this.add("DELETE", path, handler, isPublic);
  }

  async handle(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    for (const route of this.routes) {
      if (route.method !== "*" && route.method !== method) continue;

      const match = route.pattern.exec(pathname);
      if (!match) continue;

      const params: Record<string, string> = {};
      for (let i = 0; i < route.paramNames.length; i++) {
        const name = route.paramNames[i];
        const value = match[i + 1];
        if (name !== undefined && value !== undefined) {
          params[name] = decodeURIComponent(value);
        }
      }

      // Public routes bypass auth
      if (route.public) {
        // Public handlers still receive a user-like stub; we cast to satisfy
        // the handler signature.  Public handlers should not use the user arg.
        return route.handler(
          request,
          env,
          ctx,
          params,
          null as unknown as AuthUser
        );
      }

      // Auth-required routes
      const authResult = await requireAuth(request, env);
      if ("response" in authResult) return authResult.response;

      return route.handler(request, env, ctx, params, authResult.user);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
