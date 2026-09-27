import fp from 'fastify-plugin'
import { config } from '../config'
import { vocabulary } from '../corpus/spell'
import { store } from '../corpus/store'
import { syncVectors } from '../corpus/vectors'
import { closeDb } from '../db'
import { runtime } from '../store/runtime'

/** Loads the scraped corpus (backend/data/*.json), builds the search index and opens the database at startup. */
export default fp(async (fastify) => {
  const t0 = Date.now()
  store.load()
  vocabulary()
  fastify.log.info(`corpus: ${store.corpus.docs.length} docs, ${store.passages.length} passages indexed in ${Date.now() - t0} ms`)
  await runtime.load()
  fastify.log.info(`database: ${runtime.questions.items.length} questions, ${runtime.feedback.items.length} ratings loaded`)
  // Embeddings are built in the background: until they are ready, search runs on keywords only.
  if (config.NODE_ENV !== 'test') {
    syncVectors((m) => fastify.log.info(m)).catch((e: Error) => fastify.log.error(`vector index failed, keywords only: ${e.message}`))
  }
  fastify.addHook('onClose', closeDb)
})
