# Этап 6B — официальный Google SDK и единственный live create

Дата: 3 октября 2026. **Этап 6B НЕ ГОТОВ: единственный native SDK POST получил HTTP 404 от ProxyAPI.** Повторного create не было. GET/OPTIONS больше не используются как доказательство доступности video endpoint.

## Реализация

Официальный `@google/genai` **2.27.0**, server-only `ProxyAPIGoogleVeoProvider`, подключён к существующему video-service. `GoogleGenAI` настроен с `baseUrl: "https://api.proxyapi.ru/google"`, `apiVersion: "v1beta"`, текущим ProxyAPI ключом в `x-goog-api-key` и `retryOptions: { attempts: 1 }`. SDK сериализует create, получает operation, опрашивает его и скачивает файл. Вызовы не используют generic reference JSON.

Модель из env — `google/veo-3.1-fast`. Явный централизованный mapping в provider: `google/veo-3.1-fast` → `veo-3.1-fast-generate-preview`; неизвестные catalogue IDs блокируются. Модель повторно подтверждена перед create через SDK `models.list` на native `/google/v1beta/models`, включая `predictLongRunning`. Код не подставляет другую модель и не изменяет `.env`.

Server-only `encodeGooglePrimaryImage` получает Buffer/MIME из существующего MediaAsset/StorageProvider. Проверяет размер/MIME и возвращает SDK Image:

```ts
{ imageBytes: reference.bytes.toString("base64"), mimeType: reference.mimeType }
```

