# Этап 6B — Video Generation

Актуальный статус от 3 октября: [stage-6b-status.md](stage-6b-status.md). Инфраструктура готова; production image-to-video заблокирован внешним API contract ProxyAPI. Ниже сохранён исторический отчёт от 2 октября.

Дата: 2 октября 2026 года. **Этап 6B: НЕ ГОТОВ.**

Инфраструктура, сохранение jobs, private MP4 storage, streaming, галерея, recovery и offline-проверки реализованы. **Основной production-сценарий «Создать видео с primary image» пока отключён:** модель не выбрана и точная структура входного изображения в текущем ProxyAPI contract не подтверждена. Указание только OPENAI_VIDEO_MODEL не снимает второй блокер. Следующий этап не начат.

## 1. Аудит 6A и актуального ProxyAPI

Изучены Prisma, MediaAsset/MediaGeneration, LocalStorageProvider, protected route, ImageProvider, Visual Identity, primary image, обе галереи, env, dependencies, tests и deployment. MediaGeneration в 6A — синхронная image-квитанция PENDING/READY/FAILED без providerJobId. Media route читал весь файл, StorageProvider принимал только PNG/JPEG/WebP; DB CHECK тоже ограничивал все assets изображениями.

Эти ограничения расширены минимально. Character, Memory и Content services не переписаны. ImageProvider не используется для видео.

