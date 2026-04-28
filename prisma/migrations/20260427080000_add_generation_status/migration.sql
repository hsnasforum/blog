-- Add generationStatus alongside the existing status field so generation
-- results can be exposed explicitly without breaking existing status reads.
ALTER TABLE "GenerationLog" ADD COLUMN "generationStatus" TEXT NOT NULL DEFAULT 'success';
