import { getCharacter } from "@/features/characters/queries";
import { CharacterOverview } from "@/features/characters/character-view";
export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  return <CharacterOverview character={await getCharacter((await params).id)} />;
}
