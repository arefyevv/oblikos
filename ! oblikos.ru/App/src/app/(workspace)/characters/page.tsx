import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { currentWorkspace } from "@/features/auth/access";
import { characters, type CharacterFilter } from "@/features/characters/service";
import { CharacterActions } from "@/features/characters/character-actions";
import { PortraitPlaceholder, statusLabel } from "@/features/characters/character-view";

export const metadata: Metadata = { title: "Персонажи" };
const filters: { key: CharacterFilter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "active", label: "Активные" },
  { key: "archived", label: "Архив" },
];

async function CharacterList({ filter }: { filter: CharacterFilter }) {
  const records = await characters.list(filter);
  if (!records.length) {
    return (
      <Card className="characters-empty-card">
        <EmptyState
          title={filter === "all" ? "У вас пока нет персонажей" : filter === "active" ? "Нет активных персонажей" : "Архив пока пуст"}
          description={filter === "all" ? "Создайте первого персонажа и задайте его внешность, характер и историю." : filter === "active" ? "Создайте персонажа или восстановите его из архива." : "Здесь появятся персонажи, которых вы архивируете."}
        >
          <ButtonLink href={filter === "archived" ? "/characters?filter=active" : "/characters/new"}>{filter === "archived" ? "К активным персонажам" : "Создать персонажа"}<Icon name="arrow" size={18} /></ButtonLink>
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className="character-grid">
      {records.map((character) => (
        <Card key={character.id} className="character-card">
          <Link href={`/characters/${character.id}`} className="character-card-link">
            {character.mediaAssets[0] ? <div className="character-portrait media-header-image"><Image src={`/api/media/${character.mediaAssets[0].id}`} alt={`Основной образ персонажа ${character.name}`} fill sizes="(max-width: 600px) 100vw, 280px" unoptimized /></div> : <PortraitPlaceholder />}
            <div className="character-card-copy">
              <h2>{character.name}</h2>
              <p className="character-card-niche">{character.niche || "Ниша не указана"}</p>
              {character.biography && <p className="character-card-biography">{character.biography}</p>}
              <Badge>{statusLabel(character.status)}</Badge>
            </div>
          </Link>
          <CharacterActions id={character.id} name={character.name} archived={character.status === "ARCHIVED"} />
        </Card>
      ))}
    </div>
  );
}
export default async function CharactersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  // Authorize before streaming, so a forged workspace cookie still returns HTTP 404.
  await currentWorkspace();
  const requested = (await searchParams).filter;
  const filter = filters.find((item) => item.key === requested)?.key || "all";
  const hasCharacters = await characters.hasAny(filter);
  return (
    <>
      <PageHeader title="Персонажи" description="Создавайте и развивайте постоянные цифровые личности."
        action={hasCharacters || filter === "archived" ? <ButtonLink href="/characters/new"><Icon name="plus" size={18} />Создать персонажа</ButtonLink> : undefined}
      />
      <nav className="character-filters" aria-label="Фильтр персонажей">
        {filters.map((item) => (
          <Link key={item.key} href={item.key === "all" ? "/characters" : `/characters?filter=${item.key}`}
            className={`character-filter ${filter === item.key ? "character-filter--active" : ""}`}
            aria-current={filter === item.key ? "page" : undefined}
          >{item.label}</Link>
        ))}
      </nav>
      <Suspense fallback={<div className="character-loading" role="status">Загрузка персонажей…</div>}>
        <CharacterList filter={filter} />
      </Suspense>
    </>
  );
}