Это base64 **без data URL**, SDK input `image` — начальный кадр. Пользовательский URL/payload не принимается. Контракт подтверждён [Google SDK Image](https://googleapis.github.io/js-genai/release_docs/interfaces/types.Image.html) и installed SDK serializer. Параметры native Veo проверены по [Google Veo guide](https://ai.google.dev/gemini-api/docs/veo): fixed MVP 720p, 4/6/8 секунд, 16:9/9:16, одно видео. Native audio остаётся default; неподтверждённый unified `generate_audio: false` не переносится.

Реальный SDK wire contract, подтверждённый offline mocked fetch:

```json
{
  "instances": [{
    "prompt": "<server-built prompt>",
    "image": {
      "bytesBase64Encoded": "<base64 of the snapshotted primary bytes>",
      "mimeType": "image/png"
    }
  }],
  "parameters": {
    "sampleCount": 1,
    "durationSeconds": 4,
    "aspectRatio": "16:9",
    "resolution": "720p"
  }
}
```

Model передаётся в endpoint, не в JSON. `frame_images` / `input_references` не используются. SDK top-level prompt/image API работает в pinned 2.27.0, но SDK предупреждает о будущей миграции на `source`; wire JSON подтверждён тестом текущей версии.

Operation `name` возвращается как `VideoJob.id` и сохраняется существующим service в `MediaGeneration.providerJobId`. `done=false` → PROCESSING; error → FAILED; один готовый generatedVideo → READY. SDK polling использует persisted name после reload. Download извлекает только проверенный file resource из разрешённого URI и передаёт SDK `files.download`; произвольный URI/redirect запрещён. MIME, declared/actual size и 100 MiB limit проверяются до SDK write; temporary file очищается. Существующий service выполняет MP4 validation, StorageProvider save и создание MediaAsset VIDEO.

Media Core, schema, jobs/polling/lease, receipt idempotency, primary snapshot, protected streaming и Workspace isolation не переделаны. Старый unified adapter и FakeVideoProvider workflow сохранены. Browser не получает ключ, operation ID или provider URLs.

## Единственная live попытка

Durable artifact `artifacts/veo-sdk-live.json` создаётся с `wx` до create. Повторный запуск скрипта не может заменить marker и начать новый create. Transport дополнительно блокирует второй POST. SDK retries выключены. Ни CLI, ни browser не выполняли второй live create.

| Поле | Результат |
| --- | --- |
| Native base URL | `https://api.proxyapi.ru/google` |
| ProxyAPI catalogue model | `google/veo-3.1-fast` |
| Native model | `veo-3.1-fast-generate-preview` |
| Endpoint | `POST https://api.proxyapi.ru/google/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning` |
| Character | `5e729717-f784-4297-8433-64e18beb01e6`, существующий ACTIVE |
| Primary/referenceAssetId | `9cf500d4-c571-4f4d-b632-29c2b9026677` |
| Reference MIME/bytes | `image/png`, 1 936 448 bytes |
| imageBytes реально отправлены | Да: HTTP body проверен против bytes зафиксированного reference перед отправкой |
| Parameters | 4 секунды, 720p, 16:9, sampleCount 1 |
| Live create attempts | **1 POST**, без retries; provider job не создан. Фактическое списание credits не проверялось |
| HTTP/create | **404** |
| Safe provider error | `NativeVideoHTTPError(404)` → `VideoError("missing")`; raw provider body не сохранялся |
| Local generation UUID | `70a1a8f5-fb11-4fa8-9fcf-b918ddaa0e40` |
| providerJobId | **null** |
| Финальный local status | **FAILED**, errorCode `missing` |
| PROCESSING / done=true polling | Не наступили: operation не создан |
| MP4 | Не получен |
| MediaAsset VIDEO ID | Не создан |
| Live playback / Range 206 / reload | Не проверены: нового MP4 нет |
| Live Character gallery/global Media | Нового видео нет; failed receipt сохранён |

Ошибка возникла на **create**, после успешного SDK model catalogue и проверки primary image. Это фактический результат POST; он не является выводом по GET/OPTIONS и не доказывает вечное отсутствие native Veo у ProxyAPI. Секреты, full base64, prompt и sensitive provider response не логировались. Подробный безопасный результат — `artifacts/veo-sdk-live.json`.

## Проверки

| Проверка | Результат |
| --- | --- |
| lint | PASS, 0 warnings |
| typecheck | PASS |
| production build | PASS |
| Video integration + официальный SDK wire | 14/14 PASS |
| Image/Media integration | 10/10 PASS |
| Auth / Character / Memory / Content integration | 15/12/10/9 PASS |
| Всего integration | 70/70 PASS |
| Native submit/recovery E2E отдельно | 1/1 PASS |
| Production Auth + native Video smoke | PASS; Video 1/1 PASS |
| Полный E2E | **21/21 PASS**, 3.1 минуты. Первый прогон 20/21 выявил Image test reload race; исправлено ожидание primary mutation в тесте |
| Prisma validate | PASS |
| Migration status | Все 6 migrations применены |
| Prisma drift | No difference detected, exit 0 |
| DB check | 17 моделей, constraints/indexes/tenant consistency PASS |
| Client secrets | 34 файла, API key/AUTH_SECRET: 0 вхождений |
| Live DB receipt check | FAILED, providerJobId null, mediaId null; referenceAssetId совпадает с отправленным primary |

Все browser/provider smoke checks используют fake SDK transport и тестовый MP4; live playback ими не подменяется. Offline SDK wire test покрывает image bytes/MIME, URL/model, prompt/config, operation name, polling/ready/failed, download, unsafe URI rejection, HTTP 400/402/403/404/503, create timeout и отсутствие retry. Browser E2E теперь создаёт job из формы через настоящий SDK adapter с mocked transport, проверяет сохранённый operation.name/reference, а затем reload, download/storage/VIDEO, protected playback/Range, global Media и responsive gallery.

Логи: `artifacts/veo-sdk-{lint,typecheck,build,video,media,e2e,e2e-final,production}.log`, `artifacts/veo-sdk-test-{auth,characters,memory,content}.log`, `artifacts/veo-sdk-prisma-{validate,status,drift}.log`, `artifacts/veo-sdk-db-check.log`, `artifacts/veo-sdk-client-secret-check.json`, `artifacts/veo-sdk-live-db-check.json`.

## Файлы

Добавлены `src/features/ai/google-veo-provider.ts`, `tests/google-veo.test.ts`, `scripts/smoke-video-native.ts`, этот отчёт. Обновлены `src/features/media/video-service.ts`, `.env.example`, `package.json`, `package-lock.json`, `tests/ai-fetch-hook.mjs`, `tests/e2e/video.spec.ts`, `scripts/check-veo-native.mjs` и ссылки в предыдущем отчёте. В `tests/e2e/media.spec.ts` добавлено ожидание завершения primary mutation перед reload; Image production code не изменён.

## Осталось

ProxyAPI должен принимать проверенный SDK POST на выбранном native endpoint; текущая попытка вернула 404. После устранения этой provider-side проблемы потребуется отдельно разрешённая новая live попытка, затем полный MP4 acceptance. Автоматический повтор запрещён и не выполнялся. **Этап 6B закрыть нельзя. Следующий этап не начат.**
