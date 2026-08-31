import { pickModel } from './agentModel.ts'
import type { TurnBlock } from './openaiAgent.ts'
import { createAsset } from './assets.ts'
import * as actions from './actions.ts'
import {
  fetchRepoBinary,
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
const MODEL_MAX_TOKENS = 32_000
const MAX_REQUEST_ROUNDS = 2
const REVIEW_ROUNDS = 1
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
    root.replace(/pages\/$/, 'pages/') + '_document.tsx',
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
- Reproduce the ENTIRE page top to bottom — every section the source renders (hero, features, FAQ, footer, all of it). A truncated page is a failed reconstruction; declare the true height.
- No <script> tags, no external CSS or JS. Google Fonts via <link> are allowed when the source names a font (check _document/layout for font loading).
- Images: the repository's real assets are the right ones — when the tree contains the actual file (logos, illustrations, product screenshots), reference it as src="repo:path/from/tree" (e.g. src="repo:public/logos/ibm.svg") and it will be resolved to a served copy. Only when no real asset exists, use a solid-color or CSS-gradient stand-in with the right aspect ratio. Never invent external image URLs.
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
  const clean = paths.filter((p) => !p.includes('node_modules/') && !/\.(ico|woff2?|ttf|otf|mp4|webm)$/i.test(p))
  const near = dirOf(sourcePath)
  const score = (p: string) =>
    (p.startsWith(near) ? 4 : 0) +
    (/(theme|token|color|style|css|scss|tailwind|chakra)/i.test(p) ? 3 : 0) +
    (/\.(png|jpe?g|webp|svg|gif)$/i.test(p) && /(logo|brand|hero|screenshot|public|assets|images)/i.test(p) ? 2 : 0) +
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
  const height = Math.min(8000, Math.max(480, Number(html.match(/doop-height:\s*(\d+)/)?.[1]) || 900))
  return { html, height }
}

const DESIGN_SYSTEM_PROMPT = `You are Doop's design-system archaeologist. From the given repository files (theme/token modules, tailwind/framework config, global styles, app shell, package.json), distill the product's ACTUAL design system into a style guide for design agents.

Output ONLY markdown with these sections:
- **Palette** — every meaningful color as hex with its role (ground, ink, accent, success…), taken from the code, not invented.
- **Typography** — the real faces, weights and scale; include ready-to-paste Google Fonts <link> tags when the fonts are on Google Fonts.
- **Shape & space** — radii, spacing rhythm, shadows, border style.
- **Component idioms** — how buttons, cards, inputs and nav actually look (fills, radii, hover states) in a few crisp bullets.
- **CSS variables** — one ready-to-paste :root block encoding the above.
Rules the agents must follow verbatim belong here; keep it under 350 lines. No commentary outside the markdown.`

/** Distill the repo's design system into style-guide markdown. Reuses the
 *  same seeding logic as screen closures but aimed at the system files. */
