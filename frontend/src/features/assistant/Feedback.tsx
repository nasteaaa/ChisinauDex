import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useSendFeedback } from './api'

export function Feedback({ answerId }: { answerId: string }) {
  const { t } = useTranslation()
  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const send = useSendFeedback()
  const labels = t('feedback.stars', { returnObjects: true }) as string[]
  const tagList = t('feedback.tags', { returnObjects: true }) as string[]

  if (send.isSuccess) {
    return <p role="status" className="m-0 text-[13px]">{t('feedback.thanks', { n: stars })}</p>
  }

  return (
    <form
      data-noprint=""
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (stars) send.mutate({ answerId, stars, tags, comment: comment.trim() || undefined })
      }}
    >
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="text-[13px] font-semibold text-ink">{t('feedback.title')}</span>
        <div role="group" aria-label={t('feedback.title')} className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={t('feedback.starLabel', { n })} aria-pressed={stars === n} onClick={() => setStars(n)} className={cn('px-0.5 text-[22px] leading-none transition-transform hover:scale-110', n <= stars ? 'text-gold' : 'text-rule-strong')}>★</button>
          ))}
        </div>
        <span aria-live="polite" className="text-sm text-subtle">{labels[stars]}</span>
      </div>
      {stars > 0 && (
        <div className="animate-fade-up flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            {tagList.map((tag) => {
              const on = tags.includes(tag)
              return (
                <button key={tag} type="button" aria-pressed={on} onClick={() => setTags((ts) => (on ? ts.filter((x) => x !== tag) : [...ts, tag]))} className={cn('min-h-8 rounded-[3px] border px-3 text-[13px]', on ? 'border-brand bg-brand text-white' : 'border-rule-strong bg-surface')}>
                  {tag}
                </button>
              )
            })}
          </div>
          <label htmlFor={`fbc-${answerId}`} className="-mb-1.5 text-sm text-[#3a352c]">{t('feedback.commentLabel')}</label>
          <textarea id={`fbc-${answerId}`} value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full max-w-[620px] resize-y rounded-[3px] border border-field bg-surface px-3 py-2.5 text-[15px] leading-normal outline-none" />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={!stars || send.isPending} className="rounded-[3px] border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">{t('feedback.send')}</button>
            {send.isError && <span role="alert" className="text-[13px] text-bad">{t('common.error')}</span>}
          </div>
        </div>
      )}
    </form>
  )
}
