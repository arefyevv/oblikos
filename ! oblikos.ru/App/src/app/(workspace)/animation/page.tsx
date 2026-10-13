import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { characters, CharacterUnavailable } from "@/features/characters/service";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { AnimationCharacterPicker } from "@/features/media/animation-character-picker";
import { PerformanceVideoForm } from "@/features/media/performance-form";
import { performanceAvailability } from "@/features/media/performance-service";
import { VideoJobs } from "@/features/media/video-jobs";
import { videos } from "@/features/media/video-service";
import { media } from "@/features/media/service";
import { mediaView } from "@/features/media/operations";
import { MediaGallery } from "@/features/media/gallery";

export const metadata: Metadata = { title: "Анимация" };
export default async function AnimationPage({ searchParams }: { searchParams: Promise<{ characterId?: string; page?: string }> }) {
  const params = await searchParams;
  const available = await characters.list();
  let selected;
  if (params.characterId) {
    try { selected = await characters.get(params.characterId); }
    catch (error) { if (error instanceof CharacterUnavailable) notFound(); throw error; }
  }
  selected ??= available.find(character => character.status !== "ARCHIVED") || available[0];
  if (!selected) return <><PageHeader title="Анимация" description="Оживляйте фото под аудио или переносите движения из видео."/><EmptyState icon="video" title="Добавьте первого персонажа" description="Персонаж нужен для сохранения фото и видео. После создания анимацией можно заниматься прямо в этом разделе."><ButtonLink href="/characters/new">Создать персонажа</ButtonLink></EmptyState></>;
  const choices = available.some(character => character.id === selected.id) ? available : [selected, ...available];
  const rawPage = Number(params.page || 1), page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 10000 ? rawPage : 1;
  const [result, generations] = await Promise.all([media.list(selected.id, page, "VIDEO"), videos.list(selected.id)]);
  const base = `/animation?characterId=${encodeURIComponent(selected.id)}`;
  return <section className="content-view">
    <PageHeader title="Анимация" description="Загрузите фото и видеореференс или аудиозапись. Создавайте и смотрите видео в одном разделе."/>
    <AnimationCharacterPicker selectedId={selected.id} characters={choices.map(character => ({ id: character.id, name: character.name, archived: character.status === "ARCHIVED" }))}/>
    <VideoJobs key={`jobs:${selected.id}`} generations={generations}/>
    {selected.status === "ARCHIVED" ? <p className="form-message" role="status">Персонаж в архиве: сохранённые видео доступны. Для новой анимации выберите другого персонажа или восстановите этого.</p> : <PerformanceVideoForm key={selected.id} characterId={selected.id} availability={performanceAvailability()} initiallyOpened initialMode="PERFORMANCE"/>}
    <section className="animation-results" aria-labelledby="animation-results-heading">
      <div className="memory-heading"><div><h2 id="animation-results-heading">Готовые видео</h2><p>Видео выбранного персонажа. Готовый результат появится здесь и в медиатеке.</p></div></div>
      {result.total ? <><MediaGallery key={`gallery:${selected.id}:${page}`} entries={result.entries.map(mediaView)}/><div className="content-buttons">{page > 1 && <ButtonLink variant="secondary" href={`${base}&page=${page - 1}`}>Предыдущие</ButtonLink>}{page * 48 < result.total && <ButtonLink variant="secondary" href={`${base}&page=${page + 1}`}>Следующие</ButtonLink>}</div></> : <p className="form-hint">Готовых видео пока нет. Выберите фото и загрузите референс, чтобы создать первое.</p>}
    </section>
  </section>;
}
