import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config'
import type { Conflict } from '../corpus/types'
import { db } from '../db'

// Append-only logs of what users do on the platform (questions, ratings, consented analytics,
// staff actions), stored in Postgres (`events` table) and mirrored in memory for the dashboard.
// Each entry is also appended to a JSONL file: a plain audit trail from which an empty database is rebuilt.

export interface QuestionLog {
  id: string
  at: string
  question: string
  lang: string
  role: string
  status: 'ok' | 'partial' | 'gap' | 'conflict'
  mode: 'ai' | 'fallback'
  latencyMs: number
  docIds: string[]
  routeSourceId?: string
  conflictId?: string
}

export interface FeedbackLog {
  at: string
  answerId: string
  stars: number
  tags: string[]
  comment?: string
}

export interface EventLog {
  at: string
  type: 'page_view' | 'doc_view'
  path?: string
  docId?: string
  sessionId?: string
}

export interface ReportLog {
  at: string
  kind: 'accessibility'
  message: string
}

export interface PetitionLog {
  id: string // random UUID: the resident's private handle for checking the status
  ticket: string // short number shown to both sides, e.g. P-000012
  at: string
  question: string
  message: string
  sourceId: string // institution it is addressed to
}

export interface PetitionUpdateLog {
  at: string
  id: string
  status: 'in_progress' | 'answered'
  reply?: string
}

export interface ActionLog {
  at: string
  kind: 'conflict' | 'gap' | 'page'
  id: string
  state: string
}

/** The JSONL audit trail; imported when the database has no rows for this log yet. */
function legacyLog<T>(name: string): T[] {
  const path = join(config.runtimeDir, `${name}.jsonl`)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)
}

class Log<T> {
  items: T[] = []
  constructor(private name: string) {}

  async load() {
    const d = await db()
    const rows = await d.query<{ data: T }>('SELECT data FROM events WHERE kind = $1 ORDER BY id', [this.name])
    if (rows.length) {
      this.items = rows.map((r) => r.data)
      return
    }
    this.items = legacyLog<T>(this.name)
    for (const item of this.items) await d.query('INSERT INTO events (kind, data) VALUES ($1, $2)', [this.name, JSON.stringify(item)])
  }

  add(item: T) {
    this.items.push(item)
    mkdirSync(config.runtimeDir, { recursive: true })
    appendFileSync(join(config.runtimeDir, `${this.name}.jsonl`), JSON.stringify(item) + '\n')
    db()
      .then((d) => d.query('INSERT INTO events (kind, data) VALUES ($1, $2)', [this.name, JSON.stringify(item)]))
      .catch((e: Error) => console.error(`could not store ${this.name}: ${e.message}`))
  }
}

export const runtime = {
  questions: new Log<QuestionLog>('questions'),
  feedback: new Log<FeedbackLog>('feedback'),
  events: new Log<EventLog>('events'),
  actions: new Log<ActionLog>('actions'),
  conflicts: new Log<Conflict>('conflicts'),
  reports: new Log<ReportLog>('reports'),
  petitions: new Log<PetitionLog>('petitions'),
  petitionUpdates: new Log<PetitionUpdateLog>('petition-updates'),
  async load() {
    for (const log of [this.questions, this.feedback, this.events, this.actions, this.conflicts, this.reports, this.petitions, this.petitionUpdates]) await log.load()
  },
  /** Latest staff-set state per (kind, id). */
  stateOf(kind: ActionLog['kind'], id: string): string | undefined {
    for (let i = this.actions.items.length - 1; i >= 0; i--) {
      const a = this.actions.items[i]
      if (a.kind === kind && a.id === id) return a.state
    }
    return undefined
  }
}
