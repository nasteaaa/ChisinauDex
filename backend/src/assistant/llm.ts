import { config } from '../config'

// The model API: Groq (OpenAI-compatible chat completions), key in AI_API_KEY.
// AI_MODELS is an ordered list: each model has its own free-tier quota, so when one is rate-limited
// the next one answers. Without a key the assistant runs its no-AI fallback.

const key = config.AI_API_KEY?.trim()
const models = config.AI_MODELS.split(',').map((m) => m.trim()).filter(Boolean)

export const llmEnabled = () => !!key

/** Model -> time until which its daily quota is used up. */
const exhausted = new Map<string, number>()

/** "Please try again in 4m24.8s" -> milliseconds (0 when the message gives no time). */
function retryIn(message: string): number {
  const m = message.match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/)
  return m ? ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000 : 0
}

const isDailyLimit = (message: string) => /per day|\bTPD\b|\bRPD\b/i.test(message)

interface Opts { system: string; user: string; maxTokens: number }

function call(name: string, opts: Opts): Promise<Response> {
  // Reasoning models spend tokens thinking before they answer: keep the thinking short and budget for it.
  const reasoning = /gpt-oss|reason|thinking/i.test(name)
  return fetch(`${config.AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: name,
      // Groq counts the requested maximum against the per-minute token limit, so keep the reserve modest.
      max_tokens: reasoning ? opts.maxTokens + 1024 : opts.maxTokens,
      ...(reasoning ? { reasoning_effort: 'low' } : { temperature: 0 }),
      messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }]
    }),
    signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS)
  })
}

/**
 * Tries the models in order. A rate limit moves on to the next model at once: a daily limit also skips that
 * model until its reset, a per-minute one only for this call. If every model is busy for the minute, waits once
 * as the provider asks (at most 15 s) and tries the first of them again.
 */
async function completeText(opts: Opts): Promise<string> {
  if (!key) throw new Error('AI not configured')
  const available = models.filter((m) => (exhausted.get(m) ?? 0) < Date.now())
  if (!available.length) throw new Error('AI daily limits reached on every model')

  let busy: { name: string; waitMs: number } | undefined
  for (const name of available) {
    const res = await call(name, opts)
    if (res.ok) return read(res)
    // The provider's message says which limit was hit (tokens per minute or per day, request too large…).
    const message = (await res.text()).slice(0, 300)
    if (res.status !== 429) throw new Error(`AI HTTP ${res.status}: ${message}`)
    if (isDailyLimit(message)) {
      exhausted.set(name, Date.now() + (retryIn(message) || 15 * 60_000))
      console.warn(`AI model ${name}: daily limit reached, using the next model`)
    } else {
      busy ??= { name, waitMs: retryIn(message) || Number(res.headers.get('retry-after')) * 1000 || 2000 }
    }
  }
  if (!busy) throw new Error('AI daily limits reached on every model')
  await new Promise((r) => setTimeout(r, Math.min(busy.waitMs, 15_000)))
  const res = await call(busy.name, opts)
  if (!res.ok) throw new Error(`AI HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return read(res)
}

async function read(res: Response): Promise<string> {
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return body.choices?.[0]?.message?.content ?? ''
}

/** One-shot completion that must return a JSON object. Throws on any failure so callers can fall back. */
export async function completeJson<T>(opts: Opts): Promise<T> {
  // Models occasionally return truncated or malformed JSON; one more attempt usually succeeds.
  for (let attempt = 1; ; attempt++) {
    const text = await completeText(opts)
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    try {
      if (start < 0 || end < start) throw new Error('AI returned no JSON')
      return JSON.parse(text.slice(start, end + 1)) as T
    } catch (e) {
      if (attempt >= 2) throw e
    }
  }
}
