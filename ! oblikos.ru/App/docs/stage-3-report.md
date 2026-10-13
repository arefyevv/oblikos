# Этап 3 — Character Core

Дата: 2 октября 2026 года.

## 1. Что реализовано

Рабочий модуль персонажей: создание, просмотр, отдельное редактирование трёх слоёв, список карточек, фильтры, дублирование, архивирование, восстановление и soft delete. Существующие App Shell, sidebar и account block сохранены. Кнопки создания на Dashboard подключены к wizard; после создания Dashboard предлагает открыть список вместо неверного empty state.

## 2. Страницы

| Маршрут | Поведение |
| --- | --- |
| `/characters` | Карточки, empty state, фильтры «Все / Активные / Архив» |
| `/characters/new` | Wizard из четырёх шагов |
| `/characters/[id]` | Обзор трёх слоёв и management menu |
| `/characters/[id]/identity` | Редактирование идентичности |
| `/characters/[id]/appearance` | Редактирование внешности |
| `/characters/[id]/personality` | Редактирование личности и traits |
| `/characters/[id]/settings` | Управление персонажем |
| `/characters/[id]/memory` | Недоступный раздел без данных |
| `/characters/[id]/content` | Недоступный раздел без данных |
| `/characters/[id]/history` | Недоступный раздел без данных |

## 3. Созданные файлы

- `src/features/characters/validation.ts` — Zod, варианты полей, типы payload и ошибок.
- `src/features/characters/operations.ts` — операции PostgreSQL, scope и транзакции.
- `src/features/characters/service.ts` — получение доверенного контекста из текущей сессии и Workspace.
- `src/features/characters/queries.ts` — чтение профиля, request-local cache и обработка not found.
- `src/features/characters/actions.ts` — публичные Server Actions, понятные ошибки и revalidation.
- `src/features/characters/character-form.tsx` — wizard и section editor.
- `src/features/characters/character-fields.tsx` — общие поля, custom options и chips.
- `src/features/characters/character-summary.tsx` — полная проверка данных перед созданием.
- `src/features/characters/character-actions.tsx` — меню, management actions и confirmation dialogs.
- `src/features/characters/character-view.tsx` — portrait placeholder, overview и DTO для форм.
- `src/app/(workspace)/characters/[id]/loading.tsx` — состояние загрузки содержимого профиля.
- `src/app/(workspace)/characters/error.tsx` — серверная ошибка с повторной загрузкой.
- `src/app/(workspace)/characters/not-found.tsx` — недоступный персонаж.
- `tests/characters.integration.test.ts` — проверки реального PostgreSQL.
- `tests/e2e/characters.spec.ts` — функциональные, security, responsive и network-error проверки.
- `docs/stage-3-report.md` — этот отчёт.

Также созданы проверочные скриншоты `artifacts/character-*.png` для desktop, tablet и mobile.

## 4. Изменённые файлы

- `src/app/(workspace)/characters/page.tsx`
- `src/app/(workspace)/characters/new/page.tsx`
- `src/app/(workspace)/characters/[id]/layout.tsx`
- `src/app/(workspace)/characters/[id]/page.tsx`
- `src/app/(workspace)/characters/[id]/[section]/page.tsx`
- `src/app/globals.css` — стили Character Core на существующих tokens.
- `src/app/(workspace)/dashboard/page.tsx` — фактическое наличие персонажей.
- `src/features/dashboard/dashboard.tsx` — рабочие CTA и корректный welcome state.
- `package.json` — команда `test:characters`.
- `README.md` — актуальный статус Этапа 3 и ссылка на отчёт.
- `docs/architecture.md` — описание текущего Character Core с сохранением исторического описания Foundation.
- `tests/e2e/auth.spec.ts` — ожидание существующего текста «Подтверждён» вместо устаревшего «Email подтверждён».

Prisma Client регенерирован из существующей schema. Сгенерированные файлы не редактировались вручную. В рабочей папке нет Git repository, поэтому список изменений сформирован по выполненным изменениям, а не через Git diff.

## 5. Prisma schema

Изменений нет: Foundation уже содержит все необходимые поля `Character`, `Appearance`, `Personality`, связи one-to-one, `CharacterStatus`, `deletedAt`, составную уникальность slug в Workspace и индексы. Identity хранится в Character, основные поля Appearance и Personality — в структурированных колонках, traits — в PostgreSQL array. Существующие JSONB attributes сохранены для вторичных параметров.

## 6. Миграции

Новые migrations не требуются и не создавались. `prisma migrate deploy` выполнен: pending migrations отсутствуют. Обе прежние migrations применены. `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` завершился с кодом 0: различий нет. Пользовательские записи и auth-модели сохранены.

## 7. Wizard

Идентичность → Внешность → Личность → Проверка. Состояние хранится локально в React; Redux/Zustand не добавлены. «Назад», «Продолжить» и «Изменить» сохраняют данные. Каждый шаг валидируется Zod; финальный payload повторно валидируется на сервере. Summary показывает все поля, включая дополнительные инструкции. Создание выполняется одной вложенной Prisma-записью внутри транзакции: Character, Appearance и Personality либо сохраняются вместе, либо не сохраняются. Новый статус — ACTIVE; после успеха открывается `/characters/[id]`.

## 8. Identity / Appearance / Personality

Identity: имя, пол, возрастной диапазон, ниша, биография. Ниша допускает свободный вариант без migration.

Appearance: цвет волос, причёска, одежда, визуальное описание, пожелания. Основные select-поля допускают свой вариант. Изображение представлено нейтральным placeholder.

