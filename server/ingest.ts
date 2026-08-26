import type express from 'express'
import { nanoid } from 'nanoid'
import { and, desc, eq } from 'drizzle-orm'
import { db } from './db/index.ts'
import { syncKeys } from './db/schema.ts'
import { store } from './store.ts'
import * as actions from './actions.ts'
import type { Frame } from '../shared/types.ts'

/**
 * Design sync: a PostHog-style snippet (public/doop-sync.js) embedded in an
 * app posts serialized DOM snapshots of its screens here, and each distinct
 * screen becomes (or refreshes) a frame on one canvas. The bearer secret in
 * the URL is the whole credential — write-only, scoped to a single canvas —
 * so apps behind VPNs/SSO that the server-side importer can never reach can
 * still push their designs in from the user's own browser.
 *
 * Snapshots are scrubbed of scripts like importer snapshots are, but that is
 * hygiene (the app's JS must not run again inside the canvas), not the
 * security boundary — frames always render in a sandboxed iframe without
 * same-origin, exactly like agent-authored HTML that may carry scripts.
 */

export interface SyncKey {
  id: string
  secret: string
  canvasId: string
  name: string
  createdBy: string
  createdAt: number
  lastUsedAt: number | null
}

export async function createSyncKey(canvasId: string, name: string, createdBy: string): Promise<SyncKey> {
  const row: SyncKey = {
    id: nanoid(8),
    secret: 'dk_' + nanoid(24),
    canvasId,
    name: name.trim().slice(0, 60) || 'App sync',
    createdBy,
    createdAt: Date.now(),
    lastUsedAt: null,
  }
  await db.insert(syncKeys).values(row)
  return row
}

export function listSyncKeys(canvasId: string): Promise<SyncKey[]> {
  return db.select().from(syncKeys).where(eq(syncKeys.canvasId, canvasId)).orderBy(desc(syncKeys.createdAt))
}

/** Revocation is deletion: the next ingest with the secret gets a 404. */
export async function deleteSyncKey(canvasId: string, id: string): Promise<boolean> {
  const gone = await db
    .delete(syncKeys)
    .where(and(eq(syncKeys.id, id), eq(syncKeys.canvasId, canvasId)))
    .returning({ id: syncKeys.id })
  return gone.length > 0
}

/* ------------------------------------------------------------------ */

/** Same lockdown the website importer stamps on its captures. Duplicated from
 *  importer.ts on purpose: this path must not load the Chromium-adjacent
 *  importer module, and the two snapshots want identical policies. */
const SNAPSHOT_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "style-src 'unsafe-inline'",
  'img-src data: blob: http: https:',
  'font-src data: http: https:',
  'media-src data: blob: http: https:',
].join('; ')

const SYNC_PAGE_META = 'doop-sync-page'

/** Which key/page a synced frame belongs to: `<keyId>/<page>` or undefined.
 *  The marker carries the key's public id, never its secret — frame HTML is
 *  readable by everyone on the canvas. */
export function syncFrameMarker(html: string): string | undefined {
  const encoded = html.match(
    new RegExp(`<meta\\s+name=["']${SYNC_PAGE_META}["']\\s+content=["']([^"']+)["']`, 'i'),
  )?.[1]
  if (!encoded) return undefined
  try {
    return decodeURIComponent(encoded)
  } catch {
    return undefined
  }
}

const BANNED_TAGS = 'script|noscript|iframe|frame|frameset|object|embed|applet|portal|fencedframe'

/** The snippet already scrubs in the browser with real DOM APIs; this re-scrub
 *  is belt-and-braces for hand-rolled posters. Regex-based on purpose — see
 *  the module comment: the sandbox is the boundary, this only keeps snapshots
 *  passive and editable. */
