import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AddressPanel } from '@/features/address/AddressPanel'
import { EmployeePanel } from '@/features/dashboard/EmployeePanel'
import { AnswerView } from '@/features/assistant/AnswerView'
import { CATEGORIES, useAsk, useExamples, useSuggest, type Category } from '@/features/assistant/api'
import { ProgressList } from '@/features/assistant/ProgressList'
import { MyPetitions } from '@/features/services/MyPetitions'
import { ApiError } from '@/lib/api'
import { DOMAIN_ICONS, Icon } from '@/lib/icons'
import { usePrefs } from '@/lib/prefs'
import { useDictation } from '@/lib/speech'
import { cn } from '@/lib/utils'

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id) }, [value, ms])
  return v
}

const yearsAgo = (n: number) => new Date(Date.now() - n * 365 * 86400000).toISOString().slice(0, 10)

function DomainMenu({ value, onChange }: { value: Category | null; onChange: (c: Category | null) => void }) {
  const { t } = useTranslation()
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
  const label = (c: Category | null) => (c ? t(`cat.${c}`) : t('ask.allDomains'))
  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${t('ask.domain')}: ${label(value)}`}
        className="flex min-h-8 items-center gap-1.5 rounded border border-rule-strong bg-surface px-2.5 text-[13px] text-ink hover:border-brand"
      >
        <Icon d={DOMAIN_ICONS[value ?? 'all']} size={15} />
        <span className="text-left">{label(value)}</span>
        <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true" className={cn('mr-1 transition-transform', open && 'rotate-180')}><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      {open && (
        <div role="group" aria-label={t('ask.domain')} className="focus-inset animate-pop absolute left-0 top-[calc(100%+4px)] z-20 w-max min-w-full origin-top-right rounded border border-rule-strong bg-surface py-1 shadow-[0_8px_24px_rgba(0,0,0,.14)]">
          {[null, ...CATEGORIES].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              aria-pressed={value === c}
              onClick={() => { onChange(c); setOpen(false) }}
              className={cn('flex w-full items-center gap-2.5 py-2 pl-3.5 pr-4 text-left text-[15px] hover:bg-[#eee2c8]', value === c && 'bg-panel')}
            >
              <Icon d={DOMAIN_ICONS[c ?? 'all']} />
              <span className="flex-1">{label(c)}</span>
              <span className="w-3.5 font-bold">{value === c ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function HomePage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'ro'
  const prefs = usePrefs()
  const isEmp = prefs.role === 'employee'
  const [cat, setCat] = useState<Category | null>(null)
  const [input, setInput] = useState('')
  const [asked, setAsked] = useState('')
  const [focused, setFocused] = useState(false)
  const [district, setDistrict] = useState<string | undefined>()
  const [filterOpen, setFilterOpen] = useState(false)
  const [period, setPeriod] = useState({ from: '', to: '' })
  const [draft, setDraft] = useState({ from: '', to: '' })
  const [history, setHistory] = useState<string[]>([])
  const ask = useAsk()
  const answerRef = useRef<HTMLElement>(null)
  const debounced = useDebounced(input.trim(), 250)
  const suggest = useSuggest(debounced)
  const dictation = useDictation(lang, setInput)
  const exampleData = useExamples(lang, cat)

  const submit = (text: string, exact = false) => {
    const q = text.trim()
    if (q.length < 2) return
    setInput(q)
    setAsked(q)
    setFocused(false)
    setHistory((h) => [q, ...h.filter((x) => x !== q)].slice(0, 5))
    ask.mutate({
      question: q, lang, role: isEmp ? 'employee' : 'citizen', category: cat ?? undefined, district,
      publishedFrom: period.from || undefined, publishedTo: period.to || undefined, exact: exact || undefined
    })
    setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  // Examples come from the data (popular questions, FAQ questions on the official sites); our list only fills gaps.
  const qsByCat = t('ask.qs', { returnObjects: true }) as Record<Category, string[]>
  const fallback = isEmp && !cat
    ? (t('ask.empQs', { returnObjects: true }) as string[])
    : cat ? qsByCat[cat] : CATEGORIES.map((c) => qsByCat[c][0])
  const fromData = (exampleData.data?.questions ?? []).map((q) => q.text)
  const quick = [...fromData, ...fallback.filter((f) => !fromData.includes(f))].slice(0, 4)
  const recent = history.filter((q) => q !== input.trim())
  const showRecent = focused && !input.trim() && recent.length > 0
  const showSuggest = showRecent || (focused && debounced.length >= 2 && ((suggest.data?.questions.length ?? 0) + (suggest.data?.documents.length ?? 0) > 0))
  const filterActive = !!(period.from || period.to)
  const periodLabel = t('ask.periodLabel', { from: period.from || '…', to: period.to || t('ask.today') })
  const hasAnswer = ask.isPending || !!ask.data || ask.isError

  return (
    <>
      {/* 1. The search is the product: first, largest, highest contrast. */}
      <section aria-labelledby="ask-title" data-noprint="" className="border-b border-rule bg-panel">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4 px-[clamp(16px,4vw,32px)] pb-9 pt-10">
          <div className="flex flex-col gap-1.5">
            <h1 id="ask-title" tabIndex={-1} className="m-0 text-[clamp(28px,3.4vw,38px)] font-bold leading-tight tracking-[-0.01em] outline-none">
              {isEmp ? t('emp.heroTitle') : t('ask.heroTitle')}
            </h1>
            <p className="m-0 text-[15px] leading-normal text-subtle">{isEmp ? t('emp.heroSub') : t('ask.heroSub')}</p>
          </div>

          <form role="search" onSubmit={(e) => { e.preventDefault(); submit(input) }} className="relative flex min-h-[58px] rounded-md border-2 border-ink bg-surface field-group shadow-[0_2px_0_rgba(35,31,26,.08)]">
            <label htmlFor="q" className="sr-only">{t('ask.label')}</label>
            <input
              id="q"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={(e) => { if (e.key === 'Escape') setFocused(false) }}
              placeholder={t('ask.placeholder')}
              autoComplete="off"
              aria-controls="q-suggest"
              aria-expanded={showSuggest}
              className="min-w-0 flex-1 rounded-l-md bg-transparent px-4 py-3 text-[17px] outline-none"
            />
            {dictation.supported && (
              <button
                type="button"
                onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
                aria-pressed={dictation.listening}
                aria-label={dictation.listening ? t('ask.voiceStop') : t('ask.voice')}
                className={cn('grid w-11 place-items-center text-subtle hover:text-ink', dictation.listening && 'text-bad')}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              </button>
            )}
            <button type="submit" disabled={ask.isPending} className="m-1.5 rounded bg-brand px-6 text-base font-semibold text-white hover:bg-brand-strong disabled:opacity-60">{t('ask.send')}</button>
            {showSuggest && (
              <div id="q-suggest" className="absolute inset-x-0 top-full z-20 mt-1 rounded border border-rule-strong bg-surface shadow-[0_8px_24px_rgba(0,0,0,.14)]">
                {showRecent && (
                  <div className="flex flex-col pb-1">
                    <span className="px-4 pt-3 text-xs font-semibold text-subtle">{t('answer.history')}</span>
                    {recent.map((q) => (
                      <button key={q} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => submit(q)} className="flex items-center gap-2 px-4 py-2 text-left text-[15px] hover:bg-panel">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-subtle"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>{q}
                      </button>
                    ))}
                  </div>
                )}
                {!showRecent && !!suggest.data?.questions.length && (
                  <div className="focus-inset flex flex-col">
                    <span className="px-4 pt-3 text-xs font-semibold text-subtle">{t('ask.suggestQuestions')}</span>
                    {suggest.data.questions.map((s) => (
                      <button key={s.text} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => submit(s.text)} className="px-4 py-2 text-left text-[15px] hover:bg-panel">{s.text}</button>
                    ))}
                  </div>
                )}
                {!showRecent && !!suggest.data?.documents.length && (
                  <div className="focus-inset flex flex-col border-t border-rule">
                    <span className="px-4 pt-3 text-xs font-semibold text-subtle">{t('ask.suggestDocs')}</span>
                    {suggest.data.documents.map((d) => (
                      <Link key={d.id} to={`/documente/${d.id}`} className="px-4 py-2 text-sm text-ink no-underline hover:bg-panel">{d.title}</Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>

          {/* Secondary controls: small and quiet, so they don't compete with the search. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-subtle">
            <DomainMenu value={cat} onChange={setCat} />
            <button type="button" onClick={() => { setDraft(period); setFilterOpen((o) => !o) }} aria-expanded={filterOpen} className="underline underline-offset-2 hover:text-ink">
              {filterActive ? periodLabel : t('ask.filter')}
            </button>
            {filterActive && <button type="button" onClick={() => setPeriod({ from: '', to: '' })} className="underline underline-offset-2 hover:text-ink">{t('ask.removeFilter')}</button>}
          </div>

          {filterOpen && (
            <div className="animate-fade-up flex flex-wrap items-end gap-3 rounded border border-rule bg-surface px-4 py-3">
              <label className="flex flex-col gap-1 text-[13px]">{t('docs.from')}<input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="rounded-[3px] border border-field bg-surface px-2 py-1.5 text-sm" /></label>
              <label className="flex flex-col gap-1 text-[13px]">{t('docs.to')}<input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="rounded-[3px] border border-field bg-surface px-2 py-1.5 text-sm" /></label>
              <div className="flex flex-wrap gap-x-3 text-[13px]">
                {([[1, t('ask.lastYear')], [3, t('ask.last3Years')]] as [number, string][]).map(([n, l]) => (
                  <button key={n} type="button" onClick={() => setDraft({ from: yearsAgo(n), to: '' })} className="underline">{l}</button>
                ))}
              </div>
              <button type="button" onClick={() => { setPeriod(draft); setFilterOpen(false) }} className="ml-auto rounded-[3px] bg-brand px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong">{t('ask.apply')}</button>
            </div>
          )}

          {!hasAnswer && (
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 text-[13px] text-subtle">
              <span>{t('ask.frequent')}:</span>
              {quick.map((q) => <button key={q} type="button" onClick={() => submit(q)} className="text-left underline underline-offset-2 hover:text-ink">{q}</button>)}
            </div>
          )}
        </div>
      </section>

      {/* 2. The answer comes right after the search. */}
      {hasAnswer && (
        <section ref={answerRef} aria-labelledby="answer-q" aria-busy={ask.isPending} className="mx-auto flex w-full max-w-[880px] scroll-mt-4 flex-col gap-4 px-[clamp(16px,4vw,32px)] pb-12 pt-8">
          {/* The question stays in the search box; this heading is for screen readers and keyboard focus. */}
          <h2 id="answer-q" tabIndex={-1} className="sr-only">{t('answer.yourQuestion')}: {asked}</h2>
          {filterActive && <p className="m-0 text-[13px] text-subtle">{periodLabel}</p>}
          <div aria-live="polite">
            {ask.isPending && <ProgressList progress={ask.progress} />}
            {ask.isError && <p role="alert" className="m-0 text-bad">{t(ask.error instanceof ApiError && ask.error.status === 429 ? 'answer.tooMany' : 'answer.error')}</p>}
            {ask.data?.correctedFrom && !ask.isPending && (
              <p className="m-0 mb-3 text-[15px]">
                {t('answer.correctedTo')} <strong className="font-semibold">{ask.data.question}</strong>{' · '}
                <button type="button" onClick={() => submit(ask.data!.correctedFrom!, true)} className="text-[14px] text-subtle underline hover:text-ink">{t('answer.searchExact', { q: ask.data.correctedFrom })}</button>
              </p>
            )}
            {ask.data && !ask.isPending && <AnswerView key={ask.data.id} answer={ask.data} />}
          </div>
          {ask.data && !ask.isPending && (() => {
            const related = (ask.data.related.length ? ask.data.related : quick).filter((q) => q !== asked).slice(0, 4)
            return related.length > 0 && (
              <nav data-noprint="" aria-labelledby="related-h" className="animate-fade-up flex flex-col gap-2 border-t border-rule pt-4">
                <h3 id="related-h" className="m-0 text-[13px] font-semibold text-subtle">{t('answer.similar')}</h3>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {related.map((q) => (
                    <li key={q}>
                      <button type="button" onClick={() => submit(q)} className="rounded-full border border-rule-strong bg-surface px-3.5 py-1.5 text-left text-sm leading-snug hover:border-brand hover:bg-[#f6efe0]">{q}</button>
                    </li>
                  ))}
                </ul>
              </nav>
            )
          })()}
        </section>
      )}

      {/* 3. Personal and secondary tools, visually quieter. */}
      <div className={cn(hasAnswer && 'border-t border-rule')}>
        <section data-noprint="" aria-label={t('home.secondary')} className="mx-auto flex w-full max-w-[880px] flex-col gap-4 px-[clamp(16px,4vw,32px)] pb-14 pt-8">
          {isEmp ? <EmployeePanel /> : <AddressPanel onDistrict={setDistrict} />}
          {!isEmp && <div className="empty:hidden"><MyPetitions /></div>}
        </section>
      </div>
    </>
  )
}
