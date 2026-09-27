import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DEFAULT_A11Y, setPrefs, usePrefs, type A11y } from '@/lib/prefs'
import { cn } from '@/lib/utils'

/** Floating accessibility button (bottom-right) with its settings popover, as in the design. */
export function A11yPanel() {
  const { t } = useTranslation()
  const { a11y } = usePrefs()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const set = (patch: Partial<A11y>) => setPrefs({ a11y: { ...a11y, ...patch } })

  useEffect(() => {
    if (!open) return
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open])

  const toggles: [keyof A11y, string, string, string, string][] = [
    ['contrast', 'high', 'normal', t('a11y.contrast'), t('a11y.contrastDesc')],
    ['font', 'readable', 'default', t('a11y.font'), t('a11y.fontDesc')],
    ['spacing', 'wide', 'normal', t('a11y.spacing'), t('a11y.spacingDesc')],
    ['links', 'underline', 'default', t('a11y.links'), t('a11y.linksDesc')]
  ]
  const sizes: [A11y['size'], string, string][] = [['100', 'A', '14px'], ['115', 'A', '17px'], ['130', 'A', '20px'], ['150', 'A', '23px']]
  const cbs: [A11y['cb'], string][] = [['none', t('a11y.cbNone')], ['safe', t('a11y.cbSafe')], ['mono', t('a11y.cbMono')]]

  return (
    <div ref={ref} data-noprint="" className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-3">
      {open && (
        <div role="dialog" aria-labelledby="a11y-title" className="animate-pop flex max-h-[calc(100vh-120px)] w-[min(340px,calc(100vw-48px))] origin-bottom-right flex-col overflow-auto rounded border border-rule-strong bg-surface shadow-[0_8px_28px_rgba(0,0,0,.2)]">
          <div className="flex items-center justify-between border-b border-rule px-4 py-3.5">
            <h2 id="a11y-title" className="m-0 text-[17px] font-bold">{t('a11y.title')}</h2>
            <button ref={closeBtn} type="button" onClick={() => { setOpen(false); btn.current?.focus() }} aria-label={t('a11y.close')} className="px-1.5 text-[22px] leading-none">×</button>
          </div>
          <div className="flex flex-col gap-2 border-b border-rule px-4 py-3.5">
            <span className="text-sm font-semibold">{t('a11y.size')}</span>
            <div className="flex overflow-hidden rounded-[3px] border border-field">
              {sizes.map(([v, label, fs]) => (
                <button key={v} type="button" aria-pressed={a11y.size === v} onClick={() => set({ size: v })} style={{ fontSize: fs }} className={cn('flex-1 py-2 font-bold', a11y.size === v ? 'bg-brand text-white' : 'bg-surface text-ink')}>{label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 border-b border-rule px-4 py-3.5">
            <span className="text-sm font-semibold">{t('a11y.cb')}</span>
            <div className="flex overflow-hidden rounded-[3px] border border-field">
              {cbs.map(([v, label]) => (
                <button key={v} type="button" aria-pressed={a11y.cb === v} onClick={() => set({ cb: v })} className={cn('min-h-9 flex-1 px-1 text-[13px] font-semibold', a11y.cb === v ? 'bg-brand text-white' : 'bg-surface text-ink')}>{label}</button>
              ))}
            </div>
          </div>
          {toggles.map(([key, on, off, label, desc]) => {
            const checked = a11y[key] === on
            return (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => set({ [key]: checked ? off : on } as Partial<A11y>)}
                className="flex items-center justify-between gap-3 border-b border-rule bg-surface px-4 py-3 text-left"
              >
                <span className="flex flex-col gap-px"><span className="text-[15px] font-semibold">{label}</span><span className="text-[13px] leading-snug text-subtle">{desc}</span></span>
                <span aria-hidden="true" className={cn('relative h-[22px] w-10 flex-none rounded-full', checked ? 'bg-brand' : 'bg-field')}>
                  <span className="absolute top-0.5 size-[18px] rounded-full bg-surface transition-[left]" style={{ left: checked ? 20 : 2 }} />
                </span>
              </button>
            )
          })}
          <div className="flex flex-wrap justify-between gap-3 px-4 py-3">
            <button type="button" onClick={() => setPrefs({ a11y: DEFAULT_A11Y })} className="text-sm underline">{t('a11y.reset')}</button>
            <Link to="/accesibilitate" onClick={() => setOpen(false)} className="text-sm">{t('footer.a11y')}</Link>
          </div>
        </div>
      )}
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('a11y.open')}
        aria-expanded={open}
        className="grid size-14 place-items-center rounded-full border-2 border-white bg-brand p-0 text-white shadow-[0_2px_10px_rgba(0,0,0,.3)] transition-transform hover:scale-105"
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="4.2" r="2.1" /><path d="M4.2 7.6l.5-1.6c2.4.7 4.8 1.1 7.3 1.1s4.9-.4 7.3-1.1l.5 1.6c-1.8.6-3.6 1-5.4 1.2v4.1l1.9 7.6-1.7.4-2-6.9h-1.2l-2 6.9-1.7-.4 1.9-7.6V8.8c-1.8-.2-3.6-.6-5.4-1.2z" /></svg>
      </button>
    </div>
  )
}
