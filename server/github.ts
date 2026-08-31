import { nanoid } from 'nanoid'
import { and, desc, eq } from 'drizzle-orm'
import { db } from './db/index.ts'
import { githubConnections } from './db/schema.ts'
import * as actions from './actions.ts'
import { sanitizeSnapshotHtml } from './ingest.ts'
import * as githubApp from './githubApp.ts'
import type { Actor, Frame } from '../shared/types.ts'

/**
 * GitHub repo as an import source: connect a repo (fine-grained PAT), let
 * doop enumerate its screens from framework routing conventions, and land the
 * selected ones on the canvas — captured from the live deployment where one
 * exists, imported directly for static HTML, and as labeled placeholder
 * frames where neither works (screens behind a login, dynamic routes). The
 * repo supplies the map; whichever lane can reach a screen supplies the
 * pixels.
 *
 * Provenance follows the design-sync pattern: a marker meta stamped into the
 * frame HTML (`doop-github-screen`), no frame column. The marker carries the
 * connection's id — never the token — so frame HTML stays safe to read for
 * everyone on the canvas.
 */

export interface GithubConnection {
  id: string
  canvasId: string
  repo: string
  branch: string
  /** fine-grained PAT — the paste-a-token fallback; null in app mode */
  token: string | null
  /** GitHub App installation — the click-to-install flow; null in PAT mode */
  installationId: string | null
  deployUrl: string | null
  createdBy: string
  createdAt: number
  lastSyncedAt: number | null
}

/** What API responses expose — everything but the token. */
export type GithubConnectionInfo = Omit<GithubConnection, 'token'> & { via: 'app' | 'token' }

export function connectionInfo(conn: GithubConnection): GithubConnectionInfo {
  const { token: _token, ...info } = conn
  return { ...info, via: conn.installationId ? 'app' : 'token' }
}

/** The credential a call should use right now: the stored PAT, or a fresh
 *  short-lived installation token minted through the app. */
function connectionAuth(conn: Pick<GithubConnection, 'token' | 'installationId'>): Promise<string> {
  if (conn.installationId) return githubApp.installationToken(conn.installationId)
  if (conn.token) return Promise.resolve(conn.token)
  return Promise.reject(new Error('connection has no credential — reconnect the repository'))
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

/* ------------------------------------------------------------------ */
/* GitHub API client — thin fetch wrappers, no SDK                     */

const GH_API = 'https://api.github.com'

async function gh(token: string, path: string, accept = 'application/vnd.github+json'): Promise<Response> {
  return fetch(GH_API + path, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'doop-import',
    },
  })
}

