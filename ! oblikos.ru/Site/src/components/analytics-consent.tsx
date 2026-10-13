import { useEffect, useState } from 'react'

const consentKey = 'oblikos.analytics-consent.v1'
const counter = 113390575
type Metrica = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number }
declare global {
  interface Window { ym?: Metrica }
}

function startAnalytics() {
  if (document.getElementById('oblikos-metrica')) return
  window.ym ??= Object.assign((...args: unknown[]) => {
    ;(window.ym!.a ??= []).push(args)
  }, { l: Date.now() })
  const script = document.createElement('script')
  script.id = 'oblikos-metrica'
  script.async = true
  script.src = 'https://mc.yandex.ru/metrika/tag.js'
  document.head.appendChild(script)
  window.ym(counter, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true })
}

function readConsent() {
  try { return localStorage.getItem(consentKey) } catch { return null }
}

function clearAnalyticsStorage() {
  for (const item of document.cookie.split(';')) {
    const name = item.trim().split('=')[0]
    if (!name.startsWith('_ym_')) continue
    for (const domain of ['', `; domain=${location.hostname}`, '; domain=.oblikos.ru']) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax; Secure`
    }
  }
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('_ym') || key.startsWith(`ym${counter}`)) localStorage.removeItem(key)
    }
  } catch { /* Browser storage may be unavailable. */ }
}

export function AnalyticsConsent() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const consent = readConsent()
    if (consent === 'allowed') startAnalytics()
    else if (consent !== 'denied') setOpen(true)
    const reopen = () => setOpen(true)
    window.addEventListener('oblikos:analytics-settings', reopen)
    return () => window.removeEventListener('oblikos:analytics-settings', reopen)
  }, [])

  function choose(allowed: boolean) {
    const hadAnalytics = Boolean(document.getElementById('oblikos-metrica'))
    try { localStorage.setItem(consentKey, allowed ? 'allowed' : 'denied') } catch { /* Choice applies to this visit. */ }
    setOpen(false)
    if (allowed) startAnalytics()
    else {
      clearAnalyticsStorage()
      // A fresh document stops already-running analytics after withdrawal.
      if (hadAnalytics) location.reload()
    }
  }

  if (!open) return null
  return (
    <aside className="analytics-consent" aria-label="Выбор аналитических cookie">
      <strong>Cookie и аналитика</strong>
      <p>С разрешения Яндекс Метрика использует cookie и записывает действия на сайте для анализа посещаемости.</p>
      <p>Изменить выбор можно внизу страницы. <a href="https://yandex.ru/legal/metrica_termsofuse/ru/" target="_blank" rel="noopener noreferrer">Подробнее</a></p>
      <div className="analytics-consent__actions">
        <button className="button button--secondary" type="button" onClick={() => choose(false)}>Только необходимые</button>
        <button className="button button--primary" type="button" onClick={() => choose(true)}>Разрешить аналитику</button>
      </div>
    </aside>
  )
}
