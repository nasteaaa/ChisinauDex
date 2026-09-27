import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDocuments, useSources } from '@/features/documents/api'
import { formatDate, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDashboard, useDashboardAction, useOpenPetitions, type DashboardData } from './api'
import { InternalAssistant } from './InternalAssistant'
import { PetitionsInbox } from './PetitionsInbox'

type Page = DashboardData['pages'][number]
type Seg = 'conf' | 'petitions' | 'gaps' | 'ratings' | 'pages' | 'services' | 'docs' | 'faq'
const PAGE_DONE: Record<Page['type'], string> = { hacked: 'offline', down: 'sent', blocked: 'sent', tls: 'sent', stale: 'sent', broken: 'fixed' }
const PAGE_COLOR: Record<Page['type'], string> = { hacked: 'var(--bad)', down: 'var(--bad)', blocked: 'var(--warn)', tls: 'var(--warn)', stale: 'var(--warn)', broken: 'var(--ink)' }

const CARD = 'flex flex-col overflow-hidden rounded border border-rule bg-surface'
const CARD_HEAD = 'flex items-baseline justify-between gap-3 border-b border-rule bg-panel px-4.5 py-3.5'
const ROW = 'flex min-h-[150px] flex-col gap-1.5 border-b border-rule px-4.5 py-3.5'
const BTN = 'rounded-[3px] border border-brand bg-surface px-3 py-1 text-sm font-semibold hover:bg-[#eee2c8]'
const BTN_DARK = 'rounded-[3px] border border-brand bg-brand px-3 py-1 text-sm font-semibold text-white hover:bg-brand-strong'
const SELECT = 'rounded-[3px] border border-field bg-surface px-2.5 py-1.5 text-[13px] font-normal text-ink'

const Badge = ({ n, color }: { n: number; color: string }) => (
  <span className="rounded-[3px] px-2 py-0.5 text-[13px] font-bold text-white" style={{ background: n ? color : 'var(--ok)' }}>{n}</span>
)

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  return (
    <div aria-hidden="true" className="my-1 flex h-[22px] items-end gap-[3px]">
      {values.map((v, i) => (
        <span key={i} className="flex-1 origin-bottom rounded-[1px] [animation:izGrow_.5s_ease_both]" style={{ height: `${Math.max(8, (100 * v) / max)}%`, background: i === values.length - 1 ? 'var(--brand)' : '#d8c9a3', animationDelay: `${i * 0.05}s` }} />
      ))}
    </div>
  )
}

