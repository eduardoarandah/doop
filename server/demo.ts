import * as actions from './actions.ts'

/**
 * The "Doop" demo agent: a scripted replay that streams a pre-authored
 * welcome frame through the SAME machinery real agents use (status → task,
 * presence, typewriter reveal, activity feed). No LLM involved — it's the
 * product demoing itself on a new user's first canvas.
 *
 * Trigger: markPending() at signup-canvas creation; maybePlay() on the
 * owner's first WebSocket join, so the show starts with an audience.
 */

const pending = new Set<string>() // canvasIds waiting for their first visitor

export function markPending(canvasId: string) {
  pending.add(canvasId)
}

export function maybePlay(canvasId: string) {
  if (!pending.delete(canvasId)) return
  play(canvasId).catch((err) => console.error('[demo] failed', err))
}

const WELCOME_HTML = `<!doctype html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600&display=swap');
  * { margin: 0; box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    background: #efece4;
    color: #1c1a15;
    height: 100vh;
    padding: 48px 52px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .eyebrow {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: .28em;
    text-transform: uppercase;
    color: #c23a25;
    margin-bottom: 18px;
  }
  h1 { font-size: 40px; line-height: 1.08; font-weight: 400; max-width: 12em; }
  h1 em { font-style: italic; color: #e5533c; }
  .lede { margin-top: 16px; max-width: 36em; line-height: 1.55; font-size: 15px; color: #5c5749; }
  .steps { margin-top: 28px; display: flex; flex-direction: column; gap: 12px; }
  .step { display: flex; gap: 14px; align-items: baseline; }
  .n {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: #efece4;
    background: #1c1a15;
    border-radius: 999px;
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    flex: none;
  }
  .step p { font-size: 14.5px; line-height: 1.5; color: #333026; }
  .step code {
    font-family: ui-monospace, monospace;
    font-size: 12.5px;
    background: #e7e3d8;
    padding: 2px 7px;
    border-radius: 5px;
    white-space: nowrap;
  }
  /* exact replica of the app's topbar "✦ Connect AI" button (.btn.primary),
     so the step points at something that looks like what they'll click */
  .btn-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: 'Archivo', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    background: #e5533c;
    border: 1px solid #c23a25;
    color: #fff;
    padding: 8px 14px;
    border-radius: 9px;
    box-shadow: 2px 2px 0 #c23a25;
    white-space: nowrap;
    margin: 0 6px 0 3px;
  }
  .foot {
    margin-top: auto;
    padding-top: 24px;
    border-top: 1px solid #d9d4c5;
    font-size: 13px;
    color: #98927f;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .sig { font-style: italic; color: #5c5749; }
</style>
</head>
<body>
  <div class="eyebrow">Designed live · by an agent</div>
  <h1>You just watched an <em>agent</em> design this frame.</h1>
  <p class="lede">
    Every character streamed in through the same door your own AI will use: an MCP tool call,
    revealed live to everyone on the canvas — with its status in the strip below, a task in the
    panel on the right, and a line in the activity feed.
  </p>
  <div class="steps">
    <div class="step"><span class="n">1</span><p>Hit <span class="btn-chip">✦ Connect AI</span> in the top bar and copy the command for your agent.</p></div>
    <div class="step"><span class="n">2</span><p>Approve the connection in the browser popup — your agent then works <em>as you</em>.</p></div>
    <div class="step"><span class="n">3</span><p>Ask it to design something. Watch this canvas while it works.</p></div>
  </div>
  <div class="foot">
    <span>Reply to any task with ↩ — agents pick your feedback up mid-flight.</span>
    <span class="sig">— Doop</span>
  </div>
</body>
</html>`

const CHUNK_SIZE = 350
const CHUNK_MS = 450

async function play(canvasId: string) {
  const actor = actions.resolveActor({ name: 'Doop', kind: 'agent' })
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  await sleep(1500) // let the room render before the show starts
  actions.setAgentStatus(canvasId, actor, 'Sketching you a welcome…')

  await sleep(700)
  const frame = actions.createFrame(
    canvasId,
    { name: 'Welcome to Doop', x: 120, y: 120, width: 760, height: 560, html: '', demo: true },
    actor,
  )
  if (!frame) return

  for (let i = 0; i < WELCOME_HTML.length; i += CHUNK_SIZE) {
    const done = i + CHUNK_SIZE >= WELCOME_HTML.length
    actions.appendFrameHtml(frame.id, WELCOME_HTML.slice(i, i + CHUNK_SIZE), actor, { start: i === 0, done })
    await sleep(CHUNK_MS)
  }

  /* wait for the reveal to catch up (~500 chars/s) before signing off */
  await sleep(Math.min(20_000, WELCOME_HTML.length * 2 + 3000))
  actions.setAgentStatus(canvasId, actor, 'Done — connect your own agent next')
  await sleep(6000)
  actions.setAgentStatus(canvasId, actor, '') // clear: completes the task, presence expires on its own
}
