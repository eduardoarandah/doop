import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { connect, disconnect, sendWs } from '../lib/ws'
import { api, ApiError, type CanvasMember, type DiscoveredSite, type SyncKeyInfo } from '../lib/api'
import { navigate, Logo } from '../App'
import { Stage } from '../components/Stage'
import { Board } from '../components/Board'
import { Inspector } from '../components/Inspector'
import { ActivityPanel } from '../components/ActivityPanel'
import { ConnectModal } from '../components/ConnectModal'
import { LimitWall } from '../components/TeamAllowance'
import { PromptBar } from '../components/PromptBar'
import { WorkingNow } from '../components/WorkingNow'
import { Onboarding } from '../components/Onboarding'
import { BrainIcon } from '../components/BrainIcon'
import { AgentIcon, agentBrand } from '../components/AgentIcon'
import { getIdentity, setName } from '../lib/identity'
import { copyFrame, duplicateFrame, hasFrameClip, pasteFrameCentered, pasteImagesCentered } from '../lib/frameClipboard'
import { clearHistory, deleteFrameTracked, recordCreate, redo, undo } from '../lib/history'
import { authClient } from '../lib/auth'
import { posthog } from '../lib/posthog'

const STARTER_HTML = `<!doctype html>
<html>
<head>
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    font-family: system-ui, sans-serif;
    height: 100vh;
    display: grid;
    place-items: center;
    background: #fafafa;
    color: #999;
  }
</style>
</head>
<body>
  <p>Design me — edit the HTML, or ask an agent.</p>
</body>
</html>`

