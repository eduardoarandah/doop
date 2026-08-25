import { useEffect, useState } from 'react'
import type { CanvasMeta } from '../../shared/types'
import { colorFor } from '../../shared/types'
import { api } from '../lib/api'
import { authClient } from '../lib/auth'
import { navigate, Logo } from '../App'
import { timeAgo } from '../lib/time'
import { CodeBlock } from '../components/ConnectModal'
import { AgentIcon } from '../components/AgentIcon'
import { posthog } from '../lib/posthog'
import { useMe } from '../lib/me'

export function Home() {
  const [canvases, setCanvases] = useState<CanvasMeta[] | null>(null)
  const { data: session } = authClient.useSession()
  const me = useMe(session?.user.id)

  useEffect(() => {
    api.listCanvases().then(setCanvases).catch(console.error)
  }, [])

  async function createCanvas() {
    const canvas = await api.createCanvas('Untitled canvas')
    posthog.capture('canvas_created')
    navigate(`/c/${canvas.id}`)
  }

  const hour = new Date().getHours()
  const daypart = hour < 5 ? 'Up late' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const first = session?.user.name?.split(' ')[0]
  const frameTotal = canvases?.reduce((n, c) => n + c.frameCount, 0) ?? 0

  /* every agent that has worked on these canvases, aggregated across them */
  const agentMap = new Map<string, { name: string; owner?: string; lastAt: number; canvases: number }>()
  for (const c of canvases ?? []) {
    for (const a of c.agents ?? []) {
      const e = agentMap.get(a.name)
      if (e) {
        e.canvases += 1
        e.lastAt = Math.max(e.lastAt, a.lastAt ?? 0)
        if (!e.owner) e.owner = a.owner
      } else {
        agentMap.set(a.name, { name: a.name, owner: a.owner, lastAt: a.lastAt ?? 0, canvases: 1 })
      }
    }
  }
  const agents = [...agentMap.values()].sort((x, y) => y.lastAt - x.lastAt)

  return (
    <div className="home">
      <div className="home-inner">
        <div className="home-mark">
          <Logo /> Doop
          <span className="spacer" />
          {session && (
            <span className="home-account">
              {me?.admin && (
                <button className="btn ghost" onClick={() => navigate('/admin')}>
                  Admin
                </button>
              )}
              {session.user.name}
              <button className="btn ghost" onClick={() => navigate('/settings')}>
                Settings
              </button>
              <button
                className="btn ghost"
                onClick={() =>
                  authClient.signOut().then(() => {
                    posthog.reset()
                    location.reload()
                  })
                }
              >
                Sign out
              </button>
            </span>
          )}
        </div>

        <h1>
          {daypart}, {first}
          <em>.</em>
        </h1>
        <p className="sub">
          {canvases === null
            ? '…'
            : canvases.length === 0
              ? 'No canvases yet — start one below.'
              : `${canvases.length} ${canvases.length === 1 ? 'canvas' : 'canvases'} · ${frameTotal} ${frameTotal === 1 ? 'frame' : 'frames'}`}
        </p>

        {canvases?.length === 0 && (
          <div className="home-hero">
            <h3>Start your first canvas</h3>
            <p>
              A canvas is a shared space of live HTML frames — you design in the browser, your AI agents design through
              MCP, and everyone watches everything happen in real time.
            </p>
            <button className="btn primary" onClick={createCanvas}>
              + Create a canvas
            </button>
          </div>
        )}

        <div className="canvas-grid">
          {canvases !== null && canvases.length > 0 && (
            <button className="canvas-card new" onClick={createCanvas}>
              <span className="new-plus">+</span>
              <span className="new-label">New canvas</span>
            </button>
          )}
          {canvases === null &&
            [0, 1, 2].map((i) => (
              <div key={i} className="canvas-card skeleton" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          {canvases?.map((c) => (
            <button key={c.id} className="canvas-card" onClick={() => navigate(`/c/${c.id}`)}>
              <div className="card-preview">
                {c.previewFrameId ? (
                  <img
                    src={`/i/${c.previewFrameId}.jpg`}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <span className="card-blank">empty canvas</span>
                )}
                {c.ownerId && !c.shared && (
                  <DeleteButton
                    onDelete={async () => {
                      await api
                        .deleteCanvas(c.id)
                        .then(() => posthog.capture('canvas_deleted'))
                        .catch(console.error)
                      api.listCanvases().then(setCanvases).catch(console.error)
                    }}
                  />
                )}
              </div>
              <div className="card-info">
                <div className="name">{c.name}</div>
                <div className="meta">
                  <span>
                    {c.frameCount} frame{c.frameCount === 1 ? '' : 's'}
                  </span>
                  <span className="dot">·</span>
                  <span>{timeAgo(c.updatedAt)}</span>
                  {c.shared && (
                    <>
                      <span className="dot">·</span>
                      <span title="You were invited to collaborate on this canvas">shared with you</span>
                    </>
                  )}
                  {!c.ownerId && (
                    <span
                      className="chip claim"
                      title="This canvas predates accounts and is visible to everyone. Claim it to make it yours."
                      onClick={async (e) => {
                        e.stopPropagation()
                        await api.claimCanvas(c.id).catch(console.error)
                        api.listCanvases().then(setCanvases).catch(console.error)
                      }}
                    >
                      unclaimed — make mine
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <section className="connect-band">
          <div className="cb-text">
            <h3>✦ Connect your agents</h3>
            <p>
              Any MCP-capable AI can design with you — Claude Code, claude.ai, Cursor. Your client opens a browser
              window to sign in on first connect; the agent then works as yours, with its tasks attributed to you.
            </p>
          </div>
          <div className="cb-code">
            <label>MCP endpoint</label>
            <CodeBlock text={`${location.origin}/mcp`} />
            <label>Claude Code</label>
            <CodeBlock text={`claude mcp add --transport http doop "${location.origin}/mcp"`} />
          </div>
        </section>

        {agents.length > 0 && (
          <section className="agents-box">
            <h3>Agents that have contributed</h3>
            <div className="agents-grid">
              {agents.map((a) => (
                <div key={a.name} className="agent-item">
                  <span className="agent-ava" style={{ color: colorFor(a.name) }}>
                    <AgentIcon name={a.name} size={16} />
                  </span>
                  <div className="agent-item-info">
                    <div className="agent-name">{a.name}</div>
                    <div className="agent-sub">
                      {a.owner ? `belongs to ${a.owner}` : 'built-in agent'} · {a.canvases}{' '}
                      {a.canvases === 1 ? 'canvas' : 'canvases'}
                      {a.lastAt > 0 && ` · ${timeAgo(a.lastAt)}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 2600)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <span
      role="button"
      className={`card-delete${armed ? ' armed' : ''}`}
      title={armed ? 'Click again to permanently delete this canvas' : 'Delete canvas'}
      onClick={(e) => {
        e.stopPropagation()
        if (armed) onDelete()
        else setArmed(true)
      }}
    >
      {armed ? 'Delete?' : '✕'}
    </span>
  )
}
