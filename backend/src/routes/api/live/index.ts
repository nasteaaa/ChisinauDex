import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { getLiveForAddress } from '../../../live'
import { reverseGeocode } from '../../../live/geocode'

const District = z.enum(['centru', 'botanica', 'buiucani', 'ciocana', 'riscani'])

// Every section carries its source and fetch time; data fields are absent when ok=false.
const meta = {
  ok: z.boolean(),
  fetchedAt: z.string(),
  sourceUrl: z.string(),
  error: z.string().optional()
}

const WaterItemType = z.enum(['current', 'planned', 'leak', 'sewer'])

const Water = z.object({
  ...meta,
  date: z.string().nullable().optional(),
  situationAt: z.string().nullable().optional(),
  items: z.array(z.object({
    type: WaterItemType,
    sector: z.string(),
    ticket: z.string(),
    address: z.string(),
    affectedStreets: z.string().nullable(),
    description: z.string().nullable(),
    from: z.string().nullable(),
    to: z.string().nullable(),
    tankerLocation: z.string().nullable(),
    matchedOn: z.enum(['address', 'affected'])
  })).optional(),
  sectorCounts: z.record(WaterItemType, z.number()).nullable().optional()
})

const Doctor = z.object({
  ...meta,
  items: z.array(z.object({ docId: z.string(), title: z.string(), url: z.string(), publisher: z.string(), date: z.string().optional(), line: z.string() })).optional()
})

const Buses = z.object({
  ...meta,
  mode: z.enum(['stops', 'nearby-vehicles']).optional(),
  stops: z.array(z.object({
    id: z.string(),
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
    distanceM: z.number(),
    routes: z.array(z.string())
  })).optional(),
  vehicles: z.array(z.object({
    route: z.string(),
    direction: z.union([z.literal(0), z.literal(1)]),
    label: z.string(),
    lat: z.number(),
    lng: z.number(),
    speedKmh: z.number(),
    timestamp: z.string(),
    distanceM: z.number(),
    stopId: z.string().nullable(),
    approaching: z.boolean().nullable(),
    stopsAway: z.number().nullable()
  })).optional(),
  routesChecked: z.number().optional(),
  routesFailed: z.array(z.string()).optional()
})

const LiveResponse = z.object({
  address: z.object({
    query: z.string(),
    found: z.boolean(),
    label: z.string(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    district: District.nullable(),
    street: z.string().nullable(),
    sourceUrl: z.string(),
    error: z.string().optional()
  }),
  water: Water,
  buses: Buses,
  doctor: Doctor
})

// Live info for one address: water outages (acc.md), buses (autourban.md), family doctor (clinic lists).
const liveRoutes: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  // logLevel 'warn': request logs would otherwise contain the user's address.
  fastify.get('/', {
    logLevel: 'warn',
    schema: {
      querystring: z.object({
        address: z.string().trim().min(3).max(200),
        // Water outages for another day, as acc.md supports it.
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      }),
      response: { 200: LiveResponse }
    }
  }, async function (request) {
    return getLiveForAddress(request.query.address, { date: request.query.date })
  })

  // "Use my location": POST so the coordinates never appear in URLs or access logs. Nothing is stored.
  fastify.post('/reverse', {
    logLevel: 'warn',
    schema: {
      body: z.object({ lat: z.number().min(46.8).max(47.2), lng: z.number().min(28.5).max(29.2) }),
      response: { 200: z.object({ address: z.string().nullable(), district: District.nullable() }) }
    }
  }, async function (request) {
    const r = await reverseGeocode(request.body.lat, request.body.lng)
    return { address: r?.address ?? null, district: r?.district ?? null }
  })
}

export default liveRoutes
