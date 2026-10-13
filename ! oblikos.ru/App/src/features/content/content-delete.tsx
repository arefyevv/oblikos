"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteContentAction } from "./actions";

export function ContentDelete({ id, returnTo }: { id: string; returnTo?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const running = useRef(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const title = useId();
  const router = useRouter();
  return <><Button ref={trigger} variant="quiet" disabled={pending} onClick={() => { setError(""); dialog.current?.showModal(); }}>Удалить</Button>
    <dialog ref={dialog} className="character-dialog" aria-labelledby={title} onCancel={(event) => { if (running.current) event.preventDefault(); }} onClose={() => trigger.current?.focus()}>
      <h2 id={title}>Удалить контент?</h2><p>Текст будет удалён. Отменить удаление нельзя.</p>
      {error && <p role="alert" className="form-message">{error}</p>}
      <div className="character-dialog-buttons"><Button variant="secondary" autoFocus disabled={pending} onClick={() => dialog.current?.close()}>Отмена</Button>
        <Button className="character-danger" disabled={pending} aria-busy={pending} onClick={() => {
          if (running.current) return;
          running.current = true;
          start(async () => {
            try {
              const result = await deleteContentAction(id);
              if (!result.ok) { setError(result.message); return; }
              dialog.current?.close();
              if (returnTo) router.push(returnTo); else router.refresh();
            } catch { setError("Не удалось связаться с сервером. Повторите попытку."); }
            finally { running.current = false; }
          });
        }}>{pending ? "Удаление…" : "Удалить контент"}</Button>
      </div>
    </dialog>
  </>;
}
