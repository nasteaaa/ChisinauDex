// Calendar file (.ics) for a planned outage, built in the browser. Nothing is sent anywhere.

/** Parses "25.09.2026 09:00" or "25.09.2026" as local time. */
export function parseLocalDate(s: string | null): Date | null {
  const m = s?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0))
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

export function downloadIcs(opts: { title: string; description: string; start: Date; end: Date | null; filename: string }) {
  const end = opts.end && opts.end > opts.start ? opts.end : new Date(opts.start.getTime() + 3600000)
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ChisinauDex//RO',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@chisinaudex`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(opts.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(opts.title)}`,
    `DESCRIPTION:${esc(opts.description)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(opts.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: opts.filename })
  a.click()
  URL.revokeObjectURL(url)
}
