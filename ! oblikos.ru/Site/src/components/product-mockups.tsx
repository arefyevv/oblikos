import { useEffect, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  PanelLeft,
  RotateCw,
  Share,
  Copy,
  ChevronDown,
  CircleUserRound,
  Clock3,
  LayoutGrid,
  Library,
  MemoryStick,
  Mic2,
  MoreHorizontal,
  Play,
  Square,
  Plus,
  Send,
  Heart,
  MessageCircle,
  Bookmark,
  Signal,
  Wifi,
  BatteryFull,
  Sparkles,
  WandSparkles,
} from "lucide-react"
import { PortraitSlot } from "./portrait-slot"
import { LogoMark, Pill, ProductWindow } from "./ui"
import { photos } from "../data/photos"
import sofiaCutout from "../assets/hero/sofia-cutout.webp"
import characterProfileScreenshot from "../assets/screenshots/character-profile-current.jpg"
import contentStudioScreenshot from "../assets/screenshots/content-studio-current.jpg"

export function CharacterCoreVisual() {
  const [trait, setTrait] = useState("Спокойный")
  const [playing, setPlaying] = useState(false)
  const [voiceError, setVoiceError] = useState("")
  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel()
  }, [])
  const playVoice = () => {
    if (!("speechSynthesis" in window)) {
      setVoiceError("Прослушивание недоступно в этом браузере")
      return
    }
    if (playing) {
      window.speechSynthesis.cancel()
      setPlaying(false)
      return
    }
    const speech = new SpeechSynthesisUtterance("Привет, я София. У меня есть свой голос, характер и память. Давай создадим что-нибудь вместе.")
    speech.lang = "ru-RU"
    speech.rate = 0.9
    speech.onend = () => setPlaying(false)
    speech.onerror = () => {
      setPlaying(false)
      setVoiceError("Не удалось воспроизвести голос")
    }
    setVoiceError("")
    window.speechSynthesis.speak(speech)
    setPlaying(true)
  }
  return (
    <div className="character-core sofia-core">
      <svg
        className="core-connectors"
        aria-hidden="true"
        viewBox="0 0 760 620"
        preserveAspectRatio="none"
      >
        <path d="M380 305C250 305 218 126 112 126" />
        <path d="M380 305C512 305 544 106 654 106" />
        <path d="M380 305C218 305 204 474 80 474" />
        <path d="M380 305C544 305 550 452 678 452" />
      </svg>
      <div className="core-orbit" aria-hidden="true" />
      <div className="core-center">
        <div className="sofia-photo">
          <img src={sofiaCutout} alt="София — русская девушка с веснушками, каштановыми волосами и серо-зелёными глазами" fetchPriority="high" />
        </div>
      </div>
      <article className="sofia-module sofia-module--appearance">
        <h3><CircleUserRound size={17} /> Внешность</h3>
        <p>Облик, который выбираете вы</p>
        <div className="sofia-details"><span>Веснушки</span><span>Серо-зелёные глаза</span><span>Естественный стиль</span></div>
      </article>
      <article className="sofia-module sofia-module--voice">
        <h3><Mic2 size={17} /> Голос</h3>
        <p>Своя манера речи</p>
        <div className={`sofia-audio ${playing ? "is-playing" : ""}`}>
          <div className="sofia-wave" aria-hidden="true">{Array.from({ length: 27 }, (_, index) => <i key={index} />)}</div>
          <button type="button" onClick={playVoice} aria-label={playing ? "Остановить голос Sofia" : "Послушать голос Sofia"} aria-pressed={playing}>{playing ? <Square size={12} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
        </div>
        <small aria-live="polite">{voiceError || (playing ? "Sofia говорит…" : "Демо · синтез речи браузера")}</small>
      </article>
      <article className="sofia-module sofia-module--personality">
        <h3><Sparkles size={17} /> Характер</h3>
        <p>Спокойный, дерзкий или заботливый</p>
        <div className="sofia-traits" role="group" aria-label="Черта характера">{["Спокойный", "Дерзкий", "Заботливый"].map((item) => <button type="button" key={item} aria-pressed={trait === item} onClick={() => setTrait(item)}><span>{item}</span><i aria-hidden="true" /></button>)}</div>
      </article>
      <article className="sofia-module sofia-module--memory">
        <h3><MemoryStick size={17} /> Память</h3>
        <p>Помнит свои привычки и важные моменты</p>
        <div className="sofia-memory"><Clock3 size={14} /><span>Любит утренний кофе<br /><small>Привычка сохранена</small></span></div>
      </article>
    </div>
  )
}

