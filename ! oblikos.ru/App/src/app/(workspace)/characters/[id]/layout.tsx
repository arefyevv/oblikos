import { CharacterNavigation, CharacterSettingsLink } from "@/features/characters/character-navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { getCharacter } from "@/features/characters/queries";
import { PortraitPlaceholder, statusLabel } from "@/features/characters/character-view";
import Image from "next/image";
import { media } from "@/features/media/service";
export default async function CharacterLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const character = await getCharacter((await params).id);
  const primary = await media.primary(character.id);
  return <><ButtonLink href="/characters" variant="quiet">← К персонажам</ButtonLink><header className="character-header">{primary ? <div className="character-portrait character-portrait--compact media-header-image"><Image src={`/api/media/${primary.id}`} alt={`Основной образ персонажа ${character.name}`} fill sizes="88px" unoptimized /></div> : <PortraitPlaceholder compact />}<div className="character-header-copy"><h1>{character.name}</h1><p>{character.niche || "Ниша не указана"}</p><Badge>{statusLabel(character.status)}</Badge></div><div className="character-header-actions">{character.status !== "ARCHIVED" && <ButtonLink href={`/content/new?characterId=${character.id}`}>Создать контент</ButtonLink>}<CharacterSettingsLink id={character.id} /></div></header><CharacterNavigation id={character.id} /><div className="character-content">{children}</div></>;
}
