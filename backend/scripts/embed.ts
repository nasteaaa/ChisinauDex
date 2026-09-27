// Builds the vector index (chunks + embeddings in Postgres) and exits. The server also does this at
// startup, but a first run on a small cloud CPU is slow; run it from a laptop against the cloud database:
//   DATABASE_URL=postgres://... pnpm --filter backend embed
import { closeDb } from '../src/db'
import { store } from '../src/corpus/store'
import { syncVectors } from '../src/corpus/vectors'

store.load()
syncVectors()
  .then(closeDb)
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
