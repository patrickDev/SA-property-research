# Bexar County / San Antonio Commercial-Property Research

A Cloudflare Workers application that imports permitted BCAD and Bexar County Official Public Records (OPR) data, identifies commercial properties, and enables filtering, research notes, and CSV export.

---

## Intended Use and Compliance

### `APP_USAGE_MODE`

Set the `APP_USAGE_MODE` variable in `wrangler.jsonc` (or as a wrangler secret) before first deployment:

| Value | Description |
|---|---|
| `research_only` | Internal research and record-keeping only. No outbound contact tracking. `do_not_contact` fields are not enforced. Call-status values are available but the "Contacted" block is not enforced. |
| `outreach` | Enables the `do_not_contact` check: attempting to set a "Contacted" call status for an owner with `do_not_contact = 1` is rejected. |

**Default:** `research_only`

### Data sources

This application accepts **only**:
- CSV or Excel files exported from the Bexar County Appraisal District (BCAD) via their official portal or a public-records request.
- Official Public Records (OPR) data received from Bexar County via a documented bulk-export channel or public-records request.

**Do not** upload data obtained by scraping, bypassing authentication, or circumventing any rate limits, CAPTCHA, or payment requirements.

### Phone numbers / TCPA

This application does not collect phone numbers. If phone numbers are ever added via an authorized data provider, the operator is solely responsible for compliance with the Telephone Consumer Protection Act (TCPA) and the Texas do-not-call rules. The application does not enforce these automatically.

### Real estate licensing (Texas)

If this application is used to solicit property purchases or listings, Texas real estate licensing requirements (TREC) may apply. This is a decision for the operator and their legal counsel. This application does not resolve or enforce licensing requirements.

### PII access

Owner name and mailing address are considered PII. They are:
- Stored in the `owners` table.
- Only returned by the API for users with the `admin` role.
- Stripped from all responses for `viewer`-role users.
- Included in exported CSVs (admin only; export endpoint requires admin role).

### Retention

- Uploaded source files in R2 are automatically deleted after `RETENTION_DAYS_SOURCE_FILES` days (default: 30).
- Generated export CSVs are deleted after `RETENTION_DAYS_GENERATED_CSV` days (default: 7) because they contain owner PII.
- Database records imported from those files are **not** automatically deleted. A separate data-deletion workflow is out of scope for v1.

---

## Architecture

```
Cloudflare Workers (fetch + queue + scheduled)
  ├── HTTP API (/api/*)
  ├── Dashboard (static HTML at /)
  ├── Cloudflare Access (auth)
  ├── D1 (SQLite) — properties, owners, OPR docs, jobs, notes, users
  ├── R2 — uploaded source files + generated export CSVs
  └── Queues — async import and export processing
```

---

## Local Setup

### Prerequisites

- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- A Cloudflare account (free tier is sufficient for development)

### Install dependencies

```bash
npm install
```

### Create `.dev.vars` for local development

```bash
# .dev.vars (not committed to git)
APP_USAGE_MODE=research_only
RETENTION_DAYS_SOURCE_FILES=30
RETENTION_DAYS_GENERATED_CSV=7
# For development without Cloudflare Access, leave these unset.
# The API will then accept the X-User-Email header to identify the caller.
# CF_ACCESS_AUDIENCE=
# CF_ACCESS_TEAM_DOMAIN=
```

### Create D1 database and run migrations (local)

```bash
# First run — creates a local D1 database
npm run db:migrate:local
```

### Create R2 bucket (local)

Wrangler creates a local R2 simulation automatically when you run `wrangler dev`. No extra step required locally.

### Run locally

```bash
npm run dev
# Opens at http://localhost:8787
```

In local dev mode (no Cloudflare Access), pass `X-User-Email: your@email.com` in request headers to authenticate. The first email seen is auto-created as a `viewer`. Promote to admin directly in the local D1:

```bash
wrangler d1 execute bexar-property-research --local \
  --command "UPDATE users SET role='admin' WHERE email='your@email.com'"
```

### Run tests

```bash
npm test
```

---

## Deployment

### 1. Create D1 database

```bash
wrangler d1 create bexar-property-research
# Copy the database_id from the output
```

Paste the `database_id` into `wrangler.jsonc`.

### 2. Run remote migrations

```bash
npm run db:migrate:remote
```

### 3. Create R2 bucket

```bash
wrangler r2 bucket create bexar-property-research-files
```

### 4. Create Queues

```bash
wrangler queues create bexar-import-jobs
wrangler queues create bexar-export-jobs
wrangler queues create bexar-import-dlq
```

### 5. Configure Cloudflare Access (recommended)

1. In the Cloudflare dashboard, go to **Zero Trust > Access > Applications**.
2. Create a new **Self-hosted** application pointing to your Worker's URL.
3. Note the **Audience tag** (AUD) from the application settings.
4. Note your **team domain** (e.g., `myteam.cloudflareaccess.com`).

Set them as secrets:

```bash
wrangler secret put CF_ACCESS_AUDIENCE
wrangler secret put CF_ACCESS_TEAM_DOMAIN
```

> **Without Cloudflare Access:** The Worker falls back to trusting the `X-User-Email` header, which is insecure for production. Do not use this fallback in a deployed environment.

### 6. Deploy

```bash
npm run deploy
```

### 7. Promote your first admin

