"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { VideoReferencePicker, type VideoReferenceSelection } from "./video-reference-picker";
import { quotePerformanceAction, enqueuePerformanceAction } from "./performance-actions";
import type { PerformanceQuote, SourceView } from "./performance-validation";
import { videoActivityEvent } from "./video-activity";

export function PerformanceVideoForm({ characterId, availability, initiallyOpened = false, initialMode = "AUDIO" }: { characterId: string; availability: { audio: boolean; performance: boolean; motionEngine?: "aitunnel" | "fal"; motionModel?: string; originalSound?: boolean }; initiallyOpened?: boolean; initialMode?: "AUDIO" | "PERFORMANCE" }) {
  const field = useId(), router = useRouter();
  const [opened, setOpened] = useState(initiallyOpened), [mode, setMode] = useState<"AUDIO" | "PERFORMANCE">(initialMode);
  const [source, setSource] = useState<SourceView | null>(null), [reference, setReference] = useState<VideoReferenceSelection>({ ready: false });
  const [uploadedImage, setUploadedImage] = useState<string>(), [motion, setMotion] = useState("");
  const [ratio, setRatio] = useState<"9:16" | "16:9" | "1:1">("9:16"), [orientation, setOrientation] = useState<"image" | "video">("video");
  const [sound, setSound] = useState(true), [quote, setQuote] = useState<PerformanceQuote | null>(null);
  const [cast, setCast] = useState<"SINGLE" | "GROUP">("SINGLE"), [roles, setRoles] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const lock = useRef(false), receipt = useRef<{ fingerprint: string; id: string } | null>(null);
  const available = mode === "AUDIO" ? availability.audio : availability.performance;
  const aitunnel = availability.motionEngine !== "fal";
  const mini = aitunnel && availability.motionModel === "seedance-2.0-mini";
  const videoLabel = mini ? "Seedance 2.0 Mini · 720p" : "Hailuo 3 · 2K";
  const durationLabel = mini ? "4–15" : "5–15";
  const imageId = uploadedImage || (reference.ready ? reference.id : undefined);
  const storageKey = `oblikos-performance:${characterId}:${mode}`;
  const keepSound = sound && Boolean(source?.hasAudio) && (!aitunnel || availability.originalSound === true);
  const group = mode === "PERFORMANCE" && aitunnel && cast === "GROUP";
  const castReady = !group || Boolean(roles.trim());
  const input = { characterId, referenceAssetId: imageId, sourceId: source?.id, mode, motion, aspectRatio: mode === "AUDIO" || aitunnel ? ratio : "9:16", orientation: mode === "AUDIO" || aitunnel ? "video" : orientation, keepOriginalSound: mode === "AUDIO" ? true : keepSound, ...(group ? { cast: "GROUP", roles } : {}) };
  const fingerprint = JSON.stringify(input);
  const quoteCurrent = quote && quote.sourceId === source?.id && quote.fingerprint;
  const [quotedInput, setQuotedInput] = useState("");
  const referenceChanged = useCallback((selection: VideoReferenceSelection) => { setReference(selection); }, []);
  // Persist source selection without putting bytes or provider URLs into browser storage.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (saved?.source && saved.source.kind === (mode === "AUDIO" ? "AUDIO" : "VIDEO") && typeof saved.source.id === "string" && /^[0-9a-f-]{36}$/i.test(saved.source.id) && typeof saved.source.duration === "number" && Number.isFinite(saved.source.duration) && saved.source.duration > 0 && saved.source.duration <= 60 && typeof saved.source.hasAudio === "boolean" && typeof saved.source.expiresAt === "string" && new Date(saved.source.expiresAt).getTime() > Date.now()) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSource(saved.source);
      }
    } catch { /* An invalid or unavailable draft is ignored. */ }
  }, [storageKey, mode]);
  async function upload(file: File, kind: "IMAGE" | "AUDIO" | "VIDEO") {
    if (lock.current || !available) return;
    if (file.size > (kind === "VIDEO" ? 30 : kind === "AUDIO" ? 10 : 20) * 1024 * 1024) { setMessage("Файл превышает допустимый размер."); return; }
    lock.current = true; setBusy(true); setMessage(""); setQuote(null);
    try {
      const form = new FormData(); form.set("characterId", characterId); form.set("kind", kind); form.set("file", file);
      const response = await fetch("/api/video-sources", { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "Не удалось загрузить файл.");
      if (kind === "IMAGE") setUploadedImage(result.id);
      else { setSource(result); try { sessionStorage.setItem(storageKey, JSON.stringify({ source: result })); } catch {} }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось загрузить файл."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function calculate() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(""); setQuote(null);
    try { const result = await quotePerformanceAction(input); if (result.ok) { setQuote(result.quote); setQuotedInput(fingerprint); } else setMessage(result.message); }
    catch { setMessage("Не удалось проверить стоимость. Повторите расчёт."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function submit() {
    if (lock.current || !quote || quotedInput !== fingerprint || !available) return;
    lock.current = true; setBusy(true); setMessage("");
    const receiptKey = `${storageKey}:receipt`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(receiptKey) || "null");
      if (saved?.fingerprint === fingerprint && typeof saved.id === "string" && /^[0-9a-f-]{36}$/i.test(saved.id)) receipt.current = saved;
    } catch {}
    if (!receipt.current || receipt.current.fingerprint !== fingerprint) receipt.current = { id: crypto.randomUUID(), fingerprint };
    try { sessionStorage.setItem(receiptKey, JSON.stringify(receipt.current)); } catch {}
    try {
      const result = await enqueuePerformanceAction(input, receipt.current.id, quote);
      if (!result.ok) { setMessage(result.message); return; }
      setCanRetry(result.retryable);
      window.dispatchEvent(new CustomEvent(videoActivityEvent, { detail: { id: result.id } }));
      setMessage(result.status === "FAILED" ? "Задание завершилось ошибкой. Проверьте историю генераций. Повторный платный запуск автоматически не выполняется." : result.status === "READY" ? "Видео уже готово и сохранено в медиатеке." : "Задание сохранено. Видео появится в медиатеке; вкладку можно закрыть.");
      router.refresh();
    } catch { setMessage("Ответ не получен. Повторное нажатие проверит прежнее задание без повторной оплаты."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="card content-form media-generation talking-video-card">
    <div className="talking-video-header"><div><h3>Аудио и видеореференс</h3><p className="page-description">Оживите образ под запись или перенесите движения из видео.</p></div><Button type="button" variant="secondary" disabled={busy} aria-expanded={opened} onClick={() => setOpened(!opened)}>{opened ? "Свернуть" : "Выбрать референс"}</Button></div>
    {opened && <div className="media-generation">
      <div className="content-buttons" role="group" aria-label="Способ анимации">{(["AUDIO", "PERFORMANCE"] as const).map(value => <Button key={value} type="button" variant={mode === value ? "primary" : "secondary"} aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setSource(null); setQuote(null); setUploadedImage(undefined); setMessage(""); }}>{value === "AUDIO" ? "Оживить под аудио" : "Повторить исполнение"}</Button>)}</div>
      {!available && <p className="form-message" role="status">Режим пока недоступен: администратору нужно настроить провайдера, стоимость и фоновую обработку.</p>}
      {available && <>
        <p className="form-hint">{mode === "AUDIO" ? "Одна дорожка с одним голосом, WAV PCM или MP3, до 60 секунд и 10 МБ. Лицо или морда должны быть хорошо видны." : `Изображение задаёт внешность и сцену, видео — движения. MP4 H.264, ${aitunnel ? durationLabel : "3–30"} секунд, до 1080p и 30 МБ. Для танца выберите фото в полный рост; для жестов — с видимыми руками или лапами.`}</p>
        <p className="form-hint">Поддержка животных и фантазийных существ не проверена в Oblik OS. Модель может исказить морду, лапы и предметы; качество не гарантировано.</p>
        <div className="talking-video-layout"><div className="media-generation">
          <VideoReferencePicker key={`${characterId}:${mode}`} characterId={characterId} kind={mode === "AUDIO" ? "performance-audio" : "performance-video"} aspectRatio={ratio} disabled={busy} autoSelect={false} onChange={referenceChanged}/>
          <div className="form-field"><label htmlFor={`${field}-image`}>Загрузить изображение сцены</label><input id={`${field}-image`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file, "IMAGE"); event.target.value = ""; }}/><p className="form-hint">JPEG, PNG или WebP до 20 МБ. Загрузка сохраняет фото в медиатеку.</p></div>
          {uploadedImage && <><div className="performance-image-preview">{/* Private media route has workspace authorization. */}<picture><img src={`/api/media/${uploadedImage}`} alt="Загруженная сцена для видео" /></picture></div><Button type="button" variant="quiet" disabled={busy} onClick={() => setUploadedImage(undefined)}>Использовать выбранное фото из медиатеки</Button></>}
        </div><div className="content-fields">
          <div className="form-field"><label htmlFor={`${field}-source`}>{mode === "AUDIO" ? "Аудиозапись" : "Видео исполнения"}</label><input key={mode} id={`${field}-source`} type="file" disabled={busy} accept={mode === "AUDIO" ? "audio/wav,audio/mpeg" : "video/mp4"} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file, mode === "AUDIO" ? "AUDIO" : "VIDEO"); event.target.value = ""; }}/></div>
          {source && <div className="performance-source-preview">{mode === "AUDIO" ? <audio controls preload="metadata" src={`/api/video-sources/${source.id}?characterId=${characterId}`} aria-label="Прослушать исходное аудио"/> : <video controls playsInline preload="metadata" src={`/api/video-sources/${source.id}?characterId=${characterId}`} aria-label="Предпросмотр исполнения"/>}<p className="form-hint">{source.duration.toFixed(2)} сек · Исходник хранится 24 часа.</p></div>}
          {mode === "PERFORMANCE" && aitunnel && <>
            <div className="form-field"><label htmlFor={`${field}-cast`}>Кто повторяет видео</label><select id={`${field}-cast`} disabled={busy} value={cast} onChange={event => setCast(event.target.value as typeof cast)}><option value="SINGLE">Один персонаж</option><option value="GROUP">Несколько героев с фото · эксперимент</option></select></div>
            {group && <div className="form-field"><label htmlFor={`${field}-roles`}>Кто кого заменяет</label><textarea id={`${field}-roles`} value={roles} maxLength={1000} rows={3} disabled={busy} placeholder="Левый котёнок — человек слева; кремовый по центру — человек в центре; правый серый — человек справа." onChange={event => setRoles(event.target.value)}/><p className="form-hint">Опишите всех героев на общем фото. Это инструкция модели: точное назначение ролей, сохранение каждого героя и синхронизация трёх морд пока не подтверждены.</p></div>}
            <label className="form-hint"><input type="checkbox" checked={keepSound} disabled={busy || !source?.hasAudio || !availability.originalSound} onChange={event => setSound(event.target.checked)}/> Сохранить оригинальную песню и звук</label>
            <p className="form-hint">{!availability.originalSound ? "Возврат исходного звука пока недоступен. " : source && !source.hasAudio ? "В исходнике нет звуковой дорожки. " : "Исходная дорожка заменит звук модели после генерации. "}Подпевание задаётся пожеланиями; точная синхронизация рта не гарантирована.</p>
          </>}
          <div className="form-field"><label htmlFor={`${field}-motion`}>Пожелания к движению</label><textarea id={`${field}-motion`} maxLength={1000} rows={3} value={motion} disabled={busy} onChange={event => setMotion(event.target.value)}/></div>
          {mode === "AUDIO" || aitunnel ? <><div className="form-field"><label htmlFor={`${field}-ratio`}>Формат</label><select id={`${field}-ratio`} disabled={busy} value={ratio} onChange={event => setRatio(event.target.value as typeof ratio)}>{["9:16", "16:9", "1:1"].map(value => <option key={value}>{value}</option>)}</select></div>{mode === "PERFORMANCE" && <p className="form-hint">{videoLabel}. Для длинного сценария подготовьте отдельные сцены по {durationLabel} секунд. Исходник автоматически не обрезается.</p>}</> : <>
            <div className="form-field"><label htmlFor={`${field}-orientation`}>Ориентация персонажа</label><select id={`${field}-orientation`} disabled={busy} value={orientation} onChange={event => setOrientation(event.target.value as typeof orientation)}><option value="video">Как в видео · до 30 сек</option><option value="image">Как на фото · до 10 сек</option></select></div>
            <label className="form-hint"><input type="checkbox" checked={sound} disabled={busy || !source?.hasAudio} onChange={event => setSound(event.target.checked)}/> Сохранить звук видеореференса</label><p className="form-hint">{source && !source.hasAudio ? "У референса нет звуковой дорожки. " : ""}Это перенос звука, не подтверждённая синхронизация рта. Отдельное аудио и управление переносом мимики в этом режиме недоступны. Формат кадра определяется исходным изображением.</p>
          </>}
        </div></div>
        {quoteCurrent && quotedInput === fingerprint && <p className="form-message" role="status">{quote.amount.toFixed(2)} {quote.currency === "RUB" ? "₽" : "$"} · оценка по настройкам сервера для {quote.duration} сек. {mode === "AUDIO" ? "Озвучка не создаётся: используется загруженная запись. Видео 720p." : aitunnel ? `${videoLabel}. ${keepSound ? "Оригинальная звуковая дорожка." : "Звук создаёт модель."} Синхронизация рта не гарантирована.` : "Разрешение определяет провайдер."}</p>}
        <div className="content-buttons"><Button type="button" variant="secondary" disabled={busy || !imageId || !source || !castReady || reference.busy} onClick={() => void calculate()}>Рассчитать стоимость</Button><Button type="button" disabled={busy || !quoteCurrent || quotedInput !== fingerprint || !imageId || !castReady || reference.busy} onClick={() => void submit()}>{busy ? "Обрабатываем…" : "Создать видео по референсу"}</Button></div>
        {canRetry && <Button type="button" variant="secondary" disabled={busy} onClick={() => { receipt.current = null; try { sessionStorage.removeItem(`${storageKey}:receipt`); } catch {} setCanRetry(false); setQuote(null); setMessage("Следующий запуск — новая платная попытка. Сначала рассчитайте стоимость снова."); }}>Подготовить новую попытку</Button>}
      </>}
    </div>}
    {message && <p className="form-message" role="status">{message}</p>}
  </div>;
}
