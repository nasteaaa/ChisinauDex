// Builds backend/data/{corpus,health,conflicts}.json from the official sources in src/corpus/sources.ts.
// Run: pnpm --filter backend crawl
// Only public pages are read. No logins, no forms, no private/PII endpoints.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import tls from 'node:tls'
import { completeJson, llmEnabled } from '../src/assistant/llm'
import * as cheerio from 'cheerio'
import { extractText, getDocumentProxy } from 'unpdf'
import { config } from '../src/config'
import { SOURCES } from '../src/corpus/sources'
import { containsQuote, fold } from '../src/corpus/text'
import type { BrokenLink, Conflict, Corpus, Doc, DocType, Health, Source, SourceHealth } from '../src/corpus/types'

const UA = 'ChisinauDexBot/0.1 (+GigaHack 2026 municipal assistant crawler; public pages only)'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const TIMEOUT_MS = 15_000
const WP_TIMEOUT_MS = 30_000
const PER_HOST = 4
const SOURCE_CONCURRENCY = 8
const WP_POSTS = 60
const WP_PAGES = 100
const HTML_PAGES = 25
const WP_HTML_FALLBACK = 40
const PDFS_PER_SOURCE = 12
const MAX_PDF_BYTES = 3 * 1024 * 1024
const LINK_CHECKS = 25
// Host throttling (shared hosting "resource limit reached"), caused by our own requests: not a broken link.
const THROTTLED = new Set([429, 508])
const MAX_TEXT = 20_000
const MIN_TEXT = 80

// Never touched: auth, forms, APIs, live data handled elsewhere. The only API call is e-Grădiniță's public
// kindergarten list (crawlEgradinitaInstitutions); its request/queue queries hold children's data and are never used.
const NEVER = /graphql|\/api\/|wp-admin|wp-login|login|logout|signin|signup|register|cabinet|account|\/auth|\/cart|checkout|feed\/?$|\?replytocom|mailto:|tel:|javascript:/i
const FILE_EXT = /\.(pdf|docx?|xlsx?|odt|ods|rtf|pptx?)(\?|#|$)/i
const ASSET_EXT = /\.(jpe?g|png|gif|webp|svg|ico|mp4|mp3|zip|rar|7z|css|js|xml|json)(\?|#|$)/i

// `pages` / `pdfs` raise the default depth for big non-WordPress sites (chisinau.md lists
// council decisions, privatisation decisions, etc. on many nested pages).
const RULES: Record<string, { exclude?: RegExp; include?: RegExp; ua?: string; pages?: number; pdfs?: number; seeds?: string[] }> = {
  // Same pages exist under /ru/ and /en/: index the Romanian originals only.
  // City Hall's document registers sit several clicks deep: start from them.
  chisinau: {
    pages: 250, pdfs: 40, exclude: /\/(ru|en)\//,
    seeds: [
      'hotarari-ale-comisiei-de-privatizare-a-fondului-de-locuinte-20851.html', 'docs_certificate_urbanism', 'docs_autorizatii_functionare',
      'docs_autorizatii_constructii', 'docs_arhiva', 'documente-si-politici-20530.html', 'alte-documente-20979.html', 'acteoficiale'
    ].map((p) => `https://www.chisinau.md/ro/${p}`)
  },
  acc: { exclude: /disconnections/i },
  proiecte: { exclude: /pv-289/ },
  startup: { include: /pv-289/ },
  'pretura-ciocana': { ua: BROWSER_UA }
}

const CIOCANA_FEED = 'https://feeds.tildaapi.com/api/getfeed/?feeduid=925631794381'

// Link and PDF priority: what a citizen asks about.
const INFORMATIVE = /servic|contact|procedur|regulament|program|orar|grafic|tarif|pret|taxe|anunt|noutat|stir|news|despre|about|document|acte|informat|audien|petit|inscrier|inmatricul|rut[ae]|transport|conducere|structur|intrebari|faq|ghid|cerer|autoriza|certificat|avize|atributi|functii|misiune|decizi|dispozit|hotar|achizit|transparen|consult|proiect|medic|famil|strad|circumscri|district|scolariz|gradinit|scoal|licee|sectii|cercuri|lift|deseu|salubr|apa|canal|incalzir|услуг|контакт|новост|тариф|расписан|график|документ/i
// Citizen-facing lists first (family doctor by street, school districts, tariffs, schedules); procurement last.
const PDF_HIGH = /dislocat|medic\w* de famil|strad|arondare|circumscri|district|scolariz|tarif|program de lucru|grafic|orar|regulament/gi
const PDF_MID = /pret|program|lista|taxe|servicii|procedur|ghid|cerer|hotar|decizi|dispozit|deseu|rut/gi
const PDF_LOW = /achizit|licitat|participare|invitati|preselecti|oferte|atribuire|recrutare|fisa de post|concurs/gi

// ---------- small helpers ----------

const hash = (s: string, n = 12) => createHash('sha1').update(s).digest('hex').slice(0, n)
const now = new Date()

function normUrl(u: string): string {
  try {
    const url = new URL(u)
    url.hash = ''
    let s = url.toString()
    if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1)
    return s
  } catch {
    return u
  }
}

function sameSite(host: string, other: string): boolean {
  const strip = (h: string) => h.replace(/^www\./, '')
  return strip(host) === strip(other)
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++])
  }))
}

// Per-host concurrency limit.
const hostQueues = new Map<string, { active: number; waiting: (() => void)[] }>()
async function withHost<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const host = new URL(url).host
  let q = hostQueues.get(host)
  if (!q) hostQueues.set(host, (q = { active: 0, waiting: [] }))
  if (q.active >= PER_HOST) await new Promise<void>((r) => q.waiting.push(r))
  q.active++
  try {
    return await fn()
  } finally {
    q.active--
    q.waiting.shift()?.()
  }
}

interface Fetched {
  url: string
  status: number
  ms: number
  type: string
  body: Buffer
}

