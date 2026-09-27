import { load } from 'cheerio'
import type { District } from '../corpus/types'
import { cached, fetchText, normalize, sameStreet, streetTokens } from './util'
import type { Place } from './index'

export type WaterItemType = 'current' | 'planned' | 'leak' | 'sewer'

export interface WaterItem {
  type: WaterItemType
  sector: string
  ticket: string
  address: string
  affectedStreets: string | null
  description: string | null
  from: string | null
  to: string | null
  tankerLocation: string | null
  matchedOn: 'address' | 'affected'
}

export interface WaterData {
  date: string | null
  situationAt: string | null
  items: WaterItem[]
  sectorCounts: Record<WaterItemType, number> | null
}

interface Row {
  type: WaterItemType
  sector: string
  ticket: string
  street: string
  house: string
  affectedStreets: string | null
  description: string | null
  from: string | null
  to: string | null
  tankerLocation: string | null
}

export const WATER_URL = 'https://www.acc.md/disconnections'
const CITY_SECTORS = ['botanica', 'buiucani', 'centru', 'ciocana', 'riscani']

const orNull = (s: string | undefined): string | null => s?.trim() || null

/** Parses the three ACC tables: disconnections (unplanned, then planned), water-network leaks, sewer tickets. */
export function parseWaterPage (html: string): { situationAt: string | null, rows: Row[] } {
  const $ = load(html)
  const rows: Row[] = []
  $('table.avarieri').each((_, table) => {
    const headers = $(table).find('thead th').map((_, th) => $(th).text()).get().join(' ')
    const kind = headers.includes('Diametru') ? 'disconnection' : headers.includes('Depistat') ? 'leak' : 'sewer'
    let sector = ''
    let planned = false
    $(table).find('tbody tr').each((_, tr) => {
      const $tr = $(tr)
      if ($tr.hasClass('sector_title')) { sector = $tr.text().trim(); return }
      if (/sistari planificate/i.test($tr.text())) { planned = true; sector = ''; return }
      const c = $tr.find('td').map((_, td) => $(td).text().trim()).get()
      if (c.length < 5 || !/^\d+$/.test(c[1])) return
      const base = { sector, ticket: c[1], street: c[2], house: c[3] }
      if (kind === 'disconnection') {
        // blank | ticket | street | nr | diameter | affected | disconnected | reconnect | tanker
        rows.push({ ...base, type: planned ? 'planned' : 'current', affectedStreets: orNull(c[5]), description: null, from: orNull(c[6]), to: orNull(c[7]), tankerLocation: orNull(c[8]) })
      } else if (kind === 'leak') {
        // blank | ticket | street | nr | damage | detected | affected | disconnected | reconnect | tanker | drain
        // Leaks that caused a disconnection are listed in both tables under the same ticket.
        const seen = rows.find((r) => r.ticket === base.ticket && (r.type === 'current' || r.type === 'planned'))
        if (seen) { seen.description ??= orNull(c[4]); return }
        rows.push({ ...base, type: 'leak', affectedStreets: orNull(c[6]), description: orNull(c[4]), from: orNull(c[7]) ?? orNull(c[5]), to: orNull(c[8]), tankerLocation: orNull(c[9]) })
      } else {
        // blank | ticket | street | nr | damage
        rows.push({ ...base, type: 'sewer', affectedStreets: null, description: orNull(c[4]), from: null, to: null, tankerLocation: null })
      }
    })
  })
  const stamp = html.match(/situa[tţț]ia la\s*([\d.]+\s+[\d:]+)/i)
  return { situationAt: stamp ? stamp[1] : null, rows }
}

const fetchPage = cached(60 * 1000, async (url: string) => parseWaterPage(await fetchText(url)))

export function waterUrl (date?: string): string {
  return date ? `${WATER_URL}?date=${date}` : WATER_URL
}

/** Rows for the city proper, or for the user's own village/town when the address is outside it. */
function sectorApplies (sector: string, place: Place): boolean {
  const n = normalize(sector).trim()
  if (place.locality) return n.includes(normalize(place.locality))
  return CITY_SECTORS.includes(n)
}

function matchRow (row: Row, place: Place): WaterItem['matchedOn'] | null {
  if (!sectorApplies(row.sector, place)) return null
  if (sameStreet(streetTokens(row.street), place.streetTokens)) return 'address'
  const affected = (row.affectedStreets ?? '').split(/[,;]/)
  if (affected.some((s) => sameStreet(streetTokens(s), place.streetTokens))) return 'affected'
  return null
}

function countSector (rows: Row[], district: District): Record<WaterItemType, number> {
  const counts = { current: 0, planned: 0, leak: 0, sewer: 0 }
  for (const row of rows) {
    if (normalize(row.sector).trim() === district) counts[row.type]++
  }
  return counts
}

export async function getWater (place: Place, date?: string): Promise<WaterData> {
  const { situationAt, rows } = await fetchPage(waterUrl(date))
  if (rows.length === 0 && !situationAt) throw new Error('acc.md page layout not recognised')
  const items: WaterItem[] = []
  for (const row of rows) {
    const matchedOn = matchRow(row, place)
    if (!matchedOn) continue
    items.push({
      type: row.type,
      sector: row.sector,
      ticket: row.ticket,
      address: `${row.street} ${row.house}`.trim(),
      affectedStreets: row.affectedStreets,
      description: row.description,
      from: row.from,
      to: row.to,
      tankerLocation: row.tankerLocation,
      matchedOn
    })
  }
  return {
    date: date ?? null,
    situationAt,
    items,
    sectorCounts: place.district ? countSector(rows, place.district) : null
  }
}
