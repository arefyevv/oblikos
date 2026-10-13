"use client";
import { useEffect, useState } from "react";
import type { VideoGenerationView } from "./video-validation";

export function videoProgress(g: VideoGenerationView) {
  const phase = g.phase || (g.status === "PENDING" ? "SUBMITTING" : g.status === "PROCESSING" ? "GENERATING" : g.status);
  const content = {
    SUBMITTING: { title: "Отправляем задание", detail: "Задание сохранено. Подготавливаем исходники и передаём их модели.", step: 0 },
    QUEUED: { title: "В очереди", detail: "Модель приняла задание и ждёт свободных мощностей. Место в очереди и время ожидания сервис не сообщает.", step: 0 },
    GENERATING: { title: "Видео генерируется", detail: "Модель обрабатывает фото и видео. Точный процент готовности недоступен.", step: 1 },
    SAVING: { title: "Сохраняем видео", detail: "Генерация завершена. Загружаем результат и подготавливаем звук.", step: 2 },
    READY: { title: "Видео готово", detail: "Результат сохранён в медиатеке.", step: 3 },
    FAILED: { title: "Не удалось создать видео", detail: g.message || "Генерация завершилась ошибкой. Автоматического платного повтора не будет.", step: -1 },
  };
  return { phase, ...content[phase] };
}

export function VideoProgress({ generation }: { generation: VideoGenerationView }) {
  const info = videoProgress(generation);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const start = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, []);
  const minutes = now ? Math.max(0, Math.floor((now - Date.parse(generation.createdAt)) / 60000)) : 0;
  const active = generation.status === "PENDING" || generation.status === "PROCESSING";
  return <div className="video-progress-state">
    <div className="video-progress-heading"><h3>{info.title}</h3>{active && minutes > 0 && <span className="form-hint">Прошло {minutes} мин</span>}</div>
    {active && <>
      <div className="video-progress-track" role="progressbar" aria-label="Создание видео" aria-valuetext={info.title}><span/></div>
      <ol className="video-progress-steps" aria-label="Этапы создания видео">{["Очередь", "Генерация", "Сохранение"].map((step, i) => <li key={step} aria-current={i === info.step ? "step" : undefined} data-complete={i < info.step}><span aria-hidden="true">{i < info.step ? "✓" : i + 1}</span>{step}</li>)}</ol>
    </>}
    <p role="status">{generation.message && active ? generation.message : info.detail}</p>
    {active && <p className="form-hint">Можно перейти в другой раздел или закрыть вкладку. Повторно запускать генерацию не нужно.</p>}
  </div>;
}
