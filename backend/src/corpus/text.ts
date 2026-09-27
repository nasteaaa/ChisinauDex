// Text normalisation shared by search, quote verification and street matching.

/** Lowercase, strip diacritics (ș/ş, ț/ţ, ă, â, î, й, ё), collapse whitespace, unify quotes and dashes. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[„“”«»"]/g, '"')
    .replace(/[‘’‚`]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOP = new Set([
  // ro
  'si', 'sau', 'la', 'in', 'din', 'de', 'pe', 'cu', 'un', 'o', 'a', 'al', 'ale', 'ai', 'care', 'ce', 'cum', 'unde', 'cand',
  'este', 'sunt', 'fi', 'pentru', 'prin', 'mai', 'nu', 'se', 'sa', 'ca', 'lui', 'cel', 'cea', 'eu', 'meu', 'mea', 'pot', 'trebuie',
  'am', 'are', 'dupa', 'fara', 'catre', 'acest', 'aceasta', 'dvs', 'va', 'imi', 'ma', 'cine',
  'fac', 'daca', 'cat', 'cate', 'unui', 'unei', 'poate', 'vreau', 'despre', 'exista', 'obtin', 'aflu', 'gasesc',
  // ru
  'и', 'в', 'во', 'на', 'с', 'со', 'по', 'к', 'о', 'об', 'от', 'для', 'из', 'как', 'что', 'где', 'когда', 'это', 'не', 'ли',
  'мне', 'я', 'мой', 'моя', 'нужно', 'можно', 'есть', 'или', 'а', 'но', 'у', 'за', 'до', 'кто',
  'какой', 'какие', 'сколько', 'если', 'чтобы', 'надо', 'хочу', 'получить', 'узнать', 'найти',
  // en
  'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'how', 'what', 'where', 'when', 'is', 'are', 'do', 'can', 'i', 'my', 'a', 'an'
])

/** Tokens for BM25: folded words, stop words removed, crude prefix stemming (RO/RU are heavily inflected). */
export function tokens(s: string): string[] {
  const out: string[] = []
  for (const w of fold(s).split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 2 || STOP.has(w)) continue
    out.push(w.length > 6 ? w.slice(0, 6) : w)
  }
  return out
}

/** Whether `quote` appears verbatim in `text`, ignoring case, diacritics, whitespace and quote style. */
export function containsQuote(text: string, quote: string): boolean {
  const q = fold(quote).replace(/[.;:,]+$/, '')
  return q.length >= 12 && fold(text).includes(q)
}

