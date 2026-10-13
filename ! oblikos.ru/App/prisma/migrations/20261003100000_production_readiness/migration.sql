-- Additive, no data deletion. Keep failed paid request receipts as tombstones.
ALTER TABLE "ContentGeneration" ADD COLUMN "failed" BOOLEAN NOT NULL DEFAULT false;
