import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { llmEnabled } from '../../../assistant/llm'
import { SOURCES } from '../../../corpus/sources'
import { store } from '../../../corpus/store'
import { CATEGORIES } from '../../../corpus/types'

// The official sources behind the assistant, with their last crawl health (About page, filters).
const sourcesRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', {
    schema: {
      response: {
        200: z.object({
          corpusBuiltAt: z.string(),
          healthCheckedAt: z.string(),
          aiEnabled: z.boolean(),
          sources: z.array(z.object({
            id: z.string(),
            url: z.string(),
            name: z.string(),
            publisher: z.string(),
            category: z.enum(CATEGORIES),
            authority: z.number(),
            district: z.string().optional(),
            ok: z.boolean().nullable(),
            blocked: z.boolean(),
            tls: z.string().nullable(),
            docCount: z.number(),
            quarantined: z.number(),
            latestContentAt: z.string().optional(),
            contactUrl: z.string().optional()
          }))
        })
      }
    }
  }, async function () {
    return {
      corpusBuiltAt: store.corpus.builtAt,
      healthCheckedAt: store.health.checkedAt,
      aiEnabled: llmEnabled(),
      sources: SOURCES.map((s) => {
        const h = store.healthOf(s.id)
        const docs = store.corpus.docs.filter((d) => d.sourceId === s.id)
        return {
          ...s,
          ok: h ? h.ok : null,
          blocked: h?.blocked ?? false,
          tls: h ? h.tls : null,
          docCount: docs.length,
          quarantined: docs.filter((d) => d.integrity === 'quarantined').length,
          latestContentAt: h?.latestContentAt,
          contactUrl: h?.contactUrl
        }
      })
    }
  })
}

export default sourcesRoutes
