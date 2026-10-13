"use client";
import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setPrimaryImageAction, deleteImageAction } from "./actions";
import type { MediaView } from "./validation";

export function MediaGallery({ entries, global = false }: { entries: MediaView[]; global?: boolean }) {
  const [selected, setSelected] = useState<MediaView | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const running = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const router = useRouter();
  const video = selected?.type === "VIDEO";
  const noun = video ? "видео" : "изображение";
  function run(operation: "primary" | "delete") {
    if (!selected || running.current) return;
    const asset = selected; running.current = true; setError("");
    start(async () => {
      try {
        const result = operation === "primary" ? await setPrimaryImageAction(asset.id, asset.characterId) : await deleteImageAction(asset.id);
        if (!result.ok) { setError(result.message); return; }
        dialog.current?.querySelector("video")?.pause(); dialog.current?.close(); router.refresh();
      } catch { setError("Не удалось связаться с сервером. Повторите попытку."); }
      finally { running.current = false; }
    });
  }
  return <><div className="media-gallery">{entries.map((asset) => <article className="card media-card" key={asset.id}>
    <button className="media-thumbnail" aria-label={`Открыть ${asset.type === "VIDEO" ? "видео" : "изображение"} персонажа ${asset.characterName}`} onClick={(event) => {
      trigger.current = event.currentTarget; setSelected(asset); setConfirming(false); setError(""); dialog.current?.showModal();
    }}>{asset.type === "VIDEO" ? <><video src={`/api/media/${asset.id}`} preload="metadata" playsInline muted aria-hidden="true"/><span className="media-video-indicator" aria-hidden="true">▶ Видео</span></> : <Image src={`/api/media/${asset.id}`} alt={`Изображение персонажа ${asset.characterName}`} fill sizes="(max-width: 600px) 50vw, 25vw" unoptimized />}</button>
    <div className="media-card-copy">{global && <Link href={`/characters/${asset.characterId}/media`}>{asset.characterName}</Link>}<time dateTime={asset.createdAt}>{new Date(asset.createdAt).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}</time>{asset.duration !== null && <span>{Math.round(asset.duration * 10) / 10} с</span>}{asset.isPrimaryReference && <span className="badge">Основной образ</span>}</div>
  </article>)}</div>
  <dialog ref={dialog} className="character-dialog media-preview" aria-labelledby={title} onCancel={(event) => { if (running.current) event.preventDefault(); }} onClose={() => { dialog.current?.querySelector("video")?.pause(); setConfirming(false); setSelected(null); trigger.current?.focus(); }}>
    <h2 id={title}>{confirming ? `Удалить ${noun}?` : selected ? `${video ? "Видео" : "Изображение"}: ${selected.characterName}` : "Медиа"}</h2>
    {selected && <>
      {confirming ? <p>{selected.isPrimaryReference ? "Это основной образ персонажа. После удаления референс будет сброшен; новый образ нужно выбрать вручную." : `${video ? "Видео" : "Изображение"} будет удалено из медиатеки и хранилища. Отменить удаление нельзя.`}</p> : <><div className="media-full-image">{video ? <video key={selected.id} src={`/api/media/${selected.id}`} controls playsInline preload="metadata" aria-label={`Видео персонажа ${selected.characterName}`}/> : <Image src={`/api/media/${selected.id}`} alt={`Изображение персонажа ${selected.characterName}`} fill sizes="90vw" unoptimized />}</div><p>{selected.characterName} · {new Date(selected.createdAt).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}{selected.duration !== null ? ` · ${Math.round(selected.duration * 10) / 10} с` : ""}</p><details className="media-prompt"><summary>Описание генерации</summary><p>{selected.prompt}</p></details></>}
      {error && <p role="alert" className="form-message">{error}</p>}
      <div className="character-dialog-buttons">{confirming ? <><Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>Отмена</Button><Button className="character-danger" disabled={pending} aria-busy={pending} onClick={() => run("delete")}>{pending ? "Удаление…" : `Удалить ${noun}`}</Button></> : <><Button variant="secondary" autoFocus disabled={pending} onClick={() => dialog.current?.close()}>Закрыть</Button>{!video && !selected.isPrimaryReference && <Button disabled={pending} aria-busy={pending} onClick={() => run("primary")}>{pending ? "Сохранение…" : "Использовать как основной образ"}</Button>}<Button variant="quiet" disabled={pending} onClick={() => { dialog.current?.querySelector("video")?.pause(); setConfirming(true); setError(""); requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>(".character-dialog-buttons button")?.focus()); }}>Удалить</Button></> }</div>
    </>}
  </dialog></>;
}
