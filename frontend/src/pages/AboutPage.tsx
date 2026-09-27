import { useTranslation } from 'react-i18next'
import { useSources } from '@/features/documents/api'
import { formatDate } from '@/lib/format'

const STATUSES = [
  ['ok', '●', 'var(--ok)'],
  ['partial', '◐', 'var(--warn)'],
  ['conflict', '◆', 'var(--warn)'],
  ['gap', '○', 'var(--brand)']
] as const

export function AboutPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'ro'
  const sources = useSources()
  const how = t('about.how', { returnObjects: true }) as [string, string][]
  const H2 = 'm-0 font-serif text-[26px] font-semibold'

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-12 px-4 pb-20 pt-12 md:px-8">
      <div className="flex max-w-3xl flex-col gap-4">
        <h1 className="m-0 text-[28px] font-bold leading-tight">{t('about.title')}</h1>
        <p className="m-0 font-serif text-xl leading-normal">{t('about.lead')}</p>
      </div>

      <section aria-labelledby="how-h" className="flex flex-col gap-4">
        <h2 id="how-h" className={H2}>{t('about.howH')}</h2>
        <ol className="m-0 grid list-none gap-px border border-rule bg-rule p-0 sm:grid-cols-2 lg:grid-cols-3">
          {how.map(([h, p], i) => (
            <li key={h} className="flex flex-col gap-2 bg-paper p-5">
              <span className="font-mono text-xs text-brand">0{i + 1}</span>
              <span className="font-serif text-lg font-semibold">{h}</span>
              <span className="text-[14px] leading-relaxed text-subtle">{p}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="st-h" className="flex flex-col gap-3">
        <h2 id="st-h" className={H2}>{t('about.statusH')}</h2>
        <ul className="m-0 flex list-none flex-col p-0">
          {STATUSES.map(([k, glyph, color]) => (
            <li key={k} className="flex items-baseline gap-3 border-t border-rule py-3 font-mono text-[12.5px] uppercase tracking-[0.06em]" style={{ color }}>
              <span aria-hidden="true">{glyph}</span>{t(`answer.status.${k}`)}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-10 md:grid-cols-3">
        {(['roles', 'lang', 'a11y'] as const).map((k) => (
          <section key={k} className="flex flex-col gap-2">
            <h2 className="m-0 font-serif text-xl font-semibold">{t(`about.${k}H`)}</h2>
            <p className="m-0 text-[14.5px] leading-relaxed">{t(`about.${k}`)}</p>
          </section>
        ))}
      </div>

      <section aria-labelledby="src-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="src-h" className={H2}>{t('about.sourcesH')}</h2>
          <span className="font-mono text-[11px] text-subtle">{t('about.sourcesSub')} {formatDate(sources.data?.healthCheckedAt, lang, true)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-ink font-mono text-[11px] uppercase tracking-[0.08em] text-subtle">
                <th scope="col" className="py-2 pr-3 font-normal">{t('about.colSource')}</th>
                <th scope="col" className="py-2 pr-3 font-normal">{t('about.colDomain')}</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">{t('about.colDocs')}</th>
                <th scope="col" className="py-2 font-normal">{t('about.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {sources.data?.sources.map((s) => (
                <tr key={s.id} className="border-b border-rule">
                  <td className="py-2.5 pr-3"><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></td>
                  <td className="py-2.5 pr-3 text-subtle">{t(`cat.${s.category}`)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono">{s.docCount}</td>
                  <td className="py-2.5 text-[13px]">
                    {s.ok === null ? '—' : s.blocked ? <span className="text-warn">● {t('about.blocked')}</span> : s.ok ? <span className="text-ok">● {t('about.up')}</span> : <span className="text-brand">○ {t('about.down')}</span>}
                    {s.tls === 'invalid' && <span className="ml-2 text-warn">{t('about.tlsBad')}</span>}
                    {s.quarantined > 0 && <span className="ml-2 text-brand">{t('about.spam', { n: s.quarantined })}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
