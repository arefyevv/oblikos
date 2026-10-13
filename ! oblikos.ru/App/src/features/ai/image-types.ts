import type { ImageRequest } from "@/features/media/validation";

export type ImageInput = { bytes: Buffer; mimeType: string };
export type ImageProviderRequest = { prompt: string; aspectRatio: ImageRequest["aspectRatio"]; referenceImages?: ImageInput[] };
export type ImageOutput = { bytes: Buffer; provider: string; model: string; referenceUsed: boolean };
export interface ImageProvider {
  capabilities(): { referenceImages: boolean };
  generateImage(request: ImageProviderRequest): Promise<ImageOutput>;
}
export class ImageError extends Error {
  constructor(public code: keyof typeof imageMessages) { super(`ImageError:${code}`); }
}
export const imageMessages = {
  configuration: "Генерация изображений не настроена. Администратору нужно проверить серверные настройки модели изображений и API.",
  timeout: "Сервис изображений не ответил вовремя. Перед новой генерацией проверьте медиатеку.",
  rate_limit: "Сервис изображений временно ограничил запросы. Попробуйте позже.",
  network: "Сервис изображений недоступен. Попробуйте позже.",
  provider: "Сервис не смог создать изображение. Проверьте доступность выбранной модели.",
  response: "Сервис вернул некорректное изображение. Файл не сохранён.",
  storage: "Не удалось сохранить или прочитать изображение. Попробуйте позже.",
} as const;
