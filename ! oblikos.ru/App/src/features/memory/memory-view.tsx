"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { createMemoryAction, updateMemoryAction, pinMemoryAction, deleteMemoryAction } from "./actions";
import { memoryTypes, memoryLabels, importanceLabels, memorySchema, type MemoryInput, type MemoryType, type MemoryResult } from "./validation";
import { validationErrors } from "@/features/characters/validation";

type Entry = MemoryInput & { id: string; updatedAt: string };
type Editor = { mode: "create"; requestId: string } | { mode: "edit" | "delete"; entry: Entry };
const blank: MemoryInput = { type: "FACT", content: "", importance: 3, isPinned: false };

export function MemoryView({ characterId, entries, total, filteredTotal, filter }: {
  characterId: string; entries: Entry[]; total: number; filteredTotal: number; filter?: MemoryType;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const running = useRef(false);
  const titleId = useId();
  const fieldId = useId();
  const [editor, setEditor] = useState<Editor>();
  const [data, setData] = useState<MemoryInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<MemoryResult>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // Open after controls mount, so native initial focus has a real target.
    if (editor && !dialog.current?.open) dialog.current?.showModal();
  }, [editor]);

  useEffect(() => {
    if (!message?.ok) return;
    const timeout = setTimeout(() => setMessage(undefined), 4000);
    return () => clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (editor || pending || !restoreFocus.current) return;
    restoreFocus.current = false;
    // Wait for the refreshed list: an edited/deleted row may have left this filter.
    if (trigger.current?.isConnected && trigger.current.getClientRects().length) trigger.current.focus();
    else addButton.current?.focus();
  }, [editor, pending, entries]);

  useEffect(() => {
    function closeOutside(event: Event) {
      if (!(event.target instanceof Node)) return;
      document.querySelectorAll<HTMLDetailsElement>(".memory-menu[open]").forEach((menu) => {
        if (!menu.contains(event.target as Node)) menu.open = false;
      });
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, []);
  function rememberTrigger(button: HTMLElement) {
    const menu = button.closest("details");
    trigger.current = menu?.querySelector("summary") || button;
    if (menu) menu.open = false;
  }
  function open(next: Editor, button: HTMLElement) {
    if (running.current) return;
    rememberTrigger(button);
    setEditor(next);
    setData(next.mode === "create" ? { ...blank, type: filter || blank.type } : {
      type: next.entry.type, content: next.entry.content, importance: next.entry.importance, isPinned: next.entry.isPinned,
    });
    setErrors({}); setMessage(undefined);
  }
  function run(action: () => Promise<MemoryResult>, close = false) {
    if (running.current) return;
    running.current = true;
    setMessage(undefined);
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result);
        if (!result.ok) {
          setErrors(result.errors || {});
          if (result.errors) requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
          return;
        }
        if (close) dialog.current?.close();
      } catch {
        setMessage({ ok: false, message: "Не удалось связаться с сервером. Повторите попытку." });
      } finally { running.current = false; }
    });
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || editor.mode === "delete" || running.current) return;
    const parsed = memorySchema.safeParse(data);
    if (!parsed.success) {
      setErrors(validationErrors(parsed.error));
      setMessage({ ok: false, message: "Проверьте введённые данные." });
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    run(() => editor.mode === "create" ? createMemoryAction(characterId, parsed.data, editor.requestId)
      : updateMemoryAction(characterId, editor.entry.id, parsed.data), true);
  }
  const adding = (button: HTMLElement) => open({ mode: "create", requestId: crypto.randomUUID() }, button);
  return <section className="memory-view" aria-labelledby="memory-heading">
    <div className="memory-heading">
      <div><h2 id="memory-heading">Память <span className="memory-count">{total}</span></h2><p>Факты, события и предпочтения, которые персонаж должен помнить.</p></div>
      {total > 0 && <Button ref={addButton} disabled={pending} onClick={(e) => adding(e.currentTarget)}>Добавить воспоминание</Button>}
    </div>
    <div className="memory-feedback">{message && !editor && <p className={`form-message ${message.ok ? "form-message--success memory-success" : ""}`} role={message.ok ? "status" : "alert"}>
      {message.ok && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>}
      {message.message}
    </p>}</div>
    {total > 0 && <div className="memory-filter form-field">
      <label htmlFor={`${fieldId}-filter`}>Тип памяти</label>
      <select id={`${fieldId}-filter`} value={filter || "all"} disabled={pending} onChange={(e) => {
        setMessage(undefined);
        startTransition(() => router.push(`/characters/${characterId}/memory${e.target.value === "all" ? "" : `?type=${e.target.value}`}`, { scroll: false }));
      }}><option value="all">Все типы</option>{memoryTypes.map((type) => <option key={type} value={type}>{memoryLabels[type]}</option>)}</select>
    </div>}
    {entries.length ? <ul className="memory-list" aria-label="Воспоминания" aria-busy={pending}>
      {entries.map((entry, index) => <li key={entry.id} className="memory-entry">
        <div className="memory-entry-copy"><div className="memory-meta"><span>{memoryLabels[entry.type]}</span><span>Важность: {importanceLabels[entry.importance - 1]}</span>{entry.isPinned && <span className="memory-pinned">Закреплено</span>}</div>
          <p className="memory-content">{entry.content}</p>
          <time className="memory-date" dateTime={entry.updatedAt}>Обновлено {new Date(entry.updatedAt).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}</time>
        </div>
        <details className="memory-menu character-actions" name="memory-actions" onKeyDown={(event) => {
          if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
        }}><summary className="icon-button" aria-label={`Действия воспоминания ${index + 1}`}>•••</summary><div className="character-actions-popover">
          <Button variant="quiet" disabled={pending} onClick={(e) => open({ mode: "edit", entry }, e.currentTarget)}>Редактировать</Button>
          <Button variant="quiet" disabled={pending} onClick={(e) => { rememberTrigger(e.currentTarget); trigger.current?.focus(); run(() => pinMemoryAction(characterId, entry.id, !entry.isPinned)); }}>{entry.isPinned ? "Открепить" : "Закрепить"}</Button>
          <Button variant="quiet" className="character-danger" disabled={pending} onClick={(e) => open({ mode: "delete", entry }, e.currentTarget)}>Удалить</Button>
        </div></details>
      </li>)}
    </ul> : <EmptyState icon="memory" title={total ? "Нет воспоминаний этого типа" : "Память пока пуста"} description={total ? "Выберите другой тип или добавьте воспоминание." : "Добавьте факты, события и предпочтения, которые важно сохранять между взаимодействиями с персонажем."}>
      {total === 0 && <Button ref={addButton} disabled={pending} onClick={(e) => adding(e.currentTarget)}>Добавить воспоминание</Button>}
    </EmptyState>}
    {filteredTotal > entries.length && <p className="form-hint">Показаны первые {entries.length} из {filteredTotal} записей. Уточните тип памяти, чтобы сузить список.</p>}
    <dialog ref={dialog} className="character-dialog memory-dialog" aria-labelledby={titleId} onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled)')).filter((control) => control.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onCancel={(event) => { if (running.current) event.preventDefault(); }} onClose={() => {
      restoreFocus.current = true;
      setEditor(undefined);
    }}>
      {editor && <><h2 id={titleId}>{editor.mode === "delete" ? "Удалить воспоминание?" : editor.mode === "edit" ? "Редактировать воспоминание" : "Добавить воспоминание"}</h2>
        {editor.mode === "delete" ? <><p>Эта запись будет удалена из памяти персонажа. Отменить удаление нельзя.</p><p className="memory-delete-preview">{editor.entry.content}</p></> : <form ref={form} id={`${fieldId}-form`} onSubmit={save} noValidate>
          <fieldset disabled={pending} className="character-form-fieldset memory-fields">
            <div className="form-field"><label htmlFor={`${fieldId}-type`}>Тип <span aria-hidden="true">*</span></label><select autoFocus required id={`${fieldId}-type`} value={data.type} aria-invalid={Boolean(errors.type)} aria-describedby={errors.type ? `${fieldId}-type-error` : undefined} onChange={(e) => setData({ ...data, type: e.target.value as MemoryType })}>{memoryTypes.map((type) => <option key={type} value={type}>{memoryLabels[type]}</option>)}</select>{errors.type && <span className="character-field-error" id={`${fieldId}-type-error`}>{errors.type}</span>}</div>
            <div className="form-field memory-field-wide"><label htmlFor={`${fieldId}-content`}>Содержание <span aria-hidden="true">*</span></label><textarea required id={`${fieldId}-content`} rows={5} maxLength={2000} value={data.content} placeholder="Например, Дарья предпочитает минималистичный стиль одежды." aria-invalid={Boolean(errors.content)} aria-describedby={`${fieldId}-content-feedback`} onChange={(e) => setData({ ...data, content: e.target.value })}/><span id={`${fieldId}-content-feedback`} className={errors.content ? "character-field-error" : "form-hint"}>{errors.content || `${data.content.length} / 2000`}</span></div>
            <div className="form-field"><label htmlFor={`${fieldId}-importance`}>Важность</label><select id={`${fieldId}-importance`} value={data.importance} aria-invalid={Boolean(errors.importance)} aria-describedby={errors.importance ? `${fieldId}-importance-error` : undefined} onChange={(e) => setData({ ...data, importance: Number(e.target.value) })}>{importanceLabels.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select>{errors.importance && <span id={`${fieldId}-importance-error`} className="character-field-error">{errors.importance}</span>}</div>
            <label className="memory-pin-field"><input type="checkbox" checked={data.isPinned} onChange={(e) => setData({ ...data, isPinned: e.target.checked })}/>Закрепить</label>
          </fieldset>
        </form>}
        {message && !message.ok && <p className="form-message" role="alert">{message.message}</p>}
        <div className="character-dialog-buttons"><Button variant="secondary" autoFocus={editor.mode === "delete"} disabled={pending} onClick={() => dialog.current?.close()}>Отмена</Button>
          {editor.mode === "delete" ? <Button className="character-danger" disabled={pending} aria-busy={pending} onClick={() => run(() => deleteMemoryAction(characterId, editor.entry.id), true)}>{pending ? "Удаление…" : "Удалить воспоминание"}</Button>
            : <Button type="submit" form={`${fieldId}-form`} disabled={pending} aria-busy={pending}>{pending ? "Сохранение…" : editor.mode === "edit" ? "Сохранить изменения" : "Сохранить воспоминание"}</Button>}
        </div>
      </>}
    </dialog>
  </section>;
}
