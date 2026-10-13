# План разработки лендинга Oblik OS

## 1. Цель и формат результата

Создать в текущем React + Vite + Tailwind CSS v4 проекте полноценный адаптивный маркетинговый лендинг Oblik OS на русском языке. Основная desktop-композиция должна восприниматься как цельное длинное полотно уровня Behance/Awwwards и при полном захвате страницы давать ориентировочное соотношение сторон 1:5–1:7, но реализация не должна быть фиксированным макетом: она обязана корректно перестраиваться для tablet и mobile.

Главная продуктовая мысль, которую пользователь должен понять на первом экране и затем подтвердить по ходу страницы: **Oblik OS сохраняет и развивает цифровую идентичность, а не просто генерирует отдельные изображения.**

Формат первого релиза — интерактивный маркетинговый прототип:

- навигация по якорям;
- переключаемые вкладки медиатеки;
- раскрывающийся FAQ;
- hover/focus-состояния;
- деликатные reveal/scroll-анимации;
- демонстрационные CTA без подключения авторизации, оплаты или API;
- полноценная адаптивность и базовая доступность.

## 2. Исходное состояние и технические ограничения

Текущий репозиторий — чистый scaffold:

- `src/App.tsx` содержит пустой корневой экран;
- `src/index.css` содержит только импорт Tailwind v4;
- доступен React 19, Vite 8, TypeScript и Tailwind CSS v4;
- роутер, UI-kit, библиотека иконок и медиаресурсы отсутствуют;
- dev-сервер уже запущен, запускать отдельный сервер не нужно.

Реализацию вести без роутинга и без тяжёлой UI-библиотеки. Для интерфейсных пиктограмм установить `lucide-react`, чтобы не собирать разрозненный набор SVG вручную и сохранить единый штриховой стиль. Не добавлять библиотеки анимации: появления, hover-переходы и motion реализовать CSS-средствами и небольшим локальным hook на `IntersectionObserver`.

Перед реализацией UI вызвать skill `make/use-design-system` и следовать его рекомендациям. Skill `make/unsplash` на первом проходе не нужен, поскольку выбран UI-first подход без stock-фотографии; его можно использовать только позднее, если стратегия ассетов изменится.

## 3. Визуальное направление и дизайн-система

### 3.1. Общий характер

Визуальный язык: **человек в центре, система вокруг него**. Не использовать sci-fi HUD, «AI-мозги», circuit boards, neon spheres, cyberpunk или тяжёлый glassmorphism. Интерфейс должен ощущаться как соединение точности Linear, воздуха Apple и визуальной выразительности premium creative tools, но иметь собственный мотив Oblik OS — identity graph.

Ключевые приёмы:

- светлый холодный фон;
- почти чёрная типографика;
- глубокий violet/indigo только для смысловых акцентов и CTA;
- большие поля и ритм секций;
- тонкая модульная сетка;
- соединительные линии и узлы как повторяющийся мотив постоянной идентичности;
- интерфейсные панели с радиусом 20–28 px, тонкой рамкой и минимальной тенью;
- редкие мягкие lavender/pale-blue/pink свечения, размещённые за контентом, а не поверх него.

### 3.2. Базовые токены

В `src/index.css` определить Tailwind v4 theme tokens и общие CSS-переменные:

- фон страницы: `#F7F8FC` / локальные белые секции `#FFFFFF`;
- основной текст: `#111117`;
- вторичный текст: `#656573`;
- muted text: `#91919D`;
- border: `rgba(20, 20, 35, 0.09)`;
- violet: ориентировочно `#5A49E8`;
- indigo-dark для active/hover: `#4434C7`;
- lavender surface: `#EFEDFF`;
- pale blue: `#EAF3FF`;
- pale pink: `#FBEFF7`;
- success/active: сдержанный mint, только в статусах;
- контентная ширина: `1320px` с адаптивными боковыми полями;
- секционный ритм desktop: 128–176 px, tablet: 96–120 px, mobile: 72–88 px;
- радиусы: 16 px для малых controls, 24 px для основных карточек, 32 px для hero/final CTA surfaces;
- тени: одна тонкая ambient shadow и одна floating shadow для крупных продуктовых mockup-панелей.

### 3.3. Типографика

Использовать публичный Google Font **Manrope** через CSS2 import в начале `src/index.css`, с системным fallback. Он достаточно нейтрален для SaaS, но немного мягче Inter и поддерживает кириллицу.

