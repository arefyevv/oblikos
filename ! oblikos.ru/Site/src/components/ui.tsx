import type { ButtonHTMLAttributes, ReactNode } from "react"
import { ArrowUpRight } from "lucide-react"
import fullLogo from "../assets/oblik-os-logo.svg"
import logoMark from "../assets/oblik-os-mark.svg"
import { useReveal } from "../hooks/use-reveal"

type ButtonProps = {
  children: ReactNode
  href?: string
  variant?: "primary" | "secondary" | "ghost"
  className?: string
  icon?: boolean
  onClick?: () => void
}

export function Button({
  children,
  href,
  variant = "primary",
  className = "",
  icon = false,
  onClick,
}: ButtonProps) {
  const classes = `button button--${variant} ${className}`
  if (href) {
    return (
      <a className={classes} href={href} onClick={onClick}>
        <span>{children}</span>
        {icon && (
          <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.8} />
        )}
      </a>
    )
  }
  return (
    <button className={classes} type="button" onClick={onClick}>
      <span>{children}</span>
      {icon && <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.8} />}
    </button>
  )
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
}) {
  return (
    <button
      aria-label={label}
      className={`icon-button ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <a
      className={`wordmark ${light ? "wordmark--light" : ""}`}
      href="#top"
      aria-label="Oblik OS, на главную"
    >
      <img src={fullLogo} alt="Oblik OS" />
    </a>
  )
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <img
      className={`logo-mark ${className}`}
      src={logoMark}
      alt=""
      aria-hidden="true"
    />
  )
}

export function Pill({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode
  tone?: "neutral" | "violet" | "success"
  dot?: boolean
}) {
  return (
    <span className={`pill pill--${tone}`}>
      {dot && <span className="pill__dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  id,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  align?: "left" | "center"
  id?: string
}) {
  return (
    <div className={`section-header section-header--${align}`}>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 id={id}>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  )
}

export function ProductWindow({
  children,
  className = "",
  label = "Oblik OS",
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <div className={`product-window ${className}`}>
      <div className="product-window__chrome">
        <div className="window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span>{label}</span>
        <span className="chrome-status">Secure profile</span>
      </div>
      {children}
    </div>
  )
}

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const { ref, visible } = useReveal<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

export function CheckMark() {
  return (
    <span className="check-mark" aria-label="Доступно">
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="m3 8.2 3.1 3.1L13 4.8" />
      </svg>
    </span>
  )
}
