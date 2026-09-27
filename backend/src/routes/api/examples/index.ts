import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { examples, tiles } from '../../../corpus/examples'
import { CATEGORIES } from '../../../corpus/types'

// Example questions and life-situation tiles derived from the corpus and real usage.
const examplesRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', {
    schema: {
      querystring: z.object({ lang: z.enum(['ro', 'ru', 'en']).default('ro'), category: z.enum(CATEGORIES).optional() }),
      response: {
        200: z.object({
          questions: z.array(z.object({
            text: z.string(),
            category: z.enum(CATEGORIES),
            lang: z.enum(['ro', 'ru']),
            origin: z.enum(['popular', 'corpus']),
            docId: z.string().optional(),
            count: z.number().optional()
          })),
          tiles: z.array(z.object({ key: z.string(), docCount: z.number(), question: z.string().nullable(), docId: z.string().nullable() }))
        })
      }
    }
  }, async function (request) {
    const { lang, category } = request.query
    return { questions: examples(lang, category), tiles: tiles(lang) }
  })
}

export default examplesRoutes
