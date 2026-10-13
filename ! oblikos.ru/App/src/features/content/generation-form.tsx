"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { validationErrors } from "@/features/characters/validation";
import { generateContentAction } from "./actions";
import { contentLabels, contentTypes, generationSchema, type ContentType } from "./validation";

export function GenerationForm({ characters, selected, showCharacter = true }: { characters: { id: string; name: string }[]; selected?: { id: string; name: string }; showCharacter?: boolean }) {
  const [characterId, setCharacter] = useState(selected?.id || "");
  const [type, setType] = useState<ContentType>("POST");
  const [instruction, setInstruction] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const running = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const field = useId();
  const router = useRouter();
  const back = selected ? `/characters/${selected.id}/content` : "/content";
  function clearFeedback() { setErrors({}); setMessage(""); }
  function invalidFocus() { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }
  return <form ref={form} className="content-form card" noValidate aria-busy={pending} onSubmit={(event) => {
    event.preventDefault(); if (running.current) return;
    const parsed = generationSchema.safeParse({ characterId, type, instruction });
    if (!parsed.success) { setErrors(validationErrors(parsed.error)); setMessage("Проверьте введённые данные."); invalidFocus(); return; }
    const fingerprint = JSON.stringify(parsed.data);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    const requestId = request.current.id;
    running.current = true; setErrors({}); setMessage("");
    start(async () => {
      try {
        const result = await generateContentAction(parsed.data, requestId);
        if (!result.ok) { if (result.terminal) request.current = null; setMessage(result.message); setErrors(result.errors || {}); invalidFocus(); return; }
        router.push(`/content/${result.id}`);
      } catch { setMessage("Не удалось связаться с сервером. Повторите попытку: запрос защищён от дублирования."); }
      finally { running.current = false; }
    });
  }}>
    <fieldset disabled={pending} className="character-form-fieldset content-fields">
      {showCharacter && (selected ? <div className="form-field"><span className="content-label">Персонаж</span><p>{selected.name}</p></div> : <div className="form-field"><label htmlFor={`${field}-character`}>Персонаж *</label><select required id={`${field}-character`} value={characterId} aria-invalid={Boolean(errors.characterId)} aria-describedby={`${field}-character-error`} onChange={(e) => { setCharacter(e.target.value); clearFeedback(); }}><option value="">Выберите персонажа</option>{characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><span id={`${field}-character-error`} className="character-field-error">{errors.characterId}</span></div>)}
      <div className="form-field"><label htmlFor={`${field}-type`}>Формат текста *</label><select required id={`${field}-type`} value={type} onChange={(e) => { setType(e.target.value as ContentType); clearFeedback(); }}>{contentTypes.map((t) => <option key={t} value={t}>{contentLabels[t]}</option>)}</select></div>
      <div className="form-field"><label htmlFor={`${field}-instruction`}>Задача / тема *</label><textarea required id={`${field}-instruction`} rows={6} value={instruction} maxLength={5000} aria-invalid={Boolean(errors.instruction)} aria-describedby={`${field}-instruction-hint`} placeholder="Например: Напиши пост о том, почему я решила запустить собственный бренд косметики." onChange={(e) => { setInstruction(e.target.value); clearFeedback(); }}/><span id={`${field}-instruction-hint`} className={errors.instruction ? "character-field-error" : "form-hint"}>{errors.instruction || `${instruction.length} / 5000`}</span></div>
    </fieldset>
    {message && <p className="form-message" role="alert">{message}</p>}
    <p className="form-hint">Готовый текст сохранится автоматически. После генерации его можно отредактировать.</p>
    <div className="content-buttons"><Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Генерируем текст…" : "Сгенерировать"}</Button>{!pending && <ButtonLink href={back} variant="secondary">Отмена</ButtonLink>}</div>
  </form>;
}
