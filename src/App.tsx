import { useEffect, useRef, useState } from 'react'
import { Home } from './pages/Home'
import { CanvasPage } from './pages/CanvasPage'
import { AuthPage } from './pages/AuthPage'
import { Landing } from './pages/Landing'
import { Admin } from './pages/Admin'
import { authClient } from './lib/auth'
import { setName } from './lib/identity'
import { posthog, syncReplayForUser, suspendAnalyticsWhileImpersonating } from './lib/posthog'
import { useMe } from './lib/me'
import { adminApi } from './lib/api'

export function navigate(path: string) {
  history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function App() {
  const [path, setPath] = useState(location.pathname)
  const { data: session, isPending } = authClient.useSession()
  const me = useMe(session?.user.id)
  const identifiedUserId = useRef<string | null>(null)

  useEffect(() => {
    const onPop = () => setPath(location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /* The session is the auth boundary: this covers both successful login and
     restoring an existing session after a page refresh. */
  useEffect(() => {
    const user = session?.user
    if (!user) {
      if (identifiedUserId.current) {
        posthog.reset()
        identifiedUserId.current = null
      }
      return
    }
    /* Wait for /api/me before identifying anyone. Impersonation swaps the
       session cookie, so `user` here is the person being VIEWED — identifying
       them would write an admin's support session into that customer's
       profile and replay timeline. Only /api/me can tell the two apart. */
    if (!me) return
    if (me.impersonating) {
      suspendAnalyticsWhileImpersonating()
      identifiedUserId.current = null
      return
    }

    if (identifiedUserId.current === user.id) return
    if (identifiedUserId.current) posthog.reset()
    posthog.identify(user.id, { email: user.email, name: user.name })
    syncReplayForUser(user.email)
    identifiedUserId.current = user.id
  }, [session?.user, me])

  /* the account name is the identity shown on cursors and in the feed */
  useEffect(() => {
    if (session?.user?.name) setName(session.user.name)
  }, [session?.user?.name])

  if (isPending) return <div className="auth-page" />
  if (!session) {
    /* an interrupted MCP OAuth authorize redirect must land on the sign-in
       form (its resume logic reads these params), never the marketing page */
    const params = new URLSearchParams(location.search)
    const oauthResume = (params.has('client_id') && params.has('response_type')) || params.has('redirect_to')
    /* share-link visitors (/c/…) go straight to sign-in so the deep link
       survives — the canvas renders right after the session appears */
    if (path.startsWith('/auth') || path.startsWith('/c/') || oauthResume) return <AuthPage />
    return <Landing />
  }

  const canvasMatch = path.match(/^\/c\/([^/]+)/)
  const page = canvasMatch ? (
    <CanvasPage canvasId={canvasMatch[1]} key={canvasMatch[1]} />
  ) : path.startsWith('/admin') ? (
    <Admin />
  ) : (
    <Home />
  )

  /* The banner is not decoration: an impersonated session looks exactly like
     being signed in as that person, and forgetting you are in one is how
     support tools cause incidents. */
  return me?.impersonating ? (
    <>
      <ImpersonationBanner name={session.user.name} />
      <div className="impersonating-shell">{page}</div>
    </>
  ) : (
    page
  )
}

function ImpersonationBanner({ name }: { name: string }) {
  const [leaving, setLeaving] = useState(false)
  return (
    <div className="impersonation-banner">
      <span>
        Viewing as <strong>{name}</strong> — read only, expires after 15 minutes.
      </span>
      <button
        className="btn ghost small"
        disabled={leaving}
        onClick={() => {
          setLeaving(true)
          /* the cookie swaps back to the admin's own session; reload rather
             than reconcile every piece of per-user state in memory */
          adminApi
            .stopImpersonating()
            .then(() => location.assign('/admin'))
            .catch(() => location.assign('/'))
        }}
      >
        {leaving ? 'Leaving…' : 'Stop viewing'}
      </button>
    </div>
  )
}

/** The layered D: two stacked frames — the human's layer over the agent's —
 *  forming Doop's initial. (From the founder's sketch, identity round 7.) */
export function Logo({ className = 'logo' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <rect width="100" height="100" rx="20" fill="#1C1A15" />
      <path
        d="M37 31 H63 A10 10 0 0 1 73 41 V63 A10 10 0 0 1 63 73 H37 Z"
        fill="none"
        stroke="#E5533C"
        strokeWidth="6"
      />
      <path
        d="M28 22 H54 A10 10 0 0 1 64 32 V54 A10 10 0 0 1 54 64 H28 Z"
        fill="none"
        stroke="#F2EFE6"
        strokeWidth="6"
      />
    </svg>
  )
}
