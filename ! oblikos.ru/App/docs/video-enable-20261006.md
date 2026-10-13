# Проверка включения видео — 6 октября 2026

Исторический результат проверки Veo: подключение image-to-video было заблокировано внешним API.
Позже генерация подключена через Kling 3.0 Pro и проверена реальным роликом.
Текущее состояние и настройка: [kling-video-setup.md](kling-video-setup.md).

## Результаты

- Текущая модель: `google/veo-3.1-fast`.
- GET `/v1/videos/models`: HTTP 200, модель поддерживает первый кадр, 4/6/8 секунд, 720p, 16:9/9:16.
- GET `/v1beta/models` и `/google/v1beta/models`: HTTP 200, native Fast-модель присутствует в каталоге.
- Ровно один новый live POST `/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning`: HTTP 404.
- Портрет передан через официальный Google SDK; 4 секунды, 720p, 16:9, одно видео. Повторного POST не было.
- Локальное задание FAILED; `providerJobId` отсутствует; MP4 не получен. Фактическое списание не проверялось.
- Артефакт: `artifacts/veo-enable-20261006.json`. Ранее сохранённые smoke-артефакты не перезаписаны.
- Актуальный OpenAPI `/v1/videos` по-прежнему не содержит requestBody и схем для frame_images/input_references.
- Заведомо несуществующая модель в запросе к `/v1/videos` возвращает HTTP 400 `Model not supported`; этот запрос не запускал генерацию.

Каталог моделей не доказывает работоспособность POST. Открывать пользовательскую кнопку до восстановления рабочего подключения нельзя считать завершённым включением.

Виктор подтвердил, что требуется видео с тем же персонажем. Генерация только по тексту без портрета не подходит.

Дополнительно проверены официальные страницы прежних эндпоинтов ProxyAPI и OpenRouter image-to-video. OpenRouter описывает первый кадр как `frame_images: [{ type: "image_url", image_url: { url: "https://..." }, frame_type: "first_frame" }]`, однако это само по себе не подтверждает приём приватных байтов или data URL шлюзом ProxyAPI. Публичный доступ к приватным изображениям не открывался. Неподтверждённый encoder в production не добавлен.

## Источники

- https://proxyapi.ru/docs/video-generation
- https://proxyapi.ru/docs/native-api
- https://proxyapi.ru/docs/gemini-video-veo

## Текст вопроса в поддержку ProxyAPI

Используем модель google/veo-3.1-fast. GET /v1/videos/models и GET /v1beta/models возвращают HTTP 200 и содержат эту модель. POST /v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning через официальный @google/genai возвращает HTTP 404. Аналогичный POST через /google/v1beta ранее также вернул 404.

Поддерживается ли сейчас native predictLongRunning для Veo данным API? Если image-to-video следует вызывать через POST /v1/videos, пришлите, пожалуйста, точный JSON-пример frame_images или input_references для первого кадра: имена вложенных полей, формат изображения (base64/data URL/HTTPS URL), допустимые MIME, обязательные параметры. Нужна передача приватного портрета без публикации файла.

Сообщение подготовлено локально; в поддержку не отправлялось.
