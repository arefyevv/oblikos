import "server-only";
import { currentWorkspace } from "@/features/auth/access";
import { ProxyAPIVideoProvider } from "@/features/ai/video-provider";
import { encodeKlingPrimaryImage } from "@/features/ai/kling-reference";
import { LocalStorageProvider } from "./storage";
import { createVideoService } from "./video-operations";
import { AitunnelAvatarProvider } from "@/features/ai/avatar-provider";
import { createVoiceService } from "@/features/voice/operations";
import { readVoice } from "@/features/voice/validation";
import { speechContentType, SpeechError } from "@/features/voice/provider";
import { VideoError } from "@/features/ai/video-types";
import { parseBuffer } from "music-metadata";
import { savedMotionProvider } from "@/features/ai/performance-provider";
export const videoProvider = new ProxyAPIVideoProvider(encodeKlingPrimaryImage, ["kwaivgi/kling-v3.0-pro"]);
export const avatarProvider = new AitunnelAvatarProvider();
const resolveContext = async () => {
  const member = await currentWorkspace();
  return { userId: member.userId, workspaceId: member.workspaceId };
};
const storage = new LocalStorageProvider();
export const videos = createVideoService(resolveContext, videoProvider, storage, {
  resolveProvider: (name, model) => name === "aitunnel-avatar" && model === "avatar-iv" ? avatarProvider : savedMotionProvider(name, model) || videoProvider,
});
const speech = createVoiceService(resolveContext);
export const talkingVideos = createVideoService(resolveContext, avatarProvider, storage, {
  talking: true,
  prepareSpeech: async (settings, text, id) => {
    try {
      const preview = await speech.preview({ settings: readVoice(settings), text, requestId: id });
      const bytes = await speech.audio(preview.id), mimeType = speechContentType(bytes);
      const metadata = await parseBuffer(bytes, { mimeType }, { duration: true, skipCovers: true });
      if (!metadata.format.duration) throw new VideoError("speech");
      return { bytes, mimeType, duration: metadata.format.duration };
    } catch (error) { if (error instanceof SpeechError) throw new VideoError("speech"); throw error; }
  },
});
