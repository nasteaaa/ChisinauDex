import { runtime } from '../store/runtime'
import { sourceById } from './sources'
import { store } from './store'
import { fold, tokens } from './text'
import type { Category } from './types'

// Example questions come from the data, not from us:
// 1. questions citizens actually asked (answered, asked at least twice), and
// 2. FAQ-style questions published on the official sites that are followed by an answer.
// The frontend falls back to its own list only when these are too few.

export interface Example {
  text: string
  category: Category
  lang: 'ro' | 'ru'
  origin: 'popular' | 'corpus'
  docId?: string
  count?: number
}

const SERVICE_Q_RO = /^(cum (pot|se|obtin|depun|primesc|inregistrez|achit|platesc|procedez)|ce (acte|documente|trebuie|taxe|tarif)|unde (pot|se|depun|gasesc)|cine (poate|elibereaza|are dreptul)|care (este|sunt) (termenul|taxa|tariful|programul|actele|documentele|conditiile|procedura)|cat costa|cand (se|pot))\b/
const SERVICE_Q_RU = /^(как (получить|подать|оформить|записаться|оплатить)|какие документы|где (можно|получить|подать)|кто может|сколько стоит|когда можно)/
// A service question names something a citizen does or needs (not "where can new economic zones appear?").
const SERVICE_TERM = /(obtin|depun|primi|inregistr|achit|plat|elibera|inscri|solicit|cumpar|inchiri|schimb|contest|program|acte|document|tax|tarif|termen|autoriza|certificat|plang|petiti|получ|пода|оформ|запис|оплат|документ|стоит)/
const MIN_ANSWER = 60

let cache: { builtAt: string; items: Example[] } | null = null

function corpusQuestions(): Example[] {
  if (cache?.builtAt === store.corpus.builtAt) return cache.items
  const items: Example[] = []
  const seen = new Set<string>()
  for (const doc of store.corpus.docs) {
    const src = sourceById.get(doc.sourceId)
    if (!src || src.authority === 3 || doc.integrity !== 'ok') continue
    const re = /[^\n?.!]{15,125}\?/g
    for (let m = re.exec(doc.text); m; m = re.exec(doc.text)) {
      const text = m[0].trim()
      const f = fold(text)
      if (!SERVICE_Q_RO.test(f) && !SERVICE_Q_RU.test(f)) continue
      if (!SERVICE_TERM.test(f) || text === text.toUpperCase()) continue
      // Only questions the page itself answers: enough text right after, not another question.
      const after = doc.text.slice(m.index + m[0].length, m.index + m[0].length + 400)
      const answer = after.split('?')[0].replace(/[^\p{L}]/gu, '')
      if (answer.length < MIN_ANSWER || seen.has(f)) continue
      seen.add(f)
      items.push({ text, category: src.category, lang: /[а-яё]/i.test(text) ? 'ru' : 'ro', origin: 'corpus', docId: doc.id })
    }
  }
  cache = { builtAt: store.corpus.builtAt, items }
  return items
}

function popularQuestions(lang: string): Example[] {
  const byKey = new Map<string, Example & { count: number }>()
  for (const q of runtime.questions.items) {
    if (q.status === 'gap' || q.lang !== lang) continue
    const k = fold(q.question)
    const e = byKey.get(k) ?? { text: q.question, category: 'primaria' as Category, lang: lang === 'ru' ? 'ru' : 'ro', origin: 'popular' as const, count: 0 }
    e.count++
    const doc = store.docById.get(q.docIds[0] ?? '')
    if (doc) e.category = sourceById.get(doc.sourceId)?.category ?? e.category
    byKey.set(k, e)
  }
  return [...byKey.values()].filter((e) => e.count >= 2).sort((a, b) => b.count - a.count)
}

export function examples(lang: string, category?: Category, limit = 6): Example[] {
  const pool = [...popularQuestions(lang), ...corpusQuestions().filter((e) => e.lang === lang)]
  if (category) return pool.filter((e) => e.category === category).slice(0, limit)
  // No domain chosen: spread the examples across domains, popular ones first.
  const out: Example[] = []
  const perCat = new Map<Category, number>()
  for (const round of [1, 2]) {
    for (const e of pool) {
      if (out.length >= limit || out.includes(e) || (perCat.get(e.category) ?? 0) >= round) continue
      perCat.set(e.category, (perCat.get(e.category) ?? 0) + 1)
      out.push(e)
    }
  }
  return out
}

// Life-situation tiles: the label is UI copy, the question and the document count come from the index.
export const TILES: Record<string, string> = {
  kinder: 'grădiniță',
  doctor: 'medic de familie',
  water: 'deconectare apă',
  business: 'notificare comerț',
  build: 'autorizație de construire',
  transport: 'transport public abonament',
  petition: 'petiție',
  youth: 'tineri granturi'
}

let tokenCache: { builtAt: string; sets: Set<string>[] } | null = null

function docTokens(): Set<string>[] {
  if (tokenCache?.builtAt !== store.corpus.builtAt) {
    tokenCache = { builtAt: store.corpus.builtAt, sets: store.corpus.docs.filter((d) => d.integrity === 'ok').map((d) => new Set(tokens(`${d.title} ${d.text}`))) }
  }
  return tokenCache.sets
}

export function tiles(lang: string) {
  const questions = corpusQuestions().filter((e) => e.lang === lang)
  return Object.entries(TILES).map(([key, query]) => {
    const stems = tokens(query)
    const docCount = docTokens().filter((set) => stems.every((s) => set.has(s))).length
    const q = questions.find((e) => stems.every((s) => tokens(e.text).includes(s)))
    return { key, docCount, question: q?.text ?? null, docId: q?.docId ?? null }
  })
}
