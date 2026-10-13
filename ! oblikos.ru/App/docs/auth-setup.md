# Подключение Яндекс ID и VK ID

Проверено по официальным материалам 2 октября 2026 года. Реальные входы нужно
проверить после создания ваших OAuth-приложений. Секреты вводятся только в `.env`.

## Origin и callback URLs

Обычный локальный запуск: `NEXTAUTH_URL=http://localhost:3000`, `npm run dev`.
Страницы открывайте именно на localhost, не на 127.0.0.1: для cookies это разные хосты.

| Провайдер | Callback для обычного локального запуска         |
| --------- | ------------------------------------------------ |
| Яндекс ID | `http://localhost:3000/api/auth/callback/yandex` |
| VK ID     | `http://localhost:3000/api/auth/callback/vk`     |

Сейчас для проверки этапа запущен отдельный dev server на порту **3001**.
Если продолжаете использовать его, укажите `NEXTAUTH_URL=http://localhost:3001`,
замените порт на 3001 в обоих callback URLs и запускайте
`npm run dev -- --port 3001`. После изменения ENV перезапустите сервер.
Запуск по умолчанию явно закрепляет порт 3000 и не подменяет auth origin автоматически.

В production используйте `NEXTAUTH_URL=https://app.oblikos.ru`.

| Провайдер | Production callback |
| --- | --- |
| Яндекс ID | `https://app.oblikos.ru/api/auth/callback/yandex` |
| VK ID | `https://app.oblikos.ru/api/auth/callback/vk` |

При переходе на новый домен обновите название OAuth-приложений на Oblik OS,
адрес сайта и разрешённые callback URLs в кабинетах провайдеров.
Callback = `NEXTAUTH_URL` + `/api/auth/callback/yandex` либо `/api/auth/callback/vk`.
Не используйте произвольный callback из пользовательского ввода.

## Яндекс ID — действия Виктора

1. Откройте [создание приложения Яндекс ID](https://oauth.yandex.ru/client/new/id/).
2. Выберите **«Для авторизации пользователей»**, название Oblik OS, иконку и контактную почту.
3. Платформа — **«Веб-сервисы»**. В Redirect URI вставьте точный callback из таблицы.
4. Доступ к данным: логин/имя/фамилия, email, портрет. Используются scopes
   `login:info login:email login:avatar`. Телефон и дату рождения не запрашиваем.
5. Сохраните приложение. Получите Client ID и Client secret в его свойствах.
6. Самостоятельно добавьте в `.env` значения `YANDEX_CLIENT_ID` и
   `YANDEX_CLIENT_SECRET`. Перезапустите dev server.
7. Проверьте кнопку входа в приватном окне, создание Workspace/OWNER, повторный вход.
   Для привязки к существующему аккаунту сначала войдите им, подтвердите email
   при наличии password credential и используйте Settings → «Способы входа».

Источник: [регистрация приложения](https://yandex.ru/dev/id/doc/ru/register-auth),
[authorization code и PKCE](https://yandex.ru/dev/id/doc/ru/codes/code-url),
[информация о пользователе](https://yandex.ru/dev/id/doc/ru/user-information).
При публичном запуске отдельно пройдите требуемую Яндексом верификацию сервиса.

## VK ID — действия Виктора

1. Откройте [кабинет подключения VK ID](https://id.vk.ru/about/business/),
   раздел приложений, создайте приложение Oblik OS для **веб-сайта**.
2. Укажите название, адрес сайта и доверенный адрес возврата (Redirect URL).
   Для выбранного origin точный callback указан в таблице выше.
3. Получите **ID приложения / APP_ID**. Добавьте его в `.env` как `VK_CLIENT_ID`.
4. Выдайте доступ к email, если кабинет требует отдельной настройки прав.
   Код запрашивает только scope `email`; телефонная авторизация не подключается.
5. Перезапустите сервер, проверьте вход в приватном окне и привязку из Settings.

Используется современный VK ID: authorization code + PKCE, `state`,
`device_id`, server-side обмен кода и `user_info`. Client secret в этом
выбранном flow **не требуется и не отправляется**, поэтому `VK_CLIENT_SECRET`
не добавлен в ENV ради неиспользуемого значения.

Веб-страницы документации VK не удалось получить инструментом чтения сайта.
Параметры протокола проверены по текущему официальному исходному коду
[VKCOM/vkid-web-sdk](https://github.com/VKCOM/vkid-web-sdk),
[auth.ts](https://github.com/VKCOM/vkid-web-sdk/blob/master/src/auth/auth.ts),
[constants.ts](https://github.com/VKCOM/vkid-web-sdk/blob/master/src/constants.ts).
Ссылка на [создание приложения](https://id.vk.ru/about/business/go/docs/ru/vkid/latest/vk-id/connection/create-application)
также взята из официального SDK. Названия полей кабинета и его правила для
локальных HTTP-адресов требуют проверки при настройке приложения.
Если кабинет отклоняет localhost, нужен разрешённый HTTPS-origin тестового окружения:
его следует одинаково указать в `NEXTAUTH_URL`, адресе сайта и callback,
и открывать приложение через этот origin. Конкретный публичный домен пока не задан.

## Проверки после получения credentials

- Новый OAuth-пользователь получает User UUID, Personal Workspace и OWNER.
- Повторный вход возвращает того же User и не создаёт второй Workspace.
- Совпавший email чужого password-аккаунта не связывает его с OAuth identity.
- Привязка из Settings возвращает в Settings и показывает «Подключено».
- Identity, уже принадлежащая другому User, не привязывается.
- Отмена, недоступность провайдера и неправильный callback дают понятную ошибку.
- Последний способ входа отключить нельзя; успешное отключение завершает сессии.

Секреты, authorization codes и токены в чат присылать не нужно.
