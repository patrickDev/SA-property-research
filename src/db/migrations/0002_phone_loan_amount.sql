-- Migration: 0002_phone_loan_amount
-- Adds owner phone (manual entry) and OPR loan amount fields.

ALTER TABLE owners ADD COLUMN phone TEXT;
ALTER TABLE opr_documents ADD COLUMN loan_amount INTEGER;
