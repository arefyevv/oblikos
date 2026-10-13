# Oblik OS

Production-домен сервиса: **https://app.oblikos.ru**. Основной домен **https://oblikos.ru**
предназначен для лендинга. Перенос действующего сервиса описан в
[инструкции подключения поддомена](docs/app-subdomain.md). При обновлении существующей установки
следуйте [инструкции перехода](docs/brand-migration.md), чтобы сохранить БД и media.

MVP управления цифровыми персонажами: email/password Auth, Workspace, Character
Identity / Appearance / Personality, Memory, Text Content, AI text/image generation,
Visual Identity и приватная Media Library. Видео из основного портрета через
Kling 3.0 Pro / ProxyAPI подключено; [настройка и проверка](docs/kling-video-setup.md).
Голос добавлен в создание и профиль персонажа: выбор, темп, манера речи,
пробная озвучка через ProxyAPI. [Настройка и миграция](docs/voice-setup.md).

Видео по загруженному аудио и переносу исполнения: [возможности, настройка worker, миграция и ручная проверка качества](docs/video-performance.md). Животные пока не проверены; новые режимы требуют явной настройки цены и провайдера.

Next.js 16.3.8 / React 19 / TypeScript / Prisma 7.10 / PostgreSQL 18 /
Auth.js (next-auth 4.24.15) / Argon2id. Node.js 24.x, npm 11.

## Локальная настройка

```powershell
Copy-Item .env.example .env
npm ci
docker compose up -d --wait postgres
npm run db:deploy
npm run db:check
npm run dev
```

Заполните DATABASE_URL, Compose credentials, случайный AUTH_SECRET ≥32 символов,
NEXTAUTH_URL=http://localhost:3000. По умолчанию dev media хранится в data/media.
OPENAI_API_KEY/OPENAI_MODEL/OPENAI_IMAGE_MODEL и ранее проверенный OPENAI_BASE_URL
нужны только генерации. Secrets остаются server-only, .env/artifacts/data игнорируются.
Пароль в connection URL должен быть URL-encoded. Не смешивайте localhost/127.0.0.1.
Не меняйте password существующего PostgreSQL volume простым редактированием env.

## Production

[Обновление одной командой с Windows](docs/quick-deploy.md): `npm run deploy`.

[Пошаговый VPS deploy](docs/production-deployment.md) ·
[Checklist запуска](docs/production-checklist.md) ·
[Аудит этапа 7](docs/stage-7-audit.md) · [Отчёт](docs/stage-7-report.md).

Схема: Nginx HTTPS → Node/Next под systemd → PostgreSQL Compose + persistent media.
Production обязательны DATABASE_URL, AUTH_SECRET, canonical HTTPS NEXTAUTH_URL и
абсолютный MEDIA_STORAGE_DIR вне checkout/release. Каталог существует и writable
до старта. Production migration только `npm run db:deploy`, не migrate dev.
Build не требует DB или Video config. App startup валидирует critical env/storage.

```bash
npm ci
npm run db:validate
npm run db:deploy
npm run db:status
npm run db:check
npm run build
npm run start
```

Start слушает 127.0.0.1:3000; порт можно передать `-- --port 3002`.
Deploy examples: deploy/oblikos.service, deploy/nginx.conf.
Health: GET /api/health (app/DB/storage, no AI calls, no secrets, 200/503).
DB + media backup: scripts/backup-production.sh; инструкции restore в deploy guide.

AI safety в PostgreSQL: text 5/min и 50/24h, images 2/min и 10/24h на user и
workspace; общие потолки 200 text/40 images за 24h. Env настройки в .env.example.
`AI_GENERATION_ENABLED=false` отключает text/images;
`IMAGE_GENERATION_ENABLED=false` — images, `VIDEO_GENERATION_ENABLED=false` — video.
Видео: 1/min и 5/24h на user/workspace, общий потолок 20/24h. После env change нужен restart.
Idempotency receipts сохраняются после ошибок, paid retries отключены, n=1.

Для отправки подтверждений email и восстановления пароля задайте EMAIL_PROVIDER=smtp,
SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD и SMTP_FROM (см. .env.example).
REG.RU: mail.hosting.reg.ru, порт 465, SMTP_SECURE=true. Локально настройки в .env,
при systemd deploy — в /etc/oblikos/production.env; затем перезапустите приложение.
На сервере NEXTAUTH_URL=https://app.oblikos.ru, чтобы ссылки в письмах открывали рабочий сайт.
SMTP-пароль храните только в env. Проверка подключения без отправки: `npm run email:check`.
Development provider сохраняет письма в artifacts/dev-mail только в development.
При EMAIL_PROVIDER=disabled verification/password reset/add-password
недоступны, email/password registration/login работают. OAuth optional и выключен
без credentials. Video требует `OPENAI_VIDEO_MODEL=kwaivgi/kling-v3.0-pro` и
`OPENAI_BASE_URL=https://api.proxyapi.ru/v1`. Stored media доступны.

## Проверки

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:integration
npm run test:e2e
```

Integration: Auth, Characters, Memory, Content, Media/Image, Video/Google regression,
production readiness. Используйте отдельную локальную тестовую БД. Fixtures удаляют
только свои записи. E2E запускает isolated dev server на 3001, offline SDK transport
через explicit Node preload; ProxyAPI credits не расходуются. Auth traces выключены.
Chromium: установленный браузер или `npx playwright install chromium`;
PLAYWRIGHT_EXECUTABLE_PATH для своего binary. OAuth/live AI требуют отдельной проверки.

Production acceptance создаёт новую временную DB, применяет все migrations, проверяет
status/drift/constraints, запускает Next production, выполняет весь UI flow,
Workspace isolation/Range, restart/rebuild persistence и kill switch. Fake providers
только в test server process; app не содержит переключателя fake provider.
Тестовой роли DB нужен CREATE DATABASE. MEDIA root должен быть абсолютным writable
каталогом **вне проекта**, не tmp/temp/public, чтобы проверить аналог VPS storage.

```powershell
$env:PRODUCTION_TEST_MEDIA_ROOT = 'C:\OblikOS-test-media'
npm run test:production:e2e
```

Runner удаляет только свою UUID DB и свой temporary storage subdirectory.
Для production Video regression: тот же MEDIA root и `npm run test:video:production`.
`npm run test:production` — старый Auth smoke против уже запущенного test server
(TEST_BASE_URL, по умолчанию localhost:3002); не запускать на реальном production.
AUTH_LOCAL_HTTP=true разрешён только для loopback production smoke, не для VPS.

Исторические отчёты находятся в docs/stage-*.md. Новые функции после этапа 7 не начаты.