const moduleData = [
  {
    label: "Appearance",
    ru: "Внешность",
    value: "Веснушки · Серо-зелёные глаза",
    icon: CircleUserRound,
  },
  { label: "Personality", ru: "Личность", value: "Творческая · Независимая", icon: Sparkles },
  { label: "Memory", ru: "Память", value: "Любит утренний кофе", icon: MemoryStick },
  { label: "Voice", ru: "Голос", value: "Мягкий и спокойный", icon: Mic2 },
  { label: "Content", ru: "Контент", value: "12 фото · 3 видео", icon: WandSparkles },
  { label: "Media", ru: "Медиатека", value: "Её истории — в одном месте", icon: Library },
]

export function OblikCoreMap() {
  const [playing, setPlaying] = useState(false)
  const [voiceError, setVoiceError] = useState("")
  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel()
  }, [])
  const playVoice = () => {
    if (!("speechSynthesis" in window)) {
      setVoiceError("Прослушивание недоступно")
      return
    }
    window.speechSynthesis.cancel()
    if (playing) { setPlaying(false); return }
    const speech = new SpeechSynthesisUtterance("Привет, я София. Люблю утренний кофе, архитектуру и прогулки по Москве.")
    speech.lang = "ru-RU"
    speech.rate = 0.9
    speech.onend = () => setPlaying(false)
    speech.onerror = () => { setPlaying(false); setVoiceError("Не удалось воспроизвести голос") }
    setVoiceError("")
    setPlaying(true)
    window.speechSynthesis.speak(speech)
  }
  return (
    <div className="oblik-map">
      <div className="map-grid" aria-hidden="true" />
      <svg
        className="map-lines"
        aria-hidden="true"
        viewBox="0 0 1100 580"
        preserveAspectRatio="none"
      >
        <path d="M550 290C370 290 390 110 230 110M550 290C730 290 710 110 870 110M550 290H230M550 290H870M550 290C370 290 390 470 230 470M550 290C730 290 710 470 870 470" />
      </svg>
      <div className="map-core">
        <img src={photos.sofia.src} alt={photos.sofia.alt} loading="lazy" />
        <div className="map-core__identity"><span>Единый профиль персонажа</span><strong>София</strong><small>27 лет · Москва</small></div>
      </div>
      {moduleData.map(({ label, ru, value, icon: Icon }, index) => (
        <article className={`map-module map-module--${index + 1}`} key={label}>
          <span className="map-module__icon">
            <Icon size={18} strokeWidth={1.7} />
          </span>
          <div>
            <span>{label}</span>
            <strong>{ru}</strong>
          </div>
          <small>{value}</small>
          {label === "Appearance" && <div className="map-example-tags"><span>Естественный стиль</span></div>}
          {label === "Personality" && <div className="map-example-tags"><span>Любознательная</span></div>}
          {label === "Memory" && <div className="map-memory-note"><Clock3 size={12} /><span>Привычка сохранена</span></div>}
          {label === "Voice" && <div className="map-voice-preview"><div className={`sofia-audio ${playing ? "is-playing" : ""}`}><div className="sofia-wave" aria-hidden="true">{Array.from({ length: 22 }, (_, index) => <i key={index} />)}</div><button type="button" onClick={playVoice} aria-label={playing ? "Остановить демо голоса Софии" : "Послушать демо голоса Софии"} aria-pressed={playing}>{playing ? <Square size={10} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</button></div><span className="map-voice-status" aria-live="polite">{voiceError || (playing ? "София говорит…" : "Демо голоса")}</span></div>}
          {label === "Content" && <div className="map-content-types"><span><LayoutGrid size={12} />Фото</span><span><Play size={11} />Видео</span><span><WandSparkles size={12} />Тексты</span></div>}
          {label === "Media" && <div className="map-media-preview">{[photos.cafe, photos.city, photos.office].map(photo => <img src={photo.src} alt={photo.alt} loading="lazy" key={photo.src} />)}</div>}
        </article>
      ))}
    </div>
  )
}

