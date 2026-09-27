import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'

/** Accessibility statement (EU Web Accessibility Directive 2016/2102, EN 301 549) with a problem-report form. */
export function AccessibilityPage() {
  const { t } = useTranslation()
  const [msg, setMsg] = useState('')
  const report = useMutation({
    mutationFn: (message: string) => api<{ ok: boolean }>('/api/reports', { method: 'POST', body: JSON.stringify({ kind: 'accessibility', message }) })
  })
  const sections = t('statement.sections', { returnObjects: true }) as [string, string][]

  return (
    <section className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-[clamp(16px,4vw,32px)] pb-18 pt-10">
      <div className="flex flex-col gap-2">
        <h1 tabIndex={-1} className="m-0 text-[28px] font-bold leading-tight outline-none">{t('statement.title')}</h1>
        <p className="m-0 text-[15px] leading-relaxed">{t('statement.intro')}</p>
      </div>
      {sections.map(([h, p]) => (
        <div key={h} className="flex flex-col gap-1.5 border-t border-rule pt-4">
          <h2 className="m-0 text-lg font-bold">{h}</h2>
          <p className="m-0 whitespace-pre-line text-[15px] leading-relaxed">{p}</p>
        </div>
      ))}
      <form
        className="flex flex-col gap-2 rounded border border-rule bg-surface px-5 py-4.5"
        onSubmit={(e) => { e.preventDefault(); if (msg.trim().length >= 5) report.mutate(msg.trim()) }}
      >
        {report.isSuccess ? (
          <p role="status" className="m-0 text-[15px]">{t('statement.formDone')}</p>
        ) : (
          <>
            <label htmlFor="a11y-report" className="text-[15px] font-semibold">{t('statement.formLabel')}</label>
            <textarea id="a11y-report" value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} className="w-full resize-y rounded-[3px] border border-field bg-surface px-3 py-2.5 text-[15px] outline-none" />
            <div className="flex items-center gap-3">
              <button type="submit" disabled={msg.trim().length < 5 || report.isPending} className="rounded-[3px] border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">{t('feedback.send')}</button>
              {report.isError && <span role="alert" className="text-[13px] text-bad">{t('common.error')}</span>}
            </div>
          </>
        )}
      </form>
    </section>
  )
}
