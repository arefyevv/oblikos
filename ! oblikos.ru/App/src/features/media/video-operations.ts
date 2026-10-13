import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { Prisma } from "@/generated/prisma/client";
import { buildVisualContext } from "@/features/ai/visual-context";
import { buildCharacterVideoPrompt } from "@/features/ai/video-prompt";
import { VideoError, videoMessages, type VideoProvider, type VideoErrorCode } from "@/features/ai/video-types";
import { MediaUnavailable, MediaArchived } from "./operations";
import { talkingRequestSchema, videoRequestSchema, type VideoGenerationView } from "./video-validation";
import { inspectVideo } from "./video-file";
import type { StorageProvider } from "./storage";
import { assertGenerationEnabled, reserveGeneration, GenerationSafetyError } from "@/features/ai/safety";
import { restoreOriginalVideoSound } from "./original-video-sound";

type Context = { userId: string; workspaceId: string };
const include = { character: { select: { name: true } } } as const;
type Generation = Prisma.MediaGenerationGetPayload<{ include: typeof include }>;
const interval = 10000;
const leaseTime = 120000;
function view(g: Generation): VideoGenerationView {
  const code = g.errorCode as VideoErrorCode | null;
  const params = jsonParameters(g.parameters);
  const phase = g.status === "READY" || g.status === "FAILED" ? g.status : g.status === "PENDING" ? "SUBMITTING" : params.providerStatus === "PENDING" ? "QUEUED" : params.providerStatus === "READY" ? "SAVING" : "GENERATING";
  return { id: g.id, characterId: g.characterId, characterName: g.character.name, scene: g.scene || "", status: g.status, phase, mediaId: g.mediaId, message: code && code in videoMessages ? videoMessages[code] : null, createdAt: g.createdAt.toISOString() };
}
function jsonParameters(value: Prisma.JsonValue): Prisma.JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function validId(id: string) { if (!z.uuid().safeParse(id).success) throw new MediaUnavailable(); }
function conflict(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return true;
  return e instanceof Error && "cause" in e && typeof e.cause === "object" && e.cause !== null && "originalCode" in e.cause && ["40001", "40P01"].includes(String(e.cause.originalCode));
}
type VideoServiceOptions = {
  talking?: boolean;
  prepareSpeech?: (settings: unknown, text: string, id: string) => Promise<{ bytes: Buffer; mimeType: string; duration: number }>;
  resolveProvider?: (provider: string | null, model: string | null) => VideoProvider;
};
export function createVideoService(resolveContext: () => Promise<Context>, provider: VideoProvider, storage: StorageProvider, options: VideoServiceOptions = {}) {
  async function scoped<T>(context: Context, work: (tx: Prisma.TransactionClient) => Promise<T>, write = false): Promise<T> {
    validId(context.userId); validId(context.workspaceId);
    for (let attempt = 0; ; attempt++) {
      try { return await getDatabase().$transaction(async (tx) => {
        if (!await tx.workspaceMember.findUnique({ where: { workspaceId_userId: context } })) throw new MediaUnavailable();
        return work(tx);
      }, { isolationLevel: write ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.ReadCommitted }); }
      catch (e) { if (conflict(e) && attempt < 4) { await new Promise((r) => setTimeout(r, 25 * 2 ** attempt)); continue; } throw e; }
    }
  }
  async function character(tx: Prisma.TransactionClient, context: Context, id: string, write = false) {
    validId(id);
    const c = await tx.character.findFirst({ where: { id, workspaceId: context.workspaceId, deletedAt: null }, include: { appearance: true, personality: true } });
    if (!c) throw new MediaUnavailable();
    if (write && c.status === "ARCHIVED") throw new MediaArchived();
    return c;
  }
  async function find(tx: Prisma.TransactionClient, context: Context, id: string) {
    validId(id);
    const g = await tx.mediaGeneration.findFirst({ where: { id, workspaceId: context.workspaceId, type: "VIDEO", character: { workspaceId: context.workspaceId, deletedAt: null } }, include });
    if (!g) throw new MediaUnavailable();
    return g;
  }
  async function cleanup(key: string) {
    const asset = await getDatabase().mediaAsset.findUnique({ where: { storageKey: key } }).catch(() => undefined);
    if (asset === null) await storage.delete(key).catch(() => console.error("Video orphan cleanup failed"));
  }
  const service = {
    // Read only: the global UI observes the worker, never submits a generation.
    activity: async (knownIds: string[]) => {
      z.array(z.uuid()).max(48).parse(knownIds);
      const context = await resolveContext();
      return scoped(context, async (tx) => {
        const where = { workspaceId: context.workspaceId, type: "VIDEO" as const, character: { deletedAt: null, workspaceId: context.workspaceId } };
        const active = await tx.mediaGeneration.findMany({ where: { ...where, status: { in: ["PENDING", "PROCESSING"] } }, include, orderBy: { createdAt: "desc" }, take: 48 });
        const finished = knownIds.length ? await tx.mediaGeneration.findMany({ where: { ...where, id: { in: knownIds }, status: { in: ["READY", "FAILED"] } }, include, orderBy: { createdAt: "desc" }, take: 48 }) : [];
        return [...active, ...finished].map(view);
      });
    },
    list: async (characterId?: string) => {
      const context = await resolveContext();
      return scoped(context, async (tx) => {
        if (characterId) await character(tx, context, characterId);
        const where = { workspaceId: context.workspaceId, type: "VIDEO" as const, ...(characterId ? { characterId } : {}), character: { deletedAt: null, workspaceId: context.workspaceId } };
        const active = await tx.mediaGeneration.findMany({ where: { ...where, status: { in: ["PENDING", "PROCESSING"] } }, include, orderBy: { createdAt: "desc" }, take: 48 });
        const failed = active.length < 48 ? await tx.mediaGeneration.findMany({ where: { ...where, status: "FAILED" }, include, orderBy: { createdAt: "desc" }, take: 48 - active.length }) : [];
        // Failed history cannot displace active jobs from the recovery list.
        return [...new Map([...active, ...failed].map((g) => [g.id, g])).values()].map(view);
      });
    },
    create: async (input: unknown, requestId: string) => {
      const context = await resolveContext(); validId(requestId);
      const request = (options.talking ? talkingRequestSchema : videoRequestSchema).parse(input);
      const fingerprint = createHash("sha256").update(JSON.stringify(options.talking ? { kind: "talking", request } : request)).digest("hex");
      // Replay is resolved before provider configuration: an existing job survives an env change.
      const previous = await scoped(context, async (tx) => {
        await character(tx, context, request.characterId, true);
        const receipt = await tx.mediaGeneration.findUnique({ where: { id: requestId }, include });
        if (!receipt && !await tx.mediaAsset.findFirst({ where: { workspaceId: context.workspaceId, characterId: request.characterId, deletedAt: null, type: "IMAGE", ...(request.referenceAssetId ? { id: request.referenceAssetId } : { isPrimaryReference: true }) } })) throw new VideoError("reference");
        return receipt;
      });
      if (previous) {
        if (previous.workspaceId !== context.workspaceId || previous.characterId !== request.characterId || previous.type !== "VIDEO" || previous.fingerprint !== fingerprint) throw new MediaUnavailable();
        return view(previous);
      }
      assertGenerationEnabled("video");
      const settings = provider.configuration();
      z.string().min(1).max(80).parse(settings.provider); z.string().min(1).max(160).parse(settings.model);
      const capabilities = await provider.capabilities();
      if (!capabilities.referenceImages) throw new VideoError("configuration");
      if (!capabilities.durations.includes(request.duration) || !capabilities.aspectRatios.includes(request.aspectRatio)) throw new VideoError("invalid");
      let reference!: { id: string; storageKey: string; mimeType: string };
      let prompt = "";
      let voiceSettings: unknown;
      try {
        await scoped(context, async (tx) => {
          const c = await character(tx, context, request.characterId, true);
          const primary = await tx.mediaAsset.findFirst({ where: { characterId: c.id, workspaceId: context.workspaceId, deletedAt: null, type: "IMAGE", ...(request.referenceAssetId ? { id: request.referenceAssetId } : { isPrimaryReference: true }) } });
          if (!primary) throw new VideoError("reference");
          reference = primary;
          voiceSettings = c.voice;
          prompt = options.talking ? ["Animate the supplied image speaking the supplied audio. Preserve the exact voice and speech. Accurate lip synchronization and natural facial expression. Preserve the character's recognizable identity, species, anatomy, muzzle, paws, clothing, objects, background and framing from the supplied image. Never replace an animal face with a human face. Motion notes guide gestures and expressions only. No subtitles or added text.", "MOTION NOTES", JSON.stringify(request.motion), "VISUAL IDENTITY", JSON.stringify(buildVisualContext(c))].join("\n") : buildCharacterVideoPrompt(buildVisualContext(c), request);
          await tx.mediaGeneration.create({ data: { id: requestId, workspaceId: context.workspaceId, characterId: c.id, fingerprint, type: "VIDEO", provider: settings.provider, model: settings.model, referenceAssetId: primary.id, prompt, scene: request.scene, duration: request.duration, aspectRatio: request.aspectRatio }, include });
        }, true);
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        const g = await scoped(context, (tx) => find(tx, context, requestId));
        if (g.fingerprint !== fingerprint || g.characterId !== request.characterId) throw new MediaUnavailable();
        return view(g);
      }
      let attempted = false;
      try {
        const bytes = await storage.read(reference.storageKey);
        await scoped(context, async (tx) => {
          await character(tx, context, request.characterId, true);
          if (!await tx.mediaAsset.findFirst({ where: { id: reference.id, workspaceId: context.workspaceId, characterId: request.characterId, type: "IMAGE", deletedAt: null } })) throw new VideoError("reference");
        });
        await reserveGeneration("video", context);
        let audio: { bytes: Buffer; mimeType: string } | undefined;
        let duration = request.duration;
        if (options.talking) {
          if (!options.prepareSpeech) throw new VideoError("configuration");
          const speech = await options.prepareSpeech(voiceSettings, request.scene, requestId);
          const supported = capabilities.durations.filter((value) => value >= Math.ceil(speech.duration) && value <= request.duration).sort((a, b) => a - b);
          if (!Number.isFinite(speech.duration) || speech.duration <= 0 || !supported.length) throw new VideoError("speech_duration");
          duration = supported[0]; audio = { bytes: speech.bytes, mimeType: speech.mimeType };
          // Speech may take a minute: recheck character, reference and membership before submission.
          await scoped(context, async (tx) => {
            await character(tx, context, request.characterId, true);
            if (!await tx.mediaAsset.findFirst({ where: { id: reference.id, workspaceId: context.workspaceId, characterId: request.characterId, type: "IMAGE", deletedAt: null } })) throw new VideoError("reference");
          });
        }
        attempted = true;
        const job = await provider.createVideo({ prompt, duration, aspectRatio: request.aspectRatio, reference: { bytes, mimeType: reference.mimeType }, ...(audio ? { audio } : {}) });
        z.string().min(1).max(240).parse(job.id);
        // Persist even if membership changes during submission: no second paid job on replay.
        await getDatabase().mediaGeneration.updateMany({ where: { id: requestId, workspaceId: context.workspaceId, status: "PENDING" }, data: { providerJobId: job.id, status: job.status === "FAILED" ? "FAILED" : "PROCESSING", parameters: { providerStatus: job.status }, errorCode: job.status === "FAILED" ? job.error || "provider" : null, nextPollAt: new Date(Date.now() + interval) } });
      } catch (e) {
        const code = e instanceof VideoError ? e.code : e instanceof GenerationSafetyError ? e.code : attempted ? "ambiguous" : "storage";
        await getDatabase().mediaGeneration.updateMany({ where: { id: requestId, workspaceId: context.workspaceId, providerJobId: null, status: "PENDING" }, data: { status: "FAILED", errorCode: code } }).catch(() => undefined);
        // A committed job id takes precedence over a lost DB acknowledgement.
        return view(await scoped(context, (tx) => find(tx, context, requestId)));
      }
      return view(await scoped(context, (tx) => find(tx, context, requestId)));
    },
    status: async (id: string) => {
      const context = await resolveContext();
      const token = randomUUID(), now = new Date();
      const claimed = await scoped(context, async (tx) => {
        let g = await find(tx, context, id);
        if (g.status === "PENDING" && !g.providerJobId && g.mode !== "IMAGE" && !g.submissionStartedAt && now.getTime() - g.createdAt.getTime() > 10800000) {
          await tx.mediaGeneration.updateMany({ where: { id, status: "PENDING", providerJobId: null, submissionStartedAt: null }, data: { status: "FAILED", errorCode: "deadline" } });
          g = await find(tx, context, id);
        }
        if (g.status === "PENDING" && !g.providerJobId && ((g.mode === "IMAGE" && now.getTime() - g.createdAt.getTime() > (g.provider === "aitunnel-avatar" ? 300000 : 90000)) || (g.mode !== "IMAGE" && g.submissionStartedAt && now.getTime() - g.submissionStartedAt.getTime() > 180000))) {
          await tx.mediaGeneration.updateMany({ where: { id, status: "PENDING", providerJobId: null }, data: { status: "FAILED", errorCode: "ambiguous" } });
          g = await find(tx, context, id);
        }
        if (g.status !== "PROCESSING" || !g.providerJobId) return { g, acquired: false };
        if (g.pollAttempts >= 360 || now.getTime() - g.createdAt.getTime() > 10800000) {
          await tx.mediaGeneration.updateMany({ where: { id, status: "PROCESSING", OR: [{ pollLeaseUntil: null }, { pollLeaseUntil: { lte: now } }] }, data: { status: "FAILED", errorCode: "deadline" } });
          return { g: await find(tx, context, id), acquired: false };
        }
        const result = await tx.mediaGeneration.updateMany({ where: { id, workspaceId: context.workspaceId, status: "PROCESSING", AND: [{ OR: [{ nextPollAt: null }, { nextPollAt: { lte: now } }] }, { OR: [{ pollLeaseUntil: null }, { pollLeaseUntil: { lte: now } }] }] }, data: { nextPollAt: new Date(now.getTime() + interval), pollAttempts: { increment: 1 }, pollLeaseId: token, pollLeaseUntil: new Date(now.getTime() + leaseTime) } });
        return { g, acquired: result.count === 1 };
      }, true);
      if (!claimed.acquired) return view(claimed.g);
      const g = claimed.g;
      const owned = { id, workspaceId: context.workspaceId, type: "VIDEO" as const, status: "PROCESSING" as const, pollLeaseId: token };
      let key: string | undefined;
      try {
        const statusProvider = options.resolveProvider?.(g.provider, g.model) || provider;
        const settings = statusProvider.configuration();
        if (settings.provider !== g.provider || settings.model !== g.model) throw new VideoError("configuration");
        const remote = await statusProvider.getVideoStatus(g.providerJobId!);
        if (remote.id !== g.providerJobId) throw new VideoError("response");
        if (remote.status === "FAILED") {
          await scoped(context, (tx) => tx.mediaGeneration.updateMany({ where: owned, data: { status: "FAILED", errorCode: remote.error || "provider", pollLeaseId: null, pollLeaseUntil: null } }), true);
        } else if (remote.status === "READY") {
          await scoped(context, (tx) => tx.mediaGeneration.updateMany({ where: owned, data: { parameters: { ...jsonParameters(g.parameters), providerStatus: "READY" } } }), true);
          const file = await statusProvider.downloadVideo(g.providerJobId!);
          let metadata = inspectVideo(file.bytes, file.mimeType, g.provider === "aitunnel-avatar" ? 61 : g.provider === "aitunnel-motion" ? 16 : g.provider === "fal-motion" ? 31 : 13, g.provider === "aitunnel-motion" ? 2560 * 1440 : g.provider === "fal-motion" ? 1920 * 1080 : 1280 * 1280);
          if (g.mode !== "IMAGE" && g.sourceId) {
            const source = await getDatabase().videoSource.findFirst({ where: { id: g.sourceId, workspaceId: g.workspaceId, characterId: g.characterId } });
            if (!source || Math.abs(metadata.duration - source.duration) > 1) throw new VideoError("response");
            const params = g.parameters as { keepOriginalSound?: boolean };
            if (g.provider === "aitunnel-motion" && params.keepOriginalSound) {
              if (!source.hasAudio || source.userId !== g.creatorUserId) throw new VideoError("source");
              file.bytes = await restoreOriginalVideoSound(file.bytes, await storage.read(source.storageKey), source.duration);
              metadata = inspectVideo(file.bytes, file.mimeType, 16, 2560 * 1440);
            }
            if (g.provider === "fal-motion" && source.hasAudio && params.keepOriginalSound) {
              const { parseBuffer } = await import("music-metadata");
              if (!(await parseBuffer(file.bytes, { mimeType: file.mimeType })).format.hasAudio) throw new VideoError("response");
            }
          }
          if (g.provider === "aitunnel-avatar") {
            const { parseBuffer } = await import("music-metadata");
            const audioMetadata = await parseBuffer(file.bytes, { mimeType: file.mimeType });
            if (!audioMetadata.format.hasAudio) throw new VideoError("response");
          }
          key = await storage.save({ workspaceId: context.workspaceId, characterId: g.characterId, extension: metadata.extension, bytes: file.bytes });
          const storageKey = key;
          await scoped(context, async (tx) => {
            await character(tx, context, g.characterId);
            const latest = await find(tx, context, id);
            if (latest.status !== "PROCESSING" || latest.pollLeaseId !== token) return;
            if (!await tx.mediaAsset.findFirst({ where: { id: g.referenceAssetId!, workspaceId: context.workspaceId, characterId: g.characterId, deletedAt: null, type: "IMAGE" } })) throw new VideoError("reference");
            const asset = await tx.mediaAsset.create({ data: { workspaceId: context.workspaceId, characterId: g.characterId, type: "VIDEO", storageKey, mimeType: metadata.mimeType, width: metadata.width, height: metadata.height, duration: metadata.duration, fileSize: metadata.fileSize, prompt: g.prompt!, provider: g.provider!, model: g.model!, referenceAssetId: g.referenceAssetId, referenceUsed: true } });
            await tx.mediaGeneration.update({ where: { id }, data: { status: "READY", mediaId: asset.id, errorCode: null, pollLeaseId: null, pollLeaseUntil: null } });
          }, true);
          await cleanup(key);
        } else {
          await scoped(context, (tx) => tx.mediaGeneration.updateMany({ where: owned, data: { parameters: { ...jsonParameters(g.parameters), providerStatus: remote.status }, errorCode: null, pollLeaseId: null, pollLeaseUntil: null } }), true);
        }
      } catch (e) {
        if (key) await cleanup(key);
        const code = e instanceof VideoError ? e.code : "storage";
        // Provider/status/storage transport failures retry only GET/download, never create.
        const terminal = ["response", "reference", "moderation", "invalid", "balance", "missing"].includes(code);
        await getDatabase().mediaGeneration.updateMany({ where: owned, data: { ...(terminal ? { status: "FAILED" } : {}), errorCode: code, pollLeaseId: null, pollLeaseUntil: null, nextPollAt: new Date(Date.now() + Math.min(300000, interval * 2 ** Math.min(5, g.pollAttempts))) } }).catch(() => undefined);
      }
      return view(await scoped(context, (tx) => find(tx, context, id)));
    },
  };
  return service;
}
