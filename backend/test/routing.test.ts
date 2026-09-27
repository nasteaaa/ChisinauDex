import { test } from 'node:test'
import * as assert from 'node:assert'
import { alsoRelevant, chooseInstitution } from '../src/assistant/route'
import { correctQuestion } from '../src/corpus/spell'
import { store } from '../src/corpus/store'

store.load()

test('fixes typos to words the documents use, and leaves correct text, names and Russian alone', () => {
  assert.equal(correctQuestion('medicul de famile'), 'medicul de familie')
  assert.equal(correctQuestion('Cum înscriu copilul la grădiniță?'), undefined)
  assert.equal(correctQuestion('ChisinauDex e ok?'), undefined)
  assert.equal(correctQuestion('Cum mă programez la audiență?'), undefined) // valid inflections stay
  assert.equal(correctQuestion('Ce acte trebuie pentru cafenele?'), undefined)
  assert.equal(correctQuestion('vreau sa scriu plangere'), undefined)
  assert.equal(correctQuestion('Как записать ребенка в школу?'), undefined)
})

test('suggests at most two more institutions, the resident\'s own district first', () => {
  const q = 'Cum înscriu copilul la grădiniță?'
  assert.equal(chooseInstitution(q)?.sourceId, 'egradinita')
  assert.deepEqual(alsoRelevant(q, 'egradinita', { district: 'botanica' }), ['dets-botanica'])
  assert.deepEqual(alsoRelevant(q, 'egradinita'), ['dgets'])
  assert.equal(chooseInstitution('vreau sa scriu plangere')?.sourceId, 'chisinau')
  assert.deepEqual(alsoRelevant('Nu am apă caldă de 3 zile', 'dglca'), []) // hot water is not Apă-Canal's
  for (const q of ['Cum obțin compensație pentru încălzire?', 'granturi pentru tineri']) {
    const main = chooseInstitution(q)!.sourceId
    assert.ok(alsoRelevant(q, main).length <= 2)
  }
})
