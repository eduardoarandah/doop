import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { Allowance } from '../lib/api'
import { posthog } from '../lib/posthog'
import { useStore } from '../lib/store'
import { navigate } from '../App'
import { ConnectBody, AgentArrival } from './ConnectModal'

/**
 * Free-tier metering UI for the resident team: the shared allowance hook,
 * the "n free team tasks left" line, and the wall that appears when they're
 * gone. Server-enforced; this is only the mirror of /api/agent-allowance.
 */

export type { Allowance }

export function useAllowance(): { allowance: Allowance | null; refresh: () => void } {
  const [allowance, setAllowance] = useState<Allowance | null>(null)
  /* re-read whenever a model account is connected or dropped anywhere in the
     app, so every meter on screen agrees without prop-drilling */
  const version = useStore((s) => s.allowanceVersion)
  const refresh = useCallback(() => {
    api.agentAllowance().then(setAllowance, () => {})
  }, [])
  useEffect(refresh, [refresh, version])
  return { allowance, refresh }
}

/** True when this failure is the free tier running out (shows the wall). */
export function isResidentLimit(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && err.body.error === 'resident_limit'
}

export function MeterLine({ allowance }: { allowance: Allowance | null }) {
  if (!allowance || allowance.connected) return null
  /* their own account is behind the agent now — say so instead of counting,
     and say it even where there is no free tier to count (limit 0) */
  if (allowance.byoModel) {
    return (
      <span className="meter-line byo">
        Doop Agent on your {allowance.byoKind === 'openai-key' ? 'OpenAI key' : 'ChatGPT'}
      </span>
    )
  }
  if (allowance.limit <= 0) return null
  const left = Math.max(0, allowance.limit - allowance.used)
  return (
    <span className={`meter-line${left === 0 ? ' out' : ''}`}>
      {left === 0
        ? 'free Doop Agent tasks used up — connect ChatGPT to continue'
        : `${left} of ${allowance.limit} free Doop Agent task${allowance.limit === 1 ? '' : 's'} left`}
    </span>
  )
}

export function LimitWall({ canvasId, onClose }: { canvasId: string; onClose: () => void }) {
  const [showMcp, setShowMcp] = useState(false)
  useEffect(() => {
    posthog.capture('resident_limit_hit')
  }, [])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your free Doop Agent tasks are used up</h2>
        <p className="lede">
          Those were on the house. Connect your <b>ChatGPT subscription</b> and the Doop Agent keeps working exactly as
          it does now — same canvas, same agent, running on your plan instead of ours.
        </p>
        {/* the connection itself is an account setting, so this hands off to
            Settings rather than carrying a second copy of the panel */}
        <div className="close-row start">
          <button
            className="btn primary"
            onClick={() => {
              posthog.capture('resident_limit_connect_clicked')
              /* carry the canvas so Settings can send them straight back */
              navigate(`/settings?from=${encodeURIComponent(`/c/${canvasId}`)}`)
            }}
          >
            Connect your subscription
          </button>
        </div>

        <button className="ma-toggle" onClick={() => setShowMcp((v) => !v)}>
          {showMcp ? '− ' : '+ '}Or drive the canvas from your own agent (Claude Code, Codex)
        </button>
        {showMcp && (
          <>
            <ConnectBody canvasId={canvasId} />
            <div className="close-row">
              <AgentArrival />
            </div>
          </>
        )}

        <div className="close-row">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
