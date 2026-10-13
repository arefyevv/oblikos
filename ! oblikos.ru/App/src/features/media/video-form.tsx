"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import type { VideoCapabilities } from "@/features/ai/video-types";
import { videoRequestSchema } from "./video-validation";
import { createVideoAction } from "./video-actions";
import { VideoReferencePicker, type VideoReferenceSelection } from "./video-reference-picker";
import { videoActivityEvent } from "./video-activity";

export function VideoGenerationForm({ characterId, hasPrimary, capabilities, configurationError, initiallyOpened = false, primaryHref = "#visual-identity-title" }: { characterId: string; hasPrimary: boolean; capabilities: VideoCapabilities | null; configurationError?: string; initiallyOpened?: boolean; primaryHref?: string }) {
  const [opened, setOpened] = useState(initiallyOpened), [scene, setScene] = useState(""), [motion, setMotion] = useState("");
  const [reference, setReference] = useState<VideoReferenceSelection>({ ready: false });
  const [duration, setDuration] = useState(capabilities?.durations[0] || 4), [aspectRatio, setRatio] = useState(capabilities?.aspectRatios[0] || "16:9");
  const [message, setMessage] = useState(""), [retry, setRetry] = useState(false), [pending, start] = useTransition();
  const running = useRef(false), receipt = useRef<{ id: string; fingerprint: string } | null>(null);
  const field = useId(), router = useRouter();
  const storageKey = `oblikos-video-receipt:${characterId}`;
  if (configurationError) return <div className="card content-form media-generation"><h3>Видео персонажа</h3><p>{configurationError}</p></div>;
  return <div className="card content-form media-generation">
    {!initiallyOpened && <Button variant="secondary" disabled={pending || reference.busy} aria-expanded={opened} aria-controls={`${field}-form`} onClick={() => setOpened(!opened)}>{opened ? "Свернуть видео" : "Создать видео"}</Button>}
    {opened && <form id={`${field}-form`} className="media-generation" aria-busy={pending} onSubmit={(event) => {
      event.preventDefault(); if (running.current || configurationError || !capabilities) return;
      if (!reference.ready || !reference.id) { setMessage("Выберите фото или подтвердите новый образ для видео."); return; }
      const parsed = videoRequestSchema.safeParse({ characterId, scene, motion, duration, aspectRatio, referenceAssetId: reference.id });
      if (!parsed.success) { setMessage("Проверьте описание сцены и параметры видео."); return; }
      const fingerprint = JSON.stringify(parsed.data);
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (!receipt.current && stored) { const candidate = JSON.parse(stored); if (typeof candidate.id === "string" && candidate.fingerprint === fingerprint) receipt.current = candidate; }
      } catch { /* Durable DB receipt remains authoritative. */ }
      if (retry || receipt.current?.fingerprint !== fingerprint) receipt.current = { id: crypto.randomUUID(), fingerprint };
      const requestId = receipt.current.id;
      try { sessionStorage.setItem(storageKey, JSON.stringify(receipt.current)); } catch { /* The current-tab receipt is still retained. */ }
      running.current = true; setMessage(""); setRetry(false);
      start(async () => {
        try {
          const result = await createVideoAction(parsed.data, requestId);
          if (!result.ok) { setMessage(result.message); return; }
          window.dispatchEvent(new CustomEvent(videoActivityEvent, { detail: { id: result.generation.id } }));
          setMessage(result.generation.message || "Видео создаётся. Обычно это занимает несколько минут.");
          setRetry(result.generation.status === "FAILED");
          if (result.generation.status !== "FAILED") { receipt.current = null; try { sessionStorage.removeItem(storageKey); } catch {} }
          router.refresh();
        } catch { setMessage("Ответ не получен. Проверьте медиатеку. Повторная отправка этого же запроса защищена от дублирования."); }
        finally { running.current = false; }
      });
    }}>
      <h3>Новое видео</h3><p className="form-hint">Выберите фото для этого ролика или создайте новый образ. Точное совпадение внешности зависит от модели.</p>
      {!hasPrimary && <ButtonLink variant="quiet" href={primaryHref}>К изображениям персонажа →</ButtonLink>}
      <VideoReferencePicker key={characterId} characterId={characterId} kind="video" aspectRatio={aspectRatio} disabled={pending} onChange={setReference}/>
      <fieldset className="character-form-fieldset content-fields" disabled={pending || Boolean(configurationError) || !capabilities}>
        <div className="form-field"><label htmlFor={`${field}-scene`}>Описание сцены *</label><textarea required id={`${field}-scene`} rows={3} maxLength={3000} value={scene} onChange={(e) => setScene(e.target.value)} placeholder="Персонаж стоит возле окна современного кафе." /></div>
        <div className="form-field"><label htmlFor={`${field}-motion`}>Движение персонажа / действие</label><textarea id={`${field}-motion`} rows={2} maxLength={1000} value={motion} onChange={(e) => setMotion(e.target.value)} placeholder="Медленно поворачивается к камере и улыбается." /></div>
        <div className="media-form-options"><div className="form-field"><label htmlFor={`${field}-ratio`}>Формат кадра</label><select id={`${field}-ratio`} value={aspectRatio} onChange={(e) => setRatio(e.target.value)}>{capabilities?.aspectRatios.map((r) => <option key={r}>{r}</option>)}</select></div><div className="form-field"><label htmlFor={`${field}-duration`}>Длительность</label><select id={`${field}-duration`} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{capabilities?.durations.map((d) => <option key={d} value={d}>{d} секунд</option>)}</select></div></div>
      </fieldset>
      {configurationError && <p role="alert" className="form-message">{configurationError}</p>}
      {message && <p role="status" className="form-message">{message}</p>}
      <p className="form-hint">Пропорции готового видео могут повторять исходный портрет, даже если выбран другой формат.</p>
      <p className="form-hint">Готовое видео сохраняется автоматически. Новая попытка — отдельная платная генерация.</p>
      <Button type="submit" disabled={pending || !reference.ready || Boolean(configurationError) || !capabilities}>{pending ? "Запускаем видео…" : retry ? "Попробовать снова" : "Сгенерировать видео"}</Button>
    </form>}
  </div>;
}