Personality: стиль общения, тон, traits, описание и инструкции. Traits редактируются native checkbox chips. Все три редактора используют общие компоненты, pending state, field errors, success feedback и disabled submit при отсутствии изменений. Отсутствующие слои старых Foundation-записей создаются через upsert при сохранении.

## 9. Workspace authorization

Публичный service использует существующий `currentWorkspace()`, который проверяет текущую сессию и membership; клиент не передаёт userId или workspaceId. Каждая операция повторно проверяет `WorkspaceMember` внутри транзакции. Запросы ограничены текущим `workspaceId` и `deletedAt: null`. Проверен пользователь с membership в нескольких Workspace: доступ остаётся ограниченным выбранным пространством. UUID сам по себе не даёт доступа.

## 10. Server-side operations

`characters.list/get/create/update/duplicate/manage` находятся в server-only слое. Prisma queries не размещены в UI. Read operations используют Read Committed; изменения — Serializable с ограниченными повторными попытками и небольшой задержкой при P2034. Это разрешает конфликт одновременно создаваемых копий. Server Actions принимают только reference, операцию и редактируемые поля. Zod strict исключает подмену ownership и внутренних relation IDs. После изменений обновляются список и layout профиля. Prisma/SQL/stack traces не показываются пользователю.

## 11. Duplicate

Создаёт независимые Character, Appearance и Personality в том же Workspace, включая существующие вторичные attributes слоёв. Имя — «Имя — копия», затем «Имя — копия 2» и далее. Slug получает случайный UUID suffix и защищён существующим unique constraint. Копия ACTIVE; изменения её слоёв не меняют оригинал. Будущие Memory, Content, Media, Channels и Analytics не копируются и не реализованы.

## 12. Archive / restore

Archive устанавливает ARCHIVED; restore — ACTIVE. Архив доступен через фильтр и остаётся доступным для просмотра/редактирования. Архивирование подтверждается native dialog; восстановление доступно в меню и настройках.

## 13. Soft delete

Устанавливает только `deletedAt`. Физическое удаление пользовательских Character/Appearance/Personality не выполняется. Удалённый персонаж исключён из всех обычных запросов; его нельзя открыть, изменить, скопировать, архивировать или восстановить через обычные операции. Delete подтверждается dialog и возвращает к списку. Hard delete используется тестами только для удаления собственных временных fixtures.

## 14. Недоступные будущие разделы

Память, Контент и История оставлены как unavailable states. AI, Memory, Media pipelines, генерации, социальные интеграции, аналитика и billing не подключались. DRAFT сохранён в schema для совместимости; автосохранение черновиков не реализовано.

## 15. Проверенные сценарии

10 integration tests на реальном PostgreSQL: empty state данных, атомарные связи, validation/подмена ownership, редактирование слоёв, все операции для чужого пользователя, независимые concurrent copies, scope нескольких Workspace, archive/restore, soft delete, отзыв membership, unique/index/FK constraints. Некоторые тесты объединяют несколько сценариев.

3 Character E2E tests прошли и на dev, и на production build: все четыре шага, Назад/Продолжить/Изменить, custom niche, validation/focus, создание связей, refresh, три редактора, duplicate, archive/restore, soft delete, unavailable pages, меню и dialogs. Проверены viewport 1440, 768, 390 и 320 px, отсутствие горизонтального переполнения и возврат фокуса после Escape. Скриншоты просмотрены визуально. Отдельно проверены pending state, запрет повторной отправки и сохранение введённых данных после сетевой ошибки.

Security E2E отправляет семь реальных Server Actions с подменой characterId: три редактора, duplicate, archive, delete, restore. Все отклонены, запись владельца не изменена. Проверены подмена workspace cookie, защищённые маршруты и анонимные Server Actions для update и create. Чужой/удалённый профиль недоступен; проверка доступа к профилю выполняется до streaming, сохраняя HTTP 404.

15 существующих auth integration tests прошли. Production auth smoke также прошёл: registration, OWNER, refresh, logout, защита, повторный вход, fail-closed email. Для localhost production использован существующий process-only флаг `AUTH_LOCAL_HTTP=true`; `.env` и auth code не изменялись.

Итоговый общий dev-прогон `npm run test:e2e`: 11 из 11 tests успешно, включая прежние auth/UI сценарии и все три новых Character tests. Ошибок выполнения не осталось.

## 16. Typecheck

`npm run typecheck` — успешно, ошибок нет.

## 17. Lint

`npm run lint` — успешно, ошибок и warnings нет.

## 18. Production build

`npm run build` — успешно. Все Character routes динамические; build не требует получения пользовательских данных. Работа собранного приложения проверена отдельно через `next start`.

## 19. Prisma / database checks

Validate, generate, migrate deploy, migrate status и schema diff — успешно. PostgreSQL 18.6 доступен, чтение всех 12 моделей успешно. Проверены 5 Character/layer indexes и unique constraints, 3 foreign keys, а также прежние auth constraints. Тестовые fixtures удаляются по точным ID/уникальным email; существующие пользователи и рабочие пространства сохранены.

## 20. Ограничения

Блокирующих TODO для Character Core нет. Wizard не сохраняет незавершённую форму после перезагрузки/закрытия вкладки — это не draft-система. Нет восстановления soft-deleted персонажа через UI, pagination, поиска, загрузки портретов или AI. Реальные публичные OAuth/email настройки остаются отдельной задачей Этапа 2. Проверка браузера выполнена в Chromium; Safari/Firefox отдельно не проверялись.

Разработка следующих этапов не начата.
