"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generateImageAction } from "./actions";
import { aspectRatios, imageFormats, imageRequestSchema, type ImageRequest } from "./validation";

export function ImageGenerationForm({ characterId, hasPrimary, referenceSupported, configurationError }: { characterId: string; hasPrimary: boolean; referenceSupported: boolean; configurationError?: string }) {
  const [instruction, setInstruction] = useState("");
  const [format, setFormat] = useState<ImageRequest["format"]>("PORTRAIT");
  const [aspectRatio, setRatio] = useState<ImageRequest["aspectRatio"]>("1:1");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const running = useRef(false);
  const receipt = useRef<{ fingerprint: string; id: string } | null>(null);
  const field = useId();
  const router = useRouter();
  return <form className="card content-form media-generation" aria-busy={pending} onSubmit={(event) => {
    event.preventDefault(); if (running.current || configurationError) return;
    const parsed = imageRequestSchema.safeParse({ characterId, instruction, format, aspectRatio });
    if (!parsed.success) { setOk(false); setMessage("Проверьте описание сцены."); return; }
    const fingerprint = JSON.stringify(parsed.data);
    if (receipt.current?.fingerprint !== fingerprint) receipt.current = { fingerprint, id: crypto.randomUUID() };
    const requestId = receipt.current.id;
    running.current = true; setMessage(""); setOk(false);
    start(async () => {
      try {
        const result = await generateImageAction(parsed.data, requestId);
        setMessage(result.message); setOk(result.ok);
        if (result.ok || result.terminal) receipt.current = null;
        if (result.ok) router.refresh();
      } catch { setMessage("Не удалось связаться с сервером. Повторная отправка этого запроса защищена от дублирования. Проверьте медиатеку."); }
      finally { running.current = false; }
    });
  }}>
    <h3>{hasPrimary ? "Создать изображение" : "Создать образ"}</h3>
    <p className="form-hint">{hasPrimary ? referenceSupported ? "Основной образ будет передан как референс. Точное совпадение лица зависит от модели." : "Доступная модель использует текстовое описание внешности. Совпадение лица с основным образом не гарантируется." : "Создайте базовый образ персонажа, затем выберите изображение для основного референса."}</p>
    <fieldset className="character-form-fieldset content-fields" disabled={pending || Boolean(configurationError)}>
      <div className="media-form-options">
        <div className="form-field"><label htmlFor={`${field}-format`}>Формат изображения</label><select id={`${field}-format`} value={format} onChange={(event) => setFormat(event.target.value as ImageRequest["format"])}>{Object.entries(imageFormats).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className="form-field"><label htmlFor={`${field}-ratio`}>Соотношение сторон</label><select id={`${field}-ratio`} value={aspectRatio} onChange={(event) => setRatio(event.target.value as ImageRequest["aspectRatio"])}>{aspectRatios.map((ratio) => <option key={ratio}>{ratio}</option>)}</select><span className="form-hint">Если формат недоступен, используется ближайший поддерживаемый.</span></div>
      </div>
      <div className="form-field"><label htmlFor={`${field}-scene`}>{hasPrimary ? "Опишите сцену" : "Пожелания к первому изображению"}</label><textarea id={`${field}-scene`} rows={4} maxLength={3000} value={instruction} placeholder={hasPrimary ? "Персонаж сидит в современном кафе у окна." : "Портрет по пояс, светлый фон, мягкий студийный свет."} onChange={(event) => setInstruction(event.target.value)} /><span className="form-hint">{instruction.length} / 3000</span></div>
    </fieldset>
    {configurationError && <p className="form-message" role="alert">{configurationError}</p>}
    {message && <p className="form-message" role={ok ? "status" : "alert"}>{message}</p>}
    <p className="form-hint">Изображение сохраняется автоматически. Каждый новый запрос создаёт одно изображение.</p>
    <Button type="submit" disabled={pending || Boolean(configurationError)} aria-busy={pending}>{pending ? <><span className="media-spinner" aria-hidden="true"/>Создаём изображение…</> : "Сгенерировать"}</Button>
  </form>;
}
