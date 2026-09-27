import { useTranslation } from 'react-i18next'

export function PrivacyPage() {
  const { t } = useTranslation()
  const sections = t('privacy.sections', { returnObjects: true }) as [string, string][]
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-4 pb-20 pt-12 md:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] font-bold leading-tight">{t('privacy.title')}</h1>
        <p className="m-0 font-mono text-xs text-subtle">{t('privacy.updated')}</p>
      </div>
      {sections.map(([h, p]) => (
        <section key={h} className="flex flex-col gap-2 border-t border-rule pt-5">
          <h2 className="m-0 font-serif text-[22px] font-semibold">{h}</h2>
          <p className="m-0 text-[15.5px] leading-relaxed">{p}</p>
        </section>
      ))}
    </div>
  )
}