export function CreatorMockup() {
  return (
    <ProductWindow
      label="Character Creator"
      className="step-mockup creator-mockup"
    >
      <div className="creator-layout">
        <div className="creator-fields">
          <div className="mock-field mock-field--wide">
            <span>Name</span>
            <strong>Sofia</strong>
          </div>
          <div className="mock-field">
            <span>Gender</span>
            <strong>Female</strong>
          </div>
          <div className="mock-field">
            <span>Age</span>
            <strong>27</strong>
          </div>
          <div className="mock-field mock-field--wide">
            <span>Appearance</span>
            <strong>Natural · European · Soft features</strong>
          </div>
          <div className="style-picker">
            <span>Visual style</span>
            <div>
              <Pill tone="violet">Editorial</Pill>
              <Pill>Natural</Pill>
              <Pill>Minimal</Pill>
            </div>
          </div>
        </div>
        <PortraitSlot compact className="creator-portrait" />
      </div>
    </ProductWindow>
  )
}

export function PersonalityMockup() {
  const traits = ["Creative", "Confident", "Calm", "Funny"]
  return (
    <ProductWindow
      label="Identity Settings"
      className="step-mockup personality-mockup"
    >
      <div className="personality-panel">
        <div className="mock-section-title">
          <div>
            <span>PERSONALITY</span>
            <strong>Core traits</strong>
          </div>
          <Plus size={17} />
        </div>
        <div className="trait-grid">
          {traits.map((trait, index) => (
            <div className="trait-control" key={trait}>
              <span>{trait}</span>
              <div className="trait-track">
                <span style={{ width: `${88 - index * 9}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="bio-panel">
          <span>BIOGRAPHY</span>
          <p>
            Sofia is an independent creative based in Moscow. She finds
            inspiration in architecture, fashion, and slow mornings.
          </p>
          <small>142 characters</small>
        </div>
      </div>
    </ProductWindow>
  )
}

export function GenerateMockup() {
  return (
    <ProductWindow
      label="Quick Generate"
      className="step-mockup generate-mockup"
    >
      <div className="quick-prompt">
        <Sparkles size={16} />
        <span>Morning coffee in a minimalist apartment...</span>
        <button type="button" aria-label="Создать">
          <Send size={15} />
        </button>
      </div>
      <div className="quick-results">
        {(["violet", "blue", "rose"] as const).map((tone, index) => (
          <div className="quick-result" key={tone}>
            <PortraitSlot compact tone={tone} />
            <span>0{index + 1}</span>
          </div>
        ))}
      </div>
      <div className="generation-status">
        <span className="status-dot" />
        Identity locked
        <strong>96%</strong>
      </div>
    </ProductWindow>
  )
}

export function CharacterProfileMockup() {
  return <SafariScreenshot src={characterProfileScreenshot} alt="Реальный интерфейс Oblik OS: профиль Дарьи с идентичностью, внешностью, личностью и голосом." />
}

function SafariScreenshot({ src, alt, width = 1110, height = 740 }: { src: string; alt: string; width?: number; height?: number }) {
  return (
    <div className="safari-window">
      <div className="safari-window__toolbar" aria-hidden="true">
        <div className="safari-window__controls">
          <div className="safari-window__lights"><span /><span /><span /></div>
          <PanelLeft size={17} />
          <div className="safari-window__navigation"><ChevronLeft size={17} /><ChevronRight size={17} /></div>
        </div>
        <div className="safari-window__address"><LockKeyhole size={11} /><span>app.oblikos.ru</span><RotateCw size={12} /></div>
        <div className="safari-window__tools"><Share size={17} /><Plus size={18} /><Copy size={16} /></div>
      </div>
      <img className="safari-window__screenshot" src={src} width={width} height={height} loading="lazy" decoding="async" alt={alt} />
    </div>
  )
}

export function ContentStudioMockup() {
  return (
    <div className="studio-window">
      <SafariScreenshot src={contentStudioScreenshot} width={1125} height={970} alt="Реальный интерфейс Oblik OS: Content Studio, создание изображения Дарьи с выбором формата и описанием сцены." />
    </div>
  )
}
export function CreatorPhone() {
  return (
    <div className="usecase-phone" role="img" aria-label="Мокап iPhone 18 Pro: вымышленный Instagram-профиль Софии с публикацией на русском языке">
      <i className="iphone-button iphone-button--action" aria-hidden="true" />
      <i className="iphone-button iphone-button--volume" aria-hidden="true" />
      <i className="iphone-button iphone-button--power" aria-hidden="true" />
      <div className="iphone-screen">
        <div className="phone-bar" aria-hidden="true">
          <span>9:41</span>
          <i className="iphone-island" />
          <div><Signal size={10} fill="currentColor" /><Wifi size={10} /><BatteryFull size={14} /></div>
        </div>
        <div className="social-head">
          <img src={photos.sofia.src} alt="" className="instagram-avatar" loading="lazy" />
          <div><strong>sofia.day</strong><small>Москва</small></div>
          <MoreHorizontal size={16} />
        </div>
        <img className="instagram-post-photo" src={photos.cafe.src} alt="София с чашкой кофе в московской кофейне" loading="lazy" />
        <div className="social-actions" aria-hidden="true">
          <Heart size={18} /><MessageCircle size={18} /><Send size={17} /><Bookmark size={17} />
        </div>
        <strong className="social-likes">8 412 отметок «Нравится»</strong>
        <p><strong>sofia.day</strong> Утро без спешки. Любимая кофейня, тёплый кофе и немного времени для себя ☕</p>
      </div>
    </div>
  )
}

export function BrandCampaign() {
  return (
    <div className="brand-campaign">
      <PortraitSlot tone="peach" />
      <div className="brand-copy">
        <span>OBLIK / SKIN</span>
        <strong>
          YOUR DAILY
          <br />
          RITUAL
        </strong>
        <small>Campaign 01 · Sofia</small>
      </div>
      <div className="brand-product">01</div>
    </div>
  )
}

export function AgencyGrid() {
  const tones = ["violet", "blue", "rose", "sand", "aqua", "peach"] as const
  const characters = [photos.sofia, photos.mia, photos.alex, photos.lena, photos.noah, photos.aya]
  return (
    <div className="agency-panel">
      <div className="agency-top">
        <div>
          <LayoutGrid size={15} />
          <strong>Characters</strong>
        </div>
        <Pill>8 active</Pill>
      </div>
      <div className="agency-grid">
        {tones.map((tone, index) => (
          <div className="agency-character" key={tone}>
            <PortraitSlot
              compact
              tone={tone}
              label={index === 0 ? "SOFIA" : `ID–0${index + 2}`}
              {...characters[index]}
            />
            <span>
              {["Sofia", "Mia", "Alex", "Lena", "Noah", "Aya"][index]}
            </span>
            <small>{index === 0 ? "96%" : `${89 + index}%`} stable</small>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ExpertPresenter() {
  return (
    <div className="expert-presenter">
      <img src={photos.office.src} alt="Цифровая ведущая в рабочей студии" loading="lazy" />
      <span className="expert-presenter__play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
      <span className="expert-presenter__caption">Ваш голос. Ваши идеи.</span>
    </div>
  )
}
