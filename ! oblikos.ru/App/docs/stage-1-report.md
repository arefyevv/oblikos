# Отчёт: этап 1 Oblik OS

Дата: 2 октября 2026 года, Москва.

## 1. Создано

Next.js-приложение с TypeScript strict, Tailwind, локальным шрифтом Manrope,
дизайн-токенами и переиспользуемыми UI-компонентами. App Shell включает
sidebar, header, основную область и мобильный drawer.

Dashboard и список персонажей показывают честное пустое состояние.
Готовы маршруты создания и профиля персонажа с внутренней навигацией,
настроек, входа и регистрации. Будущие функции обозначены как недоступные.
CRUD, авторизация, AI и функции следующих этапов не реализованы.

## 2. Основные файлы и модули

| Путь | Содержание |
| --- | --- |
| src/app | App Router, layouts, страницы, CSS-токены, favicon |
| src/components/ui | Button, ButtonLink, Badge, Card, Icon, PageHeader, EmptyState, FeaturePreview |
| src/components/layout | AppShell, Sidebar, Brand |
| src/features/dashboard | Dashboard |
| src/features/characters | Внутренняя навигация профиля |
| src/config | Настройки приложения и allowlist навигации |
| src/db/client.ts | Ленивый server-only Prisma Client с PostgreSQL adapter |
| src/lib/validation/env.ts | Zod validation connection URL |
| scripts/check-database.mjs | Проверка реального соединения и чтения моделей через Prisma |
| prisma/schema.prisma | Шесть моделей и два enum |
| prisma/migrations/20261002000000_foundation | Начальная SQL-миграция |
| prisma.config.ts | Prisma 7 CLI config |
| docker-compose.yml | PostgreSQL, healthcheck, volume, loopback port |
| .env.example / .gitignore | Шаблон окружения и исключение локальных секретов |
| README.md / docs/architecture.md | Запуск, ограничения, принятые решения и будущие модули |

## 3. Prisma-схема

`User ↔ WorkspaceMember ↔ Workspace → Character`.
У Character отдельные Appearance и Personality один-к-одному.

- Все внутренние идентификаторы — UUID.
- Membership: OWNER, ADMIN, MEMBER; уникальная пара Workspace/User.
- Character: DRAFT, ACTIVE, ARCHIVED; deletedAt для soft delete.
- Slug уникален внутри Workspace и сохраняется после soft delete.
- Appearance и Personality содержат структурированные поля и secondary JSONB.
- Nullable уникальные email/phone; индексы под membership и список персонажей.
- Foreign keys с RESTRICT при физическом удалении.

В базе отсутствуют пользовательские и демонстрационные записи.
Проверочные записи создавались только в транзакции и полностью откатились.

## 4. Архитектурные решения

Один модульный монолит. UI-shell пока не обращается к БД.
Будущий поток: UI → handler → service → repository → PostgreSQL.
Сервисы и repositories будут создаваться с первыми рабочими сценариями.

Character принадлежит Workspace. Будущие операции требуют подтверждённой
сессии и проверки membership. Архитектура Account/Session, AIProvider,
Prompt Engine, Memory, Knowledge и Storage описана в architecture.md;
неиспользуемые SDK и production-заготовки не добавлены.

Native dialog обеспечивает мобильную навигацию без дополнительной UI-библиотеки.
Шрифт поставляется локально. Приложение запускается без AI API keys.

## 5–6. Проверки и результаты

| Проверка | Команда / способ | Результат |
| --- | --- | --- |
| Установка | npm ci | Успешно, включая postinstall generation |
| TypeScript | npm run typecheck | Успешно |
| Lint | npm run lint | Успешно, без предупреждений |
| Production build | npm run build | Успешно |
| Prisma schema | npm run db:validate | Валидна |
| Client generation | npm run db:generate | Успешно |
| Docker | docker version / docker compose version | Engine 29.8.1, Compose 5.5.1, Linux |
| Compose config | docker compose config --quiet | Успешно |
| PostgreSQL | docker compose up -d --wait / compose ps | PostgreSQL 18.6, healthy |
| Миграция | npm run db:deploy | 20261002000000_foundation применена |
| Статус миграций | npm run db:status | Database schema is up to date |
| Расхождение схемы | prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code | No difference detected |
| Prisma connection | npm run db:check | Чтение всех шести моделей успешно; все таблицы пустые |
| Целостность БД | Транзакционные проверки Prisma | UUID, nullable uniqueness, membership, slug, 1:1, FK, RESTRICT и soft delete прошли |
| Маршруты | Chromium / Playwright | 14 маршрутов — 200, три ошибочных адреса — 404 |
| Responsive | 1440, 1024, 768, 390, 320 px | Нет горизонтального overflow |
| Навигация | Chromium / Playwright | Drawer, keyboard Escape, возврат фокуса и переходы работают |
| Runtime | Chromium / Playwright | Нет ошибок браузера |
| Environment | Проверка malformed URLs и client assets | Некорректные URL отклоняются, секреты в frontend assets не попали |
| Dependencies | npm audit при установке | 0 vulnerabilities после точечных overrides |

Проверки UI и БД выполнены с временными scripts в игнорируемом `artifacts/`.
Playwright взят из bundled runtime Codex, не добавлен в зависимости продукта.
Скриншоты и JSON результатов также находятся в `artifacts/`.

## 7. Обнаруженные и исправленные проблемы

- Docker Desktop установлен в пользовательскую папку и не был виден в PATH
  старого процесса. Для запуска временно добавлен resources/bin в PATH.
  Исправлена ошибка поиска docker-credential-desktop; инструкция добавлена в README.
- У latest Prisma был prerelease: закреплена стабильная 7.10.0.
- TypeScript 7 и ESLint 10 конфликтовали с peer dependencies плагинов Next.js:
  выбраны совместимые TypeScript 6 и ESLint 9.
- Audit findings в deepmerge-ts/mysql2 устранены точечными overrides.
- Отформатированы исходники; для Prisma использован собственный formatter.
- Исправлен пробел в заголовке при скрытии desktop line break на мобильном.
- Validation некорректного DATABASE_URL не выбрасывает ошибку из URL constructor;
  отклоняются URL без hostname и имени базы.

## 8. Ручная настройка

На текущем компьютере PostgreSQL настроен; `.env` создан со случайным паролем.
Секреты не выводились в отчёт и не включены в `.env.example`.
На другом компьютере нужны Node 24, Docker и локальный `.env` по README.
Никакие API keys, OAuth credentials или S3 credentials для этапа 1 не нужны.

## 9. Технический долг

- Обновить ESLint вместе с Next.js plugins после совместимости с ESLint 10.
- Удалить dependency overrides, когда Prisma включит исправления upstream.
- Автоматизацию пользовательских сценариев добавить вместе с реальными
  auth/CRUD; временная browser verification не является продуктовой test suite.

Отсутствующие функции следующих этапов — согласованная граница, не скрытая
имитация работоспособности.

## 10. Готовность к этапу 2

Фундамент готов к разработке авторизации и личного Workspace.
Схема применена и проверена на реальном PostgreSQL; блокеров БД нет.
Этап 2 не начат и требует отдельной команды Виктора.
