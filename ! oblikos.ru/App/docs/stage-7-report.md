# Этап 7 — Production Readiness

Дата: 3 октября 2026. Статус: **ГОТОВ К DEPLOY**.
VPS/SSH/domain credentials не предоставлены; публичный deploy не выполнялся.
Soft launch возможен после VPS checklist. Новые продуктовые функции не начаты.

## 1. Найденные production blockers

Отсутствовали AI user/workspace/global limits и kill switch; text receipts удалялись
после failure, позволяя повторный paid call с тем же UUID; production media могла
оставаться внутри checkout; не было fail-fast env/storage, health, deployment и
backup runbook. Полный предварительный аудит: [stage-7-audit.md](stage-7-audit.md).
При проверках дополнительно выявлен Auth transaction conflict у Prisma pg adapter
на COMMIT и ленивый запуск instrumentation в Next 16.3.8.

## 2. Что исправлено

Все перечисленные блокеры исправлены точечно. Добавлены атомарные durable quotas,
kill switches, failure tombstones для text, private external storage validation,
pre-listen startup validation, health, safe structured logging, headers и error
boundaries. Auth retries теперь распознают SQLSTATE 40001/40P01 от adapter.

## 3. Что осталось

Критических найденных блокеров в проверенном MVP коде нет. Не выполнены реальные
Linux/VPS deploy, DNS/HTTPS, systemd reboot test, проверка Nginx и backup restore на
VPS. Это внешние acceptance шаги, не имитируются локальными тестами.
Email delivery и real OAuth остаются отключёнными/optional; Video create отключён.
Firefox/WebKit smoke не добавлялись; обязательный Chromium проверен.
Расширенный pentest, billing/anti-abuse platform, pagination beyond current bounded
lists и offsite backup automation остаются допустимым MVP долгом.

## 4. Production env

Обязательны DATABASE_URL, AUTH_SECRET ≥32, canonical HTTPS NEXTAUTH_URL и абсолютный
MEDIA_STORAGE_DIR вне приложения. Production server config проверяет их до listen;
storage существует, writable и без symlink ancestors. Проверка не выполняется в
build phase. Разделение required/feature-specific/optional в [.env.example](../.env.example).
AI key/models/base URL — только для генерации. Missing/invalid AI возвращает
безопасное сообщение, остальные разделы работают. Production API base URL только
HTTPS. Optional Video config не участвует в startup.

## 5. AI rate limits

PostgreSQL AuthRateLimit, HMAC keys, atomic UPSERT в одной transaction. Redis не нужен.
Text: **5/min, 50/24h**; image: **2/min, 10/24h** на user **и workspace**.
Общий потолок приложения: **200 text/24h, 40 images/24h**.
Rolling 60s/24h окна; failed attempts учитываются; rejected transaction не частично
списывает другие counters. Квоты действуют до provider call, сохраняются после restart.
Replay готового UUID не вызывает provider/квоту. Настройки AI_TEXT_*/AI_IMAGE_*:
positive integers, maxima 100/min, 500/day, 5000/global day; invalid → fail closed.
Конкурентное превышение, дневной и общий потолок подтверждены integration tests.

## 6. AI kill switch / cost safety

AI_GENERATION_ENABLED=false отключает text/images; IMAGE_GENERATION_ENABLED=false —
images. После изменения env нужен restart. Existing data/read/edit доступны.
SDK maxRetries=0; image n=1; text max_output_tokens=4000.
Server schemas ограничивают user inputs; Memory максимум 25 entries/16000 символов;
дополнительный prompt ceiling text 50000, image 30000.
Failed/ambiguous text receipts сохраняются; повтор UUID не повторяет paid call.
UI выдаёт новый UUID только после полученной terminal error и следующего submit;
при потере ответа UUID сохраняется для безопасного replay. Media receipts также durable.

## 7. PostgreSQL

