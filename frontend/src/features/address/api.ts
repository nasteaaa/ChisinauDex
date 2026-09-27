import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface Meta { ok: boolean; fetchedAt: string; sourceUrl: string; error?: string }

export interface Live {
  address: { query: string; found: boolean; label: string; lat: number | null; lng: number | null; district: string | null; street: string | null; error?: string }
  water: Meta & {
    situationAt?: string | null
    items?: { type: 'current' | 'planned' | 'leak' | 'sewer'; sector: string; ticket: string; address: string; affectedStreets: string | null; description: string | null; from: string | null; to: string | null; tankerLocation: string | null }[]
    sectorCounts?: Record<string, number> | null
  }
  buses: Meta & {
    stops?: { id: string; name: string; distanceM: number; routes: string[] }[]
    vehicles?: { route: string; label: string; distanceM: number; stopId: string | null; approaching: boolean | null; stopsAway: number | null; speedKmh: number }[]
  }
  doctor: Meta & { items?: { docId: string; title: string; url: string; publisher: string; date?: string; line: string }[] }
}

export function useLive(address: string | null) {
  return useQuery({
    queryKey: ['live', address],
    queryFn: () => api<Live>(`/api/live?address=${encodeURIComponent(address!)}`),
    enabled: !!address,
    refetchInterval: 60_000,
    staleTime: 30_000
  })
}

export type LocateError = 'unsupported' | 'denied' | 'outside' | 'notFound'

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'))
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('denied')), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 })
  })
}

/** Browser location → street address. Runs only on an explicit click; the coordinates are not stored. */
export function useLocate() {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const pos = await position()
      const body = JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      const r = await api<{ address: string | null }>('/api/live/reverse', { method: 'POST', body }).catch(() => { throw new Error('outside') })
      if (!r.address) throw new Error('notFound')
      return r.address
    }
  })
}
