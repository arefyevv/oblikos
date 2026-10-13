"use client";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { maxCharacterPhotos, maxOriginalPhotoBytes, maxPreparedPhotoBytes, photoMimeTypes } from "./photo-limits";

async function optimizePhoto(file: File) {
  if (!photoMimeTypes.includes(file.type) || !file.size || file.size > maxOriginalPhotoBytes) throw new Error("Используйте JPG, PNG или WebP до 10 МБ на фото.");
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 40_000_000) throw new Error("Слишком большое разрешение фото. Выберите изображение до 40 мегапикселей.");
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось обработать фото в браузере.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.75, 0.6]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= maxPreparedPhotoBytes) return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
    }
    throw new Error("Не удалось уменьшить фото. Выберите изображение меньшего размера.");
  } finally { image.close(); }
}

export function PhotoUpload({ files, onChange, onAnalyze, onProcessing, pending, editing = false }: { files: File[]; onChange: (files: File[]) => void; onAnalyze: () => void; onProcessing: (processing: boolean) => void; pending: boolean; editing?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const busy = pending || processing;
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
  async function add(selected: File[]) {
    if (busy || !selected.length) return;
    setError("");
    if (files.length + selected.length > maxCharacterPhotos) { setError("Можно загрузить не более 10 фото. Удалите лишние или выберите меньше файлов."); return; }
    setProcessing(true); onProcessing(true);
    try {
      const optimized: File[] = [];
      for (const file of selected) optimized.push(await optimizePhoto(file));
      onChange([...files, ...optimized]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось прочитать фото."); }
    finally { setProcessing(false); onProcessing(false); }
  }
  return <section className="character-photo-panel" aria-labelledby="character-photos-title">
    <div className="character-photo-heading"><div><h3 id="character-photos-title">Фото персонажа</h3><p>Загрузите снимки одного человека. Для точного образа лучше 3–5 фото: анфас, профиль и разные ракурсы.</p></div></div>
    <div className="character-photo-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void add(Array.from(event.dataTransfer.files)); }}>
      <input ref={input} id="character-photos" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} aria-label="Загрузить фотографии персонажа" onChange={(event) => { void add(Array.from(event.target.files || [])); event.target.value = ""; }} />
      <Button variant="secondary" disabled={busy || files.length === maxCharacterPhotos} onClick={() => input.current?.click()}>{processing ? "Подготовка фото…" : files.length ? "Добавить фото" : "Выбрать фотографии"}</Button>
      <p>JPG, PNG, WebP · до 10 МБ каждое · до 10 фото.</p>
    </div>
    {error && <p className="form-message" role="alert">{error}</p>}
    {files.length > 0 && <><ul className="character-photo-grid">{files.map((file, index) => <li key={previews[index]}>
      <div className="character-photo-preview"><Image src={previews[index]} alt={`Референс персонажа ${index + 1}`} fill sizes="(max-width: 600px) 40vw, 140px" unoptimized />{index === 0 && <span className="badge">Основное</span>}</div>
      <div className="character-photo-controls"><button type="button" disabled={busy || index === 0} onClick={() => onChange([file, ...files.filter((_, i) => i !== index)])} aria-label={`Сделать фото ${index + 1} основным`}>{index === 0 ? "Основной образ" : "Сделать основным"}</button><button type="button" disabled={busy} onClick={() => onChange(files.filter((_, i) => i !== index))} aria-label={`Удалить фото ${index + 1}`}>Удалить</button></div>
    </li>)}</ul><Button variant="secondary" disabled={busy} aria-busy={pending} onClick={onAnalyze}>{pending ? "Обработка…" : "Заполнить внешность по фото"}</Button><p className="form-hint">AI проанализирует все фото. Описание можно уточнить ниже. {editing ? "Новые фото сохранятся вместе с изменениями внешности, основной снимок заменит обложку. Сохранённые фото доступны в «Медиа»." : "Фото сохранятся после создания персонажа, основной снимок станет его обложкой."}</p></>}
  </section>;
}
