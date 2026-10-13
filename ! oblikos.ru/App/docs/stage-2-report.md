# Этап 2 — Authentication & User Workspace

Дата: 2 октября 2026 года. Локальная реализация и проверки завершены.
Окончательная приёмка реальных OAuth-входов ожидает credentials Яндекс/VK.
Этап 3 не начат. Foundation, стек, связи Character → Workspace и дизайн-токены сохранены.

## 1. Что реализовано

- Регистрация email/password/confirmation, нормализация email, Zod validation.
- Password login, logout, encrypted cookies, серверная проверка и отзыв сессий.
- User UUID, Personal Workspace и WorkspaceMember OWNER в одной транзакции.
- Серверная защита Dashboard, Characters, вложенных профилей и Settings.
- Реальные профиль/имя/avatar, название Workspace, роль, выбор доступного Workspace.
- Реальные состояния способов входа, безопасные link/unlink, запрет последнего метода.
- Подтверждение email, восстановление и добавление пароля через одноразовые tokens.
- EmailProvider abstraction и локальный development outbox; production delivery отсутствует явно.
- Яндекс ID provider и современный VK ID provider, отключённые без нужных ENV.
- Общий PostgreSQL rate limiter, account-specific quotas, безопасные ошибки и callbacks.
- Integration, browser, production smoke tests и очистка истёкших auth-записей.

Телефон/SMS, wizard/CRUD персонажей, AI/LLM, media, память, платежи, invitations
и управление командой не реализовывались.

## 2. Созданные файлы

### Auth module

- `src/features/auth/config.ts` — ENV, доступность провайдеров, безопасные callbacks.
- `validation.ts` — email/password/confirmation/provider Zod schemas.
- `crypto.ts` — Argon2id, random tokens, SHA-256 digest, dummy password verification.
- `rate-limit.ts` — атомарные PostgreSQL buckets и HMAC identifiers.
- `email.ts` — EmailProvider и закрытый локальный outbox.
- `service.ts` — регистрацию, OAuth persistence, link/unlink, tokens и sessions.
- `providers.ts` — Яндекс/VK ID, profile validation, custom VK exchange.
- `options.ts` — Credentials/OAuth/Auth.js callbacks и события.
- `access.ts` — централизованные session/workspace/role/character helpers.
- `actions.ts` — server mutations с origin/session/validation/limiter checks.
- `messages.ts` — allowlist пользовательских auth ошибок.
- `auth-form.tsx` — login/register/forgot/reset/verify forms.
- `settings-forms.tsx` — профиль, Workspace, способы входа.
- `logout-button.tsx` — полноценный logout.

### Остальные файлы

- `src/types/next-auth.d.ts`.
- `src/app/api/auth/[...nextauth]/route.ts`.
- `src/app/(auth)/forgot-password/page.tsx`.
- `src/app/(auth)/reset-password/page.tsx`.
- `src/app/(auth)/verify-email/page.tsx`.
- `prisma/migrations/20261002010000_authentication/migration.sql`.
- `scripts/cleanup-auth.mjs`.
- `tests/auth.integration.test.ts`.
- `tests/e2e/auth.spec.ts`.
- `tests/production-smoke.mjs`.
- `playwright.config.ts`.
- `docs/auth-setup.md`, `docs/stage-2-report.md`.

Next.js автоматически создал корневые `AGENTS.md` и `CLAUDE.md` при запуске dev
server. Это инструкции установленной версии Next.js; пользовательское ТЗ не заменено.
Prisma Client регенерирован в `src/generated/prisma`, эта директория исключена из Git.
Screenshots сохранены в `artifacts`, development-письма также локальны и исключены из Git.

## 3. Изменённые файлы

- `package.json`, `package-lock.json`: next-auth 4.24.15, argon2 0.45.1;
  инструменты тестов tsx/@playwright/test; scripts проверок и cleanup.
- `prisma/schema.prisma`: добавочные auth модели и поля User.
- `.env.example`: только названия переменных и безопасные placeholders.
- Локальный `.env`: случайный AUTH_SECRET, canonical localhost origin,
  development email adapter и отключённое доверие proxy/локальный production HTTP.
  Существующие DB credentials сохранены; OAuth secrets не внесены.
