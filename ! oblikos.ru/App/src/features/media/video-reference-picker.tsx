"use client";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { generateImageAction } from "./actions";
import { listVideoReferencesAction, type VideoReferenceImage } from "./video-reference-actions";

export type VideoReferenceSelection = { id?: string; ready: boolean; busy?: boolean };
type Draft = { mode: "existing" | "new"; instruction: string; selectedId?: string; previewId?: string };
const emptyDraft: Draft = { mode: "existing", instruction: "" };

export function VideoReferencePicker({ characterId, kind, aspectRatio, disabled, onChange, autoSelect = true }: {
  characterId: string; kind: "video" | "talking" | "performance-audio" | "performance-video"; aspectRatio: string; disabled: boolean; autoSelect?: boolean;
  onChange: (selection: VideoReferenceSelection) => void;
}) {
  const field = useId();
  const draftKey = `oblikos-video-reference:${kind}:${characterId}`;
  const receiptKey = `${draftKey}:receipt`;
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [images, setImages] = useState<VideoReferenceImage[]>([]);
  const [selected, setSelected] = useState<VideoReferenceImage | null>(null);
  const [total, setTotal] = useState(0), [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true), [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const running = useRef(false);
  const receipt = useRef<{ id: string; fingerprint: string } | null>(null);
  function save(next: Draft) {
    setDraft(next);
    try { sessionStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* Editing works without browser storage. */ }
  }
  useEffect(() => {
    let active = true;
    let restored = emptyDraft;
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      const validId = (id: unknown) => id === undefined || (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
      if (saved && ["existing", "new"].includes(saved.mode) && typeof saved.instruction === "string" && saved.instruction.length <= 3000 && validId(saved.selectedId) && validId(saved.previewId)) restored = saved;
    } catch { /* Ignore invalid drafts. */ }
    onChange({ ready: false });
    listVideoReferencesAction(characterId, 1, restored.previewId || restored.selectedId).then(result => {
      if (!active) return;
      setDraft(restored);
      if (!result.ok) { setMessage(result.message); return; }
      setImages(result.images); setTotal(result.total);
      const chosen = result.selected || (autoSelect && !restored.selectedId && !restored.previewId ? result.images[0] : null) || null;
      setSelected(chosen);
      if (restored.mode === "existing" && chosen) onChange({ id: chosen.id, ready: true });
      if ((restored.selectedId || restored.previewId) && !chosen) setMessage("Сохранённое фото недоступно. Выберите другое.");
    }).catch(() => { if (active) setMessage("Не удалось загрузить фото. Попробуйте ещё раз."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [characterId, draftKey, onChange, autoSelect]);

  async function loadPage(nextPage: number) {
    if (running.current) return;
    running.current = true; setLoading(true); setMessage("");
    try {
      const result = await listVideoReferencesAction(characterId, nextPage, selected?.id);
      if (!result.ok) { setMessage(result.message); return; }
      setImages(result.images); setTotal(result.total); setPage(nextPage);
    } catch { setMessage("Не удалось загрузить фото. Попробуйте ещё раз."); }
    finally { running.current = false; setLoading(false); }
  }
  async function generate() {
    if (running.current || disabled) return;
    const instruction = draft.instruction.trim();
    if (!instruction) { setMessage("Опишите одежду, место и детали нового образа."); return; }
    const input = { characterId, instruction, format: "SCENE", aspectRatio };
    const fingerprint = JSON.stringify(input);
    try {
      const saved = JSON.parse(sessionStorage.getItem(receiptKey) || "null");
      if (saved?.fingerprint === fingerprint && typeof saved.id === "string" && /^[0-9a-f-]{36}$/i.test(saved.id)) receipt.current = saved;
    } catch { /* In-memory receipt still protects this request. */ }
    if (receipt.current?.fingerprint !== fingerprint) receipt.current = { id: crypto.randomUUID(), fingerprint };
    try { sessionStorage.setItem(receiptKey, JSON.stringify(receipt.current)); } catch { /* Keep the in-memory receipt. */ }
    running.current = true; setGenerating(true); setMessage(""); setCanRetry(false); onChange({ ready: false, busy: true });
    try {
      const result = await generateImageAction(input, receipt.current.id);
      if (!result.ok || !result.id) { setMessage(result.message); setCanRetry(Boolean(result.terminal)); return; }
      const image: VideoReferenceImage = { id: result.id, createdAt: new Date().toISOString(), isPrimaryReference: false };
      setSelected(image);
      save({ ...draft, previewId: image.id, selectedId: undefined });
      setMessage("Образ сохранён в медиатеке. Проверьте фото и подтвердите его для видео.");
      receipt.current = null;
      try { sessionStorage.removeItem(receiptKey); } catch { /* Successful receipt is no longer needed. */ }
    } catch { setMessage("Ответ не получен. Проверьте медиатеку. Повторное нажатие проверит прежний запрос."); }
    finally { running.current = false; setGenerating(false); onChange({ ready: false }); }
  }
  const busy = disabled || generating || loading;
  return <fieldset className="character-form-fieldset video-reference-picker" disabled={disabled || generating}>
    <legend>Образ для этого видео</legend>
    <div className="content-buttons video-reference-tabs" role="group" aria-label="Источник образа">
      <Button variant="secondary" aria-pressed={draft.mode === "existing"} disabled={busy} onClick={() => {
        save({ ...draft, mode: "existing", previewId: undefined, selectedId: selected?.id });
        onChange({ id: selected?.id, ready: Boolean(selected) }); setMessage("");
      }}>Готовое фото</Button>
      <Button variant="secondary" aria-pressed={draft.mode === "new"} disabled={busy} onClick={() => {
        save({ ...draft, mode: "new", previewId: undefined }); onChange({ ready: false }); setMessage("");
      }}>Новый образ</Button>
    </div>
    {draft.mode === "existing" ? <>
      {loading ? <p className="form-hint" role="status">Загружаем фото…</p> : <div id={`${field}-photos`}>
        {!images.length && <p className="form-hint">Пока нет фото. Создайте новый образ для видео.</p>}
        <div className="video-reference-grid" role="group" aria-label="Фото персонажа">{images.map((image, index) => <button key={image.id} type="button" className="video-reference-choice" aria-pressed={selected?.id === image.id} aria-label={`Выбрать фото ${index + 1 + (page - 1) * 48}${image.isPrimaryReference ? ", основной образ" : ""}`} disabled={busy} onClick={() => {
          setSelected(image); save({ ...draft, selectedId: image.id, previewId: undefined }); onChange({ id: image.id, ready: true }); setMessage("");
        }}><Image src={`/api/media/${image.id}`} alt="" width={120} height={150} unoptimized /><span>{image.isPrimaryReference ? "Основной образ" : `Фото ${index + 1 + (page - 1) * 48}`}</span>{selected?.id === image.id && <span className="video-reference-check" aria-hidden="true">✓</span>}</button>)}</div>
      </div>}
      {(page > 1 || page * 48 < total || message) && <div className="content-buttons video-reference-pagination">
        {page > 1 && <Button variant="quiet" disabled={busy} onClick={() => loadPage(page - 1)}>Предыдущие фото</Button>}
        {page * 48 < total && <Button variant="quiet" disabled={busy} onClick={() => loadPage(page + 1)}>Следующие фото</Button>}
        {message && <Button variant="quiet" disabled={busy} onClick={() => loadPage(page)}>Обновить фото</Button>}
      </div>}
    </> : <>
      <div className="form-field"><label htmlFor={`${field}-scene`}>Описание нового образа</label><textarea id={`${field}-scene`} rows={4} maxLength={3000} value={draft.instruction} placeholder="Белая футболка, голубые джинсы, микрофон в руке. Стоит на Патриарших прудах, дневной свет, кадр по пояс." onChange={event => {
        save({ ...draft, instruction: event.target.value, previewId: undefined }); onChange({ ready: false });
      }}/></div>
      <p className="form-hint">Создадим фото для подтверждения. Фото оплачивается отдельно, видео пока не запускается.</p>
      <Button variant="secondary" disabled={busy || !draft.instruction.trim()} onClick={generate}>{generating ? "Создаём образ…" : "Сгенерировать образ для видео"}</Button>
      {canRetry && <Button variant="quiet" disabled={busy} onClick={() => {
        receipt.current = null;
        try { sessionStorage.removeItem(receiptKey); } catch { /* Next click creates an explicit new request. */ }
        setCanRetry(false); setMessage("Следующая генерация образа будет новой платной попыткой.");
      }}>Подготовить новую попытку создания образа</Button>}
    </>}
    {selected && draft.mode === "new" && draft.previewId && <div className="video-reference-preview video-reference-preview--new">
      <Image src={`/api/media/${selected.id}`} alt="Новый образ для видео" width={160} height={200} unoptimized />
      <div className="video-reference-summary"><strong>Новый образ</strong>
      <Button disabled={busy} onClick={() => {
        save({ ...draft, mode: "existing", selectedId: selected.id, previewId: undefined });
        onChange({ id: selected.id, ready: true }); setMessage("Образ выбран. Теперь можно создать видео.");
        void loadPage(1);
      }}>Использовать этот образ для видео</Button>
      </div>
    </div>}
    {message && <p className="form-message" role="status">{message}</p>}
  </fieldset>;
}
