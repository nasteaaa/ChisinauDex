import type { District } from '../corpus/types'
import { cached, fetchJson, normalize } from './util'

export interface GeoAddress {
  label: string
  lat: number
  lng: number
  district: District | null
  /** Street name as OSM knows it, e.g. "Bulevardul Dacia". */
  road: string | null
  houseNumber: string | null
  /** Town for addresses outside the city proper (Durlești, Codru, ...). */
  locality: string | null
}

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
  address: Record<string, string | undefined>
}

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
// Chișinău municipality bounding box (left, top, right, bottom): the app only serves Chișinău.
const VIEWBOX = '28.60,47.16,29.10,46.84'

const DISTRICTS: [string, District][] = [
  ['centru', 'centru'], ['botanica', 'botanica'], ['buiucani', 'buiucani'], ['ciocana', 'ciocana'],
  ['riscani', 'riscani'], ['rascani', 'riscani']
]

export function toDistrict (text: string | undefined): District | null {
  if (!text) return null
  const n = normalize(text)
  return DISTRICTS.find(([name]) => n.includes(name))?.[1] ?? null
}

// Nominatim usage policy: max 1 request/s. Requests are chained so they never overlap.
let queue: Promise<unknown> = Promise.resolve()
let lastCall = 0

function throttled<T> (fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + 1100 - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastCall = Date.now()
    return fn()
  })
  queue = run.catch(() => undefined)
  return run
}

const search = cached(24 * 3600 * 1000, async (query: string): Promise<GeoAddress | null> => {
  const params = new URLSearchParams({
    format: 'jsonv2', addressdetails: '1', countrycodes: 'md', limit: '5', viewbox: VIEWBOX, bounded: '1', q: query
  })
  const hits = await throttled(() => fetchJson<NominatimResult[]>(`${SEARCH_URL}?${params}`))
  // Prefer the exact house number typed ("75", not "75/10") when OSM has several buildings.
  const words = query.split(/[\s,]+/)
  const hit = hits.find((h) => h.address.house_number && words.includes(h.address.house_number.toLowerCase())) ?? hits[0]
  if (!hit) return null
  const a = hit.address
  const city = a.city ?? a.town ?? a.village
  return {
    label: hit.display_name,
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    district: toDistrict(a.city_district) ?? toDistrict(a.suburb),
    road: a.road ?? null,
    houseNumber: a.house_number ?? null,
    locality: city && normalize(city) !== 'chisinau' ? city : null
  }
})

export function geocode (address: string): Promise<GeoAddress | null> {
  return search(address.trim().replace(/\s+/g, ' ').toLowerCase())
}

export const GEOCODE_SOURCE = SEARCH_URL

const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

/** Coordinates → "Strada Alba Iulia 75" (street + house number), for the "use my location" button. Not cached, not logged. */
export async function reverseGeocode (lat: number, lng: number): Promise<{ address: string, district: District | null } | null> {
  const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', zoom: '18', lat: String(lat), lon: String(lng) })
  const hit = await throttled(() => fetchJson<NominatimResult | { error: string }>(`${REVERSE_URL}?${params}`))
  if ('error' in hit || !hit.address.road) return null
  const a = hit.address
  return {
    address: [a.road, a.house_number].filter(Boolean).join(' '),
    district: toDistrict(a.city_district) ?? toDistrict(a.suburb)
  }
}
