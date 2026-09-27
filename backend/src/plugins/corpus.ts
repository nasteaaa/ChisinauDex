import fp from 'fastify-plugin'
import { warmEmbeddings } from '../assistant/embed'
import { config } from '../config'
import { vocabulary } from '../corpus/spell'
import { store } from '../corpus/store'
import { loadVectorStatus, syncVectors, vectorIndex } from '../corpus/vectors'
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
  if (config.DATABASE_URL) {
    // Production: indexing is a separate job (`pnpm embed`, run after each crawl); the web server only embeds
    // the questions. Embedding thousands of chunks in-process needs gigabytes of memory.
    await loadVectorStatus()
    fastify.log.info(`vector index: ${vectorIndex.embedded}/${vectorIndex.total} chunks embedded`)
    // Load the model now, so the first question does not wait ~5 s for it.
    if (vectorIndex.embedded) warmEmbeddings().catch((e: Error) => fastify.log.error(`embedding model failed to load: ${e.message}`))
  } else if (config.NODE_ENV !== 'test') {
    // Local development (embedded PGlite): build the index in the background; keywords only until ready.
    syncVectors((m) => fastify.log.info(m)).catch((e: Error) => fastify.log.error(`vector index failed, keywords only: ${e.message}`))
  }
  fastify.addHook('onClose', closeDb)
})
