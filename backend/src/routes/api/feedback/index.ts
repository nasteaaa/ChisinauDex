import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { runtime } from '../../../store/runtime'

const feedbackRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.post('/', {
    schema: {
      body: z.object({
        answerId: z.string().max(64),
        stars: z.number().int().min(1).max(5),
        tags: z.array(z.string().max(60)).max(8).default([]),
        comment: z.string().trim().max(1000).optional()
      }),
      response: { 201: z.object({ ok: z.boolean() }) }
    }
  }, async function (request, reply) {
    runtime.feedback.add({ at: new Date().toISOString(), ...request.body })
    return reply.code(201).send({ ok: true })
  })
}

export default feedbackRoutes
