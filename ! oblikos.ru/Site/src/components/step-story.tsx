import { ArrowUpRight, AudioLines, BatteryFull, Bookmark, Check, ChevronDown, Heart, Home, MessageCircle, Mic2, MoreHorizontal, Plus, Search, Send, Signal, Sparkles, UserRound, Video, Wifi } from "lucide-react"
import { photos } from "../data/photos"
import instagramWordmark from "../assets/instagram-wordmark.svg"

export function StepStory({ stage }: { stage: "idea" | "identity" | "content" }) {
  if (stage === "content") {
    return (
      <div className="step-story step-story--phone">
        <div className="step-phone" role="img" aria-label="Макет iPhone 18 Pro с примером Instagram-ленты Софии">
          <i className="step-phone__side" aria-hidden="true" />
          <div className="step-phone__screen">
            <div className="step-phone__status"><span>9:41</span><i aria-hidden="true" /><div><Signal size={10} fill="currentColor" /><Wifi size={10} /><BatteryFull size={13} /></div></div>
            <div className="step-phone__brand"><img src={instagramWordmark} alt="Instagram" /><ChevronDown size={12} /><Heart size={20} /><Send size={19} /></div>
            <div className="step-phone__stories">{[photos.sofia, photos.lena, photos.alex, photos.mia].map((photo, index) => <div key={photo.src}><span><img src={photo.src} alt="" loading="lazy" />{index === 0 && <i><Plus size={10} strokeWidth={3} /></i>}</span><small>{["Ваша история", "lena.mood", "alex.creative", "mia.studio"][index]}</small></div>)}</div>
            <div className="step-phone__author"><img src={photos.sofia.src} alt="" /><div><strong>sofia.day</strong><small>Москва</small></div><MoreHorizontal size={15} /></div>
            <img className="step-phone__post" src={photos.cafe.src} alt={photos.cafe.alt} loading="lazy" />
            <div className="step-phone__actions"><Heart size={21} /><MessageCircle size={21} /><Send size={20} /><Bookmark size={20} /></div>
            <div className="step-phone__caption"><strong>8 412 отметок «Нравится»</strong><p><b>sofia.day</b> Утро без спешки. Кофе и любимый город ☕</p><small>Посмотреть все комментарии</small></div>
            <div className="step-phone__nav"><Home size={15} /><Search size={15} /><Plus size={15} /><Video size={15} /><img src={photos.sofia.src} alt="" /></div>
            <div className="step-phone__home" />
          </div>
        </div>
      </div>
    )
  }

  if (stage === "idea") {
    return (
      <div className="step-story step-story--badges step-story--idea">
        <div className="idea-orbit idea-orbit--outer" aria-hidden="true" /><div className="idea-orbit idea-orbit--inner" aria-hidden="true" />
        <span className="idea-mini-star" aria-hidden="true">✳</span>
        <div className="idea-core"><Sparkles size={36} strokeWidth={1.3} /><span>Ваша идея</span></div>
        <div className="idea-badge idea-badge--one"><UserRound size={17} /><span>Девушка, 27 лет</span></div>
        <div className="idea-badge idea-badge--two"><span className="badge-dot" />Реализм</div>
        <div className="idea-badge idea-badge--three">Веснушки <Sparkles size={14} /></div>
        <div className="idea-badge idea-badge--four">Любит архитектуру <ArrowUpRight size={14} /></div>
        <div className="badge-stage-caption"><span>Всё начинается с идеи</span><strong>Придумайте кого угодно.</strong></div>
      </div>
    )
  }

  return (
    <div className="step-story step-story--badges step-story--identity">
      <span className="identity-kicker">ЛИЧНОСТЬ В ДЕТАЛЯХ</span>
      <div className="identity-badge identity-badge--traits"><span className="identity-badge-icon"><Sparkles size={19} /></span><div><small>Характер</small><strong>Творческая натура</strong></div><span className="identity-check"><Check size={12} /></span></div>
      <div className="identity-tags"><span>Любознательная</span><span>Независимая</span></div>
      <div className="identity-badge identity-badge--voice"><span className="identity-badge-icon"><Mic2 size={20} /></span><div><small>Голос</small><strong>Мягкий и спокойный</strong></div><AudioLines size={28} strokeWidth={1.4} /></div>
      <div className="identity-badge identity-badge--memory"><span className="identity-badge-icon"><Heart size={19} /></span><div><small>Память и привычки</small><strong>Утро начинается с кофе</strong></div></div>
      <div className="badge-stage-caption"><span>Больше, чем внешность</span><strong>Добавьте индивидуальность.</strong></div>
    </div>
  )
}
