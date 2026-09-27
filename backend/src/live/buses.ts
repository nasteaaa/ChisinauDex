import { cached, distanceM, fetchJson, fetchText, mapLimit } from './util'

interface LatLng { lat: number, lng: number }

export interface BusStop extends LatLng {
  id: string
  name: string
  distanceM: number
  routes: string[]
}

export interface BusVehicle extends LatLng {
  route: string
  direction: 0 | 1
  label: string
  speedKmh: number
  timestamp: string
  /** Distance to the user's stop (stop mode) or to the user (fallback mode). */
  distanceM: number
  stopId: string | null
  /** The bus is on the way to the stop, `stopsAway` stops before it. */
  approaching: boolean | null
  stopsAway: number | null
}

export interface BusesData {
  mode: 'stops' | 'nearby-vehicles'
  stops: BusStop[]
  vehicles: BusVehicle[]
  routesChecked: number
  routesFailed: string[]
}

interface RouteStop extends LatLng { id: string, name: string, sequence: number }
interface Direction { route: string, direction: 0 | 1, stops: RouteStop[] }
interface RawVehicle extends LatLng { id: string, label: string, speed: number, timestamp: string }

export const BUSES_URL = 'https://autourban.md/ro/rute/toate'
const BASE = 'https://autourban.md/ro/rute'
const HOUR = 3600 * 1000
const STOP_RADIUS_M = 400
const MAX_STOPS = 3
const VEHICLE_RADIUS_M = 1500
const MAX_VEHICLES = 12
const STALE_MS = 10 * 60 * 1000

