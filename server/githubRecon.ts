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
const MAX_CLOSURE_BYTES = 60_000
const MAX_RECONSTRUCTIONS_PER_IMPORT = 12
const RECON_CONCURRENCY = 2
const MODEL_MAX_TOKENS = 20_000

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

  /* styling context first-class: the app shell and global styles shape every
     screen, so include them whenever they exist near the page's root */
  const root = screen.sourcePath.includes('/app/')
    ? screen.sourcePath.slice(0, screen.sourcePath.indexOf('/app/') + 5)
    : screen.sourcePath.includes('/pages/')
      ? screen.sourcePath.slice(0, screen.sourcePath.indexOf('/pages/') + 7)
      : ''
  for (const context of [
    root + 'layout.tsx',
    root.replace(/pages\/$/, 'pages/') + '_app.tsx',
    ...paths.filter((p) => /(^|\/)(globals?|app|main|index)\.css$/.test(p) && !p.includes('node_modules')).slice(0, 2),
    ...paths.filter((p) => /(^|\/)tailwind\.config\.[jt]s$/.test(p)).slice(0, 1),
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

const SYSTEM_PROMPT = `You are Doop's senior product designer. You receive the source code of ONE screen from a product's repository (the screen's file, some of its imported components, and global styling context). Rewrite it as a single COMPLETE, self-contained HTML document that faithfully renders this screen.

Rules:
- Interpret the component structure and its styling (Tailwind utility classes, CSS modules, styled components) into real inline <style> CSS. Match the product's actual look — colors, spacing, radii, type — as closely as the source allows.
- The document is exactly 1280px wide. Choose the natural height for the content and declare it as the LAST line of your output, an HTML comment: <!-- doop-height: 900 -->
- Replace dynamic data with realistic, specific placeholder content (plausible names, numbers, dates — never lorem ipsum or "Item 1").
- No <script> tags, no external CSS or JS. Google Fonts via <link> are allowed when the source names a font.
- Images: use a solid-color or CSS-gradient stand-in with the right aspect ratio; never invent external image URLs.
- Start with <!doctype html>. Output ONLY the HTML document (plus the final height comment) — no markdown fences, no commentary.`

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
  actor: Actor,
  payerId: string,
): void {
  if (!jobs.length) return
  void (async () => {
    const model = await pickModel(payerId)
    if (!model) return /* no model — outlines stay, which the copy reflects */
    const paths = await fetchTreePaths(conn)
    const queue = jobs.slice(0, MAX_RECONSTRUCTIONS_PER_IMPORT)
    console.log(`[github-recon] ${queue.length} screen(s) from ${conn.repo} on ${model.label}`)

    async function runOne(job: { frameId: string; screen: RepoScreen }) {
      try {
        const closure = await collectClosure(conn, job.screen, paths)
        if (!closure.length) throw new Error('no readable source')
        const source = closure.map((f) => `===== ${f.path} =====\n${f.text}`).join('\n\n')
        const result = await model!.run({
          system: [{ text: SYSTEM_PROMPT, cache: true }],
          tools: [],
          messages: [
            {
              role: 'user',
              content: `Screen: ${job.screen.title} (route ${job.screen.route}) from ${conn.repo}.\n\n${source}`,
            },
          ],
          maxTokens: MODEL_MAX_TOKENS,
        })
        const { html, height } = extractHtml(result.content as { type: string; text?: string }[])
        actions.updateFrame(job.frameId, { html: wrapGeneratedHtml(html, conn, job.screen), height }, actor)
      } catch (err) {
        console.error(`[github-recon] ${job.screen.route} failed`, err)
        actions.updateFrame(job.frameId, { html: placeholderHtml(conn, job.screen, 'failed') }, actor)
      }
    }

    /* small worker pool: steady progress on the canvas without hammering
       the model or the GitHub API */
    const workers = Array.from({ length: Math.min(RECON_CONCURRENCY, queue.length) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await runOne(job)
    })
    await Promise.all(workers)
    console.log(`[github-recon] ${conn.repo} done`)
  })().catch((err) => console.error('[github-recon] pass failed', err))
}