- Hero H1: fluid `clamp(3.25rem, 6.4vw, 5.5rem)`, tight leading 0.96–1.02;
- section H2: fluid `clamp(2.35rem, 4.5vw, 4rem)`;
- card headings: 24–32 px;
- body: 17–20 px desktop, 16–18 px mobile;
- metadata/UI: 11–14 px;
- веса преимущественно 450–650; избегать чрезмерно жирного текста;
- короткие строки, контролируемые переносы через `max-width`, `<br />` только там, где перенос является частью desktop-композиции, и скрываемые/перестраиваемые на mobile.

### 3.4. Повторяющиеся элементы

Создать визуально единые примитивы:

- `SectionHeader` с eyebrow, заголовком и коротким пояснением;
- `Pill` для badge/status/tags;
- `PrimaryButton` и `SecondaryButton` с одинаковой геометрией и focus ring;
- `ProductWindow` — белая панель с тонкой рамкой, верхней chrome-строкой и внутренними UI-блоками;
- `PortraitSlot` — контролируемый слот персонажа;
- `Metric` — label/value/status;
- `ConnectorGraph` — декоративные линии/узлы, `aria-hidden`;
- `Reveal` — единое появление секций с поддержкой `prefers-reduced-motion`.

## 4. Стратегия визуалов Sofia

Для первого прохода не использовать stock-фотографию и не пытаться собирать «одного человека» из разных несогласованных фото. Вместо этого реализовать намеренные premium media-slots, которые выглядят как часть раннего product reveal:

- единый reusable `PortraitSlot` с нейтральным светлым silhouette/blur treatment, мягким градиентным светом, аккуратной рамкой кадра и подписью `SOFIA / ID-01`;
- для всех вариаций контента использовать тот же базовый identity marker, одинаковый crop/token и различающиеся окружения, цветовые поля, captions и композицию;
- не рисовать cartoon-avatar и не использовать generic AI illustration;
- в hero, profile, memory и final CTA использовать одинаковый master-slot, чтобы уже сейчас сохранялась узнаваемость;
- gallery/content studio показывать как art-directed placeholders с явными форматами (portrait, 1:1, 9:16), метаданными и loading/preview treatment;
- подготовить единый массив `sofiaMedia` с понятными `id`, `alt`, `aspect`, `context` и `src`, чтобы позже заменить placeholder-рендер на 8–12 финальных изображений без изменения секций;
- зарезервировать будущие ассеты: hero portrait, 4 consistency scenes, 7–9 gallery scenes, product ad, final lifecycle collage и 1 video poster;
- для финальных фотографий зафиксировать арт-дирекшн: Sofia 25–30 лет, premium but natural, non-sexualized, consistent hair/face proportions, нейтральная современная одежда, мягкий дневной свет.

## 5. Информационная архитектура и секции

### 5.1. Header

- Sticky, полупрозрачный только после прокрутки; при старте практически невесомый.
- Слева wordmark `Oblik OS` с небольшим фирменным identity-node знаком.
- Якоря: `Возможности`, `Как работает`, `Для кого`, `Тарифы`.
- Справа `Войти` и primary CTA `Создать персонажа`.
- Mobile: wordmark, CTA компактного размера и кнопка menu; меню раскрывается как чистая светлая панель, закрывается по выбору ссылки, Escape и клику вне.
- Активные состояния, keyboard focus и достаточные touch-targets.

### 5.2. Hero (`#top`)

- Badge `AI Character Operating System`.
- H1 и подзаголовок из брифа; фраза «остаётся собой» получает тонкий violet text highlight без яркого glow.
- Два CTA и строка доверия `Бесплатный старт · Без банковской карты`.
- Ниже/справа — главный `Character Core` visual: master PortraitSlot Sofia, центральная карточка `Identity 96% / Active`, вокруг Appearance, Personality, Memory, Voice, Content.
- Connector graph строится SVG-линиями под карточками, без анимированного sci-fi эффекта; допустима очень медленная pulse-анимация активного узла, отключаемая при reduced motion.
- На desktop — асимметричная композиция текста и системы; на tablet/mobile — текст сверху, visual ниже с перестроенными узлами без горизонтального overflow.

### 5.3. Problem / comparison (`#features`)

- Заголовок `AI умеет создавать лица. Но плохо умеет создавать личности.`
- Две равные панели:
  - «Обычная AI-генерация»: четыре мини-кадра с контролируемыми различиями silhouette/crop/color и labels `Different face`, `Different style`, `Lost context`;
  - `Oblik OS`: четыре scene-slots с одним marker `SOFIA / ID-01`, контекстами кафе, офис, улица, путешествие и badge `Identity preserved`.
