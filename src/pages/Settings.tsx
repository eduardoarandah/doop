import { useState } from 'react'
import { navigate, Logo } from '../App'
import { api } from '../lib/api'
import { posthog } from '../lib/posthog'
import { ModelAccountPanel } from '../components/ModelAccount'
import { useAllowance } from '../components/TeamAllowance'
import { AccountSettings } from '../components/AccountSettings'
import { AccountMenu, ConnectCard, IconBack, IconChevron, IconSpark, IconUser } from '../components/DashShell'

type Pane = 'agent' | 'account'

/**
 * Account settings. Today it holds one thing — which model account the Doop
 * Agent runs on once the free tasks are spent — but it is the account-level
 * home for that kind of setting, so the canvas surfaces can link here instead
 * of carrying their own copy of it.
 *
 * It wears the same shell as the home dashboard: same rail, same top bar, same
 * account menu. Only the rail's middle changes, to a settings sub-nav.
 */
export function Settings() {
  /* the sub-nav switches panes rather than scrolling to an anchor — on a page
     this short an anchor jump looks like nothing happened */
  const [pane, setPane] = useState<Pane>('agent')
  const { allowance, refresh } = useAllowance()
  const left = allowance ? Math.max(0, allowance.limit - allowance.used) : null
  /* arriving from a canvas (the free-tier wall) should not cost you your
     place — only same-origin canvas paths are honoured */
  const from = new URLSearchParams(location.search).get('from')
  const back = from && /^\/c\/[A-Za-z0-9_-]+$/.test(from) ? from : '/'

  async function createCanvas() {
    const canvas = await api.createCanvas('Untitled canvas')
    posthog.capture('canvas_created')
    navigate(`/c/${canvas.id}`)
  }

  const meter =
    allowance && !allowance.connected
      ? allowance.byoModel
        ? `Running on your ${allowance.byoKind === 'openai-key' ? 'OpenAI key' : 'ChatGPT subscription'}.`
        : allowance.limit <= 0
          ? 'No free tasks on this server — connect an account to use the Doop Agent.'
          : left === 0
            ? 'Your free tasks are used up.'
            : `${left} of ${allowance.limit} free task${allowance.limit === 1 ? '' : 's'} left.`
      : null
  const filled = allowance && allowance.limit > 0 ? Math.round(((left ?? 0) / allowance.limit) * 100) : 0

  return (
    <div className="dash">
      <aside className="dash-rail">
        <div className="home-mark dash-brand">
          <Logo /> Doop
        </div>

        <button className="dash-back" onClick={() => navigate(back)}>
          <IconBack /> {back === '/' ? 'Back to canvases' : 'Back to canvas'}
        </button>

        <div className="dash-label">Settings</div>
        <nav className="dash-nav">
          <button
            className={`dash-nav-item${pane === 'agent' ? ' on' : ''}`}
            onClick={() => setPane('agent')}
            aria-current={pane === 'agent' ? 'page' : undefined}
          >
            <IconSpark /> Doop Agent
          </button>
          <button
            className={`dash-nav-item${pane === 'account' ? ' on' : ''}`}
            onClick={() => setPane('account')}
            aria-current={pane === 'account' ? 'page' : undefined}
          >
            <IconUser /> Your account
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
            <b>Settings</b>
          </nav>
          <span className="spacer" />
          <button className="btn primary" onClick={createCanvas}>
            + New canvas
          </button>
          <AccountMenu />
        </header>

        <div className="dash-body">
          <div className="dash-head">
            <div>
              <h1>{pane === 'agent' ? 'Doop Agent' : 'Your account'}</h1>
              <p className="sub">
                {pane === 'agent'
                  ? 'Which model account the agent runs on, for every canvas you work on.'
                  : 'Who you are on every canvas — and how you get back into this one.'}
              </p>
            </div>
          </div>

          {pane === 'agent' ? (
            <section className="set-card">
              <div className="set-head">
                <h2>Doop Agent</h2>
                <p>
                  The Doop Agent designs on your canvases without a client to connect. Every account gets a few tasks on
                  us. Connect an account of your own and it takes over from the next task — no limits, nothing metered.
                </p>
                {meter && (
                  <div className="set-meter">
                    {allowance && allowance.limit > 0 && !allowance.byoModel && (
                      <span className="set-bar">
                        <i style={{ width: `${filled}%` }} />
                      </span>
                    )}
                    <span>{meter}</span>
                  </div>
                )}
              </div>
              <ModelAccountPanel onChange={refresh} />
            </section>
          ) : (
            <AccountSettings />
          )}
        </div>
      </section>
    </div>
  )
}
