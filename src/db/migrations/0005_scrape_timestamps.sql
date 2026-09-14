-- Migration: 0005_scrape_timestamps
-- Track last successful scrape time per county directly on county_configs.

ALTER TABLE county_configs ADD COLUMN last_opr_scrape_at TEXT;
ALTER TABLE county_configs ADD COLUMN last_bcad_scrape_at TEXT;
