-- Add optional source metadata for candidates created from external/community signals.
ALTER TABLE "TrendCandidate" ADD COLUMN "sourceMetaJson" TEXT;
