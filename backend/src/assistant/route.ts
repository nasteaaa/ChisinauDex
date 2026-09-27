import { SOURCES, sourceById } from '../corpus/sources'
import { store, type Hit } from '../corpus/store'
import { bridgeToRomanian, fold, tokens } from '../corpus/text'
import type { Category, District } from '../corpus/types'

// Which institution a resident should contact. The top-ranked document is often a news post on some
// other site (a district hall reposting a kindergarten notice), so we decide in this order:
// 1. the topic of the question, mapped to the institution that is legally responsible for it;
// 2. for sector-level services, the resident's own district body when we know their sector;
// 3. otherwise the institutions whose documents match best, weighted by authority.

interface Topic { match: RegExp; sourceId: string; district?: 'dets' | 'amt' | 'pretura' }

// Checked against the folded question plus its Romanian keywords, in this order (first match wins).
const TOPICS: Topic[] = [
  { match: /lift|ascensor/, sourceId: 'liftservice' },
  { match: /compensati.*(incalz|caldur)|(incalz|caldur).*compensati|компенсац/, sourceId: 'dgams' },
  // Heating and hot water come from Termoelectrica (not in Annex 1); the municipal housing directorate coordinates them.
  { match: /apa calda|incalzir|agent termic|caldur|калорифер|отоплен|горяч/, sourceId: 'dglca' },
  { match: /\bapa\b(?! calda)|apei|canaliz|apa-canal|deconect.*apa|вод/, sourceId: 'acc' },
  { match: /deseu|gunoi|salubr|tomberon|мусор|отход/, sourceId: 'autosalubritate' },
  { match: /arbor|copac|spatii verzi|spatiu verde|parc\b|дерев/, sourceId: 'agsv' },
  { match: /factur|contor|servicii comunale|infocom|квитанц/, sourceId: 'infocom' },
  // Enrolment happens on the platforms; other school/kindergarten questions go to the (district) directorate.
  { match: /(inscri|cerere|loc(uri)? libere|district).*(gradinit|educatie timpurie)|(gradinit|educatie timpurie).*(inscri|cerere|loc(uri)? libere|district)|запис.*(детск|садик)|(детск|садик).*запис/, sourceId: 'egradinita' },
  { match: /(inscri|admit|inmatricul|cerere).*(scoal|clasa (i|a)|liceu)|(scoal|clasa (i|a)|liceu).*(inscri|admit|inmatricul)|запис.*школ|школ.*запис/, sourceId: 'escoala' },
  { match: /gradinit|educatie timpurie|детск|садик/, sourceId: 'dgets', district: 'dets' },
  { match: /scoal|liceu|clasa (i|a)|elev|школ/, sourceId: 'dgets', district: 'dets' },
  { match: /parcar|evacua.*(auto|masin)|парков/, sourceId: 'mobilitate' },
  { match: /autobuz|troleibuz|transport public|abonament.*(transport|calator)|ruta|bilet|автобус|троллейбус|транспорт/, sourceId: 'mobilitate' },
  { match: /drum|trotuar|strada .*repar|asfalt|дорог/, sourceId: 'mobilitate' },
  { match: /urbanism|construi|construct|demol|teren|pug\b|cadastr|publicitate|строит/, sourceId: 'dgaurf' },
  { match: /cafenea|restaurant|alimentatie|comert|piata|notificare|taraba|кафе|торгов/, sourceId: 'comert' },
  { match: /medic|policlinic|centrul de sanatate|vaccin|врач|поликлиник/, sourceId: 'dgams', district: 'amt' },
  { match: /ajutor (social|material)|compensati|indemniza|incalzire|asistenta sociala|соцпомощ|компенсац/, sourceId: 'dgams' },
  { match: /startup|grant|migrant/, sourceId: 'startup' },
  { match: /tineri|tineret|voluntar|молодеж/, sourceId: 'etineret' },
  { match: /petiti|plangere|plingere|reclamati|sesizare|жалоб|audienta|primar|consiliul municipal|decizi|dispozit|петици|примар/, sourceId: 'chisinau' }
]

// Portals that inform but are not the place to solve a resident's problem.
const NOT_A_ROUTE = new Set(['help', 'suburbii', 'visit', 'invest', 'proiecte', 'educatieonline', 'extrascolar'])

