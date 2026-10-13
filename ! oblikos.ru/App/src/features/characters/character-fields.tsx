"use client";

import { useState, type ReactNode } from "react";
import { VoiceFields } from "@/features/voice/voice-fields";
import { ages, genders, niches, hairColors, hairStyles, clothingStyles, communicationStyles, tones, traitOptions, maxTraits, type CharacterFormData, type CharacterSection, type FieldErrors } from "./validation";

type Field = { name: string; label: string; required?: boolean; options?: readonly string[]; custom?: boolean; multiline?: boolean; hint?: string; limit?: number; placeholder?: string };
const fields: Record<CharacterSection, Field[]> = {
  voice: [],
  identity: [
    { name: "name", label: "Имя персонажа", required: true, limit: 120, placeholder: "Например, Дарья" },
    { name: "gender", label: "Пол", required: true, options: genders, placeholder: "Выберите пол" },
    { name: "ageRange", label: "Возраст", required: true, options: ages, placeholder: "Выберите возраст" },
    { name: "niche", label: "Ниша / тематика", required: true, options: niches, custom: true, limit: 160 },
    { name: "biography", label: "Биография", multiline: true, hint: "Кратко расскажите, кто этот персонаж, чем занимается и какую роль играет." },
  ],
  appearance: [
    { name: "hairColor", label: "Цвет волос", options: hairColors, custom: true, limit: 120 },
    { name: "hairStyle", label: "Причёска", options: hairStyles, custom: true, limit: 160 },
    { name: "clothingStyle", label: "Стиль одежды", options: clothingStyles, custom: true, limit: 160 },
    { name: "visualDescription", label: "Описание внешности", multiline: true, hint: "Опишите особенности внешности, которые важно сохранять." },
    { name: "additionalInstructions", label: "Дополнительные пожелания", multiline: true, hint: "Дополнительные детали образа и визуального стиля." },
  ],
  personality: [
    { name: "communicationStyle", label: "Стиль общения", required: true, options: communicationStyles },
    { name: "tone", label: "Тон", options: tones, custom: true, limit: 160 },
    { name: "description", label: "Описание личности", multiline: true, hint: "Что важно знать о характере персонажа?" },
    { name: "additionalInstructions", label: "Дополнительные инструкции", multiline: true, hint: "Дополнительные правила поведения и общения." },
  ],
};
export const sectionLabels: Record<CharacterSection, string> = { identity: "Идентичность", appearance: "Внешность", personality: "Личность", voice: "Голос" };

function Choice({ field, value, onChange, id, error }: { field: Field; value: string; onChange: (value: string) => void; id: string; error?: string }) {
  const [custom, setCustom] = useState(Boolean(value && !field.options?.includes(value)));
  const isCustom = custom || Boolean(value && !field.options?.includes(value));
  return <>
    <select id={id} value={isCustom ? "__other" : value} aria-required={field.required} aria-invalid={Boolean(error)} aria-describedby={`${id}-feedback`} onChange={(event) => {
      const other = event.target.value === "__other";
      setCustom(other);
      onChange(other ? "" : event.target.value);
    }}>
      <option value="">{field.required ? field.placeholder || "Выберите вариант" : "Не указано"}</option>
      {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
      {field.custom && <option value="__other">Другое</option>}
    </select>
    {isCustom && <>
      <label className="form-hint" htmlFor={`${id}-custom`}>{field.name === "niche" ? "Своя ниша" : `Свой вариант: ${field.label.toLowerCase()}`}</label>
      <input id={`${id}-custom`} value={value} maxLength={field.limit} aria-required={field.required} aria-invalid={Boolean(error)} aria-describedby={`${id}-feedback`} onChange={(event) => onChange(event.target.value)} />
    </>}
  </>;
}

export function CharacterFields({ section, data, errors, onChange, photoPanel }: { section: CharacterSection; data: CharacterFormData; errors: FieldErrors; onChange: (section: CharacterSection, field: string, value: string | string[]) => void; photoPanel?: ReactNode }) {
  if (section === "voice") return <VoiceFields settings={data.voice} onChange={(field, value) => onChange("voice", field, value)} />;
  const values = data[section] as unknown as Record<string, string | string[]>;
  function renderField(original: Field) {
      const nonhuman = data.identity.kind !== "HUMAN";
      if (nonhuman && section === "identity" && ["gender", "ageRange"].includes(original.name)) return null;
      if (nonhuman && section === "appearance" && ["hairColor", "hairStyle"].includes(original.name)) return null;
      const field = nonhuman && section === "appearance" && original.name === "visualDescription" ? { ...original, label: "Вид и внешность персонажа", hint: "Укажите вид, окрас, пропорции, морду, лапы и отличительные особенности. Опишите естественную или антропоморфную форму тела." } : original;
      const id = `${section}-${field.name}`;
      const error = errors[`${section}.${field.name}`];
      const value = values[field.name] as string;
      return <div className={`form-field ${field.multiline ? "character-field--wide" : ""}`} key={id}>
        <label htmlFor={id}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
        {field.options ? <Choice field={field} id={id} value={value} error={error} onChange={(v) => onChange(section, field.name, v)} /> : field.multiline ?
          <textarea id={id} rows={4} maxLength={5000} value={value} aria-invalid={Boolean(error)} aria-describedby={`${id}-feedback`} onChange={(event) => onChange(section, field.name, event.target.value)} /> :
          <input id={id} value={value} maxLength={field.limit} placeholder={field.placeholder} aria-required={field.required} aria-invalid={Boolean(error)} aria-describedby={`${id}-feedback`} onChange={(event) => onChange(section, field.name, event.target.value)} />}
        {(section !== "appearance" || error || field.hint) && <span id={`${id}-feedback`} className={error ? "character-field-error" : "form-hint"}>{error || field.hint}</span>}
      </div>;
  }
  return <div className={`character-fields ${section === "appearance" ? "character-fields--appearance" : ""}`}>
    {section === "identity" && <div className="form-field"><label htmlFor="identity-kind">Тип персонажа</label><select id="identity-kind" value={data.identity.kind} onChange={event => onChange("identity", "kind", event.target.value)}><option value="HUMAN">Человек</option><option value="ANIMAL">Животное</option><option value="FANTASY">Фантазийный персонаж</option></select></div>}
    {section === "appearance" ? <>
      <div className="character-appearance-options">{fields.appearance.filter((field) => !field.multiline).map(renderField)}</div>
      {photoPanel}
      {fields.appearance.filter((field) => field.multiline).map(renderField)}
    </> : fields[section].map(renderField)}
    {section === "personality" && <fieldset id="personality-traits" tabIndex={-1} aria-describedby="personality-traits-feedback" className="character-traits character-field--wide">
      <legend>Черты характера</legend>
      <div className="character-chips">{traitOptions.map((trait) => <label className={`character-chip ${data.personality.traits.includes(trait) ? "character-chip--selected" : ""}`} key={trait}>
        <input type="checkbox" disabled={!data.personality.traits.includes(trait) && data.personality.traits.length >= maxTraits} checked={data.personality.traits.includes(trait)} onChange={(event) => onChange("personality", "traits", event.target.checked ? [...data.personality.traits, trait] : data.personality.traits.filter((item) => item !== trait))} />
        <span>{trait}</span>
      </label>)}</div>
      <p id="personality-traits-feedback" className="form-hint" aria-live="polite">Выбрано {data.personality.traits.length} из {maxTraits}. Можно выбрать не более 7 черт характера.</p>
      {errors["personality.traits"] && <p className="character-field-error">{errors["personality.traits"]}</p>}
    </fieldset>}
  </div>;
}
