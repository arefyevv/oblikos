"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CharacterFields, sectionLabels } from "./character-fields";
import { CharacterSummary } from "./character-summary";
import { createCharacterAction, updateCharacterAction } from "./actions";
import { createCharacterFromPhotosAction, describeCharacterPhotosAction, updateAppearanceWithPhotosAction } from "./photo-actions";
import { PhotoUpload } from "./photo-upload";
import { characterSchema, sectionSchemas, emptyCharacter, validationErrors, type CharacterFormData, type CharacterSection, type FieldErrors } from "./validation";

const sections: CharacterSection[] = ["identity", "appearance", "personality", "voice"];
const stepLabels = ["Идентичность", "Внешность", "Личность", "Голос", "Проверка"];
const descriptions = ["Определите, кто этот персонаж и чем занимается.", "Задайте детали образа, которые важно сохранять. После создания персонажа можно сгенерировать изображение во вкладке «Медиа».", "Опишите характер и манеру общения персонажа.", "Выберите постоянный голос. Настройки можно изменить позже в разделе «Голос».", "Проверьте профиль персонажа перед созданием."];

export function CharacterForm({ id, section, initial = emptyCharacter }: { id?: string; section?: CharacterSection; initial?: CharacterFormData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<File[]>([]);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ text: string; ok: boolean }>();
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const submitting = useRef(false);
  const creationId = useRef<string | undefined>(undefined);
  const activeSection = section || sections[step];
  const dirty = section ? photos.length > 0 || JSON.stringify(data[section]) !== JSON.stringify(baseline[section]) : true;
  const busy = pending || preparingPhotos;
  function photoForm() {
    const form = new FormData();
    photos.forEach((file) => form.append("photos", file));
    return form;
  }
  function analyzePhotos() {
    if (pending || preparingPhotos || submitting.current || !photos.length) return;
    submitting.current = true;
    setMessage(undefined);
    startTransition(async () => {
      try {
        const result = await describeCharacterPhotosAction(photoForm());
        if (result.ok && result.appearance) setData((current) => ({ ...current, appearance: result.appearance! }));
        setMessage({ text: result.message, ok: result.ok });
      } catch { setMessage({ text: "Не удалось связаться с сервером. Повторите попытку.", ok: false }); }
      finally { submitting.current = false; }
    });
  }

  useEffect(() => {
    if (mounted.current) heading.current?.focus({ preventScroll: Boolean(section) });
    mounted.current = true;
  }, [step, section]);

  function change(layer: CharacterSection, field: string, value: string | string[]) {
    setData((current) => ({ ...current, [layer]: { ...current[layer], [field]: value } }));
    setErrors((current) => ({ ...current, [`${layer}.${field}`]: "" }));
    setMessage(undefined);
  }
  function showErrors(nextErrors: FieldErrors) {
    setErrors(nextErrors);
    setMessage({ text: "Проверьте выделенные поля.", ok: false });
    const first = Object.keys(nextErrors)[0];
    document.getElementById(first?.replace(".", "-"))?.focus();
  }
  function validateStep() {
    const result = sectionSchemas[activeSection].safeParse(data[activeSection]);
    if (!result.success) {
      showErrors(Object.fromEntries(Object.entries(validationErrors(result.error)).map(([key, value]) => [`${activeSection}.${key}`, value])));
      return false;
    }
    setErrors({}); setMessage(undefined);
    return true;
  }
  function submit() {
    if (pending || preparingPhotos || submitting.current) return;
    if (!section && step < sections.length) {
      if (validateStep()) setStep(step + 1);
      return;
    }
    const result = section ? sectionSchemas[section].safeParse(data[section]) : characterSchema.safeParse(data);
    if (!result.success) {
      const nextErrors = validationErrors(result.error);
      if (!section) {
        const firstSection = Object.keys(nextErrors)[0]?.split(".")[0] as CharacterSection;
        setStep(sections.indexOf(firstSection));
      }
      showErrors(section ? Object.fromEntries(Object.entries(nextErrors).map(([key, value]) => [`${section}.${key}`, value])) : nextErrors);
      return;
    }
    submitting.current = true;
    creationId.current ??= crypto.randomUUID();
    startTransition(async () => {
      try {
        const response = section && id
          ? section === "appearance" && photos.length ? await updateAppearanceWithPhotosAction(id, data.appearance, creationId.current!, photoForm()) : await updateCharacterAction(id, section, data[section])
          : photos.length ? await createCharacterFromPhotosAction(data, creationId.current!, photoForm()) : await createCharacterAction(data, creationId.current!);
        if (!response.ok) {
          if (response.errors) {
            const nextErrors = section ? Object.fromEntries(Object.entries(response.errors).map(([key, value]) => [`${section}.${key}`, value])) : response.errors;
            if (!section) setStep(Math.max(0, sections.indexOf(Object.keys(nextErrors)[0]?.split(".")[0] as CharacterSection)));
            showErrors(nextErrors);
          } else setMessage({ text: response.message, ok: false });
          return;
        }
        if (!section && response.id) { router.push(`/characters/${response.id}`); return; }
        setBaseline(data);
        setPhotos([]); creationId.current = undefined;
        router.refresh();
        setMessage({ text: response.message, ok: true });
      } catch { setMessage({ text: "Не удалось связаться с сервером. Повторите попытку.", ok: false }); }
      finally { submitting.current = false; }
    });
  }
  return <Card className="character-form-card">
    {!section && <ol className="character-progress" aria-label="Шаги создания персонажа">{stepLabels.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined}>
      <button type="button" disabled={busy || index > step} onClick={() => { setStep(index); setMessage(undefined); }}><span>{index + 1}</span>{label}</button>
    </li>)}</ol>}
    <form noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="character-form-heading"><h2 ref={heading} tabIndex={-1}>{section ? sectionLabels[section] : stepLabels[step]}</h2><p>{section ? "Сохраните изменения, чтобы обновить профиль персонажа." : descriptions[step]}</p></div>
      {message && <p className={`form-message ${message.ok ? "form-message--success" : ""}`} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      <fieldset disabled={pending} className="character-form-fieldset">
        {!section && photos.length > 0 && step === sections.length && <p className="character-photo-summary">Будут сохранены {photos.length} фото. Основной снимок станет обложкой и референсом персонажа.</p>}
        {section || step < sections.length ? <CharacterFields key={activeSection} section={activeSection} data={data} errors={errors} onChange={change} photoPanel={activeSection === "appearance" ? <PhotoUpload files={photos} editing={Boolean(section)} pending={pending} onAnalyze={analyzePhotos} onProcessing={setPreparingPhotos} onChange={(files) => { setPhotos(files); creationId.current = undefined; setMessage(undefined); }} /> : undefined} /> : <CharacterSummary data={data} onEdit={(layer) => { setStep(sections.indexOf(layer)); setMessage(undefined); }} />}
      </fieldset>
      <div className="character-form-footer">
        {section ? <ButtonLink href={`/characters/${id}`} variant="quiet">К обзору</ButtonLink> : <Button variant="secondary" disabled={busy || step === 0} onClick={() => { setStep(step - 1); setMessage(undefined); }}>Назад</Button>}
        <Button type="submit" disabled={busy || !dirty} aria-busy={busy}>{preparingPhotos ? "Подготовка фото…" : pending ? "Обработка…" : section ? "Сохранить изменения" : step === sections.length ? "Создать персонажа" : "Продолжить"}</Button>
      </div>
    </form>
  </Card>;
}
