import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { languages } from '@/i18n'
import { trackPageView } from '@/lib/analytics'
import { setPrefs, usePrefs, type Role } from '@/lib/prefs'
import { cn } from '@/lib/utils'
import { A11yPanel } from './A11yPanel'
import { CookieBanner } from './CookieBanner'
import { Footer } from './Footer'

function RoleMenu() {
  const { t } = useTranslation()
  const { role } = usePrefs()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  const pick = (r: Role) => {
    setPrefs({ role: r })
    setOpen(false)
    navigate(r === 'employee' ? '/panou' : '/')
  }
  const options: [Role, string, string][] = [
    ['citizen', t('role.citizen'), t('role.citizenDesc')],
    ['employee', t('role.employeeFull'), t('role.employeeDesc')]
  ]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex min-h-8 items-center gap-1.5 rounded-md border border-rule-strong bg-surface px-2.5 text-[13px]"
      >
        <span className="text-subtle">{t('nav.profile')}:</span>
        <span className="font-semibold">{role === 'employee' ? t('role.employee') : t('role.citizen')}</span>
        <svg width="10" height="7" viewBox="0 0 12 8" aria-hidden="true" className={cn('transition-transform', open && 'rotate-180')}><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      {open && (
        <div role="menu" aria-label={t('role.title')} className="animate-pop absolute left-0 top-[calc(100%+6px)] z-30 flex w-[300px] origin-top flex-col gap-1 rounded-md border border-rule-strong bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.14)]">
          {options.map(([r, label, desc]) => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={role === r}
              onClick={() => pick(r)}
              className={cn('flex flex-col gap-0.5 rounded border px-3 py-2.5 text-left hover:bg-[#eee2c8]', role === r ? 'border-brand bg-panel' : 'border-transparent')}
            >
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs leading-snug text-subtle">{desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Layout() {
  const { t, i18n } = useTranslation()
  const prefs = usePrefs()
  const location = useLocation()
  const [cookieOpen, setCookieOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const isEmp = prefs.role === 'employee'

  useEffect(() => { trackPageView(location.pathname) }, [location.pathname, prefs.consent])

  // The mobile menu closes when a page is chosen or on Escape.
  const [lastPath, setLastPath] = useState(location.pathname)
  if (lastPath !== location.pathname) { setLastPath(location.pathname); setMenuOpen(false) }
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const tabs: [string, string][] = [
    ['/', t('nav.assistant')],
    ['/documente', t('nav.documents')],
    ...(isEmp ? ([['/panou', t('nav.dashboard')]] as [string, string][]) : []),
    ['/despre', t('nav.about')]
  ]

  const tabLinks = (mobile: boolean) => tabs.map(([to, label]) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      className={({ isActive }) => cn(
        'font-semibold no-underline',
        mobile ? 'block rounded px-3 py-3 text-base' : 'px-3 py-2.5 text-[15px]',
        isActive
          ? (mobile ? 'bg-panel text-ink hover:text-ink' : 'text-ink shadow-[inset_0_-3px_0_var(--brand)] hover:text-ink')
          : 'text-subtle hover:text-ink'
      )}
    >
      {label}
    </NavLink>
  ))

  const langSwitch = (
    <div role="group" aria-label="Limba / Язык / Language" className="flex gap-0.5">
      {languages.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={i18n.resolvedLanguage === l}
          onClick={() => i18n.changeLanguage(l)}
          className={cn('min-h-8 min-w-[38px] rounded-[3px] border px-2 text-xs font-bold', i18n.resolvedLanguage === l ? 'border-brand bg-brand text-white' : 'border-rule-strong bg-surface text-ink')}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink">
      <header data-noprint="">
        <a href="#main" className="sr-only-focusable fixed left-4 top-2 z-[70] border-2 border-brand bg-surface px-3.5 py-2 font-semibold text-brand">{t('nav.skip')}</a>
        <div className="h-[3px] bg-gold" />
        <div className="border-b border-rule bg-surface">
          <div className="mx-auto flex max-w-[1240px] items-center gap-5 px-[clamp(16px,4vw,32px)] py-3">
            <Link to="/" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink">
              <span aria-hidden="true" className="relative grid size-9 flex-none place-items-center rounded-lg bg-brand">
                <span className="text-[17px] font-extrabold text-paper">C</span>
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-[1.5px] border-surface bg-gold" />
              </span>
              <span className="text-[19px] font-bold tracking-[-0.01em]">{t('app.title')}</span>
            </Link>

            {/* Desktop: everything inline. */}
            <div className="hidden min-[950px]:block"><RoleMenu /></div>
            <nav aria-label={t('nav.main')} className="ml-auto hidden items-center gap-4.5 min-[950px]:flex">
              <div className="flex flex-wrap gap-1">{tabLinks(false)}</div>
              {langSwitch}
            </nav>

            {/* Mobile: one menu button. */}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              className="ml-auto grid size-11 place-items-center rounded border border-rule-strong min-[950px]:hidden"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>

          {menuOpen && (
            <div id="mobile-menu" className="animate-fade-up border-t border-rule px-[clamp(16px,4vw,32px)] pb-4 pt-2 min-[950px]:hidden">
              <nav aria-label={t('nav.main')} className="flex flex-col">{tabLinks(true)}</nav>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
                <RoleMenu />
                {langSwitch}
              </div>
            </div>
          )}
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Outlet />
      </main>

      <Footer onCookies={() => setCookieOpen(true)} />
      <A11yPanel />
      {(!prefs.consent || cookieOpen) && <CookieBanner forceSettings={cookieOpen} onDone={() => setCookieOpen(false)} />}
    </div>
  )
}
