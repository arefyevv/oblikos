# Seedance 2.5 через ProxyAPI, 13 октября 2026

Виктор разрешил проверку через второго подключённого агрегатора после отказа
AITUNNEL. Использованы прежние фото трёх котят, первые 5 секунд исходного видео,
прежний промпт замены трёх людей котятами и целевое разрешение 480p.
Качество модели проверить не удалось: готового видео нет.

## Проверка каталога

GET `https://api.proxyapi.ru/v1/videos/models` с существующим серверным ключом
подтвердил `bytedance/seedance-2.5`, размеры 480x854 и 720x1280, длительности
4–30 секунд. Возможность автоматически адаптировать параметры под режим editing
в ответе каталога не описана.

## Результаты

1. Receipt `9562d2c7-25e8-43d6-aeba-9104e417090b`: запрос с data URL отклонён
   HTTP 400 до providerJobId: `Only HTTPS URLs are allowed` для video_url.
2. Receipt `e727ab35-2539-471f-8c12-6e91ec911cd8`: исходники переданы по
   временным защищённым HTTPS-ссылкам. ProxyAPI принял задачу
   `gen-vid-1791880588-YzboPa7AOqGB0MKLXs1q`, затем вернул FAILED.
   Ошибка ByteDance совпала с AITUNNEL: для video editing требуются
   `ratio=adaptive` и `duration=-1`, а не фиксированный формат и 5 секунд.
   В ответе не было подтверждённого значения `usage.cost_rub`.
3. Receipt `bd818e2b-c7bd-4016-aefd-b4b73c5754c4`: проверка передачи
   `duration=-1`, `resolution=480p`, `aspect_ratio=adaptive` через единый API
   отклонена HTTP 400 до providerJobId. Request ID:
   `4af3d471-537b-48d0-9ae4-fcdc63d2fa63`. Очищенный диагностический helper
   не извлёк подробное сообщение валидации; точное поле отказа не установлено.

Новых MP4/MediaAsset нет. Автоматических повторов POST нет; каждая исправленная
проверка имеет отдельный постоянный receipt. Production.env не изменялся.
Лимит повышался только в окружении процессов до 13/14/15 попыток для проверок.
ESLint и TypeScript основного скрипта прошли; адаптивный вариант прошёл ESLint.

Временные ссылки обслуживались transport-only записями PROCESSING с
provider=aitunnel-motion, без providerJobId и с длительной lease; worker
не отправляет такие записи на генерацию. Реальная задача записана как proxyapi.
Transport receipts `167d17d2-4192-42da-99e6-730807a88fe6` и
`4cc91d7b-0152-4341-af4a-88227be6d866` переведены в FAILED после завершения
проверок, что отзывает ссылки.

## Вывод

Модель присутствует в обоих агрегаторах, но именно режим video editing
не заработал через проверенный единый формат API. Это проблема совместимости
параметров вызова; она ничего не доказывает о качестве модели на котятах.

## Подготовленный вопрос поддержке (не отправлен)

Как запустить `bytedance/seedance-2.5` в режиме video editing через `/v1/videos`?
Задача gen-vid-1791880588-YzboPa7AOqGB0MKLXs1q с video_url + image_url,
duration=5 и size=480x854 упала: ByteDance требует ratio=adaptive, duration=-1.
Попытка передать duration=-1, aspect_ratio=adaptive, resolution=480p отклонена
вашим API с HTTP 400 (request ID 4af3d471-537b-48d0-9ae4-fcdc63d2fa63).
Нужен способ передать параметры editing и сохранить корректную тарификацию
короткого ролика 480p. Просьба также подтвердить отсутствие списания по FAILED.

Документация: https://proxyapi.ru/docs/video-generation,
https://proxyapi.ru/models/bytedance/seedance-2.5.
