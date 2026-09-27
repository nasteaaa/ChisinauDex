import { type FastifyPluginAsync } from 'fastify'
import { vectorIndex } from '../corpus/vectors'

const root: FastifyPluginAsync = async (fastify): Promise<void> => {
  // Liveness probe used by the hosting platform's health check.
  fastify.get('/health', async function () {
    // `vectors` shows the embedding index being built after a deploy (search is keyword-only until ready).
    return { status: 'ok', vectors: vectorIndex }
  })
}

export default root
