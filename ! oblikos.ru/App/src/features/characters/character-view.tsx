import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { CharacterRecord } from "./service";
import { readVoice, voiceLabel } from "@/features/voice/validation";
import { voiceSamples } from "@/features/voice/samples";
import { emptyCharacter, genders, ages, type CharacterFormData } from "./validation";

export function PortraitPlaceholder({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "character-portrait character-portrait--compact" : "character-portrait"} aria-hidden="true"><Icon name="characters" size={compact ? 30 : 56} /></div>;
}
export function statusLabel(status: string) {
  return status === "ARCHIVED" ? "В архиве" : status === "DRAFT" ? "Черновик" : "Активный";
}
// Explicit DTO: no ownership, internal layer IDs or timestamps in client form props.
export function characterInput(character: CharacterRecord): CharacterFormData {
  return {
    voice: readVoice(character.voice),
    identity: { kind: character.kind === "ANIMAL" || character.kind === "FANTASY" ? character.kind : "HUMAN", name: character.name, gender: genders.find((value) => value === character.gender) || "", ageRange: ages.find((value) => value === character.ageRange) || "", niche: character.niche || "", biography: character.biography || "" },
    appearance: { hairColor: character.appearance?.hairColor || "", hairStyle: character.appearance?.hairStyle || "", clothingStyle: character.appearance?.clothingStyle || "", visualDescription: character.appearance?.visualDescription || "", additionalInstructions: character.appearance?.additionalInstructions || "" },
    personality: { communicationStyle: (character.personality?.communicationStyle || emptyCharacter.personality.communicationStyle) as CharacterFormData["personality"]["communicationStyle"], tone: character.personality?.tone || "", traits: (character.personality?.traits || []) as CharacterFormData["personality"]["traits"], description: character.personality?.description || "", additionalInstructions: character.personality?.additionalInstructions || "" },
  };
}
export function CharacterOverview({ character }: { character: CharacterRecord }) {
  const { appearance, personality } = character;
  const voice = readVoice(character.voice);
  const sample = voiceSamples[voice.voiceId]?.[0];
  const blocks = [
    { key: "identity", title: "Идентичность", subtitle: [character.gender, character.ageRange, character.niche].filter(Boolean).join(" · "), description: character.biography || "Биография пока не указана." },
    { key: "appearance", title: "Внешность", subtitle: [appearance?.hairColor, appearance?.hairStyle, appearance?.clothingStyle].filter(Boolean).join(" · "), description: appearance?.visualDescription || "Описание внешности пока не указано." },
    { key: "personality", title: "Личность", subtitle: [personality?.communicationStyle, personality?.tone].filter(Boolean).join(" · "), description: personality?.description || "Описание личности пока не указано.", traits: personality?.traits },
    { key: "voice", title: "Голос", subtitle: `${voiceLabel(voice.voiceId)} · ${voice.style}`, description: "Постоянный голос для озвучки контента персонажа." },
  ];
  return <div className="character-overview">{blocks.map((block) => <Card className="character-overview-card" key={block.key}>
    <h2>{block.title}</h2><p className="character-overview-subtitle">{block.subtitle || "Детали пока не указаны"}</p><p className="character-overview-description">{block.description}</p>
    {block.traits && block.traits.length > 0 && <ul className="character-trait-list">{block.traits.map((trait) => <li key={trait}>{trait}</li>)}</ul>}
    {block.key === "voice" && sample && <details className="voice-overview-preview"><summary>Прослушать пример</summary><audio controls preload="none" src={sample.url} aria-label={`Пример голоса ${voiceLabel(voice.voiceId)}`} /><p className="form-hint">Пример тембра. Темп и манера речи могут отличаться от ваших настроек.</p></details>}
    <ButtonLink variant="quiet" href={`/characters/${character.id}/${block.key}`} aria-label={block.key === "voice" ? "Настроить голос" : `Редактировать: ${block.title}`}>{block.key === "voice" ? "Настроить голос" : "Редактировать"} <Icon name="arrow" size={16} /></ButtonLink>
  </Card>)}</div>;
}
