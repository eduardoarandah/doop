import { pickModel } from './agentModel.ts'
import * as actions from './actions.ts'
import {
  fetchRepoFile,
  fetchTreePaths,
  placeholderHtml,
  wrapGeneratedHtml,
  type GithubConnection,
  type RepoScreen,
} from './github.ts'
import type { Actor } from '../shared/types.ts'

/**
 * Reconstruction: the agent-designed lane of the GitHub import. A screen that
 * only exists as code (a Next page, a story) is imported as an outline frame
 * immediately; this pass then reads the screen's source closure from the
 * repo, has the model rewrite it into ONE self-contained HTML document, and
 * morphs it into the outline in place — people watching the canvas see the
 * sketch fill in. Runs only when a model is available (the requester's
 * connected account, else the server's agent tier); with no model the
 * outline simply stays, which is the honest fallback.
 *
 * This is still the one-time, code-only contract: everything the model sees
 * comes from the repository. Nothing here touches the live site.
 */

/** Bounded source closure: the screen's file, its resolvable local imports
 *  (depth-first, small), and the styling context that shapes every screen. */
const MAX_CLOSURE_FILES = 10
const MAX_CLOSURE_BYTES = 80_000
const MAX_RECONSTRUCTIONS_PER_IMPORT = 12
const RECON_CONCURRENCY = 2
const MODEL_MAX_TOKENS = 20_000
const MAX_REQUEST_ROUNDS = 2
const MAX_REQUESTED_FILES = 15
const MAX_REQUESTED_BYTES = 100_000
const MAX_TREE_LINES = 400

const RESOLVE_EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.css', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']

function dirOf(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

/** Resolve one import specifier against the repo tree, or undefined. `@/x`
 *  and `~/x` map to the conventional src root nearest the importing file. */
export function resolveImport(spec: string, fromPath: string, paths: Set<string>): string | undefined {
  let base: string | undefined
  if (spec.startsWith('./') || spec.startsWith('../')) {
    base = normalize(`${dirOf(fromPath)}/${spec}`)
  } else if (spec.startsWith('@/') || spec.startsWith('~/')) {
    /* alias roots to try, closest to the importing file first */
    const root = fromPath.includes('/src/') ? fromPath.slice(0, fromPath.indexOf('/src/') + 5) : 'src/'
    for (const prefix of [root, 'src/', '']) {
      const candidate = resolveImport('./' + spec.slice(2), prefix + 'x', paths)
      if (candidate) return candidate
    }
    return undefined
  } else {
    return undefined /* a package — the model knows the ecosystem */
  }
  for (const ext of RESOLVE_EXTS) {
    if (paths.has(base + ext)) return base + ext
  }
  return undefined
}

const IMPORT_RE = /import\s[^'"]*?['"]([^'"]+)['"]|from\s+['"]([^'"]+)['"]/g

/** Collect the screen's bounded source closure as prompt-ready sections. */
export async function collectClosure(
  conn: GithubConnection,
  screen: RepoScreen,
  paths: string[],
): Promise<{ path: string; text: string }[]> {
  const pathSet = new Set(paths)
  const files: { path: string; text: string }[] = []
  let budget = MAX_CLOSURE_BYTES
  const queue: string[] = [screen.sourcePath]
  const seen = new Set<string>(queue)

  /* styling and copy context first-class: the app shell, global styles,
     theme modules and the page's locale files shape what the screen ACTUALLY
     looks and reads like — without them the model invents a brand */
  const root = screen.sourcePath.includes('/app/')
    ? screen.sourcePath.slice(0, screen.sourcePath.indexOf('/app/') + 5)
    : screen.sourcePath.includes('/pages/')
      ? screen.sourcePath.slice(0, screen.sourcePath.indexOf('/pages/') + 7)
      : ''
  const slug = (screen.route.split('/').filter(Boolean).pop() ?? 'index').toLowerCase()
  const clean = (p: string) => !p.includes('node_modules')
  for (const context of [
    root + 'layout.tsx',
    root.replace(/pages\/$/, 'pages/') + '_app.tsx',
    ...paths.filter((p) => clean(p) && /(^|\/)(globals?|app|main|index)\.css$/.test(p)).slice(0, 2),
    ...paths.filter((p) => clean(p) && /(^|\/)tailwind\.config\.[jt]s$/.test(p)).slice(0, 1),
    ...paths.filter((p) => clean(p) && /(^|\/)(theme|tokens|colors)\.[jt]sx?$/i.test(p)).slice(0, 2),
    /* i18n: the page's own locale file first, else the default English pack */
    ...paths
      .filter(
        (p) =>
          clean(p) &&
          /(locales?|i18n|translations?|lang)\//i.test(p) &&
          /\.(json|[jt]s)$/.test(p) &&
          (p.toLowerCase().includes(slug) || /(^|\/|\.)en(-us)?(\.|\/)/i.test(p)),
      )
      .slice(0, 3),
  ]) {
    if (pathSet.has(context) && !seen.has(context)) {
      seen.add(context)
      queue.push(context)
    }
  }

  while (queue.length && files.length < MAX_CLOSURE_FILES && budget > 0) {
    const path = queue.shift()!
    let text: string
    try {
      text = await fetchRepoFile(conn, path)
    } catch {
      continue /* deleted/oversized — the model works from what resolves */
    }
    if (text.length > budget) text = text.slice(0, budget) + '\n/* …truncated… */'
    budget -= text.length
    files.push({ path, text })
    for (const match of text.matchAll(IMPORT_RE)) {
      const resolved = resolveImport(match[1] ?? match[2] ?? '', path, pathSet)
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved)
        queue.push(resolved)
      }
    }
  }
  return files
}

