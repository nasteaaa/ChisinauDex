import { useSyncExternalStore } from 'react'

// Per-browser preferences kept in localStorage: role, cookie consent, accessibility, address.
// Every read/write is guarded: storage can be unavailable (private mode, blocked site data).

export type Role = 'citizen' | 'employee'
export type Consent = { analytics: boolean; decidedAt: string }

export interface A11y {
  size: '100' | '115' | '130' | '150'
  contrast: 'normal' | 'high'
  cb: 'none' | 'safe' | 'mono'
  font: 'default' | 'readable'
  spacing: 'normal' | 'wide'
  links: 'default' | 'underline'
}

export interface Prefs {
  role: Role
  consent: Consent | null
  a11y: A11y
  address: string | null
  /** The address is written to storage only when the user ticks "remember the address". */
  rememberAddress: boolean
  /** Answer to our own "fill the address from your location?" question (asked once, before the browser prompt). */
  locationPrompt: 'unset' | 'accepted' | 'dismissed'
}

export const DEFAULT_A11Y: A11y = { size: '100', contrast: 'normal', cb: 'none', font: 'default', spacing: 'normal', links: 'default' }
const KEY = 'chisinaudex.prefs.v1'

function load(): Prefs {
  const base: Prefs = { role: 'citizen', consent: null, a11y: DEFAULT_A11Y, address: null, rememberAddress: false, locationPrompt: 'unset' }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const p = JSON.parse(raw) as Partial<Prefs>
    return { ...base, ...p, role: p.role ?? 'citizen', a11y: { ...DEFAULT_A11Y, ...p.a11y } }
  } catch {
    return base
  }
}

let state = load()
const listeners = new Set<() => void>()

export function setPrefs(patch: Partial<Prefs>) {
  state = { ...state, ...patch }
  try {
    const stored = state.rememberAddress ? state : { ...state, address: null }
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch { /* storage unavailable: keep in memory */ }
  applyA11y(state.a11y)
  listeners.forEach((l) => l())
}

export function getPrefs() {
  return state
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => state
  )
}

// The readable font is only needed by people who switch it on, so it is not part of the first page load.
function loadReadableFont() {
  if (document.getElementById('font-readable')) return
  const link = Object.assign(document.createElement('link'), {
    id: 'font-readable',
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap&subset=latin-ext'
  })
  document.head.appendChild(link)
}

export function applyA11y(a: A11y) {
  if (a.font === 'readable') loadReadableFont()
  const el = document.documentElement
  el.dataset.size = a.size
  el.dataset.contrast = a.contrast
  el.dataset.cb = a.cb
  el.dataset.font = a.font
  el.dataset.spacing = a.spacing
  el.dataset.links = a.links
  // Motion follows the operating system's "reduce motion" setting.
  el.dataset.motion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'auto'
}


applyA11y(state.a11y)
