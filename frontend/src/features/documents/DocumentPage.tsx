import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCountView, useDocument } from './api'

type Tab = 'short' | 'full' | 'files'

export function DocumentPage() {
  const { id = '' } = useParams()
  return <DocumentView key={id} id={id} />
}

function DocumentView({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'ro'
  const doc = useDocument(id)
  const countView = useCountView()
  const [tab, setTab] = useState<Tab>('short')
  const [views, setViews] = useState<number | null>(null)

  useEffect(() => {
    countView.mutate(id, { onSuccess: (r) => setViews(r.views) })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (doc.isPending) return <p className="p-8 text-subtle">{t('common.loading')}</p>
  if (doc.isError || !doc.data) return <p role="alert" className="p-8">{t('doc.notFound')} <Link to="/documente">{t('doc.back')}</Link></p>
  const d = doc.data

  const tabs: [Tab, string][] = [['short', t('doc.short')], ['full', t('doc.full')], ['files', t('doc.files')]]
  const meta: [string, React.ReactNode][] = [
    [t('doc.published'), formatDate(d.publishedAt, lang, true) || '—'],
    [t('doc.updated'), formatDate(d.updatedAt, lang) || '—'],
    [t('doc.type'), t(`docs.types.${d.type}`)],
    [t('doc.publisher'), d.publisher],
    [t('doc.views'), String(views ?? d.views)]
  ]

  return (
    <div className="flex-1 bg-[oklch(0.955_0.006_85)]">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-20 pt-8 md:px-8">
        <Link to="/documente" className="self-start text-sm font-medium">← {t('doc.back')}</Link>
        <div className="flex flex-wrap items-start gap-6">
          <article aria-labelledby="doc-title" className="flex min-w-0 flex-[1_1_600px] flex-col gap-6 border border-rule bg-paper px-5 py-7 shadow-[0_1px_2px_rgba(38,42,49,0.06)] sm:px-8">
            <h1 id="doc-title" className="m-0 font-serif text-[clamp(26px,3.4vw,36px)] font-semibold leading-[1.15] tracking-[-0.01em] text-pretty">{d.title}</h1>
            {d.integrity === 'quarantined' && (
              <p role="note" className="m-0 border-l-[3px] border-brand bg-panel px-4 py-3 text-sm">{t('doc.quarantine', { reason: d.integrityReason ?? '' })}</p>
            )}
            <div role="tablist" aria-label={d.title} className="flex flex-wrap gap-x-7 gap-y-2">
              {tabs.map(([k, label]) => (
                <button
                  key={k}
                  id={`tab-${k}`}
                  role="tab"
                  type="button"
                  aria-selected={tab === k}
                  aria-controls={`panel-${k}`}
                  onClick={() => setTab(k)}
                  className={cn('min-h-8 text-[15px]', tab === k ? 'font-medium text-ink underline decoration-2 underline-offset-[6px]' : 'text-subtle hover:text-ink')}
                >
                  {label}{k === 'files' && d.files.length ? ` (${d.files.length})` : ''}
                </button>
              ))}
            </div>
            <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex flex-col gap-4">
              {tab === 'short' && (
                <>
                  <p className="m-0 whitespace-pre-line font-serif text-[18px] leading-[1.65]">{d.summary || d.excerpt}</p>
                  <a href={d.url} target="_blank" rel="noreferrer" className="self-start text-sm font-medium">{t('doc.openOnSite')} ↗</a>
                </>
              )}
              {tab === 'full' && <div className="whitespace-pre-line font-serif text-[17px] leading-[1.7]">{d.text}</div>}
              {tab === 'files' && (d.files.length === 0
                ? <p className="m-0 text-subtle">{t('doc.noFiles')}</p>
                : (
                  <ul className="m-0 list-none p-0">
                    {d.files.map((f) => (
                      <li key={f.url} className="border-t border-rule py-3">
                        <a href={f.url} target="_blank" rel="noreferrer" className="text-[15px]">↓ {f.name || f.url.split('/').pop()}</a>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </article>

          <aside className="flex w-full flex-col gap-5 md:w-[300px]">
            <dl className="m-0 flex flex-col gap-5 border border-rule bg-paper px-5 py-6 shadow-[0_1px_2px_rgba(38,42,49,0.06)]">
              {meta.map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1">
                  <dt className="text-[13px] text-subtle">{k}</dt>
                  <dd className="m-0 text-[15px] font-semibold leading-snug">{v}</dd>
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <dt className="text-[13px] text-subtle">{t('doc.source')}</dt>
                <dd className="m-0 flex flex-col gap-1 text-sm">
                  <a href={d.sourceUrl} target="_blank" rel="noreferrer">{d.sourceName} ↗</a>
                  {d.contactUrl && <a href={d.contactUrl} target="_blank" rel="noreferrer">{t('doc.contact')} ↗</a>}
                </dd>
              </div>
            </dl>
            {d.related.length > 0 && (
              <nav aria-labelledby="related-h" className="flex flex-col border border-rule bg-paper px-5 py-5">
                <h2 id="related-h" className="m-0 pb-2 font-mono text-[11px] font-normal uppercase tracking-[0.1em] text-subtle">{t('doc.related')}</h2>
                {d.related.map((r) => (
                  <Link key={r.id} to={`/documente/${r.id}`} className="border-t border-rule py-2.5 text-[14px] leading-snug text-ink hover:text-brand">{r.title}</Link>
                ))}
              </nav>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
