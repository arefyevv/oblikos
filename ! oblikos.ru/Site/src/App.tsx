import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react"
import {
  ComparisonSection,
  ContentSection,
  CoreSection,
  FaqSection,
  FinalCtaSection,
  Footer,
  GallerySection,
  HeroSection,
  HowSection,
  MemorySection,
  PricingSection,
  ProfileSection,
  UseCasesSection,
} from "./components/sections"
import { Button, IconButton, Wordmark } from "./components/ui"
import { navItems } from "./data/content"
import { AnalyticsConsent } from "./components/analytics-consent"
import IndustryShowcase from "./components/industry-showcase"

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.classList.remove("menu-open")
      window.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="container site-header__inner">
        <Wordmark />
        <nav className="desktop-nav" aria-label="Основная навигация">
          {navItems.map((item) => (
            <a href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <a className="login-link" href="https://app.oblikos.ru/login">
            Войти
          </a>
          <Button href="https://app.oblikos.ru/register" className="header-cta">
            Создать персонажа
          </Button>
          <IconButton
            aria-expanded={menuOpen}
            className="menu-toggle"
            label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </IconButton>
        </div>
      </div>
      <div className={`mobile-menu ${menuOpen ? "is-open" : ""}`}>
        <nav aria-label="Мобильная навигация">
          {navItems.map((item, index) => (
            <a
              href={item.href}
              key={item.href}
              onClick={() => setMenuOpen(false)}
            >
              <span>0{index + 1}</span>
              {item.label}
            </a>
          ))}
          <a href="https://app.oblikos.ru/login" onClick={() => setMenuOpen(false)}>
            Войти
          </a>
        </nav>
        <Button href="https://app.oblikos.ru/register" onClick={() => setMenuOpen(false)}>
          Создать персонажа
        </Button>
      </div>
    </header>
  )
}

export default function App() {
  return (
    <>
      <Header />
      <main>
        <HeroSection />
        <GallerySection />
        <CoreSection />
        <HowSection />
        <ProfileSection />
        <MemorySection />
        <ContentSection />
        <IndustryShowcase />
        <UseCasesSection />
        <ComparisonSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
      <AnalyticsConsent />
    </>
  )
}
