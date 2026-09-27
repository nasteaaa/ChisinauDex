import fp from 'fastify-plugin'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

/**
 * Lets routes declare request/response schemas with Zod — validated at runtime
 * and typed at compile time.
 *
 * @see https://github.com/turkerdev/fastify-type-provider-zod
 */
export default fp(async (fastify) => {
  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)
})
