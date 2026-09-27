import { PassThrough } from 'node:stream'
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ask } from '../../../assistant/ask'
import { CATEGORIES } from '../../../corpus/types'
import { ServiceCardSchema } from '../services'

const Cited = z.object({ text: z.string(), cites: z.array(z.number()) })

const Answer = z.object({
  id: z.string(),
  question: z.string(),
  lang: z.enum(['ro', 'ru', 'en']),
  mode: z.enum(['ai', 'fallback']),
  status: z.enum(['ok', 'partial', 'gap', 'conflict']),
  sentences: z.array(Cited),
  steps: z.array(Cited),
  sources: z.array(z.object({
    n: z.number(),
    passageId: z.string(),
    docId: z.string(),
    title: z.string(),
    url: z.string(),
    sourceId: z.string(),
    sourceName: z.string(),
    publisher: z.string(),
    authority: z.number(),
    date: z.string().optional(),
    type: z.string(),
    passage: z.string(),
    quote: z.string(),
    start: z.number(),
    end: z.number(),
    translation: z.string().optional(),
    live: z.boolean(),
    relevance: z.number()
  })),
  conflict: z.object({
    topic: z.string(),
    sides: z.array(z.object({ n: z.number(), value: z.string() })),
    newer: z.object({ n: z.number(), reason: z.enum(['date', 'authority']) }).optional()
  }).optional(),
  missing: z.string().optional(),
  route: z.object({ sourceId: z.string(), name: z.string(), publisher: z.string(), contactUrl: z.string(), siteUrl: z.string() }),
  correctedFrom: z.string().optional(),
  romanianOnly: z.boolean(),
  cached: z.boolean().optional(),
  alsoRoute: z.array(z.object({ sourceId: z.string(), name: z.string(), publisher: z.string(), contactUrl: z.string(), siteUrl: z.string() })),
  searched: z.object({ passages: z.number(), docs: z.number(), live: z.number(), quarantinedSkipped: z.number() }),
  excluded: z.array(z.object({ docId: z.string(), title: z.string(), publisher: z.string(), date: z.string().optional() })),
  related: z.array(z.string()),
  relevance: z.number(),
  service: ServiceCardSchema.optional(),
  latencyMs: z.number()
})

const AskBody = z.object({
  question: z.string().trim().min(2).max(600),
  lang: z.enum(['ro', 'ru', 'en']).default('ro'),
  role: z.enum(['citizen', 'employee']).default('citizen'),
  category: z.enum(CATEGORIES).optional(),
  district: z.enum(['centru', 'botanica', 'buiucani', 'ciocana', 'riscani']).optional(),
  publishedFrom: z.iso.date().optional(),
  publishedTo: z.iso.date().optional(),
  exact: z.boolean().optional()
})

const askRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.post('/', {
    schema: { body: AskBody, response: { 200: Answer } }
  }, async function (request) {
    return ask(request.body)
  })

  // Same pipeline, streamed as NDJSON: one {"type":"progress"} line per real stage, then {"type":"answer"}.
  // (No response schema: the body is a stream; the final answer has the same shape as POST /api/ask.)
  fastify.post('/stream', {
    schema: { body: AskBody }
  }, async function (request, reply) {
    const out = new PassThrough()
    const line = (o: unknown) => out.write(JSON.stringify(o) + '\n')
    ask(request.body, (p) => line({ type: 'progress', ...p }))
      .then((answer) => line({ type: 'answer', answer: Answer.parse(answer) }))
      .catch((err: unknown) => {
        request.log.error(err)
        line({ type: 'error' })
      })
      .finally(() => out.end())
    return reply.type('application/x-ndjson').header('Cache-Control', 'no-cache').send(out)
  })
}

export default askRoutes
