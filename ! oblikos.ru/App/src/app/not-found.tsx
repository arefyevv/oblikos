import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">404</p>
      <h1>Страница не найдена</h1>
      <p>Проверьте адрес или вернитесь в пространство.</p>
      <ButtonLink href="/dashboard">К обзору</ButtonLink>
    </main>
  );
}
