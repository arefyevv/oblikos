# Этап 7: аудит до изменений

Проверены package/scripts, Next 16.3.8 local docs, Prisma/schema/6 migrations,
Auth/services/actions/cookies, tenant resolvers, Characters/Memory/Content/Media,
AI SDK/ProxyAPI, video availability, storage/protected route, Compose, env sample,
existing integration/E2E, production smoke, metadata/navigation/empty states/docs.

## Блокеры

- Нет server-side user/workspace/global safety limits платных text/image calls.
- Нет общего AI kill switch.
- Text failure удаляет receipt: повтор UUID после timeout допускает второй платный call.
- Production storage допускает относительный путь и fallback внутри checkout.
- Нет startup validation critical env/storage и `/api/health`.
- Нет process manager/reverse proxy/backup/update/rollback runbook.

## Важные проблемы

- Login предлагает reset link при отключённом production EmailProvider.
- Text configuration message раскрывает названия server env.
- Нет общих error boundaries; нет структурированных duration/provider failure logs.
- Characters list/duplicate name search не ограничены; dashboard получает полные профили.
- Feature preview показывает внутренние этапы, history выглядит доступной вкладкой.
- README устарел: Oblik OS, этап 5, media описана как будущая.

## Допустимый долг

- Email delivery отсутствует: MVP email/password login без verification, email flows disabled.
- OAuth credentials optional; отсутствующие integrations disabled.
- Video production create заблокирован; abstraction, offline tests/status/download сохраняются.
- Нет Redis, Sentry, billing, team UI; для одного VPS не требуются.
- Один Node process + PostgreSQL Compose с loopback port/persistent volume достаточно.
- Memory/content bounded lists без полноценной pagination; media paginated по 48.

## Что уже правильно

Argon2id; DB-backed revocable sessions; encrypted minimal JWT; CSRF/Auth.js;
same-origin server actions; guarded callback; secure cookies based on canonical origin;
transactional membership recheck; composite tenant FKs; deletedAt filters;
bounded prompts/memory; SDK maxRetries=0; images n=1; media private/no-store;
safe UUID storage keys, MIME inspection, Range handling, symlink checks;
video create disabled без конфигурации; dev fixtures не входят в application runtime.

Локальный PostgreSQL работает в Docker. VPS/domain/SSH не предоставлены.
Git metadata в workspace отсутствует; изменения учитываются файловым manifest.
