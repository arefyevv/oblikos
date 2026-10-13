# Oblik OS: один production VPS

Production-домен: `https://app.oblikos.ru`. Для существующего сервера сначала выполните
[переход на новое имя](brand-migration.md); команды ниже описывают новую установку.

Internet → Nginx HTTPS → Next.js на 127.0.0.1:3000 → PostgreSQL 18
(Compose, persistent named volume) + `/var/lib/oblikos/media`.
Приложение работает под systemd, контейнеризировать Next.js не требуется.
Ни Redis, ни Kubernetes не нужны. Используйте один app process для MVP.

## 1. Подготовка

Linux VPS, Node.js **24.x**, npm 11, Docker Engine + Compose v2, Nginx,
ACME/Certbot, домен и DNS. Начальная рекомендация: 2 vCPU / 4 GB RAM,
диск с запасом на PostgreSQL, media, build и dumps. Проверить `/usr/bin/node`:
если Node установлен иначе, исправить ExecStart в unit.

Создайте пользователя `oblikos` без sudo, каталоги `/opt/oblikos/releases`,
`/etc/oblikos`, `/var/lib/oblikos/media`, `/var/backups/oblikos`.
Media owner `oblikos:oblikos`, mode 700; env mode 640 root:oblikos;
backup root mode 700 root:root. Media не должна быть symlink.
Не копируйте Windows node_modules: Linux зависимости устанавливаются через npm ci.

## 2. Release и env

Clone/copy source в `/opt/oblikos/releases/<release>`, исключая `.env`, `.next*`,
node_modules, artifacts, data/media. В этом workspace Git metadata отсутствует:
copy release допустим. Сохраните исходный release и lockfile для rollback.
Ссылка `/opt/oblikos/current` указывает на выбранный release.

Создайте `/etc/oblikos/production.env` по `.env.example`. Обязательные:

| Переменная | Значение |
| --- | --- |
| NODE_ENV | production |
| DATABASE_URL | PostgreSQL URL с URL-encoded паролем, loopback port 5432 |
| AUTH_SECRET | случайный секрет ≥32 символов; не менять при каждом deploy |
| NEXTAUTH_URL | `https://app.oblikos.ru`, без paths/query |
| MEDIA_STORAGE_DIR | `/var/lib/oblikos/media`, абсолютный вне release |
| POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB | соответствуют DATABASE_URL |
| POSTGRES_VOLUME_NAME | новый сервер: `oblikos_postgres_data`; обновление: фактическое имя существующего тома |
| AUTH_TRUST_PROXY | true, только с данным Nginx и app на loopback |
| AUTH_LOCAL_HTTP | false (исключение только local production tests) |
| EMAIL_PROVIDER | smtp для отправки писем; disabled для отключения |
| SMTP_HOST / SMTP_PORT / SMTP_SECURE | mail.hosting.reg.ru / 465 / true |
| SMTP_USER / SMTP_PASSWORD | noreply@oblikos.ru / пароль почтового ящика |
| SMTP_FROM | `Oblik OS <noreply@oblikos.ru>` |

Для text/image feature: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`;
`OPENAI_BASE_URL` — ранее проверенный совместимый endpoint ProxyAPI аккаунта.
Не подменяйте рабочий endpoint без SDK smoke.
Base URL optional, без него SDK использует стандартный OpenAI.
`OPENAI_IMAGE_REFERENCE_SUPPORTED` включать только для модели с images/edits;
`OPENAI_IMAGE_SIZES` должны соответствовать модели. Отсутствие AI env не мешает
auth/data pages: генерация возвращает безопасную configuration error.
Video env optional и никогда не включает production create.
OAuth env optional; без credentials кнопки отключены.
При EMAIL_PROVIDER=smtp и заполненных SMTP-настройках работают verification,
reset и add-password. Храните настройки в /etc/oblikos/production.env;
после изменения перезапустите systemd service. `npm run email:check` проверяет
соединение и авторизацию без отправки письма (env должен быть загружен в процесс).
При disabled эти функции отключены, регистрация/login продолжают работать.

Kill switch: `AI_GENERATION_ENABLED=false` отключает text+image;
`IMAGE_GENERATION_ENABLED=false` только images. После env change restart.
Сохранённые данные остаются доступны.
Лимиты: text 5/min и 50/24h; image 2/min и 10/24h на пользователя **и workspace**.
Общий safety ceiling: text 200/24h, image 40/24h. Rolling окна начинаются с первого
запроса. Счётчики атомарны в PostgreSQL и сохраняются после restart; failed attempts
тоже расходуют лимит. Настройка `AI_TEXT_*`/`AI_IMAGE_*` в `.env.example`.
Replay готового request ID не вызывает provider и не расходует квоту. Failed UUID
остаётся tombstone; новая осознанная попытка получает новый UUID. maxRetries=0,
image n=1, text max_output_tokens=4000, context/prompt ограничены.

## 3. БД, зависимости, build

Команды deploy от пользователя oblikos. Загружайте trusted env в shell без вывода:

```bash
cd /opt/oblikos/current
set -a
source /etc/oblikos/production.env
set +a
npm ci
docker compose --env-file /etc/oblikos/production.env up -d --wait postgres
npm run db:validate
npm run db:deploy
npm run db:status
npm run db:check
npm run build
```

Docker compose управлять от оператора с Docker permission; не выдавать app user
доступ к Docker socket ради runtime. При таком разделении выполните compose команду
от root отдельно. Не использовать migrate dev, db push, seed в production.
PostgreSQL named volume не удалять (`down -v` запрещён). DB port только loopback.
`npm ci` запускает prisma generate; build тоже генерирует client.
Build не требует живой БД, optional Video env или fake providers.
Production config phase проверяет critical env и writable storage **до listen**;
instrumentation повторяет проверку при runtime initialization. В Next 16.3.8 hook
может загружаться лениво, поэтому проверки только внутри instrumentation недостаточно.
Missing optional AI не валит app.

Для Prisma drift используйте `prisma migrate diff --from-config-datasource
--to-schema prisma/schema.prisma --exit-code`: exit 0 = no drift, exit 2 = drift.
Prisma diff не сравнивает CHECK/partial indexes: `db:check` проверяет их отдельно.

## 4. systemd и HTTPS

Установите `deploy/oblikos.service` в `/etc/systemd/system/oblikos.service`.
Проверьте ownership release (app пишет `.next/cache`), Node path и env permissions.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oblikos
curl --fail http://127.0.0.1:3000/api/health
sudo journalctl -u oblikos -n 100 --no-pager
```

