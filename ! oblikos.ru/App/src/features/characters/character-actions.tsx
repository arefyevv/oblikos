"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { manageCharacterAction } from "./actions";

type Operation = "duplicate" | "archive" | "restore" | "delete";
export function CharacterActions({ id, name, archived, settings = false }: { id: string; name: string; archived: boolean; settings?: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const [operation, setOperation] = useState<Operation>("archive");
  const [message, setMessage] = useState<{ text: string; ok: boolean }>();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const running = useRef(false);
  useEffect(() => {
    if (!message?.ok) return;
    const timeout = setTimeout(() => setMessage(undefined), 4000);
    return () => clearTimeout(timeout);
  }, [message]);
  useEffect(() => {
    if (settings) return;
    const details = menu.current;
    const hoverArea = details?.closest(".character-card") || details;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    function cancelDismiss() {
      clearTimeout(dismissTimer);
      dismissTimer = undefined;
    }
    function dismissAfterLeave(event: Event) {
      if (!(event instanceof PointerEvent) || event.pointerType !== "mouse" || !details?.open) return;
      cancelDismiss();
      dismissTimer = setTimeout(() => { details.open = false; }, 500);
    }
    function cancelWhenClosed() {
      if (!details?.open) cancelDismiss();
    }
    function dismissOutside(event: Event) {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) {
        menu.current.open = false;
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    hoverArea?.addEventListener("pointerleave", dismissAfterLeave);
    hoverArea?.addEventListener("pointerenter", cancelDismiss);
    details?.addEventListener("toggle", cancelWhenClosed);
    details?.addEventListener("keydown", cancelDismiss);
    return () => {
      cancelDismiss();
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      hoverArea?.removeEventListener("pointerleave", dismissAfterLeave);
      hoverArea?.removeEventListener("pointerenter", cancelDismiss);
      details?.removeEventListener("toggle", cancelWhenClosed);
      details?.removeEventListener("keydown", cancelDismiss);
    };
  }, [settings]);
  function run(action: Operation) {
    if (pending || running.current) return;
    running.current = true;
    setMessage(undefined);
    startTransition(async () => {
      try {
        const result = await manageCharacterAction(id, action);
        if (!result.ok) { setMessage({ text: result.message, ok: false }); return; }
        dialog.current?.close();
        if (menu.current) menu.current.open = false;
        if (result.id) router.push(`/characters/${result.id}`);
        else if (action === "delete") router.push("/characters");
        else setMessage({ text: result.message, ok: true });
      } catch { setMessage({ text: "Не удалось связаться с сервером. Повторите попытку.", ok: false }); }
      finally { running.current = false; }
    });
  }
  function choose(action: Operation, button: HTMLButtonElement) {
    trigger.current = button;
    if (menu.current) {
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
    setMessage(undefined);
    if (action === "archive" || action === "delete") { setOperation(action); setDialogOpen(true); dialog.current?.showModal(); }
    else run(action);
  }
  const buttons = <>
    {!settings && <ButtonLink variant="quiet" href={`/characters/${id}`} onClick={() => { if (menu.current) menu.current.open = false; }}>Открыть</ButtonLink>}
    <Button variant="quiet" disabled={pending} onClick={(e) => choose("duplicate", e.currentTarget)}>{settings ? "Дублировать персонажа" : "Дублировать"}</Button>
    <Button variant="quiet" disabled={pending} onClick={(e) => choose(archived ? "restore" : "archive", e.currentTarget)}>{archived ? settings ? "Восстановить персонажа" : "Восстановить" : settings ? "Архивировать персонажа" : "Архивировать"}</Button>
    <Button className="character-danger" variant="quiet" disabled={pending} onClick={(e) => choose("delete", e.currentTarget)}>{settings ? "Удалить персонажа" : "Удалить"}</Button>
  </>;
  return <div className={settings ? "character-management" : "character-actions"} aria-busy={pending}>
    {settings ? <><h2>Управление персонажем</h2><p className="form-hint">Копия сохранит идентичность, внешность и личность. Архив можно восстановить.</p><div className="character-management-buttons">{buttons}</div></> : <details ref={menu} name="character-actions" onKeyDown={(event) => {
      if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); }
    }}><summary aria-label={`Действия: ${name}`} className="icon-button">•••</summary><div className="character-actions-popover">{buttons}</div></details>}
    {message && !dialogOpen && <p className={`form-message ${message.ok ? "form-message--success" : ""}`} role={message.ok ? "status" : "alert"}>{message.text}</p>}
    <dialog ref={dialog} className="character-dialog" aria-labelledby={titleId} onCancel={(event) => { if (pending) event.preventDefault(); }} onClose={() => {
      setDialogOpen(false);
      if (trigger.current?.isConnected && trigger.current.getClientRects().length) trigger.current.focus();
      else menu.current?.querySelector("summary")?.focus();
    }}>
      <h2 id={titleId}>{operation === "delete" ? "Удалить персонажа?" : "Архивировать персонажа?"}</h2>
      <p>{operation === "delete" ? `«${name}» исчезнет из списка, и профиль станет недоступен. Восстановление удалённых персонажей пока не предусмотрено.` : `Персонаж «${name}» будет перемещён в архив. Вы сможете восстановить персонажа в любое время.`}</p>
      {message && !message.ok && <p className="form-message" role="alert">{message.text}</p>}
      <div className="character-dialog-buttons"><Button variant="secondary" autoFocus disabled={pending} onClick={() => dialog.current?.close()}>Отмена</Button><Button className={operation === "delete" ? "character-danger" : ""} disabled={pending} aria-busy={pending} onClick={() => run(operation)}>{pending ? "Сохранение…" : operation === "delete" ? "Удалить персонажа" : "Архивировать персонажа"}</Button></div>
    </dialog>
  </div>;
}