PostgreSQL **18.6**, Compose persistent named volume, loopback 5432.
Prisma Client читает все 17 моделей. Проверены unique/FK/tenant composite constraints,
Memory checks/indexes, Content checks/indexes, media primary partial index и Video
job indexes. DB/schema drift отсутствует в текущей и fresh DB.

## 8. Migrations

7 migrations. Новая `20261003100000_production_readiness` добавляет только
ContentGeneration.failed BOOLEAN NOT NULL DEFAULT false; данные не удаляет.
Production flow `prisma migrate deploy`, затем status/check. Fresh пустая БД принимает
все migrations без ручных DDL. migrate dev/db push в production не применяются.
Prisma diff не покрывает CHECK/partial indexes; их отдельно подтверждает db:check.

## 9. Media storage

Production root обязателен, абсолютный, вне checkout/release/public/build/tmp.
На VPS рекомендуется `/var/lib/oblikos/media`, owner oblikos, 700 directories/600 files.
Runtime provider abstraction сохранён. UUID keys/tenant authorization/MIME inspection,
deletedAt filters, no-store protected GET и Range 206/416 сохранены.
Symlink ancestors проверяются, Linux final reads используют O_NOFOLLOW.
Storage tree должен оставаться под контролем application user/оператора; это не
песочница против конкурирующего процесса с теми же Unix permissions.

## 10. Backup DB

[backup-production.sh](../scripts/backup-production.sh): pg_dump -Fc через существующий
PostgreSQL container. Dumps в `/var/backups/oblikos/<UTC>` с umask 077.
Ежедневно и перед обновлением; pg_restore --list/checksums плюс регулярный restore drill.
Restore в новую пустую БД через pg_restore --no-owner --no-acl, без автоматического --clean.

## 11. Backup Media

Тот же скрипт останавливает только app, делает DB dump и media.tar.gz из одного
maintenance window, проверяет архивы, SHA256SUMS и COMPLETE, возобновляет app даже при
ошибке. DB/media восстанавливаются парой. Retention/offsite copy описаны в guide,
оператор должен реально включить ежедневный запуск и независимую копию.
Bash syntax проверен Git Bash (`bash -n`); реальный Linux systemd backup/restore
не запускался на этой Windows машине.

## 12. Auth

Email/password registration создаёт User + Workspace/OWNER атомарно; Argon2id
64 MiB/timeCost=3; encrypted JWT содержит только sub/sid; DB registry позволяет logout
и отзыв sessions. Login rate limited по email и IP (60/15min), register по IP/email.
CSRF Auth.js и same-origin actions, callback allowlist, HttpOnly/SameSite cookies,
Secure в HTTPS production, explicit loopback-only HTTP smoke исключение.
Workspace не принимается из публичных mutation payloads; membership проверяется
в services при каждом действии, в том числе после provider/file I/O.

## 13. EmailProvider

Выбран разрешённый вариант B: production EMAIL_PROVIDER=disabled. Отправка писем,
verification/reset/add-password flows недоступны. Login больше не предлагает
«Забыли пароль?» при отключённой доставке. Settings сообщает о недоступности.
MVP registration/login не требуют verification. Dev mail fixtures остаются локальными.

## 14. Video

Production create остаётся disabled, прямой Server Action также блокирован.
UI сообщает «Видео — скоро»; working generate CTA отсутствует. VideoProvider,
jobs/status/download/playback/Range и offline fixtures/tests сохранены.
ProxyAPI Video не исследовался, live Video calls не выполнялись.

## 15. Health

GET /api/health: application=ok, database SELECT 1, private storage write probe.
HTTP 200 при готовности, 503 при недоступных DB/storage; no-store, без env values,
paths, exception bodies или AI calls. Positive readiness проверена production runner.
Negative startup: отсутствующий AUTH_SECRET и media внутри checkout завершают старт
ошибкой до readiness. Обязательная проверка в production config phase, поскольку
instrumentation в этом Next может загружаться с первым request.

## 16. Security improvements

