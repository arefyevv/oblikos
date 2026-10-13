import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { Prisma } from "@/generated/prisma/client";
import { assertGenerationEnabled, reserveGeneration } from "@/features/ai/safety";
import { voicePreviewSchema } from "./validation";
import { ProxySpeechProvider, SpeechError } from "./provider";

export function createVoiceService(resolveContext: () => Promise<{ userId: string; workspaceId: string }>, provider = new ProxySpeechProvider()) {
  async function context() {
    const c = await resolveContext(); z.uuid().parse(c.userId); z.uuid().parse(c.workspaceId);
    if (!await getDatabase().workspaceMember.findUnique({ where: { workspaceId_userId: c } })) throw new SpeechError("unavailable");
    return c;
  }
  return {
    async preview(raw: unknown) {
      const input = voicePreviewSchema.parse(raw), c = await context(), db = getDatabase();
      const fingerprint = createHash("sha256").update(JSON.stringify({ settings: input.settings, text: input.text })).digest("hex");
      const where = { id: input.requestId, ...c, fingerprint };
      const replay = async () => {
        const receipt = await db.voicePreview.findFirst({ where });
        if (!receipt || receipt.expiresAt < new Date() || receipt.status === "FAILED") throw new SpeechError("unavailable");
        if (receipt.status !== "READY") throw new SpeechError("pending");
        return { id: receipt.id };
      };
      if (await db.voicePreview.findUnique({ where: { id: input.requestId }, select: { id: true } })) return replay();
      assertGenerationEnabled("voice");
      // Clear expired audio while retaining receipts: an old UUID never pays twice.
      await db.voicePreview.updateMany({ where: { ...c, expiresAt: { lt: new Date() }, audio: { not: null } }, data: { audio: null } });
      try { await db.voicePreview.create({ data: { ...where, expiresAt: new Date(Date.now() + 86400000) } }); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return replay(); throw error; }
      try {
        await context();
        await reserveGeneration("voice", c);
        const audio = await provider.synthesize(input.settings, input.text);
        await context();
        await db.voicePreview.update({ where: { id: input.requestId }, data: { audio: new Uint8Array(audio), status: "READY" } });
        return { id: input.requestId };
      } catch (error) {
        await db.voicePreview.update({ where: { id: input.requestId }, data: { status: "FAILED", audio: null } }).catch(() => undefined);
        throw error;
      }
    },
    async audio(id: string) {
      z.uuid().parse(id);
      const c = await context();
      const receipt = await getDatabase().voicePreview.findFirst({ where: { id, ...c, status: "READY", expiresAt: { gt: new Date() } } });
      if (!receipt?.audio) throw new SpeechError("unavailable");
      return Buffer.from(receipt.audio);
    },
  };
}
