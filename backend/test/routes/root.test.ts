import { test } from 'node:test'
import * as assert from 'node:assert'
import { build } from '../helper'

test('health route', async (t) => {
  const app = await build(t)

  const res = await app.inject({ url: '/health' })
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.payload).status, 'ok')
})

test('sets security headers', async (t) => {
  const app = await build(t)

  const res = await app.inject({ url: '/health' })
  assert.equal(res.headers['x-content-type-options'], 'nosniff')
})

test('rejects an invalid question', async (t) => {
  const app = await build(t)

  const res = await app.inject({ method: 'POST', url: '/api/ask', payload: { question: '' } })
  assert.equal(res.statusCode, 400)
})

test('returns 404 for an unknown document', async (t) => {
  const app = await build(t)

  const res = await app.inject({ url: '/api/documents/does-not-exist' })
  assert.equal(res.statusCode, 404)
})

test('lists the 41 official sources', async (t) => {
  const app = await build(t)

  const res = await app.inject({ url: '/api/sources' })
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.payload).sources.length, 41)
})

test('filters documents by domain and never returns quarantined pages', async (t) => {
  const app = await build(t)

  const res = await app.inject({ url: '/api/documents?category=educatie&pageSize=50' })
  const body = JSON.parse(res.payload)
  assert.equal(res.statusCode, 200)
  assert.ok(body.items.every((d: { category: string; integrity: string }) => d.category === 'educatie' && d.integrity === 'ok'))
})

test('a petition reaches the staff inbox and the reply reaches the resident', async (t) => {
  const app = await build(t)

  const sent = await app.inject({ method: 'POST', url: '/api/petitions', payload: { question: 'Cine repară liftul?', message: 'Liftul din blocul nostru nu funcționează de o săptămână.', sourceId: 'liftservice' } })
  assert.equal(sent.statusCode, 201)
  const { id, ticket } = JSON.parse(sent.payload)
  assert.match(ticket, /^P-\d{6}$/)

  const inbox = JSON.parse((await app.inject({ url: '/api/petitions/inbox' })).payload)
  assert.equal(inbox[0].id, id)
  assert.equal(inbox[0].status, 'new')

  await app.inject({ method: 'POST', url: `/api/petitions/${id}/update`, payload: { status: 'answered', reply: 'Echipa a fost trimisă.' } })
  const [mine] = JSON.parse((await app.inject({ url: `/api/petitions/status?ids=${id}` })).payload)
  assert.equal(mine.status, 'answered')
  assert.equal(mine.reply, 'Echipa a fost trimisă.')
  assert.equal(mine.message, undefined) // the status call never echoes the petition text
})
