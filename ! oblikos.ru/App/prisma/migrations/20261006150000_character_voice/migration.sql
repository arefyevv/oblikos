ALTER TABLE "Character" ADD COLUMN "voice" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "VoicePreview" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PROCESSING',
  "audio" BYTEA,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoicePreview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoicePreview_expiresAt_idx" ON "VoicePreview"("expiresAt");
