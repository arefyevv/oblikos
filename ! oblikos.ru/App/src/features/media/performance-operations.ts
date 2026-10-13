import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { Prisma } from "@/generated/prisma/client";
import { VideoError, type VideoProvider } from "@/features/ai/video-types";
import { assertGenerationEnabled, reserveGeneration, GenerationSafetyError } from "@/features/ai/safety";
import { buildVisualContext } from "@/features/ai/visual-context";
import { MediaUnavailable } from "./operations";
import { assertVideoAccess, createSourceService, type VideoContext } from "./source-operations";
import { performanceRequestSchema, type PerformanceRequest, type PerformanceQuote } from "./performance-validation";
import { billedDuration, performancePrice } from "./performance-cost";
import type { StorageProvider } from "./storage";
import { originalSoundAvailable } from "./original-video-sound";
import { buildPerformancePrompt } from "./performance-prompt";
import { videoInputUrls } from "./signed-video-input";
import { inspectVideo } from "./video-file";

export function performanceFingerprint(input: PerformanceRequest) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
export function createPerformanceService(resolveContext: () => Promise<VideoContext>, providers: { audio: VideoProvider; performance: VideoProvider }, storage: StorageProvider) {
  const sources = createSourceService(resolveContext, storage);
  async function checked(raw: unknown) {
    const input = performanceRequestSchema.parse(raw), context = await resolveContext();
    const character = await assertVideoAccess(context, input.characterId, true);
    const source = await sources.get(input.sourceId, input.characterId);
    if (source.kind !== (input.mode === "AUDIO" ? "AUDIO" : "VIDEO")) throw new VideoError("invalid");
    const image = await getDatabase().mediaAsset.findFirst({ where: { id: input.referenceAssetId, workspaceId: context.workspaceId, characterId: input.characterId, type: "IMAGE", deletedAt: null } });
    if (!image) throw new VideoError("reference");
    assertGenerationEnabled("video");
    if (process.env.REFERENCE_VIDEO_WORKER_ENABLED !== "true") throw new VideoError("configuration");
    const provider = input.mode === "AUDIO" ? providers.audio : providers.performance;
    const configuration = provider.configuration(), capabilities = await provider.capabilities();
    // Source dimensions are not persisted in older upload receipts. Inspect the
    // stored MP4 before quoting/enqueuing and again before the worker's paid POST.
    if (input.mode === "PERFORMANCE" && configuration.provider === "aitunnel-motion" && configuration.model === "seedance-2.0-mini") {
      const metadata = inspectVideo(await storage.read(source.storageKey), source.mimeType, 16, 1920 * 1080);
      if (metadata.width * metadata.height < 407696) throw new VideoError("seedance_source_resolution");
    }
    if (input.mode === "PERFORMANCE" && configuration.provider === "aitunnel-motion" && input.orientation !== "video") throw new VideoError("invalid");
    if (input.cast === "GROUP" && configuration.provider !== "aitunnel-motion") throw new VideoError("invalid");
    if (input.mode === "PERFORMANCE" && input.keepOriginalSound && !source.hasAudio) throw new VideoError("invalid");
    if (input.mode === "PERFORMANCE" && configuration.provider === "aitunnel-motion" && input.keepOriginalSound && !originalSoundAvailable()) throw new VideoError("configuration");
    if (!capabilities.referenceImages || !capabilities.aspectRatios.includes(input.aspectRatio)) throw new VideoError("configuration");
    const duration = billedDuration(input.mode, source.duration, input.orientation);
    if (!capabilities.durations.includes(duration)) throw new VideoError("invalid");
    const quote: PerformanceQuote = { ...performancePrice(input.mode, duration, input.aspectRatio), model: configuration.model, duration, sourceDuration: source.duration, sourceId: source.id, fingerprint: performanceFingerprint(input) };
    return { input, context, character, source, image, quote, configuration };
  }
  return {
    quote: async (input: unknown) => (await checked(input)).quote,
    enqueue: async (raw: unknown, requestId: string, acceptedQuote: unknown) => {
      z.uuid().parse(requestId);
      const input = performanceRequestSchema.parse(raw), context = await resolveContext(), db = getDatabase();
      await assertVideoAccess(context, input.characterId, true);
      const fingerprint = performanceFingerprint(input);
      const previous = await db.mediaGeneration.findUnique({ where: { id: requestId } });
      if (previous) {
        if (previous.workspaceId !== context.workspaceId || previous.creatorUserId !== context.userId || previous.characterId !== input.characterId || previous.type !== "VIDEO" || previous.fingerprint !== fingerprint) throw new MediaUnavailable();
        return previous;
      }
      const { character, image, quote, configuration } = await checked(input);
      if (JSON.stringify(acceptedQuote) !== JSON.stringify(quote)) throw new VideoError("price");
      const prompt = buildPerformancePrompt(input, buildVisualContext(character));
      try {
        return await db.$transaction(async tx => {
          if (!await tx.workspaceMember.findUnique({ where: { workspaceId_userId: context } }) || !await tx.character.findFirst({ where: { id: input.characterId, workspaceId: context.workspaceId, deletedAt: null, status: { not: "ARCHIVED" } } })) throw new MediaUnavailable();
          if (!await tx.mediaAsset.findFirst({ where: { id: image.id, workspaceId: context.workspaceId, characterId: input.characterId, deletedAt: null, type: "IMAGE" } }) || !await tx.videoSource.findFirst({ where: { id: input.sourceId, ...context, characterId: input.characterId, expiresAt: { gt: new Date() } } })) throw new VideoError("source");
          return tx.mediaGeneration.create({ data: { id: requestId, ...{ workspaceId: context.workspaceId, characterId: input.characterId }, creatorUserId: context.userId, type: "VIDEO", mode: input.mode, fingerprint, sourceId: input.sourceId, referenceAssetId: image.id, parameters: input, prompt, scene: input.mode === "AUDIO" ? "Оживить под аудио" : "Повторить исполнение", duration: quote.duration, aspectRatio: input.aspectRatio, provider: configuration.provider, model: configuration.model, quotedCost: quote.amount, costCurrency: quote.currency } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const winner = await db.mediaGeneration.findUniqueOrThrow({ where: { id: requestId } });
        if (winner.workspaceId !== context.workspaceId || winner.creatorUserId !== context.userId || winner.characterId !== input.characterId || winner.fingerprint !== fingerprint) throw new MediaUnavailable();
        return winner;
      }
    },
    // Called only by the worker, never an exported server action.
    dispatch: async (id: string) => {
      const context = await resolveContext(), db = getDatabase(); z.uuid().parse(id);
      const g = await db.mediaGeneration.findFirst({ where: { id, workspaceId: context.workspaceId, creatorUserId: context.userId, mode: { in: ["AUDIO", "PERFORMANCE"] }, type: "VIDEO" } });
      if (!g || g.status !== "PENDING" || g.submissionStartedAt || g.providerJobId) return;
      // Durable claim before any network call. A crashed/uncertain submission is never sent again.
      const claimed = await db.mediaGeneration.updateMany({ where: { id, status: "PENDING", submissionStartedAt: null, providerJobId: null }, data: { submissionStartedAt: new Date() } });
      if (!claimed.count) return;
      let attempted = false;
      try {
        const { input, image, quote, configuration } = await checked(g.parameters);
        if (configuration.provider !== g.provider || configuration.model !== g.model || quote.amount !== Number(g.quotedCost) || quote.currency !== g.costCurrency) throw new VideoError("price");
        const { source, bytes: sourceBytes } = await sources.read(input.sourceId, input.characterId);
        const imageBytes = await storage.read(image.storageKey);
        // Recheck after all I/O and immediately before charging the provider.
        await checked(g.parameters);
        await reserveGeneration("video", context);
        const provider = input.mode === "AUDIO" ? providers.audio : providers.performance;
        const urls = configuration.provider === "aitunnel-motion" ? videoInputUrls(g.id) : undefined;
        attempted = true;
        const remote = await provider.createVideo({ prompt: g.prompt!, duration: quote.duration, aspectRatio: input.aspectRatio, reference: { bytes: imageBytes, mimeType: image.mimeType, ...(urls ? { url: urls.image } : {}) }, ...(input.mode === "AUDIO" ? { audio: { bytes: sourceBytes, mimeType: source.mimeType } } : { performance: { bytes: sourceBytes, mimeType: source.mimeType, ...(urls ? { url: urls.video } : {}), keepOriginalSound: input.keepOriginalSound, orientation: input.orientation } }) });
        z.string().min(1).max(240).parse(remote.id);
        // Preserve an acknowledged provider ID even if a deadline check raced the POST.
        await db.mediaGeneration.updateMany({ where: { id, providerJobId: null }, data: { providerJobId: remote.id, status: remote.status === "FAILED" ? "FAILED" : "PROCESSING", parameters: { ...input, providerStatus: remote.status }, errorCode: remote.status === "FAILED" ? remote.error || "provider" : null, nextPollAt: new Date(Date.now() + 20000) } });
      } catch (error) {
        if (error instanceof VideoError && error.diagnostic) console.error("Reference video provider rejected request", JSON.stringify({ generationId: g.id, provider: g.provider, model: g.model, ...error.diagnostic }));
        const code = error instanceof VideoError || error instanceof GenerationSafetyError ? error.code : attempted ? "ambiguous" : "storage";
        await db.mediaGeneration.updateMany({ where: { id, status: "PENDING", providerJobId: null }, data: { status: "FAILED", errorCode: code } });
      }
    },
  };
}
