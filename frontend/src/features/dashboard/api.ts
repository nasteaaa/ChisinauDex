import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface Side { docId: string; sourceId: string; title: string; url: string; publisher: string; date?: string; quote: string; value: string }

export interface DashboardData {
  stats: {
    docs: number
    passages: number
    sources: number
    sourcesUp: number
    quarantined: number
    questions7d: number
    questionsTotal: number
    answeredPct: number | null
    positivePct: number | null
    ratings: number
    avgLatencyMs: number | null
    visits7d: number
    aiPct: number | null
    corpusBuiltAt: string
    healthCheckedAt: string
  }
  conflicts: { id: string; topic: string; origin: 'index' | 'answer'; detectedAt: string; asks: number; state: string; a: Side; b: Side }[]
  gaps: { id: string; question: string; asks: number; lastAsked: string; owner: string; ownerSourceId: string; state: string }[]
  faq: { question: string; count: number }[]
  pages: { id: string; type: 'down' | 'blocked' | 'tls' | 'stale' | 'broken' | 'hacked'; sourceId: string; sourceName: string; url: string; note: string; state: string }[]
  daily: {
    questions: number[]; questionsPrev: number
    answered: number[]; answeredPrev: number
    ratings: number[]; ratingsPrev: number
    visits: number[]; visitsPrev: number
  }
  services: { total: number; incomplete: { docId: string; title: string; url: string; sourceId: string; institution: string; missing: string[] }[] }
  activity: { at: string; kind: string; id: string; state: string }[]
  ratings: { question: string; stars: number; tags: string[]; comment?: string; at: string; sourceId?: string }[]
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardData>('/api/dashboard'), refetchInterval: 30_000 })
}

export function useDashboardAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { kind: 'conflict' | 'gap' | 'page'; id: string; state: string }) =>
      api<{ ok: boolean }>('/api/dashboard/action', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] })
  })
}

export interface RouteResult {
  route: { sourceId: string; name: string; publisher: string; contactUrl: string; siteUrl: string } | null
  basedOn: { docId: string; title: string } | null
}

/** Staff "internal assistant": situation text (or a manually picked domain) → responsible institution. */
export function useRoute(q: string, category: string) {
  const qs = new URLSearchParams({ q, ...(category ? { category } : {}) })
  return useQuery({ queryKey: ['route', q, category], queryFn: () => api<RouteResult>(`/api/route?${qs}`), enabled: q.length >= 3 || !!category })
}

export interface InboxPetition {
  id: string
  ticket: string
  at: string
  question: string
  message: string
  sourceId: string
  institution: string
  status: 'new' | 'in_progress' | 'answered'
  reply?: string
  repliedAt?: string
}

export function usePetitionInbox() {
  return useQuery({ queryKey: ['petition-inbox'], queryFn: () => api<InboxPetition[]>('/api/petitions/inbox'), refetchInterval: 30_000 })
}

export function useUpdatePetition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: 'in_progress' | 'answered'; reply?: string }) =>
      api<InboxPetition>(`/api/petitions/${id}/update`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['petition-inbox'] })
  })
}

export function useOpenPetitions(dept: string) {
  const inbox = usePetitionInbox()
  return (inbox.data ?? []).filter((p) => (!dept || p.sourceId === dept) && p.status !== 'answered').length
}
