import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-4 px-4 py-20 md:px-8">
      <h1 className="m-0 text-[28px] font-bold">{t('notFound')}</h1>
      <Link to="/" className="self-start text-[15px] font-medium">← {t('backHome')}</Link>
    </div>
  )
}