async function ghJson<T>(token: string, path: string): Promise<T> {
  const res = await gh(token, path)
  if (!res.ok) {
    if (res.status === 401) throw new Error('GitHub rejected the token — is it valid and unexpired?')
    if (res.status === 403) throw new Error('the token has no access to this repository')
    if (res.status === 404) throw new Error('repository not found — check the name and the token’s repo access')
    throw new Error(`GitHub API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

/* ------------------------------------------------------------------ */
/* Connection CRUD                                                     */

export async function createConnection(input: {
  canvasId: string
  repo: string
  /** PAT mode; mutually exclusive with installationId */
  token?: string
  /** app mode — the caller must have verified the install handoff (pass) */
  installationId?: string
  branch?: string
  createdBy: string
}): Promise<GithubConnection> {
  const repo = input.repo
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/, '')
  if (!REPO_RE.test(repo)) throw new Error('repository must be "owner/name"')
  const token = input.token?.trim() || null
  const installationId = input.installationId?.trim() || null
  if (!token && !installationId) throw new Error('a fine-grained personal access token is required')

  /* App mode grants exactly the installation's repos — refuse anything the
     user did not select on GitHub's install screen. */
  if (installationId) {
    const repos = await githubApp.listInstallationRepos(installationId)
    if (!repos.some((r) => r.fullName.toLowerCase() === repo.toLowerCase()))
      throw new Error('that repository is not part of the GitHub App installation')
  }

  /* Verify reachability up front and pick up the default branch when none
     was given. Import is a one-time, code-only job: what lands on the canvas
     comes from the repository itself — live-site capture belongs to the
     website importer and stays out of this flow entirely. */
  const auth = await connectionAuth({ token, installationId })
  const meta = await ghJson<{ default_branch: string }>(auth, `/repos/${repo}`)
  const branch = input.branch?.trim() || meta.default_branch

  const row: GithubConnection = {
    id: nanoid(8),
    canvasId: input.canvasId,
    repo,
    branch,
    token,
    installationId,
    deployUrl: null,
    createdBy: input.createdBy,
    createdAt: Date.now(),
    lastSyncedAt: null,
  }
  await db.insert(githubConnections).values(row)
  return row
}

export function listConnections(canvasId: string): Promise<GithubConnection[]> {
  return db
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.canvasId, canvasId))
    .orderBy(desc(githubConnections.createdAt))
}

export async function getConnection(canvasId: string, id: string): Promise<GithubConnection | undefined> {
  const [row] = await db
    .select()
    .from(githubConnections)
    .where(and(eq(githubConnections.id, id), eq(githubConnections.canvasId, canvasId)))
  return row ?? undefined
}

export async function deleteConnection(canvasId: string, id: string): Promise<boolean> {
  const gone = await db
    .delete(githubConnections)
    .where(and(eq(githubConnections.id, id), eq(githubConnections.canvasId, canvasId)))
    .returning({ id: githubConnections.id })
  return gone.length > 0
}

/* ------------------------------------------------------------------ */
/* Screen detection — pure functions over the repo's file listing      */

export type ScreenKind = 'page' | 'story' | 'static'
export type PixelSource = 'static' | 'placeholder'

export interface RepoScreen {
  kind: ScreenKind
  /** rooted route for pages ("/pricing"), repo path for stories/static */
  route: string
  sourcePath: string
  title: string
  /** route has parameter segments — no concrete URL to capture */
  dynamic: boolean
  /** which lane can supply this screen's pixels */
  source: PixelSource
}

export interface RepoManifest {
  connection: GithubConnectionInfo
  framework: string | null
  screens: RepoScreen[]
  /** the git tree listing or the screen list was cut short */
  truncated: boolean
}

const MAX_SCREENS = 300
const PAGE_EXT = 'tsx|jsx|ts|js|mdx|md|vue|svelte|astro'

function titleFromRoute(route: string): string {
  const last = route.replace(/\/+$/, '').split('/').pop() ?? ''
  if (!last) return 'Home'
  return last
    .replace(/\.[a-z]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Framework from package.json dependencies; null when nothing recognizable. */
export function detectFramework(pkg: Record<string, unknown> | null): string | null {
  const deps = {
    ...((pkg?.dependencies as Record<string, string>) ?? {}),
    ...((pkg?.devDependencies as Record<string, string>) ?? {}),
  }
  if (deps.next) return 'next'
  if (deps['@sveltejs/kit']) return 'sveltekit'
  if (deps.astro) return 'astro'
  if (deps.nuxt || deps.nuxt3) return 'nuxt'
  if (deps['@remix-run/react']) return 'remix'
  if (deps['react-router-dom'] || deps.react) return 'react'
  if (deps.vue) return 'vue'
  return null
}

/** Next.js app-router path → route: drop route groups and parallel slots. */
function appRouterRoute(dir: string): string {
  const parts = dir.split('/').filter((p) => p && !/^\(.*\)$/.test(p) && !p.startsWith('@'))
  return '/' + parts.join('/')
}

/** Enumerate screens from file paths + package.json. Pure and conservative:
 *  convention-matched routes only — a repo this misses still gets the static
 *  and story sweeps below. */
export function detectScreens(paths: string[], pkg: Record<string, unknown> | null): RepoScreen[] {
  const framework = detectFramework(pkg)
  const screens: RepoScreen[] = []
  const seenRoutes = new Set<string>()

  const addPage = (route: string, sourcePath: string) => {
    const clean = route.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1') || '/'
    if (seenRoutes.has(clean)) return
    seenRoutes.add(clean)
    screens.push({
      kind: 'page',
      route: clean,
      sourcePath,
      title: titleFromRoute(clean),
      dynamic: /[[\]:]/.test(clean),
      source: 'placeholder',
    })
  }

  for (const p of paths) {
    if (p.includes('node_modules/')) continue

    /* Next.js app router: page.ext under any app/ dir (repo-root prefixes ok) */
    let m = p.match(new RegExp(`(?:^|/)app/((?:.*/)?)page\\.(?:${PAGE_EXT})$`))
    if (m && framework === 'next') {
      addPage(appRouterRoute(m[1]!), p)
      continue
    }
    /* Next.js pages router (also plain "pages/" conventions in other stacks) */
    m = p.match(new RegExp(`(?:^|/)pages/(.+)\\.(?:${PAGE_EXT})$`))
    if (m) {
      const rel = m[1]!
      if (rel.startsWith('api/') || /^_/.test(rel.split('/').pop() ?? '')) continue
      addPage('/' + rel.replace(/(?:^|\/)index$/, ''), p)
      continue
    }
    /* SvelteKit */
    m = p.match(/(?:^|\/)src\/routes\/((?:.*\/)?)\+page\.svelte$/)
    if (m) {
      addPage('/' + m[1]!.replace(/\/$/, ''), p)
      continue
    }
    /* Remix flat routes (dots become slashes; _index is the root) */
    m = p.match(new RegExp(`(?:^|/)app/routes/([^/]+)\\.(?:${PAGE_EXT})$`))
    if (m && framework === 'remix') {
      const rel = m[1]!
      if (rel.startsWith('_') && rel !== '_index') continue
      addPage(rel === '_index' ? '/' : '/' + rel.replace(/\./g, '/').replace(/\$/g, ':'), p)
      continue
    }
  }

  /* Storybook stories: curated screens regardless of routing */
  for (const p of paths) {
    if (p.includes('node_modules/')) continue
    const m = p.match(/(?:^|\/)([^/]+)\.stories\.(?:tsx|jsx|ts|js|mdx)$/)
    if (!m) continue
    screens.push({ kind: 'story', route: p, sourcePath: p, title: m[1]!, dynamic: false, source: 'placeholder' })
  }

  /* Plain HTML anywhere (marketing pages, committed dist/ output) */
  for (const p of paths) {
    if (p.includes('node_modules/') || p.includes('coverage/')) continue
    if (!/\.html?$/.test(p)) continue
    screens.push({
      kind: 'static',
      route: '/' + p,
      sourcePath: p,
      title: titleFromRoute(p),
      dynamic: false,
      source: 'static',
    })
  }

  return screens.slice(0, MAX_SCREENS)
}

/** Fetch the repo's file listing + package.json and build the manifest. */
export async function analyzeConnection(conn: GithubConnection): Promise<RepoManifest> {
  const tree = await ghJson<{ tree: { path: string; type: string }[]; truncated: boolean }>(
    await connectionAuth(conn),
    `/repos/${conn.repo}/git/trees/${encodeURIComponent(conn.branch)}?recursive=1`,
  )
  const paths = tree.tree.filter((e) => e.type === 'blob').map((e) => e.path)

  let pkg: Record<string, unknown> | null = null
  const pkgPath = paths.includes('package.json')
    ? 'package.json'
    : paths.find((p) => /^[^/]+\/package\.json$/.test(p) || /^(apps|packages)\/[^/]+\/package\.json$/.test(p))
  if (pkgPath) {
    try {
      pkg = JSON.parse(await fetchRepoFile(conn, pkgPath)) as Record<string, unknown>
    } catch {
      /* unreadable manifest — detection falls back to path conventions */
    }
  }

  const screens = detectScreens(paths, pkg)
  return {
    connection: connectionInfo(conn),
    framework: detectFramework(pkg),
    screens,
    truncated: tree.truncated || screens.length >= MAX_SCREENS,
  }
}

/** The repo's blob paths at the branch head — the reconstruction pass uses
 *  this to resolve a screen's import closure. */
export async function fetchTreePaths(conn: GithubConnection): Promise<string[]> {
  const tree = await ghJson<{ tree: { path: string; type: string }[] }>(
    await connectionAuth(conn),
    `/repos/${conn.repo}/git/trees/${encodeURIComponent(conn.branch)}?recursive=1`,
  )
  return tree.tree.filter((e) => e.type === 'blob').map((e) => e.path)
}

const MAX_FILE_BYTES = 1_500_000

export async function fetchRepoFile(conn: GithubConnection, path: string): Promise<string> {
  const res = await gh(
    await connectionAuth(conn),
    `/repos/${conn.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(conn.branch)}`,
    'application/vnd.github.raw+json',
  )
  if (!res.ok) throw new Error(`could not read ${path} (${res.status})`)
  const text = await res.text()
  if (text.length > MAX_FILE_BYTES) throw new Error(`${path} exceeds the 1.5 MB import limit`)
  return text
}

/* ------------------------------------------------------------------ */
/* Marker + frame HTML                                                 */

const GITHUB_META = 'doop-github-screen'
const PLACEHOLDER_META = 'doop-github-placeholder'

/** Same lockdown the importer and ingest stamp on their snapshots. */
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

export interface GithubMarker {
  connectionId: string
  kind: ScreenKind
  route: string
  sourcePath: string
}

/** Which connection/screen a frame came from, or undefined. The marker holds
 *  the connection's public id — the token never appears in frame HTML. */
export function githubFrameMarker(html: string): GithubMarker | undefined {
  const encoded = html.match(new RegExp(`<meta\\s+name=["']${GITHUB_META}["']\\s+content=["']([^"']+)["']`, 'i'))?.[1]
  if (!encoded) return undefined
  try {
    const [connectionId, kind, route, sourcePath] = decodeURIComponent(encoded).split('|')
    if (!connectionId || !kind || !route) return undefined
    return { connectionId, kind: kind as ScreenKind, route, sourcePath: sourcePath ?? '' }
  } catch {
    return undefined
  }
}

function markerMeta(connId: string, screen: { kind: ScreenKind; route: string; sourcePath: string }): string {
  const content = encodeURIComponent([connId, screen.kind, screen.route, screen.sourcePath].join('|'))
  return `<meta name="${GITHUB_META}" content="${content}">`
}

function injectHead(html: string, inject: string): string {
  const headMatch = html.match(/<head[^>]*>/i)
  let out = headMatch ? html.replace(headMatch[0], headMatch[0] + inject) : inject + html
  if (!/^\s*<!doctype/i.test(out)) out = '<!doctype html>\n' + out
  return out
}

/** Repo HTML → frame HTML: scrub, stamp marker + CSP, and point relative
 *  asset URLs at raw.githubusercontent.com (resolves for public repos; for
 *  private ones same-repo assets simply won't load — the markup still does). */
export function wrapRepoHtml(
  html: string,
  conn: Pick<GithubConnection, 'id' | 'repo' | 'branch'>,
  screen: { kind: ScreenKind; route: string; sourcePath: string },
): string {
  const dir = screen.sourcePath.includes('/') ? screen.sourcePath.slice(0, screen.sourcePath.lastIndexOf('/') + 1) : ''
  const base = `https://raw.githubusercontent.com/${conn.repo}/${conn.branch}/${dir}`
  const inject =
    markerMeta(conn.id, screen) +
    `<meta http-equiv="Content-Security-Policy" content="${SNAPSHOT_CSP}">` +
    `<base href="${base}">`
  return injectHead(sanitizeSnapshotHtml(html), inject)
}

/** A model-generated reconstruction → frame HTML: same scrub + marker as
 *  repo HTML, but no raw.githubusercontent base — the document is
 *  self-contained by instruction. */
export function wrapGeneratedHtml(
  html: string,
  conn: Pick<GithubConnection, 'id' | 'repo' | 'branch'>,
  screen: { kind: ScreenKind; route: string; sourcePath: string },
): string {
  const inject = markerMeta(conn.id, screen) + `<meta http-equiv="Content-Security-Policy" content="${SNAPSHOT_CSP}">`
  return injectHead(sanitizeSnapshotHtml(html), inject)
}

/** The stand-in frame for a screen that only exists as code. When the agent
 *  is about to reconstruct it, the copy says so ('sketching'); otherwise it
 *  is a plain outline, and a failed run gets an honest note. */
export function placeholderHtml(
  conn: Pick<GithubConnection, 'id' | 'repo'>,
  screen: { kind: ScreenKind; route: string; sourcePath: string; title: string },
  state: 'plain' | 'sketching' | 'failed' = 'plain',
): string {
  const reason =
    state === 'sketching'
      ? 'Doop is reading this screen’s source and sketching it here — give it a moment.'
      : state === 'failed'
        ? 'Doop tried to sketch this screen from its source but the run failed — delete the frame and re-import to retry.'
        : screen.kind === 'story'
          ? 'A Storybook story, imported as an outline — the repo holds its code.'
          : 'Imported as an outline — the repo holds this screen’s code.'
  /* people who drive their own agent over MCP get a ready-made prompt — that
     agent usually has the repo checked out, making it the best builder here */
  const byoPrompt =
    state === 'plain'
      ? `<p style="margin-top:14px">Using your own agent with this repo checked out? Try:</p>` +
        `<p style="margin-top:8px;font-family:ui-monospace,monospace;font-size:11.5px;background:#f7f7f8;border:1px solid #eee;border-radius:8px;padding:10px 12px;text-align:left">` +
        `“On my doop canvas, design the outline frames imported from ${escapeHtml(conn.repo)} — read each screen’s source (the frame lists its file path) and set_frame_html a faithful version.”</p>`
      : ''
  return (
    '<!doctype html>\n<html><head>' +
    markerMeta(conn.id, screen) +
    `<meta name="${PLACEHOLDER_META}" content="1">` +
    `<meta http-equiv="Content-Security-Policy" content="${SNAPSHOT_CSP}">` +
    '<style>*{margin:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;height:100vh;display:grid;place-items:center;background:repeating-linear-gradient(45deg,#fafafa,#fafafa 12px,#f4f4f5 12px,#f4f4f5 24px);color:#555}main{text-align:center;max-width:420px;padding:32px;background:#fff;border:1px dashed #ccc;border-radius:12px}h1{font-size:18px;margin-bottom:6px}code{font-size:12px;color:#888}p{font-size:13px;line-height:1.5;color:#777;margin-top:10px}</style>' +
    `</head><body><main><h1>${escapeHtml(screen.title)}</h1><code>${escapeHtml(screen.sourcePath || screen.route)}</code><p>${reason}</p>${byoPrompt}</main></body></html>`
  )
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ------------------------------------------------------------------ */
/* Import + resync                                                     */

const MAX_IMPORT_SCREENS = 40
const DEFAULT_W = 1280
const DEFAULT_H = 900

export interface GithubImportResult {
  frames: Frame[]
  failures: { route: string; error: string }[]
  /** outline frames awaiting the reconstruction pass (server-side only) */
  pending: { frameId: string; screen: RepoScreen }[]
}

/** A screen's identity across analyze → import → resync. */
function screenIdentity(s: { kind: string; route: string; sourcePath: string }): string {
  return `${s.kind}|${s.route}|${s.sourcePath}`
}

/** Resolve the client-echoed selection against a manifest the server just
 *  computed. The request body only ever picks WHICH manifest screens to
 *  import — kind, lane, path, and title all come from the manifest, so a
 *  crafted sourcePath can never read an arbitrary repo file into frame HTML
 *  that every canvas viewer can open. Unknown entries are reported, not
 *  imported. */
export function matchSelection(manifest: RepoScreen[], raw: unknown): { screens: RepoScreen[]; rejected: string[] } {
  if (!Array.isArray(raw)) throw new Error('screens must be an array')
  if (!raw.length) throw new Error('select at least one screen')
  if (raw.length > MAX_IMPORT_SCREENS) throw new Error(`an import is limited to ${MAX_IMPORT_SCREENS} screens`)
  const byIdentity = new Map(manifest.map((s) => [screenIdentity(s), s]))
  const screens: RepoScreen[] = []
  const rejected: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const { kind, route, sourcePath } = (item ?? {}) as Record<string, unknown>
    const identity = screenIdentity({
      kind: String(kind ?? ''),
      route: String(route ?? ''),
      sourcePath: String(sourcePath ?? ''),
    })
    if (seen.has(identity)) continue
    seen.add(identity)
    const screen = byIdentity.get(identity)
    if (screen) screens.push(screen)
    else rejected.push(String(route ?? sourcePath ?? 'unknown'))
  }
  return { screens, rejected }
}

/** Import the selected screens — a one-time, code-only job: repo HTML lands
 *  directly; screens that only exist as code land as outline frames, listed
 *  in `pending` so the caller can hand them to the reconstruction pass
 *  (githubRecon.ts) when a model is available — `sketch` says whether one
 *  is, which the outline copy reflects. Nothing here touches the live site —
 *  that is the website importer's territory. The manifest is recomputed and
 *  the selection resolved against it — see matchSelection. */
export async function importScreens(
  conn: GithubConnection,
  canvas: { id: string; frames: Frame[] },
  rawSelection: unknown,
  actor: Actor,
  options: { sketch?: boolean } = {},
): Promise<GithubImportResult> {
  const manifest = await analyzeConnection(conn)
  const { screens: selection, rejected } = matchSelection(manifest.screens, rawSelection)

  /* same grid the site importer uses: 3 columns to the right of everything */
  const rightmost = canvas.frames.reduce((right, f) => Math.max(right, f.x + f.width), 0)
  const startX = canvas.frames.length ? rightmost + 80 : 120
  const columns = 3
  let column = 0
  let y = 120
  let rowHeight = 0

  const frames: Frame[] = []
  const failures: { route: string; error: string }[] = rejected.map((route) => ({
    route,
    error: 'not in the repository manifest — re-run the screen scan',
  }))

  const place = (name: string, html: string, width: number, height: number): Frame | undefined => {
    const frame = actions.createFrame(
      canvas.id,
      { name: name.slice(0, 80), x: startX + column * (DEFAULT_W + 80), y, width, height, html },
      actor,
    )
    if (!frame) return undefined
    rowHeight = Math.max(rowHeight, height)
    column++
    if (column === columns) {
      column = 0
      y += rowHeight + 80
      rowHeight = 0
    }
    return frame
  }

  const pending: { frameId: string; screen: RepoScreen }[] = []
  for (const screen of selection) {
    try {
      let html: string
      const width = DEFAULT_W
      let height = DEFAULT_H
      const name = screen.title
      let outline = false
      if (screen.source === 'static') {
        html = wrapRepoHtml(await fetchRepoFile(conn, screen.sourcePath), conn, screen)
      } else {
        html = placeholderHtml(conn, screen, options.sketch ? 'sketching' : 'plain')
        height = 800
        outline = true
      }
      const frame = place(name, html, width, height)
      if (frame && outline && options.sketch) pending.push({ frameId: frame.id, screen })
      if (!frame) {
        failures.push({ route: screen.route, error: 'canvas not found' })
        continue
      }
      frames.push(frame)
    } catch (e) {
      /* the lane failed — keep the screen's place in the map */
      const frame = place(screen.title, placeholderHtml(conn, screen), DEFAULT_W, 800)
      if (frame) frames.push(frame)
      failures.push({ route: screen.route, error: e instanceof Error ? e.message : 'import failed' })
    }
  }

  db.update(githubConnections)
    .set({ lastSyncedAt: Date.now() })
    .where(eq(githubConnections.id, conn.id))
    .catch((err: unknown) => console.error('[github] lastSyncedAt write failed', err))

  return { frames, failures, pending }
}

export function isGithubPlaceholderHtml(html: string): boolean {
  return html.includes(`name="${PLACEHOLDER_META}"`)
}

/** Frames imported by a connection, for the import modal's per-repo count. */
export function importedFrameCount(canvas: { frames: Frame[] }, connectionId: string): number {
  return canvas.frames.filter((f) => githubFrameMarker(f.html)?.connectionId === connectionId).length
}
