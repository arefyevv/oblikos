import { Play } from "lucide-react"
import { scenePhotos } from "../data/photos"

const shapeClasses = {
  tall: "media-slot--tall",
  wide: "media-slot--wide",
  square: "media-slot--square",
}

type Tone = "violet" | "blue" | "rose" | "sand" | "aqua" | "peach"

export function PortraitSlot({
  className = "",
  compact = false,
  label = "SOFIA",
  idLabel = "ID–01",
  showMeta = true,
  tone = "violet",
  src,
  alt,
}: {
  className?: string
  compact?: boolean
  label?: string
  idLabel?: string
  showMeta?: boolean
  tone?: Tone
  src?: string
  alt?: string
}) {
  return (
    <div
      className={`portrait-slot portrait-slot--${tone} ${
        compact ? "portrait-slot--compact" : ""
      } ${className}`}
    >
      <img className="portrait-photo" src={src ?? scenePhotos[tone].src} alt={alt ?? scenePhotos[tone].alt} loading="lazy" decoding="async" />
      {showMeta && <div className="portrait-meta">
        <span>{label}</span>
        <span>{idLabel}</span>
      </div>}
    </div>
  )
}

export function MediaSlot({
  label,
  context,
  tone,
  shape,
  video = false,
}: {
  label: string
  context: string
  tone: string
  shape: keyof typeof shapeClasses
  video?: boolean
}) {
  return (
    <article
      className={`media-slot ${shapeClasses[shape]} media-slot--${tone}`}
    >
      <div className="media-slot__visual">
        <PortraitSlot compact tone={tone as Tone} />
        {video && (
          <span className="media-slot__play">
            <Play fill="currentColor" size={13} />
          </span>
        )}
      </div>
      <div className="media-slot__caption">
        <div>
          <strong>{label}</strong>
          <span>{context}</span>
        </div>
        <span className="identity-chip">SOFIA / 96%</span>
      </div>
    </article>
  )
}
