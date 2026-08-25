import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { roleByAgentName } from '../../shared/agents'

/* This modal is about MCP agents only. Running the built-in Doop Agent on your
   own ChatGPT subscription is an account-level setting and lives in /settings. */

export function ConnectModal({ canvasId, onClose }: { canvasId: string; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Connect an AI agent</h2>
        <p className="lede">
          Any MCP-capable AI can design on this canvas. The endpoint is OAuth-protected: after adding it, trigger the
          sign-in from your client — in Claude Code type <code>/mcp</code>, pick <strong>doop</strong> and authenticate;
          a browser window opens to approve the connection. The agent then works <em>as yours</em>, and its tasks are
          attributed to you.
        </p>

        <ConnectBody canvasId={canvasId} />

        <div className="close-row">
          <AgentArrival />
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

/** The connect instructions, shared by the connect modal and the free-tier
 *  wall: endpoint, per-client commands, and a starter prompt. */
export function ConnectBody({ canvasId }: { canvasId: string }) {
  const mcpUrl = `${location.origin}/mcp`

  const claudeCmd = `claude mcp add --transport http doop "${mcpUrl}"`
  const codexCmd = `codex mcp add doop --url ${mcpUrl}`
  const jsonConfig = JSON.stringify({ mcpServers: { doop: { type: 'http', url: mcpUrl } } }, null, 2)
  /* Deliberately thin: the MCP server ships its own INSTRUCTIONS on connect and the
     rest lives behind get_guide. The only thing this prompt knows that they don't is
     which canvas the human is looking at. */
  const prompt = `Work on Doop canvas ${canvasId}. Start with get_guide({ topic: "doop-instructions" }) and follow it.`

  return (
    <>
      <h3>Claude Code</h3>
      <CodeBlock text={claudeCmd} />

      <h3>Codex</h3>
      <CodeBlock text={codexCmd} />

      <h3>Any other MCP client (streamable HTTP)</h3>
      <CodeBlock text={jsonConfig} />

      <h3>Suggested prompt for the agent</h3>
      <CodeBlock text={prompt} />
    </>
  )
}

/** Live connection status: flips the moment an outside (non-resident) agent
 *  joins this canvas's presence, so nobody is left wondering whether the
 *  OAuth dance actually worked. */
export function AgentArrival() {
  const presences = useStore((s) => s.presences)
  const arrived = useMemo(
    () => Object.values(presences).find((p) => p.kind === 'agent' && !roleByAgentName(p.name)),
    [presences],
  )
  return arrived ? (
    <span className="agent-arrival ok">✓ {arrived.name} is here — it worked</span>
  ) : (
    <span className="agent-arrival">
      <span className="arrival-dot" /> listening for your agent…
    </span>
  )
}

export function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="code-block">
      {text}
      <button
        className="copy"
        onClick={() => {
          navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? '✓' : 'copy'}
      </button>
    </div>
  )
}