Подготовьте сертификат ACME для домена; затем примените `deploy/nginx.conf`, заменив
домен и TLS paths. Первый certbot запуск может использовать временный HTTP server
block. `nginx -t` перед reload. HTTPS обязателен. Приложение принимает только proxy
traffic, firewall открывает 80/443 и ограниченный SSH, не 3000/5432.
Nginx заменяет Host/forwarded proto/X-Real-IP, не доверяет входным значениям клиента.
Request body 1 MiB, timeout 240s для images; Range headers/206/416 проходят без
переделки, private media без proxy cache и без alias файлового каталога.
Secure/HttpOnly/SameSite cookies определяет canonical HTTPS NEXTAUTH_URL.
Не включать proxy caching application responses или query-string access logs.
Security headers Next + HSTS Nginx; CSP только frame/base/object restrictions.

`/api/health`: application, SELECT 1 в database, storage write probe; 200/503,
no-store, без secrets/AI calls. Настройте внешний uptime check раз в минуту.
Логи: journald, безопасные operation/code/duration/request UUID, без prompts/tokens.
Ежедневно запускайте `npm run auth:cleanup` с production env: удаляет только
истёкшие sessions/tokens/link intents и счётчики auth/AI, не активные дневные квоты.

## 5. Согласованный backup DB + media

Выполнять ежедневно и перед deploy/migration. Для небольшого MVP допустим короткий
maintenance stop. `scripts/backup-production.sh` запускается root через bash:

```bash
sudo bash /opt/oblikos/current/scripts/backup-production.sh
```

Скрипт останавливает только oblikos, делает `pg_dump -Fc` через DB container,
архивирует MEDIA_STORAGE_DIR, проверяет читаемость pg_restore/tar, пишет checksums
и COMPLETE, возобновляет app даже при ошибке. Dumps в `/var/backups/oblikos/<UTC>`.
Не считайте каталог без COMPLETE успешным backup. Настройте daily systemd timer
или cron оператора; хранить минимум 7 дневных + 4 недельных пар, регулярно копировать
на независимый защищённый сервер/диск. Это не автоматическое offsite решение.
Не печатать DATABASE_URL, не передавать пароль аргументом pg_dump, не публиковать dump.

Проверка backup: `sha256sum -c SHA256SUMS`, `pg_restore --list`, `tar -tzf` и
обязательный периодический restore в **отдельную временную БД и storage**.
Проверить db:check, registration/login, защищённое сохранённое изображение.

Restore (оператор подтверждает target, app остановлен): создайте **новую пустую БД**,
восстановите dump, media в новый private directory, затем поменяйте env:

```bash
# Restore target должен отличаться от рабочей БД. Не использовать --clean по умолчанию.
docker compose --env-file /etc/oblikos/production.env exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$RESTORE_DATABASE" --no-owner --no-acl \
  < /var/backups/oblikos/SELECTED/database.dump
tar -C "$RESTORE_MEDIA_DIRECTORY" -xzf /var/backups/oblikos/SELECTED/media.tar.gz
```

Создание RESTORE_DATABASE/RESTORE_MEDIA_DIRECTORY выполнить заранее; проверить
owner oblikos:oblikos и 700/600 permissions. Использовать DB и media **из одной пары**.
Рабочую БД/старую media сохранять до проверки. Backup содержит чувствительные данные.

## 6. Обновление и rollback

Backup → stop app → copy/pull новый release → npm ci → migrate deploy → build →
переключить current → restart → health → короткий E2E. Не изменять media path.
При долгом downtime можно собирать новый release до stop, но backup/migration и
переключение выполнять в maintenance window. Хранить предыдущий release.

При app failure: вернуть current на предыдущий release только если он совместим с
новой схемой; проверить health. При несовместимой migration не откатывать БД вслепую:
restore согласованной пары в новую БД/media с осознанной потерей последующих данных.
Этап 7 migration additive: failed boolean default false, не меняет прежние данные.

## 7. Acceptance перед доступом

`docs/production-checklist.md`; локальные automated tests только с offline hooks
на **отдельной тестовой БД**, не запускать fixture cleanup на production.
Проверить реальное HTTPS/cookies/reboot/storage/backup restore на VPS.
Первая группа пользователей ограниченная: общий ceiling защищает баланс, но ещё
нет billing/verified signup/anti-abuse platform. Lost password recovery отсутствует
в этом MVP; сообщите это участникам soft launch.
