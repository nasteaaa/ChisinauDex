import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { store } from '../../../corpus/store'
import { fold } from '../../../corpus/text'
import { runtime } from '../../../store/runtime'

// Search-as-you-type: questions other citizens asked (that got an answer) plus matching document titles.
const suggestRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', {
    schema: {
      querystring: z.object({ q: z.string().trim().max(200).default('') }),
      response: {
        200: z.object({
          questions: z.array(z.object({ text: z.string(), count: z.number() })),
          documents: z.array(z.object({ id: z.string(), title: z.string(), sourceId: z.string() }))
        })
      }
    }
  }, async function (request) {
    const q = fold(request.query.q)
    const counts = new Map<string, { text: string; count: number }>()
    for (const item of runtime.questions.items) {
      if (item.status === 'gap') continue
      const k = fold(item.question)
      if (q && !k.includes(q)) continue
      const c = counts.get(k) ?? { text: item.question, count: 0 }
      c.count++
      counts.set(k, c)
    }
    const questions = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5)
    const documents = q.length < 3 ? [] : store.search(request.query.q, { limit: 5, perDoc: 1 })
      .map((h) => ({ id: h.passage.doc.id, title: h.passage.doc.title, sourceId: h.passage.doc.sourceId }))
    return { questions, documents }
  })
}

export default suggestRoutes
