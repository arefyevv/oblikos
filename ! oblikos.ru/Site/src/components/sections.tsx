import { useState } from "react"
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  MemoryStick,
  Mic2,
  Play,
  Sparkles,
} from "lucide-react"
import {
  comparisonRows,
  faqs,
  memories,
  plans,
} from "../data/content"
import {
  AgencyGrid,
  BrandCampaign,
  CharacterCoreVisual,
  CharacterProfileMockup,
  ContentStudioMockup,
  CreatorPhone,
  ExpertPresenter,
  OblikCoreMap,
} from "./product-mockups"
import { PortraitSlot } from "./portrait-slot"
import { photos } from "../data/photos"
import { StepStory } from "./step-story"
import {
  Button,
  CheckMark,
  LogoMark,
  Pill,
  Reveal,
  SectionHeader,
  Wordmark,
} from "./ui"

export function HeroSection() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-ambient hero-ambient--one" aria-hidden="true" />
      <div className="hero-ambient hero-ambient--two" aria-hidden="true" />
      <div className="container hero__inner">
        <Reveal className="hero__copy">
          <Pill tone="violet" dot>
            AI Character Operating System
          </Pill>
          <h1 id="hero-title">
            Создай цифровую личность, <span>которая остаётся собой.</span>
          </h1>
          <p>
            Создавай контент с одной внешностью, характером и историей — без
            повторной настройки.
          </p>
          <div className="hero__actions">
            <Button href="https://app.oblikos.ru/register" icon>
              Создать персонажа бесплатно
            </Button>
            <Button href="#how" variant="secondary">
              <Play size={15} fill="currentColor" /> Посмотреть, как работает
            </Button>
          </div>
          <div className="hero__trust">
            <Check size={14} /> Бесплатный старт <span /> Без банковской карты
          </div>
        </Reveal>
        <Reveal className="hero__visual" delay={100}>
          <CharacterCoreVisual />
        </Reveal>
      </div>
      <a className="scroll-cue" href="#features">
        <span>Узнать больше</span>
        <ArrowDown size={14} />
      </a>
    </section>
  )
}