export const CATEGORY_HOME: Record<Category, string> = {
  primaria: 'chisinau', educatie: 'dgets', locuinta: 'dglca', munca: 'comert', sanatate: 'dgams', transport: 'mobilitate', urbanism: 'dgaurf'
}

const DISTRICT_BODY: Record<NonNullable<Topic['district']>, (d: District) => string> = {
  dets: (d) => `dets-${d}`,
  amt: (d) => `amt-${d}`,
  pretura: (d) => `pretura-${d}`
}

export interface Routing { sourceId: string; basis: 'topic' | 'district' | 'documents' | 'domain'; hit?: Hit }

type Opts = { hits?: Hit[]; category?: Category; district?: District }

const topicsOf = (question: string) => {
  const text = fold(`${question} ${bridgeToRomanian(question)}`)
  return TOPICS.filter((t) => t.match.test(text))
}

function resolveTopic(topic: Topic, district?: District): Routing {
  if (topic.district && district) {
    const local = DISTRICT_BODY[topic.district](district)
    // A district body whose site is down is no help; keep the city directorate then.
    if (sourceById.has(local) && (store.healthOf(local)?.ok ?? true)) return { sourceId: local, basis: 'district' }
  }
  return { sourceId: topic.sourceId, basis: 'topic' }
}

export function chooseInstitution(question: string, opts: Opts = {}): Routing | null {
  const topic = topicsOf(question)[0]
  if (topic) return resolveTopic(topic, opts.district)

  const best = vote(question, opts.hits)[0]
  if (best && best[1].score >= 6) return { sourceId: best[0], basis: 'documents', hit: best[1].hit }
  if (opts.category) return { sourceId: CATEGORY_HOME[opts.category], basis: 'domain' }
  return null
}

/** Up to two more institutions worth contacting: other topics the question touches, then strongly matching ones. */
export function alsoRelevant(question: string, primaryId: string, opts: Opts = {}): string[] {
  const ids: string[] = []
  const push = (id: string) => {
    if (id !== primaryId && !ids.includes(id) && sourceById.has(id) && !NOT_A_ROUTE.has(id)) ids.push(id)
  }
  const topics = topicsOf(question)
  for (const t of topics) push(resolveTopic(t, opts.district).sourceId)
  // The city directorate stays useful next to a district body.
  if (topics[0]?.district) push(topics[0].sourceId)
  // Topic rules are curated; document votes only help when no rule knows the question.
  if (topics.length) return ids.slice(0, 2)
  const ranked = vote(question, opts.hits)
  const top = ranked[0]?.[1].score ?? 0
  for (const [id, v] of ranked) {
    const src = sourceById.get(id)!
    // A sector body only when it is the resident's own sector (district halls repost city news).
    if (src.authority === 3 && src.district !== opts.district) continue
    if (v.score >= 6 && v.score >= 0.5 * top) push(id)
  }
  return ids.slice(0, 2)
}

// Institutions vote with their best matching passages, weighted by authority.
function vote(question: string, given?: Hit[]): [string, { score: number; hit?: Hit }][] {
  const hits = given ?? store.search(`${question} ${bridgeToRomanian(question)}`, { limit: 15, perDoc: 1 })
  const words = tokens(question)
  const compact = (id: string) => fold(`${sourceById.get(id)?.name ?? ''}${id}`).replace(/[^\p{L}]/gu, '')
  const votes = new Map<string, { score: number; hit?: Hit }>()
  for (const h of hits) {
    const id = h.passage.doc.sourceId
    const src = sourceById.get(id)
    if (!src || NOT_A_ROUTE.has(id)) continue
    const weight = src.authority === 1 ? 1.3 : src.authority === 2 ? 1.1 : 1
    const v = votes.get(id)
    if (v) v.score += 0.3 * h.score * weight
    else votes.set(id, { score: h.score * weight, hit: h })
  }
  // A distinctive word naming the institution ("lift" → Lift Service) decides.
  const top = Math.max(0, ...[...votes.values()].map((v) => v.score))
  for (const src of SOURCES) {
    if (NOT_A_ROUTE.has(src.id)) continue
    const named = words.some((w) => w.length >= 3 && compact(src.id).includes(w) && SOURCES.filter((x) => compact(x.id).includes(w)).length <= 2)
    if (named) votes.set(src.id, { score: top + 1, hit: votes.get(src.id)?.hit })
  }
  return [...votes.entries()].sort((a, b) => b[1].score - a[1].score)
}
