"use client";
import { useId } from "react";
import { useRouter } from "next/navigation";

export function AnimationCharacterPicker({ selectedId, characters }: { selectedId: string; characters: { id: string; name: string; archived: boolean }[] }) {
  const field = useId(), router = useRouter();
  return <div className="creation-character form-field">
    <label htmlFor={field}>Для какого персонажа</label>
    <select id={field} value={selectedId} onChange={event => router.push(`/animation?characterId=${encodeURIComponent(event.target.value)}`, { scroll: false })}>
      {characters.map(character => <option key={character.id} value={character.id}>{character.name}{character.archived ? " · в архиве" : ""}</option>)}
    </select>
    <p className="form-hint">К нему сохранятся загруженные фото и готовые видео. Карточку персонажа открывать не нужно.</p>
  </div>;
}
