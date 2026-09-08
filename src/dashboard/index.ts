/**
 * Re-exports the dashboard HTML string for the Worker to serve.
 *
 * Wrangler resolves HTML files as text modules automatically.
 * If you get a build error here, add this to wrangler.jsonc:
 *
 *   "rules": [{ "type": "Text", "globs": ["**\/*.html"] }]
 */

// @ts-expect-error — wrangler treats .html imports as text strings at build time
import dashboardHtml from "./index.html";

export const DASHBOARD_HTML: string = dashboardHtml as string;
