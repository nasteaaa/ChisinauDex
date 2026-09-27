import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { runtime } from '../../../store/runtime'

// First-party analytics. The frontend only calls this after the user accepts analytics cookies.
// We store a random per-browser session id and the path — no IP, no user agent.
const eventsRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.post('/', {
    schema: {
      body: z.object({ type: z.literal('page_view'), path: z.string().max(300), sessionId: z.string().max(64) }),
      response: { 202: z.object({ ok: z.boolean() }) }
    }
  }, async function (request, reply) {
    runtime.events.add({ at: new Date().toISOString(), ...request.body })
    return reply.code(202).send({ ok: true })
  })
}

export default eventsRoutes
