export const navItems = [
  { label: "Возможности", href: "#features" },
  { label: "Как работает", href: "#how" },
  { label: "Для кого", href: "#audience" },
  { label: "Тарифы", href: "#pricing" },
  { label: "Блог", href: "/blog" },
]

export const galleryTabs = {
  Фото: [
    {
      label: "Editorial portrait",
      context: "Fashion / 01",
      tone: "violet",
      shape: "tall",
    },
    {
      label: "Morning in the city",
      context: "Lifestyle / 02",
      tone: "blue",
      shape: "wide",
    },
    {
      label: "Coffee break",
      context: "Everyday / 03",
      tone: "rose",
      shape: "square",
    },
    {
      label: "Quiet workspace",
      context: "Business / 04",
      tone: "sand",
      shape: "square",
    },
    {
      label: "Weekend coast",
      context: "Travel / 05",
      tone: "aqua",
      shape: "wide",
    },
    {
      label: "Product story",
      context: "Campaign / 06",
      tone: "peach",
      shape: "tall",
    },
  ],
  Видео: [
    {
      label: "A day with Sofia",
      context: "00:18 / Story",
      tone: "blue",
      shape: "wide",
    },
    {
      label: "Studio notes",
      context: "00:12 / Portrait",
      tone: "violet",
      shape: "tall",
    },
    {
      label: "Morning routine",
      context: "00:24 / Lifestyle",
      tone: "rose",
      shape: "square",
    },
    {
      label: "City walk",
      context: "00:16 / Motion",
      tone: "sand",
      shape: "square",
    },
    {
      label: "Travel journal",
      context: "00:32 / Story",
      tone: "aqua",
      shape: "wide",
    },
    {
      label: "Brand scene",
      context: "00:10 / Campaign",
      tone: "peach",
      shape: "tall",
    },
  ],
  Reels: [
    {
      label: "Get ready with Sofia",
      context: "9:16 / Social",
      tone: "rose",
      shape: "tall",
    },
    {
      label: "Three favorite places",
      context: "9:16 / Guide",
      tone: "blue",
      shape: "wide",
    },
    {
      label: "Workday reset",
      context: "9:16 / Routine",
      tone: "violet",
      shape: "square",
    },
    {
      label: "Coffee edit",
      context: "9:16 / Mood",
      tone: "sand",
      shape: "square",
    },
    {
      label: "On the coast",
      context: "9:16 / Travel",
      tone: "aqua",
      shape: "wide",
    },
    {
      label: "New drop",
      context: "9:16 / Brand",
      tone: "peach",
      shape: "tall",
    },
  ],
  Реклама: [
    {
      label: "Skin ritual",
      context: "Beauty / Campaign",
      tone: "peach",
      shape: "tall",
    },
    {
      label: "Future essentials",
      context: "Fashion / Launch",
      tone: "violet",
      shape: "wide",
    },
    {
      label: "Daily hydration",
      context: "Lifestyle / Product",
      tone: "aqua",
      shape: "square",
    },
    {
      label: "Quiet luxury",
      context: "Interior / Brand",
      tone: "sand",
      shape: "square",
    },
    {
      label: "Move naturally",
      context: "Fitness / Campaign",
      tone: "blue",
      shape: "wide",
    },
    {
      label: "Signature scent",
      context: "Beauty / Story",
      tone: "rose",
      shape: "tall",
    },
  ],
} as const

export type GalleryTab = keyof typeof galleryTabs

export const memories = [
  {
    date: "14.09",
    year: 2026,
    title: "Переехала в Москву",
    detail: "Новая съёмная квартира и любимое кафе рядом",
  },
  {
    date: "19.09",
    year: 2026,
    title: "Начала заниматься бегом",
    detail: "Утренний маршрут вдоль набережной",
  },
  {
    date: "23.09",
    year: 2026,
    title: "Познакомилась с Алексом",
    detail: "На открытии небольшой галереи",
  },
  {
    date: "01.10",
    year: 2026,
    title: "Запустила блог о моде",
    detail: "Первая история — о личном стиле",
  },
  {
    date: "01.11",
    year: 2026,
    title: "Первая рекламная интеграция",
    detail: "Кофейня рядом обратилась с запросом на рекламу",
  },
]

export const comparisonRows = [
  ["Постоянное лицо", "Ограниченно", true],
  ["Характер", "—", true],
  ["Память", "—", true],
  ["Голос", "Отдельно", true],
  ["История персонажа", "—", true],
  ["Фото", "Да", true],
  ["Видео", "Зависит от сервиса", true],
  ["Медиатека", "Разрозненно", true],
  ["Единый профиль персонажа", "—", true],
] as const

export const plans = [
  {
    name: "Free",
    label: "Стартовый доступ",
    description: "Знакомство с Oblik OS.",
    price: "0 ₽",
    period: "Навсегда",
    button: "Начать бесплатно",
    features: ["1 персонаж", "Базовая память", "Пробные генерации фото и видео", "Ограниченная медиатека"],
  },
  {
    name: "Creator",
    label: "Для авторов",
    description: "Для активного создания персонажей и контента.",
    price: "1 490 ₽",
    period: "/ месяц",
    button: "Выбрать Creator",
    features: [
      "До 5 персонажей",
      "Расширенная память",
      "Регулярные генерации фото и видео",
      "Полная медиатека",
      "Увеличенные лимиты генераций",
    ],
    popular: true,
  },
  {
    name: "Pro",
    label: "Для профессиональной работы",
    description: "Для профессионального использования и повышенных лимитов.",
    price: "3 990 ₽",
    period: "/ месяц",
    button: "Выбрать Pro",
    features: [
      "До 20 персонажей",
      "Максимальная память",
      "Повышенные лимиты генераций",
      "Приоритетная генерация",
      "Командная работа",
      "Клиентские пространства",
    ],
  },
]

export const faqs = [
  {
    question: "Что такое AI-персонаж?",
    answer:
      "Это постоянная цифровая личность с собственной внешностью, характером, историей, памятью и голосом, которую можно использовать в разных форматах контента.",
  },
  {
    question: "Сохраняется ли внешность персонажа между генерациями?",
    answer:
      "Профиль идентичности фиксирует ключевые особенности лица, тела и визуального стиля, чтобы персонаж оставался узнаваемым в разных сценах и форматах.",
  },
  {
    question: "Можно ли менять внешность после создания?",
    answer:
      "Отдельные параметры можно развивать и уточнять внутри профиля. Значимые изменения должны оставаться управляемыми, чтобы не потерять узнаваемость персонажа.",
  },
  {
    question: "Что именно запоминает персонаж?",
    answer:
      "Важные события, отношения, привычки, предпочтения и факты биографии. Они помогают сохранять последовательность будущих историй.",
  },
  {
    question: "Можно ли создавать фото и видео?",
    answer:
      "Oblik OS объединяет создание фото и видео вокруг одного профиля, чтобы контент в разных форматах сохранял общую идентичность.",
  },
  {
    question: "Можно ли использовать созданный контент коммерчески?",
    answer:
      "Условия коммерческого использования будут зависеть от выбранного тарифа и лицензий подключённых моделей. Актуальные правила будут указаны перед генерацией.",
  },
  {
    question: "Какие AI-модели используются?",
    answer:
      "Система может объединять несколько моделей под единым продуктовым сценарием. Пользователю не нужно пересобирать профиль персонажа при смене инструмента.",
  },
  {
    question: "Можно ли удалить персонажа и его данные?",
    answer:
      "Управление профилем предусматривает удаление персонажа и связанных с ним данных. Детальные сроки и правила хранения будут описаны в документах продукта.",
  },
]
