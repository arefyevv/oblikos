CREATE TYPE "ContentType" AS ENUM ('POST', 'SHORT_POST', 'CAPTION', 'IDEA', 'DESCRIPTION', 'CUSTOM');
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT');
CREATE UNIQUE INDEX "Character_id_workspaceId_key" ON "Character"("id", "workspaceId");
CREATE TABLE "Content" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "characterId" UUID NOT NULL,
  "type" "ContentType" NOT NULL,
  "instruction" VARCHAR(5000) NOT NULL,
  "body" TEXT NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "provider" VARCHAR(80) NOT NULL,
  "model" VARCHAR(160) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Content_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Content_instruction_check" CHECK (length(trim("instruction")) > 0),
  CONSTRAINT "Content_body_check" CHECK (length(trim("body")) BETWEEN 1 AND 30000)
);
CREATE TABLE "ContentGeneration" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "characterId" UUID NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "contentId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentGeneration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Content_workspaceId_createdAt_id_idx" ON "Content"("workspaceId", "createdAt" DESC, "id");
CREATE INDEX "Content_characterId_createdAt_id_idx" ON "Content"("characterId", "createdAt" DESC, "id");
CREATE INDEX "ContentGeneration_characterId_idx" ON "ContentGeneration"("characterId");
ALTER TABLE "Content" ADD CONSTRAINT "Content_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Content" ADD CONSTRAINT "Content_characterId_workspaceId_fkey" FOREIGN KEY ("characterId", "workspaceId") REFERENCES "Character"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentGeneration" ADD CONSTRAINT "ContentGeneration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentGeneration" ADD CONSTRAINT "ContentGeneration_characterId_workspaceId_fkey" FOREIGN KEY ("characterId", "workspaceId") REFERENCES "Character"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
