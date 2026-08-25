import { useState } from 'react'
import { authClient } from '../lib/auth'
import { posthog } from '../lib/posthog'

/** The "Your account" pane of /settings: who you are on a canvas, and how you
 *  get back into one. Everything here is better-auth's own account surface —
 *  no endpoints of ours. */
export function AccountSettings() {
  const { data: session } = authClient.useSession()
  const user = session?.user

  /* null while untouched, so the field tracks the session until you type */
  const [draft, setDraft] = useState<string | null>(null)
  const name = draft ?? user?.name ?? ''
  const dirty = name.trim().length > 0 && name.trim() !== (user?.name ?? '')

  const [savingName, setSavingName] = useState(false)
  const [nameNote, setNameNote] = useState('')
  const [nameError, setNameError] = useState('')

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwNote, setPwNote] = useState('')
  const [pwError, setPwError] = useState('')

  const [verifyNote, setVerifyNote] = useState('')

  async function saveName() {
    setSavingName(true)
    setNameNote('')
    setNameError('')
    const { error } = await authClient.updateUser({ name: name.trim() })
    setSavingName(false)
    if (error) return setNameError(error.message || 'That name could not be saved')
    posthog.capture('account_name_changed')
    setDraft(null)
    setNameNote('Saved — agents pick it up within a minute')
  }

  async function savePassword() {
    setSavingPw(true)
    setPwNote('')
    setPwError('')
    /* revoking is the point: a password change you make because you fear a
       device is compromised is useless if that device stays signed in */
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    })
    setSavingPw(false)
    if (error) return setPwError(error.message || 'That password could not be changed')
    posthog.capture('account_password_changed')
    setCurrent('')
    setNext('')
    setPwNote('Password updated — every other session was signed out')
  }

  async function resendVerification() {
    if (!user?.email) return
    setVerifyNote('')
    const { error } = await authClient.sendVerificationEmail({ email: user.email })
    setVerifyNote(error ? error.message || 'That email could not be sent' : 'Verification email sent')
  }

  return (
    <>
      <section className="set-card">
        <div className="set-head">
          <h2>Profile</h2>
          <p>
            Your name is the identity shown on cursors, in the activity feed, and on everything you leave for an agent.
            Agents see the change within a minute.
          </p>
        </div>

        <div className="set-row">
          <span className="k">Name</span>
          <span className="f">
            <input
              value={name}
              onChange={(e) => {
                setDraft(e.target.value)
                setNameNote('')
                setNameError('')
              }}
              maxLength={60}
              aria-label="Display name"
            />
            {nameError ? (
              <span className="set-msg bad">{nameError}</span>
            ) : nameNote ? (
              <span className="set-msg good">{nameNote}</span>
            ) : dirty ? (
              <span className="set-msg">Changed — not saved yet</span>
            ) : null}
          </span>
          <span className="set-right">
            <button className="btn small" disabled={!dirty || savingName} onClick={saveName}>
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </span>
        </div>

        <div className="set-row">
          <span className="k">Email</span>
          <span className="f">
            <span className="set-ro">{user?.email}</span>
            {user?.emailVerified ? (
              <span className="set-pill ok">verified</span>
            ) : (
              <span className="set-pill">unverified</span>
            )}
            {verifyNote && <span className="set-msg good">{verifyNote}</span>}
          </span>
          <span className="set-right">
            {user?.emailVerified ? (
              <span className="set-msg">Sign-in address — not changeable yet</span>
            ) : (
              <button className="btn small" onClick={resendVerification}>
                Resend verification
              </button>
            )}
          </span>
        </div>
      </section>

      <section className="set-card">
        <div className="set-head">
          <h2>Password</h2>
          <p>Changing it signs out every other browser and device — this one stays signed in.</p>
        </div>
        <div className="set-row">
          <span className="k">Current password</span>
          <span className="f">
            <input
              type="password"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value)
                setPwError('')
              }}
              autoComplete="current-password"
              aria-label="Current password"
            />
          </span>
        </div>
        <div className="set-row">
          <span className="k">New password</span>
          <span className="f">
            <input
              type="password"
              value={next}
              onChange={(e) => {
                setNext(e.target.value)
                setPwError('')
              }}
              autoComplete="new-password"
              aria-label="New password"
            />
            {pwError ? (
              <span className="set-msg bad">{pwError}</span>
            ) : pwNote ? (
              <span className="set-msg good">{pwNote}</span>
            ) : (
              <span className="set-msg">At least 8 characters</span>
            )}
          </span>
          <span className="set-right">
            <button className="btn small" disabled={savingPw || !current || next.length < 8} onClick={savePassword}>
              {savingPw ? 'Updating…' : 'Update password'}
            </button>
          </span>
        </div>
      </section>
    </>
  )
}