export function GallerySection() {
  const scenes = [
    { photo: photos.cafe, label: "Утро в кафе" },
    { photo: photos.office, label: "Рабочий день" },
    { photo: photos.city, label: "Прогулка по городу" },
    { photo: photos.coast, label: "На побережье" },
  ]
  return (
    <section className="section gallery-section" id="features" aria-labelledby="gallery-title">
      <div className="container">
        <Reveal>
          <SectionHeader
            eyebrow="Постоянная идентичность"
            id="gallery-title"
            title="Новая сцена. Тот же персонаж."
            description="Создайте персонажа один раз. Oblik OS сохранит его внешность, характер и историю для следующих фото, видео и текстов."
          />
        </Reveal>
        <div className="story-workflow">
          <Reveal className="story-input">
            <figure className="story-reference">
              <img src={photos.sofia.src} alt={photos.sofia.alt} loading="lazy" />
              <figcaption className="story-badge">Ваш персонаж</figcaption>
              <span className="story-reference__name">София <small>27 лет · Москва</small></span>
            </figure>
          </Reveal>
          <Reveal className="story-transition" delay={80}>
            <div className="story-prompt"><span><Sparkles size={13} />Новая сцена</span><p>Меняйте сюжет, а не пересобирайте персонажа.</p><i aria-hidden="true"><ArrowRight size={18} /></i></div>
            <span>А дальше — любой сюжет</span>
          </Reveal>
          <Reveal className="story-output" delay={120}>
            <div className="story-output__grid">
              {scenes.map(({ photo, label }) => (
                <figure className="story-shot" key={label}>
                  <img src={photo.src} alt={photo.alt} loading="lazy" />
                  <figcaption>{label}</figcaption>
                </figure>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export function CoreSection() {
  return (
    <section className="section core-section" aria-labelledby="core-title">
      <div className="container">
        <Reveal>
          <SectionHeader
            align="center"
            eyebrow="Oblik Core"
            id="core-title"
            title="Не просто генератор персонажей."
            description="Всё хранится внутри одного профиля и используется в следующих генерациях."
          />
        </Reveal>
        <Reveal className="core-map-wrap" delay={100}>
          <OblikCoreMap />
        </Reveal>
      </div>
    </section>
  )
}

const steps = [
  {
    number: "01",
    title: "Создайте",
    text: "Опишите идею или настройте персонажа самостоятельно.",
    visual: <StepStory stage="idea" />,
  },
  {
    number: "02",
    title: "Настройте",
    text: "Внешность, характер, историю, голос и правила поведения.",
    visual: <StepStory stage="identity" />,
  },
  {
    number: "03",
    title: "Создавайте",
    text: "Фото, видео и контент с одним и тем же персонажем.",
    visual: <StepStory stage="content" />,
  },
]

export function HowSection() {
  return (
    <section
      className="section how-section"
      id="how"
      aria-labelledby="how-title"
    >
      <div className="container">
        <Reveal>
          <SectionHeader
            eyebrow="Три шага"
            id="how-title"
            title="От идеи до живого персонажа за три шага."
          />
        </Reveal>
        <div className="steps-list">
          {steps.map((step, index) => (
            <Reveal
              className="step-card"
              delay={index * 80}
              key={step.number}
            >
              <div className="step-card__copy">
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <div className="step-line">
                  <i />
                </div>
              </div>
              <div className="step-card__visual">{step.visual}</div>
              {index === 0 && (
                <Button className="how-cta" href="https://app.oblikos.ru/register" icon>
                  Создать первого персонажа
                </Button>
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function ProfileSection() {
  return (
    <section
      className="section profile-section"
      id="profile"
      aria-labelledby="profile-title"
    >
      <div className="profile-orb" aria-hidden="true" />
      <div className="container profile-section__inner">
        <Reveal className="profile-section__copy">
          <SectionHeader
            eyebrow="Единый профиль"
            id="profile-title"
            title={
              <>
                Вся цифровая личность —<br />в одном профиле.
              </>
            }
            description="Не папка с генерациями, а полный контекст персонажа — от черт лица до последнего воспоминания."
          />
        </Reveal>
        <Reveal className="profile-section__mockup" delay={100}>
          <CharacterProfileMockup />
        </Reveal>
      </div>
    </section>
  )
}

export function MemorySection() {
  const [activeMemory, setActiveMemory] = useState(0)
  const memoryPhotos = [photos.city, photos.memoryRunning, photos.memoryGallery, photos.memoryFashion, photos.cafe]

  return (
    <section className="section memory-section" aria-labelledby="memory-title">
      <div className="container">
        <Reveal>
          <SectionHeader
            eyebrow="Живая память"
            id="memory-title"
            title={
              <>
                Ваш персонаж помнит,
                <br />
                кем он является.
              </>
            }
            description="Oblik OS сохраняет важные события и использует их в будущих сценариях, диалогах и контенте."
          />
        </Reveal>
        <div className="memory-layout">
          <Reveal className="memory-character">
            <div className="memory-photos">
              {memoryPhotos.map((photo, index) => (
                <div key={photo.src} className={`memory-photo ${activeMemory === index ? "is-active" : ""}`} aria-hidden={activeMemory !== index}>
                  <PortraitSlot tone="blue" showMeta={false} src={photo.src} alt={photo.alt} />
                </div>
              ))}
            </div>
            <div className="memory-character__info">
              <div>
                <strong>София</strong>
                <span>27 лет · Москва</span>
              </div>
              <p>
                Творческая, независимая и любознательная. Любит архитектуру,
                утренние пробежки и тихие кофейни.
              </p>
              <div className="memory-tags">
                <Pill>Мода</Pill>
                <Pill>Бег</Pill>
                <Pill>Дизайн</Pill>
              </div>
            </div>
            <div className="memory-float">
              <div>
                <MemoryStick size={17} />
                <span>Память</span>
              </div>
              <strong>
                128 <small>воспоминаний сохранено</small>
              </strong>
              <div>
                <span>Управление памятью</span>
                <i>Вручную</i>
              </div>
            </div>
          </Reveal>
          <Reveal className="memory-timeline" delay={100}>
            {memories.map((memory, index) => (
              <article
                className={`timeline-item ${activeMemory === index ? "is-active" : ""}`}
                key={memory.date}
                role="button"
                tabIndex={0}
                aria-pressed={activeMemory === index}
                aria-label={`Показать фото: ${memory.title}`}
                onMouseEnter={() => setActiveMemory(index)}
                onFocus={() => setActiveMemory(index)}
                onClick={() => setActiveMemory(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    setActiveMemory(index)
                  }
                }}
              >
                <div className="timeline-marker">
                  <span>{index + 1}</span>
                </div>
                <time dateTime={`${memory.year}-${memory.date.split(".")[1]}-${memory.date.split(".")[0]}`}><span>{memory.date}</span><small aria-label={`${memory.year} год`}>{String(memory.year).split("").map((digit, index) => <span key={index} aria-hidden="true">{digit}</span>)}</small></time>
                <div>
                  <h3>{memory.title}</h3>
                  <p>{memory.detail}</p>
                </div>
              </article>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export function ContentSection() {
  return (
    <section
      className="section content-section"
      id="content"
      aria-labelledby="content-title"
    >
      <div className="container">
        <Reveal className="content-heading">
          <SectionHeader
            eyebrow="Content Studio"
            id="content-title"
            title={
              <>
                Персонаж уже создан.
                <br />
                Теперь дайте ему жизнь.
              </>
            }
          />
          <p>
            Создавайте новые сцены, не объясняя каждый раз, кто ваш персонаж.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <ContentStudioMockup />
        </Reveal>
      </div>
    </section>
  )
}

const cases = [
  {
    title: "Креаторам",
    text: "Виртуальные блогеры и регулярный контент для социальных сетей.",
    visual: <CreatorPhone />,
    className: "usecase-card--creator",
  },
  {
    title: "Брендам",
    text: "Постоянное виртуальное лицо бренда для рекламы и контента.",
    visual: <BrandCampaign />,
    className: "usecase-card--brand",
  },
  {
    title: "Агентствам",
    text: "AI-персонажи клиентов и проектов в одном пространстве.",
    visual: <AgencyGrid />,
    className: "usecase-card--agency",
  },
  {
    title: "Экспертам и предпринимателям",
    text: "Цифровой ведущий для контента о ваших продуктах, услугах и экспертизе.",
    visual: <ExpertPresenter />,
    className: "usecase-card--expert",
  },
]

export function UseCasesSection() {
  return (
    <section
      className="section usecases-section"
      id="audience"
      aria-labelledby="audience-title"
    >
      <div className="container">
        <Reveal>
          <SectionHeader
            align="center"
            eyebrow="Для кого"
            id="audience-title"
            title="Один персонаж — разные задачи."
          />
        </Reveal>
        <div className="usecases-grid">
          {cases.map((item, index) => (
            <Reveal
              className={`usecase-card ${item.className}`}
              delay={index * 70}
              key={item.title}
            >
              <div className="usecase-card__copy">
                <span>0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
              <div className="usecase-card__visual">{item.visual}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function ComparisonSection() {
  return (
    <section className="section table-section" aria-labelledby="table-title">
      <div className="container">
        <Reveal>
          <SectionHeader
            eyebrow="Система, не генератор"
            id="table-title"
            title={
              <>
                Чем Oblik OS отличается
                <br />
                от обычной AI-генерации.
              </>
            }
          />
        </Reveal>
        <Reveal className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Возможность</th>
                <th>Обычная генерация</th>
                <th>
                  <LogoMark className="oblik-mini" /> Oblik OS
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map(([name, ordinary]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>{ordinary}</td>
                  <td>
                    <CheckMark />
                    <span>Встроено</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>
    </section>
  )
}

export function PricingSection() {
  return (
    <section
      className="section pricing-section"
      id="pricing"
      aria-labelledby="pricing-title"
    >
      <div className="container">
        <Reveal>
          <SectionHeader
            align="center"
            eyebrow="Простой старт"
            id="pricing-title"
            title="Начните с первого персонажа."
            description="Выберите пространство, которое растёт вместе с вашей идеей."
          />
        </Reveal>
        <div className="pricing-grid">
          {plans.map((plan, index) => (
            <Reveal
              className={`price-card ${
                plan.popular ? "price-card--popular" : ""
              }`}
              delay={index * 70}
              key={plan.name}
            >
              {plan.popular && (
                <span className="popular-label">Популярный</span>
              )}
              <div className="price-card__top">
                <span>0{index + 1}</span>
                <h3>{plan.name}</h3>
                <strong>{plan.label}</strong>
                <p>{plan.description}</p>
              </div>
              <div className="price-card__price">
                <strong>{plan.price}</strong>
                <span>{plan.period}</span>
              </div>
              <div className="price-divider" />
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check size={15} />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                href="https://app.oblikos.ru/register"
                variant={plan.popular ? "primary" : "secondary"}
                icon
              >
                {plan.button}
              </Button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FaqSection() {
  const [open, setOpen] = useState(0)
  return (
    <section className="section faq-section" aria-labelledby="faq-title">
      <div className="container faq-layout">
        <Reveal className="faq-heading">
          <SectionHeader
            eyebrow="FAQ"
            id="faq-title"
            title={
              <>
                Частые
                <br />
                вопросы
              </>
            }
          />
          <p>Не нашли ответа? Напишите нам — поможем разобраться.</p>
          <Button href="mailto:info@oblikos.ru" variant="secondary">
            Связаться с нами
          </Button>
        </Reveal>
        <Reveal className="faq-list" delay={100}>
          {faqs.map((item, index) => {
            const isOpen = open === index
            return (
              <article
                className={`faq-item ${isOpen ? "is-open" : ""}`}
                key={item.question}
              >
                <button
                  aria-controls={`faq-panel-${index}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : index)}
                  type="button"
                >
                  <span>{item.question}</span>
                  <ChevronDown size={18} />
                </button>
                <div
                  className="faq-answer"
                  id={`faq-panel-${index}`}
                  role="region"
                >
                  <div>
                    <p>{item.answer}</p>
                  </div>
                </div>
              </article>
            )
          })}
        </Reveal>
      </div>
    </section>
  )
}

export function FinalCtaSection() {
  return (
    <section className="section final-section" aria-labelledby="final-title">
      <div className="container">
        <Reveal className="final-card">
          <div className="final-grid" aria-hidden="true" />
          <div className="final-card__copy">
            <Pill tone="violet">Your first identity starts here</Pill>
            <h2 id="final-title">
              Создайте того,
              <br />
              кого ещё не существует.
            </h2>
            <p>
              Внешность. Характер. Память. Голос.
              <br />
              Одна цифровая личность в Oblik OS.
            </p>
            <Button href="https://app.oblikos.ru/register" icon>
              Создать персонажа
            </Button>
          </div>
          <div className="final-story">
            <div className="final-main-portrait">
              <PortraitSlot tone="violet" />
            </div>
            <div className="final-media final-media--one">
              <PortraitSlot compact tone="rose" />
              <span>New story · 9:16</span>
            </div>
            <div className="final-media final-media--two">
              <PortraitSlot compact tone="blue" />
              <span>Campaign · 4:5</span>
            </div>
            <div className="final-memory">
              <MemoryStick size={15} />
              <div>
                <strong>Memory added</strong>
                <span>Started a new project</span>
              </div>
            </div>
            <div className="final-voice">
              <Mic2 size={14} />
              <span>Sofia Voice 01</span>
              <i />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-main">
          <div className="footer-brand">
            <Wordmark />
            <p>Большая история начинается с личности.</p>
          </div>
          <div className="footer-links">
            <div>
              <strong>Продукт</strong>
              <a href="#features">Возможности</a>
              <a href="#how">Как работает</a>
              <a href="#pricing">Тарифы</a>
            </div>
            <div>
              <strong>Возможности</strong>
              <a href="#profile">Профиль</a>
              <a href="#content">Студия контента</a>
              <a href="#features">Ядро персонажа</a>
            </div>
            <div>
              <strong>Компания</strong>
              <a href="mailto:info@oblikos.ru">Контакты</a>
              <a href="/blog">Блог</a>
              <a href="#audience">Для команд</a>
              <a href="#top">О продукте</a>
            </div>
            <div>
              <strong>Документы</strong>
              <a href="#top">Политика конфиденциальности</a>
              <a href="#top">Условия использования</a>
              <button className="cookie-settings" type="button" onClick={() => window.dispatchEvent(new Event('oblikos:analytics-settings'))}>Настройки куки</button>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Oblik OS</span>
          <span>Создано для цифровых личностей</span>
        </div>
      </div>
    </footer>
  )
}
