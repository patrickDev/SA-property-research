-- Migration: 0003_county
-- Tags every property and OPR document with the county it belongs to.
-- Supports multi-county expansion beyond Bexar County.

ALTER TABLE properties    ADD COLUMN county TEXT NOT NULL DEFAULT 'Bexar';
ALTER TABLE opr_documents ADD COLUMN county TEXT NOT NULL DEFAULT 'Bexar';
ALTER TABLE import_jobs   ADD COLUMN county TEXT NOT NULL DEFAULT 'Bexar';

CREATE INDEX IF NOT EXISTS idx_properties_county ON properties (county);
CREATE INDEX IF NOT EXISTS idx_opr_county        ON opr_documents (county);
