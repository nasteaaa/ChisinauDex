import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { getPrefs, setPrefs } from '@/lib/prefs'

interface Props {
  forceSettings: boolean
  onDone: () => void
}

/** Consent card (bottom-left): "necessary only" and "accept all" have equal weight; analytics stay off until accepted. */
export function CookieBanner({ forceSettings, onDone }: Props) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState(forceSettings)
  const [analytics, setAnalytics] = useState(getPrefs().consent?.analytics ?? false)

  const decide = (value: boolean) => {
    setPrefs({ consent: { analytics: value, decidedAt: new Date().toISOString() } })
    onDone()
  }

  const btn = 'min-h-9 rounded-[3px] border border-brand bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong'
  return (
    <section
      data-noprint=""
      aria-labelledby="cookie-title"
      className="fixed bottom-6 left-6 z-[59] flex w-[min(560px,calc(100vw-112px))] flex-col gap-3 rounded border border-rule-strong bg-surface px-5 py-4.5 shadow-[0_8px_28px_rgba(0,0,0,.2)]"
    >
      <h2 id="cookie-title" className="m-0 text-base font-bold">{t('cookie.title')}</h2>
      <p className="m-0 text-sm leading-relaxed text-[#3a352c]">
        {t('cookie.text')} <Link to="/confidentialitate">{t('cookie.policy')}</Link>
      </p>
      {settings && (
        <div className="flex flex-col gap-3 border-t border-rule pt-3">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked disabled className="mt-1 size-4 accent-[var(--brand)]" />
            <span className="flex flex-col"><span className="text-sm font-semibold">{t('cookie.necessary')}</span><span className="text-[13px] text-subtle">{t('cookie.necessaryDesc')}</span></span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="mt-1 size-4 accent-[var(--brand)]" />
            <span className="flex flex-col"><span className="text-sm font-semibold">{t('cookie.analytics')}</span><span className="text-[13px] text-subtle">{t('cookie.analyticsDesc')}</span></span>
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-2.5">
        {settings ? (
          <button type="button" className={btn} onClick={() => decide(analytics)}>{t('cookie.save')}</button>
        ) : (
          <>
            <button type="button" className={btn} onClick={() => decide(false)}>{t('cookie.reject')}</button>
            <button type="button" className={btn} onClick={() => decide(true)}>{t('cookie.accept')}</button>
            <button type="button" className="min-h-9 px-2 text-sm underline" onClick={() => setSettings(true)}>{t('cookie.settings')}</button>
          </>
        )}
      </div>
    </section>
  )
}
