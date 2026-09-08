-- Bexar County Property Research — D1 Schema
-- Migration: 0001_initial
-- All timestamps are ISO-8601 strings (SQLite has no native datetime type)

-- ─── Users ───────────────────────────────────────────────────────────────────
-- Populated on first login via Cloudflare Access JWT; role defaults to 'viewer'.
-- Admins must be promoted directly in D1 or via a migration.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,       -- Cloudflare Access sub (JWT subject)
  email       TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at  TEXT NOT NULL,
  last_login  TEXT
);

-- ─── Properties ───────────────────────────────────────────────────────────────
-- One row per BCAD property record.
-- building_area_sq_ft / building_area_sq_m are DERIVED columns: sum of
-- all rows in property_improvements for this property_id.  They are
-- recomputed by the import processor after upserting improvements; never
-- enter them independently.
CREATE TABLE IF NOT EXISTS properties (
  id                           TEXT PRIMARY KEY,  -- BCAD Property ID
  geographic_id                TEXT,
  property_address             TEXT,
  property_address_normalized  TEXT,              -- uppercase, expanded, no punctuation
  city                         TEXT,
  state                        TEXT NOT NULL DEFAULT 'TX',
  zip_code                     TEXT,
  legal_description            TEXT,
  legal_description_normalized TEXT,
  property_use_code            TEXT,
  property_use_description     TEXT,
  commercial                   INTEGER NOT NULL DEFAULT 0,  -- 0=no, 1=yes
  improvement_value            INTEGER,
  land_value                   INTEGER,
  total_appraised_value        INTEGER,
  land_area_sq_ft              REAL,
  land_area_acres              REAL,
  -- Derived: sum of property_improvements.building_area_sq_ft
  building_area_sq_ft          REAL,
  -- Derived: building_area_sq_ft * 0.092903
  building_area_sq_m           REAL,
  exemption_status             TEXT,
  data_source                  TEXT,
  source_file_hash             TEXT,
  import_date                  TEXT,
  last_updated                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_properties_geographic_id
  ON properties (geographic_id);
CREATE INDEX IF NOT EXISTS idx_properties_city
  ON properties (city);
CREATE INDEX IF NOT EXISTS idx_properties_commercial
  ON properties (commercial);
CREATE INDEX IF NOT EXISTS idx_properties_property_address_normalized
  ON properties (property_address_normalized);
CREATE INDEX IF NOT EXISTS idx_properties_legal_description_normalized
  ON properties (legal_description_normalized);

-- ─── Owners ──────────────────────────────────────────────────────────────────
-- Owner PII is gated behind the 'admin' role in every API response.
-- do_not_contact and consent_or_basis_note are populated only when
-- APP_USAGE_MODE = 'outreach'.
CREATE TABLE IF NOT EXISTS owners (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id           TEXT NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  owner_name            TEXT,
  mailing_address       TEXT,
  mailing_city          TEXT,
  mailing_state         TEXT,
  mailing_zip           TEXT,
  -- outreach-mode fields (see APP_USAGE_MODE)
  do_not_contact        INTEGER DEFAULT 0,  -- 0=no, 1=yes
  do_not_contact_source TEXT,               -- e.g. "owner request", "internal policy"
  consent_or_basis_note TEXT,               -- legal basis for contact
  data_source           TEXT,
  import_date           TEXT,
  last_updated          TEXT
);

CREATE INDEX IF NOT EXISTS idx_owners_property_id ON owners (property_id);

-- ─── Property improvements ────────────────────────────────────────────────────
-- One row per building/improvement on a property.
-- A property with zero improvement rows is vacant land and must NOT be
-- classified as commercial=1 regardless of other fields.
CREATE TABLE IF NOT EXISTS property_improvements (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id         TEXT NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  building_type       TEXT,
  building_area_sq_ft REAL,
  -- Formula: building_area_sq_ft * 0.092903
  building_area_sq_m  REAL,
  improvement_value   INTEGER,
  data_source         TEXT,
  import_date         TEXT
);

CREATE INDEX IF NOT EXISTS idx_improvements_property_id
  ON property_improvements (property_id);

-- ─── OPR documents ───────────────────────────────────────────────────────────
-- Bexar County Official Public Records.
-- Unmatched documents (no matching property) have property_id = NULL in
-- the link table; they are retained and remain searchable.
CREATE TABLE IF NOT EXISTS opr_documents (
  id                           INTEGER PRIMARY KEY AUTOINCREMENT,
  document_number              TEXT UNIQUE NOT NULL,
  recording_date               TEXT,
  document_type                TEXT,
  grantor                      TEXT,
  grantee                      TEXT,
  legal_description            TEXT,
  legal_description_normalized TEXT,
  property_address             TEXT,
  property_address_normalized  TEXT,
  data_source                  TEXT,
  source_file_hash             TEXT,
  import_date                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_opr_recording_date
  ON opr_documents (recording_date);
CREATE INDEX IF NOT EXISTS idx_opr_document_type
  ON opr_documents (document_type);
CREATE INDEX IF NOT EXISTS idx_opr_property_address_normalized
  ON opr_documents (property_address_normalized);
CREATE INDEX IF NOT EXISTS idx_opr_legal_description_normalized
  ON opr_documents (legal_description_normalized);

-- ─── OPR ↔ Property links ─────────────────────────────────────────────────────
-- Join table holding match_confidence, because one OPR document may
-- reference more than one property and confidence is a property of the
-- link, not of either record alone.
CREATE TABLE IF NOT EXISTS opr_property_links (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  opr_document_id  INTEGER NOT NULL REFERENCES opr_documents (id) ON DELETE CASCADE,
  property_id      TEXT REFERENCES properties (id) ON DELETE SET NULL,
  match_confidence TEXT NOT NULL
    CHECK (match_confidence IN (
      'exact_id', 'exact_geographic', 'exact_legal',
      'fuzzy_address', 'needs_review', 'unmatched'
    )),
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opr_links_document_id
  ON opr_property_links (opr_document_id);
CREATE INDEX IF NOT EXISTS idx_opr_links_property_id
  ON opr_property_links (property_id);
CREATE INDEX IF NOT EXISTS idx_opr_links_confidence
  ON opr_property_links (match_confidence);

-- ─── Import/export jobs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_jobs (
  id                  TEXT PRIMARY KEY,       -- UUID v4
  job_type            TEXT NOT NULL
    CHECK (job_type IN ('bcad_import', 'opr_import', 'csv_export')),
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  source_file_name    TEXT,
  source_file_r2_key  TEXT,
  source_file_hash    TEXT,
  total_records       INTEGER NOT NULL DEFAULT 0,
  processed_records   INTEGER NOT NULL DEFAULT 0,
  failed_records      INTEGER NOT NULL DEFAULT 0,
  errors              TEXT,   -- JSON array of error strings
  result_r2_key       TEXT,   -- R2 key of generated CSV (export jobs)
  result_download_url TEXT,   -- Served via /api/jobs/:id/download
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status   ON import_jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON import_jobs (job_type);

-- ─── Property notes ───────────────────────────────────────────────────────────
-- Free-form research notes, separate from call-status history.
CREATE TABLE IF NOT EXISTS property_notes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id          TEXT NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  note                 TEXT NOT NULL,
  created_by_user_id   TEXT NOT NULL REFERENCES users (id),
  created_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_property_id ON property_notes (property_id);

-- ─── Call status log ──────────────────────────────────────────────────────────
-- Append-only status-change log; the most recent row is the current status.
-- The dashboard shows it as a badge with full history available on expand.
CREATE TABLE IF NOT EXISTS call_status (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id          TEXT NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  status               TEXT NOT NULL
    CHECK (status IN (
      'New', 'Contacted', 'Follow Up', 'Interested',
      'Not Interested', 'Wrong Number', 'Do Not Contact'
    )),
  note                 TEXT,
  changed_by_user_id   TEXT NOT NULL REFERENCES users (id),
  changed_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_call_status_property_id ON call_status (property_id);
CREATE INDEX IF NOT EXISTS idx_call_status_changed_at  ON call_status (changed_at);

-- ─── Deleted files log ────────────────────────────────────────────────────────
-- Audit trail retained even after the R2 object is purged.
CREATE TABLE IF NOT EXISTS deleted_files_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash     TEXT,
  original_name TEXT,
  r2_key        TEXT,
  deleted_at    TEXT NOT NULL
);
