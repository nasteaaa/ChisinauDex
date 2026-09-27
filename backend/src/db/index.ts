import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config'

// One small interface over two Postgres engines:
// - DATABASE_URL set (Railway): a real Postgres server with the pgvector extension;
// - otherwise PGlite, the same Postgres compiled to WebAssembly, stored in RUNTIME_DIR/pg (no install needed).

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  exec(sql: string): Promise<void>
  /** false when the server has no pgvector: search then runs on keywords only. */
  vector: boolean
  close(): Promise<void>
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  data JSONB NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_kind ON events (kind, id);

-- Same question + same filters + same corpus = same key = the stored answer.
CREATE TABLE IF NOT EXISTS answer_cache (
  key TEXT PRIMARY KEY,
  answer JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INT NOT NULL DEFAULT 0
);

-- Questions the documents could not answer, kept for the institutions to fill the gap.
CREATE OR REPLACE VIEW unanswered AS
  SELECT data->>'question' AS question, data->>'lang' AS lang, data->>'routeSourceId' AS institution, at
  FROM events WHERE kind = 'questions' AND data->>'status' = 'gap';

-- Every version of every page the crawler has seen: a new row when a page's text changes.
CREATE TABLE IF NOT EXISTS doc_versions (
  doc_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  source_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, hash)
);

-- The chunks of the current corpus, with the metadata used to filter and cite them.
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  category TEXT NOT NULL,
  lang TEXT NOT NULL,
  published_at DATE,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_hash ON chunks (hash);
`

// Embeddings are keyed by the hash of the chunk text: an unchanged chunk is never embedded twice.
const VECTOR_SCHEMA = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS embeddings (
  hash TEXT PRIMARY KEY,
  embedding vector(384) NOT NULL
);
CREATE INDEX IF NOT EXISTS embeddings_hnsw ON embeddings USING hnsw (embedding vector_cosine_ops);
`

async function connect(): Promise<Omit<Db, 'vector'>> {
  if (config.DATABASE_URL) {
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: config.DATABASE_URL, max: 5 })
    // Neon suspends an idle database and drops its connections; without this listener node-postgres would
    // crash the process. The broken connection is discarded and the next query opens a new one.
    pool.on('error', (e) => console.warn(`database connection dropped: ${e.message}`))
    return {
      query: async <T>(sql: string, params?: unknown[]) => (await pool.query(sql, params)).rows as T[],
      exec: async (sql: string) => { await pool.query(sql) },
      close: () => pool.end()
    }
  }
  const { PGlite } = await import('@electric-sql/pglite')
  const { vector } = await import('@electric-sql/pglite-pgvector')
  const dir = join(config.runtimeDir, 'pg')
  mkdirSync(dir, { recursive: true })
  let pg
  try {
    pg = await PGlite.create(dir, { extensions: { vector } })
  } catch (e) {
    // PGlite allows one process at a time; a dev-server restart that overlaps can leave the folder unreadable.
    // Start fresh: the logs are re-imported from the JSONL files, embeddings are recomputed.
    const aside = `${dir}.broken-${Date.now()}`
    console.warn(`local database unreadable (${(e as Error).message}), moved to ${aside}`)
    if (existsSync(dir)) renameSync(dir, aside)
    mkdirSync(dir, { recursive: true })
    pg = await PGlite.create(dir, { extensions: { vector } })
  }
  return {
    query: async <T>(sql: string, params?: unknown[]) => (await pg.query<T>(sql, params)).rows,
    exec: async (sql: string) => { await pg.exec(sql) },
    close: () => pg.close()
  }
}

let current: Promise<Db> | undefined

export function db(): Promise<Db> {
  current ??= (async () => {
    const c = await connect()
    await c.exec(SCHEMA)
    let vector = true
    try {
      await c.exec(VECTOR_SCHEMA)
    } catch (e) {
      vector = false
      console.warn(`pgvector unavailable, search uses keywords only: ${(e as Error).message}`)
    }
    return { ...c, vector }
  })()
  return current
}

export const toVector = (v: number[] | Float32Array) => `[${Array.from(v, (x) => x.toFixed(6)).join(',')}]`

/** Closes the connection; the next db() call opens a fresh one (tests start several apps in one process). */
export async function closeDb() {
  const open = current
  current = undefined
  if (open) await (await open).close()
}