export function CanvasPage({ canvasId }: { canvasId: string }) {
  const canvas = useStore((s) => s.canvas)
  const connected = useStore((s) => s.connected)
  const presences = useStore((s) => s.presences)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const [showActivity, setShowActivity] = useState(true)
  const [view, setView] = useState<'canvas' | 'board'>('canvas')
  const [showConnect, setShowConnect] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const updateReady = useStore((s) => s.updateReady)
  const limitWall = useStore((s) => s.limitWall)

  useEffect(() => {
    connect(canvasId)
    return () => {
      disconnect()
      useStore.getState().setCanvas(null)
      useStore.getState().setPresences([])
      select(null)
      clearHistory()
    }
  }, [canvasId])

  /* broadcast which frame I'm focused on */
  useEffect(() => {
    sendWs({ type: 'editing', frameId: selectedId })
  }, [selectedId])

  /* frame keyboard shortcuts: delete, copy/paste/duplicate, undo/redo */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      const sel = useStore.getState().selectedId
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        const frame = useStore.getState().canvas?.frames.find((f) => f.id === sel)
        if (frame) deleteFrameTracked(frame)
      }
      if (e.key === 'Escape') select(null)
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const frame = useStore.getState().canvas?.frames.find((f) => f.id === sel)
        /* don't hijack ⌘C when the user is copying selected text */
        if (e.key === 'c' && frame && !window.getSelection()?.toString()) copyFrame(frame)
        if (e.key === 'd' && frame) {
          e.preventDefault()
          duplicateFrame(frame)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canvasId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ⌘V lands here as a real paste event: clipboard images upload and drop in
     as frames; otherwise a copied frame (⌘C) pastes centered. Handled on
     'paste' rather than keydown so the browser hands us the clipboard bytes
     without a permission prompt. */
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      const images = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (images.length) {
        e.preventDefault()
        pasteImagesCentered(canvasId, images).catch((err: Error) => {
          setToast(`Couldn’t paste image — ${err.message}`)
          window.setTimeout(() => setToast(null), 4000)
        })
      } else if (hasFrameClip()) {
        e.preventDefault()
        pasteFrameCentered(canvasId)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canvasId])

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2000)
  }

  /* a pending Memory suggestion gets its own toast beside the side panel;
     clicking it jumps to the Memory tab, ✕ mutes it for this session */
  const pendingProposal = useStore((s) => s.proposals.find((p) => p.status === 'pending'))
  const panelTab = useStore((s) => s.panelTab)
  const [mutedProposal, setMutedProposal] = useState<string | null>(null)

  /* a decision landing in Memory is invisible work — surface it as its own
     memory toast in the same top-right stack. Only decisions captured after
     this page loaded count, so the ws-init batch stays silent. The summarizer
     re-broadcasts the decision with a generalized summary a moment later; the
     upsert re-fires this effect and the toast text swaps in place. */
  const latestDecision = useStore((s) => s.decisions[0])
  const [decisionToast, setDecisionToast] = useState<string | null>(null)
  const loadedAt = useRef(0)
  const decisionToastTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!loadedAt.current) loadedAt.current = Date.now()
    if (latestDecision && latestDecision.at > loadedAt.current) {
      const line = latestDecision.summary ?? latestDecision.text
      setDecisionToast(line.length > 64 ? line.slice(0, 61) + '…' : line)
      if (decisionToastTimer.current) window.clearTimeout(decisionToastTimer.current)
      decisionToastTimer.current = window.setTimeout(() => setDecisionToast(null), 6000)
    }
  }, [latestDecision])

  async function addFrame() {
    const n = (canvas?.frames.length ?? 0) + 1
    const frame = await api.createFrame(canvasId, { name: `Frame ${n}`, html: STARTER_HTML })
    posthog.capture('frame_created')
    recordCreate(frame)
    select(frame.id)
  }

  const me = getIdentity()
  const others = useMemo(
    () => Object.values(presences).filter((p) => p.clientId !== me.clientId),
    [presences, me.clientId],
  )

  const selectedFrame = canvas?.frames.find((f) => f.id === selectedId) ?? null
  /* a right-click that selected the frame keeps the Inspector out until the
     context menu closes — it would slide in right under the open menu */
  const deferPanel = useStore((s) => !!s.ctxMenu?.deferPanel)

  return (
    <div className="workspace">
      <div className="topbar">
        <button className="logo-btn" onClick={() => navigate('/')} title="All canvases">
          <Logo />
        </button>
        <CanvasName />
        <span className="chip" title="Canvas id — agents use this with the MCP tools">
          {canvasId}
        </span>
        <div className="view-toggle" role="tablist" aria-label="View">
          <button className={view === 'canvas' ? 'on' : ''} onClick={() => setView('canvas')}>
            Canvas
          </button>
          <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>
            Board
          </button>
        </div>
        {!connected && (
          <span className="chip" style={{ color: 'var(--accent-ink)' }}>
            reconnecting…
          </span>
        )}
        <div className="spacer" />
        <div className="presence-stack" title={others.map((p) => p.name).join(', ') || 'Just you here'}>
          <button
            className="avatar-btn"
            title={`You are “${me.name}” — click to change your name`}
            onClick={() => {
              const next = window.prompt('Your display name (shown on your cursor and in the activity feed):', me.name)
              if (next?.trim() && next.trim() !== me.name) {
                /* the name lives on the account now — update it there, then rejoin */
                authClient.updateUser({ name: next.trim() }).then(() => {
                  setName(next.trim())
                  location.reload()
                })
              }
            }}
          >
            <Avatar name={me.name} color={'var(--ink)'} kind="user" />
          </button>
          {others.map((p) => (
            <Avatar key={p.clientId} name={p.name} color={p.color} kind={p.kind} status={p.status} owner={p.owner} />
          ))}
        </div>
        <button className="btn ghost" onClick={() => setShowActivity((v) => !v)}>
          Activity
        </button>
        <button className="btn ghost" onClick={() => setShowImport(true)} title="Import a live web page as a frame">
          ⤓ Import
        </button>
        <button className="btn" onClick={() => setShowShare(true)}>
          Share
        </button>
        <button
          className="btn primary"
          onClick={() => {
            posthog.capture('agent_connection_opened')
            setShowConnect(true)
          }}
        >
          ✦ Connect AI
        </button>
      </div>

      <div className="stage-wrap">
        {view === 'board' ? (
          <Board canvasId={canvasId} />
        ) : (
          <>
            <Stage onAddFrame={addFrame} />
            <div className={`memory-toasts${showActivity ? ' beside-panel' : ''}`}>
              {pendingProposal && mutedProposal !== pendingProposal.id && !(showActivity && panelTab === 'memory') && (
                <div className="memory-toast">
                  <button
                    className="memory-toast-body"
                    onClick={() => {
                      useStore.getState().setPanelTab('memory')
                      setShowActivity(true)
                    }}
                  >
                    ✦ Memory suggestion — review
                  </button>
                  <button
                    className="memory-toast-x"
                    title="Hide for now"
                    onClick={() => setMutedProposal(pendingProposal.id)}
                  >
                    ✕
                  </button>
                </div>
              )}
              {decisionToast && (
                <button
                  className="memory-toast decision"
                  title="Open Memory"
                  onClick={() => {
                    useStore.getState().setPanelTab('memory')
                    setShowActivity(true)
                    setDecisionToast(null)
                  }}
                >
                  <BrainIcon size={17} />
                  <span>
                    <b>Saved to Memory</b>
                    <span className="mt-line">{decisionToast}</span>
                  </span>
                </button>
              )}
            </div>
            <WorkingNow />
            <PromptBar canvasId={canvasId} />
            <Onboarding />
            {selectedFrame && !deferPanel && <Inspector frame={selectedFrame} />}
            {showActivity && <ActivityPanel onClose={() => setShowActivity(false)} />}
          </>
        )}
      </div>

      {showConnect && <ConnectModal canvasId={canvasId} onClose={() => setShowConnect(false)} />}
      {showShare && (
        <ShareModal
          canvasId={canvasId}
          onClose={() => setShowShare(false)}
          onCopied={() => {
            setShowShare(false)
            showToast('Canvas link copied')
          }}
        />
      )}
      {limitWall && <LimitWall canvasId={canvasId} onClose={() => useStore.getState().setLimitWall(false)} />}
      {showImport && (
        <ImportModal
          canvasId={canvasId}
          onClose={() => setShowImport(false)}
          onDone={(frameIds, failedCount) => {
            setShowImport(false)
            setView('canvas')
            select(frameIds[0] ?? null)
            const imported = frameIds.length === 1 ? '1 page imported' : `${frameIds.length} pages imported`
            showToast(failedCount ? `${imported} · ${failedCount} failed` : imported)
          }}
        />
      )}
      {updateReady ? (
        <div className="toast">
          doop was updated
          <button className="toast-action" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      ) : (
        toast && <div className="toast">{toast}</div>
      )}
    </div>
  )
}

