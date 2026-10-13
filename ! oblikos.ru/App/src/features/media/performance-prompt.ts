import type { PerformanceRequest } from "./performance-validation";

export function buildPerformancePrompt(input: PerformanceRequest, visualIdentity: unknown) {
  const group = input.cast === "GROUP";
  return [
    input.mode === "AUDIO"
      ? "Animate the supplied character speaking the supplied audio with accurate lip synchronization and natural expression. Preserve audio, identity, scene and all props."
      : group
        ? "Recreate the supplied video performance with ALL the characters from the supplied image in place of the original people. The image defines the cast, their distinct identities and scene. The video defines choreography, timing, gestures and mouth movements. Keep each image character distinct and present throughout the shot. Follow the role mapping below. Do not merge, duplicate, remove or humanize the characters. Match singing mouth movements to the original vocal timing where possible."
        : "Transfer the body performance and gestures from the reference video onto the character in the image. Preserve the image's identity, anatomy, clothing, scene and props. Do not replace an animal muzzle with a human face.",
    group ? "One continuous scene with the full image cast. Preserve each character's species, fur, paws and body proportions. No added text." : "One character, one scene. Preserve species, fur, paws and body proportions. No added text.",
    ...(group ? ["ROLE MAPPING (user direction)", JSON.stringify(input.roles)] : ["VISUAL IDENTITY", JSON.stringify(visualIdentity)]),
    "MOTION NOTES", JSON.stringify(input.motion),
  ].join("\n");
}
