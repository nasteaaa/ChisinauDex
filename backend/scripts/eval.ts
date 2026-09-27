// Accuracy check of the answer pipeline on a fixed question set (eval/questions.json):
// citation accuracy, refusal rate, contradiction detection, routing and answer language.
//   pnpm --filter backend eval            (add --judge to also let the model check that each quote supports its sentence)
// Runs the real pipeline in-process, without the answer cache and without writing usage logs.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ask, type Answer } from '../src/assistant/ask'
import { completeJson, llmEnabled } from '../src/assistant/llm'
import { config } from '../src/config'
import { store } from '../src/corpus/store'
import { containsQuote } from '../src/corpus/text'
import { loadVectorStatus, syncVectors } from '../src/corpus/vectors'
import { closeDb } from '../src/db'
import { runtime } from '../src/store/runtime'

type Expect = 'answer' | 'gap' | 'conflict'
interface Question { id: string; set?: 'research'; lang: 'ro' | 'ru'; expect: Expect; question: string; sources?: string[]; route?: string }
interface Result {
  q: Question; status: Answer['status']; mode: Answer['mode']; lang: string; route: string; latencyMs: number
  quotes: number; verbatim: number; rightSource: boolean | null; supported?: number; judged?: number
}

const dir = join(__dirname, '..', 'eval')
const { questions } = JSON.parse(readFileSync(join(dir, 'questions.json'), 'utf8')) as { questions: Question[] }
const judge = process.argv.includes('--judge') && llmEnabled()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Cited sources: those referenced by a sentence, a step or a side of the contradiction. */
const citedOf = (a: Answer) => a.sources.filter((s) => [...a.sentences, ...a.steps].some((x) => x.cites.includes(s.n)) || a.conflict?.sides.some((c) => c.n === s.n))

