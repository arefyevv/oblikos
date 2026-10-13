# Этап 5 — AI / текстовый контент персонажа

Дата: 2 октября 2026 года. Этап 6 не начат.

## 1. AI abstraction layer

`src/features/ai` отделяет контракт AIProvider, OpenAIProvider, Character Context Builder,
Prompt Engine и generation service. `src/features/content` содержит Content Core,
авторизованные операции, Zod validation, Server Actions и UI. Поток:

```text
UI → Server Action → Content service → generateCharacterText
   → Character/Memory services → buildCharacterContext → buildPrompt
   → AIProvider → повторная проверка доступа → Content + request receipt в транзакции
```

Provider внедряется в `createContentService`; UI не зависит от SDK или модели.
Изучены текущие Prisma schema, Auth/Workspace, Character/Appearance/Personality,
Memory services, Server Actions, env, зависимости и существующие тесты. Учтены
локальные Next.js 16.3.8 guides для use-server, mutations, forms и revalidation.
Новый проект не создавался; использовано предоставленное подробное ТЗ.

## 2. Provider

Официальный `openai` SDK **7.27.0**, серверный Responses API (`responses.create`).
Подход сверён с [официальной документацией](https://developers.openai.com/api/docs/libraries)
и README установленного SDK. `OPENAI_API_KEY` и `OPENAI_MODEL` читаются лениво при
генерации. Модель задаётся только через env, без модели в UI или бизнес-логике.
Timeout 60 секунд, maxRetries=0, max_output_tokens=4000, store=false, logLevel=off.
Повтор платного запроса после ошибки требует явного действия пользователя.

## 3. Prompt Engine

`buildPrompt` принимает структурированные CharacterContext и GenerationRequest.
Возвращает отдельные system, character и task; provider переводит их в роли
system/developer/user. Контекст и задача сериализованы как JSON data.
Приоритет: правила приложения → Personality → явные RULE → pinned/важная Memory
→ пользовательская задача → обычная Memory. Биография/память/задача не имеют права
переопределять системные инструкции. Никаких prompts в React-компонентах.
Это структурирование и инструкции модели, без заявления об абсолютной защите
от prompt injection и без сложного policy engine.

## 4. Character context

Identity из Character: name, gender, ageRange, niche, biography.
Personality: communicationStyle, tone, description, traits, additionalInstructions.
Пустые/null значения и DB metadata исключаются. Appearance не включается:
текущий текстовый MVP не запрашивает визуальный контекст. Никакого Workspace
целиком, истории Content или snapshots в Content.

## 5. Memory retrieval

Используется существующий `createMemoryService(...).retrieve`, тот же scoped
deterministic retrieval этапа 4, на котором построен `getCharacterMemory`.
Resolver фиксирует серверно определённый Workspace текущей операции.
Проверяются membership, Character и deletedAt; записи только этого Character.
Builder дополнительно отсеивает чужие characterId. Сохраняются type, isPinned,
importance и content; технические enum отсутствуют в контролах Content UI.

## 6. Ограничения контекста

Запрос к Memory: максимум **25 записей**. Сортировка pinned DESC → importance DESC
→ updatedAt DESC → id ASC. Builder сохраняет этот порядок и ограничивает суммарное
содержание Memory **16000 символами**, включая только целые записи. Большие
приоритетные записи уменьшают число включённых записей. Без semantic search,
embeddings, pgvector и RAG. Instruction: 1–5000 символов, body: 1–30000.

## 7. Prisma Content

Content: id, workspaceId, characterId, type, instruction, body, status=DRAFT,
provider, model, createdAt, updatedAt. Форматы: POST, SHORT_POST, CAPTION, IDEA,
DESCRIPTION, CUSTOM. Workspace и Character имеют relations к Content.
Составной FK `(characterId, workspaceId)` гарантирует tenant consistency в БД.
Два индекса соответствуют списку Workspace и списку Character с createdAt/id.
CHECK constraints запрещают пустые instruction/body и body больше 30000.
Hard delete Content соответствует существующему Memory pattern.

ContentGeneration — техническая квитанция запроса, а не Content/история версий:
UUID запроса, workspaceId, characterId, SHA-256 fingerprint, nullable contentId,
createdAt. PK захватывается до provider call; concurrent request не вызывает
provider повторно. Повтор после успешного ответа возвращает существующий Content.
После удаления квитанция сохраняется как tombstone и не воссоздаёт текст.
Неуспешная попытка удаляет pending квитанцию; пустой Content не создаётся.

## 8. Migration

Добавлена и применена **20261002140000_content_generation**. Старые migrations
не менялись. Созданы два enum, Content, ContentGeneration, composite unique
Character(id, workspaceId), query indexes, tenant FK и CHECK constraints.
Prisma Client регенерирован.

## 9. Content UI

Общий раздел `/content` активен в sidebar. `/characters/[id]/content` показывает
только тексты выбранного персонажа. Оба используют ContentList и Content Core.
Строки: формат, персонаж, preview, дата обновления, «Черновик», открыть/удалить.
Список ограничен 100 записями; при превышении выводится пояснение. Empty state
«Контента пока нет» содержит единственную CTA; при наличии контента CTA в заголовке.
Сохраняется спокойный Oblik OS UI. История, медиатека и аналитика остаются заглушками.

## 10. Генерация

`/content/new`: персонаж, шесть типов, задача. Из вкладки Character персонаж
предвыбран и повторного selector нет. Архивные и soft-deleted персонажи исключены.
Zod проверяет payload на frontend/backend, forged workspaceId отвергается.
Кнопка/поля disabled во время выполнения, синхронный ref guard исключает повторный
submit до rerender; UUID сохраняется при retry того же payload. После успешного
AI ответа Content сохраняется и открывается `/content/[id]`.

## 11. Manual edit

Редактор изменяет body существующего Content без AI и без нового Content.
Отображает наличие несохранённых правок. Save обновляет updatedAt; optimistic
проверка исходного updatedAt предотвращает потерю параллельной правки.
Сохранение и повторная загрузка проверены в E2E.

## 12. Regenerate

Явное подтверждение предупреждает о замене текущего текста и потере несохранённых
правок. Сервер использует тот же Character, исходные type/instruction и актуальные
Identity/Personality/Memory. Старый body остаётся до успешной генерации и транзакции.
Изменившийся за время API запроса Content не перезаписывается. Версии не создаются.
Отмена диалога и возврат фокуса проверены; retry защищён UUID квитанцией.

## 13. Ошибки

Configuration, timeout, rate limit, network, invalid/incomplete response и provider
error возвращают понятные сообщения без raw stack/API body. Redirect/notFound
исключения Next.js пробрасываются через unstable_rethrow. Provider metadata и body
валидируются до сохранения. Ошибка provider не создаёт черновик и не меняет
существующий текст. UI сохраняет введённые данные для повторной попытки.

## 14. API key

Ключ только в серверном environment; .env не изменялся и не выводился.
SDK/provider/service/operations импортируют server-only. SDK logs отключены;
application logging содержит только имя неожиданного Error. Ключ, полный prompt,
Character и Memory не логируются и не передаются в browser. Отсутствие AI env
не ломает build или Character/Memory; ошибка появляется только при генерации.

## 15. Workspace isolation

Каждая операция серверно получает session/currentWorkspace и повторно проверяет
membership в БД. Read/update/delete/regenerate ограничены workspaceId и живым
Character; generation проверяет его до и после provider. Serializable transactions
с retries разрешают write conflicts, не повторяя платный provider call.
Проверены A/B, forged Character/Content/workspace IDs, доступ при членстве в двух
Workspace с выбранным B, anonymous resolver, invalid IDs, удаление membership
во время API запроса, archived/deleted Character и conflicting tenant FK.
Duplicate Character не копирует Content — отдельная проверка count=0.

## 16. Prompt/context tests

Проверены Identity, Personality и typed Memory, pinned/importance/recency,
limit=25, character budget, исключение пустых полей и DB metadata, исключение
Character B из context A, отдельная пользовательская роль. Литературный стиль
модели не сравнивается fragile equality.

## 17. AI mock

Integration tests внедряют FakeAIProvider через AIProvider interface.
Отдельный SDK contract test заменяет fetch: проверяет роли, model, output limit,
store=false и mappings HTTP/timeout/network ошибок, без внешнего запроса.
E2E загружает `tests/ai-fetch-hook.mjs` только в тестовый сервер через NODE_OPTIONS.
Перехватывается точный OpenAI Responses endpoint; mock проверяет Identity/Memory
и возвращает новый текст. В application нет fake-provider переключателя.
Тестовый server имеет отдельные .next-e2e, port и временный AUTH_SECRET; обычный
dev server и .env не затрагиваются. Повторные E2E не делят auth limiter с ним.

## 18. Real provider smoke

**Real provider smoke test не выполнен: OPENAI_API_KEY отсутствует.**
OPENAI_MODEL также не задан локально. Для реальной генерации нужны оба значения
из .env.example и доступ API-проекта к выбранной модели. SDK integration проверена
на mock; доступность конкретного аккаунта, модели и реального API не проверена.
Automated tests не расходуют реальные credits.

## 19. Изменённые файлы

Новые:

- `src/features/ai/{types,provider,context,prompt,generation}.ts`.
- `src/features/content/{validation,operations,service,actions}.ts`.
- `src/features/content/{content-list,content-delete,generation-form,content-editor}.tsx`.
- `src/app/(workspace)/content/page.tsx`, `content/new/page.tsx`, `content/[id]/page.tsx`.
- `prisma/migrations/20261002140000_content_generation/migration.sql`.
- `tests/content.integration.test.ts`, `tests/e2e/content.spec.ts`, `tests/ai-fetch-hook.mjs`.
- `docs/stage-5-report.md`.

Изменены:

- `prisma/schema.prisma`, сгенерированный Prisma Client (generated directory игнорируется).
- `src/app/(workspace)/characters/[id]/[section]/page.tsx`.
- `src/config/navigation.ts`, `src/app/globals.css`.
- `src/features/auth/config.ts`, `tests/auth.integration.test.ts` — разрешён локальный Content redirect.
- `tests/e2e/characters.spec.ts` — Content empty state вместо прежней заглушки.
- `tests/e2e/auth-ui.spec.ts` — mock redirect учитывает фактический тестовый origin.
- `playwright.config.ts`, `next.config.ts`, `eslint.config.mjs`, `.gitignore` — изоляция E2E.
- `tsconfig.json` — Next.js автоматически добавил generated types тестовой папки .next-e2e.
- `scripts/check-database.mjs` — все 15 моделей и Content constraints.
- `package.json`, `package-lock.json` — SDK и test:content.
- `.env.example`, `README.md`, `docs/architecture.md` — настройки и актуальное состояние.

В workspace нет .git; перечень составлен по выполненным изменениям, без git diff.
В `artifacts/` сохранены generator 1440, editor 320 и list 320 screenshots.

## 20. Проверки

| Проверка | Результат |
| --- | --- |
| npm run lint | PASS, 0 warnings |
| npm run typecheck | PASS |
| npm run build | PASS, production routes включая Content |
| Auth integration | 15/15 PASS |
| Character integration | 12/12 PASS |
| Memory integration | 10/10 PASS |
| Content / Prompt / SDK integration | 9/9 PASS |
| Полный development E2E | 19/19 PASS |
| Production Auth smoke | PASS |
| Production Content E2E с SDK mock | PASS |
| prisma validate | PASS |
| prisma migrate status | 4 migrations, up to date |
| schema drift | No difference detected, exit 0 |
| db:check | 15 моделей; Content indexes/FK/CHECK PASS |
| Real OpenAI smoke | SKIPPED: API key отсутствует |

Итого 46 integration tests и 19 E2E. Первые прогоны выявили устаревшее ожидание
Content-заглушки и накопленный общий auth limiter при повторных запусках; тест
обновлён, тестовая авторизация изолирована. Итоговый полный прогон успешен.
На 1440/768/390/320 проверены list/generator/editor, длинный body и отсутствие
horizontal overflow. Existing Character/Memory E2E дополнительно проверяют
header/tabs/content origin при разных состояниях и overflow; движение 0 px.
Screenshots generator/list/editor просмотрены. Labels, initial focus, keyboard
dialogs, Cancel, disabled/loading, возвращение фокуса и подтверждение Delete
проверены в Content E2E. Регрессий Character/Memory не выявлено.

**Этап 5 — ГОТОВ.** Реальная генерация доступна после заполнения AI env;
работа реального API-аккаунта не подтверждена без ключа.

## 21. Технические долги

- После аварийного завершения процесса pending квитанция остаётся; тот же UUID
  получает «запрос выполняется». Reload формы создаёт новый UUID. Автоматический
  retry неизвестного результата не выполняется, чтобы не дублировать платный вызов.
  Управляемое восстановление таких квитанций и retention потребуются при росте.
- Список ограничен 100; полноценная пагинация не входит в этот MVP.
- Нет полноценной истории версий и snapshots по прямому требованию этапа.
- До реального использования нужно заполнить AI env и выполнить один live smoke.
- Существующий production EmailProvider требует отдельной настройки перед публичным
  запуском (долг этапа 2, не расширялся в этапе 5).

## 22. Следующий этап

Со стороны Content/Memory блокирующих архитектурных препятствий не выявлено.
Реальный OpenAI API и выбранная модель остаются непроверенными без ключа.
Область этапа 5 не расширялась на изображения, media library, analytics,
публикации, массовую генерацию, чат, RAG, агентов, расписания или оплату.
После отчёта работа остановлена; этап 6 не начат.

## Дополнение: реальный ProxyAPI smoke — 2 октября 2026

Provider сохраняет исходную архитектуру и Responses API. Добавлена явная настройка
`baseURL` из `OPENAI_BASE_URL` с валидацией URL. При отсутствии используется
стандартное поведение SDK. API key/model по-прежнему из OPENAI_API_KEY/OPENAI_MODEL,
server-only; SDK logging отключён. .env включён в .gitignore, значения ключа не
выводились. README/.env.example дополнены необязательным OPENAI_BASE_URL.

Проверки после изменения: lint PASS, typecheck PASS, build PASS, Content integration
9/9 PASS. SDK mock проверяет custom endpoint, default fallback и invalid URL без
сетевого вызова. E2E fetch hook сбрасывает внешний baseURL, чтобы автоматические
тесты не могли случайно вызвать платный ProxyAPI.

Один реальный smoke выполнен через `scripts/smoke-ai.ts` → createContentService →
generateCharacterText → существующие Character/Memory services → context builder →
Prompt Engine → OpenAIProvider → Content в БД. Скрипт запускается только явно,
не входит в automated tests и разрешает ровно один provider fetch. Реальный
персонаж взят из открытой пользовательской сессии, а не из тестовых fixtures.

| Параметр | Проверенный результат |
| --- | --- |
| Endpoint | https://api.proxyapi.ru/v1/responses |
| Model из env | openai/gpt-5.4-mini |
| Provider вызовы | 1, retries=0 |
| HTTP | 200 |
| Character | hgffhfh, 5e729717-f784-4297-8433-64e18beb01e6 |
| Identity | name, gender, ageRange, niche |
| Personality | communicationStyle, traits |
| Memory | 0 записей; текущая память пуста, передан MEMORY=[] |
| Реальный ответ | 215 символов, непустой текст |
| Content | f267ece9-d96c-4987-bcd5-b3abbf1221ca, сохранён |
| Browser reload | Content открыт в текущем Workspace, текст сохранился |

Диагностика без ключа/prompt: `artifacts/ai-real-smoke.json`.
Screenshot после reload: `artifacts/proxyapi-content-smoke.png`.
Content оставлен пользователю, не удалён. `.env` не менялся.
Проверены 33 файла `.next/static`: значения API key, baseURL и model в клиентском
bundle отсутствуют.

Это дополнение заменяет прежний статус SKIPPED реального smoke: live integration
через ProxyAPI теперь подтверждена. Влияние непустой Memory на live ответ данным
запросом не проверялось, поскольку у текущего Character память пуста; retrieval,
включение Memory и regenerate с изменённой Memory подтверждены automated tests.
Ровно один платный запрос выполнен, повторной генерации не было.

**Этап 5 — ГОТОВ, включая реальную генерацию через ProxyAPI и reload Content.**
Этап 6 не начат.
