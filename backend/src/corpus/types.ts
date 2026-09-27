// Shared shapes for the scraped corpus (backend/data/*.json).
// The crawler (scripts/crawl.ts) writes them, the API reads them.

export const CATEGORIES = ['primaria', 'educatie', 'locuinta', 'munca', 'sanatate', 'transport', 'urbanism'] as const
export type Category = (typeof CATEGORIES)[number]

export type District = 'centru' | 'botanica' | 'buiucani' | 'ciocana' | 'riscani'

/** 1 = City Hall / general directorate, 2 = municipal enterprise or city platform, 3 = district body or institution. */
export type Authority = 1 | 2 | 3

export interface Source {
  id: string
  url: string
  name: string
  publisher: string
  category: Category
  authority: Authority
  district?: District
  /** Contact page when the site is an app whose links the crawler cannot see. */
  contactUrl?: string
}

export type DocType = 'post' | 'page' | 'pdf' | 'html' | 'event'

export interface Doc {
  id: string
  sourceId: string
  url: string
  title: string
  type: DocType
  lang: 'ro' | 'ru' | 'mixed'
  publishedAt?: string // ISO date
  updatedAt?: string // ISO date
  text: string
  files: { url: string; name: string }[]
  integrity: 'ok' | 'quarantined'
  integrityReason?: string
}

export interface Corpus {
  builtAt: string
  docs: Doc[]
}

export interface BrokenLink {
  url: string
  status: number | string
  foundOn: string
}

export interface SourceHealth {
  sourceId: string
  checkedAt: string
  ok: boolean
  status?: number
  error?: string
  tls: 'ok' | 'invalid' | 'none'
  ms?: number
  latestContentAt?: string
  docCount: number
  quarantined: number
  brokenLinks: BrokenLink[]
  contactUrl?: string
  /** Site answers, but serves an anti-bot challenge instead of content to automated readers. */
  blocked?: boolean
  wp: boolean
}

export interface Health {
  checkedAt: string
  sources: SourceHealth[]
}

export interface ConflictSide {
  docId: string
  quote: string
  value: string
}

export interface Conflict {
  id: string
  topic: string
  a: ConflictSide
  b: ConflictSide
  detectedAt: string
  origin: 'index' | 'answer'
}