Cost ceilings/kill switches/durable failed receipts; login IP throttle;
adapter-aware Auth retry; strict storage root и symlink ancestry/O_NOFOLLOW;
HTTPS AI endpoint; CSP frame-ancestors/base-uri/object-src, Permissions-Policy,
существующие nosniff/no-referrer/frame DENY; Nginx HSTS template.
Unknown operation logs содержат только безопасные категории, UUID/duration;
instrumentation не сериализует request headers/query/error objects.
Env names удалены из пользовательской text configuration error.
Known configured secrets не найдены в 332 source/docs/artifact/client files;
`npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**.
Это целевой scan известных env values, не доказательство отсутствия всех возможных секретов.

## 17. Production UI/UX cleanup

Oblik OS metadata/title/favicon сохранены. Internal stage badge заменён на «Скоро»;
History disabled без dead link. Dashboard и пустой Characters имеют по одной CTA.
Media empty state не предлагает недоступное создание видео. Video static copy не
использует live ARIA status, поэтому не конфликтует с mutation feedback.
Root/general error boundaries соответствуют текущим styles, без редизайна.
Characters bounded по 200; dashboard использует existence query вместо профилей;
duplicate name lookup не загружает все имена. Content/Memory limits и media pagination
по 48 сохранены. Для больших character collections полноценная pagination — дальнейший долг.

## 18. Onboarding

Production fresh-account UI: Dashboard «Создать первого персонажа» → wizard из
Identity/Appearance/Personality → Memory dialog → Content task/generation → manual edit
→ Visual Identity image → primary → Media Library → logout/login.
Проверены Auth, Characters/detail/editors, Memory, Content/editor, Appearance/image,
Media и Settings на **1440 / 768 / 390 / 320**, без horizontal overflow.
Full E2E также проверяет стабильность header/tabs/content и feedback geometry.

## 19. Workspace isolation

Integration проверяет A/B read/update/delete/generate, forged fields/IDs, чужое membership,
anonymous и revoked membership для Character/Memory/Content/Media.
Browser E2E проверяет прямые URLs, server-action tampering, forged workspace cookie,
anonymous/foreign protected media. Production journey повторяет A/B direct URLs,
cookie tampering, archived/deleted Character и revoked membership.

## 20. Persistence

В production server создан Character/Appearance/Personality, Memory, Content (manual edit),
image/primary Media. После logout/login и отдельного restart session/data/file доступны.
После реального npm run build + restart byte-for-byte изображение совпадает;
storage лежал за пределами checkout в разрешённом локальном persistent analogue.
Проверка VPS reboot/системных permissions ещё требуется на Linux.

## 21. Fresh database deploy

Runner сам создаёт UUID PostgreSQL database `oblikos_stage7_*`, применяет migrations,
status/diff/db:check, проходит production UI. После завершения удаляет только свою DB
и свой UUID storage directory. Рабочая локальная БД/пользовательские media не удаляются.
Производственный тест не требует Video env и не расходует ProxyAPI credits.

## 22. Deployment artifacts

[production-deployment.md](production-deployment.md), [production-checklist.md](production-checklist.md),
[oblikos.service](../deploy/oblikos.service), [nginx.conf](../deploy/nginx.conf),
[backup-production.sh](../scripts/backup-production.sh), [.env.example](../.env.example).
Node/Next остаётся на loopback под systemd, PostgreSQL — в существующем Compose.
App crash/VPS restart recovery обеспечивается prepared unit Restart=always + enable;
Linux execution/HTTPS и nginx -t должны быть проверены оператором на VPS.

## 23. Что выполнить на VPS

Установить Node/Docker/Nginx; copy Linux release/npm ci; provision env/DB/media;
migrate deploy; build; install/enable systemd; TLS/domain/reverse proxy/firewall;
health/HTTPS cookies/Range/new-user smoke; reboot/rebuild persistence;
daily DB+media backup/offsite copy/restore drill; предыдущий release для rollback.
Открыть ограниченную первую группу только после checklist. Участникам сообщить,
что восстановление пароля пока отсутствует. Credentials/VPS в этой задаче не использовались.

## 24. Изменённые файлы

Конфигурация/документы:

- `.env.example`, `package.json`, `next.config.ts`, `README.md`
- `prisma/schema.prisma`, `prisma/migrations/20261003100000_production_readiness/migration.sql`
- `docs/stage-7-audit.md`, `docs/stage-7-report.md`
- `docs/production-deployment.md`, `docs/production-checklist.md`
- `deploy/oblikos.service`, `deploy/nginx.conf`
- `scripts/backup-production.sh`, `scripts/verify-production.mjs`, `scripts/check-secret-leaks.mjs`

Runtime:

- `src/instrumentation.ts`, `src/lib/validation/production.ts`
- `src/lib/server/environment.ts`, `src/lib/server/logging.ts`
- `src/app/api/health/route.ts`, `src/app/error.tsx`, `src/app/global-error.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/(workspace)/dashboard/page.tsx`, `characters/page.tsx`, `media/page.tsx`
- `src/features/auth/config.ts`, `options.ts`, `service.ts`, `auth-form.tsx`
- `src/features/ai/safety.ts`, `types.ts`, `provider.ts`, `image-provider.ts`
- `src/features/content/operations.ts`, `actions.ts`, `validation.ts`, `generation-form.tsx`, `content-editor.tsx`
- `src/features/media/storage.ts`, `operations.ts`, `actions.ts`, `video-availability.ts`, `video-form.tsx`
- `src/features/characters/operations.ts`, `character-navigation.tsx`
- `src/features/dashboard/dashboard.tsx`, `src/components/ui/feature-preview.tsx`

Tests:

- `tests/content.integration.test.ts`, `media.integration.test.ts`, `video.integration.test.ts`
- `tests/production-readiness.integration.test.ts`, `tests/production-journey.mjs`
- `tests/video-production-smoke.mjs`, `tests/e2e/characters.spec.ts`, `tests/e2e/video.spec.ts`

Prisma generated client/.next/artifacts обновлены проверками и игнорируются.
`.env` не изменялся, dependencies/lockfile не обновлялись. Git metadata отсутствует:
это file manifest, не Git diff/commit.

## 25. Quality gates

| Gate | Результат |
| --- | --- |
| npm run lint | PASS, zero warnings |
| npm run typecheck | PASS |
| npm run build | PASS, также без DB/Auth/AI/Video env |
| Auth | 15/15 integration |
| Characters | 12/12 integration |
| Memory | 10/10 integration |
| Content | 9/9 integration |
| Media/Image | 10/10 integration |
| Video + Google | 15/15 integration |
| Production readiness | 3/3 integration |
| Full integration | 74/74, zero skipped |
| Full Chromium E2E | 21/21, 3.3 минуты |
| Production Auth smoke | PASS |
| Production Video recovery E2E | 1/1 offline, create disabled |
| Production MVP E2E | PASS: fresh DB/full flow/isolation/restart/rebuild/kill switch |
| Negative startup | PASS: missing auth secret / checkout storage rejected |
| Prisma validate/status/drift/check | PASS текущая и fresh DB, 7 migrations |
| npm audit production | 0 vulnerabilities |
| Configured secrets scan | PASS |
| Backup shell syntax | PASS; Linux execution/restore pending VPS |

Full E2E проведён после UI fixes; поздняя консолидация startup/env отдельно
перепроверена integration, build и production journey. Последние gates прошли.
Ранее выявленные test locator/ARIA, Auth adapter conflict и lazy startup issues исправлены;
красные промежуточные прогоны не выдаются за успешные финальные gates.
Live text/image не повторялись; **всего платных calls на этапе 7: 0**.

## 26. Можно ли давать доступ первым пользователям

**Код готов к deploy.** После реального VPS checklist и HTTPS smoke можно открыть
ограниченный soft launch. Прямо сейчас статус **ГОТОВ К DEPLOY**, не «уже запущено»
и не «VPS проверен». Video/Email/OAuth без credentials запуск MVP не блокируют.