- `next.config.ts`: security headers и отключение логирования запросов/аргументов.
- `src/db/client.ts`: уточнён комментарий о ленивом доступе при build.
- `src/app/globals.css`: формы и Settings используют действующие tokens.
- `src/components/layout/app-shell.tsx`: logout в шапке.
- `src/app/(auth)/layout.tsx`: dynamic auth pages.
- `src/app/(auth)/login/page.tsx`, `register/page.tsx`: рабочие формы.
- `src/app/(workspace)/layout.tsx`: серверная защита Shell.
- `dashboard/page.tsx`, `characters/page.tsx`, `characters/new/page.tsx`: page-level guards.
- `characters/[id]/layout.tsx`, `page.tsx`, `[section]/page.tsx`: проверка Character/membership.
- `settings/page.tsx`: реальные безопасные данные и формы.
- `scripts/check-database.mjs`: проверка 12 моделей, unique indexes и foreign keys.
- `README.md`, `docs/architecture.md`: актуальная архитектура и инструкции.

Git-репозитория в текущем workspace нет: commit/PR не создавались.

## 4. Prisma entities

User сохраняет UUID, nullable unique email/phone и прежние связи. Добавлены
`emailVerified`, `authVersion` и relations к auth моделям.

| Новая сущность     | Назначение / constraints                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Account            | userId/type/provider/providerAccountId; UNIQUE provider+providerAccountId и userId+provider |
| PasswordCredential | passwordHash, UNIQUE userId; отдельная расширяемая credential сущность                      |
| AuthSession        | session UUID, userId, absolute expiresAt; индексы userId/expiry                             |
| AuthToken          | SHA-256 tokenHash UNIQUE, userId, purpose, expiry; 30 минут                                 |
| AccountLinkIntent  | hash UNIQUE, userId, sessionId, provider, expiry; 10 минут                                  |
| AuthRateLimit      | HMAC key PRIMARY KEY, attempts, expiry; общий persistent limiter                            |

Enum `AuthTokenPurpose`: VERIFY_EMAIL, RESET_PASSWORD, ADD_PASSWORD.
User-owned auth records имеют foreign keys с CASCADE. Foundation tables,
Character/Appearance/Personality и их ограничения не удалены и не изменены.

## 5. Authentication architecture

По npm registry проверена актуальная stable `next-auth` **4.24.15**, поддерживающая
Next.js 16/React 19. Ветка v5 — beta. Проверены текущая официальная Auth.js
документация, v4 документация stable release и установленный source code.

Auth.js обслуживает Credentials, OAuth, CSRF, encrypted cookies, JWT и server session.
Auth service управляет persistence через Prisma. DB adapter не нужен при JWT
strategy: это позволяет создавать User/Account/Workspace атомарно и не сохранять
OAuth tokens. Все способы входа приводят к одному внутреннему User UUID.

Credentials: email trim/lowercase, 12–128 символов, confirmation на сервере.
Argon2id: 64 MiB, 3 прохода, parallelism 1, индивидуальная соль. Hash не попадает
в session или client; неизвестный аккаунт проходит dummy verification.
Неверный пароль, отсутствующий credential и throttling дают общий login error.

Регистрация с неподтверждённым email допускает password login. Статус подтверждения
показывается честно; перед привязкой OAuth такой пользователь подтверждает email,
чтобы исключить регистрацию на чужой адрес с последующей чужой OAuth identity.

## 6. Session architecture

Credentials в stable Auth.js требует JWT strategy. Используется штатный encrypted
JWT (JWE) с `sub` и `sid` плюс серверный registry AuthSession. Cookie HttpOnly,
SameSite=Lax, Secure на HTTPS; для local HTTP это ожидаемо false.

Каждый `currentSession` сверяет sid/sub, пользователя и expiry с БД. TTL абсолютный,
7 дней: cookie renewal не продлевает DB TTL. Данные session.update с клиента
не могут менять User/sid. Login выдаёт новый случайный session UUID.

Logout удаляет запись текущей сессии и очищает cookies. Сохранённая копия старого
cookie после logout не позволяет войти — проверено в отдельном browser context.
Если DB revoke не выполнен, handler не выдаёт успешный logout с очищением cookie.
Password reset и unlink удаляют все сессии и intents, увеличивают authVersion.
Sign-in из старого password check не создаёт сессию после изменения authVersion.

## 7. Personal Workspace bootstrap

Регистрация password: User + PasswordCredential + Workspace + OWNER membership
в Prisma Serializable transaction с retry P2034. Первый OAuth:
User + Account + Workspace + OWNER в той же транзакции.

