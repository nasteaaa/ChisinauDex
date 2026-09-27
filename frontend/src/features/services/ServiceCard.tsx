import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { Service } from './api'

function Fact({ label, value, quote }: { label: string; value?: string; quote?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-subtle">{label}</dt>
      {value
        ? <dd className="m-0 text-[17px] font-bold leading-snug" title={quote}>{value}</dd>
        : <dd className="m-0 text-sm font-semibold text-bad">{t('services.notPublished')}</dd>}
    </div>
  )
}

/** Deadline, fee and documents for one service, each copied from the institution's own page. */
export function ServiceCard({ s, compact = false }: { s: Service; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <article className="flex flex-col gap-3 rounded border border-rule bg-surface px-5 py-4.5">
      <div className="flex flex-col gap-0.5">
        {compact && <span className="text-[13px] font-bold text-brand">{t('services.cardTitle')}</span>}
        <h3 className="m-0 text-base font-bold leading-snug">{s.title}</h3>
        <span className="text-[13px] text-subtle">{s.institution}</span>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-3 border-y border-rule-soft py-3">
        <Fact label={t('services.term')} value={s.term?.value} quote={s.term?.quote} />
        <Fact label={t('services.fee')} value={s.fee?.value} quote={s.fee?.quote} />
      </dl>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-subtle">{t('services.documents')}</span>
        {s.documents.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {s.documents.map((d) => (
              <li key={d} className="flex gap-2 text-[14.5px] leading-snug"><span aria-hidden="true" className="text-ok">✓</span>{d}</li>
            ))}
          </ul>
        ) : <span className="text-sm font-semibold text-bad">{t('services.notPublished')}</span>}
      </div>
      {s.missing.length > 0 && <p className="m-0 text-[13px] text-subtle">{t('services.missingNote')}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href={s.contactUrl} target="_blank" rel="noreferrer" className="font-semibold">{t('answer.openContact')} ↗</a>
        <a href={s.url} target="_blank" rel="noreferrer">{t('services.officialPage')} ↗</a>
        <Link to={`/documente/${s.docId}`}>{t('answer.openDoc')}</Link>
        {compact && <Link to="/servicii">{t('services.all')}</Link>}
      </div>
    </article>
  )
}
