import { randomUUID } from 'node:crypto'
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sourceById } from '../../../corpus/sources'
import { runtime, type PetitionLog } from '../../../store/runtime'

// Questions residents send to City Hall when the documents don't answer them. Staff see them in the
// dashboard and reply; the resident checks the status with the private id kept in their browser.

const Status = z.enum(['new', 'in_progress', 'answered'])

const Petition = z.object({
  id: z.string(),
  ticket: z.string(),
  at: z.string(),
  question: z.string(),
  message: z.string(),
  sourceId: z.string(),
  institution: z.string(),
  status: Status,
  reply: z.string().optional(),
  repliedAt: z.string().optional()
})

function current(p: PetitionLog): z.infer<typeof Petition> {
  let status: z.infer<typeof Status> = 'new'
  let reply: string | undefined
  let repliedAt: string | undefined
  for (const u of runtime.petitionUpdates.items) {
    if (u.id !== p.id) continue
    status = u.status
    if (u.reply) { reply = u.reply; repliedAt = u.at }
  }
  return { ...p, institution: sourceById.get(p.sourceId)?.name ?? p.sourceId, status, reply, repliedAt }
}

const petitionsRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.post('/', {
    // logLevel 'warn': petition texts may contain personal details and must not end up in access logs.
    logLevel: 'warn',
    schema: {
      body: z.object({ question: z.string().trim().min(2).max(600), message: z.string().trim().min(10).max(5000), sourceId: z.string().max(40) }),
      response: { 201: z.object({ id: z.string(), ticket: z.string() }) }
    }
  }, async function (request, reply) {
    const { question, message, sourceId } = request.body
    const p: PetitionLog = {
      id: randomUUID(),
      ticket: `P-${String(runtime.petitions.items.length + 1).padStart(6, '0')}`,
      at: new Date().toISOString(),
      question, message,
      sourceId: sourceById.has(sourceId) ? sourceId : 'chisinau'
    }
    runtime.petitions.add(p)
    return reply.code(201).send({ id: p.id, ticket: p.ticket })
  })

  // Resident: status of their own petitions (ids are random, known only to the browser that sent them).
  fastify.get('/status', {
    schema: {
      querystring: z.object({ ids: z.string().max(2000) }),
      response: { 200: z.array(Petition.omit({ message: true })) }
    }
  }, async function (request) {
    const ids = new Set(request.query.ids.split(',').filter(Boolean))
    return runtime.petitions.items.filter((p) => ids.has(p.id)).map((p) => {
      const { message: _message, ...rest } = current(p)
      return rest
    })
  })

  // Staff inbox, newest first.
  fastify.get('/inbox', {
    logLevel: 'warn',
    schema: { response: { 200: z.array(Petition) } }
  }, async function () {
    return [...runtime.petitions.items].reverse().map(current)
  })

  fastify.post('/:id/update', {
    logLevel: 'warn',
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({ status: z.enum(['in_progress', 'answered']), reply: z.string().trim().max(5000).optional() }),
      response: { 200: Petition }
    }
  }, async function (request, reply) {
    const p = runtime.petitions.items.find((x) => x.id === request.params.id)
    if (!p) return reply.notFound()
    runtime.petitionUpdates.add({ at: new Date().toISOString(), id: p.id, ...request.body })
    return current(p)
  })
}

export default petitionsRoutes
