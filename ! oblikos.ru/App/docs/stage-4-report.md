# Этап 4: Memory / память персонажа

Дата: 2 октября 2026 года. **Этап 4 — ГОТОВ.**

Последующее UI/UX polishing и повторные проверки: [финальный аудит Memory](stage-4-final-audit.md).

## 1. Архитектура

Отдельный модуль `src/features/memory` повторяет паттерны Character Core:
Zod validation → authenticated Server Actions → server-only service →
scoped transactions → Prisma/PostgreSQL. Character Core не переработан.
Memory не хранится JSON-полем и не смешивается с Biography/Personality.

## 2–4. Prisma model, migration и поля

Создана `MemoryEntry`, связь `Character.memoryEntries` (1:N).

| Поле | Назначение |
| --- | --- |
| id | UUID, первичный ключ, UUID отправки при создании |
| characterId | Обязательная связь с Character, UUID |
| type | Enum: FACT, PREFERENCE, EVENT, RELATIONSHIP, GOAL, RULE, OTHER |
| content | Обязательный trimmed текст, максимум 2000 символов |
| importance | Целое 1–5, по умолчанию 3 |
| isPinned | Boolean, по умолчанию false |
| createdAt | Timestamp с часовым поясом |
| updatedAt | Timestamp с часовым поясом, обновляется при изменениях |

Workspace определяется через Character; дополнительный workspaceId не нужен
и не может противоречить владельцу персонажа. Memory удаляется физически,
soft delete отдельных записей не добавлен. Foreign key использует Restrict,
аналогично Appearance/Personality. Soft delete Character сохраняет записи,
но делает их недоступными для всех операций памяти.

Новая migration: `prisma/migrations/20261002020000_character_memory/migration.sql`.
Старые migrations не изменялись. Новая применена к локальной БД.
Prisma Client regenerated. Индексы:

- `[characterId, isPinned DESC, importance DESC, updatedAt DESC, id]` для упорядоченного списка/retrieval;
- `[characterId, type]` для фильтрации по типу.

В БД также CHECK для importance 1–5 и непустого содержания после btrim.
Zod запрещает любые whitespace-only строки, неверные enum, дробную важность,
невалидные UUID и дополнительные поля ownership.

## 5. Ownership

Публичные actions принимают только characterId, memoryEntryId и данные операции.
Identity/current Workspace приходят из серверной сессии и `currentWorkspace()`.
В каждой транзакции повторно проверяются membership и Character с
`workspaceId = currentWorkspace`, `deletedAt = null`. Запись проверяется
одновременно по id, characterId и связи с доступным Character.
Тот же scope входит в запрос изменения/удаления.

Записи недоступны в другом выбранном Workspace даже при членстве пользователя
в обоих. Некорректный/чужой/отсутствующий ID не раскрывает существование записи.
Anonymous actions перенаправляют на login; Next navigation exceptions сохраняются
через `unstable_rethrow`. Изменения используют Serializable с повтором
serialization/deadlock conflicts по существующему паттерну.

## 6–9. Вкладка, CRUD, pinning, сортировка

Рабочая вкладка `/characters/[id]/memory` содержит заголовок, общий счётчик,
подзаголовок, кнопку добавления, empty state и лёгкий список с разделителями.
В строке: содержание, русский тип, важность, индикатор закрепления, дата,
меню «•••». Серверная фильтрация по всем 7 типам через select и URL query.
Пустой результат фильтра отличается от полностью пустой памяти.

Реализованы CREATE, READ (list/get), UPDATE, DELETE, PIN/UNPIN.
Формы создания/редактирования используют существующий native dialog;
редактирование сохраняет ту же запись. Удаление требует подтверждения,
по умолчанию фокус на «Отмена». Escape закрывает незанятый диалог,
Tab/Shift+Tab удерживаются внутри; после закрытия фокус возвращается к trigger.
Поля имеют label, required, aria-invalid и связанные сообщения ошибок.

На клиенте и сервере используется одинаковая Zod schema. Loading, disabled и
синхронный ref guard предотвращают повторную отправку. Ошибка оставляет форму,
введённые значения и существующие записи. UUID текущей формы предотвращает
дубликат при повторе после сохранения в БД и потери успешного ответа.
Успешные actions обновляют страницу через revalidatePath.

Pin/unpin устанавливает явный boolean. Сортировка выполняется в БД:
`isPinned DESC → importance DESC → updatedAt DESC → id ASC`.
Закреплённая запись с важностью 1 выше незакреплённой с важностью 5.
Последний ключ гарантирует стабильный порядок при одинаковых timestamps.

Обзор/Идентичность/Внешность/Личность не переделаны. Контент и История остаются
placeholder. Стиль, header/tabs layout и responsive паттерны сохранены.

## 10. Retrieval

