import { useState } from 'react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { timeAgo } from '../lib/time'
import {
  AGENT_ROLES,
  DEFAULT_ROLE_ID,
  PIPELINE_PRESETS,
  roleByAgentName,
  roleById,
  roleName,
} from '../../shared/agents'
import type { AgentTask } from '../../shared/types'
import { posthog } from '../lib/posthog'
import { MeterLine, isResidentLimit, useAllowance } from './TeamAllowance'

/**
 * Board view over the canvas's tasks: queued cards humans leave for agents,
 * live work (claimed cards + agent status tasks), and what's done. Cards are
 * plain AgentTask objects, so everything updates over the same ws stream.
 *
 * A card names an ordered pipeline of agents — design → copy → brand → a11y —
 * and moves down it one stage at a time; the trail on each card is the live
 * position in that pipeline.
 */

function pipelineOf(t: AgentTask): string[] {
  return t.pipeline?.length ? t.pipeline : [DEFAULT_ROLE_ID]
}

/** The pipeline of a card with its current position marked. */
function Trail({ task, state }: { task: AgentTask; state: 'queued' | 'working' | 'done' }) {
  const pipeline = pipelineOf(task)
  const at = Math.min(task.stage ?? 0, pipeline.length - 1)
  return (
    <div className="pipe">
      {pipeline.map((id, i) => {
        const role = roleById(id)
        const phase = state === 'done' || i < at ? 'past' : i === at ? state : 'ahead'
        return (
          <span key={id} className={`pipe-step ${phase}`} title={role?.blurb}>
            <span className="pipe-glyph">{role?.emoji ?? '✦'}</span>
            {role?.name ?? id}
          </span>
        )
      })}
    </div>
  )
}

