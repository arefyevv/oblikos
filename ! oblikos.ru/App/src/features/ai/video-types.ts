export type VideoCapabilities = { referenceImages: boolean; durations: number[]; aspectRatios: string[] };
export type VideoInput = { prompt: string; duration: number; aspectRatio: string; reference: { bytes: Buffer; mimeType: string; url?: string }; audio?: { bytes: Buffer; mimeType: string }; performance?: { bytes: Buffer; mimeType: string; url?: string; keepOriginalSound: boolean; orientation: "image" | "video" } };
export type VideoJob = { id: string; status: "PENDING" | "PROCESSING" | "READY" | "FAILED"; error?: VideoErrorCode };
export interface VideoProvider {
  configuration(): { provider: string; model: string };
  capabilities(): Promise<VideoCapabilities>;
  createVideo(input: VideoInput): Promise<VideoJob>;
  getVideoStatus(id: string): Promise<VideoJob>;
  downloadVideo(id: string): Promise<{ bytes: Buffer; mimeType: string }>;
}
export const videoMessages = {
  disabled: "Генерация видео временно отключена. Сохранённые видео доступны.",
  rate_limit: "Достигнут лимит генераций видео. Попробуйте позже.",
  configuration: "Генерация видео пока не настроена. Обратитесь к администратору.",
  reference: "Выбранное фото недоступно. Выберите другое фото или создайте новый образ.",
  moderation: "Провайдер отклонил описание или основной образ.",
  balance: "Недостаточно средств для генерации видео.",
  invalid: "Выбранные параметры видео не поддерживаются.",
  provider: "Не удалось создать видео. Сервис временно недоступен.",
  timeout: "Проверка видео заняла слишком много времени. Статус будет восстановлен при следующем открытии.",
  ambiguous: "Ответ на запуск не получен. Повторный платный запрос заблокирован. Проверьте статус или обратитесь к администратору.",
  response: "Сервис вернул некорректный видеофайл.",
  missing: "Задание или результат видео недоступны у провайдера.",
  storage: "Не удалось сохранить видео. Проверка будет повторена без новой генерации.",
  audio_merge: "Не удалось вернуть исходный звук. Обработка будет повторена без новой платной генерации.",
  speech: "Не удалось подготовить речь. Проверьте настройки голоса персонажа и сервиса озвучки.",
  speech_duration: "Озвучка длиннее выбранного лимита видео. Сократите текст или увеличьте максимальную длительность.",
  source: "Исходный файл недоступен или срок его хранения истёк. Загрузите его снова.",
  reference_duration: "Для этого режима нужен видеореференс длительностью от 5 до 15 секунд.",
  seedance_duration: "Для Seedance Mini нужен видеореференс длительностью от 4 до 15 секунд. Исходник автоматически не обрезается.",
  seedance_source_resolution: "Исходное видео слишком маленькое для Seedance Mini. Нужно не менее 407 696 пикселей в кадре — например, 480×854 или 720×1280 для вертикального видео. Загрузите файл большего разрешения. Генерация не запущена, списания нет.",
  price: "Стоимость этого режима не настроена. Платный запуск недоступен.",
  deadline: "Превышен срок ожидания видео. Автоматический повтор платной генерации отключён. ID операции сохранён для проверки администратором.",
} as const;
export type VideoErrorCode = keyof typeof videoMessages;
export type VideoDiagnostic = { status: number; requestId?: string; providerCode?: string; parameter?: string; message?: string };
export class VideoError extends Error {
  constructor(public code: VideoErrorCode, public diagnostic?: VideoDiagnostic) { super(videoMessages[code]); this.name = "VideoError"; }
}
