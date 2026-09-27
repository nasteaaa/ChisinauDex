import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config'
import { sourceById } from './sources'
import { splitSentences, tokens } from './text'
import type { Conflict, Corpus, Doc, Health, SourceHealth } from './types'

export interface Passage {
  id: string // `${docId}:${n}`
  doc: Doc
  text: string
}

export interface Hit {
  passage: Passage
  score: number
}

const K1 = 1.4
const B = 0.75
const MAX_PASSAGE = 900

function readJson<T>(file: string, fallback: T): T {
  const path = join(config.DATA_DIR, file)
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

/** Paragraph-sized chunks; long paragraphs are cut on sentence boundaries. */
export function chunk(text: string): string[] {
  const out: string[] = []
  let buf = ''
  const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = '' }
  for (const para of text.split(/\n{2,}/)) {
    const p = para.replace(/\s+/g, ' ').trim()
    if (!p) continue
    if (p.length > MAX_PASSAGE) {
      flush()
      for (const s of splitSentences(p)) {
        if (buf.length + s.length > MAX_PASSAGE) flush()
        buf += (buf ? ' ' : '') + s
      }
      flush()
    } else {
      if (buf.length + p.length > MAX_PASSAGE) flush()
      buf += (buf ? '\n' : '') + p
      if (buf.length > 280) flush()
    }
  }
  flush()
  return out
}

class CorpusStore {
  corpus: Corpus = { builtAt: '', docs: [] }
  health: Health = { checkedAt: '', sources: [] }
  conflicts: Conflict[] = []
  docById = new Map<string, Doc>()
  passages: Passage[] = []
  passageById = new Map<string, Passage>()
  private postings = new Map<string, { i: number; tf: number }[]>()
  private lens: number[] = []
  private titleTokens: Set<string>[] = []
  private avgLen = 1

  load() {
    this.corpus = readJson<Corpus>('corpus.json', { builtAt: '', docs: [] })
    this.health = readJson<Health>('health.json', { checkedAt: '', sources: [] })
    this.conflicts = readJson<Conflict[]>('conflicts.json', [])
    this.docById = new Map(this.corpus.docs.map((d) => [d.id, d]))
    this.passages = []
    this.passageById = new Map()
    this.postings = new Map()
    this.lens = []
    this.titleTokens = []
    for (const doc of this.corpus.docs) {
      if (!sourceById.has(doc.sourceId)) continue
      chunk(doc.text).forEach((text, n) => this.addPassage({ id: `${doc.id}:${n}`, doc, text }))
    }
    this.avgLen = this.lens.reduce((a, b) => a + b, 0) / Math.max(1, this.lens.length)
  }

  private addPassage(p: Passage) {
    const i = this.passages.length
    this.passages.push(p)
    this.passageById.set(p.id, p)
    const toks = tokens(p.text)
    const tt = tokens(p.doc.title)
    this.lens.push(toks.length + tt.length)
    this.titleTokens.push(new Set(tt))
    const tf = new Map<string, number>()
    for (const t of [...toks, ...tt]) tf.set(t, (tf.get(t) ?? 0) + 1)
    for (const [t, n] of tf) {
      let list = this.postings.get(t)
      if (!list) this.postings.set(t, (list = []))
      list.push({ i, tf: n })
    }
  }

  /** Inverse document frequency of a (folded, stemmed) token across passages. */
  knows(token: string): boolean {
    return this.postings.has(token)
  }

  idf(token: string): number {
    const n = this.postings.get(token)?.length ?? 0
    return Math.log(1 + (this.passages.length - n + 0.5) / (n + 0.5))
  }

  healthOf(sourceId: string): SourceHealth | undefined {
    return this.health.sources.find((s) => s.sourceId === sourceId)
  }

  /**
   * BM25 over passages, re-weighted by source authority, freshness and title match.
   * Quarantined (spam / injected) documents are never returned.
   */
  search(query: string, opts: { limit?: number; perDoc?: number; filter?: (d: Doc) => boolean; boost?: (d: Doc) => number } = {}): Hit[] {
    const q = [...new Set(tokens(query))]
    if (!q.length) return []
    const N = this.passages.length
    const scores = new Map<number, number>()
    for (const t of q) {
      const list = this.postings.get(t)
      if (!list) continue
      const idf = Math.log(1 + (N - list.length + 0.5) / (list.length + 0.5))
      for (const { i, tf } of list) {
        const s = idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * this.lens[i] / this.avgLen))
        scores.set(i, (scores.get(i) ?? 0) + s)
      }
    }
    const now = Date.now()
    const hits: Hit[] = []
    for (const [i, raw] of scores) {
      const p = this.passages[i]
      const d = p.doc
      if (d.integrity === 'quarantined') continue
      if (opts.filter && !opts.filter(d)) continue
      const src = sourceById.get(d.sourceId)!
      const authority = src.authority === 1 ? 1.25 : src.authority === 2 ? 1.1 : 1
      const date = d.updatedAt ?? d.publishedAt
      const ageYears = date ? (now - Date.parse(date)) / 3.15e10 : 2
      const fresh = ageYears < 1 ? 1.1 : ageYears > 3 ? 0.85 : 1
      const titleHits = q.filter((t) => this.titleTokens[i].has(t)).length
      const title = 1 + 0.15 * titleHits
      hits.push({ passage: p, score: raw * authority * fresh * title * (opts.boost?.(d) ?? 1) })
    }
    hits.sort((a, b) => b.score - a.score)
    const perDoc = opts.perDoc ?? 2
    const count = new Map<string, number>()
    const out: Hit[] = []
    for (const h of hits) {
      const c = count.get(h.passage.doc.id) ?? 0
      if (c >= perDoc) continue
      count.set(h.passage.doc.id, c + 1)
      out.push(h)
      if (out.length >= (opts.limit ?? 10)) break
    }
    return out
  }
}

export const store = new CorpusStore()