Актуальная [официальная документация](https://proxyapi.ru/docs/video-generation), редакция 3 сентября 2026 года, описывает единый JSON API:

- `POST /v1/videos` — создать асинхронное задание;
- `GET /v1/videos/{id}` — проверить состояние;
- `GET /v1/videos/{id}/content` — получить файл;
- `GET /v1/videos/models` — узнать доступные модели и capabilities;
- webhook/callback_url не поддерживается.

Старые страницы openai-video-sora и gemini-video-veo перенаправляют на эту документацию. Первоначальные данные поискового индекса о старом Sora contract **не используются как актуальные**.

Бесплатные live проверки: video model catalogue HTTP 200; `/proxyapi/balance` HTTP 403 — у ключа нет разрешения чтения баланса. OpenAPI доступен, но тело create-video описано без request schema. Проверки заведомо невалидных запросов завершились HTTP 400, без provider job. **Платных видео-генераций: 0.**

Подтверждена доступность `google/veo-3.1`: первый/последний кадр, длительности 4/6/8 с, 16:9 и 9:16, разрешения 720p/1080p/4K. Каталог: [Veo 3.1](https://proxyapi.ru/models/google/veo-3.1). Модель не назначена вместо пользователя. Каталог также содержит другие видеомодели; они автоматически не выбираются.

Документация называет `frame_images` и `input_references`, **но не определяет структуру их элементов, image/data URL/base64 и соответствие `first_frame` конкретному полю**. Официальный OpenAPI и проверенные публичные примеры этого не уточнили. Предположительный payload не отправлялся в платную генерацию.

## 2. VideoProvider

Отдельный контракт: `configuration`, async `capabilities`, `createVideo`, `getVideoStatus`, `downloadVideo`. Production-адаптер `ProxyAPIVideoProvider` реализует фиксированные endpoints, JSON transport, safe errors и ограниченное скачивание. **Создание с референсом требует VerifiedReferenceEncoder; production composition его пока не передаёт**, поэтому capabilities/create fail closed до платного POST.

Это явная незавершённость интеграции, а не рабочий production image-to-video. После получения точного примера reference payload нужен небольшой проверенный encoder, его подключение в video-service и wire-contract tests. `FakeVideoProvider` уже проверяет весь независимый service workflow.

## 3. Env и capabilities

Добавлен OPENAI_VIDEO_MODEL. Переиспользуются OPENAI_API_KEY, OPENAI_BASE_URL и MEDIA_STORAGE_DIR. `.env` не изменён; video model отсутствует. Адаптер ожидает HTTPS `/v1`, а не старый `/openai/v1`.

Модель, endpoint, API key и provider job ID не передаются в UI. Capabilities получаются на сервере, кешируются на минуту. MVP ограничен 720p, 4/6/8 с и 16:9/9:16, с пересечением возможностей выбранной модели. Не предлагаются 1:1, высокие разрешения и неподтверждённые настройки. При подключении encoder нужно дополнительно подтвердить сочетания параметров именно выбранной модели.

## 4–6. Jobs, состояния, polling и recovery

Используется существующая MediaGeneration. Добавлены type, provider, model, providerJobId, referenceAssetId, prompt, scene, duration, aspectRatio, errorCode, nextPollAt и persistent poll lease. Статусы PENDING → PROCESSING → READY/FAILED.

POST создаёт только job, с timeout 30 с; не ждёт окончания видео. Provider job ID фиксируется в БД. Browser обращается только к собственным Server Actions. Интервал polling 10 с; server guard и lease на 120 с предотвращают одновременно выполняющиеся проверки/скачивания из нескольких вкладок/процессов. Status timeout 15 с, download timeout 60 с. GET/download можно повторять; create автоматически не повторяется.

После reload Character и глобальная Медиатека читают задания из БД и возобновляют polling. Старый PENDING без job ID после 90 с переходит в FAILED/ambiguous; это не повод создавать новый платный запрос. Нет вымышленных процентов.

**При отсутствии посетителей готовое видео не импортируется автоматически:** внешний job продолжает работу, его статус восстанавливается при следующем открытии страницы. Redis, worker и scheduler не добавлены. Если provider успеет удалить результат до возврата пользователя, получить его повторно нельзя; автоматическая новая платная генерация запрещена.

## 7–9. Visual Identity и reference consistency

Service требует существующую primary IMAGE до создания job. Prompt builder находится на сервере: CHARACTER VISUAL IDENTITY, SCENE, MOTION, CAMERA, VIDEO REQUIREMENTS. Appearance — дополнительный текстовый контекст; Memory/Content не включаются.

Primary bytes читаются через StorageProvider. FakeVideoProvider подтверждает, что получает именно эти bytes и MIME. **Реальная передача этих bytes в ProxyAPI пока не подтверждена и заблокирована.**

referenceAssetId фиксируется в момент захвата durable receipt. Смена primary не меняет уже запущенное задание; новый submit берёт новый primary. Удаление IMAGE, используемой PENDING/PROCESSING video job, запрещено серверной транзакцией. После terminal state запрет снимается. Видео не может стать primary — проверки сервиса и существующий DB CHECK сохранены.

## 10–11. Storage, форматы и лимиты

Готовый файл скачивается server-side, проверяется и сохраняется в существующий MEDIA_STORAGE_DIR по ключу `<workspace>/<character>/<uuid>.mp4`. Только после этого атомарно создаётся MediaAsset VIDEO и receipt READY/mediaId.

MVP: `video/mp4`, H.264, максимум 100 MiB, длительность до 13 с с небольшим допуском для 12-секундного container, размер кадра до 1280×1280 пикселей по площади. Production UI ограничен 720p и 4/6/8 с. Проверяются MIME, Content-Length и фактический лимит потока; MP4 boxes ftyp/moov/mdat, timing, video track, sample description и размеры. HTML/JSON, усечённые boxes и неподдерживаемый codec отклоняются. Это проверка container/metadata, не полное декодирование каждого кадра.

Storage file и DB согласуются: после неуспешного сохранения asset не создаётся; orphan удаляется только после проверки, что storageKey не закоммичен. При неоднозначном commit и недоступной БД файл сохраняется для сверки, чтобы не удалить возможный готовый asset.

VPS storage architecture 6A сохранена: постоянный абсолютный MEDIA_STORAGE_DIR и согласованный backup БД/файлов. Никакие файлы не публикуются из public; compose по-прежнему содержит PostgreSQL.

## 12–13. Protected streaming и HTTP Range

`GET /api/media/[id]` проверяет session, Workspace membership, asset ownership и живой Character. После открытия файла доступ перепроверяется. Stream идёт из file handle; полный MP4 не читается в память для каждого просмотра. Стрим закрывает handle при окончании/отмене.

Full GET: 200, Content-Type/Length, Accept-Ranges: bytes. Поддерживаются один обычный диапазон, открытый конец и suffix: 206, Content-Range, точный Content-Length. Некорректные/множественные/выходящие за файл диапазоны: 416 и `bytes */size`. Анонимный доступ 401; чужой/удалённый asset 404. private/no-store, nosniff, same-origin сохранены. Image route regression прошла.

Download не использует произвольные polling_url/unsigned_urls: путь строится из сохранённого ID и настроенного server baseURL. Redirects запрещены; API key не пересылается сторонним hosts.

## 14–15. Character gallery и Медиатека

Во «Внешность» добавлены «Создать видео», сцена, действие, формат, длительность и persisted job cards. Без primary показана CTA «Создать образ». При неподтверждённом provider/config форма отключена с понятным сообщением.

Обе галереи поддерживают Все/Изображения/Видео с серверным фильтром и пагинацией. Video thumbnail имеет индикатор; preview использует HTML5 controls, playsInline, preload=metadata, без autoplay. Показываются персонаж, дата, длительность и prompt. После закрытия player останавливается; focus возвращается в trigger. Кнопки назначения primary для VIDEO нет.

## 16. Удаление

Переиспользована существующая Media deletion strategy: confirmation → ownership/Serializable transaction → soft delete → storage unlink. Повтор того же delete безопасно завершает unlink после I/O error. Удаление VIDEO не сбрасывает primary image. Soft delete Character скрывает media и запрещает file route, не уничтожая файлы автоматически.

## 17. Idempotency

Один UUID/fingerprint захватывается в MediaGeneration перед provider create. Concurrent submit/replay возвращает существующий receipt; изменённый payload с тем же UUID запрещён. Failed receipts не удаляются. Client ref + sessionStorage удерживают UUID после потери ответа и reload. Новый платный запрос — только явное пользовательское действие с новым UUID. Состояние/скачивание не создают новые provider jobs.

## 18. Workspace isolation и жизненный цикл

Integration проверяет чужой Character, чужой generation, forged Workspace/input, non-member, отзыв membership во время download, deleted Character во время download. Ни один из этих сценариев не сохраняет доступный чужой asset. File E2E проверяет анонимный и другой аутентифицированный Workspace с Range.

Archived Character: media читаются, существующий job может завершиться, новый create запрещён. Deleted Character: UI/status/file operations недоступны; уже сохранённые файлы физически остаются. Duplicate сохраняет прежнюю explicit-copy стратегию и не получает media, primary или jobs.

## 19. Migration

`20261002210000_video_generation`: enum PROCESSING, MediaAsset.duration, минимальные job columns и два query indexes. Image CHECK расширен на MP4 VIDEO с размером/длительностью; IMAGE сохраняет прежние MIME и 20 MiB, без duration. Prisma Client regenerated. Миграция применена к локальной БД.

## 20. Tests

Добавлены 13 Video integration tests, FakeVideoProvider, небольшой валидный WPT MP4 fixture, Video E2E и production-build verifier. Integration покрывает create/queued/processing/ready/failed, saved providerJobId, primary bytes, snapshots, idempotency/concurrency, isolation, lifecycle/duplicate, storage save/delete/error, malformed media, throttling/lease, stale receipt, post-download revocation и приоритет активных jobs над историей ошибок. Mocked fetch проверяет status/download paths, redirects, safe errors и отсутствие retry.

**Browser E2E начинается с заранее сохранённого offline job**, потому что production reference encoder пока отсутствует. Проверены reload/processing/recovery, реальный protected MP4 player, full/range/invalid requests, global filter, delete cancel/confirm/reload, FAILED, mobile overflow и header geometry. **Запуск из формы через настоящий production adapter и полный сценарий от submit пока не подтверждены.** FakeVideoProvider create покрыт integration, а не подменён выдуманным production request contract.

## 21–22. Live smoke и необходимые настройки

Live video smoke не выполнялся: OPENAI_VIDEO_MODEL отсутствует, reference payload не подтверждён. Требуется:

1. Подтвердить модель из каталога и задать OPENAI_VIDEO_MODEL; например `google/veo-3.1` только после явного выбора.
2. Получить точный официальный/проверенный JSON пример image-to-video с `frame_images`/`input_references`, подключить encoder и проверить wire contract/совместимые параметры.
3. Выполнить ровно один разрешённый реальный create с существующим primary, без автоматического платного повтора.

Balance HTTP 403 — отсутствие разрешения ключа, не доказательство нулевого баланса. Разрешение чтения баланса полезно для preflight, но его отсутствие само по себе не блокирует API генерации.

## 23. Изменённые файлы

Добавлены:

- `prisma/migrations/20261002210000_video_generation/migration.sql`
- `src/features/ai/video-types.ts`, `video-provider.ts`, `video-prompt.ts`
- `src/features/media/video-validation.ts`, `video-file.ts`, `video-operations.ts`, `video-service.ts`, `video-actions.ts`, `video-form.tsx`, `video-jobs.tsx`, `range.ts`
- `tests/fake-video-provider.ts`, `video.integration.test.ts`, `video-production-smoke.mjs`, `e2e/video.spec.ts`, `fixtures/video.mp4`, `fixtures/README.md`
- `docs/stage-6b-report.md`

Обновлены:

- `prisma/schema.prisma`, `package.json`, `.env.example`, `scripts/check-database.mjs`
- `src/features/media/storage.ts`, `operations.ts`, `validation.ts`, `actions.ts`, `gallery.tsx`, `visual-identity.tsx`
- `src/app/api/media/[id]/route.ts`, `src/app/(workspace)/media/page.tsx`, `src/app/(workspace)/characters/[id]/[section]/page.tsx`, `src/app/globals.css`
- `tests/ai-fetch-hook.mjs`

Evidence: `artifacts/video-api-audit.json`, `video-catalog.json`, `video-client-secret-check.json`, `video-production-server.log`, `e2e-stage6b.log`, `video-preview-*.png`, `video-failed-320.png`. В workspace нет Git repository; список основан на выполненных edits.

## 24. Результаты проверок

| Проверка | Результат |
| --- | --- |
| lint | PASS, 0 warnings |
| typecheck | PASS |
| production build | PASS, private media route включён |
| Auth integration | 15/15 PASS |
| Character integration | 12/12 PASS |
| Memory integration | 10/10 PASS |
| Content integration | 9/9 PASS |
| Image/Media integration | 10/10 PASS |
| Video integration | 13/13 PASS |
| Всего integration | 69/69 PASS |
| Существующие E2E | 20/20 PASS |
| Video E2E recovery/playback | 1/1 PASS после исправления измерения scroll position |
| Повторный полный E2E | 21/21 PASS, 2.9 минуты |
| Production Auth smoke | PASS |
| Production Video recovery/streaming E2E | 1/1 PASS |
| Prisma validate | PASS |
| migrate status | Все 6 migrations применены |
| schema drift | No difference detected, exit 0 |
| db check | 17 models, constraints и video reference tenant consistency PASS |
| Client secrets scan | 26 JS files, 0 вхождений текущих OPENAI_API_KEY/AUTH_SECRET |
| Live video create | Не выполнялся, 0 платных jobs |

Проверены 1440/768/390/320 px. Существующие header/tabs stability tests сохраняют 0 px. Video preview, keyboard/Escape/focus и отсутствие document horizontal overflow проверены. MP4 fixture визуально просмотрен: это тестовый видеосигнал, не сгенерированный персонаж. Windows SWC и localhost DB/browser checks запускались вне filesystem sandbox из-за canonicalize/access ограничения.

## 25. Технические долги

- Завершить подтверждённый production reference encoder и полный create E2E.
- Настроить выбранную реальную модель и выполнить одиночный live smoke.
- Для гарантированного импорта без посетителей позже понадобится отдельный worker/persistent execution и учёт retention provider; сейчас реализовано восстановление при возврате.
- Для большой эксплуатации нужны административная сверка orphan files/неоднозначных PENDING и повторное завершение storage unlink. Новый платный create не должен использоваться как recovery.
- Local storage рассчитан на один VPS/общий volume; для независимых replicas потребуется shared storage.
- MP4 validation не заменяет полное декодирование codec. Транскодер не добавлен; WebM/иные codecs в MVP не принимаются.

## 26. Будущие voice, lip sync, массовая генерация

Потребуются отдельные provider contracts, audio asset/voice consent/config, асинхронные pipelines с синхронизацией дорожек, а для массовых jobs — worker/queue, bounded concurrency, cost controls и recovery. Они в этом этапе не реализуются. Соцсети, публикации, talking avatar, billing и scheduler не добавлены.

**Финальный статус: Этап 6B — НЕ ГОТОВ.** Конкретные блокеры: production reference contract/encoder и отсутствие выбранной OPENAI_VIDEO_MODEL. Из-за них не проверены production create и одиночный live image-to-video. После отчёта работа над следующим этапом не начинается.
