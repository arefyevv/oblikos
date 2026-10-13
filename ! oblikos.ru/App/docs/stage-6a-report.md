# Этап 6A — Visual Identity и изображения персонажа

Дата: 2 октября 2026 года. **Этап 6A: ГОТОВ.** Этап 6B не начат.

Дополнение: после исправления OPENAI_IMAGE_MODEL одиночный live smoke получил HTTP 200. Validation, storage, MediaAsset, браузерный reload, primary и header прошли. Окончательная готовность Этапа 6A подтверждена: [stage-6a-live-smoke.md](stage-6a-live-smoke.md).

Реализация, автоматические проверки и live smoke завершены. В последнем явно разрешённом запуске выполнен ровно один реальный запрос с моделью `openai/gpt-image-1-mini` из OPENAI_IMAGE_MODEL, без повторов.

## 1. Visual Identity

Это выбранное пользователем изображение персонажа и независимая коллекция его MediaAsset. Текстовая Appearance сохранена. Во «Внешность» добавлены генерация и галерея. Изображения сохраняются автоматически; назначение основным остаётся явным действием пользователя в preview.

Поток: UI → Server Action → Media service → Visual Context Builder → Image Prompt Builder → ImageProvider → проверка файла → StorageProvider → транзакция MediaAsset + квитанция → UI.

## 2. Primary reference

`MediaAsset.isPrimaryReference`, PostgreSQL partial unique index по `characterId` для живых primary. CHECK разрешает primary только для IMAGE без `deletedAt`. Нельзя случайно создать два primary даже из разных процессов приложения. Смена выполняется в Serializable-транзакции с повтором serialization conflict; старый образ остаётся в галерее.

## 3. MediaAsset

Поля: id, workspaceId, characterId, type, mimeType, storageKey, width, height, fileSize, prompt, provider, model, referenceAssetId, referenceUsed, isPrimaryReference, createdAt, updatedAt, deletedAt. `referenceAssetId` — исторический ID использованного основного образа; не служит самостоятельным разрешением на чтение файла. Base64 не хранится в БД.

Типы IMAGE/VIDEO предусмотрены enum; генерация и чтение на этом этапе поддерживают только IMAGE. Asset появляется только после успешного сохранения файла. Состояния PENDING/READY/FAILED относятся к квитанции MediaGeneration.

Составные FK `(characterId, workspaceId)` связывают MediaAsset и MediaGeneration с Character того же Workspace. Индексы соответствуют живой медиатеке Workspace и галерее Character, отсортированным по дате/id. StorageKey уникален.

## 4. Миграция

Новая миграция `prisma/migrations/20261002180000_visual_identity/migration.sql`: два enum, MediaAsset, MediaGeneration, relations/indexes и дополнительные SQL constraints. Применена через migrate deploy к локальной PostgreSQL 18.6. Старые миграции не менялись. Drift отсутствует; наличие partial unique и CHECK отдельно проверяет `db:check`.

## 5. ImageProvider

Отдельный контракт внутри существующего `features/ai`, без изменения текстового AIProvider: `capabilities()` и `generateImage({prompt, aspectRatio, referenceImages?})`. Возвращает bytes, provider/model и факт использования референса.

Production: `OpenAICompatibleImageProvider`, существующий OpenAI SDK 7.27.0. Timeout 180 секунд, `maxRetries=0`, `n=1`, SDK logging выключен, server-only. UI получает только результат действия и понятную ошибку. Endpoint, model и key в клиентские props не передаются.

## 6. ProxyAPI