```bash
wrangler d1 execute bexar-property-research --remote \
  --command "UPDATE users SET role='admin' WHERE email='your@email.com'"
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_USAGE_MODE` | `research_only` | `research_only` or `outreach` |
| `RETENTION_DAYS_SOURCE_FILES` | `30` | Days to retain uploaded source files in R2 |
| `RETENTION_DAYS_GENERATED_CSV` | `7` | Days to retain generated export CSVs in R2 |
| `CF_ACCESS_AUDIENCE` | *(unset)* | Cloudflare Access audience tag (set as secret) |
| `CF_ACCESS_TEAM_DOMAIN` | *(unset)* | Cloudflare Access team domain (set as secret) |

---

## API Reference

All endpoints except `GET /api/health` require authentication.

### Authentication

In production: Cloudflare Access injects a JWT into `CF-Access-Jwt-Assertion`.
In development: pass `X-User-Email: you@example.com` header.

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Health check |
| `POST` | `/api/imports/bcad` | Admin | Upload BCAD CSV, start async import |
| `POST` | `/api/imports/opr` | Admin | Upload OPR CSV, start async import |
| `GET` | `/api/jobs` | Any | List recent jobs |
| `GET` | `/api/jobs/:jobId` | Any | Get job status and progress |
| `GET` | `/api/jobs/:jobId/download` | Any | Stream generated export CSV |
| `GET` | `/api/properties` | Any* | Search properties (PII stripped for viewers) |
| `GET` | `/api/properties/:propertyId` | Any* | Property detail with OPR history |
| `POST` | `/api/properties/:propertyId/notes` | Any | Add research note |
| `POST` | `/api/properties/:propertyId/call-status` | Any | Update call status |
| `POST` | `/api/exports/commercial-properties` | Admin | Start async CSV export |

\* Owner PII fields are null for `viewer` role.

### Property search filters

`GET /api/properties?city=San+Antonio&commercial=true&minBuildingSqM=500`

| Parameter | Description |
|---|---|
| `city` | Filter by city (case-insensitive) |
| `commercial` | `true` / `false` |
| `propertyUse` | Use code or description (partial match) |
| `minBuildingSqFt` / `maxBuildingSqFt` | Building size in square feet |
| `minBuildingSqM` / `maxBuildingSqM` | Building size in square meters (converted internally) |
| `minLandAcres` / `maxLandAcres` | Land area in acres |
| `minMarketValue` / `maxMarketValue` | Total appraised value |
| `ownerName` | Owner name substring (admin only) |
| `documentType` | OPR document type substring |
| `recordedAfter` / `recordedBefore` | OPR recording date range (ISO-8601) |
| `matchConfidence` | `exact_id`, `exact_geographic`, `exact_legal`, `fuzzy_address`, `needs_review`, `unmatched` |
| `limit` | Page size (max 200, default 50) |
| `offset` | Page offset (default 0) |

---

## Data Import

### BCAD CSV

Flexible column name matching. Accepted aliases are defined in `src/services/csv-parser.ts`. Core columns:

- **Property ID** (required)
- Geographic ID, Owner Name, Mailing Address/City/State/Zip
- Property Address, City, Zip Code
- Legal Description, Property Use Code, Property Use Description
- Building Type, Building Area (Sq Ft), Land Area (Sq Ft), Land Area (Acres)
- Improvement Value, Land Value, Total Appraised Value, Exemption Status

See `samples/bcad-sample.csv` for a template.

> **Excel files:** Export your BCAD data to CSV before uploading. Excel `.xlsx` files are not accepted directly.

### OPR CSV

- **Document Number** (required)
- Recording Date, Document Type, Grantor, Grantee, Legal Description, Property Address

See `samples/opr-sample.csv` for a template.

---

## Matching Logic (BCAD ↔ OPR)

Confidence levels (highest to lowest):

| Confidence | Rule |
|---|---|
| `exact_id` | OPR doc references BCAD Property ID directly |
| `exact_geographic` | OPR doc references BCAD Geographic ID |
| `exact_legal` | Normalized legal description identical |
| `fuzzy_address` | Normalized address similarity ≥ 0.85 (combined char + token similarity) |
| `needs_review` | Legal desc matches but address conflicts — surface for manual QA |
| `unmatched` | No reliable link; document stored with `property_id = NULL` |

Use the `matchConfidence=needs_review` filter in the dashboard or API to review low-confidence matches.

---

## Schema Notes

- `properties.building_area_sq_ft` and `building_area_sq_m` are **derived** columns: the sum of all rows in `property_improvements` for that property. They are recomputed by the import processor on every import. Do not edit them directly.
- A property with **zero improvement rows** is treated as vacant land and is excluded from `commercial=true` results regardless of use code.
- `call_status` is an **append-only log**. The current status is always the most recent row. Full history is preserved.

---

## Development Notes

### Roles

Users are auto-created on first login with `role = 'viewer'`. Promote via D1:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

### Address normalization

See `src/services/address-normalizer.ts`. The abbreviation expansion table (`ABBREVIATIONS`) is the single source of truth. Add aliases there if BCAD data uses non-standard abbreviations.

### Retention cron

The `scheduled` export in `src/worker.ts` runs at 02:00 UTC daily and deletes R2 objects older than the configured retention days. A log entry is written to `deleted_files_log` for each deletion.

---

## Operator Compliance Responsibilities

The operator deploying this application is solely responsible for:

1. Ensuring all imported data was obtained legally and with appropriate authorization.
2. Compliance with the Texas Public Information Act for any data derived from public records requests.
3. TCPA and Texas do-not-call compliance if phone numbers are ever added and outbound calls are made.
4. Texas real estate licensing requirements (TREC) if the application is used for property solicitation.
5. Any other applicable federal, state, or local laws governing the collection, storage, and use of property owner information.

This application is a research tool. It does not provide legal advice, and no part of this codebase should be construed as such.
