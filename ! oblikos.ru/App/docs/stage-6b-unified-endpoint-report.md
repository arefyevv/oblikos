# Этап 6B — unified native Google endpoint

Дата: 3 октября 2026, Москва. **Этап 6B закрыть нельзя: единственный новый live create вернул HTTP 404.** Следующий этап не начат.

## Исправление

`ProxyAPIGoogleVeoProvider` использует SDK base URL `https://api.proxyapi.ru` и `apiVersion: "v1beta"`. SDK добавляет версию самостоятельно. Итоговый create URL:

`https://api.proxyapi.ru/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning`

Основание: [миграция ProxyAPI](https://www.proxyapi.ru/docs/migration) и [конфигурация официального Google SDK](https://proxyapi.ru/docs/gemini-api).

Допустимый transport path перенесён с `/google/v1beta/` на `/v1beta/`; проверки origin, redirect, размера и MIME сохранены. Encoder imageBytes, VideoProvider architecture, Media Core, polling, storage, idempotency и security logic не изменены. `.env` не менялся. Тестовый fetch hook и пример конфигурации обновлены под новый endpoint.

## Проверки перед live create

- Lint, typecheck и production build: PASS.
- Video tests: 14/14 PASS.
- Production Auth smoke и offline video E2E: PASS, включая recovery/reload, MP4, protected playback, Range 206, Character gallery, global Media и tenant isolation.
- Mocked SDK wire-contract проверяет точный create URL, list/poll/download на `/v1beta/`, отсутствие `/google/` во всех исходящих native запросах, неизменный first-frame payload и отсутствие create retry при HTTP errors/timeout.
- Mapping проверен: `google/veo-3.1` → `veo-3.1-generate-preview`; `google/veo-3.1-fast` → `veo-3.1-fast-generate-preview`; `google/veo-3.1-lite` → `veo-3.1-lite-generate-preview`. Неизвестные ID блокируются.
- Live read-only `GET https://api.proxyapi.ru/v1beta/models`: HTTP 200. Выбранная Fast-модель найдена с `predictLongRunning`. Это подтверждение каталога, а не доступности create.

Sandbox первоначально блокировал локальную PostgreSQL, сеть и canonicalize пути Next.js. Проверки повторены с разрешённым доступом и успешно завершены. Платных запросов на этом шаге не было.

## Ровно одна новая live попытка

- Endpoint: `POST https://api.proxyapi.ru/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning`.
- Модель: `google/veo-3.1-fast`, native `veo-3.1-fast-generate-preview`.
- Текущий primary image: `9cf500d4-c571-4f4d-b632-29c2b9026677`, персонаж `5e729717-f784-4297-8433-64e18beb01e6`.
- First frame: image/png, 1 936 448 bytes; wire base64 проверен против bytes зафиксированного reference перед POST.
- Параметры: 4 секунды, 720p, 16:9, sampleCount 1.
- Ответ: **HTTP 404**, статус receipt **FAILED**, safe error code **missing**: «Задание или результат видео недоступны у провайдера».
- `providerJobId`: null. Повторного create/retry не было.

Новый durable marker `artifacts/veo-unified-live.json` создаётся с `wx` до попытки. Старый `artifacts/veo-sdk-live.json` сохранён. Transport блокирует второй POST, SDK attempts=1. После 404 дальнейших live запросов не выполнялось.

Live polling → READY → MP4 → validation → storage → MediaAsset VIDEO → protected playback → Range 206 → reload → Character gallery → global Media **не достигнуты**, поскольку create не вернул operation ID. Эти шаги подтверждены только offline E2E; успешным live flow это не считается.

## Артефакты

- `artifacts/veo-unified-preflight.json`, `artifacts/veo-unified-preflight.log`.
- `artifacts/veo-unified-lint.log`, `artifacts/veo-unified-typecheck.log`, `artifacts/veo-unified-build.log`.
- `artifacts/veo-unified-video.log`, `artifacts/veo-unified-production.log`.
- `artifacts/veo-unified-live.json`, `artifacts/veo-unified-live.log`.

Endpoint мигрирован корректно, но причина 404 у provider остаётся неустановленной. Для закрытия 6B требуется успешный отдельно разрешённый live flow после выяснения доступности native Veo create у ProxyAPI.
