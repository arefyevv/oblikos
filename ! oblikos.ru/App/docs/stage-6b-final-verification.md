# Этап 6B — повторная проверка 3 октября 2026

Последующая проверка native Google/Veo: [stage-6b-native-report.md](stage-6b-native-report.md).

**Статус: НЕ ГОТОВ.** Модель теперь настроена: `google/veo-3.1-lite`. Оставшийся блокер — точный официальный контракт передачи primary image в ProxyAPI. Платных video create в этой проверке: **0**. Архитектура приложения не изменена; следующий этап не начат.

## Проверка официального контракта

- [ProxyAPI Video API](https://proxyapi.ru/docs/video-generation): подтверждены JSON `POST https://api.proxyapi.ru/v1/videos`, асинхронный job, status/content endpoints и имена `frame_images` / `input_references`. Структура элементов, обязательные вложенные поля и формат передачи bytes не определены. Последняя редакция страницы: 3 сентября 2026.
- Официальный OpenAPI получен с HTTP 200; сохранён в `artifacts/video-openapi-20261003.json`. POST `/v1/videos` и `/openrouter/v1/videos` не содержат `requestBody`; схем reference нет.
- `GET /v1/videos/models`: HTTP 200; сохранён в `artifacts/video-models-20261003.json`. Выбранная модель поддерживает `first_frame` / `last_frame`, 4/6/8 секунд, 16:9 / 9:16, 720p / 1080p. Минимальные параметры будущего smoke: 4 секунды, 720p, без аудио — после подтверждения reference.
- [Карточка модели](https://proxyapi.ru/models/google/veo-3.1-lite) подтверждает capabilities, но пример содержит только model/prompt.
- Проверены официальные страницы единого API, родного формата и OpenRouter, а также поиск официальных примеров ProxyAPI с `frame_type`, `frame_images` + base64, `input_references` + `image_url`. Подтверждённого image-to-video примера ProxyAPI не найдено.
- [Cookbook OpenRouter](https://openrouter.ai/docs/cookbook/video-generation/image-to-video) описывает собственный API с публичным HTTPS image URL. Это не подтверждает формат bytes/data URL или контракт выбранного ProxyAPI endpoint; переносить его без подтверждения нельзя.

| Требуемая деталь | Подтверждение ProxyAPI |
| --- | --- |
| `frame_images` | Название поля есть; вложенная структура не определена |
| `input_references` | Название поля есть; вложенная структура не определена |
| Первый кадр | Capability `first_frame` есть; путь поля в request не определён |
| Изображение bytes | Формат передачи не определён |
| Base64 / data URL / публичный URL | Допустимость конкретного формата не подтверждена |
| Обязательные поля reference | Не определены |

По прямому ограничению Виктора «не угадывай reference payload» production `VerifiedReferenceEncoder` не реализован и не подключён. Нужен официальный пример/схема ProxyAPI для выбранного endpoint с первым кадром и допустимым форматом изображения. Публичный доступ к protected primary image не добавлялся.

## Изменение и границы проверки

Усилен существующий offline тест `tests/video.integration.test.ts`: configuration использует модель из `OPENAI_VIDEO_MODEL`; create с reference bytes и заданной моделью без encoder возвращает configuration error с **нулём вызовов fetch**. Платных вызовов нет.

Тест точной production JSON-структуры reference нельзя честно добавить до подтверждения контракта. Существующие integration проверяют primary bytes/snapshot, capabilities validation, idempotency, запрет повторного create и сохранение VIDEO. Они не доказывают реальный wire contract ProxyAPI.

## Live результат

| Поле | Результат |
| --- | --- |
| Модель | `google/veo-3.1-lite` |
| Create endpoint | `POST https://api.proxyapi.ru/v1/videos` |
| Reference реально передан ProxyAPI | Нет; create не выполнялся |
| HTTP/create status | Не применим: POST не отправлен |
| providerJobId | Не создан |
| Финальный статус live job | Job отсутствует |
| Live MP4 | Не получен |
| Новый live MediaAsset VIDEO | Не создан |
| Live referenceAssetId = primary на submit | Не проверено: submit не выполнялся; offline snapshot проверен |
| Повторный provider create | 0 запросов; автоматических повторов нет |
| Playback / reload / Range реального provider MP4 | Не проверены |

## Повторные проверки

| Проверка | Результат |
| --- | --- |
| `npm run lint` | PASS, 0 warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:video` | 13/13 PASS, включая усиленный create guard |
| `npm run test:media` | 10/10 PASS, включая Image wire contract |
| `npm run test:e2e` | 21/21 PASS, 3 минуты |
| `npm run test:video:production` | Auth smoke PASS; Video recovery/streaming E2E 1/1 PASS |
| Prisma validate | PASS |
| Prisma migrate status | Все 6 migrations применены |
| Prisma migrate diff | No difference detected, exit 0 |
| `npm run db:check` | 17 моделей; constraints/indexes/tenant consistency PASS |
| Client bundle secrets | 34 файла, 2 секрета проверены, 0 вхождений API key / AUTH_SECRET |
| Offline playback / reload / Range | PASS на валидном тестовом MP4 |
| Live create / real provider MP4 | Не выполнялись из-за неподтверждённого reference contract |

Production/E2E используют offline MP4 и fake provider status; их успешность не заменяет live smoke. Offline checks подтверждают snapshot `referenceAssetId`, idempotency и отсутствие двойного provider create; это не live evidence. Windows Next/SWC, локальная БД и Chromium запускались с разрешённым выходом из filesystem sandbox.

Логи: `artifacts/stage6b-final-{lint,typecheck,build,video,media,e2e,production}.log`, `artifacts/stage6b-final-prisma-{validate,status,drift}.log`, `artifacts/stage6b-final-db-check.log`, `artifacts/stage6b-final-client-secret-check.json`. Изменены только тест запрета create и отчёты. Media Core, StorageProvider, polling, idempotency, protected streaming и Workspace security сохранены.

После отчёта работа остановлена до подтверждения официального reference contract. Этап 6B считать готовым нельзя.
