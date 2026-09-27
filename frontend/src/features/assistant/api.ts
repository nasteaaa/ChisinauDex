import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError, BASE_URL } from '@/lib/api'

export const CATEGORIES = ['primaria', 'educatie', 'locuinta', 'munca', 'sanatate', 'transport', 'urbanism'] as const
export type Category = (typeof CATEGORIES)[number]
export type Status = 'ok' | 'partial' | 'gap' | 'conflict'

export interface AnswerSource {
  n: number
  passageId: string
  docId: string
  title: string
  url: string
  sourceId: string
  sourceName: string
  publisher: string
  authority: number
  date?: string
  type: string
  passage: string
  quote: string
  start: number
  end: number
  translation?: string
  live: boolean
  relevance: number
}

export interface Answer {
  id: string
  question: string
  lang: 'ro' | 'ru' | 'en'
  mode: 'ai' | 'fallback'
  status: Status
  sentences: { text: string; cites: number[] }[]
  steps: { text: string; cites: number[] }[]
  sources: AnswerSource[]
  conflict?: { topic: string; sides: { n: number; value: string }[]; newer?: { n: number; reason: 'date' | 'authority' } }
  missing?: string
  route: { sourceId: string; name: string; publisher: string; contactUrl: string; siteUrl: string }
  alsoRoute: Answer['route'][]
  correctedFrom?: string
  romanianOnly: boolean
  searched: { passages: number; docs: number; live: number; quarantinedSkipped: number }
  excluded: { docId: string; title: string; publisher: string; date?: string }[]
  related: string[]
  relevance: number
  service?: import('@/features/services/api').Service
  latencyMs: number
}

export interface AskInput {
  question: string
  lang: string
  role: 'citizen' | 'employee'
  category?: Category
  district?: string
  publishedFrom?: string
  publishedTo?: string
  exact?: boolean
}

export type Progress =
  | { step: 'expand' }
  | { step: 'search'; docs: number; passages: number }
  | { step: 'found'; passages: number; docs: number }
  | { step: 'live'; sites: number }
  | { step: 'liveDone'; found: number }
  | { step: 'compose'; mode: 'ai' | 'fallback' }
  | { step: 'verify'; kept: number; dropped: number }

/** POST /api/ask/stream: reads NDJSON lines, reporting each real pipeline stage until the answer arrives. */
export async function askStream(input: AskInput, onProgress: (p: Progress) => void): Promise<Answer> {
  const res = await fetch(`${BASE_URL}/api/ask/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  if (!res.ok || !res.body) throw new ApiError(res.status, res.statusText)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, nl)) as { type: string; answer?: Answer } & Progress
      buf = buf.slice(nl + 1)
      if (msg.type === 'progress') onProgress(msg)
      else if (msg.type === 'answer' && msg.answer) return msg.answer
      else if (msg.type === 'error') throw new ApiError(500, 'answer failed')
    }
  }
  throw new ApiError(500, 'stream ended without an answer')
}

export function useAsk() {
  const [progress, setProgress] = useState<Progress[]>([])
  const mutation = useMutation({
    mutationFn: (input: AskInput) => {
      setProgress([])
      return askStream(input, (p) => setProgress((ps) => [...ps, p]))
    }
  })
  return { ...mutation, progress }
}

export function useSendFeedback() {
  return useMutation({
    mutationFn: (body: { answerId: string; stars: number; tags: string[]; comment?: string }) =>
      api<{ ok: boolean }>('/api/feedback', { method: 'POST', body: JSON.stringify(body) })
  })
}

export interface Suggestions {
  questions: { text: string; count: number }[]
  documents: { id: string; title: string; sourceId: string }[]
}

export function useSuggest(q: string) {
  return useQuery({
    queryKey: ['suggest', q],
    queryFn: () => api<Suggestions>(`/api/suggest?q=${encodeURIComponent(q)}`),
    staleTime: 30_000
  })
}

export interface Examples {
  questions: { text: string; category: Category; lang: 'ro' | 'ru'; origin: 'popular' | 'corpus'; docId?: string; count?: number }[]
  tiles: { key: string; docCount: number; question: string | null; docId: string | null }[]
}

export function useExamples(lang: string, category: Category | null) {
  const qs = new URLSearchParams({ lang, ...(category ? { category } : {}) })
  return useQuery({ queryKey: ['examples', lang, category], queryFn: () => api<Examples>(`/api/examples?${qs}`), staleTime: 60_000 })
}
