# Этап 6B — текущее состояние

3 октября 2026. **Инфраструктура готова, production image-to-video integration временно заблокирована внешним API contract ProxyAPI.** Следующий этап не начат.

Готовы VideoProvider abstraction, jobs/providerJobId, polling/lease, recovery после reload, reference snapshot, idempotency, MP4 validation, private storage, MediaAsset VIDEO, protected streaming и HTTP Range, Character gallery, global Media, Workspace isolation. Реализация и offline tests сохранены.

## Блокер и подтверждённые endpoints

[Официальный video API ProxyAPI](https://proxyapi.ru/docs/video-generation) описывает:

- `POST https://api.proxyapi.ru/v1/videos` — create;
- `GET /v1/videos/{id}` — polling;
- `GET /v1/videos/{id}/content` — MP4;
- `GET /v1/videos/models` — capabilities (ранее получен HTTP 200).

Две реальные native попытки `predictLongRunning` вернули HTTP 404: на `/google/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning` и на `/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning`. Job ID не получен. `GET /v1beta/models` вернул HTTP 200, но наличие модели в каталоге не доказывает поддержку native video create. Native adapter и wire-tests сохранены для истории; production больше не подключает этот adapter. Дальнейшие попытки native create прекращены.

Документация называет `frame_images` и `input_references`, но не даёт точной схемы входного изображения: тип контейнера/элементов, обязательные поля, формат bytes/base64/data URL/upload ID/URL и привязку primary image к `first_frame`. Эти варианты перечислены как неизвестные, а не как допустимый payload. Ничего не угадывается. Unified provider остаётся без `VerifiedReferenceEncoder` и блокирует create.

## Production UI и actions

`createVideoAction` безусловно заблокирован до DB receipt и provider calls, включая прямой вызов и старую вкладку. Нельзя запустить генерацию или новую платную попытку. Форма заменена сообщением: «Создание видео временно недоступно. Сохранённые видео можно смотреть в медиатеке». Переход к новой попытке из failed jobs убран. UI не делает native capabilities запросов.

Просмотр/удаление сохранённых видео, protected playback/Range, galleries и status/recovery infrastructure сохранены. Runtime использует существующий unified `ProxyAPIVideoProvider` без encoder. Две failed native receipts остаются историей; активных native jobs эти попытки не создали. Test providers/fetch hooks остаются только в tests и изолированных test processes; production demo switch не добавлен. Offline browser test создаёт job fixture только в своей тестовой БД, затем проверяет production polling/storage/playback.

Новых live create при фиксации статуса: **0**. Старые live markers/diagnostics сохранены. Live smoke scripts запускать запрещено до отдельного разрешения Виктора.

Проверка фиксации: lint, typecheck, production build — PASS; video tests — 15/15 PASS, включая запрет provider create без encoder; production Auth smoke и offline video E2E — PASS. E2E подтверждает сообщение/отсутствие create buttons, fixture recovery после reload, storage, MP4 playback, Range 206, обе галереи и tenant isolation. Логи: `artifacts/veo-blocked-{lint,typecheck,build,video,production}.log`.

## Возобновление 6B

1. Получить официальный рабочий image-to-video пример ProxyAPI для `/v1/videos` с точной схемой reference, поддерживаемой моделью и параметрами.
2. Реализовать server-only `VerifiedReferenceEncoder` для primary image по этому примеру, не меняя Media/Storage/polling architecture.
3. Добавить mocked wire-contract test точного request/response, проверить capabilities и offline tests, lint/typecheck/build и production E2E.
4. После отдельного разрешения Виктора выполнить один live create и проверить весь flow до READY, MP4 validation/storage, MediaAsset VIDEO, protected playback, Range 206, reload и обеих галерей.
5. Только после успешного live flow снять server/UI блокировку и закрыть 6B. Native endpoint guessing не возобновлять.
