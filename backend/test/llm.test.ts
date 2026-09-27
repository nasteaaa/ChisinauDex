import { test } from 'node:test'
import * as assert from 'node:assert'

// Simulated Groq API: no network, no tokens. Set before the module reads its config.
process.env.AI_API_KEY = 'gsk_test'
process.env.AI_MODELS = 'big,small,other'
const { completeJson } = require('../src/assistant/llm') as typeof import('../src/assistant/llm')

type Reply = { status: number; message?: string }
function fakeApi(replies: Record<string, Reply[]>) {
  const calls: string[] = []
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const model = JSON.parse(init.body).model as string
    calls.push(model)
    const r = replies[model]?.shift() ?? { status: 200 }
    if (r.status === 200) return new Response(JSON.stringify({ choices: [{ message: { content: `{"model":"${model}"}` } }] }))
    return new Response(JSON.stringify({ error: { message: r.message } }), { status: r.status })
  }) as typeof fetch
  return calls
}

const opts = { system: 's', user: 'u', maxTokens: 10 }
const perDay = 'Rate limit reached on tokens per day (TPD): Limit 200000. Please try again in 30m0s.'
const perMinute = 'Rate limit reached on tokens per minute (TPM): Limit 8000. Please try again in 0.1s.'

test('a model at its per-minute limit hands over to the next one at once', async () => {
  const calls = fakeApi({ big: [{ status: 429, message: perMinute }] })
  assert.deepEqual(await completeJson(opts), { model: 'small' })
  assert.deepEqual(calls, ['big', 'small'])
})

test('a model at its daily limit is skipped until its reset', async () => {
  let calls = fakeApi({ big: [{ status: 429, message: perDay }] })
  assert.deepEqual(await completeJson(opts), { model: 'small' })
  assert.deepEqual(calls, ['big', 'small'])
  calls = fakeApi({})
  assert.deepEqual(await completeJson(opts), { model: 'small' }) // "big" is not even tried now
  assert.deepEqual(calls, ['small'])
})

test('when every model is busy for the minute, it waits once and retries', async () => {
  const busy = { status: 429, message: perMinute }
  const calls = fakeApi({ small: [busy], other: [busy] })
  assert.deepEqual(await completeJson(opts), { model: 'small' })
  assert.deepEqual(calls, ['small', 'other', 'small'])
})

test('other errors are not retried on another model', async () => {
  fakeApi({ small: [{ status: 401, message: 'Invalid API key' }] })
  await assert.rejects(completeJson(opts), /AI HTTP 401/)
})
