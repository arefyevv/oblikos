import { notFound } from "next/navigation";
import { characters, CharacterUnavailable } from "@/features/characters/service";
import { GenerationForm } from "@/features/content/generation-form";
import { CreateContentWorkspace, type CreationKind } from "@/features/content/create-content-workspace";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { ImageGenerationForm } from "@/features/media/generation-form";
import { VideoGenerationForm } from "@/features/media/video-form";
import { VideoJobs } from "@/features/media/video-jobs";
import { PerformanceVideoForm } from "@/features/media/performance-form";
import { TalkingVideoForm } from "@/features/media/talking-form";
import { performanceAvailability } from "@/features/media/performance-service";
import { media } from "@/features/media/service";
import { videos, videoProvider } from "@/features/media/video-service";
import { OpenAICompatibleImageProvider } from "@/features/ai/image-provider";
import { ImageError, imageMessages } from "@/features/ai/image-types";
import { VideoError, type VideoCapabilities } from "@/features/ai/video-types";
import { assertGenerationEnabled, GenerationSafetyError, generationSafetyMessages } from "@/features/ai/safety";

export default async function NewContentPage({ searchParams }: { searchParams: Promise<{ characterId?: string; kind?: string }> }) {
  const { characterId, kind } = await searchParams;
  let selected;
  if (characterId) {
    try { selected = await characters.get(characterId); }
    catch (error) { if (error instanceof CharacterUnavailable) notFound(); throw error; }
    if (selected.status === "ARCHIVED") return <EmptyState icon="content" title="Персонаж в архиве" description="Восстановите персонажа перед созданием контента."><ButtonLink href={`/characters/${selected.id}/settings`}>К настройкам персонажа</ButtonLink></EmptyState>;
  }
  const available = (await characters.list()).filter(character => character.status !== "ARCHIVED");
  selected ??= available[0];
  if (!selected) return <EmptyState icon="characters" title="Нужен персонаж" description="Создайте персонажа или восстановите его из архива, чтобы создавать контент."><ButtonLink href="/characters">К персонажам</ButtonLink></EmptyState>;
  const choices = available.some(character => character.id === selected.id) ? available : [selected, ...available];
  const [primary, generations] = await Promise.all([media.primary(selected.id), videos.list(selected.id)]);
  let referenceSupported = false;
  let imageError: string | undefined;
  try { referenceSupported = new OpenAICompatibleImageProvider().capabilities().referenceImages; }
  catch (error) { if (!(error instanceof ImageError)) throw error; imageError = imageMessages[error.code]; }
  let capabilities: VideoCapabilities | null = null;
  let videoError: string | undefined;
  try { assertGenerationEnabled("video"); capabilities = await videoProvider.capabilities(); }
  catch (error) {
    if (error instanceof VideoError) videoError = error.message;
    else if (error instanceof GenerationSafetyError) videoError = generationSafetyMessages[error.code];
    else throw error;
  }
  const initialKind: CreationKind = kind === "image" || kind === "video" ? kind : "text";
  return <CreateContentWorkspace key={selected.id} characterId={selected.id} characters={choices.map(character => ({ id: character.id, name: character.name }))} initialKind={initialKind}
    text={<GenerationForm selected={{ id: selected.id, name: selected.name }} characters={[]} showCharacter={false} />}
    image={<><ImageGenerationForm characterId={selected.id} hasPrimary={Boolean(primary)} referenceSupported={referenceSupported} configurationError={imageError} /><div className="creation-result-link"><ButtonLink variant="quiet" href={`/characters/${selected.id}/media?type=IMAGE`}>Открыть изображения персонажа →</ButtonLink></div></>}
    video={<><VideoGenerationForm characterId={selected.id} hasPrimary={Boolean(primary)} capabilities={capabilities} configurationError={videoError} initiallyOpened primaryHref={`/content/new?characterId=${selected.id}&kind=image`} /><TalkingVideoForm characterId={selected.id} hasPrimary={Boolean(primary)} available={Boolean(process.env.AITUNNEL_API_KEY?.trim())}/><PerformanceVideoForm characterId={selected.id} availability={performanceAvailability()}/><VideoJobs generations={generations} /><div className="creation-result-link"><ButtonLink variant="quiet" href={`/characters/${selected.id}/media?type=VIDEO`}>Открыть видео персонажа →</ButtonLink></div></>}
  />;
}
