# Этап 6A — финальный live image smoke

2 октября 2026 года. После исправления OPENAI_IMAGE_MODEL выполнен ровно один реальный запрос через существующий provider и Media service. SDK maxRetries=0, транспорт запрещает второй запрос. Предыдущая неуспешная попытка сохранена в artifacts/image-live-smoke.json.

| Проверка | Результат |
| --- | --- |
| OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_IMAGE_MODEL | Все доступны; ключ не выводился |
| Endpoint | https://api.proxyapi.ru/v1/images/generations |
| Model | openai/gpt-image-1-mini; совпадает с OPENAI_IMAGE_MODEL и payload.model |
| Реальные запросы этого запуска | 1, n=1, без повторов |
| HTTP status | 200 |
| b64_json | Получен |
| Файл | image/png, 1024×1024, 1 889 338 байт |
| Validation | PASS: inspectImage, MIME, размеры и объём совпадают с БД |
| Storage | Сохранён; повторное чтение service совпадает с файлом |
| MediaAsset | eea53ad0-b4dc-47f6-9e70-625d8ec6ab58 |
| Reload | PASS: браузер декодирует изображение после reload |
| Private route | HTTP 200; MIME и объём совпадают с asset |
| Primary | PASS: назначен кнопкой интерфейса; БД содержит единственный primary |
| Character header | Показывает изображение сразу после назначения и после reload |
| Client bundle | 34 static файла, 0 вхождений действующего OPENAI_API_KEY |
| Reference | false; референс не передавался |

Файл: data/media/e3188958-d992-4233-a87b-fad3ea25ed70/5e729717-f784-4297-8433-64e18beb01e6/b4745505-72cf-492e-9d55-913c88816beb.png.

Квитанция: artifacts/image-live-smoke-20261002-corrected-model.json. Скриншот: artifacts/image-live-smoke-primary.png.

Browser smoke выполнен на существующей production build через локальный порт 3006. Временная тестовая auth-сессия удалена после проверки. Файл, MediaAsset и выбранный primary оставлены для просмотра. Browser verifier не вызывает генерацию. Изменены только smoke scripts и отчёты; архитектура и .env не менялись. ESLint двух smoke scripts: PASS.

**Этап 6A окончательно ГОТОВ. Этап 6B не начат.** Reference generation и Video этой одиночной генерацией не проверялись.
