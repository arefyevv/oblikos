import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import type { DashboardData, DashboardEntry } from "./operations";

function RecentEntries({ entries }: { entries: DashboardEntry[] }) {
  return <ul className="dashboard-recent">{entries.map((entry) => <li key={entry.id}>
    <Link href={entry.href} className="dashboard-recent-link">
      <span className="dashboard-recent-title">{entry.title}</span>
      <span className="dashboard-recent-description">{entry.description}</span>
      <time dateTime={entry.date.toISOString()}>{entry.date.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
    </Link>
  </li>)}</ul>;
}

const identityLayers = [
  {
    number: "01",
    title: "Идентичность",
    text: "Имя, биография и роль.",
    icon: "identity",
  },
  {
    number: "02",
    title: "Внешность",
    text: "Постоянный образ и визуальный стиль.",
    icon: "appearance",
  },
  {
    number: "03",
    title: "Личность",
    text: "Характер, ценности и манера общения.",
    icon: "personality",
  },
] as const;

export function Dashboard({ hasCharacters = false, activity = [], content = [] }: Partial<DashboardData>) {
  return (
    <>
      <PageHeader
        title="Обзор пространства"
        description="Создавайте и управляйте AI-персонажами в одном пространстве."
        action={hasCharacters ? (
          <ButtonLink href="/characters/new">
            <Icon name="plus" size={18} />
            Создать персонажа
          </ButtonLink>
        ) : undefined}
      />
      <div className="dashboard-grid">
        <Card className="welcome-card">
          <div className="card-topline">
            <span className="section-label">Ваши персонажи</span>
            <Badge variant="accent">Начало работы</Badge>
          </div>
          <div className="identity-art" aria-hidden="true">
            <div className="identity-art__back" />
            <div className="identity-art__middle" />
            <div className="identity-art__front">
              <div className="identity-art__portrait">
                <Icon name="identity" size={45} />
              </div>
              <div className="identity-art__line" />
              <div className="identity-art__line identity-art__line--short" />
              <span className="identity-art__plus">
                <Icon name="plus" size={16} />
              </span>
            </div>
          </div>
          <div className="welcome-card__copy">
            <h2>{hasCharacters ? "Ваши персонажи" : "У вас пока нет персонажей"}</h2>
            <p>
              {hasCharacters ? "Откройте персонажа, чтобы продолжить работу над его внешностью, характером и историей." : "Создайте первого персонажа и задайте его внешность, характер и историю."}
            </p>
            <ButtonLink href={hasCharacters ? "/characters" : "/characters/new"}>
              {hasCharacters ? "Открыть персонажей" : "Создать первого персонажа"}
              <Icon name="arrow" size={18} />
            </ButtonLink>
          </div>
          <div className="welcome-card__footer">
            <Icon name="layers" size={17} />
            <span>Одна личность. Множество возможностей.</span>
          </div>
        </Card>
        <Card className="identity-guide">
          <p className="section-label">Больше, чем образ</p>
          <h2>У личности есть глубина.</h2>
          <p className="identity-guide__intro">
            Профиль объединяет три основы AI-персонажа.
          </p>
          <div className="identity-layers">
            {identityLayers.map((layer) => (
              <div className="identity-layer" key={layer.number}>
                <span className="identity-layer__number">{layer.number}</span>
                <div>
                  <h3>{layer.title}</h3>
                  <p>{layer.text}</p>
                </div>
                <Icon name={layer.icon} size={19} />
              </div>
            ))}
          </div>
          <div className="identity-guide__bottom">
            <span>Далее: память и контент</span>
            <Icon name="arrow" size={17} />
          </div>
        </Card>
      </div>
      <div className="activity-grid">
        <Card className="activity-card">
          <div className="card-topline">
            <h2>Последние действия</h2>
            <Icon name="history" />
          </div>
          {activity.length ? <RecentEntries entries={activity} /> : <div className="activity-empty">
            <span className="activity-empty__line" />
            <p>История начинается здесь</p>
            <span>
              Здесь будет история работы с вашими персонажами.
            </span>
          </div>}
        </Card>
        <Card className="activity-card">
          <div className="card-topline">
            <h2>Последний контент</h2>
          </div>
          {content.length ? <RecentEntries entries={content} /> : <div className="content-empty">
            <span className="content-empty__icon">
              <Icon name="content" size={23} />
            </span>
            <div>
              <p>Место для будущих идей</p>
              <span>
                Посты, сценарии и другие материалы от имени персонажа появятся
                здесь.
              </span>
            </div>
          </div>}
        </Card>
      </div>
    </>
  );
}
