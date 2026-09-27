import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { api } from './api'

// Petitions sent from this browser. The text itself lives on the server (staff answer it in the
// dashboard); the browser only remembers the private id, so it can show the status and the reply.

export interface SentPetition {
  id: string
  ticket: string
  question: string
  institution: string
  contactUrl: string
  sentAt: string
}

export interface PetitionStatus {
  id: string
  ticket: string
  status: 'new' | 'in_progress' | 'answered'
  reply?: string
  repliedAt?: string
}

export const ANSWER_DAYS = 30
const KEY = 'chisinaudex.petitions.v2'
const listeners = new Set<() => void>()

function read(): SentPetition[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SentPetition[] } catch { return [] }
}

let state = read()

function write(next: SentPetition[]) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage unavailable: keep in memory */ }
  listeners.forEach((l) => l())
}

export async function sendPetition(p: { question: string; message: string; sourceId: string; institution: string; contactUrl: string }) {
  const r = await api<{ id: string; ticket: string }>('/api/petitions', {
    method: 'POST',
    body: JSON.stringify({ question: p.question, message: p.message, sourceId: p.sourceId })
  })
  write([{ id: r.id, ticket: r.ticket, question: p.question, institution: p.institution, contactUrl: p.contactUrl, sentAt: new Date().toISOString() }, ...state])
  return r
}

export const forgetPetition = (id: string) => write(state.filter((p) => p.id !== id))

export function useSentPetitions(): SentPetition[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)
}

export function usePetitionStatuses(ids: string[]) {
  return useQuery({
    queryKey: ['petitions', ids.join(',')],
    queryFn: () => api<PetitionStatus[]>(`/api/petitions/status?ids=${ids.join(',')}`),
    enabled: ids.length > 0,
    refetchInterval: 60_000
  })
}

export function daysLeft(sentAt: string, now = Date.now()): number {
  return Math.ceil((Date.parse(sentAt) + ANSWER_DAYS * 86400000 - now) / 86400000)
}