/** One retry on network errors, timeouts and 429/503/508 (several hosts rate-limit or drop connections now and then). */
async function get(url: string, opts: { ua?: string; timeout?: number; method?: string; maxBytes?: number; body?: string } = {}): Promise<Fetched> {
  try {
    const f = await getOnce(url, opts)
    if (!THROTTLED.has(f.status) && f.status !== 503) return f
  } catch (e) {
    if (errMsg(e).startsWith('too large')) throw e
  }
  await new Promise((r) => setTimeout(r, 2000))
  return getOnce(url, opts)
}

async function getOnce(url: string, opts: { ua?: string; timeout?: number; method?: string; maxBytes?: number; body?: string }): Promise<Fetched> {
  return withHost(url, async () => {
    const t0 = Date.now()
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.timeout ?? TIMEOUT_MS),
      headers: { 'user-agent': opts.ua ?? UA, 'accept-language': 'ro,ru;q=0.8,en;q=0.5', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
      body: opts.body
    })
    const len = Number(res.headers.get('content-length') ?? 0)
    if (opts.maxBytes && len > opts.maxBytes) {
      await res.body?.cancel()
      throw new Error(`too large (${len} bytes)`)
    }
    const body = opts.method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer())
    if (opts.maxBytes && body.length > opts.maxBytes) throw new Error(`too large (${body.length} bytes)`)
    return { url: res.url || url, status: res.status, ms: Date.now() - t0, type: res.headers.get('content-type') ?? '', body }
  })
}

function decode(f: Fetched): string {
  const charset = /charset=([\w-]+)/i.exec(f.type)?.[1]?.toLowerCase()
  try {
    return new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(f.body)
  } catch {
    return f.body.toString('utf8')
  }
}

function errMsg(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timeout'
  return err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(e)
}

// ---------- HTML to text ----------

const JUNK = 'script,style,noscript,nav,footer,header,form,iframe,svg,aside,button,select,template,link,meta,[role=navigation],[aria-hidden=true]'
const JUNK_CLASS = '[class*=menu],[id*=menu],[class*=breadcrumb],[class*=cookie],[class*=footer],[id*=footer],[class*=sidebar],[id*=sidebar],[class*=navbar],[class*=social],[class*=share],[class*=widget]'
const BLOCKS = 'p,div,section,article,h1,h2,h3,h4,h5,h6,ul,ol,table,tr,blockquote,pre,dl,dt,dd,figure,figcaption,main'

function cleanText(s: string): string {
  return s
    .replace(/ |​/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t\r\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/(^|\n)-\n+/g, '$1- ') // list marker followed by a block inside the <li>
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(\n\n)(?:\s*\n)+/g, '\n\n')
    .trim()
}

/** Text of an HTML fragment with block boundaries kept as blank lines. */
function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  $(JUNK).remove()
  $('br').replaceWith('\n')
  $('li').each((_, el) => { $(el).prepend('\n- ') })
  $('td,th').each((_, el) => { $(el).append(' ') })
  $(BLOCKS).each((_, el) => { $(el).prepend('\n\n').append('\n\n') })
  return cleanText($.root().text())
}

interface Link { url: string; text: string }

function pageLinks($: cheerio.CheerioAPI, base: string): Link[] {
  const out: Link[] = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim()
    if (!href || href.startsWith('#')) return
    try {
      const url = new URL(href, base)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      out.push({ url: normUrl(url.toString()), text: $(el).text().replace(/\s+/g, ' ').trim() })
    } catch { /* bad href */ }
  })
  return out
}

function fileLinks(links: Link[]): { url: string; name: string }[] {
  const seen = new Set<string>()
  const out: { url: string; name: string }[] = []
  for (const l of links) {
    if (!FILE_EXT.test(l.url) || seen.has(l.url)) continue
    seen.add(l.url)
    out.push({ url: l.url, name: l.text || decodeURIComponent(l.url.split('/').pop() ?? l.url) })
  }
  return out
}

function isChallenge(html: string, text: string): boolean {
  return html.length < 20_000 && text.length < 100 && /loader-walk|challenge|document\.cookie|jschl|cf-browser-verification/i.test(html)
}

interface Page {
  title: string
  text: string
  links: Link[]
  publishedAt?: string
  updatedAt?: string
}

function isoDate(s: string | undefined): string | undefined {
  if (!s) return undefined
  const d = new Date(s)
  if (isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getTime() > now.getTime() + 86_400_000) return undefined
  return s.length === 10 ? s : d.toISOString()
}

