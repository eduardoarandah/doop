/** Frames imported through a GitHub connection carry a marker meta stamped
 *  into their HTML (server/github.ts) — presence is the whole client signal,
 *  same pattern as design-sync frames. Placeholders carry a second meta: a
 *  screen the repo knows about but no lane could capture yet. */
const GITHUB_MARKER = 'name="doop-github-screen"'
const PLACEHOLDER_MARKER = 'name="doop-github-placeholder"'

export function isGithubFrame(html: string): boolean {
  return html.includes(GITHUB_MARKER)
}

export function isGithubPlaceholder(html: string): boolean {
  return html.includes(PLACEHOLDER_MARKER)
}
