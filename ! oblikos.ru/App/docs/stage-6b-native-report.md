# Этап 6B — native Google/Veo preflight, 3 октября 2026

Актуальный результат после реализации SDK и одного POST: [stage-6b-sdk-live-report.md](stage-6b-sdk-live-report.md). Выводы старого GET/OPTIONS preflight не являются доказательством отсутствия POST route.

## Повторная проверка после смены модели на Fast

В `.env` теперь `OPENAI_VIDEO_MODEL=google/veo-3.1-fast`. Native ID `veo-3.1-fast-generate-preview` подтверждён Google и найден в HTTP 200 catalogue ProxyAPI с `supportedGenerationMethods: ["predictLongRunning"]`. Блокер наличия выбранной модели в полученном catalogue снят. `GOOGLE_VIDEO_MODEL` не задан.

Исправлен preflight: он проверяет модель из текущей env через явный mapping документированных Google IDs, вместо постоянной проверки Lite. Добавлены время проверки, selectedModelFound и бесплатные GET/OPTIONS route probes. GET/OPTIONS `:predictLongRunning` для Fast возвращают 404 и на `/v1beta`, и на legacy `/google/v1beta`; OpenAPI по-прежнему не описывает video operation/download routes. 404 от GET/OPTIONS не доказывает, что POST не поддерживается, но подтверждённого native create/poll/download contract пока нет. Старые Lite-проверки ниже относятся к предыдущему состоянию env.

Live POST не отправлялся; платных create 0. ESLint изменённого скрипта PASS. Полный suite повторно не запускался: app code не изменён. Актуальные результаты preflight: `artifacts/veo-native-preflight.json`. **Этап 6B остаётся НЕ ГОТОВ: нужен подтверждённый native Veo create/poll/download путь ProxyAPI.**

---

Исторический отчёт проверки Lite:

**НЕ ГОТОВ. Платных live create: 0.** Native Google Image contract подтверждён, но доступность выбранной Lite-модели и native Veo create/poll/download через ProxyAPI не подтверждена. Production adapter не подключён; существующая архитектура сохранена.

## Официальные источники

