ALTER TABLE "Character" ADD COLUMN "kind" VARCHAR(16) NOT NULL DEFAULT 'HUMAN';
ALTER TABLE "MediaGeneration"
  ADD COLUMN "mode" VARCHAR(24) NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN "creatorUserId" UUID,
  ADD COLUMN "sourceId" UUID,
  ADD COLUMN "parameters" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "quotedCost" DECIMAL(12,4),
  ADD COLUMN "costCurrency" VARCHAR(3),
  ADD COLUMN "submissionStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "pollAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "VideoSource" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "characterId" UUID NOT NULL,
  "kind" VARCHAR(8) NOT NULL,
  "storageKey" VARCHAR(240) NOT NULL,
  "mimeType" VARCHAR(40) NOT NULL,
  "duration" DOUBLE PRECISION NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "hasAudio" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "VideoSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VideoSource_characterId_workspaceId_fkey" FOREIGN KEY ("characterId", "workspaceId") REFERENCES "Character"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VideoSource_storageKey_key" ON "VideoSource"("storageKey");
CREATE INDEX "VideoSource_workspaceId_userId_characterId_idx" ON "VideoSource"("workspaceId", "userId", "characterId");
CREATE INDEX "VideoSource_expiresAt_idx" ON "VideoSource"("expiresAt");