/** The roster: who is on the team, what each one owns, and what they're on. */
function Team({ tasks, onPick }: { tasks: AgentTask[]; onPick: (id: string) => void }) {
  return (
    <div className="team">
      <div className="team-head">
        <h2>The team</h2>
        <span className="team-hint">Pick one to queue a card · @mention them on any element</span>
      </div>
      <div className="team-row">
        {AGENT_ROLES.map((role) => {
          const working = tasks.find((t) => t.agentName === role.name && !t.endedAt && !t.failedAt)
          const waiting = tasks.filter(
            (t) => t.queuedBy && !t.agentName && !t.failedAt && !t.endedAt && pipelineOf(t)[t.stage ?? 0] === role.id,
          ).length
          return (
            <button
              key={role.id}
              className={`team-card${working ? ' busy' : ''}`}
              onClick={() => onPick(role.id)}
              title={`Queue a card for ${role.name}`}
            >
              <span className="team-name">
                <span className="pipe-glyph">{role.emoji}</span>
                {role.name}
                <span className="team-mention">@{role.id}</span>
              </span>
              <span className="team-blurb">{role.blurb}</span>
              <span className="team-state">
                {working ? (
                  <>
                    <span className="bdot" style={{ background: role.reviewer ? '#1e7a4c' : 'var(--accent)' }} />
                    {working.status}
                  </>
                ) : waiting > 0 ? (
                  `${waiting} card${waiting > 1 ? 's' : ''} waiting`
                ) : (
                  'idle'
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Board({ canvasId }: { canvasId: string }) {
  const tasks = useStore((s) => s.tasks)
  const [draft, setDraft] = useState<string | null>(null)
  const [agents, setAgents] = useState<string[]>([DEFAULT_ROLE_ID])
  const { allowance, refresh } = useAllowance()

  const failed = tasks.filter((t) => t.queuedBy && t.failedAt && !t.endedAt)
  const queued = tasks.filter((t) => t.queuedBy && !t.agentName && !t.failedAt && !t.endedAt)
  const inProgress = tasks.filter((t) => t.agentName && !t.failedAt && !t.endedAt)
  const done = tasks.filter((t) => t.endedAt).slice(0, 14)

  /* clicking a chip appends it to the pipeline, so click order = run order */
  function toggle(id: string) {
    setAgents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function openCompose() {
    setAgents([DEFAULT_ROLE_ID])
    setDraft('')
  }

  async function submit() {
    const title = draft?.trim()
    const pipeline = agents.length > 0 ? agents : [DEFAULT_ROLE_ID]
    setDraft(null)
    if (!title) return
    try {
      await api.addCard(canvasId, title, pipeline)
      posthog.capture('agent_task_queued', { pipeline_length: pipeline.length })
    } catch (err) {
      if (isResidentLimit(err)) useStore.getState().setLimitWall(true)
      else console.error(err)
    }
    refresh()
  }

  /* picking an agent from the roster opens a card already assigned to it */
  function composeFor(id: string) {
    setAgents([id])
    setDraft('')
  }

  return (
    <div className="board-view">
      <Team tasks={tasks} onPick={composeFor} />
      <div className="board">
        <section>
          <div className="bcol-head">
            <h2>Queued</h2>
            <span className="bcount">{queued.length + failed.length}</span>
          </div>
          <div className="bcol">
            {failed.map((t) => (
              <div key={t.id} className="bcard bfailed">
                <button
                  className="bdismiss"
                  aria-label="Remove this card"
                  title="Remove this card"
                  onClick={() => api.completeCard(canvasId, t.id).catch(console.error)}
                >
                  ✕
                </button>
                <h3>{t.status}</h3>
                <Trail task={t} state="queued" />
                <div className="bmeta">
                  <b>Attempt stopped</b>
                  {t.agentName ? <span> · {t.agentName}</span> : null}
                  <span> · {timeAgo(t.failedAt!)}</span>
                </div>
                <div className="bfailure">{t.failureReason ?? 'The agent did not finish this task.'}</div>
                <button
                  className="retry-action"
                  onClick={() =>
                    api.retryCard(canvasId, t.id).catch((err) => {
                      if (isResidentLimit(err)) useStore.getState().setLimitWall(true)
                      else console.error(err)
                    })
                  }
                >
                  ↻ Retry
                </button>
              </div>
            ))}
            {queued.map((t) => (
              <div key={t.id} className="bcard">
                <button
                  className="bdismiss"
                  title="Remove this card"
                  onClick={() => api.completeCard(canvasId, t.id).catch(console.error)}
                >
                  ✕
                </button>
                <h3>{t.status}</h3>
                <Trail task={t} state="queued" />
                <div className="bmeta">
                  <b>{t.queuedBy}</b> · {timeAgo(t.startedAt)}
                </div>
                <div className="bwaiting">✦ waiting for {roleName(pipelineOf(t)[t.stage ?? 0])}</div>
              </div>
            ))}
            {draft === null ? (
              <button className="bghost" onClick={openCompose}>
                + New card
              </button>
            ) : (
              <div className="bcard bcompose">
                <textarea
                  autoFocus
                  value={draft}
                  placeholder="What should an agent work on?"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submit()
                    }
                    if (e.key === 'Escape') setDraft(null)
                  }}
                />
                <div className="assign">
                  <div className="assign-head">
                    <span>Assign to</span>
                    <div className="presets">
                      {PIPELINE_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          className={agents.join(',') === p.roles.join(',') ? 'on' : ''}
                          onClick={() => setAgents(p.roles)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="agent-chips">
                    {AGENT_ROLES.map((role) => {
                      const at = agents.indexOf(role.id)
                      return (
                        <button
                          key={role.id}
                          className={`agent-chip${at >= 0 ? ' on' : ''}`}
                          title={role.blurb}
                          onClick={() => toggle(role.id)}
                        >
                          <span className="pipe-glyph">{role.emoji}</span>
                          {role.name}
                          {at >= 0 && agents.length > 1 && <span className="chip-order">{at + 1}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="bcompose-row">
                  <button className="bpost" disabled={!draft.trim()} onClick={submit}>
                    Queue it
                  </button>
                  <MeterLine allowance={allowance} />
                  <span className="bhint">
                    {agents.length === 0
                      ? 'Doop picks it up right away'
                      : agents.length === 1
                        ? `${roleName(agents[0])} picks it up right away`
                        : `${roleName(agents[0])} starts, then ${agents.slice(1).map(roleName).join(' → ')}`}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="bcol-head active">
            <h2>In progress</h2>
            <span className="bcount">{inProgress.length}</span>
          </div>
          <div className="bcol">
            {inProgress.length === 0 && <div className="bempty">Nothing in flight</div>}
            {inProgress.map((t) => (
              <div key={t.id} className="bcard working">
                <h3>{t.status}</h3>
                {t.queuedBy && <Trail task={t} state="working" />}
                <div className="bmeta">
                  <span className="bdot" style={{ background: t.color }} />
                  <b>
                    {roleByAgentName(t.agentName)?.emoji ?? '✦'} {t.agentName}
                  </b>
                  {t.owner && <span> · for {t.owner}</span>}
                  {t.queuedBy && <span> · card from {t.queuedBy}</span>}
                  <span> · {timeAgo(t.claimedAt ?? t.startedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="bcol-head">
            <h2>Done</h2>
            <span className="bcount">{done.length}</span>
          </div>
          <div className="bcol">
            {done.length === 0 && <div className="bempty">Nothing yet</div>}
            {done.map((t) => (
              <div key={t.id} className="bcard bdone">
                <h3>{t.status}</h3>
                {t.queuedBy && pipelineOf(t).length > 1 && <Trail task={t} state="done" />}
                <div className="bmeta">
                  <span className="bok">✓</span> {t.agentName || t.queuedBy}
                  {t.queuedBy && t.agentName && <span> · for {t.queuedBy}</span>}
                  <span> · {timeAgo(t.endedAt!)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