function ImportModal({
  canvasId,
  onClose,
  onDone,
}: {
  canvasId: string
  onClose: () => void
  onDone: (frameIds: string[], failedCount: number) => void
}) {
  const [url, setUrl] = useState('')
  const [wholeSite, setWholeSite] = useState(false)
  const [discovery, setDiscovery] = useState<DiscoveredSite | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'discovering' | 'importing' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function errorMessage(caught: unknown, fallback: string) {
    if (caught instanceof ApiError) return String(caught.body.error ?? fallback)
    return caught instanceof Error ? caught.message.replace(/^\d+\s*/, '') : fallback
  }

  function normalizedUrl() {
    const clean = url.trim()
    return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`
  }

  async function runSinglePage() {
    if (!url.trim() || busy) return
    setBusy('importing')
    setError(null)
    try {
      const frame = await api.importPage(canvasId, normalizedUrl())
      posthog.capture('page_imported')
      onDone([frame.id], 0)
    } catch (e) {
      setError(errorMessage(e, 'import failed'))
      setBusy(null)
    }
  }

  async function discover() {
    if (!url.trim() || busy) return
    setBusy('discovering')
    setError(null)
    try {
      const found = await api.discoverSitePages(canvasId, normalizedUrl())
      setDiscovery(found)
      setSelected(new Set(found.pages.map((page) => page.url)))
      posthog.capture('site_pages_discovered', { page_count: found.pages.length, truncated: found.truncated })
      setBusy(null)
    } catch (e) {
      setError(errorMessage(e, 'page discovery failed'))
      setBusy(null)
    }
  }

  async function importSelected() {
    if (!discovery || !selected.size || busy) return
    setBusy('importing')
    setError(null)
    const urls = discovery.pages.filter((page) => selected.has(page.url)).map((page) => page.url)
    try {
      const result = await api.importSitePages(canvasId, urls)
      if (!result.frames.length) {
        const reason = result.failures[0]?.error
        setError(reason ? `No pages could be imported — ${reason}` : 'No pages could be imported')
        setBusy(null)
        return
      }
      posthog.capture('website_imported', {
        requested_count: urls.length,
        imported_count: result.frames.length,
        failed_count: result.failures.length,
      })
      onDone(
        result.frames.map((frame) => frame.id),
        result.failures.length,
      )
    } catch (e) {
      setError(errorMessage(e, 'website import failed'))
      setBusy(null)
    }
  }

  function togglePage(pageUrl: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(pageUrl)) next.delete(pageUrl)
      else next.add(pageUrl)
      return next
    })
  }

  const selectedCount = selected.size

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        {!discovery ? (
          <>
            <div className="import-heading">
              <span className="import-kicker">Website capture</span>
              <h2>Import from the web</h2>
            </div>
            <p className="lede">
              Bring in one page, or discover a whole site and choose the pages you want before anything is added.
            </p>
            <label className="import-field-label" htmlFor="import-url">
              Website URL
            </label>
            <input
              id="import-url"
              className="import-url"
              autoFocus
              placeholder="https://example.com"
              value={url}
              disabled={!!busy}
              onChange={(e) => {
                setUrl(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (wholeSite) discover()
                  else runSinglePage()
                }
                if (e.key === 'Escape' && !busy) onClose()
              }}
            />
            <label className={`site-import-option${wholeSite ? ' on' : ''}`}>
              <input
                type="checkbox"
                checked={wholeSite}
                disabled={!!busy}
                onChange={(e) => {
                  setWholeSite(e.target.checked)
                  setError(null)
                }}
              />
              <span className="site-import-check" aria-hidden="true">
                {wholeSite ? '✓' : ''}
              </span>
              <span>
                <span className="site-import-title">
                  Import the entire website <em>Optional</em>
                </span>
                <span className="site-import-copy">Find public pages on the same site, then review the list.</span>
              </span>
            </label>
            <p className="import-footnote">Snapshots stay editable and commentable. Scripts are removed.</p>
            {error && <p className="import-error">{error}</p>}
            <div className="close-row">
              <button className="btn ghost" disabled={!!busy} onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!!busy || !url.trim()}
                onClick={wholeSite ? discover : runSinglePage}
              >
                {busy === 'discovering'
                  ? 'Finding pages…'
                  : busy === 'importing'
                    ? 'Importing…'
                    : wholeSite
                      ? 'Find pages →'
                      : '⤓ Import page'}
              </button>
            </div>
            <SyncKeysSection canvasId={canvasId} />
          </>
        ) : (
          <>
            <div className="import-review-head">
              <div>
                <span className="import-kicker">Review before import</span>
                <h2>Choose pages</h2>
              </div>
              <span className="import-domain">{new URL(discovery.siteUrl).hostname}</span>
            </div>
            <p className="lede">
              {discovery.pages.length} {discovery.pages.length === 1 ? 'page' : 'pages'} found. Everything is selected
              by default; uncheck anything you don’t need.
            </p>
            <div className="import-selection-bar">
              <b>
                {selectedCount} of {discovery.pages.length} selected
              </b>
              <span>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => setSelected(new Set(discovery.pages.map((p) => p.url)))}
                >
                  Select all
                </button>
                <button type="button" disabled={!!busy} onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </span>
            </div>
            <div className={`import-page-list${busy ? ' busy' : ''}`} role="group" aria-label="Pages to import">
              {discovery.pages.map((page, index) => {
                const pageUrl = new URL(page.url)
                let pathname = pageUrl.pathname
                try {
                  pathname = decodeURIComponent(pathname)
                } catch {
                  /* Keep the encoded path when a site contains a malformed escape. */
                }
                const path = pathname + pageUrl.search
                return (
                  <label className="import-page-row" key={page.url}>
                    <input
                      type="checkbox"
                      checked={selected.has(page.url)}
                      disabled={!!busy}
                      onChange={() => togglePage(page.url)}
                    />
                    <span className="import-page-check" aria-hidden="true">
                      {selected.has(page.url) ? '✓' : ''}
                    </span>
                    <span className="import-page-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="import-page-info">
                      <b>{page.title}</b>
                      <span>{path || '/'}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {discovery.truncated && (
              <p className="import-limit-note">Showing the first 100 pages found. Narrow the starting URL if needed.</p>
            )}
            {busy === 'importing' && (
              <p className="import-progress">Capturing {selectedCount} pages — larger sites can take a few minutes.</p>
            )}
            {error && <p className="import-error">{error}</p>}
            <div className="close-row import-review-actions">
              <button
                className="btn ghost"
                disabled={!!busy}
                onClick={() => {
                  setDiscovery(null)
                  setError(null)
                }}
              >
                ← Back
              </button>
              <button className="btn primary" disabled={!!busy || !selectedCount} onClick={importSelected}>
                {busy === 'importing'
                  ? `Importing ${selectedCount}…`
                  : `⤓ Import ${selectedCount} ${selectedCount === 1 ? 'page' : 'pages'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* Share modal, Figma-style: invite doop accounts to collaborate, or turn on
   link sharing. Canvases are private by default — only the owner and invited
   members get in until the link toggle is flipped. */
function ShareModal({ canvasId, onClose, onCopied }: { canvasId: string; onClose: () => void; onCopied: () => void }) {
  const canvas = useStore((s) => s.canvas)
  const { data: session } = authClient.useSession()
  const meId = session?.user?.id
  const isOwner = !!canvas?.ownerId && canvas.ownerId === meId
  const linkEdits = canvas?.linkAccess === 'edit'
  const [people, setPeople] = useState<CanvasMember[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listMembers(canvasId)
      .then(setPeople)
      .catch(() => setPeople([]))
  }, [canvasId])

  async function invite() {
    const clean = email.trim()
    if (!clean || busy) return
    setBusy(true)
    setError(null)
    try {
      const m = await api.inviteMember(canvasId, clean)
      setPeople((p) => (p?.some((x) => x.userId === m.userId) ? p : [...(p ?? []), m]))
      if (canvas && !canvas.memberIds?.includes(m.userId)) {
        useStore.getState().setCanvas({ ...canvas, memberIds: [...(canvas.memberIds ?? []), m.userId] })
      }
      setEmail('')
    } catch (e) {
      setError(e instanceof ApiError ? String(e.body.error ?? 'invite failed') : 'invite failed')
    }
    setBusy(false)
  }

  function remove(userId: string) {
    api.removeMember(canvasId, userId).catch(console.error)
    setPeople((p) => p?.filter((x) => x.userId !== userId) ?? null)
    if (canvas) {
      useStore.getState().setCanvas({ ...canvas, memberIds: canvas.memberIds?.filter((id) => id !== userId) })
    }
    /* removing yourself = leaving the canvas */
    if (userId === meId && !isOwner) navigate('/')
  }

  function toggleLink(next: boolean) {
    if (!canvas) return
    const linkAccess = next ? 'edit' : 'none'
    api.setLinkAccess(canvas.id, linkAccess).catch(console.error)
    useStore.getState().setCanvas({ ...canvas, linkAccess })
  }

  async function copy() {
    await navigator.clipboard.writeText(location.href)
    posthog.capture('canvas_link_shared')
    onCopied()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Share “{canvas?.name ?? 'canvas'}”</h2>
        {isOwner && (
          <>
            <div className="share-invite-row">
              <input
                autoFocus
                placeholder="Invite by email (doop account)"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && invite()}
              />
              <button className="btn primary" disabled={busy || !email.trim()} onClick={invite}>
                Invite
              </button>
            </div>
            {error && <p className="share-error">{error}</p>}
          </>
        )}
        <div className="share-people">
          {(people ?? []).map((p) => (
            <div key={p.userId} className="share-person">
              <span className="share-initial">{p.name.slice(0, 1).toUpperCase()}</span>
              <span className="who">
                <b>
                  {p.name}
                  {p.userId === meId ? ' (you)' : ''}
                </b>
                <span>{p.email}</span>
              </span>
              {p.owner ? (
                <span className="share-owner-tag">Owner</span>
              ) : isOwner || p.userId === meId ? (
                <button
                  className="share-remove"
                  title={p.userId === meId ? 'Leave this canvas' : 'Remove'}
                  onClick={() => remove(p.userId)}
                >
                  ✕
                </button>
              ) : (
                <span className="share-owner-tag">Can edit</span>
              )}
            </div>
          ))}
          {people === null && <p className="share-note">Loading…</p>}
        </div>
        <div className="share-link-row">
          {isOwner ? (
            <label className="share-toggle" title="Off = only you and invited people can open this canvas">
              <input type="checkbox" checked={linkEdits} onChange={(e) => toggleLink(e.target.checked)} />
              Anyone with the link can edit
            </label>
          ) : (
            <span className="share-note">{linkEdits ? 'Anyone with the link can edit' : 'Invite-only canvas'}</span>
          )}
          <button className="btn" onClick={copy}>
            ⧉ Copy link
          </button>
        </div>
      </div>
    </div>
  )
}

/* Design sync: mint write-only snippet keys so an app pushes its live screens
   onto this canvas — the import path for products behind SSO/VPN where the
   server-side importer can't go. */
function SyncKeysSection({ canvasId }: { canvasId: string }) {
  const [keys, setKeys] = useState<SyncKeyInfo[] | null>(null)
  const [name, setAppName] = useState('')
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  /* keys are owner/member-only (durable access) — link-edit visitors get a
     403 and shouldn't see the section at all */
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    api
      .listSyncKeys(canvasId)
      .then(setKeys)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setForbidden(true)
        setKeys([])
      })
  }, [canvasId])

  /* key in the src query string — the one attribute tag managers never strip */
  const snippetFor = (secret: string) =>
    `<script async src="${location.origin}/doop-sync.js?key=${secret}"></` + `script>`

  async function create() {
    if (busy || !name.trim()) return
    setBusy(true)
    try {
      const key = await api.createSyncKey(canvasId, name.trim())
      setKeys((k) => [key, ...(k ?? [])])
      setAppName('')
      posthog.capture('sync_key_created')
    } catch (e) {
      console.error(e)
    }
    setBusy(false)
  }

  function revoke(keyId: string) {
    api.deleteSyncKey(canvasId, keyId).catch(console.error)
    setKeys((k) => k?.filter((x) => x.id !== keyId) ?? null)
  }

  async function copySnippet(key: SyncKeyInfo) {
    await navigator.clipboard.writeText(snippetFor(key.secret))
    setCopiedId(key.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  if (forbidden) return null
  return (
    <div className="sync-section">
      <h3>Or sync a live app</h3>
      <p className="share-note">
        For apps a crawler can't reach — behind a login, a VPN, or on localhost. Paste one script tag and each screen
        people visit lands here as a frame, imported once. Delete a frame to re-import it fresh. The key only writes to
        this canvas.
      </p>
      {(keys ?? []).map((k) => (
        <div key={k.id} className="sync-key">
          <div className="sync-key-row">
            <b>{k.name}</b>
            <span className="share-note">
              {k.frames ? `${k.frames} screen${k.frames === 1 ? '' : 's'}` : k.lastUsedAt ? 'synced' : 'never synced'}
            </span>
            <button className="share-remove" title="Revoke this key" onClick={() => revoke(k.id)}>
              ✕
            </button>
          </div>
          <div className="sync-snippet-wrap">
            <textarea
              className="sync-snippet"
              readOnly
              rows={4}
              value={snippetFor(k.secret)}
              onFocus={(e) => e.target.select()}
            />
            <button className="btn sync-copy" onClick={() => copySnippet(k)}>
              {copiedId === k.id ? 'Copied!' : '⧉ Copy'}
            </button>
          </div>
        </div>
      ))}
      <div className="share-invite-row">
        <input
          placeholder="App name (e.g. Admin dashboard)"
          value={name}
          disabled={busy}
          onChange={(e) => setAppName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button className="btn primary" disabled={busy || !name.trim()} onClick={create}>
          Create key
        </button>
      </div>
    </div>
  )
}

function CanvasName() {
  const canvas = useStore((s) => s.canvas)
  const [draft, setDraft] = useState<string | null>(null)
  if (!canvas) return <span className="canvas-name">…</span>
  return (
    <input
      className="canvas-name"
      value={draft ?? canvas.name}
      size={Math.max(6, (draft ?? canvas.name).length)}
      onFocus={() => setDraft(canvas.name)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim() && draft !== canvas.name) {
          api.renameCanvas(canvas.id, draft.trim()).catch(console.error)
          useStore.getState().renameCanvasLocal(draft.trim())
        }
        setDraft(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function Avatar({
  name,
  color,
  kind,
  status,
  owner,
}: {
  name: string
  color: string
  kind: 'user' | 'agent'
  status?: string
  owner?: string
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  /* branded agents wear their own colours — the tile and the pulse ring go brand,
     the mark sits on top in white; everyone else keeps their presence colour */
  const brand = kind === 'agent' ? agentBrand(name) : undefined
  const tile = brand?.bg ?? color
  return (
    <div
      className={`avatar ${kind}`}
      style={{ background: tile, color: tile }}
      title={`${name}${kind === 'agent' ? (owner ? ` (${owner}'s agent)` : ' (agent)') : ''}${status ? ` — ${status}` : ''}`}
    >
      <span style={{ color: '#fff', display: 'grid', placeItems: 'center' }}>
        {kind === 'agent' ? <AgentIcon name={name} size={15} color={brand?.fg ?? '#fff'} /> : initials}
      </span>
    </div>
  )
}
