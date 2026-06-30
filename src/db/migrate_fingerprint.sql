-- Migration: add fingerprint_fmd column to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS fingerprint_fmd TEXT;
