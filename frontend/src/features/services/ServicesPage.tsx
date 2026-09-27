import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useServices } from './api'
import { ServiceCard } from './ServiceCard'

/** Every municipal service we could index, with its legal deadline, fee and documents to bring. */
export function ServicesPage() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const services = useServices(q.trim())

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-[clamp(16px,4vw,32px)] pb-18 pt-10">
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 tabIndex={-1} className="m-0 text-[28px] font-bold leading-tight outline-none">{t('services.title')}</h1>
        <p className="m-0 text-[15px] leading-relaxed text-subtle">{t('services.sub')}</p>
      </div>
      <div className="field-group flex max-w-[640px] rounded-[3px] border-2 border-ink bg-surface">
        <label htmlFor="svc-q" className="sr-only">{t('services.search')}</label>
        <input id="svc-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('services.search')} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base outline-none" />
      </div>
      <p aria-live="polite" className="m-0 text-sm text-subtle">{t('services.count', { n: services.data?.total ?? 0 })}</p>
      {services.isError && <p role="alert" className="text-bad">{t('common.error')}</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {services.data?.items.map((s) => <ServiceCard key={s.docId} s={s} />)}
      </div>
      <p className="m-0 max-w-3xl text-[13px] leading-relaxed text-subtle">{t('services.footnote')}</p>
    </section>
  )
}
