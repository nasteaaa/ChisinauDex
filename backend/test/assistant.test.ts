import { test } from 'node:test'
import * as assert from 'node:assert'
import { locate, newerSide } from '../src/assistant/ask'
import { bridgeToRomanian, containsQuote, tokens } from '../src/corpus/text'

const passage = 'Cererea de înscriere se depune online, pe platforma egradinita.md, de către unul dintre părinți.'

test('accepts a verbatim quote regardless of diacritics, case and spacing', () => {
  assert.ok(containsQuote(passage, 'cererea de inscriere se depune   ONLINE'))
  assert.ok(containsQuote(passage, 'Cererea de înscriere se depune online.'))
})

test('rejects a paraphrased or invented quote', () => {
  assert.ok(!containsQuote(passage, 'Cererea se depune la ghișeu'))
  assert.ok(!containsQuote(passage, 'online')) // too short to count as evidence
})

test('locates the quote in the original text for highlighting', () => {
  const [start, end] = locate(passage, 'se depune online')
  assert.equal(passage.slice(start, end), 'se depune online')
  assert.deepEqual(locate(passage, 'nu există'), [-1, -1])
})

test('bridges Russian questions to Romanian search terms', () => {
  assert.match(bridgeToRomanian('Как записать ребёнка в детский сад?'), /gradinita/)
  assert.deepEqual(tokens('Grădinițele și grădinița'), tokens('gradinitele si gradinita'))
})

test('in a contradiction, points to the newer document, then to the higher authority', () => {
  assert.deepEqual(newerSide([{ n: 1, date: '2023-10-26', authority: 1 }, { n: 2, date: '2025-09-18', authority: 3 }]), { n: 2, reason: 'date' })
  assert.deepEqual(newerSide([{ n: 1, date: undefined, authority: 3 }, { n: 2, date: undefined, authority: 1 }]), { n: 2, reason: 'authority' })
  assert.equal(newerSide([{ n: 1, date: '2025-01-01', authority: 2 }, { n: 2, date: '2025-01-01', authority: 2 }]), undefined)
})
