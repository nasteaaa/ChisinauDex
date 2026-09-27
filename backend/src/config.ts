import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

// Local dev convenience: load backend/.env if present. In production the
// platform (Railway, Render, ...) injects real environment variables.
if (existsSync('.env')) process.loadEnvFile('.env')

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Comma-separated list of allowed browser origins, e.g. "https://my-app.vercel.app"
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Per IP. Visitors on one network (a venue's Wi-Fi) share an IP, so these only stop bots, not people.
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(600),
  // Questions per IP: new ones can cost model tokens. Tokens are also protected by the answer cache, and when they
  // run out the answer still comes (exact quotes, no AI), so this is only a guard against scripted abuse.
  ASK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  // Optional AI: a Groq API key. Without it the assistant answers with quotes picked directly from the corpus
  // and a live site search.
  AI_API_KEY: z.string().optional(),
  // Models to use, best first: when one reaches its daily free-tier limit, the next one answers.
  AI_MODELS: z.string().default('openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b'),
  // Any OpenAI-compatible chat-completions API; Groq by default.
  AI_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  DATA_DIR: z.string().default('data'),
  // Where usage logs are written (a volume in production). Defaults to DATA_DIR/runtime.
  RUNTIME_DIR: z.string().optional(),
  // Postgres with pgvector (Railway). Without it an embedded Postgres (PGlite) runs in RUNTIME_DIR/pg.
  DATABASE_URL: z.string().optional()
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment variables:', z.prettifyError(parsed.error))
  process.exit(1)
}

export const config = {
  ...parsed.data,
  runtimeDir: parsed.data.RUNTIME_DIR ?? join(parsed.data.DATA_DIR, 'runtime'),
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
}
