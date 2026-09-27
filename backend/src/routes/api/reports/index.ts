import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { runtime } from '../../../store/runtime'

// Accessibility problem reports from the accessibility statement page (EU Web Accessibility Directive).
const reportsRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.post('/', {
    schema: {
      body: z.object({ kind: z.literal('accessibility'), message: z.string().trim().min(5).max(2000) }),
      response: { 201: z.object({ ok: z.boolean() }) }
    }
  }, async function (request, reply) {
    runtime.reports.add({ at: new Date().toISOString(), ...request.body })
    return reply.code(201).send({ ok: true })
  })
}

export default reportsRoutes
