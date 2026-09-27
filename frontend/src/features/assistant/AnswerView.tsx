import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ServiceCard } from '@/features/services/ServiceCard'
import { formatDate } from '@/lib/format'
import { sendPetition, useSentPetitions } from '@/lib/petitions'
import { useReadAloud } from '@/lib/speech'
import type { Answer, AnswerSource, Status } from './api'
import { Feedback } from './Feedback'

// Visual hierarchy: 1) the answer card (status, answer, responsible institution) is the only strong
// element; 2) one "Surse" list holds quotes, provenance and relevance; 3) actions and notes stay quiet.

const STATUS: Record<Status, { glyph: string; color: string }> = {
  ok: { glyph: '✓', color: 'var(--ok)' },
  partial: { glyph: '!', color: 'var(--warn)' },
  conflict: { glyph: '!', color: 'var(--warn)' },
  gap: { glyph: '?', color: 'var(--bad)' }
}
const VISIBLE_SOURCES = 2

function Relevance({ value }: { value: number }) {
  const { t } = useTranslation()
  const color = value >= 70 ? 'var(--ok)' : value >= 45 ? 'var(--warn)' : 'var(--bad)'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums" style={{ color }} title={t('answer.relevanceHint')}>
      <span aria-hidden="true" className="inline-block h-1 w-10 overflow-hidden rounded-full bg-track"><span className="block h-full" style={{ width: `${value}%`, background: color }} /></span>
      {value}%<span className="sr-only"> {t('answer.relevance')}. {t('answer.relevanceHint')}</span>
    </span>
  )
}

function Cite({ n, onClick }: { n: number; onClick: (n: number) => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={() => onClick(n)} aria-label={t('answer.cite', { n })} className="ml-0.5 inline-flex min-h-6 min-w-6 items-center justify-center align-[4px] text-xs font-bold text-subtle hover:text-ink">
      [{n}]
    </button>
  )
}

/** The quoted sentence inside its passage: context muted, the quote highlighted. */
function InContext({ s }: { s: AnswerSource }) {
  if (s.start < 0) return null
  const before = s.passage.slice(Math.max(0, s.start - 240), s.start)
  const after = s.passage.slice(s.end, s.end + 240)
  return (
    <p className="m-0 whitespace-pre-line font-quote text-[15px] leading-[1.65] text-subtle">
      {s.start > 240 ? '… ' : ''}{before}<mark className="bg-hl px-0.5 text-ink">{s.passage.slice(s.start, s.end)}</mark>{after}{s.end + 240 < s.passage.length ? ' …' : ''}
    </p>
  )
}

function SourceItem({ s, answerId, ring, lang }: { s: AnswerSource; answerId: string; ring: boolean; lang: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <li id={`src-${answerId}-${s.n}`} className="border-t border-rule first:border-t-0" style={{ boxShadow: ring ? 'inset 3px 0 0 var(--gold)' : 'none' }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 px-4 py-3 text-left hover:bg-[#f6efe0]">
        <span className="text-[13px] font-bold leading-6 text-subtle">[{s.n}]</span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-quote text-[15.5px] leading-relaxed text-ink"><span className="bg-hl px-0.5 [box-decoration-break:clone]">„{s.quote}”</span></span>
          {s.translation && <span className="text-sm leading-snug text-[#3a352c]">{s.translation}</span>}
          <span className="text-xs text-subtle">{s.publisher} · {formatDate(s.date, lang) || t('answer.noDate')}{s.live ? ` · ${t('answer.liveTag')}` : ''}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <Relevance value={s.relevance} />
          <span aria-hidden="true" className="text-base leading-none text-subtle">{open ? '−' : '+'}</span>
        </span>
      </button>
      {open && (
        <div className="animate-fade-up flex flex-col gap-2 pb-3.5 pl-[52px] pr-4">
          <span className="text-sm font-semibold">{s.title}</span>
          <InContext s={s} />
          <span className="flex flex-wrap gap-4 text-[13px]">
            {!s.live && <Link to={`/documente/${s.docId}`}>{t('answer.openDoc')}</Link>}
            <a href={s.url} target="_blank" rel="noreferrer">{t('answer.openOriginal')} ↗</a>
          </span>
        </div>
      )}
    </li>
  )
}

/** "Not in documents": the resident can send the question straight to the responsible institution. */
function Petition({ answer }: { answer: Answer }) {
  const { t } = useTranslation()
  const sent = useSentPetitions().find((p) => p.question === answer.question)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState(() => t('answer.petitionDraft', { q: answer.question }))
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle')

  if (sent) return <p role="status" className="m-0 rounded bg-[#eef6ee] px-3 py-2 text-sm">{t('petitions.sentTo', { ticket: sent.ticket, institution: sent.institution })}</p>
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="self-start rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong">{t('answer.petitionBtn')}</button>
  return (
    <form
      className="animate-fade-up flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setState('sending')
        try {
          await sendPetition({ question: answer.question, message, sourceId: answer.route.sourceId, institution: answer.route.name, contactUrl: answer.route.contactUrl })
          setState('idle')
        } catch { setState('error') }
      }}
    >
      <label htmlFor={`pet-${answer.id}`} className="text-sm font-semibold">{t('answer.petitionTitle', { institution: answer.route.name })}</label>
      <textarea id={`pet-${answer.id}`} value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="w-full resize-y rounded-[3px] border border-field bg-surface px-3 py-2.5 text-[15px] leading-normal outline-none" />
      <p className="m-0 text-xs text-subtle">{t('answer.petitionPrivacy')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state === 'sending' || message.trim().length < 10} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">{t('answer.petitionSend')}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm underline">{t('answer.petitionClose')}</button>
        {state === 'error' && <span role="alert" className="text-[13px] text-bad">{t('common.error')}</span>}
      </div>
    </form>
  )
}

