import { useTranslation } from 'react-i18next'
import type { Progress } from './api'

/** The pipeline stages the backend actually went through, as they stream in. */
export function ProgressList({ progress }: { progress: Progress[] }) {
  const { t, i18n } = useTranslation()
  const n = (v: number) => v.toLocaleString(i18n.resolvedLanguage)
  const label = (p: Progress): string => {
    switch (p.step) {
      case 'expand': return t('answer.progress.expand')
      case 'search': return t('answer.progress.search', { docs: n(p.docs), passages: n(p.passages) })
      case 'found': return t('answer.progress.found', { passages: p.passages, docs: p.docs })
      case 'live': return t('answer.progress.live', { sites: p.sites })
      case 'liveDone': return t('answer.progress.liveDone', { found: p.found })
      case 'compose': return p.mode === 'ai' ? t('answer.progress.composeAi') : t('answer.progress.composeFallback')
      case 'verify': return t('answer.progress.verify', { kept: p.kept, dropped: p.dropped })
    }
  }
  // 6 stages in fallback mode (search, found, live, liveDone, compose, verify), 5 with AI (expand instead of live).
  const width = `${Math.min(100, Math.round((100 * progress.length) / 6))}%`
  return (
    <div className="animate-fade-up flex flex-col gap-3 rounded border border-rule bg-surface px-5.5 py-4.5">
      <div className="h-1 overflow-hidden rounded-sm bg-track"><div className="h-full bg-brand transition-[width] duration-500" style={{ width }} /></div>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-[15px]">
        {progress.length === 0 && <li className="flex items-center gap-2.5 text-subtle"><span className="w-4.5 text-center font-bold">…</span>{t('answer.progress.waiting')}</li>}
        {progress.map((p, i) => {
          const done = i < progress.length - 1
          return (
            <li key={i} className={done ? 'flex items-center gap-2.5 text-ink' : 'flex items-center gap-2.5 text-subtle'}>
              <span aria-hidden="true" className={done ? 'w-4.5 text-center font-bold text-ok' : 'w-4.5 animate-pulse text-center font-bold'}>{done ? '✓' : '…'}</span>{label(p)}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
