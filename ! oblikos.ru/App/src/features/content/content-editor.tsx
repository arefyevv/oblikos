"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { VoiceFields } from "@/features/voice/voice-fields";
import { resolveVoiceDelivery, voiceLabel, type VoiceSettings, type VoiceDelivery } from "@/features/voice/validation";
import { ContentDelete } from "./content-delete";
import { updateContentAction, regenerateContentAction } from "./actions";
import { bodySchema, contentLabels, type ContentType } from "./validation";

export function ContentEditor({ entry }: { entry: { id: string; characterId: string; characterName: string; archived: boolean; type: ContentType; instruction: string; body: string; voiceDefaults: VoiceSettings; voiceOverride: VoiceDelivery | null; updatedAt: string } }) {
  const [body, setBody] = useState(entry.body);
  const [voiceOverride, setVoiceOverride] = useState<VoiceDelivery | null>(entry.voiceOverride);
  const voiceSettings = resolveVoiceDelivery(entry.voiceDefaults, voiceOverride);
  const changed = body !== entry.body || JSON.stringify(voiceOverride) !== JSON.stringify(entry.voiceOverride);
  const [version, setVersion] = useState(entry.updatedAt);
  const [message, setMessage] = useState<{ ok: boolean; message: string }>();
  const [pending, start] = useTransition();
  const running = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const regen = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const requestId = useRef<string | null>(null);
  const field = useId();
  const router = useRouter();
  const back = `/characters/${entry.characterId}/content`;
  if (version !== entry.updatedAt) { setVersion(entry.updatedAt); setBody(entry.body); setVoiceOverride(entry.voiceOverride); }
  useEffect(() => {
    if (!pending && restoreFocus.current) { restoreFocus.current = false; regen.current?.focus(); }
  }, [pending]);
  function run(regenerate: boolean) {
    if (running.current) return;
    if (!regenerate && !bodySchema.safeParse({ body }).success) { setMessage({ ok: false, message: "Введите текст от 1 до 30000 символов." }); return; }
    if (regenerate && !requestId.current) requestId.current = crypto.randomUUID();
    running.current = true; setMessage(undefined);
    start(async () => {
      try {
        const result = regenerate ? await regenerateContentAction(entry.id, requestId.current!) : await updateContentAction(entry.id, { body, voiceOverride }, entry.updatedAt);
        setMessage(result);
        if (result.terminal) requestId.current = null;
        if (result.ok) { dialog.current?.close(); requestId.current = null; router.refresh(); }
      } catch { setMessage({ ok: false, message: "Не удалось связаться с сервером. Повторите попытку." }); }
      finally { running.current = false; }
    });
  }
  return <section className="content-view">
    <div className="memory-meta"><span>{contentLabels[entry.type]}</span><span>{entry.characterName}</span><span>{!changed ? "Черновик · сохранён" : "Есть несохранённые изменения"}</span></div>
    <div className="content-task"><h2>Исходная задача</h2><p>{entry.instruction}</p></div>
    <form className="content-form card" onSubmit={(event) => { event.preventDefault(); run(false); }} aria-busy={pending}>
      <div className="form-field"><label htmlFor={`${field}-body`}>Текст</label><textarea id={`${field}-body`} required maxLength={30000} rows={18} value={body} disabled={pending} onChange={(e) => { setBody(e.target.value); setMessage(undefined); }}/><span className="form-hint">{body.length} / 30000 · ручные изменения сохраняются кнопкой ниже</span></div>
      <div className="content-buttons"><Button type="submit" disabled={pending || !changed}>{pending ? "Сохранение…" : "Сохранить изменения"}</Button>
        {!entry.archived && <Button ref={regen} variant="secondary" disabled={pending} onClick={() => { setMessage(undefined); dialog.current?.showModal(); }}>Сгенерировать заново</Button>}
      </div>
    </form>
    <section className="card content-form">
      <h2>Озвучка этого контента</h2>
      <p>Голос персонажа: {voiceLabel(entry.voiceDefaults.voiceId)}</p>
      <p className="form-hint">Голос берётся из профиля персонажа. Здесь меняется только подача этой записи; профиль персонажа остаётся прежним.</p>
      <label><input type="checkbox" checked={voiceOverride === null} disabled={pending} onChange={e => setVoiceOverride(e.target.checked ? null : { speed: entry.voiceDefaults.speed, style: entry.voiceDefaults.style, instructions: entry.voiceDefaults.instructions, ageTone: entry.voiceDefaults.ageTone || "original" })} /> Использовать подачу персонажа по умолчанию</label>
      <VoiceFields key={entry.id + entry.updatedAt} deliveryOnly inheritDelivery={voiceOverride === null || pending} defaultText={body.slice(0, 600)} settings={voiceSettings} onChange={(field, value) => setVoiceOverride(current => current ? { ...current, [field]: value } : current)} />
      <p className="form-hint">Подача сохраняется вместе с текстом кнопкой «Сохранить изменения». Это проба озвучки; звук ещё не добавляется в видео автоматически.</p>
      <Button disabled={pending || !changed} onClick={() => run(false)}>{pending ? "Сохранение…" : "Сохранить изменения"}</Button>
    </section>
    {message && <p role={message.ok ? "status" : "alert"} className={`form-message ${message.ok ? "form-message--success" : ""}`}>{message.message}</p>}
    {!pending && <div className="content-buttons"><ButtonLink href={back} variant="quiet">К контенту персонажа</ButtonLink><ContentDelete id={entry.id} returnTo={back}/></div>}
    <dialog ref={dialog} className="character-dialog" aria-labelledby={`${field}-regen-title`} onCancel={(event) => { if (running.current) event.preventDefault(); }} onClose={() => { if (pending || running.current) restoreFocus.current = true; else regen.current?.focus(); }}>
      <h2 id={`${field}-regen-title`}>Сгенерировать заново?</h2><p>После успешной генерации сохранённый текст будет заменён. Несохранённые правки будут потеряны. Используем исходную задачу и актуальную личность и память персонажа.</p>
      {pending && <p role="status">Генерируем текст…</p>}{message && !message.ok && <p className="form-message" role="alert">{message.message}</p>}
      <div className="character-dialog-buttons"><Button autoFocus variant="secondary" disabled={pending} onClick={() => dialog.current?.close()}>Отмена</Button><Button disabled={pending} aria-busy={pending} onClick={() => run(true)}>{pending ? "Генерируем текст…" : "Заменить текст"}</Button></div>
    </dialog>
  </section>;
}