export async function extractDesignSystem(
  conn: GithubConnection,
  paths: string[],
  model: NonNullable<Awaited<ReturnType<typeof pickModel>>>,
): Promise<string> {
  const seeds = [
    'package.json',
    ...paths.filter((p) => !p.includes('node_modules') && /(^|\/)tailwind\.config\.[jt]s$/.test(p)).slice(0, 1),
    ...paths.filter((p) => !p.includes('node_modules') && /(^|\/)(theme|tokens|colors)\.[jt]sx?$/i.test(p)).slice(0, 3),
    ...paths
      .filter((p) => !p.includes('node_modules') && /(^|\/)(globals?|app|main|index)\.(css|scss)$/.test(p))
      .slice(0, 3),
    ...paths.filter((p) => !p.includes('node_modules') && /(^|\/)_(document|app)\.[jt]sx$/.test(p)).slice(0, 2),
  ]
  const sections: string[] = []
  let budget = MAX_CLOSURE_BYTES
  for (const p of [...new Set(seeds)]) {
    if (budget <= 0) break
    try {
      let text = await fetchRepoFile(conn, p)
      if (text.length > budget) text = text.slice(0, budget)
      budget -= text.length
      sections.push(`===== ${p} =====\n${text}`)
    } catch {
      /* missing seed — the tree round below can recover it */
    }
  }
  const messages: Parameters<typeof model.run>[0]['messages'] = [
    {
      role: 'user',
      content:
        `Repository ${conn.repo}. File tree (request more files if the system lives elsewhere):\n` +
        `${treeExcerpt(paths, 'src/x')}\n\n${sections.join('\n\n')}`,
    },
  ]
  const pathSet = new Set(paths)
  let requestedBudget = MAX_REQUESTED_BYTES
  let result = await model.run({
    system: [{ text: DESIGN_SYSTEM_PROMPT, cache: true }],
    tools: [REQUEST_FILES_TOOL],
    messages,
    maxTokens: 16_000,
  })
  if (result.stop_reason === 'tool_use') {
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
      const parts: string[] = []
      for (const p of wanted) {
        if (requestedBudget <= 0) break
        try {
          let text = await fetchRepoFile(conn, p)
          if (text.length > requestedBudget) text = text.slice(0, requestedBudget)
          requestedBudget -= text.length
          parts.push(`===== ${p} =====\n${text}`)
        } catch {
          parts.push(`===== ${p} =====\n/* unreadable */`)
        }
      }
      results.push({
        type: 'tool_result' as const,
        tool_use_id: call.id,
        content: parts.join('\n\n') || 'none of those paths exist',
      })
    }
    messages.push({ role: 'user', content: results })
    result = await model.run({
      system: [{ text: DESIGN_SYSTEM_PROMPT, cache: true }],
      tools: [],
      messages,
      maxTokens: 16_000,
    })
  }
  const md = result.content
    .filter((b) => b.type === 'text' && 'text' in b)
    .map((b) => (b as { text: string }).text)
    .join('\n')
    .replace(/^```(?:markdown|md)?\s*|```\s*$/g, '')
    .trim()
  if (!md) throw new Error('the model returned no design system')
  return md
}

const REPO_REF_RE = /(["'(])repo:([^"')\s]+)(["')])/g
const MAX_TRANSPLANTED_ASSETS = 12
const TRANSPARENT_PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
/* same env read as server/auth.ts — asset URLs must be absolute inside
   sandboxed frame iframes */
const ORIGIN = process.env.BETTER_AUTH_URL || 'http://localhost:4300'

/** Transplant the repository's real image assets: every src="repo:<path>"
 *  the model emitted is fetched through the connection and re-hosted in
 *  doop's asset store, so private-repo logos and screenshots render for
 *  every viewer. Unresolvable refs collapse to a transparent pixel rather
 *  than a broken image. */
export async function resolveRepoAssets(conn: GithubConnection, html: string, pathSet: Set<string>): Promise<string> {
  const wanted = [...new Set([...html.matchAll(REPO_REF_RE)].map((m) => m[2]!))]
    .filter((p) => pathSet.has(p))
    .slice(0, MAX_TRANSPLANTED_ASSETS)
  const urls = new Map<string, string>()
  for (const p of wanted) {
    try {
      const asset = await createAsset(await fetchRepoBinary(conn, p), {
        canvasId: conn.canvasId,
        uploadedBy: 'Doop',
      })
      urls.set(p, `${ORIGIN}/a/${asset.id}.${asset.ext}`)
    } catch (err) {
      console.error(`[github-recon] asset ${p} failed`, err)
    }
  }
  return html.replace(REPO_REF_RE, (_full, pre, p, post) => pre + (urls.get(p) ?? TRANSPARENT_PX) + post)
}

/** Reconstruct the given outline frames in the background. Fire-and-forget
 *  from the import route — every failure lands in the frame itself (the
 *  outline flips to a 'failed' note) and in the log, never in the response. */
