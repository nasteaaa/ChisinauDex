import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sourceById } from '../../../corpus/sources'
import { store } from '../../../corpus/store'
import { CATEGORIES, type Doc } from '../../../corpus/types'
import { runtime } from '../../../store/runtime'

const DocType = z.enum(['post', 'page', 'pdf', 'html', 'event'])

const Item = z.object({
  id: z.string(),
  title: z.string(),
  excerpt: z.string(),
  url: z.string(),
  type: DocType,
  lang: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  publisher: z.string(),
  category: z.enum(CATEGORIES),
  authority: z.number(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  integrity: z.enum(['ok', 'quarantined']),
  integrityReason: z.string().optional()
})

const Facet = z.array(z.object({ id: z.string(), count: z.number() }))

const views = (id: string) => runtime.events.items.filter((e) => e.type === 'doc_view' && e.docId === id).length

function toItem(d: Doc, excerpt?: string): z.infer<typeof Item> {
  const s = sourceById.get(d.sourceId)!
  return {
    id: d.id, title: d.title, excerpt: (excerpt ?? d.text).replace(/\s+/g, ' ').slice(0, 260), url: d.url, type: d.type, lang: d.lang,
    sourceId: s.id, sourceName: s.name, publisher: s.publisher, category: s.category, authority: s.authority,
    publishedAt: d.publishedAt, updatedAt: d.updatedAt, integrity: d.integrity, integrityReason: d.integrityReason
  }
}

function facet(docs: Doc[], key: (d: Doc) => string) {
  const m = new Map<string, number>()
  for (const d of docs) m.set(key(d), (m.get(key(d)) ?? 0) + 1)
  return [...m].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count)
}

const documentsRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', {
    schema: {
      querystring: z.object({
        q: z.string().trim().max(200).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        source: z.string().optional(),
        category: z.enum(CATEGORIES).optional(),
        type: DocType.optional(),
        sort: z.enum(['relevance', 'newest', 'oldest']).default('relevance'),
        includeQuarantined: z.coerce.boolean().default(false),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20)
      }),
      response: {
        200: z.object({
          total: z.number(),
          page: z.number(),
          pageSize: z.number(),
          items: z.array(Item),
          facets: z.object({ sources: Facet, categories: Facet, types: Facet })
        })
      }
    }
  }, async function (request) {
    const { q, from, to, source, category, type, sort, includeQuarantined, page, pageSize } = request.query
    const dateOf = (d: Doc) => d.publishedAt ?? d.updatedAt
    const inRange = (d: Doc) => {
      const at = dateOf(d)
      if ((from || to) && !at) return false
      if (from && at! < from) return false
      if (to && at! > to + 'T23:59:59') return false
      return true
    }
    let base: { d: Doc; excerpt?: string }[]
    if (q) {
      const hits = store.search(q, { limit: 400, perDoc: 1 })
      base = hits.map((h) => ({ d: h.passage.doc, excerpt: h.passage.text }))
    } else {
      base = store.corpus.docs.filter((d) => includeQuarantined || d.integrity === 'ok').map((d) => ({ d }))
    }
    // Facets reflect the query and period, but not the facet's own filter.
    const scoped = base.filter(({ d }) => inRange(d) && (includeQuarantined || d.integrity === 'ok'))
    const filtered = scoped.filter(({ d }) => {
      const s = sourceById.get(d.sourceId)
      return s && (!source || d.sourceId === source) && (!category || s.category === category) && (!type || d.type === type)
    })
    if (sort !== 'relevance' || !q) {
      const dir = sort === 'oldest' ? 1 : -1
      filtered.sort((a, b) => dir * ((dateOf(a.d) ?? '').localeCompare(dateOf(b.d) ?? '')))
    }
    const docs = scoped.map((x) => x.d)
    return {
      total: filtered.length,
      page,
      pageSize,
      items: filtered.slice((page - 1) * pageSize, page * pageSize).map(({ d, excerpt }) => toItem(d, excerpt)),
      facets: {
        sources: facet(docs, (d) => d.sourceId),
        categories: facet(docs, (d) => sourceById.get(d.sourceId)?.category ?? 'primaria'),
        types: facet(docs, (d) => d.type)
      }
    }
  })

  fastify.get('/:id', {
    schema: {
      params: z.object({ id: z.string() }),
      response: {
        200: Item.extend({
          text: z.string(),
          summary: z.string(),
          files: z.array(z.object({ url: z.string(), name: z.string() })),
          views: z.number(),
          sourceUrl: z.string(),
          contactUrl: z.string().optional(),
          related: z.array(Item)
        })
      }
    }
  }, async function (request, reply) {
    const d = store.docById.get(request.params.id)
    if (!d) return reply.notFound()
    const s = sourceById.get(d.sourceId)!
    const paragraphs = d.text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 40)
    let summary = ''
    for (const p of paragraphs) {
      if (summary.length > 350) break
      summary += (summary ? '\n\n' : '') + p
    }
    const related = store.search(d.title, { limit: 6, perDoc: 1 }).map((h) => h.passage.doc).filter((x) => x.id !== d.id).slice(0, 5)
    return {
      ...toItem(d),
      text: d.text,
      summary: summary.slice(0, 700),
      files: d.files,
      views: views(d.id),
      sourceUrl: s.url,
      contactUrl: store.healthOf(s.id)?.contactUrl,
      related: related.map((x) => toItem(x))
    }
  })

  // Functional view counter (no personal data), shown on the document page.
  fastify.post('/:id/view', {
    schema: { params: z.object({ id: z.string() }), response: { 200: z.object({ views: z.number() }) } }
  }, async function (request, reply) {
    if (!store.docById.has(request.params.id)) return reply.notFound()
    runtime.events.add({ at: new Date().toISOString(), type: 'doc_view', docId: request.params.id })
    return { views: views(request.params.id) }
  })
}

export default documentsRoutes
