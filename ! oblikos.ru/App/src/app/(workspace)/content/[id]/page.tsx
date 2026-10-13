import { notFound } from "next/navigation";
import { content } from "@/features/content/service";
import { ContentUnavailable } from "@/features/content/operations";
import { readVoice, voiceDeliverySchema } from "@/features/voice/validation";
import { ContentEditor } from "@/features/content/content-editor";

export default async function ContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let entry;
  try { entry = await content.get(id); }
  catch (error) { if (error instanceof ContentUnavailable) notFound(); throw error; }
  return <ContentEditor key={entry.id} entry={{ id: entry.id, characterId: entry.characterId, characterName: entry.character.name, archived: entry.character.status === "ARCHIVED", type: entry.type, instruction: entry.instruction, body: entry.body, voiceDefaults: readVoice(entry.character.voice), voiceOverride: voiceDeliverySchema.safeParse(entry.voiceOverride).success ? voiceDeliverySchema.parse(entry.voiceOverride) : null, updatedAt: entry.updatedAt.toISOString() }}/>;
}