export function scheduleReconstructions(
  conn: GithubConnection,
  jobs: { frameId: string; screen: RepoScreen }[],
  requester: Actor,
  payerId: string,
  opts: { designSystem?: boolean } = {},
): void {
  if (!jobs.length && !opts.designSystem) return
  void (async () => {
    const model = await pickModel(payerId)
    if (!model) return /* no model — outlines stay, which the copy reflects */
    /* The sketching is the Doop Agent's work, and it should look like it:
       an agent actor gives it live presence, a task entry ("is working
       on…") on the board/feed, and frame edits attributed to Doop instead
       of the human who clicked Import. */
    const actor = actions.resolveActor({ name: 'Doop', kind: 'agent', owner: requester.name })
    const paths = await fetchTreePaths(conn)

    /* the design system first: it becomes a pinned canvas guideline every
       agent follows, and it grounds the sketches below */
    let designSystemMd = ''
    if (opts.designSystem) {
      try {
        actions.setAgentStatus(conn.canvasId, actor, `Reading ${conn.repo}’s design system — theme, tokens, type`)
        designSystemMd = await extractDesignSystem(conn, paths, model)
        const slug = `${conn.repo
          .split('/')
          .pop()!
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')}-design-system`
        actions.setGuideline(conn.canvasId, slug, designSystemMd, actor, undefined, `${conn.repo} design system`)
      } catch (err) {
        console.error(`[github-recon] design system extraction for ${conn.repo} failed`, err)
      }
    }

    const queue = jobs.slice(0, MAX_RECONSTRUCTIONS_PER_IMPORT)
    if (!queue.length) {
      actions.setAgentStatus(conn.canvasId, actor, '')
      return
    }
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
        const componentBrief =
          job.screen.kind === 'component' || job.screen.kind === 'story'
            ? `This is a COMPONENT, not a page: present it as an isolated library card — a quiet neutral backdrop, the component rendered at natural size, and its key variants/states side by side when the source defines them. Keep the card compact.\n\n`
            : ''
        const systemContext = designSystemMd
          ? `The product's design system, distilled from this repo (follow it exactly):\n${designSystemMd}\n\n`
          : ''
        const messages: Parameters<NonNullable<typeof model>['run']>[0]['messages'] = [
          {
            role: 'user',
            content:
              `Screen: ${job.screen.title} (route ${job.screen.route}) from ${conn.repo}.\n\n` +
              componentBrief +
              systemContext +
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
        const withAssets = await resolveRepoAssets(conn, html, pathSet)
        let frame = actions.updateFrame(
          job.frameId,
          { html: wrapGeneratedHtml(withAssets, conn, job.screen), height },
          actor,
        )

        /* Doop's own doctrine: never ship without looking. Render the draft,
           show the model its own output, and let it fix what is visibly
           wrong — the single biggest quality lever short of executing the
           app. Draft stays on the canvas while the fix round runs. */
        for (let round = 0; frame && round < REVIEW_ROUNDS; round++) {
          try {
            const { renderFrame } = await import('./screenshot.ts')
            const shot = await renderFrame(frame, frame.height > 4000 ? 0.7 : 1, {
              type: 'jpeg',
              quality: 72,
              maxHeight: 8000,
            })
            messages.push({ role: 'assistant', content: (result?.content ?? []) as TurnBlock[] })
            messages.push({
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/jpeg', data: shot.toString('base64') },
                },
                {
                  type: 'text',
                  text: 'This is YOUR reconstruction, rendered. Judge it against the source you read like a senior designer: wrong palette or fonts, broken or overlapping layout, clipped or missing sections, dead empty areas, images that did not resolve. Then output the corrected COMPLETE document — same rules, full page, ending with the height comment. If it is genuinely faithful already, output the document unchanged.',
                },
              ],
            })
            const fixed = await model!.run({
              system: [{ text: SYSTEM_PROMPT, cache: true }],
              tools: [],
              messages,
              maxTokens: MODEL_MAX_TOKENS,
            })
            result = fixed
            const redo = extractHtml(fixed.content as { type: string; text?: string }[])
            const redoAssets = await resolveRepoAssets(conn, redo.html, pathSet)
            frame = actions.updateFrame(
              job.frameId,
              { html: wrapGeneratedHtml(redoAssets, conn, job.screen), height: redo.height },
              actor,
            )
          } catch (err) {
            console.error(`[github-recon] review round for ${job.screen.route} failed — keeping the draft`, err)
            break
          }
        }
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
