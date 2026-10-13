import { notFound } from "next/navigation";
import { characterNavigation } from "@/config/navigation";
import { Card } from "@/components/ui/card";
import { FeaturePreview } from "@/components/ui/feature-preview";
import { getCharacter } from "@/features/characters/queries";
import { characterInput } from "@/features/characters/character-view";
import { CharacterForm } from "@/features/characters/character-form";
import { CharacterActions } from "@/features/characters/character-actions";
import type { CharacterSection } from "@/features/characters/validation";
import { memory } from "@/features/memory/service";
import { MemoryView } from "@/features/memory/memory-view";
import { memoryListSchema } from "@/features/memory/validation";
import { content } from "@/features/content/service";
import { ContentList } from "@/features/content/content-list";
import { VisualIdentity } from "@/features/media/visual-identity";

const descriptions: Record<string, string> = { content: "Работа с материалами персонажа появится на следующих этапах.", history: "История действий и результатов станет доступна на следующих этапах." };
export default async function CharacterSectionPage({ params, searchParams }: { params: Promise<{ id: string; section: string }>; searchParams: Promise<{ type?: string; page?: string }> }) {
  const { id, section } = await params;
  const item = characterNavigation.find((entry) => entry.segment === section && section !== "");
  if (!item) notFound();
  const character = await getCharacter(id);
  if (section === "content") {
    const result = await content.list(id);
    return <ContentList characterId={id} entries={result.entries} total={result.total} archived={character.status === "ARCHIVED"}/>;
  }
  if (section === "memory") {
    const options = memoryListSchema.safeParse({ type: (await searchParams).type });
    const filter = options.success ? options.data.type : undefined;
    const result = await memory.list(id, { type: filter });
    return <MemoryView key={id} characterId={id} total={result.total} filteredTotal={result.filteredTotal} filter={filter} entries={result.entries.map((entry) => ({ id: entry.id, type: entry.type, content: entry.content, importance: entry.importance, isPinned: entry.isPinned, updatedAt: entry.updatedAt.toISOString() }))} />;
  }
  if (section === "media") {
    const rawPage = Number((await searchParams).page || 1);
    const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 10000 ? rawPage : 1;
    const rawType = (await searchParams).type;
    const mediaType = rawType === "IMAGE" || rawType === "VIDEO" ? rawType : undefined;
    return <VisualIdentity characterId={id} archived={character.status === "ARCHIVED"} page={page} type={mediaType}/>;
  }
  if (["identity", "appearance", "personality", "voice"].includes(section)) return <CharacterForm key={`${id}-${section}`} id={id} section={section as CharacterSection} initial={characterInput(character)} />;
  if (section === "settings") return <Card className="character-settings-card"><CharacterActions id={id} name={character.name} archived={character.status === "ARCHIVED"} settings /></Card>;
  return <FeaturePreview title={section === "content" ? "Контент пока недоступен" : `${item.label} пока недоступна`} description={descriptions[section]} stage={item.stage} icon={item.icon} />;
}
