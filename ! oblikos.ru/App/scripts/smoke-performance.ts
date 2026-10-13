import "dotenv/config";
import { parseArgs } from "node:util";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { inspectImage } from "../src/features/media/image-file";
import { inspectSource } from "../src/features/media/source-file";
import { billedDuration, performancePrice } from "../src/features/media/performance-cost";
import { createSourceService } from "../src/features/media/source-operations";
import { createPerformanceService } from "../src/features/media/performance-operations";
import { createVideoService } from "../src/features/media/video-operations";
import { AitunnelAvatarProvider } from "../src/features/ai/avatar-provider";
import { motionEngine, motionProvider, savedMotionProvider } from "../src/features/ai/performance-provider";
import { LocalStorageProvider } from "../src/features/media/storage";
import { getDatabase } from "../src/db/client";
const { values } = parseArgs({ options: { case: { type: "string" }, image: { type: "string" }, audio: { type: "string" }, video: { type: "string" }, user: { type: "string" }, workspace: { type: "string" }, character: { type: "string" }, request: { type: "string" }, roles: { type: "string" }, motion: { type: "string" }, "keep-original-sound": { type: "boolean", default: false }, "allow-paid": { type: "boolean", default: false } } });
if (!["talking-cat", "gesture-character", "group-cats"].includes(values.case || "") || !values.image || Boolean(values.audio) === Boolean(values.video) || (values.case === "talking-cat" && !values.audio) || (values.case === "group-cats" && (!values.video || !values.roles?.trim()))) throw new Error("Use --case talking-cat --image FILE --audio FILE; --case gesture-character --image FILE --video FILE; or --case group-cats --image FILE --video FILE --roles TEXT --keep-original-sound. Default: dry-run. Paid calls require --allow-paid.");
const imageBytes = await readFile(values.image), sourceBytes = await readFile((values.audio || values.video)!);
const image = await inspectImage(imageBytes), source = await inspectSource(sourceBytes, values.audio ? "AUDIO" : "VIDEO");
const mode = values.audio ? "AUDIO" as const : "PERFORMANCE" as const;
const duration = billedDuration(mode, source.duration, "video"), price = performancePrice(mode, duration);
console.log(JSON.stringify({ case: values.case, dryRun: !values["allow-paid"], inputDuration: source.duration, billedDuration: duration, price, image: { width: image.width, height: image.height }, animalQuality: "UNVERIFIED", lipSync: mode === "AUDIO" ? "REQUIRES_VISUAL_REVIEW" : "NOT_GUARANTEED" }));
if (values["allow-paid"]) {
  if (!values.user || !values.workspace || !values.character) throw new Error("Paid test requires --user UUID --workspace UUID --character UUID from an authorized local account.");
  if (process.env.REFERENCE_VIDEO_WORKER_ENABLED !== "true") throw new Error("Configure and start the worker before the live test.");
  const context = async () => ({ userId: values.user!, workspaceId: values.workspace! });
  const storage = new LocalStorageProvider(), audio = new AitunnelAvatarProvider(), performance = motionProvider();
  const sources = createSourceService(context, storage), service = createPerformanceService(context, { audio, performance }, storage);
  // A known request UUID resumes the original receipt without uploading again.
  const requestId = values.request || randomUUID();
  const db = getDatabase();
  try {
    let existing = await db.mediaGeneration.findUnique({ where: { id: requestId } });
    if (!existing) {
      const uploadedImage = await sources.upload(values.character, "IMAGE", imageBytes);
      const uploadedSource = await sources.upload(values.character, values.audio ? "AUDIO" : "VIDEO", sourceBytes);
      const input = { characterId: values.character, referenceAssetId: uploadedImage.id, sourceId: uploadedSource.id, mode, motion: values.motion || (values.case === "talking-cat" ? "Moderate head movement. Preserve the cat muzzle, fur and paws; do not introduce a human face." : "Preserve the anthropomorphic body and paws. Match the reference gestures and singing mouth timing. Keep the full cast visible."), aspectRatio: "9:16", orientation: "video", keepOriginalSound: mode === "AUDIO" || values["keep-original-sound"] || motionEngine() === "fal", ...(values.case === "group-cats" ? { cast: "GROUP", roles: values.roles } : {}) };
      existing = await service.enqueue(input, requestId, await service.quote(input));
    }
    if (existing.creatorUserId !== values.user || existing.workspaceId !== values.workspace || existing.characterId !== values.character) throw new Error("Receipt is outside the authorized scope.");
    console.log(JSON.stringify({ requestId, action: "resume with --request UUID to avoid duplicate submission" }));
    await service.dispatch(requestId);
    const jobs = createVideoService(context, audio, storage, { resolveProvider: (name, model) => name === "aitunnel-avatar" ? audio : savedMotionProvider(name, model) || performance });
    const deadline = Date.now() + 10800000;
    let lastStatus = "";
    while (Date.now() < deadline) {
      const result = await jobs.status(requestId);
      if (result.status !== lastStatus) { console.log(JSON.stringify({ requestId, status: result.status })); lastStatus = result.status; }
      if (["READY", "FAILED"].includes(result.status)) {
        const receipt = { case: values.case, requestId, status: result.status, mediaId: result.mediaId, message: result.message, inputDuration: source.duration, quote: price, visualReview: { identity: "NOT_REVIEWED", mouthSync: "NOT_REVIEWED", muzzle: "NOT_REVIEWED", pawsAndBody: "NOT_REVIEWED", motionMatch: "NOT_REVIEWED", audioSync: "NOT_REVIEWED" } };
        await mkdir("artifacts", { recursive: true }); await writeFile(`artifacts/performance-live-${requestId}.json`, JSON.stringify(receipt, null, 2));
        console.log(JSON.stringify(receipt)); break;
      }
      await new Promise(resolve => setTimeout(resolve, 20000));
    }
  } finally { await db.$disconnect(); }
}
