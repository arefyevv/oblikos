"use client";
import "./globals.css";

export default function GlobalError({ retry }: { retry: () => void }) {
  return <html lang="ru"><body><main className="not-found"><p className="eyebrow">Oblik OS</p><h1>Сервис временно недоступен</h1><p>Повторите попытку позже.</p><button className="button button--primary" onClick={retry}>Попробовать снова</button></main></body></html>;
}
