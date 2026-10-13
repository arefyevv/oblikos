"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { videoActivityAction } from "./video-actions";
import { videoProgress } from "./video-progress";
import type { VideoGenerationView } from "./video-validation";

const isActive = (g: VideoGenerationView) => g.status === "PENDING" || g.status === "PROCESSING";
export const videoActivityEvent = "oblikos:video-enqueued";

// Mounted in the workspace layout, so tracking survives in-app navigation.
// Storage contains only bounded operation IDs, scoped to the signed-in workspace.
export function VideoActivity({ scope }: { scope: string }) {
  const router = useRouter();
  const [active, setActive] = useState<VideoGenerationView[]>([]);
  const [notices, setNotices] = useState<VideoGenerationView[]>([]);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const known = useRef(new Set<string>()), delivered = useRef(new Set<string>());
  useEffect(() => {
    let disposed = false, inFlight = false, timer: ReturnType<typeof setTimeout>;
    const key = `oblikos:video-activity:${scope}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      for (const [field, target] of [["known", known.current], ["delivered", delivered.current]] as const) {
        if (Array.isArray(saved?.[field])) for (const id of saved[field].slice(-48)) if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) target.add(id);
      }
    } catch { /* Tracking also works when browser storage is unavailable. */ }
    async function poll() {
      if (disposed || inFlight) return;
      clearTimeout(timer); inFlight = true;
      try {
        const requested = [...known.current].slice(-48);
        const result = await videoActivityAction(requested);
        if (disposed) return;
        if (!result.ok) { setError(result.message); return; }
        setError("");
        const running = result.generations.filter(isActive);
        setActive(running);
        if ("Notification" in window) setPermission(Notification.permission);
        const finished = result.generations.filter(g => !isActive(g) && known.current.has(g.id) && !delivered.current.has(g.id));
        for (const g of finished) {
          delivered.current.add(g.id);
          if ("Notification" in window && Notification.permission === "granted" && document.visibilityState === "hidden") {
            try { const notification = new Notification(videoProgress(g).title, { body: `${g.characterName}. ${g.status === "READY" ? "Результат сохранён в медиатеке." : g.message || "Откройте сайт, чтобы посмотреть ошибку."}`, tag: `oblikos-video-${g.id}` }); notification.onclick = () => { window.focus(); router.push(`/characters/${g.characterId}/media?type=VIDEO`); notification.close(); }; } catch { /* Inline notification remains available. */ }
          }
        }
        if (finished.length) { setNotices(before => [...finished, ...before].slice(0, 3)); router.refresh(); }
        // Preserve an enqueue event arriving while this read was in flight.
        known.current = new Set([...running.map(g => g.id), ...[...known.current].filter(id => !requested.includes(id) && !result.generations.some(g => g.id === id))].slice(-48));
        delivered.current = new Set([...delivered.current].slice(-48));
        try { sessionStorage.setItem(key, JSON.stringify({ known: [...known.current], delivered: [...delivered.current] })); } catch {}
      } catch { if (!disposed) setError("Не удалось обновить статус. Проверка повторится автоматически."); }
      finally { inFlight = false; if (!disposed) timer = setTimeout(poll, 10000); }
    }
    const refresh = (event: Event) => {
      const id = event instanceof CustomEvent ? event.detail?.id : undefined;
      if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) known.current.add(id);
      void poll();
    };
    window.addEventListener(videoActivityEvent, refresh);
    window.addEventListener("online", refresh);
    void poll();
    return () => { disposed = true; clearTimeout(timer); window.removeEventListener(videoActivityEvent, refresh); window.removeEventListener("online", refresh); };
  }, [scope, router]);
  async function enableNotifications() {
    if (!("Notification" in window)) return;
    try { setPermission(await Notification.requestPermission()); } catch { setPermission("denied"); }
  }
  if (!active.length && !notices.length) return null;
  const first = active[0];
  return <aside className="video-activity" aria-label="Статус видео">
    {notices.map(g => <div className={`video-activity-notice ${g.status === "FAILED" ? "video-activity-notice--error" : ""}`} key={g.id}>
      <div role={g.status === "FAILED" ? "alert" : "status"}><strong>{videoProgress(g).title}</strong><p>{g.characterName}</p>{g.status === "FAILED" && <p>{g.message || "Посмотрите подробности в истории генераций."}</p>}</div>
      <div className="video-activity-actions"><Link href={g.status === "READY" ? `/characters/${g.characterId}/media?type=VIDEO` : `/animation?characterId=${g.characterId}`}>{g.status === "READY" ? "Смотреть видео" : "Открыть историю"}</Link><Button type="button" variant="quiet" aria-label="Закрыть уведомление" onClick={() => setNotices(before => before.filter(item => item.id !== g.id))}>Закрыть</Button></div>
    </div>)}
    {first && <div className="video-activity-running">
      <Link href={`/animation?characterId=${first.characterId}`} className="video-activity-summary"><span className="video-activity-dot" aria-hidden="true"/><span><strong>{active.length > 1 ? `Создаётся видео: ${active.length}` : videoProgress(first).title}</strong><span>{first.characterName}</span></span><span aria-hidden="true">↗</span></Link>
      {error && <p role="status" className="form-hint">{error}</p>}
      {permission !== "unsupported" && <details className="video-activity-settings"><summary>Уведомления</summary>
        {permission === "default" && <Button type="button" variant="quiet" onClick={() => void enableNotifications()}>Уведомлять в браузере</Button>}
        <p className="form-hint">{permission === "denied" ? "Уведомления браузера заблокированы. Статус и результат появятся здесь." : permission === "granted" ? "Уведомим о результате, пока сайт открыт." : "Можно получать уведомления, даже когда открыта другая вкладка. Сайт должен оставаться открытым."}</p>
      </details>}
    </div>}
  </aside>;
}