Название — «Личное пространство», slug содержит случайный UUID. Повторный OAuth
lookup возвращает User по unique provider identity и не создаёт новый Workspace.
User может состоять в нескольких Workspace; Settings умеет выбрать существующее
доступное пространство. Создание команды и invitations отложены.

## 8. Authorization

`requireUser`, `requireWorkspaceMember`, `requireWorkspaceRole`, `currentWorkspace`
и `requireCharacterAccess` находятся в server-only DAL. Checks применены в layouts,
страницах и server actions. Доступ проверяется по User UUID из registry session.
Cookie с workspaceId — лишь предпочтение; membership всегда читается из БД.

Чужой/отсутствующий Workspace и Character возвращают одинаковый 404.
Изменение названия Workspace доступно OWNER/ADMIN. Имя профиля изменяется только
у текущего User; UI не может передать произвольный User UUID для такой mutation.
Current Next.js server DAL/pages/actions используются без middleware/proxy.

## 9. Яндекс ID

Настроен authorization code provider, scopes login:info/login:email/login:avatar,
state + PKCE, server-side userinfo с Authorization header, проверка client_id
и schema внешнего ответа. Пароль/email автоматически не связываются с OAuth.
Первый вход атомарно создаёт Workspace/OWNER; Settings выдаёт безопасный link intent.

Tokens используются только в ходе callback и не сохраняются. Реальный вход пока
не проверен — YANDEX_CLIENT_ID/YANDEX_CLIENT_SECRET отсутствуют.

## 10. VK ID

Использован современный VK ID, а не встроенный legacy VK OAuth provider.
Текущий протокол проверен по официальному VKCOM/vkid-web-sdk:
`https://id.vk.ru/authorize`, `oauth2/auth`, `oauth2/user_info`.
PKCE + callback state + state в token response, device_id из callback,
server-side exchange, schema profile validation. Scope только email.

В выбранном PKCE flow client secret не нужен; неиспользуемый VK_CLIENT_SECRET
не добавлен. id_token/refresh_token не сохраняются и не используются для
доверенного profile. Реальный вход требует VK_CLIENT_ID и настроенного приложения.
Доступ к страницам документации VK через web reader был недоступен;
использован официальный текущий SDK source, а не неофициальные статьи.

## 11. ENV variables

AUTH_SECRET, NEXTAUTH_URL, DATABASE_URL, YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET,
VK_CLIENT_ID, EMAIL_PROVIDER, AUTH_TRUST_PROXY, AUTH_LOCAL_HTTP;
прежние POSTGRES_USER/PASSWORD/DB/PORT для Compose сохранены.
Подробности и безопасные значения — `.env.example` и README.
AUTH_SECRET создан локально случайным образом без вывода значения.

## 12. Что Виктор должен сделать вручную

Полная пошаговая инструкция: [auth-setup.md](auth-setup.md).

Яндекс: открыть oauth.yandex.ru/client/new/id/, создать приложение **для авторизации
пользователей**, платформа **Веб-сервисы**, настроить email/имя/avatar и Redirect URI,
получить Client ID/secret, добавить их самостоятельно в `.env`, перезапустить server.

VK: открыть кабинет id.vk.ru/about/business/, создать приложение для веб-сайта,
настроить адрес сайта и Redirect URL, получить APP_ID, записать VK_CLIENT_ID в `.env`,
перезапустить. Доступность localhost в кабинете нужно подтвердить при настройке;
при его запрете потребуется разрешённый HTTPS-origin для тестового окружения.

Default callbacks:

- `http://localhost:3000/api/auth/callback/yandex`
- `http://localhost:3000/api/auth/callback/vk`

Текущий сервер просмотра работает на **3001**. Если подключаете OAuth к нему,
используйте **3001** в NEXTAUTH_URL и callbacks. Secrets в чат не отправлять.
После настройки нужно проверить live OAuth login/link/cancel/unlink обоих providers.

## 13. Выполненные проверки

**14 серверных integration tests: все прошли.** Регистрация/normalization/OWNER,
Argon2id, duplicate registration, неверный пароль, validation, OAuth bootstrap,
отказ linking по email, подтверждение email перед link, session-bound one-time link,
foreign identity, expired intents/tokens, last method guard, reset/add-password,
session.update spoofing, logout registry revoke, expired session, параллельный limiter,
safe redirects, production email rejection, mock VK protocol checks и concurrent unlink.

