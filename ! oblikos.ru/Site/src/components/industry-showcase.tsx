import { useEffect, useRef, useState } from "react"
import { Play } from "lucide-react"
import { photos } from "../data/photos"
import { Reveal, SectionHeader } from "./ui"

// Replace posters with final media; add videoSrc to video cards when ready.
type IndustryMedia = {
  industry: string
  poster: string
  alt: string
  kind?: "photo" | "video"
  videoSrc?: string
}

const industryMedia: IndustryMedia[] = [
  {
    industry: "Мода",
    kind: "video",
    poster: photos.memoryFashion.src,
    alt: photos.memoryFashion.alt,
  },
  { industry: "Красота", poster: photos.mia.src, alt: photos.mia.alt },
  {
    industry: "Образование",
    kind: "video",
    poster: photos.office.src,
    alt: photos.office.alt,
  },
  { industry: "Недвижимость", poster: photos.alex.src, alt: photos.alex.alt },
  { industry: "Рестораны", poster: photos.cafe.src, alt: photos.cafe.alt },
  {
    industry: "Фитнес",
    kind: "video",
    poster: photos.memoryRunning.src,
    alt: photos.memoryRunning.alt,
  },
  { industry: "Путешествия", poster: photos.coast.src, alt: photos.coast.alt },
  {
    industry: "Лайфстайл",
    kind: "video",
    poster: photos.aya.src,
    alt: photos.aya.alt,
  },
]

function IndustryCard({
  media,
  duplicate,
}: {
  media: IndustryMedia
  duplicate: boolean
}) {
  const [requested, setRequested] = useState(false)
  const isVideo = media.kind === "video" || Boolean(media.videoSrc)
  return (
    <figure className="industry-card">
      {media.videoSrc && requested ? (
        <video
          src={media.videoSrc}
          poster={media.poster}
          autoPlay
          controls
          playsInline
          preload="metadata"
          aria-label={media.alt}
          tabIndex={duplicate ? -1 : 0}
        />
      ) : (
        <img
          src={media.poster}
          alt={duplicate ? "" : media.alt}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      )}
      {isVideo && !(media.videoSrc && requested) && (
        <>
          <span className="industry-media-label">Видео</span>
          <button
            type="button"
            className="industry-play"
            aria-label={
              media.videoSrc
                ? `Воспроизвести видео: ${media.industry}`
                : `Видео: ${media.industry}, скоро появится`
            }
            tabIndex={duplicate ? -1 : 0}
            onClick={() => setRequested(true)}
          >
            <Play
              size={24}
              fill="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
          {requested && !media.videoSrc && (
            <span className="industry-video-notice" role="status">
              Видео скоро появится
            </span>
          )}
        </>
      )}
      <figcaption>{media.industry}</figcaption>
    </figure>
  )
}

export default function IndustryShowcase() {
  const viewport = useRef<HTMLDivElement>(null)
  const [interacting, setInteracting] = useState(false)

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (interacting) return
    let visible = false
    let previous = 0
    let frame = 0
    let position = element.scrollLeft
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    observer.observe(element)
    const advance = (time: number) => {
      if (previous && visible && !preference.matches) {
        const group = element.firstElementChild
          ?.firstElementChild as HTMLElement | null
        if (group) {
          const distance = group.getBoundingClientRect().width
          position =
            (position + Math.min(time - previous, 50) * 0.028) % distance
          element.scrollLeft = position
        }
      }
      previous = time
      frame = window.requestAnimationFrame(advance)
    }
    frame = window.requestAnimationFrame(advance)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [interacting])

  return (
    <section
      className="section industry-section"
      id="examples"
      aria-labelledby="industry-title"
    >
      <div className="container">
        <Reveal>
          <SectionHeader
            align="center"
            eyebrow="Возможности контента"
            id="industry-title"
            title="Ваш персонаж. В любой отрасли."
            description="Фото и видео для брендов, рекламы и социальных сетей."
          />
        </Reveal>
      </div>
      <div
        ref={viewport}
        className="industry-viewport"
        tabIndex={0}
        role="region"
        aria-label="Примеры контента по отраслям, прокручивайте горизонтально"
        onMouseEnter={() => setInteracting(true)}
        onMouseLeave={() => setInteracting(false)}
        onFocus={() => setInteracting(true)}
        onBlur={() => setInteracting(false)}
        onTouchStart={() => setInteracting(true)}
        onTouchEnd={() => setInteracting(false)}
        onTouchCancel={() => setInteracting(false)}
      >
        <div className="industry-track">
          {[false, true].map((duplicate) => (
            <div
              className="industry-group"
              key={String(duplicate)}
              aria-hidden={duplicate || undefined}
            >
              {industryMedia.map((media) => (
                <IndustryCard
                  media={media}
                  duplicate={duplicate}
                  key={media.industry}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
