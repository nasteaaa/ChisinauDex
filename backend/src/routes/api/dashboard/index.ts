import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { SOURCES, sourceById } from '../../../corpus/sources'
import { store } from '../../../corpus/store'
import { fold } from '../../../corpus/text'
import { serviceCards } from '../../../corpus/services'
import { runtime } from '../../../store/runtime'

const STALE_DAYS = 180
const DAY = 86400000

const Side = z.object({ docId: z.string(), sourceId: z.string(), title: z.string(), url: z.string(), publisher: z.string(), date: z.string().optional(), quote: z.string(), value: z.string() })

const Dashboard = z.object({
  stats: z.object({
    docs: z.number(),
    passages: z.number(),
    sources: z.number(),
    sourcesUp: z.number(),
    quarantined: z.number(),
    questions7d: z.number(),
    questionsTotal: z.number(),
    answeredPct: z.number().nullable(),
    positivePct: z.number().nullable(),
    ratings: z.number(),
    avgLatencyMs: z.number().nullable(),
    visits7d: z.number(),
    aiPct: z.number().nullable(),
    corpusBuiltAt: z.string(),
    healthCheckedAt: z.string()
  }),
  conflicts: z.array(z.object({ id: z.string(), topic: z.string(), origin: z.enum(['index', 'answer']), detectedAt: z.string(), asks: z.number(), state: z.string(), a: Side, b: Side })),
  gaps: z.array(z.object({ id: z.string(), question: z.string(), asks: z.number(), lastAsked: z.string(), owner: z.string(), ownerSourceId: z.string(), state: z.string() })),
  faq: z.array(z.object({ question: z.string(), count: z.number() })),
  pages: z.array(z.object({ id: z.string(), type: z.enum(['down', 'blocked', 'tls', 'stale', 'broken', 'hacked']), sourceId: z.string(), sourceName: z.string(), url: z.string(), note: z.string(), state: z.string() })),
  // Last 7 days, oldest first, plus the previous 7-day total for the week-over-week delta.
  daily: z.object({
    questions: z.array(z.number()), questionsPrev: z.number(),
    answered: z.array(z.number()), answeredPrev: z.number(),
    ratings: z.array(z.number()), ratingsPrev: z.number(),
    visits: z.array(z.number()), visitsPrev: z.number()
  }),
  services: z.object({
    total: z.number(),
    incomplete: z.array(z.object({ docId: z.string(), title: z.string(), url: z.string(), sourceId: z.string(), institution: z.string(), missing: z.array(z.string()) }))
  }),
  activity: z.array(z.object({ at: z.string(), kind: z.string(), id: z.string(), state: z.string() })),
  ratings: z.array(z.object({ question: z.string(), stars: z.number(), tags: z.array(z.string()), comment: z.string().optional(), at: z.string(), sourceId: z.string().optional() }))
})

const key = (q: string) => fold(q).replace(/[^\p{L}\p{N} ]/gu, '').trim()

const dashboardRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', { schema: { response: { 200: Dashboard } } }, async function () {
    const now = Date.now()
    const qs = runtime.questions.items
    const week = qs.filter((q) => now - Date.parse(q.at) < 7 * DAY)
    // Answer ratings only: the footer's service rating is stored with answerId 'service'.
    const fb = runtime.feedback.items.filter((f) => f.answerId !== 'service')
    const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : null)

    const side = (s: { docId: string; quote: string; value: string }) => {
      const d = store.docById.get(s.docId)
      return {
        ...s,
        sourceId: d?.sourceId ?? '',
        title: d?.title ?? s.docId,
        url: d?.url ?? '',
        publisher: d ? sourceById.get(d.sourceId)?.publisher ?? '' : '',
        date: d?.updatedAt ?? d?.publishedAt
      }
    }
    const conflicts = [...store.conflicts, ...runtime.conflicts.items].map((c) => ({
      id: c.id, topic: c.topic, origin: c.origin, detectedAt: c.detectedAt,
      asks: qs.filter((q) => q.conflictId === c.id || (q.docIds.includes(c.a.docId) && q.docIds.includes(c.b.docId))).length,
      state: runtime.stateOf('conflict', c.id) ?? 'open',
      a: side(c.a), b: side(c.b)
    })).sort((x, y) => Number(x.state === 'resolved') - Number(y.state === 'resolved') || y.asks - x.asks)

    const gapMap = new Map<string, { question: string; asks: number; lastAsked: string; owner: string; ownerSourceId: string }>()
    for (const q of qs) {
      if (q.status !== 'gap') continue
      const k = key(q.question)
      const g = gapMap.get(k) ?? { question: q.question, asks: 0, lastAsked: q.at, owner: sourceById.get(q.routeSourceId ?? '')?.name ?? '', ownerSourceId: q.routeSourceId ?? '' }
      g.asks++
      g.lastAsked = q.at
      gapMap.set(k, g)
    }
    const gaps = [...gapMap].map(([id, g]) => ({ id, ...g, state: runtime.stateOf('gap', id) ?? 'open' }))
      .sort((a, b) => Number(a.state !== 'open') - Number(b.state !== 'open') || b.asks - a.asks)

    const faqMap = new Map<string, { question: string; count: number }>()
    for (const q of qs) {
      const k = key(q.question)
      const f = faqMap.get(k) ?? { question: q.question, count: 0 }
      f.count++
      faqMap.set(k, f)
    }

    const pages: z.infer<typeof Dashboard>['pages'] = []
    const add = (type: z.infer<typeof Dashboard>['pages'][number]['type'], sourceId: string, url: string, note: string) => {
      const id = `${type}:${sourceId}:${url}`
      pages.push({ id, type, sourceId, sourceName: sourceById.get(sourceId)?.name ?? sourceId, url, note, state: runtime.stateOf('page', id) ?? 'open' })
    }
    for (const h of store.health.sources) {
      const src = sourceById.get(h.sourceId)
      if (!src) continue
      const quarantined = store.corpus.docs.filter((d) => d.sourceId === h.sourceId && d.integrity === 'quarantined')
      if (quarantined.length) add('hacked', h.sourceId, quarantined[0].url, `${quarantined.length}|${quarantined.slice(0, 3).map((d) => d.title).join(' · ')}`)
      if (!h.ok) add('down', h.sourceId, src.url, h.error ?? String(h.status ?? ''))
      if (h.blocked) add('blocked', h.sourceId, src.url, '')
      if (h.tls === 'invalid') add('tls', h.sourceId, src.url, 'tls')
      if (h.latestContentAt && now - Date.parse(h.latestContentAt) > STALE_DAYS * DAY) add('stale', h.sourceId, src.url, h.latestContentAt)
      for (const b of h.brokenLinks.slice(0, 4)) add('broken', h.sourceId, b.url, `${b.status}|${b.foundOn}`)
    }
    const order = { hacked: 0, down: 1, blocked: 2, tls: 3, broken: 4, stale: 5 }
    pages.sort((a, b) => Number(a.state !== 'open') - Number(b.state !== 'open') || order[a.type] - order[b.type])

    // Every answer rating, newest first, with the question and the institution it was routed to.
    const qById = new Map(qs.map((q) => [q.id, q]))
    const ratings = fb.slice(-50).reverse()
      .map((f) => ({ question: qById.get(f.answerId)?.question ?? '', stars: f.stars, tags: f.tags, comment: f.comment, at: f.at, sourceId: qById.get(f.answerId)?.routeSourceId }))

    const views = runtime.events.items.filter((e) => e.type === 'page_view' && now - Date.parse(e.at) < 7 * DAY)
    // Day buckets: index 0..6 = 6 days ago .. today; 7..13 = the week before.
    const dayIndex = (at: string) => Math.floor((now - Date.parse(at)) / DAY)
    const series = <T>(items: T[], at: (x: T) => string, value: (xs: T[]) => number) => {
      const days: T[][] = Array.from({ length: 14 }, () => [])
      for (const x of items) { const i = dayIndex(at(x)); if (i >= 0 && i < 14) days[i].push(x) }
      return { week: days.slice(0, 7).reverse().map(value), prev: value(days.slice(7).flat()) }
    }
    const qS = series(qs, (q) => q.at, (xs) => xs.length)
    const aS = series(qs, (q) => q.at, (xs) => xs.filter((q) => q.status !== 'gap').length)
    const rS = series(fb, (f) => f.at, (xs) => xs.filter((f) => f.stars >= 4).length)
    const vS = series(runtime.events.items.filter((e) => e.type === 'page_view'), (e) => e.at, (xs) => new Set(xs.map((e) => e.sessionId)).size)
    return {
      stats: {
        docs: store.corpus.docs.length,
        passages: store.passages.length,
        sources: SOURCES.length,
        sourcesUp: store.health.sources.filter((s) => s.ok).length,
        quarantined: store.corpus.docs.filter((d) => d.integrity === 'quarantined').length,
        questions7d: week.length,
        questionsTotal: qs.length,
        answeredPct: pct(qs.filter((q) => q.status !== 'gap').length, qs.length),
        positivePct: pct(fb.filter((f) => f.stars >= 4).length, fb.length),
        ratings: fb.length,
        avgLatencyMs: qs.length ? Math.round(qs.reduce((a, q) => a + q.latencyMs, 0) / qs.length) : null,
        visits7d: new Set(views.map((v) => v.sessionId ?? v.at)).size,
        aiPct: pct(qs.filter((q) => q.mode === 'ai').length, qs.length),
        corpusBuiltAt: store.corpus.builtAt,
        healthCheckedAt: store.health.checkedAt
      },
      conflicts,
      gaps,
      faq: [...faqMap.values()].sort((a, b) => b.count - a.count).slice(0, 8),
      pages,
      daily: {
        questions: qS.week, questionsPrev: qS.prev,
        answered: aS.week, answeredPrev: aS.prev,
        ratings: rS.week, ratingsPrev: rS.prev,
        visits: vS.week, visitsPrev: vS.prev
      },
      services: {
        total: serviceCards().length,
        incomplete: serviceCards().filter((c) => c.missing.length).map(({ docId, title, url, sourceId, institution, missing }) => ({ docId, title, url, sourceId, institution, missing }))
      },
      activity: runtime.actions.items.slice(-30).reverse(),
      ratings
    }
  })

  fastify.post('/action', {
    schema: {
      body: z.object({ kind: z.enum(['conflict', 'gap', 'page']), id: z.string().max(1000), state: z.enum(['open', 'legal', 'resolved', 'assigned', 'sent', 'fixed', 'offline']) }),
      response: { 200: z.object({ ok: z.boolean() }) }
    }
  }, async function (request) {
    runtime.actions.add({ at: new Date().toISOString(), ...request.body })
    return { ok: true }
  })
}

export default dashboardRoutes
