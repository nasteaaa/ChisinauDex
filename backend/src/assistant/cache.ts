import { createHash } from 'node:crypto'
import { fold } from '../corpus/text'
import { store } from '../corpus/store'
import { db } from '../db'
import type { Answer, AskInput } from './ask'

// Same question + same filters + same corpus = same key = the stored answer: consistent answers,
// no model call, no cost. A new crawl changes the corpus date, so every key changes with it.

export function cacheKey(input: AskInput): string {
  const q = fold(input.question).replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()
  const parts = [q, input.lang, input.role, input.category ?? '', input.district ?? '', input.publishedFrom ?? '', input.publishedTo ?? '', store.corpus.builtAt]
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex')
}

export async function cachedAnswer(key: string): Promise<Answer | undefined> {
  try {
    const d = await db()
    const rows = await d.query<{ answer: Answer }>('UPDATE answer_cache SET hits = hits + 1 WHERE key = $1 RETURNING answer', [key])
    return rows[0]?.answer
  } catch (e) {
    console.warn(`answer cache unavailable: ${(e as Error).message}`)
    return undefined
  }
}

export async function storeAnswer(key: string, answer: Answer) {
  try {
    const d = await db()
    await d.query('INSERT INTO answer_cache (key, answer) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET answer = $2, created_at = now()', [key, JSON.stringify(answer)])
  } catch (e) {
    console.warn(`could not cache the answer: ${(e as Error).message}`)
  }
}
