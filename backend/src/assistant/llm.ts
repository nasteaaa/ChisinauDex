import { config } from '../config'

// One optional key, AI_API_KEY, for every provider. All of them are called through the same
// OpenAI-compatible chat-completions API; which one is decided by the key's prefix.
// Without a key the assistant runs its no-AI fallback.
interface Provider { prefix: string; name: string; base: string; prefer: RegExp[]; fallbackModel: string; headers?: Record<string, string> }

const PROVIDERS: Provider[] = [
  { prefix: 'sk-ant-', name: 'Anthropic Claude', base: 'https://api.anthropic.com/v1', prefer: [/sonnet/, /opus/, /haiku/], fallbackModel: 'claude-sonnet-5', headers: { 'anthropic-version': '2023-06-01' } },
  { prefix: 'sk-or-', name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', prefer: [/claude.*sonnet/, /gpt-4/, /gemini/], fallbackModel: 'openrouter/auto' },
  { prefix: 'xai-', name: 'xAI Grok', base: 'https://api.x.ai/v1', prefer: [/^grok-4(?!.*(image|vision))/, /^grok-3(?!.*(image|vision))/, /^grok/], fallbackModel: 'grok-4' },
  { prefix: 'gsk_', name: 'Groq', base: 'https://api.groq.com/openai/v1', prefer: [/gpt-oss-20b/, /llama-3\.3-70b/, /llama-4/, /llama/], fallbackModel: 'llama-3.3-70b-versatile' },
  { prefix: 'AIza', name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', prefer: [/gemini-.*-pro/, /gemini-.*-flash(?!.*lite)/, /gemini/], fallbackModel: 'gemini-2.5-flash' },
  { prefix: 'sk-', name: 'OpenAI', base: 'https://api.openai.com/v1', prefer: [/^gpt-5(?!.*(mini|nano))/, /^gpt-4\.1/, /^gpt-4o/], fallbackModel: 'gpt-4o' }
]

const key = config.AI_API_KEY?.trim()
const provider = key ? PROVIDERS.find((p) => key.startsWith(p.prefix)) ?? null : null

export const llmEnabled = () => provider !== null
export const llmProvider = () => provider?.name ?? null

const headers = () => ({ Authorization: `Bearer ${key}`, 'x-api-key': key ?? '', 'Content-Type': 'application/json', ...provider?.headers })

// The model is AI_MODEL if set, otherwise the best match among the models this key can use (asked once).
let modelPromise: Promise<string> | null = null
function model(): Promise<string> {
  if (config.AI_MODEL) return Promise.resolve(config.AI_MODEL)
  modelPromise ??= (async () => {
    const res = await fetch(`${provider!.base}/models`, { headers: headers(), signal: AbortSignal.timeout(10000) }).catch(() => null)
    if (!res?.ok) return provider!.fallbackModel
    const ids = ((await res.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? []
    const chat = ids.filter((id) => !/whisper|tts|guard|embed|image|vision|audio/i.test(id))
    for (const re of provider!.prefer) {
      const hit = chat.find((id) => re.test(id))
      if (hit) return hit
    }
    return chat[0] ?? provider!.fallbackModel
  })().catch((err: unknown) => { modelPromise = null; throw err })
  return modelPromise
}

/** Free tiers rate-limit (HTTP 429): wait as the provider asks (or 2 s, then 6 s) and try again. */
async function withRetry(call: () => Promise<Response>): Promise<Response> {
  for (const fallbackWait of [2000, 6000]) {
    const res = await call()
    if (res.status !== 429) return res
    const asked = Number(res.headers.get('retry-after')) * 1000
    await new Promise((r) => setTimeout(r, Math.min(asked || fallbackWait, 15000)))
  }
  return call()
}

interface Opts { system: string; user: string; maxTokens: number }

async function completeText(opts: Opts): Promise<string> {
  if (!provider) throw new Error('AI not configured')
  const name = await model()
  // Reasoning models spend tokens thinking before they answer: keep the thinking short and budget for it.
  const reasoning = /gpt-oss|^o\d|gpt-5|reason|thinking/i.test(name)
  const res = await withRetry(() => fetch(`${provider.base}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: name,
      max_tokens: reasoning ? opts.maxTokens + 2048 : opts.maxTokens,
      ...(reasoning ? { reasoning_effort: 'low' } : { temperature: 0 }),
      messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }]
    }),
    signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS)
  }))
  if (!res.ok) throw new Error(`AI HTTP ${res.status}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return body.choices?.[0]?.message?.content ?? ''
}

/** One-shot completion that must return a JSON object. Throws on any failure so callers can fall back. */
export async function completeJson<T>(opts: Opts): Promise<T> {
  const text = await completeText(opts)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('AI returned no JSON')
  return JSON.parse(text.slice(start, end + 1)) as T
}