- Контраст строить через хаотичные рамки/несовпадающие markers слева и строгую identity-line справа, а не через красный «плохой» UI.

### 5.4. Consistency showcase

- Заголовок `Один персонаж. Сотни историй.`
- Tabs: `Фото`, `Видео`, `Reels`, `Реклама`.
- Editorial CSS grid вместо JS-masonry: 6–9 slots разных aspect ratio, но визуально сбалансированных.
- Переключение вкладок меняет набор подписей, форматов и компоновку previews с коротким fade; tablist доступен с клавиатуры и имеет корректные ARIA roles.
- На mobile — двухколоночная сетка с одним акцентным полноширинным slot, tabs горизонтально прокручиваемы без скрытия focus.

### 5.5. Oblik Core

- Заголовок `Не просто персонаж. Цифровая личность.` и подзаголовок.
- Большой центральный profile core и шесть модулей: Appearance/Внешность, Personality/Характер, Memory/Память, Voice/Голос, Content/Контент, Media/Медиатека.
- На desktop — радиальная, но строго grid-aligned композиция; на mobile — вертикальный core-stack с общей линией слева, чтобы избежать миниатюрного графа.
- Каждый модуль показывает 1–2 содержательных detail, а не только название.

### 5.6. How it works (`#how`)

Три большие горизонтальные step-card, каждая с номером, текстом и отдельным продуктовым фрагментом:

1. `Создайте` — поля Name, Gender, Age, Appearance, Style и preview.
2. `Настройте` — traits Creative/Confident/Calm/Funny и biography panel.
3. `Создавайте` — prompt bar, controls и result grid.

На desktop чередовать положение текста и UI, чтобы секция не ощущалась набором одинаковых cards. На mobile складывать в линейный рассказ.

### 5.7. Character Profile showcase

- Более контрастная секция на very pale indigo surface, не тёмная.
- Слева headline и короткий тезис о едином профиле.
- Справа большой production-like dashboard:
  - sidebar: Персонажи, Контент, Медиатека, Аналитика;
  - Sofia, status Active, portrait;
  - tabs Identity, Appearance, Personality, Memory, Voice, Content;
  - metrics 96%, 128, 124, 18, Sofia Voice 01;
  - traits Creative, Independent, Curious, Confident.
- На tablet/mobile sidebar превращается в top navigation strip, второстепенные panels сворачиваются, но основные данные остаются читаемыми.

### 5.8. Memory

- Заголовок `Ваш персонаж помнит, кем он является.`
- Слева Sofia identity card с summary.
- Справа timeline с четырьмя событиями и датами из брифа.
- Floating card `Memory / 128 stored memories / Auto memory ON`.
- Небольшое связующее движение линии при reveal, без бесконечной анимации.

### 5.9. Content Studio

- Заголовок `Персонаж уже создан. Теперь дайте ему жизнь.`
- Большой продуктовый mockup:
  - actions `Создать фото`, `Создать видео`, `Написать пост`, `Создать Reel`;
  - prompt `Morning coffee in a minimalist apartment, natural sunlight`;
  - Character Sofia, Format 9:16, Style Lifestyle;
  - result previews одного identity marker, включая video poster с duration/progress overlay.
- Actions переключают active state; результат может визуально обновлять label/format без генерации и backend.

### 5.10. Use cases (`#audience`)

Три крупные premium cards:

- `Креаторам` — mockup social feed;
- `Брендам` — product campaign composition;
- `Агентствам` — dashboard из 6–8 компактных character cards, единственное место с дополнительными персонажами.

Карточки различаются композицией, но используют общий chrome, border и type scale. На hover — лёгкий подъём mockup-слоя, не всей секции.

### 5.11. Comparison table

- Заголовок `Не начинайте персонажа заново с каждым промптом.`
- Колонки `Обычная генерация` и `Oblik OS`.
- Строки: Постоянное лицо, Характер, Память, Голос, История, Фото, Видео, Медиатека, Единый профиль.
- Для Oblik OS — restrained violet checks; для обычной генерации — `—` или `Ограниченно`, без агрессивных крестиков.
- Mobile: сохранять семантическую таблицу, но визуально позволить горизонтальный scroll с закреплённой первой колонкой либо compact card-row layout; выбрать table scroll как более честное сравнение и добавить визуальный hint.

### 5.12. Pricing (`#pricing`)

