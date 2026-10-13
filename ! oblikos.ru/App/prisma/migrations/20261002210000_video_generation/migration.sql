ALTER TYPE "MediaGenerationStatus" ADD VALUE 'PROCESSING';
ALTER TABLE "MediaAsset" ADD COLUMN "duration" DOUBLE PRECISION;
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_image_check";
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_image_check" CHECK (
  "width" > 0 AND "height" > 0 AND "fileSize" > 0 AND (
    ("type" = 'IMAGE' AND "fileSize" <= 20971520 AND "duration" IS NULL AND "mimeType" IN ('image/png', 'image/jpeg', 'image/webp')) OR
    ("type" = 'VIDEO' AND "fileSize" <= 104857600 AND "mimeType" = 'video/mp4' AND "duration" > 0 AND "duration" <= 13 AND "duration" IS NOT NULL)
  )
);
ALTER TABLE "MediaGeneration"
  ADD COLUMN "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN "provider" VARCHAR(80),
  ADD COLUMN "model" VARCHAR(160),
  ADD COLUMN "providerJobId" VARCHAR(240),
  ADD COLUMN "referenceAssetId" UUID,
  ADD COLUMN "prompt" TEXT,
  ADD COLUMN "scene" TEXT,
  ADD COLUMN "duration" INTEGER,
  ADD COLUMN "aspectRatio" VARCHAR(12),
  ADD COLUMN "errorCode" VARCHAR(32),
  ADD COLUMN "nextPollAt" TIMESTAMPTZ(3),
  ADD COLUMN "pollLeaseId" UUID,
  ADD COLUMN "pollLeaseUntil" TIMESTAMPTZ(3);
CREATE INDEX "MediaGeneration_workspaceId_type_status_idx" ON "MediaGeneration"("workspaceId", "type", "status");
CREATE INDEX "MediaGeneration_referenceAssetId_status_idx" ON "MediaGeneration"("referenceAssetId", "status");
