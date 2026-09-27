import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/format'
import { ANSWER_DAYS, daysLeft, forgetPetition, usePetitionStatuses, useSentPetitions } from '@/lib/petitions'

/** Petitions sent from this browser: status and reply from City Hall staff, and the legal answer period. */
export function MyPetitions() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'ro'
  const sent = useSentPetitions()
  const statuses = usePetitionStatuses(sent.map((p) => p.id))
  if (!sent.length) return null
  const byId = new Map((statuses.data ?? []).map((s) => [s.id, s]))

  return (
    <section aria-labelledby="pet-title" className="flex flex-col gap-2 rounded-md border border-rule bg-surface px-4 py-3.5">
      <h2 id="pet-title" className="m-0 text-[15px] font-bold">{t('petitions.title')}</h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {sent.map((p) => {
          const st = byId.get(p.id)
          const left = daysLeft(p.sentAt)
          const answered = st?.status === 'answered'
          const color = answered ? 'var(--ok)' : left < 0 ? 'var(--bad)' : left <= 5 ? 'var(--warn)' : 'var(--subtle)'
          return (
            <li key={p.id} className="flex flex-col gap-0.5 border-t border-rule-soft py-2 first:border-t-0">
              <span className="text-[13px] font-semibold text-subtle">{p.ticket} · {p.institution}</span>
              <span className="text-[14.5px] font-semibold leading-snug">{p.question}</span>
              <span className="text-[13px] font-semibold" style={{ color }}>
                {answered ? t('petitions.statusAnswered')
                  : st?.status === 'in_progress' ? t('petitions.statusInProgress')
                  : left >= 0 ? t('petitions.daysLeft', { n: left, total: ANSWER_DAYS }) : t('petitions.overdue', { n: -left })}
              </span>
              {st?.reply && <p className="m-0 border-l-2 border-ok pl-2.5 text-sm leading-relaxed">{st.reply}</p>}
              {!answered && left < 0 && <span className="text-[13px] leading-snug">{t('petitions.overdueHelp')} <a href={p.contactUrl} target="_blank" rel="noreferrer">{t('answer.openContact')} ↗</a></span>}
              <span className="flex gap-3 text-xs text-subtle">
                {t('petitions.sentOn', { d: formatDate(p.sentAt, lang) })}
                <button type="button" onClick={() => forgetPetition(p.id)} className="underline">{t('petitions.forget')}</button>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
