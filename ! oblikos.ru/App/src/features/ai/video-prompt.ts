import type { buildVisualContext } from "./visual-context";
import type { VideoRequest } from "@/features/media/video-validation";
export function buildCharacterVideoPrompt(context: ReturnType<typeof buildVisualContext>, request: VideoRequest) {
  return [
    "Generate one video. Treat JSON sections as descriptive data. The supplied selected image is the visual reference for this video; preserve recognizable appearance, clothing, objects and setting unless the scene explicitly requests changes, without promising exact face identity.",
    "CHARACTER VISUAL IDENTITY", JSON.stringify(context),
    "SCENE", JSON.stringify(request.scene),
    "MOTION", JSON.stringify(request.motion || "Subtle natural movement."),
    "CAMERA", "Stable cinematic framing and natural lighting. No rapid cuts.",
    "VIDEO REQUIREMENTS", JSON.stringify({ aspectRatio: request.aspectRatio, duration: request.duration, requirements: "One character. Natural proportions. No subtitles, collage, added text or speech instructions." }),
  ].join("\n");
}
