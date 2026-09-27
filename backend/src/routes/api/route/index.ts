import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { routeFor } from '../../../assistant/ask'
import { CATEGORY_HOME, chooseInstitution } from '../../../assistant/route'
import { CATEGORIES } from '../../../corpus/types'

const Route = z.object({ sourceId: z.string(), name: z.string(), publisher: z.string(), contactUrl: z.string(), siteUrl: z.string() })

// Staff "internal assistant": a described situation → the responsible institution.
// With `category` (manual pick when nothing matches) it returns that domain's general directorate.
const routeRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', {
    schema: {
      querystring: z.object({ q: z.string().trim().max(300).default(''), category: z.enum(CATEGORIES).optional() }),
      response: { 200: z.object({ route: Route.nullable(), basedOn: z.object({ docId: z.string(), title: z.string() }).nullable() }) }
    }
  }, async function (request) {
    const { q, category } = request.query
    if (category) return { route: routeFor(CATEGORY_HOME[category]), basedOn: null }
    if (q.length < 3) return { route: null, basedOn: null }
    const choice = chooseInstitution(q)
    if (!choice) return { route: null, basedOn: null }
    const doc = choice.hit?.passage.doc
    return { route: routeFor(choice.sourceId), basedOn: doc ? { docId: doc.id, title: doc.title } : null }
  })
}

export default routeRoutes
