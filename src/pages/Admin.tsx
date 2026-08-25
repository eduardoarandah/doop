import { useEffect, useState } from 'react'
import { adminApi, type AdminCanvas, type AdminUser } from '../lib/api'
import { navigate, Logo } from '../App'
import { timeAgo } from '../lib/time'
import { AccountMenu, ConnectCard, IconBack, IconChevron, IconGrid, IconShare } from '../components/DashShell'

/**
 * The instance index: every canvas, every account. Read-only — the way to
 * look inside someone's canvas is "view as", which hands you a real (but
 * read-only, 15-minute) session as its owner rather than granting admins a
 * privileged read path through the canvas gate.
 *
 * Same shell as home and settings; the rail's middle carries the two indexes.
 */
export function Admin() {
  const [data, setData] = useState<{ total: number; canvases: AdminCanvas[] } | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [stats, setStats] = useState<{ users: number; canvases: number; frames: number } | null>(null)
  const [tab, setTab] = useState<'canvases' | 'users'>('canvases')
  const [q, setQ] = useState('')
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    adminApi
      .canvases()
      .then(setData)
      .catch(() => setDenied(true))
    adminApi
      .stats()
      .then(setStats)
      .catch(() => {})
    adminApi
      .users()
      .then(setUsers)
      .catch(() => {})
  }, [])

  async function viewAs(userId: string) {
    await adminApi.impersonate(userId)
    /* the session cookie has been replaced — every piece of client state now
       belongs to the wrong person. Reload rather than reconcile. */
    location.assign('/')
  }

  if (denied) {
    return (
      <div className="home">
        <div className="home-inner">
          <h1>Not found</h1>
          <p className="sub">This page does not exist for this account.</p>
          <button className="btn ghost" onClick={() => navigate('/')}>
            Back
          </button>
        </div>
      </div>
    )
  }

  const needle = q.trim().toLowerCase()
  const canvases = (data?.canvases ?? []).filter(
    (c) =>
      !needle ||
      c.name.toLowerCase().includes(needle) ||
      c.owner?.name.toLowerCase().includes(needle) ||
      c.owner?.email.toLowerCase().includes(needle),
  )
  const shownUsers = (users ?? []).filter(
    (u) => !needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle),
  )

  return (
    <div className="dash">
      <aside className="dash-rail">
        <div className="home-mark dash-brand">
          <Logo /> Doop <span className="chip admin-chip">admin</span>
        </div>

        <button className="dash-back" onClick={() => navigate('/')}>
          <IconBack /> Back to my canvases
        </button>

        <div className="dash-label">Instance</div>
        <nav className="dash-nav">
          <button
            className={`dash-nav-item${tab === 'canvases' ? ' on' : ''}`}
            onClick={() => setTab('canvases')}
            aria-current={tab === 'canvases' ? 'page' : undefined}
          >
            <IconGrid /> Canvases
            <span className="dash-nav-count">{stats?.canvases ?? ''}</span>
          </button>
          <button
            className={`dash-nav-item${tab === 'users' ? ' on' : ''}`}
            onClick={() => setTab('users')}
            aria-current={tab === 'users' ? 'page' : undefined}
          >
            <IconShare /> Accounts
            <span className="dash-nav-count">{stats?.users ?? ''}</span>
          </button>
        </nav>

        <div className="dash-grow" />
        <ConnectCard />
      </aside>

      <section className="dash-main">
        <header className="dash-top">
          <nav className="dash-crumb" aria-label="Breadcrumb">
            <button onClick={() => navigate('/')}>Home</button>
            <IconChevron />
            <b>Admin</b>
          </nav>
          <label className="dash-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === 'canvases' ? 'Search canvases or owners…' : 'Search accounts…'}
              aria-label={tab === 'canvases' ? 'Search canvases or owners' : 'Search accounts'}
            />
          </label>
          <span className="spacer" />
          <AccountMenu />
        </header>

        <div className="dash-body">
          <div className="dash-head">
            <div>
              <h1>
                Everything on this instance<em>.</em>
              </h1>
              <p className="sub">
                {stats
                  ? `${stats.users} ${stats.users === 1 ? 'account' : 'accounts'} · ${stats.canvases} ${
                      stats.canvases === 1 ? 'canvas' : 'canvases'
                    } · ${stats.frames} ${stats.frames === 1 ? 'frame' : 'frames'}`
                  : '…'}
              </p>
            </div>
          </div>

          {tab === 'canvases' ? (
            <>
              {data && data.total > data.canvases.length && (
                <div className="dash-tools">
                  <span className="dash-count">
                    Showing the {data.canvases.length} most recently updated of {data.total}
                  </span>
                </div>
              )}
              <div className="canvas-grid">
                {data === null &&
                  [0, 1, 2, 3].map((i) => (
                    <div key={i} className="canvas-card skeleton" style={{ animationDelay: `${i * 0.12}s` }} />
                  ))}
                {canvases.map((c) => (
                  <div key={c.id} className="canvas-card admin-card">
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
                    </div>
                    <div className="card-info">
                      <div className="name">{c.name}</div>
                      <div className="meta">
                        <span>{c.owner ? c.owner.name : 'unclaimed'}</span>
                        <span className="dot">·</span>
                        <span>
                          {c.frameCount} frame{c.frameCount === 1 ? '' : 's'}
                        </span>
                        <span className="dot">·</span>
                        <span>{timeAgo(c.updatedAt)}</span>
                        {c.linkAccess === 'edit' && (
                          <span className="chip" title="Anyone with the link can edit this canvas">
                            link on
                          </span>
                        )}
                        {c.memberCount > 0 && (
                          <>
                            <span className="dot">·</span>
                            <span>{c.memberCount} invited</span>
                          </>
                        )}
                      </div>
                      {c.owner && (
                        <button className="btn ghost small" onClick={() => viewAs(c.owner!.id)}>
                          View as {c.owner.name.split(' ')[0]}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="dash-list admin-users">
              {users === null && <p className="dash-none">…</p>}
              {shownUsers.map((u) => (
                <div key={u.id} className="admin-user-row">
                  <div className="admin-user-info">
                    <div className="name">
                      {u.name}
                      {u.role === 'admin' && <span className="chip admin-chip">admin</span>}
                      {u.banned && <span className="chip banned-chip">banned</span>}
                    </div>
                    <div className="meta">
                      <span>{u.email}</span>
                      <span className="dot">·</span>
                      <span>
                        {u.canvasCount} {u.canvasCount === 1 ? 'canvas' : 'canvases'}
                      </span>
                      <span className="dot">·</span>
                      <span>joined {timeAgo(u.createdAt)}</span>
                    </div>
                  </div>
                  {u.role !== 'admin' && (
                    <button className="btn ghost small" onClick={() => viewAs(u.id)}>
                      View as
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
