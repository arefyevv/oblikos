"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { VideoGenerationView } from "./video-validation";
import { videoStatusAction } from "./video-actions";
import { VideoProgress } from "./video-progress";
export function VideoJobs({ generations, global = false }: { generations: VideoGenerationView[]; global?: boolean }) {
  const [updates, setUpdates] = useState<Record<string, VideoGenerationView>>({});
  const [error, setError] = useState("");
  const router = useRouter();
  const current = generations.map((g) => updates[g.id] || g);
  const active = current.filter((g) => g.status === "PENDING" || g.status === "PROCESSING");
  const failed = current.filter((g) => g.status === "FAILED");
  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const terminal = new Set<string>();
    async function poll() {
      for (const g of generations) {
        if (disposed) return;
        if (terminal.has(g.id) || g.status === "FAILED" || g.status === "READY") continue;
        try {
          const result = await videoStatusAction(g.id);
          if (disposed) return;
          if (result.ok) {
            setUpdates((before) => ({ ...before, [g.id]: result.generation })); setError("");
            if (["READY", "FAILED"].includes(result.generation.status)) { terminal.add(g.id); router.refresh(); }
          } else { setError(result.message); }
        } catch { if (!disposed) setError("Не удалось проверить статус. Проверка будет повторена."); }
      }
      if (!disposed && generations.some((g) => ["PENDING", "PROCESSING"].includes(g.status) && !terminal.has(g.id))) timer = setTimeout(poll, 10000);
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [generations, router]);
  if (!active.length && !failed.length && !error) return null;
  return <div className="video-jobs" aria-label="Генерация видео">
    {active.map((g) => <article className="card video-job" key={g.id}>
      <VideoProgress generation={g}/>
      {global && <Link href={`/characters/${g.characterId}/media`}>{g.characterName}</Link>}
      <p className="video-job-scene">{g.scene}</p>
    </article>)}
    {error && <p role="alert">{error}</p>}
    {failed.length > 0 && <details className="video-history">
      <summary>История генераций · {failed.length}</summary>
      <p className="form-hint">Неудачные попытки создания видео. Готовые ролики находятся в галерее.</p>
      <div className="video-jobs">{failed.map((g) => <article className="card video-job" key={g.id}>
        <h3>Не удалось создать видео.</h3>
        {global && <Link href={`/characters/${g.characterId}/media`}>{g.characterName}</Link>}
        <p className="video-job-scene">{g.scene}</p>
        <p>{g.message || "Генерация завершилась ошибкой."}</p>
      </article>)}</div>
    </details>}
  </div>;
}