function Collapsible({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <details className={CARD}>
      <summary className={`${CARD_HEAD} cursor-pointer list-none`}><h2 className="m-0 text-lg font-bold">{title}</h2><span className="text-sm text-subtle">{note}</span></summary>
      {children}
    </details>
  )
}

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'ro'
  const dash = useDashboard()
  const act = useDashboardAction()
  const sources = useSources()
  const [seg, setSeg] = useState<Seg>('conf')
  const [dept, setDept] = useState('')
  const openPetitions = useOpenPetitions(dept)
  const docs = useDocuments({ source: dept, sort: 'newest', pageSize: '15', page: '1' })

  if (dash.isPending) return <p className="p-8 text-subtle">{t('common.loading')}</p>
  if (dash.isError || !dash.data) return <p role="alert" className="p-8 text-bad">{t('dash.error')}</p>
  const { stats, conflicts: allConflicts, gaps: allGaps, faq, pages: allPages, daily, activity, services, ratings: allRatings } = dash.data
  const incompleteServices = services.incomplete.filter((s) => !dept || s.sourceId === dept)

  // The department filter applies to every tab.
  const conflicts = allConflicts.filter((c) => !dept || c.a.sourceId === dept || c.b.sourceId === dept)
  const gaps = allGaps.filter((g) => !dept || g.ownerSourceId === dept)
  const pages = allPages.filter((p) => !dept || p.sourceId === dept)
  const openConf = conflicts.filter((c) => c.state !== 'resolved').length
  const openGaps = gaps.filter((g) => g.state === 'open').length
  const openPages = pages.filter((p) => p.state === 'open')
  const ratings = allRatings.filter((r) => !dept || r.sourceId === dept)
  const lowRatings = ratings.filter((r) => r.stars <= 2).length
  const sourceName = (id: string) => sources.data?.sources.find((x) => x.id === id)?.name ?? id
  // A compromised page is the only thing that turns a badge red; other pending work is amber.
  const pageColor = openPages.some((p) => p.type === 'hacked') ? 'var(--bad)' : 'var(--warn)'
  const empty = <div className="p-4.5 text-sm text-subtle">{t('dash.emptyDept')}</div>

  const segs: [Seg, string, number | null, string][] = [
    ['conf', t('dash.segConf'), openConf, 'var(--warn)'],
    ['petitions', t('dash.segPetitions'), openPetitions, 'var(--warn)'],
    ['gaps', t('dash.segGaps'), openGaps, 'var(--warn)'],
    ['ratings', t('dash.segRatings'), lowRatings, 'var(--bad)'],
    ['pages', t('dash.segPages'), openPages.length, pageColor],
    ['services', t('dash.segServices'), incompleteServices.length, 'var(--warn)'],
    ['docs', t('dash.segDocs'), null, ''],
    ['faq', t('dash.segFaq'), null, '']
  ]

  const pageNote = (p: Page) => {
    const [a, b] = p.note.split('|')
    if (p.type === 'hacked') return t('dash.notes.hacked', { n: a, titles: b })
    if (p.type === 'down') return t('dash.notes.down', { e: p.note })
    if (p.type === 'blocked') return t('dash.notes.blocked')
    if (p.type === 'tls') return t('dash.notes.tls')
    if (p.type === 'stale') return t('dash.notes.stale', { d: formatDate(p.note, lang) })
    return t('dash.notes.broken', { s: a, on: (b ?? '').replace(/^https?:\/\//, '') })
  }

  const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0)
  const delta = (now: number, prev: number, good: 'up' | 'down' = 'up') => {
    const d = now - prev
    if (!prev && !now) return { text: t('dash.noChange'), color: 'var(--subtle)' }
    const up = d >= 0
    return { text: `${up ? '▲' : '▼'} ${Math.abs(d)} ${t('dash.vsLastWeek')}`, color: (up === (good === 'up')) ? 'var(--ok)' : 'var(--bad)' }
  }
  const statCards: [string, string, number[], { text: string; color: string }][] = [
    [t('dash.stats.questions'), formatNumber(sum(daily.questions), lang), daily.questions, delta(sum(daily.questions), daily.questionsPrev)],
    [t('dash.stats.answered'), stats.answeredPct === null ? '—' : `${stats.answeredPct}%`, daily.answered, delta(sum(daily.answered), daily.answeredPrev)],
    [t('dash.stats.positive', { n: stats.ratings }), stats.positivePct === null ? '—' : `${stats.positivePct}%`, daily.ratings, delta(sum(daily.ratings), daily.ratingsPrev)],
    [t('dash.stats.visits'), formatNumber(sum(daily.visits), lang), daily.visits, delta(sum(daily.visits), daily.visitsPrev)]
  ]
  const facts: [string, string][] = [
    [formatNumber(stats.docs, lang), t('dash.stats.docs')],
    [`${stats.sourcesUp}/${stats.sources}`, t('dash.stats.sourcesUpShort')],
    [String(stats.quarantined), t('dash.stats.quarantined')],
    [stats.avgLatencyMs === null ? '—' : `${(stats.avgLatencyMs / 1000).toFixed(1)} s`, t('dash.stats.latency')]
  ]

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-[clamp(16px,4vw,32px)] pb-18 pt-11">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 tabIndex={-1} className="m-0 text-[30px] font-bold leading-tight outline-none">{t('dash.title')}</h1>
        <p className="m-0 text-xs text-subtle">{t('dash.lastCrawl', { c: formatDate(stats.corpusBuiltAt, lang, true), h: formatDate(stats.healthCheckedAt, lang, true) })}</p>
      </div>

      <InternalAssistant />

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule">
        <div role="tablist" aria-label={t('dash.title')} className="flex flex-wrap gap-4">
          {segs.map(([id, label, count, color]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={seg === id}
              onClick={() => setSeg(id)}
              className={cn('-mb-px flex items-center gap-2 px-1 py-2.5 text-[15px] font-semibold', seg === id ? 'text-ink shadow-[inset_0_-2px_0_var(--brand)]' : 'text-subtle')}
            >
              {label}
              {count !== null && <span className="min-w-5 rounded-full px-1.5 text-xs font-bold leading-snug text-white" style={{ background: count ? color : 'var(--ok)' }}>{count}</span>}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 pb-2 text-[13px] font-semibold">
          {t('dash.dept')}
          <select value={dept} onChange={(e) => setDept(e.target.value)} className={SELECT}>
            <option value="">{t('dash.allDepts')}</option>
            {(sources.data?.sources ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>

      {seg === 'conf' && (
        <div className={CARD}>
          <div className={CARD_HEAD}><h2 className="m-0 text-lg font-bold">{t('dash.conflicts')}</h2><Badge n={openConf} color="var(--warn)" /></div>
          {conflicts.length === 0 && <div className="p-4.5 text-sm text-subtle">{dept ? t('dash.emptyDept') : t('dash.conflictsEmpty')}</div>}
          {conflicts.map((c) => (
            <div key={c.id} className={ROW}>
              <span className="text-base font-semibold leading-snug">{c.topic}</span>
              <span className="text-sm leading-relaxed text-[#3a352c]">
                A: <strong>{c.a.value}</strong> — „{c.a.quote}” (<Link to={`/documente/${c.a.docId}`}>{c.a.publisher}, {formatDate(c.a.date, lang) || '—'}</Link>)<br />
                B: <strong>{c.b.value}</strong> — „{c.b.quote}” (<Link to={`/documente/${c.b.docId}`}>{c.b.publisher}, {formatDate(c.b.date, lang) || '—'}</Link>)
              </span>
              <span className="text-[13px] text-subtle">{t(`dash.origin.${c.origin}`)} · {formatDate(c.detectedAt, lang)}</span>
              <div className="mt-auto flex flex-wrap items-center gap-2.5 text-sm">
                <span className="text-subtle">{t('dash.asks', { n: c.asks })}</span>
                {c.state === 'open' && <button type="button" className={`${BTN} ml-auto`} onClick={() => act.mutate({ kind: 'conflict', id: c.id, state: 'legal' })}>{t('dash.toLegal')}</button>}
                {c.state === 'legal' && <span className="ml-auto text-warn">{t('dash.sentLegal')}</span>}
                {c.state !== 'resolved'
                  ? <button type="button" className={BTN_DARK} onClick={() => act.mutate({ kind: 'conflict', id: c.id, state: 'resolved' })}>{t('dash.resolve')}</button>
                  : <span className="ml-auto font-semibold text-ok">✓ {t('dash.resolved')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {seg === 'petitions' && <PetitionsInbox dept={dept} />}

      {seg === 'gaps' && (
        <div className={CARD}>
          <div className={CARD_HEAD}><h2 className="m-0 text-lg font-bold">{t('dash.gaps')}</h2><Badge n={openGaps} color="var(--warn)" /></div>
          {gaps.length === 0 && (dept ? empty : <div className="p-4.5 text-sm text-subtle">{t('dash.gapsEmpty')}</div>)}
          {gaps.map((g) => (
            <div key={g.id} className={ROW}>
              <span className="text-base font-semibold leading-snug">{g.question}</span>
              <span className="text-sm leading-relaxed text-[#3a352c]">{t('dash.responsible')}: {g.owner || '—'} · {t('dash.lastAsked', { d: formatDate(g.lastAsked, lang) })}</span>
              <div className="mt-auto flex flex-wrap items-center gap-2.5 text-sm">
                <span className="text-subtle">{t('dash.requests', { n: g.asks })}</span>
                {g.state === 'open'
                  ? <button type="button" className={`${BTN} ml-auto`} onClick={() => act.mutate({ kind: 'gap', id: g.id, state: 'assigned' })}>{t('dash.assign')}</button>
                  : <span className="ml-auto font-semibold text-ok">✓ {t('dash.assigned')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {seg === 'pages' && (
        <div className={CARD}>
          <div className={CARD_HEAD}><h2 className="m-0 text-lg font-bold">{t('dash.pages')}</h2><Badge n={openPages.length} color={pageColor} /></div>
          {pages.length === 0 && (dept ? empty : <div className="p-4.5 text-sm text-subtle">{t('dash.pagesEmpty')}</div>)}
          {pages.map((p) => (
            <div key={p.id} className="flex min-h-[66px] flex-wrap items-center gap-3 border-b border-rule px-4.5 py-2.5">
              <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-px">
                <span className="text-[15px] font-semibold">{p.sourceName} <span className="text-[13px] font-bold" style={{ color: PAGE_COLOR[p.type] }}>· {t(`dash.types.${p.type}`)}</span></span>
                <span className="text-[13px] leading-snug text-subtle">{pageNote(p)}</span>
                <a href={p.url} target="_blank" rel="noreferrer" className="break-all text-[13px]">{p.url.replace(/^https?:\/\//, '').slice(0, 90)}</a>
              </div>
              {p.state === 'open'
                ? <button type="button" className={BTN} onClick={() => act.mutate({ kind: 'page', id: p.id, state: PAGE_DONE[p.type] })}>{t(`dash.actions.${p.type}`)}</button>
                : <span className="text-sm font-semibold text-ok">✓ {t(`dash.done.${p.state}`, { defaultValue: p.state })}</span>}
            </div>
          ))}
        </div>
      )}

      {seg === 'services' && (
        <div className={CARD}>
          <div className={CARD_HEAD}><h2 className="m-0 text-lg font-bold">{t('dash.servicesTitle')}</h2><span className="flex items-baseline gap-3 text-sm text-subtle">{t('dash.servicesNote', { n: services.total })}<Link to="/servicii" className="font-semibold">{t('services.all')}</Link></span></div>
          {incompleteServices.length === 0 && <div className="p-4.5 text-sm text-subtle">{t('dash.servicesEmpty')}</div>}
          {incompleteServices.map((s) => (
            <div key={s.docId} className="flex flex-wrap items-center gap-3 border-b border-rule px-4.5 py-3">
              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
                <span className="text-[15px] font-semibold leading-snug">{s.title}</span>
                <span className="text-[13px] text-subtle">{s.institution}</span>
              </div>
              <span className="text-sm font-semibold text-bad">{t('dash.servicesMissing')}: {s.missing.map((m) => t(`services.field.${m}`)).join(', ')}</span>
              <a href={s.url} target="_blank" rel="noreferrer" className="text-sm">{t('services.officialPage')} ↗</a>
            </div>
          ))}
        </div>
      )}

      {seg === 'docs' && (
        <div className={CARD}>
          <div className={CARD_HEAD}><h2 className="m-0 text-lg font-bold">{t('dash.segDocs')}</h2><span className="text-sm text-subtle">{t('dash.docsNote')}</span></div>
          {docs.data?.items.length === 0 && empty}
          {docs.data?.items.map((d) => (
            <Link key={d.id} to={`/documente/${d.id}`} className="flex flex-col gap-0.5 border-b border-rule px-4.5 py-3 text-ink no-underline hover:bg-[#f6efe0]">
              <span className="text-[13px] font-bold">{t(`docs.types.${d.type}`)}</span>
              <span className="text-[15px] font-semibold leading-snug">{d.title}</span>
              <span className="text-[13px] text-subtle">{d.sourceName} · {formatDate(d.updatedAt ?? d.publishedAt, lang) || '—'}</span>
            </Link>
          ))}
        </div>
      )}

      {seg === 'ratings' && (
        <div className={CARD}>
          <div className={CARD_HEAD}><h2 className="m-0 text-lg font-bold">{t('dash.ratingsTitle')}</h2><span className="text-sm text-subtle">{t('dash.ratingsNote')}</span></div>
          {ratings.length === 0 && <div className="p-4.5 text-sm text-subtle">{dept ? t('dash.emptyDept') : t('dash.ratingsEmpty')}</div>}
          {ratings.map((r) => (
            <div key={r.at + r.question} className="flex flex-col gap-1 border-b border-rule px-4.5 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold">{r.question || '—'}</span>
                <span aria-label={t('feedback.starLabel', { n: r.stars })} className={cn('text-base tracking-wide', r.stars <= 2 ? 'text-bad' : 'text-gold')}>{'★'.repeat(r.stars)}<span className="text-rule-strong">{'★'.repeat(5 - r.stars)}</span></span>
              </div>
              {(r.tags.length > 0 || r.comment) && <p className="m-0 text-sm text-[#3a352c]">{[r.tags.join(' · '), r.comment].filter(Boolean).join(' — ')}</p>}
              <span className="text-xs text-subtle">{formatDate(r.at, lang)}{r.sourceId && ` · ${sourceName(r.sourceId)}`}</span>
            </div>
          ))}
        </div>
      )}

      {seg === 'faq' && (
        <div className={CARD}>
          <div className={CARD_HEAD}><h2 className="m-0 text-lg font-bold">{t('dash.faq')}</h2><span className="text-sm text-subtle">{t('dash.allTime')}</span></div>
          {faq.length === 0 && <div className="p-4.5 text-sm text-subtle">{t('dash.faqEmpty')}</div>}
          {faq.map((f) => (
            <div key={f.question} className="grid min-h-[66px] grid-cols-[minmax(0,1fr)_110px_44px] items-center gap-3 border-b border-rule px-4.5 text-[15px]">
              <span>{f.question}</span>
              <div aria-hidden="true" className="h-2 bg-track"><div className="h-full bg-brand" style={{ width: `${(100 * f.count) / faq[0].count}%` }} /></div>
              <span className="text-right text-sm tabular-nums">{f.count}</span>
            </div>
          ))}
        </div>
      )}

      <Collapsible title={t('dash.statsTitle')} note={t('dash.last7')}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-7 px-6.5 py-7">
          {statCards.map(([label, value, bars, d]) => (
            <div key={label} className="flex flex-col gap-1.5">
              <span className="text-[13px] text-subtle">{label}</span>
              <span className="text-3xl font-bold leading-tight">{value}</span>
              <Spark values={bars} />
              <span className="text-[13px] font-semibold" style={{ color: d.color }}>{d.text}</span>
            </div>
          ))}
        </div>
        <dl className="m-0 grid grid-cols-2 border-t border-rule sm:grid-cols-4">
          {facts.map(([v, l]) => (
            <div key={l} className="flex flex-col gap-1 px-6.5 py-4">
              <dd className="m-0 text-xl font-bold">{v}</dd>
              <dt className="text-[13px] text-subtle">{l}</dt>
            </div>
          ))}
        </dl>
      </Collapsible>

      <Collapsible title={t('dash.logTitle')} note={t('dash.logNote')}>
        {activity.length === 0 && <div className="p-4.5 text-sm text-subtle">{t('dash.logEmpty')}</div>}
        {activity.map((a, i) => (
          <div key={a.at + i} className="grid grid-cols-[minmax(120px,160px)_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-rule px-4.5 py-2.5 text-sm leading-normal">
            <span className="tabular-nums text-subtle">{formatDate(a.at, lang, true)}</span>
            <span><strong className="font-semibold">{t('role.employee')}</strong> {t(`dash.log.${a.kind}`, { state: t(`dash.logState.${a.state}`, { defaultValue: a.state }) })} <span className="text-subtle">{a.id.split(':').slice(1, 2).join('') || a.id.slice(0, 60)}</span></span>
          </div>
        ))}
      </Collapsible>
    </section>
  )
}
