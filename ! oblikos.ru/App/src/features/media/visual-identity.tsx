import { ButtonLink } from "@/components/ui/button";
import { OpenAICompatibleImageProvider } from "@/features/ai/image-provider";
import { ImageError, imageMessages } from "@/features/ai/image-types";
import { mediaView } from "./operations";
import { media } from "./service";
import { MediaGallery } from "./gallery";
import { ImageGenerationForm } from "./generation-form";
import { VideoGenerationForm } from "./video-form";
import { VideoJobs } from "./video-jobs";
import { TalkingVideoForm } from "./talking-form";
import { PerformanceVideoForm } from "./performance-form";
import { performanceAvailability } from "./performance-service";
import { videos, videoProvider } from "./video-service";
import { VideoError } from "@/features/ai/video-types";
import type { VideoCapabilities } from "@/features/ai/video-types";
import { assertGenerationEnabled, GenerationSafetyError, generationSafetyMessages } from "@/features/ai/safety";

export async function VisualIdentity({ characterId, archived, page = 1, type }: { characterId: string; archived: boolean; page?: number; type?: "IMAGE" | "VIDEO" }) {
  const [result, primary, generations] = await Promise.all([media.list(characterId, page, type), media.primary(characterId), videos.list(characterId)]);
  let referenceSupported = false;
  let configurationError: string | undefined;
  try { referenceSupported = new OpenAICompatibleImageProvider().capabilities().referenceImages; }
  catch (error) { if (!(error instanceof ImageError)) throw error; configurationError = imageMessages[error.code]; }
  let videoCapabilities: VideoCapabilities | null = null;
  let videoConfigurationError: string | undefined;
  if (!archived) {
    try { assertGenerationEnabled("video"); videoCapabilities = await videoProvider.capabilities(); }
    catch (error) {
      if (error instanceof VideoError) videoConfigurationError = error.message;
      else if (error instanceof GenerationSafetyError) videoConfigurationError = generationSafetyMessages[error.code];
      else throw error;
    }
  }
  return <section className="visual-identity" aria-labelledby="visual-identity-title">
    <div><h2 id="visual-identity-title">Медиа</h2><p className="page-description">Фото и видео персонажа. {primary ? "Основной образ выбран. Его можно заменить другим изображением из галереи." : "Создайте базовый образ персонажа. Выбранное изображение станет основой следующих фото."}</p></div>
    {archived ? <p className="form-hint">Персонаж в архиве. Изображения доступны для просмотра; восстановите персонажа для новой генерации.</p> : <ImageGenerationForm characterId={characterId} hasPrimary={Boolean(primary)} referenceSupported={referenceSupported} configurationError={configurationError} />}
    {!archived && <VideoGenerationForm characterId={characterId} hasPrimary={Boolean(primary)} capabilities={videoCapabilities} configurationError={videoConfigurationError}/>}
    {!archived && <TalkingVideoForm characterId={characterId} hasPrimary={Boolean(primary)} available={Boolean(process.env.AITUNNEL_API_KEY?.trim())}/>}
    {!archived && <PerformanceVideoForm characterId={characterId} availability={performanceAvailability()}/>}
    <VideoJobs generations={generations}/>
    <nav className="content-buttons" aria-label="Тип медиа">{[["", "Все"], ["IMAGE", "Изображения"], ["VIDEO", "Видео"]].map(([value, label]) => <ButtonLink key={value} scroll={false} variant="secondary" aria-current={(type || "") === value ? "page" : undefined} href={`?type=${value}`}>{label}</ButtonLink>)}</nav>
    {result.total > 0 && <><h3>Медиа персонажа · {result.total}</h3><MediaGallery entries={result.entries.map(mediaView)} /><div className="content-buttons">{page > 1 && <ButtonLink variant="secondary" href={`?type=${type || ""}&page=${page - 1}`}>Предыдущие</ButtonLink>}{page * 48 < result.total && <ButtonLink variant="secondary" href={`?type=${type || ""}&page=${page + 1}`}>Следующие</ButtonLink>}</div></>}
  </section>;
}
