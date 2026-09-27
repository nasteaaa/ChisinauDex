import { sourceById } from '../corpus/sources'
import { store } from '../corpus/store'
import type { Place } from './index'
import { normalize } from './util'

export interface DoctorMatch {
  docId: string
  title: string
  url: string
  publisher: string
  date?: string
  line: string
}

export interface DoctorData {
  items: DoctorMatch[]
}

/**
 * Looks the street up in the family-doctor assignment lists the AMTs publish (indexed from their sites/PDFs).
 * Returns the exact line of the list, so the user sees the source text, not our interpretation.
 */
export async function getDoctor(place: Place): Promise<DoctorData> {
  if (!place.streetTokens.length) return { items: [] }
  const toks = place.streetTokens.map((t) => t.replace('.', ''))
  const items: DoctorMatch[] = []
  const seen = new Set<string>()
  for (const p of store.passages) {
    const src = sourceById.get(p.doc.sourceId)
    if (!src || !src.id.startsWith('amt-') || p.doc.integrity !== 'ok') continue
    if (place.district && src.district && src.district !== place.district) continue
    const norm = normalize(p.text)
    if (!toks.every((t) => norm.includes(t))) continue
    const line = p.text.split(/\n|(?<=[.;])\s+/).find((l) => toks.every((t) => normalize(l).includes(t))) ?? p.text.slice(0, 300)
    const key = `${p.doc.id}|${line}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ docId: p.doc.id, title: p.doc.title, url: p.doc.url, publisher: src.publisher, date: p.doc.updatedAt ?? p.doc.publishedAt, line: line.trim().slice(0, 400) })
    if (items.length >= 3) break
  }
  return { items }
}