const routeList = cached(HOUR, async (): Promise<string[]> => {
  const html = await fetchText(BUSES_URL)
  const routes = new Set([...html.matchAll(/autourban\.md\/ro\/rute\/(\d+[A-Z]?)"/g)].map((m) => m[1]))
  if (routes.size === 0) throw new Error('autourban.md route list is empty')
  return [...routes]
})

const DIRECTIONS = [0, 1] as const

/** Stop lists with coordinates, read from the inline `const stops = [...]` on each route page. */
const stopIndex = cached(HOUR, async () => {
  const routes = await routeList('all')
  const jobs = routes.flatMap((route) => DIRECTIONS.map((direction) => ({ route, direction })))
  const results = await mapLimit(jobs, 8, async ({ route, direction }): Promise<Direction> => {
    const html = await fetchText(`${BASE}/${route}?direction=${direction}`)
    const json = html.match(/const stops = (\[.*?\]);/s)?.[1]
    if (!json) throw new Error(`no stops on route ${route}`)
    return { route, direction, stops: JSON.parse(json) as RouteStop[] }
  })
  const directions = results.flatMap((r) => r.status === 'fulfilled' && r.value.stops.length > 0 ? [r.value] : [])
  const failed = [...new Set(jobs.filter((_, i) => results[i].status === 'rejected').map((j) => j.route))]
  return { routes, directions, failed }
})

// The vehicles endpoint answers 500 to parallel requests, so callers fetch one at a time, retrying once.
const vehicles = cached(15 * 1000, async (key: string): Promise<RawVehicle[]> => {
  const [route, direction] = key.split(':')
  const url = `${BASE}/${route}/vehicule?direction=${direction}`
  const body = await fetchJson<{ vehicles: RawVehicle[] }>(url).catch(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    return fetchJson<{ vehicles: RawVehicle[] }>(url)
  })
  return body.vehicles.filter((v) => Date.now() - Date.parse(v.timestamp) < STALE_MS)
})

function toVehicle (v: RawVehicle, route: string, direction: 0 | 1, distance: number): BusVehicle {
  return {
    route, direction, label: v.label, lat: v.lat, lng: v.lng, speedKmh: v.speed, timestamp: v.timestamp,
    distanceM: distance, stopId: null, approaching: null, stopsAway: null
  }
}

function nearestIndex (stops: RouteStop[], p: LatLng): number {
  let best = 0
  stops.forEach((s, i) => { if (distanceM(s, p) < distanceM(stops[best], p)) best = i })
  return best
}

export async function getBuses (here: LatLng): Promise<BusesData> {
  let index: Awaited<ReturnType<typeof stopIndex>> | null = null
  try {
    index = await stopIndex('all')
  } catch {
    index = null
  }
  return index && index.directions.length > 0 ? viaStops(here, index) : nearbyVehicles(here)
}

async function viaStops (here: LatLng, index: Awaited<ReturnType<typeof stopIndex>>): Promise<BusesData> {
  // Stops near the user, nearest first (the same stop id appears on several routes).
  const byId = new Map<string, BusStop>()
  for (const d of index.directions) {
    for (const s of d.stops) {
      const stop = byId.get(s.id) ?? { id: s.id, name: s.name, lat: s.lat, lng: s.lng, distanceM: distanceM(here, s), routes: [] }
      if (!stop.routes.includes(d.route)) stop.routes.push(d.route)
      byId.set(s.id, stop)
    }
  }
  const sorted = [...byId.values()].sort((a, b) => a.distanceM - b.distanceM)
  const stops = sorted.filter((s, i) => i === 0 || s.distanceM <= STOP_RADIUS_M).slice(0, MAX_STOPS)
  const stopIds = new Set(stops.map((s) => s.id))

  // Every route direction that calls at one of those stops, with the nearest such stop.
  const serving = index.directions.flatMap((d) => {
    const i = d.stops.findIndex((s) => stopIds.has(s.id))
    return i === -1 ? [] : [{ ...d, stopIndex: i }]
  })
  const results = await mapLimit(serving, 1, (d) => vehicles(`${d.route}:${d.direction}`))
  const list: BusVehicle[] = []
  serving.forEach((d, i) => {
    const r = results[i]
    if (r.status !== 'fulfilled') return
    const stop = d.stops[d.stopIndex]
    for (const v of r.value) {
      const at = nearestIndex(d.stops, v)
      list.push({
        ...toVehicle(v, d.route, d.direction, distanceM(v, stop)),
        stopId: stop.id,
        approaching: at <= d.stopIndex,
        stopsAway: at <= d.stopIndex ? d.stopIndex - at : null
      })
    }
  })
  list.sort((a, b) => Number(b.approaching) - Number(a.approaching) || (a.stopsAway ?? 0) - (b.stopsAway ?? 0) || a.distanceM - b.distanceM)
  const failed = serving.filter((_, i) => results[i].status === 'rejected').map((d) => d.route)
  if (serving.length > 0 && failed.length === serving.length) throw new Error('autourban.md live vehicles unavailable')
  return {
    mode: 'stops',
    stops,
    vehicles: list.slice(0, MAX_VEHICLES),
    routesChecked: new Set(serving.map((d) => d.route)).size,
    routesFailed: [...new Set([...index.failed, ...failed])]
  }
}

/** Fallback without stop coordinates: live buses of every route within ~1.5 km of the user. */
async function nearbyVehicles (here: LatLng): Promise<BusesData> {
  const routes = await routeList('all')
  const jobs = routes.flatMap((route) => DIRECTIONS.map((direction) => ({ route, direction })))
  const results = await mapLimit(jobs, 1, (j) => vehicles(`${j.route}:${j.direction}`))
  const list: BusVehicle[] = []
  jobs.forEach((j, i) => {
    const r = results[i]
    if (r.status !== 'fulfilled') return
    for (const v of r.value) {
      const d = distanceM(here, v)
      if (d <= VEHICLE_RADIUS_M) list.push(toVehicle(v, j.route, j.direction, d))
    }
  })
  list.sort((a, b) => a.distanceM - b.distanceM)
  const failed = [...new Set(jobs.filter((_, i) => results[i].status === 'rejected').map((j) => j.route))]
  if (failed.length === routes.length) throw new Error('autourban.md live vehicles unavailable')
  return { mode: 'nearby-vehicles', stops: [], vehicles: list.slice(0, MAX_VEHICLES), routesChecked: routes.length, routesFailed: failed }
}
