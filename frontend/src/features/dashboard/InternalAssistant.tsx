import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { CATEGORIES } from '@/features/assistant/api'
import { useRoute } from './api'

const CARD = 'flex flex-col overflow-hidden rounded border border-rule bg-surface'
const BTN = 'rounded-[3px] border border-brand bg-surface px-3 py-1 text-sm font-semibold hover:bg-[#eee2c8]'
const SELECT = 'rounded-[3px] border border-field bg-surface px-2.5 py-1.5 text-[13px] font-normal text-ink'

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id) }, [value, ms])
  return v
}

/** "Internal assistant": a staff member describes a situation and gets the responsible institution. */
export function InternalAssistant({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const debounced = useDebounced(q.trim(), 400)
  const route = useRoute(debounced, cat)
  const noMatch = debounced.length >= 3 && route.data && !route.data.route && !cat
  const r = route.data?.route
  return (
    <div className={compact ? 'flex flex-col gap-2.5' : `${CARD} gap-3 px-5.5 py-5`}>
      <div className="flex flex-col gap-0.5">
        {compact ? <h3 className="m-0 text-[15px] font-bold">{t('dash.internalTitle')}</h3> : <h2 className="m-0 text-[17px] font-bold">{t('dash.internalTitle')}</h2>}
        <span className="text-[13px] text-subtle">{t('dash.internalSub')}</span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <label htmlFor={compact ? 'who-q-home' : 'who-q'} className="sr-only">{t('dash.internalTitle')}</label>
        <input id={compact ? 'who-q-home' : 'who-q'} value={q} onChange={(e) => { setQ(e.target.value); setCat('') }} placeholder={t('dash.internalPlaceholder')} className="min-w-0 flex-[1_1_220px] rounded-[3px] border border-field bg-surface px-3 py-2 text-[15px] outline-none" />
        {(noMatch || cat) && (
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('ask.domain')} className={SELECT}>
            <option value="">{t('dash.pickDomain')}</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
          </select>
        )}
      </div>
      {noMatch && <span className="text-[13px] text-subtle">{t('dash.internalNoMatch')}</span>}
      {r && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-rule pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-bold">{r.name}</span>
            <span className="text-sm text-[#3a352c]">{r.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
            {route.data?.basedOn && <Link to={`/documente/${route.data.basedOn.docId}`} className="text-[13px]">{t('dash.basedOn', { title: route.data.basedOn.title })}</Link>}
          </div>
          <a href={r.contactUrl} target="_blank" rel="noreferrer" className={`${BTN} no-underline`}>{t('answer.openContact')} ↗</a>
        </div>
      )}
    </div>
  )
}