- Заголовок `Начните с первого персонажа.`
- Карточки Free, Creator, Pro; Creator выделить badge `Популярный` и более выраженной рамкой.
- Не придумывать цены. Вместо цен использовать статус `Стартовый доступ`, `Для авторов`, `Для команд` и списки возможностей без числовых лимитов, которые могли бы стать ложными продуктовыми обещаниями.
- Единый CTA `Начать бесплатно`; для Pro допустим secondary label `Связаться с нами`, но только как демо-ссылка.
- Набор возможностей:
  - Free: первый персонаж, базовый профиль, тестовая медиатека;
  - Creator: несколько профилей, расширенная память, фото и видео workflow;
  - Pro: командная работа, клиентские пространства, приоритетная генерация.
- Перед реализацией финально проверить формулировки как маркетинговые placeholders, а не реальные обязательства сервиса.

### 5.13. FAQ

Accordion из 7 вопросов:

1. Чем Oblik OS отличается от обычного AI-генератора?
2. Как сохраняется внешность персонажа?
3. Можно ли менять одежду, окружение и стиль?
4. Что хранит память персонажа?
5. Можно ли добавить собственный голос?
6. Подходит ли Oblik OS для брендов и агентств?
7. Нужна ли банковская карта для старта?

Одновременно может быть открыта одна строка; первая открыта по умолчанию. Кнопки accordion используют `aria-expanded`, content region получает связь через `aria-controls`, высота анимируется мягко и отключается при reduced motion.

### 5.14. Final CTA

- Большой rounded surface на pale lavender background.
- Заголовок и подзаголовок из брифа, primary CTA.
- Visual замыкает сюжет: центральный Sofia master-slot окружён миниатюрами созданного контента, video card и memory note; линии identity graph становятся более наполненными, чем в hero.
- На mobile visual упрощается до 3–4 карточек, без обрезанного/нечитаемого слоя.

### 5.15. Footer

- Wordmark и короткая фраза `Identity, not generation.`
- Колонки Продукт, Возможности, Компания, Документы.
- Privacy, Terms, `© 2026 Oblik OS`.
- Все placeholder-ссылки ведут к существующим якорям или получают безопасный `href="#"` с предотвращением неожиданной навигации; предпочтительно использовать реальные section IDs там, где это возможно.

## 6. Компонентная и файловая структура

Сохранить архитектуру небольшой и понятной:

- `src/App.tsx` — композиция страницы, состояния глобальных интеракций header/menu;
- `src/index.css` — Google Font import, Tailwind theme variables, базовые стили, media/reduced-motion rules, ограниченный набор сложных utility-like classes для grid/graph effects;
- `src/components/ui.tsx` — кнопки, pill, section header, product window, metric, reveal;
- `src/components/portrait-slot.tsx` — master visual placeholder и вариации media slot;
- `src/components/product-mockups.tsx` — Character Core, Profile, Creator, Content Studio и другие сложные UI-визуализации;
- `src/components/sections.tsx` — секции лендинга, если единый файл остаётся обозримым; при превышении примерно 500–700 строк разделить на `src/sections/*` по смысловым блокам;
- `src/data/content.ts` — nav, features, memories, use cases, comparison rows, plans, FAQ, gallery tabs и будущий `sofiaMedia`;
- `src/hooks/use-reveal.ts` — IntersectionObserver с graceful fallback;
- `src/assets/` — только когда появятся финальные локальные Sofia assets.

Не создавать отдельный state manager. Локальный `useState` достаточен для menu, gallery tabs, content action и FAQ. Данные не дублировать в JSX: повторяемые элементы хранить в typed arrays и рендерить map-ами.

## 7. Адаптивность

Проектировать mobile не как уменьшенную desktop-картинку, а как отдельную последовательность:

- desktop: ≥1280 px — широкая асимметричная сетка, floating panels и полная identity graph;
- laptop/tablet: 768–1279 px — 2-колоночные участки, сокращённые offsets, более компактные mockups;
- mobile: <768 px — одна колонка, cards без перекрытий, графы превращаются в stack/timeline, product UI допускает внутренний controlled scroll только там, где он оправдан;
- минимальная ширина проверки: 320 px;
- текст и кнопки не обрезаются, horizontal page overflow отсутствует;
- decorative panels могут скрываться на mobile только если не несут уникального смысла;
- sticky header не перекрывает anchor targets (`scroll-margin-top`).

## 8. Интерактивность и motion

