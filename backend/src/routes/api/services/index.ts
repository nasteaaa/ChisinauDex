import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { routeFor } from '../../../assistant/ask'
import { serviceCards } from '../../../corpus/services'
import { fold } from '../../../corpus/text'
import { CATEGORIES } from '../../../corpus/types'

const Field = z.object({ value: z.string(), quote: z.string() }).nullable()

export const ServiceCardSchema = z.object({
  docId: z.string(),
  title: z.string(),
  url: z.string(),
  sourceId: z.string(),
  institution: z.string(),
  category: z.enum(CATEGORIES),
  term: Field,
  fee: Field,
  documents: z.array(z.string()),
  missing: z.array(z.enum(['term', 'fee', 'documents'])),
  contactUrl: z.string()
})

// Service cards: deadline, fee and documents for each municipal service page we indexed.
const servicesRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', {
    schema: {
      querystring: z.object({ q: z.string().trim().max(200).optional(), category: z.enum(CATEGORIES).optional() }),
      response: { 200: z.object({ total: z.number(), items: z.array(ServiceCardSchema) }) }
    }
  }, async function (request) {
    const { q, category } = request.query
    const words = q ? fold(q).split(/\s+/).filter((w) => w.length > 2) : []
    const items = serviceCards()
      .filter((c) => (!category || c.category === category) && words.every((w) => fold(`${c.title} ${c.documents.join(' ')}`).includes(w)))
      .map((c) => ({ ...c, contactUrl: routeFor(c.sourceId).contactUrl }))
    return { total: items.length, items }
  })
}

export default servicesRoutes