const SYSTEM_PROMPT = `You are Doop's senior product designer, reconstructing ONE screen of a product from its repository. You receive the screen's source file with some of its imports, plus a listing of the repository's file tree — and a request_files tool to read any other files.

INVESTIGATE BEFORE YOU DESIGN. Fidelity to the real product is the whole job, and the two ways reconstructions go wrong are inventing the brand and inventing the copy. Before writing any HTML, make sure you have seen:
- HOW STYLING IS DONE in this repo: the theme/design-token modules, global stylesheets, tailwind/chakra/styled-components config — whatever defines the real colors, fonts, radii and spacing. If the provided files don't show the brand's actual palette and type, request the files that do.
- WHERE THE COPY LIVES: if the page renders translation keys or imports content modules, request the locale/content files and use the REAL strings. Never write your own marketing copy when the repository contains the actual words.
- Shared layout components (nav, footer) the page renders, so the chrome matches the product.
Use request_files for this — batch what you need; you have a couple of rounds.

Then produce a single COMPLETE, self-contained HTML document that faithfully renders this screen:
- Translate the component structure and its styling into real inline <style> CSS, using the palette, fonts and tokens you found — not defaults, not guesses.
- The document is exactly 1280px wide. Choose the natural height for the content and declare it as the LAST line of your output, an HTML comment: <!-- doop-height: 900 -->
- Dynamic data (user names, table rows, dates) gets realistic, specific placeholder values — never lorem ipsum or "Item 1". Static marketing copy comes from the source, verbatim.
- No <script> tags, no external CSS or JS. Google Fonts via <link> are allowed when the source names a font.
- Images: use a solid-color or CSS-gradient stand-in with the right aspect ratio; never invent external image URLs.
- Start with <!doctype html>. Output ONLY the HTML document (plus the final height comment) — no markdown fences, no commentary.`

const REQUEST_FILES_TOOL = {
  name: 'request_files',
  description:
    'Read files from the repository by path (batch several at once). Use this to inspect theme/design-token modules, global styles, locale/content files and shared components before designing.',
  input_schema: {
    type: 'object' as const,
    properties: {
      paths: { type: 'array', items: { type: 'string' }, description: 'Repository file paths from the tree listing' },
    },
    required: ['paths'],
  },
}

/** The tree excerpt the model investigates from: design- and content-relevant
 *  paths first, then the rest, capped. */
export function treeExcerpt(paths: string[], sourcePath: string): string {
  const clean = paths.filter((p) => !p.includes('node_modules/') && !/\.(png|jpe?g|webp|ico|woff2?|ttf|mp4)$/i.test(p))
  const near = dirOf(sourcePath)
  const score = (p: string) =>
    (p.startsWith(near) ? 4 : 0) +
    (/(theme|token|color|style|css|scss|tailwind|chakra)/i.test(p) ? 3 : 0) +
    (/(locales?|i18n|translations?|content|copy)/i.test(p) ? 3 : 0) +
    (/(component|layout|common|shared|ui)/i.test(p) ? 1 : 0)
  return clean
    .sort((a, b) => score(b) - score(a))
    .slice(0, MAX_TREE_LINES)
    .sort()
    .join('\n')
}

export function extractHtml(blocks: { type: string; text?: string }[]): { html: string; height: number } {
  const text = blocks
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n')
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/)
  let html = (fenced ? fenced[1]! : text).trim()
  const start = html.search(/<!doctype/i)
  if (start === -1) throw new Error('the model returned no HTML document')
  html = html.slice(start)
  const height = Math.min(3000, Math.max(480, Number(html.match(/doop-height:\s*(\d+)/)?.[1]) || 900))
  return { html, height }
}

/** Reconstruct the given outline frames in the background. Fire-and-forget
 *  from the import route — every failure lands in the frame itself (the
 *  outline flips to a 'failed' note) and in the log, never in the response. */
