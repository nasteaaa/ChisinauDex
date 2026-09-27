import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { downloadIcs, parseLocalDate } from '@/lib/ics'
import { setPrefs, usePrefs } from '@/lib/prefs'
import { useLive, useLocate } from './api'

const EXAMPLES = ['bd. Dacia 27', 'str. Alba Iulia 75', 'bd. Ștefan cel Mare și Sfânt 83']

function Row({ title, dot, source, children }: { title: string; dot: 'ok' | 'warn' | 'off'; source: string; children: ReactNode }) {
  const color = dot === 'ok' ? 'var(--ok)' : dot === 'warn' ? 'var(--warn)' : 'var(--rule-strong)'
  return (
    <div className="animate-fade-up flex flex-col gap-0.5 border-t border-rule py-2.5">
      <h3 className="m-0 flex items-center gap-2 text-[13px] font-semibold text-[#3a352c]">
        <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} />{title}
      </h3>
      <div className="text-[15px] leading-[1.45]">{children}</div>
      <span className="text-xs text-subtle">{source}</span>
    </div>
  )
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
const host = (url: string) => url.replace(/^https?:\/\//, '').split('/')[0]

export function AddressPanel({ onDistrict }: { onDistrict: (d: string | undefined) => void }) {
  const { t } = useTranslation()
  const { address, rememberAddress, locationPrompt } = usePrefs()
  const [input, setInput] = useState(address ?? '')
  const [filled, setFilled] = useState(false)
  const [permission, setPermission] = useState<PermissionState | 'unknown'>('unknown')
  const inputRef = useRef<HTMLInputElement>(null)
  const live = useLive(address)
  const locate = useLocate()
  const d = live.data

  useEffect(() => { onDistrict(d?.address.district ?? undefined) }, [d?.address.district, onDistrict])

  const go = (v: string) => { const a = v.trim(); if (a) setPrefs({ address: a }) }

  // Location only fills the field: the user checks the house number and confirms with "Caută".
  const fillFromLocation = () => locate.mutate(undefined, {
    onSuccess: (a) => { setInput(a); setFilled(true); inputRef.current?.focus() }
  })

  // If the browser already allows location for this site, fill the field right away (no prompt appears).
  const { mutate: locateNow } = locate
  useEffect(() => {
    if (address || !navigator.permissions) return
    let cancelled = false
    navigator.permissions.query({ name: 'geolocation' }).then((st) => {
      if (cancelled) return
      setPermission(st.state)
      if (st.state === 'granted') locateNow(undefined, { onSuccess: (a) => { setInput((cur) => cur || a); setFilled(true) } })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [address, locateNow])

  const showAsk = !address && locationPrompt === 'unset' && permission === 'prompt' && !filled && !locate.isPending

  return (
    <aside aria-labelledby="addr-title" className="flex w-full min-w-0 flex-col gap-3 rounded-md border border-rule bg-surface px-5 pb-4 pt-4.5">
      <div className="flex items-baseline justify-between gap-2.5">
        <h2 id="addr-title" className="m-0 text-[17px] font-bold">{address ? t('address.title') : t('address.enter')}</h2>
        {address && <button type="button" onClick={() => { setPrefs({ address: null }); setInput('') }} className="text-sm underline">{t('address.change')}</button>}
      </div>

      {showAsk && (
        <div role="region" aria-label={t('address.askTitle')} className="animate-fade-up flex flex-col gap-2 rounded border border-gold bg-[#fff8e1] px-3.5 py-3">
          <p className="m-0 text-sm font-semibold">{t('address.askTitle')}</p>
          <p className="m-0 text-[13px] leading-snug text-[#3a352c]">{t('address.askText')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setPrefs({ locationPrompt: 'accepted' }); fillFromLocation() }} className="rounded-[3px] border border-brand bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong">{t('address.askYes')}</button>
            <button type="button" onClick={() => setPrefs({ locationPrompt: 'dismissed' })} className="rounded-[3px] border border-brand bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-[#eee2c8]">{t('address.askNo')}</button>
          </div>
        </div>
      )}

      {!address && (
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="-mt-1 mb-0.5 text-sm leading-normal text-subtle">{t('address.intro')}</p>
            <form onSubmit={(e) => { e.preventDefault(); go(input) }} className="flex flex-col gap-1 text-sm">
              <label htmlFor="addr">{t('address.label')}</label>
              <div className="field-group flex rounded-[3px] border border-field bg-surface">
                <input ref={inputRef} id="addr" value={input} onChange={(e) => { setInput(e.target.value); setFilled(false) }} autoComplete="street-address" className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[15px] outline-none" />
                <button type="submit" className="border-l border-rule bg-panel px-3 text-sm font-semibold hover:bg-[#ede4d0]">{t('address.go')}</button>
              </div>
              {filled && <span role="status" className="text-[13px] text-ok">{t('address.filled')}</span>}
            </form>
          </div>
          <div className="flex flex-col gap-2 sm:pt-6">
            <button
              type="button"
              disabled={locate.isPending}
              onClick={fillFromLocation}
              className="flex min-h-9 items-center justify-center gap-2 rounded-[3px] border border-brand bg-surface px-3 text-sm font-semibold hover:bg-[#eee2c8] disabled:opacity-60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></svg>
              {locate.isPending ? t('address.locating') : t('address.locate')}
            </button>
            {locate.isError && <p role="alert" className="m-0 text-[13px] text-bad">{t(`address.locateErr.${locate.error.message}`, { defaultValue: t('common.error') })}</p>}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-subtle">
              <span>{t('address.examples')}</span>
              {EXAMPLES.map((a) => (
                <button key={a} type="button" onClick={() => { setInput(a); go(a) }} className="text-[13px] text-ink underline">{a}</button>
              ))}
            </div>
            <p className="m-0 text-xs leading-relaxed text-subtle">{t('address.locateNote')}</p>
          </div>
        </div>
      )}

      {address && (
        <div aria-live="polite" aria-busy={live.isFetching} className="flex flex-col gap-2">
          <p className="m-0 text-[15px] font-semibold leading-snug">
            {d?.address.label ?? address}
            {d?.address.district && <span className="block text-[13px] font-normal text-subtle">{t('address.sector', { s: t(`district.${d.address.district}`, { defaultValue: d.address.district }) })}</span>}
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#3a352c]">
            <input type="checkbox" checked={rememberAddress} onChange={(e) => setPrefs({ rememberAddress: e.target.checked })} className="size-4 accent-[var(--brand)]" />
            {t('address.remember')}
          </label>
          {live.isPending && <p className="m-0 py-2 text-sm text-subtle">{t('address.loading')}</p>}
          {live.isError && <p role="alert" className="m-0 py-2 text-sm text-bad">{t('common.error')}</p>}
          {d && !d.address.found && <p className="m-0 text-[13px] text-bad">{t('address.notFound')}</p>}

          {d && (
            <div className="grid gap-x-6 sm:grid-cols-3">
              <Row title={t('address.water')} dot={!d.water.ok ? 'off' : d.water.items?.length ? 'warn' : 'ok'} source={`${host(d.water.sourceUrl)} · ${d.water.situationAt ?? hhmm(d.water.fetchedAt)}`}>
                {!d.water.ok ? <span className="text-subtle">{t('address.unavailable')}</span>
                  : d.water.items?.length ? (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {d.water.items.slice(0, 3).map((w) => (
                        <li key={w.ticket + w.address}>
                          <strong className="font-semibold">{w.address}</strong>{w.description ? ` · ${w.description}` : ''}
                          {(w.from || w.to) && <span className="block text-[13px] text-subtle">{w.type === 'planned' ? `${t('address.planned')} · ` : ''}{[w.from, w.to].filter(Boolean).join(' → ')}{w.tankerLocation ? ` · ${w.tankerLocation}` : ''}</span>}
                          {w.type === 'planned' && parseLocalDate(w.from) && (
                            <button
                              type="button"
                              onClick={() => downloadIcs({
                                title: t('address.icsTitle', { address: w.address }),
                                description: [w.description, w.affectedStreets, w.tankerLocation && `${t('address.tanker')}: ${w.tankerLocation}`, 'Apă-Canal Chișinău · acc.md'].filter(Boolean).join('\n'),
                                start: parseLocalDate(w.from)!,
                                end: parseLocalDate(w.to),
                                filename: `apa-${w.ticket || 'deconectare'}.ics`
                              })}
                              className="mt-0.5 text-[13px] font-semibold underline"
                            >
                              {t('address.addCalendar')}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : t('address.waterNone')}
              </Row>
              <Row title={t('address.doctor')} dot={d.doctor.items?.length ? 'ok' : 'off'} source={t('address.doctorHint')}>
                {d.doctor.items?.length ? (
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {d.doctor.items.map((m) => (
                      <li key={m.docId + m.line}>
                        <q className="font-quote">{m.line}</q>
                        <Link to={`/documente/${m.docId}`} className="block text-[13px]">{m.publisher}</Link>
                      </li>
                    ))}
                  </ul>
                ) : <span className="text-subtle">{t('address.doctorNone')}</span>}
              </Row>
              <Row title={t('address.bus')} dot={!d.buses.ok ? 'off' : 'ok'} source={`${host(d.buses.sourceUrl)} · live ${hhmm(d.buses.fetchedAt)}`}>
                {!d.buses.ok ? <span className="text-subtle">{t('address.unavailable')}</span>
                  : d.buses.stops?.length ? (
                    <div className="flex flex-col gap-0.5">
                      <span>{d.buses.stops[0].name} · {d.buses.stops[0].distanceM} m</span>
                      <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm">
                        {(d.buses.vehicles ?? []).filter((v) => v.approaching !== false).slice(0, 4).map((v) => (
                          <li key={v.label + v.route}><strong className="font-semibold">{v.route}</strong> · {v.stopsAway != null ? t('address.stopsAway', { n: v.stopsAway }) : `${v.distanceM} m`}</li>
                        ))}
                      </ul>
                      {!d.buses.vehicles?.length && <span className="text-subtle">{t('address.busNone')}</span>}
                    </div>
                  ) : t('address.busNone')}
              </Row>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
