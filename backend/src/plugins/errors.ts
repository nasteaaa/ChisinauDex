import fp from 'fastify-plugin'

/**
 * Never leak internals (SQL, stack traces) to clients on 5xx errors.
 * The full error is still logged server-side.
 */
export default fp(async (fastify) => {
  fastify.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const statusCode = error.statusCode ?? 500
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed')
      return reply.code(statusCode).send({ statusCode, error: 'Internal Server Error', message: 'Something went wrong' })
    }
    return reply.code(statusCode).send(error)
  })
})