export function AnswerView({ answer }: { answer: Answer }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'ro'
  const [showAll, setShowAll] = useState(false)
  const [ring, setRing] = useState<number | null>(null)
  const read = useReadAloud()
  const st = STATUS[answer.status]
  const src = (n: number) => answer.sources[n - 1]

  // Without AI the best-matching quote is the answer, shown as a quote, never rewritten.
  const summary = answer.mode === 'ai' ? answer.sentences : answer.sentences.slice(0, 1)
  const plainSummary = summary.map((s) => s.text).join(' ')
  const visible = showAll ? answer.sources : answer.sources.slice(0, VISIBLE_SOURCES)

  const jump = (n: number) => {
    if (n > VISIBLE_SOURCES) setShowAll(true)
    setRing(n)
    setTimeout(() => setRing(null), 1800)
    requestAnimationFrame(() => document.getElementById(`src-${answer.id}-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 1. The answer: the one strong element on the page. */}
      <article className="animate-fade-up flex flex-col gap-3.5 rounded-md border border-rule border-t-4 bg-surface px-6 py-5 shadow-[0_2px_10px_rgba(35,31,26,.06)]" style={{ borderTopColor: st.color }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-sm font-bold" style={{ color: st.color }}><span aria-hidden="true">{st.glyph} </span>{t(`answer.status.${answer.status}`)}</p>
          {answer.status !== 'gap' && <span className="flex items-center gap-1.5 text-xs text-subtle">{t('answer.relevance')} <Relevance value={answer.relevance} /></span>}
        </div>

        {summary.length > 0 && answer.status !== 'gap' ? (
          answer.mode === 'ai' ? (
            <p className="m-0 text-[20px] font-medium leading-normal text-pretty">
              {summary.map((s, i) => <span key={i}>{s.text}{s.cites.map((n) => <Cite key={n} n={n} onClick={jump} />)} </span>)}
            </p>
          ) : (
            <blockquote className="m-0 border-l-4 border-gold pl-4 font-quote text-[19px] leading-relaxed text-pretty">
              „{summary[0].text}”<Cite n={summary[0].cites[0]} onClick={jump} />
              <footer className="mt-1 font-sans text-xs text-subtle">{src(summary[0].cites[0])?.publisher}</footer>
            </blockquote>
          )
        ) : (
          <p className="m-0 text-[20px] font-medium leading-normal">{t('answer.gapText')}</p>
        )}
        {answer.romanianOnly && <p className="m-0 text-[13px] text-subtle">{t('answer.romanianOnly')}</p>}
        {answer.missing && <p className="m-0 text-[15px] leading-relaxed text-[#3a352c]"><strong className="font-semibold">{t('answer.missing')}: </strong>{answer.missing}</p>}

        {answer.conflict && (
          <div className="flex flex-col gap-2">
            <div className="grid gap-3 sm:grid-cols-2">
              {answer.conflict.sides.map((side, k) => {
                const s = src(side.n)
                const likely = answer.conflict?.newer?.n === side.n
                return (
                  <button key={side.n} type="button" onClick={() => jump(side.n)} className={`flex flex-col gap-1 rounded border px-3.5 py-3 text-left ${likely ? 'border-ok bg-[#eef6ee]' : 'border-rule bg-paper'}`}>
                    <span className="text-xs font-bold text-subtle">{t('answer.act', { l: k ? 'B' : 'A' })} · {formatDate(s?.date, lang) || t('answer.noDate')}</span>
                    <span className="text-[26px] font-bold leading-none">{side.value}</span>
                    <span className="text-xs text-subtle">{s?.publisher}</span>
                    {likely && <span className="text-xs font-bold text-ok">{t(answer.conflict?.newer?.reason === 'date' ? 'answer.likelyNewer' : 'answer.likelyAuthority')}</span>}
                  </button>
                )
              })}
            </div>
            <p className="m-0 text-[13px] text-subtle">{answer.conflict.newer ? t('answer.conflictNoteNewer') : t('answer.conflictNote')}</p>
          </div>
        )}

        {/* The responsible institution belongs to the answer, right under it. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded bg-panel px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs text-subtle">{t('answer.route')}</span>
            <span className="text-[15px] font-bold leading-snug">{answer.route.name}</span>
          </div>
          <a href={answer.route.contactUrl} target="_blank" rel="noreferrer" className="rounded border border-brand bg-surface px-3 py-1.5 text-sm font-semibold no-underline hover:bg-[#eee2c8]">{t('answer.openContact')} ↗</a>
          {answer.alsoRoute.length > 0 && (
            <p className="m-0 w-full border-t border-rule pt-2 text-[13px] text-subtle">
              {t('answer.alsoRoute')}{' '}
              {answer.alsoRoute.map((r, i) => (
                <span key={r.sourceId}>{i > 0 && ' · '}<a href={r.contactUrl} target="_blank" rel="noreferrer" className="text-ink">{r.name}</a></span>
              ))}
            </p>
          )}
        </div>

        {answer.status === 'gap' && <Petition answer={answer} />}
      </article>

      {answer.service && <ServiceCard s={answer.service} compact />}

      {/* 2. One container for quotes, provenance and relevance. */}
      {answer.sources.length > 0 && (
        <section aria-labelledby={`srcs-${answer.id}`} className="flex flex-col gap-2">
          <h3 id={`srcs-${answer.id}`} className="m-0 text-[15px] font-bold">
            {answer.status === 'gap' ? t('answer.closest') : t('answer.sources')} <span className="font-normal text-subtle">({answer.sources.length})</span>
          </h3>
          <ol className="m-0 list-none overflow-hidden rounded-md border border-rule bg-surface p-0">
            {visible.map((s) => <SourceItem key={s.n} s={s} answerId={answer.id} ring={ring === s.n} lang={lang} />)}
          </ol>
          {answer.sources.length > VISIBLE_SOURCES && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start text-sm underline">
              {showAll ? t('answer.fewerSources') : t('answer.allSources', { n: answer.sources.length })}
            </button>
          )}
          {answer.excluded.length > 0 && <p className="m-0 text-xs text-subtle">{t('answer.excludedShort', { n: answer.excluded.length })}</p>}
        </section>
      )}

      {/* 3. Quiet: notes, small actions, rating. */}
      <div data-noprint="" className="flex flex-col gap-3 border-t border-rule pt-3.5 text-[13px] text-subtle">
        <p className="m-0 leading-normal">{answer.mode === 'ai' ? t('answer.aiNote') : t('answer.fallbackNote')}</p>
        {read.supported && (
          <button type="button" onClick={() => (read.speaking ? read.stop() : read.speak([t(`answer.status.${answer.status}`), plainSummary || t('answer.gapText')].join('. '), answer.lang))} className="self-start underline hover:text-ink">{read.speaking ? t('answer.stopListen') : t('answer.listen')}</button>
        )}
        <Feedback answerId={answer.id} />
      </div>
    </div>
  )
}