- Smooth anchor scroll, но без принудительной анимации при `prefers-reduced-motion`.
- Header получает тонкий border/background после небольшого scroll offset.
- Reveal: opacity + translateY 12–20 px, stagger только внутри визуальных grid; не анимировать каждый текстовый элемент отдельно.
- Buttons: цвет, border и translateY 1 px; без glow.
- Product tabs/actions: реальное active-состояние и небольшой fade содержимого.
- FAQ: одна открытая секция, keyboard activation.
- Mobile menu: focusable controls, Escape close, блокировка фоновой прокрутки на время открытия.
- Connector line animation выполняется один раз при появлении секции.
- Все motion timings держать в диапазоне примерно 180–600 ms; декоративный pulse, если используется, должен быть почти незаметным.

## 9. Доступность и семантика

- Один `h1`, последовательная иерархия `h2/h3`.
- `header`, `nav`, `main`, `section`, `footer` и semantic table для comparison.
- Visible focus states для всех интерактивных элементов.
- Контраст текста и controls не ниже WCAG AA.
- Декоративные SVG и grid elements — `aria-hidden="true"`.
- Media slots получают осмысленные alt descriptions; чисто декоративные previews — пустой alt.
- Tabs и accordion реализовать корректными button controls, не div click handlers.
- Touch targets не менее 44×44 px.
- Reduced motion и keyboard-only сценарий входят в приёмку.

## 10. Реализация по этапам

### Этап 1. Основа

1. Подключить Manrope и theme tokens.
2. Установить `lucide-react`.
3. Создать layout primitives, container/section rhythm, buttons, pills и ProductWindow.
4. Создать content data model и placeholder strategy для Sofia.

### Этап 2. Верх страницы и ключевая метафора

1. Header и mobile navigation.
2. Hero с Character Core graph.
3. Problem comparison.
4. Consistency gallery с tabs.
5. Проверить, что value proposition считывается без чтения длинного текста.

### Этап 3. Product narrative

1. Oblik Core.
2. How it works.
3. Character Profile.
4. Memory.
5. Content Studio.
6. Выравнять mockup chrome и плотность UI между секциями.

### Этап 4. Conversion narrative

1. Use cases.
2. Comparison table.
3. Pricing без вымышленных цен.
4. FAQ.
5. Final CTA и footer.

### Этап 5. Polish

1. Добавить reveal/micro-interactions и reduced-motion fallback.
2. Уточнить grid, вертикальный ритм, разделители и тени.
3. Проверить отсутствие повторяющегося шаблонного card layout.
4. Сделать полный desktop capture и проверить цельность длинного полотна.
5. Отдельно пройти tablet/mobile и keyboard navigation.

## 11. Проверка и критерии приёмки

### Функциональная проверка

- все header/footer якоря ведут к правильным секциям;
- mobile menu открывается/закрывается мышью и клавиатурой;
- tabs consistency showcase переключают контент и active state;
- Content Studio actions переключают active preview state;
- FAQ раскрывается и корректно сообщает состояние assistive technology;
- CTA не ведут на несуществующие маршруты и явно остаются demo interactions.

### Визуальная проверка

Проверить минимум на ширинах 1440, 1024, 768, 390 и 320 px:

- desktop полотно выглядит единым, а не набором независимых шаблонов;
- H1 не превышает 2–3 строки, section headings не образуют случайных сиротских переносов;
- ни одна UI-панель не выходит за viewport;
- интерфейсные подписи остаются читаемыми;
- violet используется дозированно;
- отсутствуют случайные сильные градиенты, excessive shadows и дешёвый glass effect;
- Sofia marker и identity motif последовательны во всех секциях;
- финальный CTA визуально завершает историю, начатую hero.

### Техническая проверка

Поскольку изменение затрагивает весь UI, выполнить:

1. `pnpm run format` — форматирование проекта;
2. `pnpm run build` — TypeScript/Vite production build;
3. визуальный просмотр через уже запущенный Figma Make preview, без запуска второго dev-сервера;
4. проверить console только если в preview проявится конкретная ошибка;
5. убедиться в отсутствии horizontal overflow и layout shift после загрузки шрифта.

## 12. Критерий готовности ассетов к следующему этапу

Когда финальный набор Sofia будет доступен, заменить media-slots без изменения компонентной структуры. Набор считается достаточным, если содержит единый photorealistic character и охватывает: hero portrait, кафе, офис, улицу, путешествие, fashion, fitness, интерьер, product ad и вертикальное видео. После подстановки проверить crop/focal point для desktop/mobile, цветокоррекцию на единство серии и отсутствие визуального identity drift.
