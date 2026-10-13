"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
export default function CharactersError({ retry }: { retry: () => void }) {
  return <Card className="character-settings-card"><h2>Не удалось загрузить персонажей</h2><p className="form-hint">Сервис временно недоступен. Повторите попытку.</p><Button onClick={retry}>Попробовать снова</Button></Card>;
}