Используются существующие OPENAI_BASE_URL и серверный OPENAI_API_KEY. Генерация — `images.generate`, референс — `images.edit` с multipart-файлом. Контракт сверён с [официальной документацией ProxyAPI](https://proxyapi.ru/docs/image-generation).

Результат ProxyAPI декодируется из `data[0].b64_json`. Произвольные response URL не скачиваются: URL-only результат отклоняется, исключая SSRF в текущем адаптере. Reference support включается только серверной настройкой проверенной модели; при false используется текстовый prompt, с явным сообщением об отсутствии гарантии совпадения лица. Даже при input image точное совпадение не обещается.

## 7. Env

| Переменная | Назначение |
| --- | --- |
| OPENAI_API_KEY | Существующий серверный API key |
| OPENAI_BASE_URL | Существующий совместимый API URL |
| OPENAI_IMAGE_MODEL | Обязательная модель изображений, отдельно от OPENAI_MODEL |
| OPENAI_IMAGE_REFERENCE_SUPPORTED | true только при проверенной поддержке `/images/edits`; default false |
| OPENAI_IMAGE_SIZES | Поддерживаемые размеры модели через запятую; default 1024x1024,1024x1536,1536x1024 |
| MEDIA_STORAGE_DIR | Постоянная директория файлов; для VPS задайте абсолютный путь |

UI предлагает 1:1, 4:5, 16:9, 9:16; provider выбирает ближайшее соотношение из серверного списка. Недоступные размеры конкретной модели нужно исключить из OPENAI_IMAGE_SIZES. Без image model разделы Character/Memory/Content работают, форма изображения показывает configuration error и отключает submit.

## 8. Visual Context Builder

Identity: имя, пол, возраст. Appearance: цвет волос, причёска, одежда, визуальное описание и дополнительные инструкции. Пустые поля отбрасываются. Memory, Biography, Personality, DB metadata и Workspace не попадают в visual context. Ниша автоматически не навязывает сцену или реквизит.

## 9. Image prompt

`buildCharacterImagePrompt` отделяет CHARACTER VISUAL IDENTITY, SCENE / USER REQUEST и IMAGE REQUIREMENTS. Данные сериализуются в JSON. Запрос содержит формат (портрет/lifestyle/сцена), пожелания до 3000 символов и выбранное соотношение сторон. Без сцены используется нейтральный студийный портрет. Prompt строится на сервере, вне React. Референс фиксируется на момент пользовательского submit; следующий submit использует актуальный primary.

## 10. Сохранение generated image

Проверяются реальный signature, PNG/JPEG/WebP, размер до 20 MiB, размеры изображения и отсутствие анимации. Sharp закреплён прямой dependency 0.35.5; metadata и decode/stats выявляют повреждённые файлы, с лимитом 40 млн пикселей. Исходный файл сохраняется без перекодирования. Потом транзакция повторно проверяет membership, Character, архив/soft delete и существование выбранного референса.

При storage failure готовый asset не создаётся. При подтверждённой ошибке DB файл удаляется. При неопределённом результате commit файл не удаляется вслепую: сначала проверяется, появился ли asset. Если БД недоступна даже для этой проверки, возможный orphan оставляется для последующей сверки вместо риска удалить успешно сохранённый файл.

## 11. Физическое хранилище и deployment

Default development: `<project>/data/media`. Файл: `<workspace UUID>/<character UUID>/<random UUID>.png|jpg|webp`. Пользовательские filenames/prompts не используются. MEDIA_STORAGE_DIR переопределяет root. Доступ защищён проверкой ключей и запретом path traversal; ссылки внутри дерева не разыменовываются. Файлы создаются с exclusive `wx`, на Unix — modes 0700/0600.

Хранилище не помещается в public/.next/node_modules/tmp. Оно переживает restart и rebuild. **Для VPS deployments, заменяющих checkout, обязательно задайте независимый постоянный путь**, например `/var/lib/oblikos/media`, и права пользователю приложения. Текущий compose содержит только PostgreSQL, контейнера приложения нет. Если приложение будет контейнеризировано, смонтируйте volume в MEDIA_STORAGE_DIR; включайте файлы и DB metadata в согласованный backup. Тесты используют OS temp или artifacts/media-e2e.

## 12. Доступ к media

`GET /api/media/[id]`: проверка серверной сессии, текущего Workspace и membership, принадлежности asset/Character и отсутствия soft delete. Проверка повторяется после чтения файла. Анонимный запрос получает 401, чужой/удалённый/отсутствующий asset — 404. `Cache-Control: private, no-store`, корректный MIME, nosniff и same-origin resource policy. Next Image используется с unoptimized, чтобы защищённый файл запрашивался браузером с его сессией, без публичного optimizer cache.

## 13. Галерея Character

Во «Внешность», без новой вкладки. Responsive grid, фиксированная пропорция thumbnail и object-fit без искажения, даты и primary badge. До 48 записей на страницу с переходами. Preview показывает оригинал с object-fit contain и описание генерации. Loading: spinner, disabled controls, aria-busy, без вымышленных процентов.

## 14. Глобальная Медиатека

Sidebar активирован, `/media` показывает только живые изображения текущего Workspace и Character без soft delete. Карточки: preview, имя/ссылка персонажа, дата, primary badge. Пустое состояние имеет одну CTA: создать персонажа, создать изображение существующего активного персонажа или восстановить архивного. Пагинация по 48 assets.

## 15. Назначение и смена primary

Preview → «Использовать как основной образ». Server service проверяет, что переданный Character ID совпадает с владельцем asset. Предыдущий primary сбрасывается и новый назначается атомарно. Layout revalidation обновляет thumbnail в шапке всех вкладок. Размер wrapper сохранён, чтобы изображение не сдвигало header/tabs.

## 16. Delete

Preview → «Удалить» → подтверждение. Для primary явно сообщается о сбросе референса без автоматического выбора другого. Сначала Serializable-транзакция помечает asset удалённым и сбрасывает primary, затем удаляется файл. Повтор delete того же принадлежащего пользователю tombstone позволяет завершить удаление файла после I/O failure. Обычное чтение tombstone запрещено.

## 17. Idempotency

Клиентский ref блокирует повторный submit; один UUID сохраняется при потере сетевого ответа. Durable MediaGeneration с PK UUID захватывается до обращения к AI, а fingerprint связывает UUID с точными входными данными. Параллельный submit получает Busy; успешный replay возвращает тот же asset; изменённый payload отвергается. Квитанции FAILED не удаляются: один UUID никогда повторно не вызывает provider. После известной ошибки новый явный submit получает новый UUID. Удаление asset не снимает защиту квитанции.

## 18. Workspace isolation и жизненный цикл

Integration tests проверяют чужие asset/Character IDs для generate/list/get/read/primary/setPrimary/delete, подмену Workspace в payload, anonymous/non-member resolver и составные FK. E2E проверяет приватный file route анонимно и из другого аккаунта, глобальную медиатеку и недоступность файлов soft-deleted Character. Membership перепроверяется после AI и storage; удаление membership в ходе генерации запрещает сохранение.

Архив: существующие изображения читаются, новая генерация запрещена. Soft delete: изображения исчезают из UI и прямые операции отвергаются; сами файлы не уничтожаются автоматически вместе с Character.

## 19. Duplicate

Существующая explicit-copy логика Character оставлена: Appearance копируется, MediaAsset и primary отсутствуют у копии. Это проверено integration и E2E. Memory/Content regression tests остаются зелёными.

## 20. Automated tests

Новый FakeImageProvider и 10 Media integration tests: сохранение/чтение/удаление, primary/swap/concurrency/DB constraint, reference bytes/fallback, prompt/context, lifecycle/duplicate, tenant/anonymous, квитанции/replay/failure, storage/traversal/missing file/invalid MIME/corruption, post-provider revocation и cleanup после DB rollback. Отдельно mocked-fetch проверяет реальный SDK wire contract, multipart, nearest-size, конфигурацию, invalid response, rate limit/auth/model/server errors и отсутствие retries.

Новый `tests/e2e/media.spec.ts`: первый образ, потеря committed response и безопасный replay, primary/reload/header, второе фото с reference, swap, responsive галерея/preview, Escape/focus, delete cancel/confirm, global media, foreign/anonymous file access, duplicate, archived/deleted Character. Fake-fetch adapter загружается только через test NODE_OPTIONS; production app не имеет fake-provider switch.

## 21–22. Live ProxyAPI smoke

**Live image smoke выполнен:** ProxyAPI `/v1/images/generations`, `openai/gpt-image-1-mini` из OPENAI_IMAGE_MODEL, HTTP 200, b64_json, PNG 1024×1024 / 1 889 338 байт. Validation, storage, MediaAsset, браузерный reload, primary и header прошли. API key не обнаружен в 34 файлах client bundle. В последнем явно разрешённом запуске выполнен ровно один запрос: [полный live-отчёт](stage-6a-live-smoke.md).

## 23. Изменённые файлы

Добавлены:

- `prisma/migrations/20261002180000_visual_identity/migration.sql`
- `src/features/ai/image-types.ts`, `image-provider.ts`, `visual-context.ts`
- `src/features/media/validation.ts`, `image-file.ts`, `storage.ts`, `operations.ts`, `service.ts`, `actions.ts`, `generation-form.tsx`, `gallery.tsx`, `visual-identity.tsx`
- `src/app/api/media/[id]/route.ts`, `src/app/(workspace)/media/page.tsx`
- `tests/fake-image-provider.ts`, `tests/media.integration.test.ts`, `tests/e2e/media.spec.ts`
- `docs/stage-6a-report.md`

Обновлены:

- `prisma/schema.prisma`
- `src/app/(workspace)/characters/[id]/layout.tsx`, `[section]/page.tsx`
- `src/features/characters/character-form.tsx`
- `src/config/navigation.ts`, `src/app/globals.css`
- `package.json`, `package-lock.json`, `.env.example`, `.gitignore`
- `scripts/check-database.mjs`, `playwright.config.ts`, `tests/ai-fetch-hook.mjs`

Prisma Client regenerated в игнорируемой `src/generated`. Существующий `.env` не менялся. Character/Memory/Content services не переписывались. В workspace нет Git repository, поэтому список составлен по выполненным edits, а не git diff.

## 24. Результаты проверок

| Проверка | Результат |
| --- | --- |
| npm run lint | PASS, 0 warnings |
| npm run typecheck | PASS |
| npm run build | PASS, без предупреждения filesystem tracing |
| Auth integration | 15/15 PASS |
| Character integration | 12/12 PASS |
| Memory integration | 10/10 PASS |
| Content integration | 9/9 PASS |
| Media integration | 10/10 PASS |
| Все integration | 56/56 PASS |
| Полный development E2E | 20/20 PASS |
| Production Auth smoke | PASS |
| Production Media E2E с fake images | 1/1 PASS |
| Prisma validate | PASS |
| Prisma migrate status | Все 5 migrations применены |
| Prisma drift diff --exit-code | No difference detected, exit 0 |
| db:check | Все 17 models и дополнительные Media constraints проверены |
| Client bundle secret scan | 34 файла, 0 вхождений настоящих OPENAI_API_KEY/AUTH_SECRET |

Проверены 1440/768/390/320 px, формы, long prompts, галерея, preview, keyboard focus, Escape и отсутствие горизонтального overflow. Существующая проверка layout stability измерила max movement 0 px на всех ширинах. Скриншоты сохранены в artifacts/media-appearance-*.png, media-preview-*.png, media-library-320.png. Цветовые прямоугольники — намеренные fake fixtures, не реальные портреты.

В логах negative E2E встречается `destination stream closed early`: тест намеренно обрывает уже выполненный ответ; сценарии восстановления прошли. SWC/DB/Chromium проверки запускались вне ограниченного Windows sandbox, потому что внутри него блокировались canonicalize и доступ к локальным службам.

## 25. Оставшиеся технические долги

- Одиночная реальная генерация проверена. Reference generation и другие размеры остаются отдельными возможностями для будущей проверки; второй платный запрос в этом smoke не выполнялся.
- Настроить production MEDIA_STORAGE_DIR и backup на конкретном VPS; локальный тест не подтверждает фактическую схему deploy чужого сервера.
- При process crash возможны orphan files, незавершённый delete или квитанция PENDING. Автоматическое повторное платное обращение намеренно запрещено; для большой эксплуатации нужна административная сверка storage/DB и журнал восстановления. Текущий stage не добавляет scheduler/agents.
- Local storage рассчитан на один VPS или общий mounted volume; несколько независимых реплик должны использовать shared storage либо будущий S3-compatible provider.
- Upload reference опционален и не реализован: generated identity завершена без увеличения scope.

## 26. Готовность к будущему Video

MediaType, tenant relations, protected file access, storage abstraction и primary-reference selection пригодны для расширения. Video потребует отдельного provider contract/config, асинхронных job states/таймаутов и проверки иных файловых лимитов/форматов. Это работа следующего этапа, а не препятствие для завершения 6A. Реальная доступность video provider не проверялась.

**Этап 6A: ГОТОВ. Этап 6B / Video не начат.**
