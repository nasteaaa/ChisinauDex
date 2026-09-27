import { join } from 'node:path'
import { config } from '../config'

// Local multilingual embeddings (multilingual-e5-small, 384 dimensions, quantized): Romanian, Russian and
// English land in one vector space, so a Russian question finds Romanian documents. Runs on the CPU inside
// the backend, so there is no second API key and nothing to pay per chunk. The model (~120 MB) is downloaded
// once into RUNTIME_DIR/models.

const MODEL = 'Xenova/multilingual-e5-small'
export const DIMENSIONS = 384

type Extractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>
let extractor: Promise<Extractor> | undefined

function load(): Promise<Extractor> {
  extractor ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = join(config.runtimeDir, 'models')
    return (await pipeline('feature-extraction', MODEL, { dtype: 'q8' })) as unknown as Extractor
  })()
  return extractor
}

/** e5 models expect "query: " for questions and "passage: " for indexed text. */
export async function embed(texts: string[], kind: 'query' | 'passage'): Promise<number[][]> {
  const run = await load()
  const out = await run(texts.map((t) => `${kind}: ${t}`), { pooling: 'mean', normalize: true })
  return out.tolist()
}

export const warmEmbeddings = () => load().then(() => undefined)
