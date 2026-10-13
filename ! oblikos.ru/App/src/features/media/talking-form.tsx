"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { createTalkingVideoAction } from "./video-actions";
import { videoMessages } from "@/features/ai/video-types";
import { VideoReferencePicker, type VideoReferenceSelection } from "./video-reference-picker";

const emptyDraft = { opened: false, text: "", motion: "", duration: 15, ratio: "9:16" };

export function TalkingVideoForm({ characterId, hasPrimary, available }: { characterId: string; hasPrimary: boolean; available: boolean }) {
  const [draft, setDraft] = useState(emptyDraft);
  const { opened, text, motion, duration, ratio } = draft;
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState<VideoReferenceSelection>({ ready: false });
  const draftKey = `oblikos-talking-draft:${characterId}`;
  useEffect(() => {
    let restored = emptyDraft;
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (saved && typeof saved.text === "string" && typeof saved.motion === "string" &&
        saved.text.length <= 600 && saved.motion.length <= 1000 &&
        [15, 30, 60].includes(saved.duration) && ["9:16", "16:9", "1:1"].includes(saved.ratio)) {
        restored = { ...emptyDraft, text: saved.text, motion: saved.motion, duration: saved.duration, ratio: saved.ratio, opened: saved.opened === true };
      }
    } catch { /* A blocked or invalid browser draft must not prevent editing. */ }
    // Restore browser-only data after hydration; the initial server render stays deterministic.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(restored);
  }, [draftKey]);
  function updateDraft(patch: Partial<typeof emptyDraft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    try { sessionStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* Keep editing when browser storage is unavailable. */ }
  }
  const [pending, start] = useTransition(), running = useRef(false), field = useId(), router = useRouter();
  const [failed, setFailed] = useState(false);
  const receipt = useRef<{ id: string; fingerprint: string } | null>(null);
  const storageKey = `oblikos-talking-receipt:${characterId}`;
  return <div className="card content-form media-generation talking-video-card">
    <div className="talking-video-header"><div><h3>Говорящее видео</h3>
    <p className="page-description">Ваш текст, голос и образ персонажа.</p></div>
    {!available ? <p className="form-hint">Сервис говорящего видео пока не настроен.</p> : <Button type="button" variant="secondary" disabled={pending || reference.busy} aria-expanded={opened} aria-controls={`${field}-form`} onClick={() => updateDraft({ opened: !opened })}>{opened ? "Свернуть" : "Создать говорящее видео"}</Button>}
    </div>
    {opened && available && <form id={`${field}-form`} className="media-generation" aria-busy={pending} onSubmit={(event) => {
      event.preventDefault(); if (running.current) return;
      if (!reference.ready || !reference.id) { setMessage("Выберите фото или подтвердите новый образ для видео."); return; }
      const input = { characterId, scene: text.trim(), motion: motion.trim(), duration, aspectRatio: ratio, referenceAssetId: reference.id };
      if (!input.scene) { setMessage("Введите текст речи."); return; }
      const fingerprint = JSON.stringify(input);
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null") as { id: string; fingerprint: string } | null;
        if (saved?.fingerprint === fingerprint && /^[0-9a-f-]{36}$/i.test(saved.id)) receipt.current = saved;
      } catch { /* In-memory receipt still prevents duplicate submissions. */ }
      if (!receipt.current || receipt.current.fingerprint !== fingerprint) receipt.current = { id: crypto.randomUUID(), fingerprint };
      const id = receipt.current.id;
      try { sessionStorage.setItem(storageKey, JSON.stringify(receipt.current)); } catch { /* Browser storage may be unavailable. */ }
      running.current = true; setMessage("");
      start(async () => {
        try {
          const result = await createTalkingVideoAction(input, id);
          if (!result.ok) { setMessage(result.message); return; }
          if (result.generation.status === "FAILED") {
            setMessage(result.generation.message || "Не удалось создать видео.");
            setFailed(result.generation.message !== videoMessages.ambiguous);
          } else { setMessage("Видео создаётся. Можно закрыть вкладку и вернуться в медиатеку позже."); updateDraft({ opened: false }); }
          router.refresh();
        } catch { setMessage("Ответ не получен. Проверьте медиатеку. Повторное нажатие с тем же текстом проверит прежний запрос."); }
        finally { running.current = false; }
      });
    }}>
      {!hasPrimary && <p className="form-hint">Основной образ не выбран. Можно использовать любое фото персонажа или создать новый образ.</p>}
      <div className="talking-video-layout"><VideoReferencePicker key={characterId} characterId={characterId} kind="talking" aspectRatio={ratio} disabled={pending} onChange={setReference}/>
      <fieldset disabled={pending} className="character-form-fieldset content-fields">
        <div className="form-field"><label htmlFor={`${field}-text`}>Текст речи</label><textarea id={`${field}-text`} required maxLength={600} rows={4} value={text} onChange={(event) => updateDraft({ text: event.target.value })} placeholder="Что персонаж должен сказать?"/><p className="form-hint">{text.length} / 600 · Голос из настроек персонажа.</p></div>
        <details className="talking-video-motion" open={motion ? true : undefined}><summary>Мимика и жесты</summary><div className="form-field"><label htmlFor={`${field}-motion`}>Пожелания к движению</label><textarea id={`${field}-motion`} maxLength={1000} rows={2} value={motion} onChange={(event) => updateDraft({ motion: event.target.value })} placeholder="Спокойный взгляд в камеру, лёгкая улыбка."/><p className="form-hint">Одежда и фон берутся из выбранного фото.</p></div></details>
        <div className="character-fields"><div className="form-field"><label htmlFor={`${field}-ratio`}>Формат</label><select id={`${field}-ratio`} value={ratio} onChange={(event) => updateDraft({ ratio: event.target.value })}>{["9:16", "16:9", "1:1"].map((value) => <option key={value}>{value}</option>)}</select></div><div className="form-field"><label htmlFor={`${field}-duration`}>Лимит видео</label><select id={`${field}-duration`} value={duration} onChange={(event) => updateDraft({ duration: Number(event.target.value) })}>{[15, 30, 60].map((value) => <option key={value} value={value}>{value} секунд</option>)}</select></div></div>
      </fieldset></div>
      <p className="form-hint">Видео 720p · 8,50 ₽/сек по опубликованному тарифу, плюс озвучка. Длительность определяется речью, лимит — {duration} сек. Если речь длиннее, видео не запускается; озвучка уже оплачена.</p>
      <div className="talking-video-footer">
      <Button type="submit" disabled={pending || !reference.ready}>{pending ? "Готовим речь и видео…" : "Создать видео с речью"}</Button>
      <ButtonLink variant="quiet" href={`/characters/${characterId}/voice`}>Настроить голос →</ButtonLink></div>
      {failed && <Button type="button" variant="secondary" disabled={pending} onClick={() => { receipt.current = null; try { sessionStorage.removeItem(storageKey); } catch {} setFailed(false); setMessage("Следующая отправка — новая платная попытка."); }}>Подготовить новую попытку</Button>}
    </form>}
    {message && <p className="form-message" role="status">{message}</p>}
  </div>;
}