**3 browser E2E tests: все прошли.** Новый пользователь → Dashboard → reload →
Settings → logout → blocked Dashboard → old-cookie replay rejected → wrong password →
repeat login → email verification → password reset → new login. Проверены собственный
и чужой Character, подмена Workspace cookie, Origin/CSRF и unavailable provider.
Desktop/mobile login/register/screenshots; мобильные Settings без горизонтального overflow.

**Production smoke: прошёл.** Отдельный собранный server на loopback HTTP с явным
AUTH_LOCAL_HTTP opt-in: регистрация, OWNER, reload, logout, protected route,
repeat login, неподтверждённый email и disabled production email adapter.

Fixtures имеют случайные identifiers и удаляются после тестов; реальные данные
не удалялись. Traces выключены, чтобы не записывать credentials/cookies.
Screenshots визуально проверены: login/register и Settings сохраняют дизайн Foundation.

## 14. Typecheck

`npm run typecheck` — PASS. TypeScript strict, Next.js route types.

## 15. Lint

`npm run lint` — PASS, 0 errors и 0 warnings.
`npm audit --omit=dev` — 0 известных vulnerabilities на момент проверки.

## 16. Production build

`npm run build` — PASS. Prisma generate и Next.js Turbopack production compilation.
Auth/workspace страницы динамические, secrets не требуются для статического prerender.
Production smoke отдельно проверяет runtime после build.
Проверены 16 клиентских JS assets: значений настроенных AUTH_SECRET,
DATABASE_URL, DB password и OAuth secret в них нет.

## 17. Prisma / database / Docker

- `prisma generate` — PASS.
- `prisma validate` — PASS.
- `prisma migrate deploy` — применена добавочная authentication migration.
- `prisma migrate status` — 2 migrations, database up to date.
- `prisma migrate diff --from-config-datasource --to-schema ... --exit-code` — no difference.
- PostgreSQL 18.6 — доступен; чтение всех 12 models через Prisma Client — PASS.
- 5 auth unique indexes и 5 auth foreign keys проверены в системном каталоге PostgreSQL.
- Docker Compose service postgres — healthy; `compose config --quiet` — PASS.
- `auth:cleanup` удаляет только истёкшие записи; команда проверена.

## 18. Ограничения и TODO

1. Реальные Яндекс/VK OAuth flows не пройдены без ваших credentials. Это остаток
   проверки интеграций, а не готовый результат production-подключения.
2. Production email transport отсутствует. Verification/reset/add-password
   доступны локально; production adapter должен быть добавлен перед публичным запуском.
3. OAuth-аккаунту без email пока нельзя добавить email/password через профиль;
   можно подключить другой OAuth метод. Изменение email требует отдельного безопасного flow.
4. Нет production VPS/HTTPS/reverse-proxy теста. Secure cookies проверены конфигурацией;
   полный smoke выполнен по loopback HTTP с явным временным opt-in.
5. AUTH_TRUST_PROXY включать только при очищаемом X-Real-IP. Без proxy общий limiter
   ограничивает весь инстанс; для публичного трафика нужны выбранные квоты/proxy config.
6. Запуск регулярной очистки истёкших auth records остаётся задачей deployment.
   Development outbox — локальные секретные ссылки; использованные файлы удалять.
7. Телефон, SMS и Этап 3 не реализованы по ТЗ.

## Официальные источники

- [Stable NextAuth initialization](https://next-auth.js.org/configuration/initialization).
- [Session options / JWT](https://next-auth.js.org/configuration/options).
- [Credentials](https://authjs.dev/getting-started/providers/credentials).
- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication),
  также прочитана документация установленного Next.js в node_modules/next/dist/docs.
- [Яндекс: регистрация](https://yandex.ru/dev/id/doc/ru/register-auth),
  [code/PKCE](https://yandex.ru/dev/id/doc/ru/codes/code-url),
  [userinfo](https://yandex.ru/dev/id/doc/ru/user-information).
- [VK ID official SDK](https://github.com/VKCOM/vkid-web-sdk),
  [auth protocol](https://github.com/VKCOM/vkid-web-sdk/blob/master/src/auth/auth.ts),
  [current domains](https://github.com/VKCOM/vkid-web-sdk/blob/master/src/constants.ts).
