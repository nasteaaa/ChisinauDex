import { sourceById } from './sources'
import { store } from './store'
import { fold } from './text'
import type { Category } from './types'

// Service cards: for every municipal service page we found, the facts a resident needs before going
// to an office (legal deadline, fee, documents to bring), each copied from the page itself.
// A field the page does not publish stays null and is reported to City Hall as missing.

export interface ServiceField { value: string; quote: string }

export interface ServiceCard {
  docId: string
  title: string
  url: string
  sourceId: string
  institution: string
  category: Category
  term: ServiceField | null
  fee: ServiceField | null
  documents: string[]
  missing: ('term' | 'fee' | 'documents')[]
}

const TERM = /^\s*termen(?:ul)?(?: de [^:\n]{0,50})?\s*:\s*(.{2,80})$/im
const FEE = /^\s*(?:tarif(?:ul)?|tax[aă]|costul?)(?:[^:\n]{0,70})?\s*:\s*(.{2,80})$/im
const DOCS_HEAD = /(?:acte|documente)[^:\n]{0,70}:\s*\n/i

function field(text: string, re: RegExp): ServiceField | null {
  const m = re.exec(text)
  return m ? { value: m[1].trim().replace(/[.;]$/, ''), quote: m[0].trim() } : null
}

/** The bullet list of documents to bring: after "acte/documente …:", or else the first bullet list on the page. */
function documents(text: string): string[] {
  const head = DOCS_HEAD.exec(text)
  const out: string[] = []
  for (const line of text.slice(head ? head.index + head[0].length : 0).split('\n')) {
    const l = line.trim()
    if (!l) continue // pages put blank lines between items
    const item = /^(?:[-•–]|\d+[.)])\s*(.+)$/.exec(l)
    if (!item) { if (out.length || head) break; continue }
    out.push(item[1].replace(/[;.]$/, '').trim())
    if (out.length >= 15) break
  }
  return out
}

// Procurement notices also mention deadlines and prices; they are not services for residents.
const NOT_A_SERVICE = /ofert|licita|achizi|invita|procur|semnat|contract/i

let cache: { builtAt: string; cards: ServiceCard[] } | null = null

export function serviceCards(): ServiceCard[] {
  if (cache?.builtAt === store.corpus.builtAt) return cache.cards
  const cards: ServiceCard[] = []
  const seen = new Set<string>()
  for (const d of store.corpus.docs) {
    const src = sourceById.get(d.sourceId)
    if (!src || d.integrity !== 'ok' || NOT_A_SERVICE.test(d.title)) continue
    const term = field(d.text, TERM)
    const fee = field(d.text, FEE)
    const docs = documents(d.text)
    // A service page states a legal deadline with a duration, plus a fee or the documents to bring.
    if (!term || !/\d/.test(term.value) || !/zi|or[eă]|lun|săpt|sapt/i.test(term.value) || (!fee && !docs.length)) continue
    const key = fold(d.title)
    if (seen.has(key)) continue
    seen.add(key)
    cards.push({
      docId: d.id, title: d.title.trim(), url: d.url, sourceId: src.id, institution: src.name, category: src.category,
      term, fee, documents: docs,
      missing: [...(term ? [] : ['term' as const]), ...(fee ? [] : ['fee' as const]), ...(docs.length ? [] : ['documents' as const])]
    })
  }
  cache = { builtAt: store.corpus.builtAt, cards }
  return cards
}

export const serviceCardFor = (docId: string) => serviceCards().find((c) => c.docId === docId)
