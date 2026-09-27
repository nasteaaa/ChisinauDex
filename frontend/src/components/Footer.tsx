import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useSendFeedback } from '@/features/assistant/api'

/** Dark footer from the design, with the service rating (stored as feedback for answer id "service"). */
export function Footer({ onCookies }: { onCookies: () => void }) {
  const { t } = useTranslation()
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const send = useSendFeedback()
  const labels = t('feedback.stars', { returnObjects: true }) as string[]
  const col = 'flex flex-[1_1_150px] flex-col gap-2 text-sm'
  const head = 'pb-0.5 text-[15px] font-bold'
  const link = 'text-[#f3ece0] hover:text-white'

  return (
    <footer data-noprint="" className="mt-auto bg-ink text-[#f3ece0]">
      <div className="mx-auto flex max-w-[1240px] flex-wrap gap-x-10 gap-y-8 px-[clamp(16px,4vw,32px)] pb-7 pt-10">
        <div className="flex flex-[1_1_220px] flex-col gap-1.5 text-sm leading-normal">
          <span className="text-lg font-bold">{t('app.title')}</span>
          <span>{t('app.cityHall')}</span>
          <span className="text-[#c9bfa8]">bd. Ștefan cel Mare și Sfânt 83<br />MD-2012 Chișinău</span>
        </div>
        <div className={col}>
          <span className={head}>{t('footer.services')}</span>
          <Link to="/" className={link}>{t('nav.assistant')}</Link>
          <Link to="/documente" className={link}>{t('nav.documents')}</Link>
        </div>
        <div className={col}>
          <span className={head}>{t('footer.info')}</span>
          <Link to="/despre" className={link}>{t('footer.about')}</Link>
          <Link to="/accesibilitate" className={link}>{t('footer.a11y')}</Link>
          <Link to="/confidentialitate" className={link}>{t('footer.privacy')}</Link>
          <button type="button" onClick={onCookies} className={`${link} text-left underline underline-offset-2`}>{t('footer.cookies')}</button>
        </div>
        <div className="flex flex-[1_1_280px] flex-col gap-2 text-sm">
          <span className={head}>{t('footer.rate')}</span>
          {send.isSuccess ? (
            <span role="status">{t('footer.rateThanks')}</span>
          ) : (
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (stars) send.mutate({ answerId: 'service', stars, tags: [], comment: comment.trim() || undefined }) }}>
              <div className="flex items-center gap-2.5">
                <div role="group" aria-label={t('footer.rate')} className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" aria-label={t('feedback.starLabel', { n })} aria-pressed={stars === n} onClick={() => setStars(n)} className={`px-0.5 text-2xl leading-none ${n <= stars ? 'text-gold' : 'text-[#6b6255]'}`}>★</button>
                  ))}
                </div>
                <span className="text-[#c9bfa8]">{labels[stars] || t('footer.pick')}</span>
              </div>
              <label htmlFor="svc-comment" className="-mb-1 text-[13px] text-[#c9bfa8]">{t('footer.comment')}</label>
              <textarea id="svc-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="w-full resize-y rounded-[3px] border border-[#a89b81] bg-[#171310] px-2.5 py-2 text-sm text-[#f3ece0] outline-none" />
              <div><button type="submit" disabled={!stars} className="rounded-[3px] bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink disabled:opacity-50">{t('feedback.send')}</button></div>
            </form>
          )}
        </div>
      </div>
      <div className="border-t border-[#3a352c]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-3 px-[clamp(16px,4vw,32px)] py-3.5 text-[13px] text-[#c9bfa8]">
          <span>© 2026 {t('app.cityHall')}</span>
          <span className="max-w-2xl">{t('footer.text')}</span>
        </div>
      </div>
    </footer>
  )
}
