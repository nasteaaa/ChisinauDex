// Small helpers shared by the live-data modules.

export const TIMEOUT_MS = 8000
export const UA = 'ChisinauDex/0.1 (Chisinau municipal assistant, DeepTech GigaHack 2026)'

export async function fetchText (url: string, init: RequestInit = {}): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, 'Accept-Language': 'ro', ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`)
  return res.text()
}

export async function fetchJson<T> (url: string, init: RequestInit = {}): Promise<T> {
  return JSON.parse(await fetchText(url, { ...init, headers: { Accept: 'application/json', ...init.headers } })) as T
}

/** Remembers the value of an async function per key for `ttlMs`. Failures are not cached. */
export function cached<T> (ttlMs: number, fn: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const store = new Map<string, { at: number, value: Promise<T> }>()
  return (key) => {
    const hit = store.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value
    const value = fn(key)
    store.set(key, { at: Date.now(), value })
    value.catch(() => store.delete(key))
    return value
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R> (items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []
  let next = 0
  async function worker (): Promise<void> {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export function distanceM (a: { lat: number, lng: number }, b: { lat: number, lng: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)))
}

// Cyrillic letters that look Latin (some official lists mix them in, e.g. "Мaге").
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', к: 'k', м: 'm', т: 't', н: 'h', в: 'b', г: 'r', і: 'i'
}

/** Lowercase, no diacritics; â and î both become i so old/new spellings (Bătrîn/Bătrân) agree. */
export function normalize (s: string): string {
  return s.toLowerCase()
    .replace(/[а-яі]/g, (c) => HOMOGLYPHS[c] ?? c)
    .replace(/[âî]/g, 'i')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Street-type prefixes and filler words that should not decide a match.
const STOPWORDS = new Set([
  'str', 'strada', 'str-la', 'stradela', 'bd', 'bld', 'bul', 'bulevardul', 'sos', 'soseaua', 'pr', 'prospect',
  'al', 'aleea', 'piata', 'pta', 'nr', 'si', 'de', 'la', 'lui', 'sect', 'mun', 'chisinau', 'or'
])

/**
 * Significant tokens of a street name: "bd. Ştefan cel Mare" → ['stefan', 'cel', 'mare'].
 * Abbreviations keep their dot ("Mitr." → 'mitr.') so they can match the full word.
 */
export function streetTokens (street: string): string[] {
  return (normalize(street).match(/[a-z0-9]+\.?/g) ?? [])
    .filter((t) => {
      const word = t.replace('.', '')
      return word.length >= 3 && !/^\d/.test(word) && !STOPWORDS.has(word)
    })
}

function tokenMatch (a: string, b: string): boolean {
  const [x, y] = [a.replace('.', ''), b.replace('.', '')]
  if (x === y || x.replace(/a/g, 'i') === y.replace(/a/g, 'i')) return true
  // "mitr." ~ "mitropolit"
  return (a.endsWith('.') && y.startsWith(x)) || (b.endsWith('.') && x.startsWith(y))
}

/**
 * Two street names match when every token of the shorter one is in the longer one.
 * A one-word name only matches a name of at most two words, so "Mare" does not match "Ştefan cel Mare".
 */
export function sameStreet (a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length === 1 && long.length > 2) return false
  return short.every((t) => long.some((u) => tokenMatch(t, u)))
}