function dateFromText(text: string, url: string): string | undefined {
  const u = /\/(20\d\d)\/(\d\d)(?:\/(\d\d))?\//.exec(url)
  if (u) return isoDate(`${u[1]}-${u[2]}-${u[3] ?? '01'}`)
  const m = /\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\b/.exec(text.slice(0, 250))
  if (m && +m[2] <= 12 && +m[1] <= 31) return isoDate(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
  return undefined
}

function parsePage(html: string, url: string): Page {
  const $ = cheerio.load(html)
  const links = pageLinks($, url)
  const meta = (p: string) => $(`meta[property="${p}"],meta[name="${p}"]`).attr('content')?.trim()
  const title = (meta('og:title') || $('h1').first().text() || $('title').text()).replace(/\s+/g, ' ').trim()
  let publishedAt = isoDate(meta('article:published_time') || $('time[datetime]').first().attr('datetime'))
  const updatedAt = isoDate(meta('article:modified_time') || meta('og:updated_time'))
  $(JUNK).remove()
  $(JUNK_CLASS).not('html,body,main,article').remove()
  let main = $.html($('body'))
  for (const sel of ['main', 'article', '[role=main]', '.entry-content', '.post-content', '#content', '.content', '#main']) {
    const el = $(sel).first()
    if (el.length && el.text().trim().length > 300) { main = $.html(el); break }
  }
  const text = htmlToText(main)
  publishedAt ??= dateFromText(text, url)
  return { title, text, links, publishedAt, updatedAt }
}

// ---------- language and integrity ----------

function detectLang(text: string): Doc['lang'] {
  const cyr = (text.match(/[Ѐ-ӿ]/g) ?? []).length
  const lat = (text.match(/[a-zA-ZăâîșşțţĂÂÎȘŞȚŢ]/g) ?? []).length
  const r = cyr / Math.max(1, cyr + lat)
  return r > 0.8 ? 'ru' : r < 0.2 ? 'ro' : 'mixed'
}

const SPAM = /casino|cazino|казино|jackpot|poker|roulette|blackjack|gambl|betting|bookmaker|1xbet|vavada|\bpin-?up\b|slots?\b|\w+slot\b|free spins|no deposit|\bbonus(es|y)?\b|promo (code|kód)|payday|\bviagra\b|\bcialis\b|bitcoin|crypto|forex|\bescorts?\b|\bporn|\bbet\b|\bloans?\b|\bprêts?\b|\bp2p\b|essay writ/gi
const STOPWORDS: Record<string, RegExp> = {
  ro: /\b(și|si|în|de|la|cu|pentru|din|pe|care|sau|este|sunt|al|ale|privind)\b/gi,
  en: /\b(the|and|of|to|is|for|with|that|you|are|was|this|from)\b/gi,
  fr: /\b(le|la|les|des|et|est|pour|une|dans|du|que|avec|sont)\b/gi,
  nl: /\b(het|een|en|voor|van|spelers|zijn|niet|ook|bij|naar)\b/gi,
  de: /\b(der|die|das|und|ist|nicht|mit|für|auf|dem)\b/gi
}
const ON_TOPIC = /chi[sș]in[aă]u|кишин|primări|primari|municip|муницип|примэр|moldov|молдов|pretur|претур|sector|сектор|rtec|trolei|троллейб|autobuz|dets|amt\b|policlinic|gr[aă]dini|școal|scoal|licee|cetățen|cetaten|refug|ukrain|украин|volunt|humanitar/i

function integrity(title: string, text: string): { ok: true } | { ok: false; reason: string } {
  const titleHits = [...title.matchAll(SPAM)].map((m) => m[0].toLowerCase())
  const textHits = [...text.slice(0, 5000).matchAll(SPAM)].map((m) => m[0].toLowerCase())
  const sample = `${title} ${text.slice(0, 3000)}`
  const count = (re: RegExp) => (sample.match(re) ?? []).length
  const ro = count(STOPWORDS.ro)
  const [lang, n] = Object.entries(STOPWORDS).filter(([l]) => l !== 'ro').map(([l, re]) => [l, count(re)] as const).sort((a, b) => b[1] - a[1])[0]
  const foreign = detectLang(text) === 'ro' && n >= 8 && n > ro * 2
  // A genuine RO/RU page (e.g. a home page listing an injected post title) needs more hits than a foreign one.
  const threshold = !foreign && ON_TOPIC.test(sample) ? 5 : 3
  if (titleHits.length * 3 + textHits.length >= threshold) return { ok: false, reason: `spam keywords: ${[...new Set([...titleHits, ...textHits])].slice(0, 5).join(', ')}` }
  if (foreign && !ON_TOPIC.test(sample)) return { ok: false, reason: `off-topic content in foreign language (${lang}) on a municipal site` }
  return { ok: true }
}

// ---------- docs ----------

const docs: Doc[] = []

function addDoc(src: Source, d: { url: string; title: string; type: DocType; text: string; files?: Doc['files']; publishedAt?: string; updatedAt?: string }) {
  const text = d.text.length > MAX_TEXT ? d.text.slice(0, MAX_TEXT) : d.text
  if (text.length < MIN_TEXT) return
  const title = d.title.replace(/\s+/g, ' ').trim() || text.slice(0, 80)
  const check = integrity(title, text)
  docs.push({
    id: hash(normUrl(d.url)),
    sourceId: src.id,
    url: d.url,
    title,
    type: d.type,
    lang: detectLang(text),
    publishedAt: d.publishedAt,
    updatedAt: d.updatedAt,
    text,
    files: d.files ?? [],
    integrity: check.ok ? 'ok' : 'quarantined',
    ...(check.ok ? {} : { integrityReason: check.reason })
  })
}

// ---------- per-source crawl state ----------

interface Ctx {
  src: Source
  origin: string
  host: string
  ua: string
  fetched: Map<string, number | string> // url -> status or error
  linksFound: Map<string, string> // internal url -> first page it was found on
  pdfs: Map<string, { url: string; name: string }>
  health: SourceHealth
}

function allowed(ctx: Ctx, url: string): boolean {
  const rule = RULES[ctx.src.id]
  if (NEVER.test(url)) return false
  if (rule?.exclude?.test(url)) return false
  if (rule?.include && !rule.include.test(url)) return false
  return true
}

function noteLinks(ctx: Ctx, links: Link[], foundOn: string) {
  for (const l of links) {
    if (FILE_EXT.test(l.url)) {
      if (/\.pdf(\?|#|$)/i.test(l.url) && !ctx.pdfs.has(l.url)) ctx.pdfs.set(l.url, { url: l.url, name: l.text || decodeURIComponent(l.url.split('/').pop() ?? '') })
      continue
    }
    try {
      if (sameSite(new URL(l.url).host, ctx.host) && !ctx.linksFound.has(l.url)) ctx.linksFound.set(l.url, foundOn)
    } catch { /* ignore */ }
  }
}

async function fetchHtml(ctx: Ctx, url: string): Promise<{ html: string; f: Fetched } | undefined> {
  try {
    const f = await get(url, { ua: ctx.ua })
    ctx.fetched.set(normUrl(url), f.status)
    if (f.status >= 400 || !/html|xml|text\/plain/i.test(f.type)) return undefined
    return { html: decode(f), f }
  } catch (e) {
    ctx.fetched.set(normUrl(url), errMsg(e))
    return undefined
  }
}

// ---------- WordPress ----------

async function detectWp(ctx: Ctx): Promise<string | undefined> {
  for (const base of [`${ctx.origin}/wp-json/wp/v2/`, `${ctx.origin}/?rest_route=/wp/v2/`]) {
    const sep = base.includes('?') ? '&' : '?'
    try {
      const f = await get(`${base}posts${sep}per_page=1&_fields=id`, { ua: ctx.ua })
      if (f.status === 200 && Array.isArray(JSON.parse(decode(f)))) return base
    } catch { /* try next */ }
  }
  return undefined
}

interface WpItem { id: number; link: string; title?: { rendered: string }; date?: string; modified?: string; content?: { rendered: string }; type?: string }

async function crawlWp(ctx: Ctx, base: string) {
  const sep = base.includes('?') ? '&' : '?'
  const fields = '_fields=id,link,title,date,modified,content,type'
  const jobs: { kind: 'posts' | 'pages'; page: number; per: number }[] = [
    { kind: 'posts', page: 1, per: WP_POSTS / 2 }, { kind: 'posts', page: 2, per: WP_POSTS / 2 },
    { kind: 'pages', page: 1, per: WP_PAGES / 2 }, { kind: 'pages', page: 2, per: WP_PAGES / 2 }
  ]
  const empty: WpItem[] = []
  await Promise.all(jobs.map(async (j) => {
    const url = `${base}${j.kind}${sep}per_page=${j.per}&page=${j.page}&${fields}${j.kind === 'posts' ? '&orderby=date&order=desc' : ''}`
    let items: WpItem[] = []
    try {
      const f = await get(url, { ua: ctx.ua, timeout: WP_TIMEOUT_MS })
      if (f.status !== 200) return
      items = JSON.parse(decode(f)) as WpItem[]
      if (!Array.isArray(items)) return
    } catch (e) {
      console.warn(`  [${ctx.src.id}] wp ${j.kind} p${j.page}: ${errMsg(e)}`)
      return
    }
    for (const it of items) {
      const html = it.content?.rendered ?? ''
      const links = pageLinks(cheerio.load(html), it.link)
      noteLinks(ctx, links, it.link)
      const text = htmlToText(html)
      if (text.length < MIN_TEXT) { empty.push(it); continue }
      addDoc(ctx.src, {
        url: normUrl(it.link),
        title: cheerio.load(it.title?.rendered ?? '').text(),
        type: it.type === 'page' ? 'page' : 'post',
        text,
        files: fileLinks(links),
        publishedAt: isoDate(it.date),
        updatedAt: isoDate(it.modified)
      })
    }
  }))
  // Page-builder sites (e.g. visit.chisinau.md) leave content.rendered empty: read the public page instead.
  await pool(empty.slice(0, WP_HTML_FALLBACK), PER_HOST, async (it) => {
    const r = await fetchHtml(ctx, it.link)
    if (!r) return
    const page = parsePage(r.html, it.link)
    noteLinks(ctx, page.links, it.link)
    addDoc(ctx.src, {
      url: normUrl(it.link),
      title: cheerio.load(it.title?.rendered ?? '').text() || page.title,
      type: it.type === 'page' ? 'page' : 'post',
      text: page.text,
      files: fileLinks(page.links),
      publishedAt: isoDate(it.date),
      updatedAt: isoDate(it.modified)
    })
  })
}

// ---------- plain HTML sites ----------

function linkScore(l: Link): number {
  const s = fold(`${decodeURIComponent(l.url)} ${l.text}`)
  let score = (s.match(new RegExp(INFORMATIVE.source, 'gi')) ?? []).length * 2
  if (/\/(ru|en)(\/|$)/.test(new URL(l.url).pathname)) score -= 3
  if (/[?&](page|p|sort|filter)=|\/tag\/|\/author\/|\/page\/\d/.test(l.url)) score -= 2
  return score
}

async function crawlHtml(ctx: Ctx, startUrl: string, homeHtml: string | undefined) {
  const candidates = new Map<string, number>()
  const visited = new Set<string>()
  const consider = (links: Link[], bonus: number) => {
    for (const l of links) {
      if (FILE_EXT.test(l.url) || ASSET_EXT.test(l.url) || !allowed(ctx, l.url)) continue
      try { if (!sameSite(new URL(l.url).host, ctx.host)) continue } catch { continue }
      if (visited.has(l.url)) continue
      candidates.set(l.url, Math.max(candidates.get(l.url) ?? -99, linkScore(l) + bonus))
    }
  }
  // Pages linked from the start page (a site's own index of its sections) go first, whatever their words.
  const handle = (url: string, html: string, bonus = 0) => {
    const page = parsePage(html, url)
    noteLinks(ctx, page.links, url)
    consider(page.links, bonus)
    addDoc(ctx.src, { url, title: page.title, type: 'html', text: page.text, files: fileLinks(page.links), publishedAt: page.publishedAt, updatedAt: page.updatedAt })
  }

  const start = normUrl(startUrl)
  visited.add(start)
  if (homeHtml) handle(start, homeHtml, 10)
  for (const seed of RULES[ctx.src.id]?.seeds ?? []) if (!visited.has(seed)) candidates.set(seed, 100)
  const limit = RULES[ctx.src.id]?.pages ?? HTML_PAGES
  while (visited.size < limit && candidates.size) {
    const batch = [...candidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.min(PER_HOST, limit - visited.size)).map(([u]) => u)
    for (const u of batch) { candidates.delete(u); visited.add(u) }
    await Promise.all(batch.map(async (u) => {
      const r = await fetchHtml(ctx, u)
      if (r) handle(normUrl(r.f.url), r.html)
    }))
  }
}

// ---------- special cases ----------

async function crawlTildaFeed(ctx: Ctx) {
  try {
    const f = await get(CIOCANA_FEED, { ua: BROWSER_UA })
    const feed = JSON.parse(decode(f)) as { posts: { uid: string; url: string; title: string; published?: string; date?: string }[] }
    await pool(feed.posts, PER_HOST, async (p) => {
      try {
        const r = await get(`https://feeds.tildaapi.com/api/getpost/?postuid=${p.uid}`, { ua: BROWSER_UA })
        const post = (JSON.parse(decode(r)) as { post?: { title?: string; text?: string; descr?: string } }).post
        const html = post?.text || post?.descr || ''
        const links = pageLinks(cheerio.load(html), p.url)
        noteLinks(ctx, links, p.url)
        addDoc(ctx.src, {
          url: normUrl(p.url),
          title: cheerio.load(post?.title ?? p.title).text(),
          type: 'post',
          text: htmlToText(html),
          files: fileLinks(links),
          publishedAt: isoDate((p.published ?? p.date ?? '').slice(0, 10))
        })
      } catch (e) {
        console.warn(`  [${ctx.src.id}] tilda post ${p.uid}: ${errMsg(e)}`)
      }
    })
  } catch (e) {
    console.warn(`  [${ctx.src.id}] tilda feed: ${errMsg(e)}`)
  }
}

// ---------- JavaScript apps (e-Grădiniță, e-Școala) ----------
// Their HTML is an empty shell; the public texts (guides, admission rules) are Google Docs "published to
// the web" and linked from the app code. We read only published documents, never forms or Drive files.


async function crawlAppDocs(ctx: Ctx, homeHtml: string | undefined) {
  if (!homeHtml) return
  const bundles = [...homeHtml.matchAll(/src="(\/static\/js\/[^"]+\.js)"/g)].map((m) => new URL(m[1], ctx.origin).toString())
  const links = new Set<string>()
  for (const b of bundles) {
    try {
      const js = decode(await get(b, { ua: ctx.ua, timeout: 30000, maxBytes: 5_000_000 }))
      for (const m of js.matchAll(/https:\/\/docs\.google\.com\/document\/d\/[\w-]+(?:\/[\w-]+)?\/(?:pub|edit)[^"'\s)\\]*/g)) links.add(m[0])
    } catch (e) { console.warn(`  [${ctx.src.id}] bundle ${b}: ${errMsg(e)}`) }
  }
  for (const link of links) {
    // Published docs are readable as HTML; for "edit" links try the plain-text export (works only if shared publicly).
    const url = link.includes('/pub') ? link.replace(/\?.*$/, '') : link.replace(/\/edit.*$/, '/export?format=txt')
    try {
      const f = await get(url, { ua: BROWSER_UA, timeout: 20000 })
      if (f.status !== 200) continue
      const body = decode(f)
      const isHtml = /<html|<body/i.test(body)
      const $ = isHtml ? cheerio.load(body) : null
      const title = ($?.('title').text() || body.split('\n').find((l) => l.trim()) || '').replace(/\s*-\s*Google (Docs|Документы)$/i, '').trim()
      const text = isHtml ? htmlToText($!('#contents').html() ?? $!('body').html() ?? '') : cleanText(body)
      if (/sign in|conectați-vă|accounts\.google/i.test(text.slice(0, 300))) continue
      addDoc(ctx.src, { url: link.replace(/\?embedded=true$/, ''), title: title || `${ctx.src.name}: document`, type: 'page', text })
    } catch (e) { console.warn(`  [${ctx.src.id}] ${url}: ${errMsg(e)}`) }
  }
}

interface Kindergarten { id: number; name: string; phone?: string; address?: string; language?: string; district?: string; places?: { year: number; count: number }[]; available?: { year: number; count: number }[]; addresses?: string[] }

const LANG_RO: Record<string, string> = { ro: 'română', ru: 'rusă', both: 'română și rusă' }

/** e-Grădiniță's public kindergarten list: one document per kindergarten (address, language, places, catchment streets). */
async function crawlEgradinitaInstitutions(ctx: Ctx) {
  const query = 'query { getInstitutions(start: 0, limit: 500) { institutions { id: _id name phone address language places { year count } available { year count } addresses district } } }'
  try {
    const f = await get(`${ctx.origin}/data/`, { ua: ctx.ua, timeout: 30000, method: 'POST', body: JSON.stringify({ query }) })
    const list = (JSON.parse(decode(f)) as { data?: { getInstitutions?: { institutions?: Kindergarten[] } } }).data?.getInstitutions?.institutions ?? []
    const sum = (xs: { year: number; count: number }[] | undefined, year: number) => (xs ?? []).filter((x) => x.year === year).reduce((a, x) => a + Math.max(0, x.count), 0)
    for (const k of list) {
      const years = [...new Set((k.places ?? []).map((p) => p.year))].sort((a, b) => b - a).slice(0, 4)
      const text = [
        k.name,
        k.address ? `Adresa: ${k.address}${k.district ? `, sectorul ${k.district[0].toUpperCase()}${k.district.slice(1)}` : ''}` : '',
        k.phone ? `Telefon: ${k.phone}` : '',
        k.language ? `Limba de instruire: ${LANG_RO[k.language] ?? k.language}` : '',
        years.length ? `Locuri pe anul nașterii copilului (oferite / libere):\n${years.map((y) => `- ${y}: ${sum(k.places, y)} / ${sum(k.available, y)}`).join('\n')}` : '',
        k.addresses?.length ? `Adresele arondate grădiniței (districtul de înscriere):\n${k.addresses.map((a) => `- ${a}`).join('\n')}` : '',
        'Cererea de înscriere se depune online pe egradinita.md, doar la grădinița din districtul adresei de domiciliu.'
      ].filter(Boolean).join('\n\n')
      addDoc(ctx.src, { url: `${ctx.origin}/institution/${k.id}`, title: `${k.name} (e-Grădiniță)`, type: 'page', text })
    }
    console.log(`  [egradinita] ${list.length} kindergartens from the public list`)
  } catch (e) {
    console.warn(`  [egradinita] public institutions list: ${errMsg(e)}`)
  }
}

interface DgaurfService { title: string; fee?: string; term?: string; see_more_link?: { url?: string }; service_link?: { url?: string }; description_html?: string; fees_html?: string; documents_html?: string; appendix?: { title: string; url: string }[] }

async function crawlDgaurfServices(ctx: Ctx) {
  const url = `${ctx.origin}/ro/services`
  const r = await fetchHtml(ctx, url)
  if (!r) return
  try {
    const list = JSON.parse(cheerio.load(r.html)('#services-data').text()) as DgaurfService[]
    for (const s of list) {
      const text = [
        s.title,
        s.term ? `Termen: ${s.term}` : '',
        s.fee ? `Tarif: ${s.fee}` : '',
        htmlToText(s.description_html ?? ''),
        htmlToText(s.fees_html ?? ''),
        htmlToText(s.documents_html ?? ''),
        s.service_link?.url ? `Serviciu online: ${s.service_link.url}` : ''
      ].filter(Boolean).join('\n\n')
      addDoc(ctx.src, {
        url: normUrl(new URL(s.see_more_link?.url || url, ctx.origin).toString()),
        title: s.title,
        type: 'page',
        text,
        files: (s.appendix ?? []).map((a) => ({ url: a.url, name: a.title }))
      })
    }
  } catch (e) {
    console.warn(`  [dgaurf] services JSON: ${errMsg(e)}`)
  }
}

// ---------- PDFs ----------

async function pdfToText(buf: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const { text } = await extractText(pdf, { mergePages: false })
  return (text as string[]).map(cleanText).join('\n\n')
}

async function crawlPdfs(ctx: Ctx) {
  const max = RULES[ctx.src.id]?.pdfs ?? PDFS_PER_SOURCE
  const ranked = [...ctx.pdfs.values()]
    .map((p) => {
      const s = fold(`${decodeURIComponent(p.url).replace(/[-_]+/g, ' ')} ${p.name}`)
      const n = (re: RegExp) => (s.match(re) ?? []).length
      return { ...p, score: n(PDF_HIGH) * 3 + n(PDF_MID) - n(PDF_LOW) * 3 + (sameSite(new URL(p.url).host, ctx.host) ? 1 : 0) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max * 2) // some will be too large, scans or broken
  let taken = 0
  await pool(ranked, PER_HOST, async (p) => {
    if (taken >= max || NEVER.test(p.url)) return
    try {
      const f = await get(p.url, { ua: ctx.ua, maxBytes: MAX_PDF_BYTES, timeout: 25_000 })
      if (f.status >= 400) { ctx.fetched.set(p.url, f.status); return }
      if (!f.body.subarray(0, 5).toString().startsWith('%PDF')) return
      const text = await pdfToText(f.body)
      const letters = (text.match(/\p{L}/gu) ?? []).length
      if (text.length < 200 || letters < text.length * 0.4) return // scan without a text layer
      if (taken >= max) return
      taken++
      const file = decodeURIComponent(p.url.split('/').pop() ?? p.url).replace(/[-_]+/g, ' ')
      const generic = p.name.length < 25 && /desc[aă]rc|vezi|detalii|download|accesare|versiune|citeste|^pdf$/i.test(p.name)
      const name = p.name.length > 3 && !generic ? p.name : file
      addDoc(ctx.src, { url: normUrl(p.url), title: name.replace(/\.pdf$/i, ''), type: 'pdf', text, publishedAt: dateFromText('', p.url) })
    } catch (e) {
      const msg = errMsg(e)
      if (!msg.startsWith('too large')) console.warn(`  [${ctx.src.id}] pdf ${p.url}: ${msg}`)
    }
  })
}

// ---------- health ----------

function checkTls(host: string): Promise<SourceHealth['tls']> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 10_000 }, () => {
      const ok = sock.authorized
      sock.end()
      resolve(ok ? 'ok' : 'invalid')
    })
    sock.on('error', () => resolve('none'))
    sock.on('timeout', () => { sock.destroy(); resolve('none') })
  })
}

function findContact(links: Link[], host: string): string | undefined {
  const internal = links.filter((l) => { try { return sameSite(new URL(l.url).host, host) } catch { return false } })
  const re = /contact|контакт/i
  return (internal.find((l) => re.test(new URL(l.url).pathname)) ?? internal.find((l) => re.test(l.text)))?.url
}

async function checkLinks(ctx: Ctx): Promise<BrokenLink[]> {
  const broken: BrokenLink[] = []
  const seen = new Set<string>()
  // Failures already hit while crawling.
  for (const [url, status] of ctx.fetched) {
    if ((typeof status === 'number' && status >= 400 && !THROTTLED.has(status)) || typeof status === 'string') {
      broken.push({ url, status, foundOn: ctx.linksFound.get(url) ?? ctx.src.url })
      seen.add(url)
    }
  }
  const toCheck = [...ctx.linksFound.entries()]
    .filter(([u]) => !ctx.fetched.has(u) && !NEVER.test(u) && !u.includes('/cdn-cgi/') && !ASSET_EXT.test(u) && allowed(ctx, u))
    .slice(0, LINK_CHECKS)
  await pool(toCheck, PER_HOST, async ([url, foundOn]) => {
    if (seen.has(url)) return
    try {
      let f = await get(url, { ua: ctx.ua, method: 'HEAD' })
      if (f.status === 405 || f.status === 403 || f.status === 501) f = await get(url, { ua: ctx.ua })
      if (f.status === 403) { // some hosts rate-limit bursts with 403: retry once, slowly
        await new Promise((r) => setTimeout(r, 3000))
        f = await get(url, { ua: ctx.ua })
      }
      if (f.status >= 400 && !THROTTLED.has(f.status)) broken.push({ url, status: f.status, foundOn })
    } catch (e) {
      broken.push({ url, status: errMsg(e), foundOn })
    }
  })
  return broken
}

// ---------- source driver ----------

async function crawlSource(src: Source): Promise<SourceHealth> {
  const start = new URL(src.url)
  const ctx: Ctx = {
    src,
    origin: start.origin,
    host: start.host,
    ua: RULES[src.id]?.ua ?? UA,
    fetched: new Map(),
    linksFound: new Map(),
    pdfs: new Map(),
    health: { sourceId: src.id, checkedAt: new Date().toISOString(), ok: false, tls: 'none', docCount: 0, quarantined: 0, brokenLinks: [], wp: false }
  }
  const h = ctx.health

  h.tls = await checkTls(start.hostname)

  // Home page: reachability, contact link, and the seed for link discovery.
  let homeHtml: string | undefined
  let homeLinks: Link[] = []
  try {
    const f = await get(src.url, { ua: ctx.ua })
    h.status = f.status
    h.ms = f.ms
    ctx.fetched.set(normUrl(src.url), f.status)
    if (f.status < 400) {
      homeHtml = decode(f)
      const $ = cheerio.load(homeHtml)
      homeLinks = pageLinks($, f.url)
      $('script,style,noscript').remove()
      if (isChallenge(homeHtml, $('body').text().trim())) {
        h.ok = true
        h.blocked = true
        h.error = 'blocked by anti-bot JS challenge (not bypassed)'
        homeHtml = undefined
      } else {
        h.ok = true
      }
    } else {
      h.error = `HTTP ${f.status}`
    }
  } catch (e) {
    h.error = errMsg(e)
  }
  if (!h.ok) {
    console.log(`  [${src.id}] unreachable: ${h.error}`)
    return h
  }
  noteLinks(ctx, homeLinks, src.url)
  h.contactUrl = findContact(homeLinks, ctx.host)

  // `startup` is a single page on proiecte.chisinau.md, never a whole site.
  const wpBase = src.id === 'startup' ? undefined : await detectWp(ctx)
  h.wp = !!wpBase
  if (wpBase) {
    await crawlWp(ctx, wpBase)
    // The given URL may be a specific page not covered by the API window (e.g. agsv, autosalubritate).
    if (homeHtml && normUrl(src.url) !== normUrl(ctx.origin)) {
      const p = parsePage(homeHtml, src.url)
      addDoc(src, { url: normUrl(src.url), title: p.title, type: 'html', text: p.text, files: fileLinks(p.links), publishedAt: p.publishedAt, updatedAt: p.updatedAt })
    }
  } else {
    if (src.id === 'dgaurf') await crawlDgaurfServices(ctx)
    if (src.id === 'pretura-ciocana') await crawlTildaFeed(ctx)
    if (src.id === 'egradinita') await crawlEgradinitaInstitutions(ctx)
    if (src.id === 'egradinita' || src.id === 'escoala') await crawlAppDocs(ctx, homeHtml)
    await crawlHtml(ctx, src.url, homeHtml)
  }

  await crawlPdfs(ctx)
  h.brokenLinks = await checkLinks(ctx)

  h.contactUrl ??= [...ctx.linksFound.keys()].find((u) => /contact|контакт/i.test(new URL(u).pathname))
  const mine = docs.filter((d) => d.sourceId === src.id)
  h.docCount = mine.length
  h.quarantined = mine.filter((d) => d.integrity === 'quarantined').length
  if (!h.docCount) h.error = 'reachable, but no indexable text (JavaScript-only site)'
  console.log(`  [${src.id}] ${h.docCount} docs (${h.quarantined} quarantined), wp=${h.wp}, tls=${h.tls}, broken=${h.brokenLinks.length}`)
  return h
}

// ---------- conflicts ----------

const TOPICS: { topic: string; words: string[] }[] = [
  { topic: 'Înscrierea în grădiniță', words: ['gradinit', 'inscrier', 'детск сад', 'preșcolar'] },
  { topic: 'Tarife salubrizare / deșeuri', words: ['deseu', 'salubr', 'tarif', 'evacuare'] },
  { topic: 'Deconectări apă', words: ['deconect', 'apa', 'apeduct', 'avarie'] },
  { topic: 'Încălzire / agent termic', words: ['incalzir', 'agent termic', 'termoelectrica', 'sezon'] },
  { topic: 'Tarife transport public', words: ['calatori', 'tarif', 'bilet', 'abonament', 'lei'] },
  { topic: 'Certificat de urbanism și autorizație de construire', words: ['autorizati', 'construire', 'certificat de urbanism', 'demolare'] },
  { topic: 'Notificarea activității de comerț', words: ['notificar', 'comert', 'alimentatie publica', 'activitat'] },
  { topic: 'Înregistrarea la medicul de familie', words: ['medic de familie', 'inregistr', 'lista', 'polic'] },
  { topic: 'Audiențe la primar', words: ['audient', 'primar', 'programar'] },
  { topic: 'Petiții', words: ['petiti', 'termen', 'examinare'] },
  { topic: 'Înscrierea la școală', words: ['clasa i', 'inscrier', 'scolariz', 'district'] },
  { topic: 'Granturi startup pentru tineri', words: ['startup', 'grant', 'tineri', 'migranti'] },
  { topic: 'Tăierea arborilor', words: ['arbor', 'defrisar', 'taier', 'spatii verzi'] },
  { topic: 'Repararea ascensoarelor', words: ['lift', 'ascensor', 'reparat'] },
  { topic: 'Facturi servicii comunale', words: ['factur', 'plata', 'servicii comunale', 'infocom'] }
]

interface Candidate { aDocId: string; aQuote: string; aValue: string; bDocId: string; bQuote: string; bValue: string }

async function findConflicts(okDocs: Doc[]): Promise<Conflict[]> {
  if (!llmEnabled()) {
    console.warn('  [conflicts] skipped: no AI_API_KEY')
    return []
  }
  const byId = new Map(okDocs.map((d) => [d.id, d]))
  const folded = okDocs.map((d) => ({ d, t: fold(`${d.title}\n${d.text}`) }))
  const out: Conflict[] = []

  for (const { topic, words } of TOPICS) {
    await new Promise((r) => setTimeout(r, 3000)) // stay under free-tier rate limits
    const keys = words.map(fold)
    const top = folded
      .map(({ d, t }) => ({ d, score: keys.reduce((s, k) => s + (t.split(k).length - 1), 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    if (top.length < 2) continue
    const passages = top.map(({ d }) => {
      const paras = d.text.split(/\n{2,}/).filter((p) => keys.some((k) => fold(p).includes(k))).slice(0, 4)
      return `<doc id="${d.id}" source="${d.sourceId}" title="${d.title.replace(/"/g, "'")}">\n${paras.join('\n\n').slice(0, 1500)}\n</doc>`
    })
    const prompt = `Topic: ${topic}\n\nBelow are passages from official Chișinău municipal documents. Find pairs of passages from DIFFERENT docs that directly contradict each other about this topic (e.g. different fees, deadlines, phone numbers, schedules, required documents for the same thing). Ignore differences explained by different dates, districts or services. Both passages must state a concrete value; a document that does not mention something is not a contradiction.\n\nReturn ONLY a JSON object {"conflicts":[...]} where each item is {"aDocId","aQuote","aValue","bDocId","bQuote","bValue"} (empty array if none). Quotes must be copied verbatim from the passages (one sentence or less). "value" is the conflicting fact in a few words, in Romanian.\n\n${passages.join('\n\n')}`
    try {
      const res = await completeJson<{ conflicts?: Candidate[] }>({ system: 'You compare official municipal documents and answer only with JSON.', user: prompt, maxTokens: 1500 })
      for (const c of res.conflicts ?? []) {
        const a = byId.get(c.aDocId)
        const b = byId.get(c.bDocId)
        if (!a || !b || a.id === b.id) continue
        if (!containsQuote(a.text, c.aQuote) || !containsQuote(b.text, c.bQuote)) continue
        out.push({
          id: hash(`${topic}|${c.aQuote}|${c.bQuote}`),
          topic,
          a: { docId: a.id, quote: c.aQuote, value: c.aValue },
          b: { docId: b.id, quote: c.bQuote, value: c.bValue },
          detectedAt: new Date().toISOString(),
          origin: 'index'
        })
      }
      console.log(`  [conflicts] ${topic}: ${out.length} total`)
    } catch (e) {
      console.warn(`  [conflicts] ${topic}: ${errMsg(e)}`)
    }
  }
  return out
}

// ---------- main ----------

function dedupe(list: Doc[]): Doc[] {
  const byUrl = new Set<string>()
  const byText = new Set<string>()
  return list.filter((d) => {
    const u = normUrl(d.url)
    const t = hash(d.text.replace(/\s+/g, ' '), 16)
    if (byUrl.has(u) || byText.has(t)) return false
    byUrl.add(u)
    byText.add(t)
    return true
  })
}

// `pnpm crawl --conflicts` re-runs only contradiction detection on the existing corpus.
async function conflictsOnly() {
  const corpus: Corpus = JSON.parse(readFileSync(join(config.DATA_DIR, 'corpus.json'), 'utf8'))
  const conflicts = await findConflicts(corpus.docs.filter((d) => d.integrity === 'ok'))
  writeFileSync(join(config.DATA_DIR, 'conflicts.json'), JSON.stringify(conflicts, null, 2))
  console.log(`${conflicts.length} conflicts`)
}

async function main() {
  if (process.argv.includes('--conflicts')) return conflictsOnly()
  // `--source <id>` re-crawls one site and merges it into the existing corpus (contradictions are kept as they are).
  const only = process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : undefined
  const targets = only ? SOURCES.filter((s) => s.id === only) : SOURCES
  if (only && !targets.length) throw new Error(`unknown source: ${only}`)
  const t0 = Date.now()
  console.log(`Crawling ${targets.length} sources...`)
  let results: SourceHealth[] = []
  await pool(targets, SOURCE_CONCURRENCY, async (src) => {
    console.log(`> ${src.id} ${src.url}`)
    try {
      results.push(await crawlSource(src))
    } catch (e) {
      console.warn(`  [${src.id}] crashed: ${errMsg(e)}`)
      results.push({ sourceId: src.id, checkedAt: new Date().toISOString(), ok: false, error: errMsg(e), tls: 'none', docCount: 0, quarantined: 0, brokenLinks: [], wp: false })
    }
  })

  let unique = dedupe(docs)
  const read = <T>(name: string): T => JSON.parse(readFileSync(join(config.DATA_DIR, name), 'utf8')) as T
  if (only) {
    unique = dedupe([...unique, ...read<Corpus>('corpus.json').docs.filter((d) => d.sourceId !== only)])
    results = [...results, ...read<Health>('health.json').sources.filter((h) => h.sourceId !== only)]
  }
  // Recount after dedupe so health matches the corpus.
  for (const h of results) {
    const mine = unique.filter((d) => d.sourceId === h.sourceId)
    h.docCount = mine.length
    h.quarantined = mine.filter((d) => d.integrity === 'quarantined').length
    const dates = mine.filter((d) => d.integrity === 'ok').flatMap((d) => [d.publishedAt, d.updatedAt]).filter((d): d is string => !!d).sort()
    h.latestContentAt = dates.at(-1)
  }
  const order = new Map(SOURCES.map((s, i) => [s.id, i]))
  results.sort((a, b) => order.get(a.sourceId)! - order.get(b.sourceId)!)

  const corpus: Corpus = { builtAt: new Date().toISOString(), docs: unique }
  const health: Health = { checkedAt: new Date().toISOString(), sources: results }
  const okDocs = unique.filter((d) => d.integrity === 'ok')
  const found = only ? [] : await findConflicts(okDocs)
  // Keep earlier contradictions whose quotes are still in the documents: a rate-limited topic must not erase them.
  const byId = new Map(okDocs.map((d) => [d.id, d]))
  const previous = existsSync(join(config.DATA_DIR, 'conflicts.json')) ? (JSON.parse(readFileSync(join(config.DATA_DIR, 'conflicts.json'), 'utf8')) as Conflict[]) : []
  const pair = (c: Conflict) => [c.a.docId, c.b.docId].sort().join('~')
  const seen = new Set<string>()
  const fresh = found.filter((c) => !seen.has(pair(c)) && seen.add(pair(c)))
  const still = previous.filter((c) => !seen.has(pair(c)) && seen.add(pair(c))
    && containsQuote(byId.get(c.a.docId)?.text ?? '', c.a.quote) && containsQuote(byId.get(c.b.docId)?.text ?? '', c.b.quote))
  const conflicts = [...fresh, ...still]

  mkdirSync(config.DATA_DIR, { recursive: true })
  writeFileSync(join(config.DATA_DIR, 'corpus.json'), JSON.stringify(corpus))
  writeFileSync(join(config.DATA_DIR, 'health.json'), JSON.stringify(health, null, 2))
  writeFileSync(join(config.DATA_DIR, 'conflicts.json'), JSON.stringify(conflicts, null, 2))
  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s: ${unique.length} docs (${docs.length - unique.length} duplicates dropped), ${conflicts.length} conflicts`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
