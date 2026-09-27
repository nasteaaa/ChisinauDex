import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/format'
import { usePetitionInbox, useUpdatePetition, type InboxPetition } from './api'

const BTN = 'rounded-[3px] border border-brand bg-surface px-3 py-1 text-sm font-semibold hover:bg-[#eee2c8]'
const BTN_DARK = 'rounded-[3px] border border-brand bg-brand px-3 py-1 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40'

function Row({ p }: { p: InboxPetition }) {
  const { t, i18n } = useTranslation()
  const update = useUpdatePetition()
  const [reply, setReply] = useState('')
  const [open, setOpen] = useState(false)
  const statusColor = p.status === 'answered' ? 'var(--ok)' : p.status === 'in_progress' ? 'var(--warn)' : 'var(--bad)'
  return (
    <div className="flex flex-col gap-1.5 border-b border-rule px-4.5 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-subtle">{p.ticket} · {p.institution} · {formatDate(p.at, i18n.resolvedLanguage ?? 'ro', true)}</span>
        <span className="text-[13px] font-bold" style={{ color: statusColor }}>{t(`dash.petitionStatus.${p.status}`)}</span>
      </div>
      <span className="text-base font-semibold leading-snug">{p.question}</span>
      <p className="m-0 whitespace-pre-line text-sm leading-relaxed text-[#3a352c]">{p.message}</p>
      {p.reply && <p className="m-0 border-l-2 border-ok pl-2.5 text-sm">{p.reply}</p>}
      {p.status !== 'answered' && (
        <div className="flex flex-col gap-2 pt-1">
          {open ? (
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); update.mutate({ id: p.id, status: 'answered', reply: reply.trim() }) }}>
              <label htmlFor={`reply-${p.id}`} className="text-[13px] font-semibold">{t('dash.replyLabel')}</label>
              <textarea id={`reply-${p.id}`} value={reply} onChange={(e) => setReply(e.target.value)} rows={3} className="w-full resize-y rounded-[3px] border border-field bg-surface px-3 py-2 text-sm outline-none" />
              <div className="flex gap-2">
                <button type="submit" disabled={reply.trim().length < 5 || update.isPending} className={BTN_DARK}>{t('dash.sendReply')}</button>
                <button type="button" onClick={() => setOpen(false)} className="text-sm underline">{t('answer.petitionClose')}</button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {p.status === 'new' && <button type="button" onClick={() => update.mutate({ id: p.id, status: 'in_progress' })} className={BTN}>{t('dash.takePetition')}</button>}
              <button type="button" onClick={() => setOpen(true)} className={BTN_DARK}>{t('dash.answerPetition')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Questions residents sent because the documents did not answer them. */
export function PetitionsInbox({ dept }: { dept: string }) {
  const { t } = useTranslation()
  const inbox = usePetitionInbox()
  const items = (inbox.data ?? []).filter((p) => !dept || p.sourceId === dept)
  const open = items.filter((p) => p.status !== 'answered').length
  return (
    <div className="flex flex-col overflow-hidden rounded border border-rule bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule bg-panel px-4.5 py-3.5">
        <h2 className="m-0 text-lg font-bold">{t('dash.petitionsTitle')}</h2>
        <span className="rounded-[3px] px-2 py-0.5 text-[13px] font-bold text-white" style={{ background: open ? 'var(--warn)' : 'var(--ok)' }}>{open}</span>
      </div>
      {items.length === 0 && <div className="p-4.5 text-sm text-subtle">{t('dash.petitionsEmpty')}</div>}
      {items.map((p) => <Row key={p.id} p={p} />)}
    </div>
  )
}
