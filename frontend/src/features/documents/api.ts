import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Category } from '@/features/assistant/api'

export type DocType = 'post' | 'page' | 'pdf' | 'html' | 'event'

export interface DocItem {
  id: string
  title: string
  excerpt: string
  url: string
  type: DocType
  lang: string
  sourceId: string
  sourceName: string
  publisher: string
  category: Category
  authority: number
  publishedAt?: string
  updatedAt?: string
  integrity: 'ok' | 'quarantined'
  integrityReason?: string
}

export interface DocList {
  total: number
  page: number
  pageSize: number
  items: DocItem[]
  facets: { sources: { id: string; count: number }[]; categories: { id: string; count: number }[]; types: { id: string; count: number }[] }
}

export interface DocDetail extends DocItem {
  text: string
  summary: string
  files: { url: string; name: string }[]
  views: number
  sourceUrl: string
  contactUrl?: string
  related: DocItem[]
}

export interface SourceInfo {
  id: string
  url: string
  name: string
  publisher: string
  category: Category
  authority: number
  district?: string
  ok: boolean | null
  blocked: boolean
  tls: string | null
  docCount: number
  quarantined: number
  latestContentAt?: string
  contactUrl?: string
}

export function useDocuments(params: Record<string, string>) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
  return useQuery({
    queryKey: ['documents', qs],
    queryFn: () => api<DocList>(`/api/documents?${qs}`),
    placeholderData: keepPreviousData
  })
}

export function useDocument(id: string) {
  return useQuery({ queryKey: ['document', id], queryFn: () => api<DocDetail>(`/api/documents/${id}`) })
}

export function useCountView() {
  return useMutation({ mutationFn: (id: string) => api<{ views: number }>(`/api/documents/${id}/view`, { method: 'POST', body: '{}' }) })
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: () => api<{ corpusBuiltAt: string; healthCheckedAt: string; aiEnabled: boolean; sources: SourceInfo[] }>('/api/sources'),
    staleTime: 5 * 60_000
  })
}
