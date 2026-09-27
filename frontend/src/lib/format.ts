const LOCALE: Record<string, string> = { ro: 'ro-RO', ru: 'ru-RU', en: 'en-GB' }

export const locale = (lang?: string) => LOCALE[lang ?? 'ro'] ?? 'ro-RO'

export function formatDate(iso: string | undefined, lang: string, withTime = false): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale(lang), withTime
    ? { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatNumber(n: number, lang: string): string {
  return Math.round(n).toLocaleString(locale(lang))
}
