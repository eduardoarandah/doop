import { useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasMeta } from '../../shared/types'
import { colorFor } from '../../shared/types'
import { api, type HomeActivity } from '../lib/api'
import { authClient } from '../lib/auth'
import { navigate, Logo } from '../App'
import { timeAgo } from '../lib/time'
import { AgentIcon } from '../components/AgentIcon'
import { AccountMenu, ConnectCard, IconGrid, IconList, IconShare, IconUser } from '../components/DashShell'
import { posthog } from '../lib/posthog'

/** an agent that worked this recently is treated as still at the desk */
const LIVE_WINDOW = 5 * 60 * 1000

type Scope = 'all' | 'mine' | 'shared'

export function Home() {
  const [canvases, setCanvases] = useState<CanvasMeta[] | null>(null)
  const [activity, setActivity] = useState<HomeActivity[]>([])
  const [scope, setScope] = useState<Scope>('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  /* a clock the render can read: an agent that just worked shows as live, and
     the relative times stay honest without a reload */
  const [now, setNow] = useState(0)
  const { data: session } = authClient.useSession()
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.listCanvases().then(setCanvases).catch(console.error)
    api.homeActivity().then(setActivity).catch(console.error)
    const start = window.setTimeout(() => setNow(Date.now()), 0)
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(tick)
    }
  }, [])

  /* ⌘K is the search affordance people already expect */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function createCanvas() {
    const canvas = await api.createCanvas('Untitled canvas')
    posthog.capture('canvas_created')
    navigate(`/c/${canvas.id}`)
  }

  function reload() {
    api.listCanvases().then(setCanvases).catch(console.error)
  }

  const hour = new Date().getHours()
  const daypart = hour < 5 ? 'Up late' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const first = session?.user.name?.split(' ')[0]
  const frameTotal = canvases?.reduce((n, c) => n + c.frameCount, 0) ?? 0
  const counts = {
    all: canvases?.length ?? 0,
    mine: canvases?.filter((c) => !c.shared).length ?? 0,
    shared: canvases?.filter((c) => c.shared).length ?? 0,
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (canvases ?? [])
      .filter((c) => (scope === 'mine' ? !c.shared : scope === 'shared' ? !!c.shared : true))
      .filter((c) => !q || c.name.toLowerCase().includes(q))
  }, [canvases, scope, query])

  /* every agent that has worked on these canvases, aggregated across them */
  const agents = useMemo(() => {
    const map = new Map<string, { name: string; owner?: string; lastAt: number; canvases: number }>()
    for (const c of canvases ?? []) {
      for (const a of c.agents ?? []) {
        const e = map.get(a.name)
        if (e) {
          e.canvases += 1
          e.lastAt = Math.max(e.lastAt, a.lastAt ?? 0)
          if (!e.owner) e.owner = a.owner
        } else {
          map.set(a.name, { name: a.name, owner: a.owner, lastAt: a.lastAt ?? 0, canvases: 1 })
        }
      }
    }
    return [...map.values()].sort((x, y) => y.lastAt - x.lastAt)
  }, [canvases])

  const empty = canvases !== null && canvases.length === 0

  return (
    <div className="dash">
      <aside className="dash-rail">
        <div className="home-mark dash-brand">
          <Logo /> Doop
        </div>

        <nav className="dash-nav">
          <NavItem
            icon={<IconGrid />}
            label="All canvases"
            count={counts.all}
            on={scope === 'all'}
            go={() => setScope('all')}
          />
          <NavItem
            icon={<IconUser />}
            label="Owned by me"
            count={counts.mine}
            on={scope === 'mine'}
            go={() => setScope('mine')}
          />
          <NavItem
            icon={<IconShare />}
            label="Shared with me"
            count={counts.shared}
            on={scope === 'shared'}
            go={() => setScope('shared')}
          />
        </nav>

        {agents.length > 0 && (
          <>
            <div className="dash-label">Agents</div>
            <div className="dash-agents">
              {agents.slice(0, 5).map((a) => (
                <div key={a.name} className="dash-agent" title={`${a.canvases} canvas${a.canvases === 1 ? '' : 'es'}`}>
                  <span className="dash-agent-ava" style={{ color: colorFor(a.name) }}>
                    <AgentIcon name={a.name} size={13} />
                  </span>
                  <span className="dash-agent-name">{a.name}</span>
                  {a.lastAt > 0 && now - a.lastAt < LIVE_WINDOW ? (
                    <span className="dash-live" title="working right now" />
                  ) : (
                    <span className="dash-when">{a.lastAt > 0 ? timeAgo(a.lastAt) : ''}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {activity.length > 0 && (
          <>
            <div className="dash-label">Live now</div>
            <div className="dash-feed">
              {activity.slice(0, 4).map((a) => (
                <button key={a.id} className="dash-feed-item" onClick={() => navigate(`/c/${a.canvasId}`)}>
                  <span className="dash-feed-dot" style={{ background: a.actorColor }} />
                  <span className="dash-feed-text">
                    <b>{a.actorName}</b> {a.message}
                    <span className="dash-feed-when">
                      {a.canvasName} · {timeAgo(a.at)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="dash-grow" />
        <ConnectCard />
      </aside>

      <section className="dash-main">
        <header className="dash-top">
          <label className="dash-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search canvases"
              aria-label="Search canvases"
            />
            <kbd>⌘K</kbd>
          </label>
          <span className="spacer" />
          <button className="btn primary" onClick={createCanvas}>
            + New canvas
          </button>
          <AccountMenu />
        </header>

        <div className="dash-body">
          <div className="dash-head">
            <div>
              <h1>
                {daypart}, {first}
                <em>.</em>
              </h1>
              <p className="sub">
                {canvases === null
                  ? '…'
                  : `${counts.all} ${counts.all === 1 ? 'canvas' : 'canvases'} · ${frameTotal} ${
                      frameTotal === 1 ? 'frame' : 'frames'
                    }${agents.length ? ` · ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}` : ''}`}
              </p>
            </div>
            <div className="dash-seg" role="group" aria-label="View">
              <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} aria-label="Grid view">
                <IconGrid />
              </button>
              <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label="List view">
                <IconList />
              </button>
            </div>
          </div>

          {empty ? (
            <div className="dash-hero">
              <h3>Start your first canvas</h3>
              <p>
                A canvas is a shared space of live HTML frames — you design in the browser, your AI agents design
                through MCP, and everyone watches everything happen in real time.
              </p>
              <button className="btn primary" onClick={createCanvas}>
                + Create a canvas
              </button>
            </div>
          ) : (
            <>
              {canvases !== null && (
                <div className="dash-tools">
                  {/* the total is already in the subtitle — only say something
                      here when a search or scope has narrowed it */}
                  {(query.trim() || scope !== 'all') && (
                    <span className="dash-count">
                      {visible.length} of {counts.all}
                    </span>
                  )}
                  <span className="dash-sort">Sorted by last edited</span>
                </div>
              )}

              {canvases !== null && visible.length === 0 ? (
                <p className="dash-none">Nothing matches — try a different search or scope.</p>
              ) : view === 'grid' ? (
                <div className="canvas-grid">
                  {canvases !== null && (
                    <button className="canvas-card new" onClick={createCanvas}>
                      <span className="new-plus">+</span>
                      <span className="new-label">New canvas</span>
                    </button>
                  )}
                  {canvases === null &&
                    [0, 1, 2, 3].map((i) => (
                      <div key={i} className="canvas-card skeleton" style={{ animationDelay: `${i * 0.12}s` }} />
                    ))}
                  {visible.map((c) => (
                    <button key={c.id} className="canvas-card" onClick={() => navigate(`/c/${c.id}`)}>
                      <div className="card-preview">
                        <Preview canvas={c} />
                        <AgentStack canvas={c} />
                        {c.ownerId && !c.shared && <DeleteButton onDelete={() => remove(c.id, reload)} />}
                      </div>
                      <div className="card-info">
                        <div className="name">{c.name}</div>
                        <div className="meta">
                          <Meta canvas={c} onClaim={reload} />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dash-list">
                  {visible.map((c) => (
                    <button key={c.id} className="dash-row" onClick={() => navigate(`/c/${c.id}`)}>
                      <span className="dash-row-thumb">
                        <Preview canvas={c} />
                      </span>
                      <span className="dash-row-name">{c.name}</span>
                      <span className="dash-row-count">
                        {c.frameCount} frame{c.frameCount === 1 ? '' : 's'}
                      </span>
                      <span className="dash-row-agents">
                        {(c.agents ?? []).slice(0, 3).map((a) => (
                          <i key={a.name} style={{ color: colorFor(a.name) }}>
                            <AgentIcon name={a.name} size={11} />
                          </i>
                        ))}
                      </span>
                      <span className="dash-row-when">{timeAgo(c.updatedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function remove(id: string, done: () => void) {
  api
    .deleteCanvas(id)
    .then(() => posthog.capture('canvas_deleted'))
    .catch(console.error)
    .finally(done)
}

function Preview({ canvas }: { canvas: CanvasMeta }) {
  if (!canvas.previewFrameId) return <span className="card-blank">empty canvas</span>
  return (
    <img
      src={`/i/${canvas.previewFrameId}.jpg`}
      alt=""
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

/** who has worked here, over the preview — the canvas's multiplayer at a glance */
function AgentStack({ canvas }: { canvas: CanvasMeta }) {
  const agents = (canvas.agents ?? []).slice(0, 3)
  if (!agents.length) return null
  return (
    <span className="card-agents">
      {agents.map((a) => (
        <i key={a.name} style={{ color: colorFor(a.name) }} title={a.name}>
          <AgentIcon name={a.name} size={11} />
        </i>
      ))}
    </span>
  )
}

function Meta({ canvas: c, onClaim }: { canvas: CanvasMeta; onClaim: () => void }) {
  return (
    <>
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
            onClaim()
          }}
        >
          unclaimed — make mine
        </span>
      )}
    </>
  )
}

function NavItem({
  icon,
  label,
  count,
  on,
  go,
}: {
  icon: React.ReactNode
  label: string
  count: number
  on: boolean
  go: () => void
}) {
  return (
    <button className={`dash-nav-item${on ? ' on' : ''}`} onClick={go} aria-current={on ? 'page' : undefined}>
      {icon}
      {label}
      <span className="dash-nav-count">{count}</span>
    </button>
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
