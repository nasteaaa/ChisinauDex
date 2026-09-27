import { store } from './store'
import { fold, tokens } from './text'

// Typo fixing for questions, "did you mean" style. Deliberately cautious:
// only a Latin-script word the corpus has never seen is replaced, and only by a word
// the official documents use at least 3 times that is 1 letter away (2 for long words).
// Cyrillic is left alone: the corpus is mostly Romanian, so Russian words would be "fixed" into Romanian ones.

const MIN_COUNT = 3

let vocab: Map<string, { n: number; form: string }> | undefined

/** Word list for typo fixing; built once from the corpus (call at startup to avoid a slow first question). */
export function vocabulary() {
  if (vocab) return vocab
  const counts = new Map<string, { n: number; forms: Map<string, number> }>()
  for (const doc of store.corpus.docs) {
    if (doc.integrity !== 'ok') continue
    for (const w of `${doc.title} ${doc.text}`.toLowerCase().match(/[a-zăâîșşțţ]{4,}/g) ?? []) {
      const key = fold(w)
      const e = counts.get(key) ?? { n: 0, forms: new Map() }
      e.n++
      // Old sites write ş/ţ with a cedilla; the correct Romanian letters have a comma.
      const form = w.replace(/ş/g, 'ș').replace(/ţ/g, 'ț')
      e.forms.set(form, (e.forms.get(form) ?? 0) + 1)
      counts.set(key, e)
    }
  }
  vocab = new Map()
  for (const [key, e] of counts) {
    if (e.n < MIN_COUNT) continue
    // The spelling the documents use most, diacritics included.
    const form = [...e.forms.entries()].sort((a, b) => b[1] - a[1])[0][0]
    vocab.set(key, { n: e.n, form })
  }
  return vocab
}

/** Optimal string alignment distance, giving up once it exceeds `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1)
      cur.push(d)
      rowMin = Math.min(rowMin, d)
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]
}

function fixWord(word: string): string | undefined {
  const key = fold(word)
  // Short words are too often valid forms the corpus happens not to use ("scriu"); fixing them does more harm than good.
  if (key.length < 6 || !/^[a-z]+$/.test(key)) return undefined
  const v = vocabulary()
  // A word whose stem the corpus knows is most likely a valid inflection ("programez", "cafenele"),
  // and search already finds it by that stem, so it is left alone.
  if (v.has(key) || tokens(key).every((t) => store.knows(t))) return undefined
  const max = key.length >= 8 ? 2 : 1
  let best: { d: number; n: number; form: string } | undefined
  for (const [cand, e] of v) {
    const d = distance(key, cand, max)
    if (d > max) continue
    if (!best || d < best.d || (d === best.d && e.n > best.n)) best = { d, n: e.n, form: e.form }
  }
  return best?.form
}

/** The question with typos fixed, or undefined when nothing needed fixing. */
export function correctQuestion(question: string): string | undefined {
  let changed = false
  const fixed = question.replace(/\p{L}+/gu, (w, at: number) => {
    // Names (streets, institutions, "ChisinauDex") are left alone: capitalised words after the first.
    if (at > 0 && w[0] !== w[0].toLowerCase()) return w
    if (/\p{Lu}/u.test(w.slice(1))) return w
    const f = fixWord(w)
    if (!f) return w
    changed = true
    return w[0] === w[0].toUpperCase() ? f[0].toUpperCase() + f.slice(1) : f
  })
  return changed ? fixed : undefined
}