export function scheduleReconstructions(
  conn: GithubConnection,
  jobs: { frameId: string; screen: RepoScreen }[],
  requester: Actor,
  payerId: string,
): void {
  if (!jobs.length) return
  void (async () => {
    const model = await pickModel(payerId)
    if (!model) return /* no model — outlines stay, which the copy reflects */
    /* The sketching is the Doop Agent's work, and it should look like it:
       an agent actor gives it live presence, a task entry ("is working
       on…") on the board/feed, and frame edits attributed to Doop instead
       of the human who clicked Import. */
    const actor = actions.resolveActor({ name: 'Doop', kind: 'agent', owner: requester.name })
    const paths = await fetchTreePaths(conn)
    const queue = jobs.slice(0, MAX_RECONSTRUCTIONS_PER_IMPORT)
    const plural = queue.length === 1 ? 'screen' : 'screens'
    actions.setAgentStatus(
      conn.canvasId,
      actor,
      `Sketching ${queue.length} ${plural} from ${conn.repo} — reading source, designing frames`,
    )
    console.log(`[github-recon] ${queue.length} screen(s) from ${conn.repo} on ${model.label}`)

    /* a billing/auth failure is account-wide — one screen proving it is
       enough; the rest flip to the actionable 'failed' card without another
       model call each */
    const failedCard = (job: { frameId: string; screen: RepoScreen }) =>
      placeholderHtml(conn, job.screen, 'failed', { canvasId: conn.canvasId, frameId: job.frameId })
    let accountDead = false
    const isAccountError = (err: unknown) =>
      err instanceof Error && /credit|billing|quota|api key|unauthorized|401|403/i.test(err.message)

    async function runOne(job: { frameId: string; screen: RepoScreen }) {
      if (accountDead) {
        actions.updateFrame(job.frameId, { html: failedCard(job) }, actor)
        return
      }
      try {
        const closure = await collectClosure(conn, job.screen, paths)
        if (!closure.length) throw new Error('no readable source')
        const source = closure.map((f) => `===== ${f.path} =====\n${f.text}`).join('\n\n')
        const messages: Parameters<NonNullable<typeof model>['run']>[0]['messages'] = [
          {
            role: 'user',
            content:
              `Screen: ${job.screen.title} (route ${job.screen.route}) from ${conn.repo}.\n\n` +
              `Repository file tree (investigate with request_files):\n${treeExcerpt(paths, job.screen.sourcePath)}\n\n${source}`,
          },
        ]
        /* the investigation loop: the model reads the tree and pulls the
           theme/locale/component files it needs before designing */
        const pathSet = new Set(paths)
        let requestedBudget = MAX_REQUESTED_BYTES
        let result = null as Awaited<ReturnType<NonNullable<typeof model>['run']>> | null
        for (let round = 0; round <= MAX_REQUEST_ROUNDS; round++) {
          result = await model!.run({
            system: [{ text: SYSTEM_PROMPT, cache: true }],
            tools: round < MAX_REQUEST_ROUNDS ? [REQUEST_FILES_TOOL] : [],
            messages,
            maxTokens: MODEL_MAX_TOKENS,
          })
          if (result.stop_reason !== 'tool_use') break
          const calls = result.content.filter((b) => b.type === 'tool_use')
          messages.push({ role: 'assistant', content: result.content })
          const results = []
          for (const call of calls) {
            const wanted = (
              Array.isArray((call.input as { paths?: unknown })?.paths)
                ? ((call.input as { paths: unknown[] }).paths as unknown[])
                : []
            )
              .map(String)
              .filter((p) => pathSet.has(p))
              .slice(0, MAX_REQUESTED_FILES)
            const sections: string[] = []
            for (const p of wanted) {
              if (requestedBudget <= 0) break
              try {
                let text = await fetchRepoFile(conn, p)
                if (text.length > requestedBudget) text = text.slice(0, requestedBudget) + '\n/* …truncated… */'
                requestedBudget -= text.length
                sections.push(`===== ${p} =====\n${text}`)
              } catch {
                sections.push(`===== ${p} =====\n/* unreadable */`)
              }
            }
            results.push({
              type: 'tool_result' as const,
              tool_use_id: call.id,
              content: sections.join('\n\n') || 'none of those paths exist in the tree',
            })
          }
          messages.push({ role: 'user', content: results })
        }
        const { html, height } = extractHtml((result?.content ?? []) as { type: string; text?: string }[])
        actions.updateFrame(job.frameId, { html: wrapGeneratedHtml(html, conn, job.screen), height }, actor)
      } catch (err) {
        console.error(`[github-recon] ${job.screen.route} failed`, err)
        if (isAccountError(err)) accountDead = true
        actions.updateFrame(job.frameId, { html: failedCard(job) }, actor)
      }
    }

    /* small worker pool: steady progress on the canvas without hammering
       the model or the GitHub API */
    /* a model turn can outlast the presence TTL — keep Doop visibly in the
       room for as long as the pass is actually alive */
    const heartbeat = setInterval(() => actions.heartbeatAgent(conn.canvasId, actor), 15_000)
    try {
      const workers = Array.from({ length: Math.min(RECON_CONCURRENCY, queue.length) }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) await runOne(job)
      })
      await Promise.all(workers)
    } finally {
      clearInterval(heartbeat)
      actions.setAgentStatus(conn.canvasId, actor, '')
    }
    console.log(`[github-recon] ${conn.repo} done`)
  })().catch((err) => console.error('[github-recon] pass failed', err))
}