`getCharacterMemory(characterId, limit = 30)` в `service.ts`:
authenticated structured retrieval, только текущий Workspace/Character,
та же сортировка, допустимый limit 1–50. Нет prompts, embeddings или AI-вызовов.
UI query ограничен 100 строками, отдельно получает total/filteredTotal.
При превышении показывает ограничение списка. Фильтр применяется в БД,
поэтому он не ограничивается уже загруженными первыми 100 строками.

Модель позволяет будущие миграции для source/confidence/metadata и retrieval;
эти поля, vector storage и automatic extraction сейчас не добавлены.

## 11. Проверка Workspace isolation

PostgreSQL integration tests проверяют все операции A→B, подмену memory ID
при правильном Character, подмену Character внутри одного Workspace,
двойное членство с выбранным Workspace, удалённого Character, revoked membership
и anonymous resolver. Также проверены реальные HTTP Server Actions в E2E:
подменены characterId/memoryEntryId в CREATE/UPDATE/PIN/DELETE requests,
чужие данные остались неизменными; anonymous replay отклонён.

## 12. Файлы

Добавлены:

- `src/features/memory/validation.ts`, `operations.ts`, `service.ts`, `actions.ts`, `memory-view.tsx`;
- `prisma/migrations/20261002020000_character_memory/migration.sql`;
- `tests/memory.integration.test.ts`;
- `docs/stage-4-report.md`.

Изменены:

- `prisma/schema.prisma`;
- `src/app/(workspace)/characters/[id]/[section]/page.tsx`;
- `src/app/globals.css` (только Memory styles);
- `package.json` (test:memory);
- `scripts/check-database.mjs` (13 моделей и Memory constraints/indexes);
- `tests/e2e/characters.spec.ts` (3 Memory scenarios, cleanup, актуальные placeholders);
- `tests/e2e/auth-ui.spec.ts` (проверка пропорций относительно контейнера с учётом существующего scrollbar gutter);
- `README.md`, `docs/architecture.md`.

`src/generated/prisma` regenerated, остаётся ignored как раньше.

## 13. Тесты

10 Memory integration tests: CRUD/defaults/trim/persistence, validation,
concurrent/idempotent create, Workspace/Character isolation, sorting/filtering,
duplicate без памяти, коллекция 120 записей с bounded queries, invalid IDs и
anonymous access, soft delete, revoked membership и DB constraints/indexes.

3 Memory E2E: полный CRUD с reload, pin/unpin/order/filter, duplicate без памяти,
confirm/cancel, validation/focus trap/Escape, stable tabs, responsive;
HTTP ownership tampering/selected workspace/anonymous replay;
network failures/loading/disabled/input preservation/lost-success retry.

Ширины: 1440/768/390/320 px. Горизонтального overflow нет; header/tabs не смещаются.
Скриншоты в `artifacts/memory-list-*.png`, `artifacts/memory-form-*.png` просмотрены.
Проверка выполнена в Chromium. Тестовые пользователи и Workspace удалены,
включая 2 fixtures прерванного прогона; исходные пользовательские данные сохранены.

## 14. Результаты

| Проверка | Результат |
| --- | --- |
| npm run lint | PASS, 0 warnings |
| npm run typecheck | PASS |
| npm run build | PASS, финальный код |
| npm run test:auth | PASS, 15/15 |
| npm run test:characters | PASS, 12/12 |
| npm run test:memory | PASS, 10/10 |
| npm run test:e2e | PASS, 17/17 |
| Memory E2E на production next start | PASS, 3/3 |
| npm run test:production | PASS |
| Prisma validate | PASS |
| Prisma migrate status | PASS, все 3 migration применены |
| Prisma migrate diff: database → schema, --exit-code | PASS, no difference |
| npm run db:check | PASS, 13 моделей; Memory FK/индексы/CHECK |

Production проверен на localhost:3002 с существующим AUTH_LOCAL_HTTP=true
только для локального процесса; `.env` не изменён. Повторные тестовые прогоны
исчерпали общий локальный registration limiter: сброшен только его точный ключ
в локальной БД, защитный код не изменён. После этого общий набор прошёл полностью.

## 15–16. Долги и следующий этап

Блокирующих проблем нет. Пагинация списка сверх 100 записей остаётся будущей
задачей по заданию; доступны фильтрация и уведомление о лимите.
Поиск, восстановление удалённого воспоминания и кроссбраузерная проверка
Firefox/Safari не реализованы. Идемпотентность создания действует в рамках
UUID текущей открытой формы; новая форма означает новое создание.

Технических препятствий для следующего этапа со стороны Memory не выявлено.
AI Chat, API AI-провайдеров, embeddings/pgvector/RAG, генерация и другие этапы
не добавлены. Следующий этап не начат.

**Этап 4 — ГОТОВ.**