export function splitSentences(s: string): string[] {
  return s
    .split(/(?<=[.!?;])\s+(?=[A-ZĂÂÎȘȚА-ЯЁ0-9„«"])/u)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
}

// Minimal RU→RO / EN→RO bridge so the no-AI fallback can still search Romanian documents.
const BRIDGE: [RegExp, string][] = [
  [/детск\p{L}*\s*сад\p{L}*|садик\p{L}*/gu, 'gradinita'],
  [/kindergarten\p{L}*/gu, 'gradinita'],
  [/школ\p{L}*/gu, 'scoala'], [/school\p{L}*/gu, 'scoala'],
  [/запис\p{L}*|зачисл\p{L}*/gu, 'inscriere'], [/enrol\p{L}*|registr\p{L}*/gu, 'inscriere'],
  [/вод\p{L}*/gu, 'apa'], [/water/gu, 'apa'],
  [/отключ\p{L}*/gu, 'deconectare'], [/outage\p{L}*/gu, 'deconectare'],
  [/мусор\p{L}*|отход\p{L}*/gu, 'deseuri'], [/gunoi\p{L}*/gu, 'deseuri salubritate'],
  [/copac\p{L}*/gu, 'arbori spatii verzi'], [/ascensor\p{L}*/gu, 'lift'], [/waste|garbage|trash/gu, 'deseuri'],
  [/тариф\p{L}*/gu, 'tarif'], [/tariff\p{L}*|fare\p{L}*|price\p{L}*/gu, 'tarif'],
  [/автобус\p{L}*/gu, 'autobuz'], [/троллейбус\p{L}*/gu, 'troleibuz'], [/bus\p{L}*/gu, 'autobuz'],
  [/маршрут\p{L}*/gu, 'ruta'], [/route\p{L}*/gu, 'ruta'],
  [/врач\p{L}*|доктор\p{L}*/gu, 'medic'], [/doctor\p{L}*/gu, 'medic'],
  [/семейн\p{L}*/gu, 'familie'], [/family/gu, 'familie'],
  [/петици\p{L}*|жалоб\p{L}*/gu, 'petitie'], [/petition\p{L}*|complain\p{L}*/gu, 'petitie'],
  [/примар\p{L}*|мэр\p{L}*/gu, 'primar'], [/mayor/gu, 'primar'],
  [/приём\p{L}*|прием\p{L}*/gu, 'audienta'], [/audience\p{L}*|appointment\p{L}*/gu, 'audienta'],
  [/разрешени\p{L}*/gu, 'autorizatie'], [/permit\p{L}*/gu, 'autorizatie'],
  [/строительств\p{L}*/gu, 'construire'], [/construct\p{L}*|build\p{L}*/gu, 'construire'],
  [/дерев\p{L}*/gu, 'arbori'], [/tree\p{L}*/gu, 'arbori'],
  [/лифт\p{L}*/gu, 'lift'], [/elevator\p{L}*/gu, 'lift'],
  [/отоплени\p{L}*/gu, 'incalzire'], [/heating/gu, 'incalzire'],
  [/кафе|ресторан\p{L}*/gu, 'alimentatie publica'], [/cafe|restaurant\p{L}*/gu, 'alimentatie publica'],
  [/торгов\p{L}*/gu, 'comert'], [/trade|commerce/gu, 'comert'],
  [/стартап\p{L}*|грант\p{L}*/gu, 'startup granturi'], [/startup\p{L}*|grant\p{L}*/gu, 'startup granturi'],
  [/молодёж\p{L}*|молодеж\p{L}*/gu, 'tineret'], [/youth/gu, 'tineret'],
  [/контакт\p{L}*|телефон\p{L}*/gu, 'contacte telefon'], [/contact\p{L}*|phone/gu, 'contacte telefon'],
  [/налог\p{L}*|сбор\p{L}*/gu, 'taxe'], [/tax\p{L}*/gu, 'taxe'],
  [/парковк\p{L}*/gu, 'parcare'], [/parking/gu, 'parcare'],
  [/дорог\p{L}*|ремонт\p{L}*/gu, 'drum reparatie'], [/road\p{L}*|repair\p{L}*/gu, 'drum reparatie'],
  [/сектор\p{L}*/gu, 'sector'], [/претур\p{L}*/gu, 'pretura']
]

export function bridgeToRomanian(q: string): string {
  const s = q.toLowerCase()
  const extra: string[] = []
  for (const [re, ro] of BRIDGE) if (s.match(re)) extra.push(ro)
  return extra.join(' ')
}

const EN_WORDS = /\b(the|how|what|where|when|who|which|can|do|does|is|are|my|i|to|for|get|need)\b/g
const RO_WORDS = /\b(cum|unde|cine|care|ce|cand|când|pot|este|sunt|pentru|la|în|din|să|si|și|de|copilul|vreau)\b/g

/** The language the question is written in, so the answer can use it (not the interface language). */
export function questionLang(q: string): 'ro' | 'ru' | 'en' | undefined {
  const letters = q.match(/\p{L}/gu)?.length ?? 0
  if (!letters) return undefined
  if ((q.match(/\p{Script=Cyrillic}/gu)?.length ?? 0) / letters > 0.4) return 'ru'
  if (/[ăâîșşțţ]/i.test(q)) return 'ro'
  const lower = q.toLowerCase()
  const en = lower.match(EN_WORDS)?.length ?? 0
  const ro = lower.match(RO_WORDS)?.length ?? 0
  if (en > ro) return 'en'
  if (ro > en) return 'ro'
  return undefined
}
