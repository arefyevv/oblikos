"use client";
import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const formats = [
  { key: "text", label: "Текст", description: "Задайте тему — персонаж напишет текст с учётом своей личности и памяти." },
  { key: "image", label: "Изображение", description: "Опишите сцену и выберите формат изображения персонажа." },
  { key: "video", label: "Видео", description: "Задайте сцену, движение и параметры видео персонажа." },
] as const;
export type CreationKind = typeof formats[number]["key"];
export function CreateContentWorkspace({ characterId, characters, initialKind, text, image, video }: {
  characterId: string; characters: { id: string; name: string }[]; initialKind: CreationKind;
  text: ReactNode; image: ReactNode; video: ReactNode;
}) {
  const [kind, setKind] = useState(initialKind);
  const field = useId(), router = useRouter();
  const panels = { text, image, video };
  return <section className="content-view">
    <div className="memory-heading"><div><h1>Создать контент</h1><p>{formats.find(format => format.key === kind)?.description}</p></div></div>
    <div className="creation-character form-field"><label htmlFor={`${field}-character`}>Персонаж</label><select id={`${field}-character`} value={characterId} onChange={event => router.push(`/content/new?characterId=${encodeURIComponent(event.target.value)}&kind=${kind}`, { scroll: false })}>{characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></div>
    <div className="content-buttons creation-formats" role="tablist" aria-label="Формат контента">
      {formats.map(format => <button key={format.key} type="button" role="tab" id={`${field}-${format.key}-tab`} aria-selected={kind === format.key} aria-controls={`${field}-${format.key}-panel`} tabIndex={kind === format.key ? 0 : -1} className={`button button--secondary${kind === format.key ? " creation-format--active" : ""}`} onClick={() => setKind(format.key)} onKeyDown={event => {
        const index = formats.findIndex(item => item.key === format.key);
        let next: number;
        if (event.key === "ArrowRight") next = (index + 1) % formats.length;
        else if (event.key === "ArrowLeft") next = (index + formats.length - 1) % formats.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = formats.length - 1;
        else return;
        event.preventDefault(); setKind(formats[next].key);
        document.getElementById(`${field}-${formats[next].key}-tab`)?.focus();
      }}>{format.label}</button>)}
    </div>
    {formats.map(format => <div key={format.key} role="tabpanel" id={`${field}-${format.key}-panel`} aria-labelledby={`${field}-${format.key}-tab`} hidden={kind !== format.key}>{panels[format.key]}</div>)}
  </section>;
}
