-- Migration: 0004_county_configs
-- Dedicated county configuration table for multi-county Texas expansion.

CREATE TABLE IF NOT EXISTS county_configs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,   -- e.g. "Bexar"
  display_name TEXT NOT NULL,          -- e.g. "Bexar County"
  city         TEXT,                   -- county seat, e.g. "San Antonio"
  state        TEXT NOT NULL DEFAULT 'TX',
  bcad_url     TEXT,                   -- optional: appraisal district data URL
  opr_url      TEXT,                   -- optional: official public records URL
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);

-- Seed Bexar as the default county (already has data imported)
INSERT OR IGNORE INTO county_configs (name, display_name, city, state, active, created_at)
VALUES ('Bexar', 'Bexar County', 'San Antonio', 'TX', 1, datetime('now'));
