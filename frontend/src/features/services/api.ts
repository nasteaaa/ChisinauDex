import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Category } from '@/features/assistant/api'

export interface ServiceField { value: string; quote: string }

export interface Service {
  docId: string
  title: string
  url: string
  sourceId: string
  institution: string
  category: Category
  term: ServiceField | null
  fee: ServiceField | null
  documents: string[]
  missing: ('term' | 'fee' | 'documents')[]
  contactUrl: string
}

export function useServices(q: string) {
  return useQuery({
    queryKey: ['services', q],
    queryFn: () => api<{ total: number; items: Service[] }>(`/api/services${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    staleTime: 5 * 60_000
  })
}
