import { createHash } from 'node:crypto'
import { embed } from '../assistant/embed'
import { db, toVector } from '../db'
import { sourceById } from './sources'
import { store, type Hit, type Passage } from './store'

// Vector side of the hybrid search. At startup the current corpus chunks are written to Postgres,
// and every chunk whose text is new gets an embedding (keyed by its hash, so an unchanged chunk is never
// embedded twice, and a nightly crawl only embeds what changed on the sites).

const BATCH = 32
const hash = (s: string) => createHash('sha1').update(s).digest('hex')
/** Some PDFs carry NUL bytes, which Postgres text columns reject. */
const clean = (s: string) => s.replaceAll(String.fromCharCode(0), '')
/** The title gives a chunk its context ("Tarife" alone means little). */
const chunkText = (p: Passage) => `${p.doc.title}\n${p.text}`

export const vectorIndex = { embedded: 0, total: 0, ready: false, changedDocs: 0 }

async function bulk(sql: string, columns: unknown[][], size = 200) {
  const d = await db()
  for (let i = 0; i < columns[0].length; i += size) await d.query(sql, columns.map((c) => c.slice(i, i + size)))
}

export async function syncVectors(log: (msg: string) => void = console.log) {
  const d = await db()
  const passages = store.passages.filter((p) => p.doc.integrity === 'ok')
  const hashes = passages.map((p) => hash(chunkText(p)))

  await d.exec('TRUNCATE chunks')
  await bulk(
    `INSERT INTO chunks (id, hash, doc_id, source_id, category, lang, published_at, text)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::date[], $8::text[])
     ON CONFLICT (id) DO NOTHING`,
    [
      passages.map((p) => p.id), hashes, passages.map((p) => p.doc.id), passages.map((p) => p.doc.sourceId),
      passages.map((p) => sourceById.get(p.doc.sourceId)?.category ?? 'primaria'), passages.map((p) => p.doc.lang),
      passages.map((p) => (p.doc.publishedAt ?? p.doc.updatedAt ?? null)?.slice(0, 10) ?? null), passages.map((p) => clean(p.text))
    ]
  )

  // Page history: a new row whenever a page's text differs from every version seen before.
  const docs = store.corpus.docs.filter((x) => x.integrity === 'ok')
  const known = new Set((await d.query<{ doc_id: string }>('SELECT DISTINCT doc_id FROM doc_versions')).map((r) => r.doc_id))
  const inserted = await d.query<{ doc_id: string }>(
    `INSERT INTO doc_versions (doc_id, hash, source_id, url, title)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
     ON CONFLICT DO NOTHING RETURNING doc_id`,
    [docs.map((x) => x.id), docs.map((x) => hash(x.text)), docs.map((x) => x.sourceId), docs.map((x) => x.url), docs.map((x) => clean(x.title))]
  )
  vectorIndex.changedDocs = inserted.filter((r) => known.has(r.doc_id)).length
  log(`doc versions: ${inserted.length} new (${vectorIndex.changedDocs} pages changed since the last crawl)`)

  if (!d.vector) return
  const done = new Set((await d.query<{ hash: string }>('SELECT hash FROM embeddings')).map((r) => r.hash))
  const todo = new Map<string, string>()
  passages.forEach((p, i) => { if (!done.has(hashes[i])) todo.set(hashes[i], chunkText(p)) })
  vectorIndex.total = new Set(hashes).size
  vectorIndex.embedded = vectorIndex.total - todo.size
  log(`embeddings: ${vectorIndex.embedded}/${vectorIndex.total} cached, ${todo.size} to compute`)

  const entries = [...todo.entries()]
  const t0 = Date.now()
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)
    const vectors = await embed(batch.map(([, text]) => text), 'passage')
    await d.query(
      'INSERT INTO embeddings (hash, embedding) SELECT h, v::vector FROM unnest($1::text[], $2::text[]) AS t(h, v) ON CONFLICT DO NOTHING',
      [batch.map(([h]) => h), vectors.map(toVector)]
    )
    vectorIndex.embedded += batch.length
    if ((i / BATCH) % 50 === 0) log(`embeddings: ${vectorIndex.embedded}/${vectorIndex.total} (${Math.round((Date.now() - t0) / 1000)} s)`)
  }
  vectorIndex.ready = true
  log(`embeddings ready: ${vectorIndex.total} chunks`)
}

/** Nearest chunks to the question by cosine similarity (pgvector). Empty while the index is not built. */
export async function vectorSearch(question: string, limit = 40): Promise<Hit[]> {
  const d = await db()
  if (!d.vector || !vectorIndex.embedded) return []
  const [q] = await embed([question], 'query')
  const rows = await d.query<{ id: string; sim: number }>(
    `SELECT c.id, 1 - (e.embedding <=> $1::vector) AS sim
     FROM embeddings e JOIN chunks c ON c.hash = e.hash
     ORDER BY e.embedding <=> $1::vector LIMIT $2`,
    [toVector(q), limit]
  )
  return rows.flatMap((r) => {
    const passage = store.passageById.get(r.id)
    return passage ? [{ passage, score: Number(r.sim) }] : []
  })
}
