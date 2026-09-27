import type { District } from '../corpus/types'
import { getBuses, BUSES_URL, type BusesData } from './buses'
import { getDoctor, type DoctorData } from './doctor'
import { geocode, GEOCODE_SOURCE, type GeoAddress } from './geocode'
import { streetTokens } from './util'
import { getWater, waterUrl, type WaterData } from './water'

/** What the matchers need to know about the user's address. */
export interface Place {
  streetTokens: string[]
  houseNumber: string | null
  district: District | null
  locality: string | null
}

interface SectionMeta { fetchedAt: string, sourceUrl: string }
export type Section<T> = (SectionMeta & { ok: true } & T) | (SectionMeta & { ok: false, error: string })

export interface LiveResult {
  address: { query: string, found: boolean, label: string, lat: number | null, lng: number | null, district: District | null, street: string | null, sourceUrl: string, error?: string }
  water: Section<WaterData>
  buses: Section<BusesData>
  doctor: Section<DoctorData>
}

const SECTION_TIMEOUT_MS = 20000

async function section<T> (sourceUrl: string, fn: () => Promise<T>): Promise<Section<T>> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('source took too long to answer')), SECTION_TIMEOUT_MS)
  })
  try {
    const data = await Promise.race([fn(), timeout])
    return { ok: true, fetchedAt: new Date().toISOString(), sourceUrl, ...data }
  } catch (err) {
    const error = err instanceof Error ? (err.name === 'TimeoutError' ? 'source timed out' : err.message) : String(err)
    return { ok: false, fetchedAt: new Date().toISOString(), sourceUrl, error }
  } finally {
    clearTimeout(timer)
  }
}

/** "bd. Dacia 27, ap. 5" → street "bd. Dacia", house "27". */
function parseInput (address: string): { street: string, house: string | null } {
  const first = address.split(',')[0]
  const house = first.match(/\s(\d+[a-z]?(?:\/\d+[a-z]?)?)\s*$/i)
  return { street: house ? first.slice(0, house.index).trim() : first.trim(), house: house ? house[1] : null }
}

export async function getLiveForAddress (address: string, opts: { date?: string } = {}): Promise<LiveResult> {
  let geo: GeoAddress | null = null
  let geoError: string | null = null
  try {
    geo = await geocode(address)
  } catch (err) {
    geoError = err instanceof Error ? err.message : String(err)
  }
  const input = parseInput(address)
  const place: Place = {
    streetTokens: streetTokens(geo?.road ?? input.street),
    houseNumber: geo?.houseNumber ?? input.house,
    district: geo?.district ?? null,
    locality: geo?.locality ?? null
  }

  const [water, buses, doctor] = await Promise.all([
    section(waterUrl(opts.date), () => getWater(place, opts.date)),
    section(BUSES_URL, () => {
      if (!geo) throw new Error(geoError ? `geocoding failed: ${geoError}` : 'address not found on OpenStreetMap')
      return getBuses(geo)
    }),
    section('corpus:amt', () => getDoctor(place))
  ])

  return {
    address: {
      query: address,
      found: geo !== null,
      label: geo?.label ?? address,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      district: place.district,
      street: geo?.road ?? (input.street || null),
      sourceUrl: GEOCODE_SOURCE,
      ...(geo ? {} : { error: geoError ?? 'address not found on OpenStreetMap' })
    },
    water,
    buses,
    doctor
  }
}