async function supportCheck(a: Answer): Promise<{ supported: number; judged: number }> {
  const pairs = [...a.sentences, ...a.steps].flatMap((x) => x.cites.map((n) => ({ claim: x.text, quote: a.sources[n - 1]?.quote ?? '' })))
  if (!pairs.length) return { supported: 0, judged: 0 }
  const list = pairs.map((p, i) => `${i + 1}. CLAIM: ${p.claim}\n   QUOTE: ${p.quote}`).join('\n')
  const r = await completeJson<{ supported: boolean[] }>({
    system: 'You check citations. Answer only with JSON.',
    user: `For each numbered pair, does the QUOTE (from an official document) support the CLAIM? Claims may be in another language than the quote.\nReturn {"supported":[true|false,...]} in the same order.\n\n${list}`,
    maxTokens: 400
  })
  const s = (r.supported ?? []).slice(0, pairs.length)
  return { supported: s.filter(Boolean).length, judged: s.length }
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—')

;(async () => {
  store.load()
  await runtime.load()
  if (config.DATABASE_URL) await loadVectorStatus()
  else await syncVectors(() => {})

  let results: Result[] = []
  for (const q of questions) {
    const a = await ask({ question: q.question, lang: q.lang, role: 'citizen', evaluation: true })
    const cited = a.status === 'gap' ? [] : citedOf(a)
    // Independent re-check against the full document text (the pipeline checked against the chunk).
    const verbatim = cited.filter((s) => containsQuote(store.docById.get(s.docId)?.text ?? s.passage, s.quote)).length
    const r: Result = {
      q, status: a.status, mode: a.mode, lang: a.lang, route: a.route.sourceId, latencyMs: a.latencyMs,
      quotes: cited.length, verbatim, rightSource: q.sources && cited.length ? cited.some((s) => q.sources!.includes(s.sourceId)) : null
    }
    if (judge && a.status !== 'gap') {
      try { Object.assign(r, await supportCheck(a)) } catch (e) { console.warn(`judge failed for ${q.id}: ${(e as Error).message}`) }
    }
    results.push(r)
    console.log(`${q.id}  expect ${q.expect.padEnd(8)} got ${a.status.padEnd(8)} ${a.mode.padEnd(8)} ${a.latencyMs} ms  ${q.question}`)
    await sleep(20_000) // Groq free tier: 8k tokens/minute, one answer uses ~3-4k
  }

  // Headline metrics use the core set (10 RO + 10 RU); the team's research questions are reported separately.
  const all = results
  const research = all.filter((r) => r.q.set === 'research')
  results = all.filter((r) => r.q.set !== 'research')
  const by = (e: Expect) => results.filter((r) => r.q.expect === e)
  const answered = results.filter((r) => r.status !== 'gap')
  const withSources = results.filter((r) => r.rightSource !== null)
  const routed = results.filter((r) => r.q.route)
  const quotes = answered.reduce((n, r) => n + r.quotes, 0)
  const verbatim = answered.reduce((n, r) => n + r.verbatim, 0)
  const judged = results.reduce((n, r) => n + (r.judged ?? 0), 0)
  const supported = results.reduce((n, r) => n + (r.supported ?? 0), 0)
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b)
  const correct = (r: Result) => (r.q.expect === 'answer' ? r.status === 'ok' || r.status === 'partial' : r.status === r.q.expect)

  const metrics: [string, string, string][] = [
    ['Correct outcome', pct(results.filter(correct).length, results.length), 'status matches the expectation (answer / refusal / contradiction)'],
    ['Citation accuracy (verbatim)', pct(verbatim, quotes), `${verbatim}/${quotes} cited quotes found word for word in their document`],
    ['Citation relevance', pct(withSources.filter((r) => r.rightSource).length, withSources.length), 'answers citing at least one document of the right institution'],
    ...(judged ? [['Quote supports claim (model judge)', pct(supported, judged), `${supported}/${judged} sentence–quote pairs`] as [string, string, string]] : []),
    ['Correct refusal rate', pct(by('gap').filter((r) => r.status === 'gap').length, by('gap').length), 'unanswerable questions answered with "not found"'],
    ['False refusal rate', pct(results.filter((r) => r.q.expect !== 'gap' && r.status === 'gap').length, results.filter((r) => r.q.expect !== 'gap').length), 'answerable questions wrongly refused (lower is better)'],
    ['Contradiction detection', pct(by('conflict').filter((r) => r.status === 'conflict').length, by('conflict').length), 'questions about a real contradiction that show it'],
    ['False contradictions', pct(by('answer').filter((r) => r.status === 'conflict').length, by('answer').length), 'plain questions wrongly flagged (lower is better)'],
    ['Routing accuracy', pct(routed.filter((r) => r.route === r.q.route).length, routed.length), 'responsible institution as expected'],
    ['Answer language', pct(results.filter((r) => r.lang === r.q.lang).length, results.length), 'answer in the language of the question'],
    ['AI mode', pct(results.filter((r) => r.mode === 'ai').length, results.length), 'the rest used the no-AI fallback (rate limits, errors)'],
    ['Median latency', `${latencies[Math.floor(latencies.length / 2)]} ms`, 'without cache']
  ]

  const table = (rows: string[][]) => rows.map((r) => `| ${r.join(' | ')} |`).join('\n')
  const report = `# ChisinauDex evaluation

Run ${new Date().toISOString()} on ${store.corpus.docs.length} documents (corpus ${store.corpus.builtAt.slice(0, 10)}), ${results.length} questions (${results.filter((r) => r.q.lang === 'ro').length} RO, ${results.filter((r) => r.q.lang === 'ru').length} RU: ${by('answer').length} answerable, ${by('gap').length} without an answer, ${by('conflict').length} about real contradictions).

${table([['Metric', 'Value', 'What it measures'], ['---', '---', '---'], ...metrics])}

## Per question

${perQuestion(results)}
${research.length ? `\n## Research questions (team's manual tests)\n\n${perQuestion(research)}\n\nCorrect: ${research.filter(correct).length}/${research.length}\n` : ''}`
  function perQuestion(rows: Result[]) {
    return table([
      ['id', 'question', 'expected', 'got', 'mode', 'quotes (verbatim)', 'right source', 'route', 'ms'],
      ['---', '---', '---', '---', '---', '---', '---', '---', '---'],
      ...rows.map((r) => [r.q.id, r.q.question, r.q.expect, `${correct(r) ? '✓' : '✗'} ${r.status}`, r.mode, r.quotes ? `${r.quotes} (${r.verbatim})` : '—', r.rightSource === null ? '—' : r.rightSource ? '✓' : '✗', r.q.route ? `${r.route === r.q.route ? '✓' : '✗'} ${r.route}` : r.route, String(r.latencyMs)])
    ])
  }
  writeFileSync(join(dir, 'report.md'), report)
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ at: new Date().toISOString(), metrics: Object.fromEntries(metrics.map(([k, v]) => [k, v])), results: all }, null, 2))
  console.log('\n' + metrics.map(([k, v]) => `${k.padEnd(36)} ${v}`).join('\n') + `\n\nReport: eval/report.md`)
  await closeDb()
})()