export function sanitizeSnapshotHtml(html: string): string {
  let out = html
  /* paired blocks first, then any stray open/self-closed tags left behind */
  out = out.replace(new RegExp(`<(${BANNED_TAGS})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi'), '')
  out = out.replace(new RegExp(`<\\/?(?:${BANNED_TAGS})\\b[^>]*>`, 'gi'), '')
  out = out.replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
  out = out.replace(/<base\b[^>]*>/gi, '')
  out = out.replace(/\s(?:on[a-z]+|srcdoc|ping)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  out = out.replace(
    /\s(href|src|action|formaction|poster|xlink:href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi,
    '',
  )
  return out
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/** Scrub + stamp: marker meta, importer-grade CSP, and a base for the app's
 *  relative asset URLs. Mirrors the injection the importer performs. */
export function wrapSnapshotHtml(html: string, marker: string, baseUrl: string | undefined): string {
  let out = sanitizeSnapshotHtml(html)
  const inject =
    `<meta name="${SYNC_PAGE_META}" content="${encodeURIComponent(marker)}">` +
    `<meta http-equiv="Content-Security-Policy" content="${SNAPSHOT_CSP}">` +
    (baseUrl ? `<base href="${escapeAttr(baseUrl)}">` : '')
  const headMatch = out.match(/<head[^>]*>/i)
  if (headMatch) out = out.replace(headMatch[0], headMatch[0] + inject)
  else out = inject + out
  if (!/^\s*<!doctype/i.test(out)) out = '<!doctype html>\n' + out
  return out
}

/* ------------------------------------------------------------------ */

export const MAX_SNAPSHOT_BYTES = 2_500_000
const INGESTS_PER_MIN = 30
/** floor between rewrites of the SAME page — a busy app must not churn the
 *  canvas (and its websocket room) with a frame write per user interaction */
const PAGE_MIN_INTERVAL_MS = Number(process.env.SYNC_PAGE_INTERVAL_MS ?? 30_000)

const ingestHits = new Map<string, number[]>()
const pageLastWrite = new Map<string, number>()

function takeIngestSlot(keyId: string): boolean {
  const now = Date.now()
  const hits = (ingestHits.get(keyId) ?? []).filter((t) => now - t < 60_000)
  if (hits.length >= INGESTS_PER_MIN) return false
  hits.push(now)
  ingestHits.set(keyId, hits)
  return true
}

/** The snippet runs on a foreign origin, so every response must carry CORS.
 *  `*` is safe here: the secret is in the path, no cookies are involved. */
export function setIngestCors(res: express.Response) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  res.set('Access-Control-Max-Age', '86400')
  /* Chrome Private Network Access: a page on a public origin posting to a
     doop on localhost/an intranet host needs this opt-in on the preflight —
     the local-testing and self-hosted cases. */
  res.set('Access-Control-Allow-Private-Network', 'true')
}

/** Normalize the snippet's page identifier: a rooted path, bounded length. */
function cleanPage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const page = raw.trim()
  if (!page.startsWith('/') || page.length > 300 || /[\s<>"']/.test(page)) return null
  return page
}

export async function handleIngest(req: express.Request, res: express.Response) {
  setIngestCors(res)
  const secret = String(req.params.key ?? '')
  if (!/^dk_[\w-]{20,}$/.test(secret)) return res.status(404).json({ error: 'unknown sync key' })
  const [key] = await db.select().from(syncKeys).where(eq(syncKeys.secret, secret))
  if (!key) return res.status(404).json({ error: 'unknown sync key' })
  const canvas = store.getCanvas(key.canvasId)
  if (!canvas) return res.status(410).json({ error: 'the canvas this key points at no longer exists' })

  const page = cleanPage(req.body?.page)
  const html = typeof req.body?.html === 'string' ? req.body.html : ''
  if (!page || !html.trim()) return res.status(400).json({ error: 'page (a rooted path) and html are required' })
  if (html.length > MAX_SNAPSHOT_BYTES) {
    return res.status(413).json({ error: 'snapshot exceeds the 2.5 MB limit — mask or exclude heavy content' })
  }

  if (!takeIngestSlot(key.id)) {
    res.set('Retry-After', '60')
    return res.status(429).json({ error: 'sync rate limit — slow down' })
  }

  let baseUrl: string | undefined
  try {
    const url = new URL(String(req.body?.url ?? ''))
    if (url.protocol === 'http:' || url.protocol === 'https:') baseUrl = url.href
  } catch {
    /* no usable base — same-origin assets just won't resolve */
  }

  const marker = `${key.id}${page}`
  const wrapped = wrapSnapshotHtml(html, marker, baseUrl)
  const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : page
  const width = Math.min(3840, Math.max(320, Math.round(Number(req.body?.width) || 1280)))
  const height = Math.min(8000, Math.max(400, Math.round(Number(req.body?.height) || 900)))
  const actor = actions.resolveActor({ name: key.name, kind: 'user' })

  db.update(syncKeys)
    .set({ lastUsedAt: Date.now() })
    .where(eq(syncKeys.id, key.id))
    .catch((err: unknown) => console.error('[ingest] lastUsedAt write failed', err))

  const mine = canvas.frames.filter((f) => syncFrameMarker(f.html)?.startsWith(`${key.id}/`))
  const existing = mine.find((f) => syncFrameMarker(f.html) === marker)
  if (existing) {
    if (existing.html === wrapped) return res.json({ ok: true, frameId: existing.id, unchanged: true })
    const last = pageLastWrite.get(marker) ?? 0
    if (Date.now() - last < PAGE_MIN_INTERVAL_MS) {
      res.set('Retry-After', String(Math.ceil((PAGE_MIN_INTERVAL_MS - (Date.now() - last)) / 1000)))
      return res.status(429).json({ error: 'this page was just synced — retry shortly' })
    }
    pageLastWrite.set(marker, Date.now())
    /* geometry the user may have arranged stays; content and height track the app */
    actions.updateFrame(existing.id, { html: wrapped, name: title.slice(0, 80), height }, actor)
    return res.json({ ok: true, frameId: existing.id, updated: true })
  }

  /* New screen: extend this app's frames in one row so a synced app reads
     left-to-right, starting to the right of everything else on the canvas. */
  let x: number
  let y: number
  if (mine.length) {
    x = Math.max(...mine.map((f) => f.x + f.width)) + 80
    y = Math.min(...mine.map((f) => f.y))
  } else {
    const rightmost = canvas.frames.reduce((right, f) => Math.max(right, f.x + f.width), 0)
    x = canvas.frames.length ? rightmost + 80 : 120
    y = 120
  }
  pageLastWrite.set(marker, Date.now())
  const frame = actions.createFrame(canvas.id, { name: title.slice(0, 80), x, y, width, height, html: wrapped }, actor)
  if (!frame) return res.status(410).json({ error: 'canvas vanished mid-sync' })
  res.json({ ok: true, frameId: frame.id, created: true })
}

/** Frames synced by a key, for the share modal's per-key screen count. */
export function syncedFrameCount(canvas: { frames: Frame[] }, keyId: string): number {
  return canvas.frames.filter((f) => syncFrameMarker(f.html)?.startsWith(`${keyId}/`)).length
}
