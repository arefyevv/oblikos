-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('FACT', 'PREFERENCE', 'EVENT', 'RELATIONSHIP', 'GOAL', 'RULE', 'OTHER');

-- CreateTable
CREATE TABLE "MemoryEntry" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "type" "MemoryType" NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MemoryEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MemoryEntry_importance_check" CHECK ("importance" BETWEEN 1 AND 5),
    CONSTRAINT "MemoryEntry_content_check" CHECK (length(btrim("content")) > 0)
);

-- CreateIndex
CREATE INDEX "MemoryEntry_characterId_isPinned_importance_updatedAt_id_idx" ON "MemoryEntry"("characterId", "isPinned" DESC, "importance" DESC, "updatedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "MemoryEntry_characterId_type_idx" ON "MemoryEntry"("characterId", "type");

-- AddForeignKey
ALTER TABLE "MemoryEntry" ADD CONSTRAINT "MemoryEntry_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