1. [ProxyAPI Gemini native format](https://proxyapi.ru/docs/gemini-api): актуальная SDK base URL — `https://api.proxyapi.ru`, библиотека добавляет `/v1beta` сама. Авторизация `x-goog-api-key` с ключом ProxyAPI; официальный Google SDK поддерживается. Имена моделей короткие, без `google/`.
2. [ProxyAPI Native API](https://proxyapi.ru/docs/native-api): описывает native формат Google и отсутствие перевода для родного формата. Эта общая страница не определяет поддержку конкретных Veo operation/download routes.
3. [ProxyAPI Video API](https://proxyapi.ru/docs/video-generation): описывает unified video API. Старый URL `/docs/gemini-video-veo` перенаправляет сюда. Старый cached пример с `/google/v1beta` не использован как актуальный контракт.
4. [Google Veo 3.1 Lite model](https://ai.google.dev/gemini-api/docs/models/veo-3.1-lite-generate-preview?hl=en): native ID `veo-3.1-lite-generate-preview`, text/image input, одно выходное видео.
5. [Google Veo guide](https://ai.google.dev/gemini-api/docs/veo): SDK `@google/genai`, `GoogleGenAI.models.generateVideos`, `operations.getVideosOperation`, `files.download`. Lite поддерживает first-frame `image`, 4/6/8 секунд при 720p, 16:9/9:16; 1080p требует 8 секунд. `referenceImages` у Lite не поддерживается. Native аудио всегда включено, поэтому unified `generate_audio: false` нельзя переносить в этот путь.
6. [Google SDK Image type](https://googleapis.github.io/js-genai/release_docs/interfaces/types.Image.html): `imageBytes` — base64 string; `mimeType` — MIME изображения. Первое изображение передаётся в `image` как `{ imageBytes: bytes.toString("base64"), mimeType }`, без data URL. Это подтверждение Google SDK, не подтверждение работоспособности native Veo маршрута ProxyAPI.

## Бесплатный preflight ProxyAPI

Скрипт `scripts/check-veo-native.mjs` делает только GET и OPTIONS, не содержит POST/create, не логирует ключ или изображения. Аудит: `artifacts/veo-native-preflight.json`.

| Проверка | Результат |
| --- | --- |
| Ключ ProxyAPI | Есть; значение не выводилось |
| `GET /openapi.json` | HTTP 200 |
| Native `predictLongRunning`, video operations/download в OpenAPI | Не найдены |
| `GET /v1beta/models` | HTTP 200, 50 различных моделей в полученной странице |
| Veo в полученном catalogue | `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview` |
| Пагинация | Следующая страница повторяет модели и nextPageToken; полнота catalogue не подтверждена |
| `GET /v1beta/models/veo-3.1-lite-generate-preview` | HTTP 404; это может быть отсутствие GET route, а не доказательство отсутствия модели |
| `OPTIONS /v1beta/models/veo-3.1-lite-generate-preview:predictLongRunning` | HTTP 404, нет Allow |
| Video POST | Не отправлялся |

Отсутствие маршрутов в OpenAPI и 404 OPTIONS не доказывают, что POST никогда не поддерживается, но не позволяют подтвердить его доступность. Lite не найден в полученных страницах; из-за повторяющейся пагинации утверждать полноту списка нельзя. По ограничению «не угадывать модели и параметры» live preflight не пройден. Standard/Fast вместо Lite не выбирались.

## Что реализовано и что не выполнено

Добавлен безопасный read-only preflight, проверена актуальная документация. Ни Google SDK, ни неподтверждённый native adapter не установлены/подключены. `GOOGLE_VIDEO_MODEL` в .env не добавлен: native ID известен Google, но его доступность через выбранный ProxyAPI путь не подтверждена. Runtime model mapping не реализован; простое удаление `google/` было бы неверным.

Encoder и native wire-contract tests не добавлены: сначала требуется подтвердить маршруты и доступность выбранной модели. Уже существующие VideoProvider, Media Core, polling/jobs, prompt builder, idempotency, snapshot primary, StorageProvider, protected streaming, Range и Workspace security сохранены. Offline FakeVideoProvider workflow сохранён.

## Live acceptance

| Требование | Результат |
| --- | --- |
| ProxyAPI model | `google/veo-3.1-lite` |
| Google native ID | `veo-3.1-lite-generate-preview`, подтверждён Google; ProxyAPI availability не подтверждена |
| Candidate native create | `POST https://api.proxyapi.ru/v1beta/models/veo-3.1-lite-generate-preview:predictLongRunning`, POST не выполнялся |
| Фактически используемый native endpoint / SDK | Не подключены |
| Реальный create / число платных create | Нет / 0 |
| primary реально передан / referenceAssetId | Live submit отсутствует; reference не отправлен |
| providerJobId / финальный status | Job не создан |
| MP4 / MediaAsset VIDEO ID | Не получен / не создан |
| Live PROCESSING reload / playback / Range 206 | Не проверены |
| Live Character gallery / global Media | Нового live видео нет |
| Duplicate isolation | Проверяется существующими offline integration/E2E |

## Проверки

| Проверка | Результат |
| --- | --- |
| lint / typecheck / build | PASS |
| Auth integration | 15/15 PASS |
| Character integration | 12/12 PASS |
| Memory integration | 10/10 PASS |
| Content integration | 9/9 PASS |
| Image/Media integration | 10/10 PASS |
| Video integration | 13/13 PASS |
| Полный integration suite | 69/69 PASS |
| Полный E2E | 21/21 PASS, 2.9 минуты |
| Production Auth smoke | PASS |
| Production Video recovery/playback/Range | 1/1 PASS, offline MP4 |
| Prisma validate | PASS |
| Prisma migrate status | Все 6 migrations применены |
| Prisma drift | No difference detected, exit 0 |
| db check | PASS, 17 моделей и constraints/indexes/tenant consistency |
| Client secrets scan | 34 файла, API key/AUTH_SECRET: 0 вхождений |
| Native SDK wire / live acceptance | Не выполнялись: native provider не подключён |

Логи имеют префикс `artifacts/veo-native-`. Успешные тесты подтверждают существующую offline architecture, а не native ProxyAPI generation. API key и изображение не передавались браузеру. Платных запросов и автоматических create retries нет.

Изменены/добавлены только `scripts/check-veo-native.mjs`, этот отчёт и ссылка на него в `docs/stage-6b-final-verification.md`. `.env`, dependencies, app provider/service, БД и существующие tests не изменены в этом запросе.

## Блокеры

1. Нужен актуальный официальный ProxyAPI контракт доступного native Veo create, operation polling и безопасного video download, либо подтверждение их passthrough на документированном base URL.
2. Нужна подтверждённая доступность `veo-3.1-lite-generate-preview` в этом native API. Доступность unified `google/veo-3.1-lite` не доказывает native availability.
3. После разрешения этих блокеров остаются SDK adapter/encoder, native wire tests и ровно один live smoke с полным acceptance.

Следующий этап не начат. После отчёта работа остановлена.
