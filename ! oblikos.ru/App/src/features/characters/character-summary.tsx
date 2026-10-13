import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type CharacterFormData, type CharacterSection } from "./validation";

const sections: { section: CharacterSection; title: string; fields: [string, string][] }[] = [
  { section: "identity", title: "Идентичность", fields: [["name", "Имя"], ["gender", "Пол"], ["ageRange", "Возраст"], ["niche", "Ниша"], ["biography", "Биография"]] },
  { section: "appearance", title: "Внешность", fields: [["hairColor", "Волосы"], ["hairStyle", "Причёска"], ["clothingStyle", "Одежда"], ["visualDescription", "Описание"], ["additionalInstructions", "Пожелания"]] },
  { section: "personality", title: "Личность", fields: [["communicationStyle", "Стиль общения"], ["tone", "Тон"], ["traits", "Черты характера"], ["description", "Описание"], ["additionalInstructions", "Инструкции"]] },
  { section: "voice", title: "Голос", fields: [["voiceId", "Голос"], ["speed", "Темп"], ["style", "Манера речи"], ["instructions", "Пожелания"]] },
];
export function CharacterSummary({ data, onEdit }: { data: CharacterFormData; onEdit: (section: CharacterSection) => void }) {
  return <div className="character-summary">{sections.map(({ section, title, fields }) => {
    const values = data[section] as unknown as Record<string, string | string[]>;
    return <Card key={section} className="character-summary-card">
      <div className="character-summary-heading"><h3>{title}</h3><Button variant="quiet" onClick={() => onEdit(section)} aria-label={`Изменить: ${title}`}>Изменить</Button></div>
      <dl>{fields.map(([field, label]) => {
        const value = Array.isArray(values[field]) ? values[field].join(", ") : values[field];
        return <div key={field}><dt>{label}</dt><dd>{value || "Не указано"}</dd></div>;
      })}</dl>
    </Card>;
  })}</div>;
}
