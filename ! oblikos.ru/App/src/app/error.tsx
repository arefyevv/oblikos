"use client";
import { Button } from "@/components/ui/button";

export default function AppError({ retry }: { retry: () => void }) {
  return <main className="not-found"><p className="eyebrow">Oblik OS</p><h1>Сервис временно недоступен</h1><p>Не удалось загрузить страницу. Повторите попытку позже.</p><Button onClick={retry}>Попробовать снова</Button></main>;
}
