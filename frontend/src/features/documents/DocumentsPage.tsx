import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { CATEGORIES } from '@/features/assistant/api'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDocuments, useSources, type DocType } from './api'

const PERIODS = ['any', 'week', 'month', 'year', 'custom'] as const
type Period = (typeof PERIODS)[number]
const TYPES: DocType[] = ['post', 'page', 'pdf', 'html', 'event']

function periodFrom(p: Period): string {
  const days = { week: 7, month: 31, year: 365 }[p as 'week' | 'month' | 'year']
  if (!days) return ''
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
}

const field = 'min-h-10 w-full border border-ink bg-paper px-3 text-sm text-ink'
const legend = 'mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-subtle'

export function DocumentsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'ro'
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k) ?? ''
  const period = (get('period') || 'any') as Period
  const [q, setQ] = useState(get('q'))

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const from = period === 'custom' ? get('from') : periodFrom(period)
  const to = period === 'custom' ? get('to') : ''
  const list = useDocuments({
    q: get('q'), from, to, source: get('source'), category: get('category'), type: get('type'),
    sort: get('sort') || (get('q') ? 'relevance' : 'newest'), page: get('page') || '1', pageSize: '20'
  })
  const sources = useSources()
  const srcName = (id: string) => sources.data?.sources.find((s) => s.id === id)?.name ?? id
  const count = (facet: 'sources' | 'categories' | 'types', id: string) => list.data?.facets[facet].find((f) => f.id === id)?.count ?? 0
  const page = Number(get('page') || '1')
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 px-4 pb-20 pt-12 md:px-8">
      <div className="flex max-w-3xl flex-col gap-3">
        <h1 className="m-0 text-[28px] font-bold leading-tight">{t('docs.title')}</h1>
        <p className="m-0 text-[15px] leading-relaxed text-subtle">{t('docs.sub')}</p>
      </div>

      <form role="search" onSubmit={(e) => { e.preventDefault(); update({ q }) }} className="field-group flex max-w-[640px] items-stretch rounded-[3px] border-2 border-ink bg-surface">
        <label htmlFor="doc-q" className="sr-only">{t('docs.search')}</label>
        <input id="doc-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('docs.search')} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base outline-none" />
        <button type="submit" className="bg-brand px-5 text-[15px] font-semibold text-white hover:bg-brand-strong">{t('ask.send')}</button>
      </form>

      <div className="flex flex-wrap items-start gap-x-10 gap-y-8">
        <aside aria-label={t('docs.reset')} className="flex w-full flex-col gap-5 rounded-md border border-rule bg-surface px-4.5 py-4 md:w-[280px]">
          <fieldset>
            <legend className={legend}>{t('docs.period')}</legend>
            <div className="focus-inset flex flex-col border border-ink">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={period === p}
                  onClick={() => update({ period: p === 'any' ? '' : p, from: '', to: '' })}
                  className={cn('min-h-9 px-3 text-left text-[13.5px]', period === p ? 'bg-ink text-paper' : 'text-ink hover:bg-panel')}
                >
                  {t(`docs.periods.${p}`)}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[12.5px]">{t('docs.from')}<input type="date" value={get('from')} onChange={(e) => update({ from: e.target.value })} className={field} /></label>
                <label className="flex flex-col gap-1 text-[12.5px]">{t('docs.to')}<input type="date" value={get('to')} onChange={(e) => update({ to: e.target.value })} className={field} /></label>
              </div>
            )}
          </fieldset>

          <label className="flex flex-col">
            <span className={legend}>{t('docs.domain')}</span>
            <select value={get('category')} onChange={(e) => update({ category: e.target.value })} className={field}>
              <option value="">{t('ask.all')}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)} ({count('categories', c)})</option>)}
            </select>
          </label>

          <label className="flex flex-col">
            <span className={legend}>{t('docs.source')}</span>
            <select value={get('source')} onChange={(e) => update({ source: e.target.value })} className={field}>
              <option value="">{t('docs.allSources')}</option>
              {(sources.data?.sources ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} ({count('sources', s.id)})</option>)}
            </select>
          </label>

          <label className="flex flex-col">
            <span className={legend}>{t('docs.type')}</span>
            <select value={get('type')} onChange={(e) => update({ type: e.target.value })} className={field}>
              <option value="">{t('docs.allTypes')}</option>
              {TYPES.map((ty) => <option key={ty} value={ty}>{t(`docs.types.${ty}`)} ({count('types', ty)})</option>)}
            </select>
          </label>

          <button type="button" onClick={() => { setQ(''); setParams({}, { replace: true }) }} className="min-h-10 self-start border border-ink px-4 text-sm">{t('docs.reset')}</button>
        </aside>

        <section aria-labelledby="doc-results" aria-busy={list.isFetching} className="flex min-w-0 flex-1 basis-[480px] flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink pb-3">
            <h2 id="doc-results" aria-live="polite" className="m-0 font-serif text-xl font-semibold">{t('docs.results', { count: list.data?.total ?? 0 })}</h2>
            <label className="flex items-center gap-2 text-[13px]">
              {t('docs.sort')}
              <select value={get('sort') || (get('q') ? 'relevance' : 'newest')} onChange={(e) => update({ sort: e.target.value })} className="min-h-9 border border-ink bg-paper px-2 text-[13px]">
                {(['relevance', 'newest', 'oldest'] as const).map((s) => <option key={s} value={s}>{t(`docs.sorts.${s}`)}</option>)}
              </select>
            </label>
          </div>
          {list.isError && <p role="alert" className="text-brand">{t('common.error')}</p>}
          {list.data?.items.length === 0 && <p className="py-6 text-subtle">{t('docs.none')}</p>}
          <ul className="m-0 list-none p-0">
            {list.data?.items.map((d) => (
              <li key={d.id} className="flex flex-col gap-1.5 border-b border-rule py-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11.5px] text-subtle">
                  <span className="text-brand">{t(`docs.types.${d.type}`)}</span>
                  <span>{formatDate(d.publishedAt ?? d.updatedAt, lang) || t('answer.noDate')}</span>
                  <span>{srcName(d.sourceId)}</span>
                </div>
                <Link to={`/documente/${d.id}`} className="font-serif text-[19px] leading-snug text-ink hover:text-brand">{d.title}</Link>
                <p className="m-0 line-clamp-2 text-[14px] leading-relaxed text-subtle">{d.excerpt}</p>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label={t('docs.page', { p: page, n: pages })} className="flex items-center justify-between gap-3 pt-5">
              <button type="button" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} className="min-h-10 border border-ink px-4 text-sm disabled:opacity-30">← {t('docs.prev')}</button>
              <span className="font-mono text-xs text-subtle">{t('docs.page', { p: page, n: pages })}</span>
              <button type="button" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })} className="min-h-10 border border-ink px-4 text-sm disabled:opacity-30">{t('docs.next')} →</button>
            </nav>
          )}
        </section>
      </div>
    </div>
  )
}
