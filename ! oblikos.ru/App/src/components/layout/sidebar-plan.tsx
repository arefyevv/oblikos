"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

type Usage = { kind: string; remaining: number; limit: number; enabled: boolean };
export function SidebarPlan({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [usage, setUsage] = useState<Usage[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/usage", { cache: "no-store", signal: controller.signal });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Usage unavailable");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every((item) => item && typeof item.kind === "string" && Number.isInteger(item.remaining) && Number.isInteger(item.limit) && typeof item.enabled === "boolean")) throw new Error("Invalid usage");
        if (!controller.signal.aborted) { setUsage(data); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [pathname]);
  return <section className="sidebar__info sidebar-plan" aria-label="Тариф и лимиты">
    <span className="sidebar-plan__label">Текущий тариф</span>
    <h2>Без подписки</h2>
    <p className="sidebar-plan__caption">Доступно генераций</p>
    {error ? <p role="status">Не удалось обновить лимиты</p> : !usage ? <p role="status">Загружаем лимиты…</p> : <dl className="sidebar-plan__limits">
      {[["image", "Фото"], ["video", "Видео"]].map(([kind, label]) => {
        const item = usage.find((entry) => entry.kind === kind);
        return <div key={kind}><dt>{label}</dt><dd>{item ? item.enabled ? <>{item.remaining}<span> / {item.limit}</span></> : "Отключено" : "—"}</dd></div>;
      })}
    </dl>}
    <p className="sidebar-plan__period">Лимиты на 24 часа</p>
    <Link className="sidebar-plan__link" href="/settings#tariff" onClick={onNavigate}>Управлять тарифом →</Link>
  </section>;
}
