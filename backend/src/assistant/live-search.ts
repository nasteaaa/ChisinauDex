import { createHash } from 'node:crypto'
import * as cheerio from 'cheerio'
import { SOURCES } from '../corpus/sources'
import { store } from '../corpus/store'
import { fold } from '../corpus/text'
import type { Category, Doc } from '../corpus/types'

// Fallback path: when the LLM is unavailable we still go to the official sites
// and search them live (WordPress REST search), so answers can include content
// newer than the last crawl.

const UA = 'ChisinauDexBot/1.0 (+Chisinau City Hall assistant prototype, GigaHack 2026)'
const SPAM = /\b(casino|cazino|slot|poker|betting|bet365|jackpot|viagra|loan|prêts?|crypto|bitcoin|forex|escort)\b/i

export function looksLikeSpam(title: string, text: string): boolean {
  return SPAM.test(`${title} ${text.slice(0, 2000)}`)
}

export function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  $('script,style,noscript').remove()
  $('p,div,li,h1,h2,h3,h4,h5,h6,tr,br,section,article').each((_, el) => { $(el).append('\n\n') })
  return $.root().text().replace(/[ \t ]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim()
}

interface WpPost {
  link: string
  date?: string
  modified?: string
  title?: { rendered?: string }
  content?: { rendered?: string }
}

async function searchSite(sourceId: string, query: string, timeoutMs: number): Promise<Doc[]> {
  const src = SOURCES.find((s) => s.id === sourceId)!
  const origin = new URL(src.url).origin
  const url = `${origin}/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=3&_fields=link,date,modified,title,content`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) return []
  const posts = (await res.json()) as WpPost[]
  if (!Array.isArray(posts)) return []
  return posts.map((p) => {
    const title = htmlToText(p.title?.rendered ?? '')
    const text = htmlToText(p.content?.rendered ?? '').slice(0, 20000)
    const spam = looksLikeSpam(title, text)
    return {
      id: 'live-' + createHash('sha1').update(p.link).digest('hex').slice(0, 10),
      sourceId,
      url: p.link,
      title,
      type: 'post',
      lang: /[а-яё]/i.test(text) && !/[ășțâî]/i.test(text) ? 'ru' : 'ro',
      publishedAt: p.date ? new Date(p.date).toISOString() : undefined,
      updatedAt: p.modified ? new Date(p.modified).toISOString() : undefined,
      text,
      files: [],
      integrity: spam ? 'quarantined' : 'ok',
      integrityReason: spam ? 'spam keywords' : undefined
    } satisfies Doc
  }).filter((d) => d.text.length > 80)
}

/** The official sources that expose a WordPress search API (optionally only one category). */
export const liveSites = (category?: Category) => SOURCES.filter((s) => store.healthOf(s.id)?.wp && (!category || s.category === category))

/** Live-searches those sites, so answers can include content newer than the last crawl. */
export async function liveSearch(query: string, category?: Category, timeoutMs = 4500): Promise<Doc[]> {
  const wp = liveSites(category)
  const results = await Promise.allSettled(wp.map((s) => searchSite(s.id, query, timeoutMs)))
  const seen = new Set(store.corpus.docs.map((d) => fold(d.url)))
  const out: Doc[] = []
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const d of r.value) {
      if (d.integrity === 'quarantined' || seen.has(fold(d.url))) continue
      seen.add(fold(d.url))
      out.push(d)
    }
  }
  return out
}
