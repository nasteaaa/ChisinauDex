import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { config } from '../config'

/**
 * Security headers, CORS allow-list and basic rate limiting.
 *
 * @see https://github.com/fastify/fastify-helmet
 * @see https://github.com/fastify/fastify-cors
 * @see https://github.com/fastify/fastify-rate-limit
 */
export default fp(async (fastify) => {
  await fastify.register(helmet)
  await fastify.register(cors, { origin: config.corsOrigins })
  await fastify.register(rateLimit, { max: config.RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' })
})
