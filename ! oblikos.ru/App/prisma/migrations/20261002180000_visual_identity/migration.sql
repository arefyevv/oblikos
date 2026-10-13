-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaGenerationStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "mimeType" VARCHAR(32) NOT NULL,
    "storageKey" VARCHAR(240) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "model" VARCHAR(160) NOT NULL,
    "referenceAssetId" UUID,
    "referenceUsed" BOOLEAN NOT NULL DEFAULT false,
    "isPrimaryReference" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaGeneration" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "status" "MediaGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "mediaId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_workspaceId_deletedAt_createdAt_id_idx" ON "MediaAsset"("workspaceId", "deletedAt", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "MediaAsset_characterId_deletedAt_createdAt_id_idx" ON "MediaAsset"("characterId", "deletedAt", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "MediaGeneration_characterId_idx" ON "MediaGeneration"("characterId");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_characterId_workspaceId_fkey" FOREIGN KEY ("characterId", "workspaceId") REFERENCES "Character"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaGeneration" ADD CONSTRAINT "MediaGeneration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaGeneration" ADD CONSTRAINT "MediaGeneration_characterId_workspaceId_fkey" FOREIGN KEY ("characterId", "workspaceId") REFERENCES "Character"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One live primary image per character, including concurrent app processes.
CREATE UNIQUE INDEX "MediaAsset_primary_character_key" ON "MediaAsset"("characterId")
WHERE "isPrimaryReference" = true AND "deletedAt" IS NULL;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_primary_check"
CHECK (NOT "isPrimaryReference" OR ("type" = 'IMAGE' AND "deletedAt" IS NULL));
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_image_check"
CHECK ("width" > 0 AND "height" > 0 AND "fileSize" > 0 AND "fileSize" <= 20971520
AND "mimeType" IN ('image/png', 'image/jpeg', 'image/webp'));
