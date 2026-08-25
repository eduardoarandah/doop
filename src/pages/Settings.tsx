import { authClient } from '../lib/auth'
import { navigate, Logo } from '../App'
import { ModelAccountPanel } from '../components/ModelAccount'
import { useAllowance } from '../components/TeamAllowance'

/**
 * Account settings. Today it holds one thing — which model account the Doop
 * Agent runs on once the free tasks are spent — but it is the account-level
 * home for that kind of setting, so the canvas surfaces can link here instead
 * of carrying their own copy of it.
 */
export function Settings() {
  const { data: session } = authClient.useSession()
  const { allowance, refresh } = useAllowance()
  const left = allowance ? Math.max(0, allowance.limit - allowance.used) : null
  /* arriving from a canvas (the free-tier wall) should not cost you your
     place — only same-origin canvas paths are honoured */
  const from = new URLSearchParams(location.search).get('from')
  const back = from && /^\/c\/[A-Za-z0-9_-]+$/.test(from) ? from : '/'

  return (
    <div className="home settings-page">
      <div className="home-inner">
        <div className="home-mark">
          <button className="home-logo" onClick={() => navigate('/')}>
            <Logo />
            <span>Doop</span>
          </button>
          <span className="home-account">
            {session?.user?.name}
            <button className="btn ghost" onClick={() => navigate(back)}>
              {back === '/' ? 'Back to canvases' : 'Back to canvas'}
            </button>
          </span>
        </div>

        <h1 className="settings-title">Settings</h1>

        <section className="settings-card">
          <div className="settings-head">
            <h2>Doop Agent</h2>
            <p>
              The Doop Agent designs on your canvases without a client to connect. Every account gets a few tasks on us.
              Connect an account of your own and it takes over from the next task — no limits, nothing metered.
            </p>
            {allowance && !allowance.connected && (
              <p className="settings-meter">
                {allowance.byoModel
                  ? `Running on your ${allowance.byoKind === 'openai-key' ? 'OpenAI key' : 'ChatGPT subscription'}.`
                  : allowance.limit <= 0
                    ? 'No free tasks on this server — connect an account to use the Doop Agent.'
                    : left === 0
                      ? 'Your free tasks are used up.'
                      : `${left} of ${allowance.limit} free task${allowance.limit === 1 ? '' : 's'} left.`}
              </p>
            )}
          </div>
          <ModelAccountPanel onChange={refresh} />
        </section>

        <section className="settings-card">
          <div className="settings-head">
            <h2>Your account</h2>
            <p>
              Signed in as <b>{session?.user?.email}</b>. Your account name is the identity shown on cursors, in the
              activity feed, and on everything you leave for an agent.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
