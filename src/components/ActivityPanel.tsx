import { useEffect, useMemo, useState } from 'react'
import type { AgentTask } from '../../shared/types'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { timeAgo } from '../lib/time'
import { AgentIcon } from './AgentIcon'
import { MemoryPanel } from './MemoryPanel'
import { isResidentLimit } from './TeamAllowance'

/* feedback and retries are metered like any other resident task — a 403
   here means the free tier ran out, so raise the connect wall */
function reportLimit(err: unknown) {
  if (isResidentLimit(err)) useStore.getState().setLimitWall(true)
  else console.error(err)
}

function duration(t: AgentTask): string {
  const end = t.endedAt ?? Date.now()
  const s = Math.max(1, Math.round((end - t.startedAt) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60 ? `${s % 60}s` : ''}`.trim()
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function ActivityPanel({ onClose }: { onClose: () => void }) {
  const tab = useStore((s) => s.panelTab)
  const setTab = useStore((s) => s.setPanelTab)
  const [, tick] = useState(0)

  /* refresh relative timestamps and running durations */
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 5000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="side-panel">
      <header>
        <div className="panel-tabs">
          <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
            Agents
          </button>
          <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>
            Activity
          </button>
          <button
            className={tab === 'memory' ? 'active' : ''}
            onClick={() => setTab('memory')}
            title="Design memory — references, rules and decisions every agent on this canvas designs with"
          >
            Memory
          </button>
        </div>
        <button onClick={onClose} title="Close">
          ✕
        </button>
      </header>
      {tab === 'tasks' ? <TaskList /> : tab === 'activity' ? <ActivityList /> : <MemoryPanel />}
    </div>
  )
}

/* Task history grouped by agent, à la Cursor's agent panel: the active task
   pulses at the top of each group, finished ones are checked off below. */
function TaskList() {
  const tasks = useStore((s) => s.tasks)

  const groups = useMemo(() => {
    const byAgent = new Map<string, AgentTask[]>()
    for (const t of tasks) {
      // Unclaimed board cards belong in the Board's Queued column. They have
      // no agent identity yet, so rendering them here creates a blank group.
      if (!t.agentName) continue
      const key = t.agentName
      const list = byAgent.get(key) ?? []
      list.push(t) // tasks arrive newest first, so groups stay newest first too
      byAgent.set(key, list)
    }
    /* agents ordered by their most recent task */
    return [...byAgent.entries()]
  }, [tasks])

  if (groups.length === 0) {
    return (
      <div className="activity-list">
        <div className="activity-empty">
          No tasks yet. Agents announce what they're working on here — the history sticks around after they finish.
        </div>
      </div>
    )
  }

  return (
    <div className="activity-list task-list">
      {groups.map(([key, list]) => (
        <TaskGroup key={key} list={list} />
      ))}
    </div>
  )
}

/* Long histories collapse to the latest few per agent — the panel is a
   "what's happening" surface, not an archive. */
const TASKS_SHOWN_INITIALLY = 5
const TASKS_SHOWN_STEP = 15

function TaskGroup({ list }: { list: AgentTask[] }) {
  const [shown, setShown] = useState(TASKS_SHOWN_INITIALLY)
  const hidden = list.length - shown

  return (
    <div className="task-group">
      <div className="task-agent">
        <span className="dot" style={{ background: list[0].color }} />
        <span className="who">
          <AgentIcon name={list[0].agentName} /> {list[0].agentName}
          {list[0].owner && <span className="task-owner">for {list[0].owner}</span>}
          {list[0].failedAt ? (
            <span className="failed-tag">needs retry</span>
          ) : !list[0].endedAt ? (
            <span className="live-tag">working</span>
          ) : null}
        </span>
      </div>
      {list.slice(0, shown).map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
      {hidden > 0 && (
        <button className="task-more" onClick={() => setShown((n) => n + TASKS_SHOWN_STEP)}>
          Show {Math.min(hidden, TASKS_SHOWN_STEP)} more ({hidden} older)
        </button>
      )}
    </div>
  )
}

/* One task, with its human-feedback thread and a reply box. Feedback is
   delivered to the agent inside its next MCP tool result; the entry flips
   from "sending to agent…" to "seen" once that delivery happens. */
function TaskRow({ task }: { task: AgentTask }) {
  const canvasId = useStore((s) => s.canvas?.id)
  const feedback = useStore((s) => s.feedback.filter((f) => f.taskId === task.id))
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')

  async function submit() {
    const text = draft.trim()
    if (!text) return setReplying(false)
    setDraft('')
    setReplying(false)
    try {
      await api.sendTaskFeedback(task.id, text)
    } catch (e) {
      reportLimit(e)
    }
  }

  return (
    <div className={`task-row ${task.endedAt || task.failedAt ? '' : 'is-active'}${task.failedAt ? ' is-failed' : ''}`}>
      <div
        className={`task-item ${task.endedAt ? 'done' : task.failedAt ? 'failed' : 'active'}${task.auto ? ' auto' : ''}`}
      >
        {task.failedAt ? (
          <span className="task-failed-mark">!</span>
        ) : task.endedAt ? (
          <span className="task-check">✓</span>
        ) : (
          <span className="pulse-dot" style={{ background: task.color }} />
        )}
        <span className="task-status">{task.status}</span>
        <span className="task-time">
          {task.failedAt
            ? timeAgo(task.failedAt)
            : task.endedAt
              ? `${duration(task)} · ${timeAgo(task.endedAt)}`
              : duration(task)}
        </span>
        {task.failedAt && task.queuedBy && canvasId ? (
          <button className="retry-action compact" onClick={() => api.retryCard(canvasId, task.id).catch(reportLimit)}>
            ↻ Retry
          </button>
        ) : null}
        {!replying && (
          <button
            className="task-reply-btn"
            title="Give the agent feedback on this task"
            onClick={() => setReplying(true)}
          >
            ↩
          </button>
        )}
      </div>
      {feedback
        .slice()
        .reverse()
        .map((f) => (
          <div key={f.id} className="task-feedback">
            <span className="fb-from">{f.from}:</span> <span className="fb-text">{f.text}</span>
            {f.failedAt ? (
              <span className="fb-failed">
                {f.failureReason ?? 'The agent did not finish.'}
                <button className="retry-action compact" onClick={() => api.retryTaskFeedback(f.id).catch(reportLimit)}>
                  ↻ Retry
                </button>
              </span>
            ) : (
              <span className={`fb-state ${f.deliveredAt ? 'seen' : ''}`}>
                {f.completedAt
                  ? `✓ handled by ${f.claimedBy ?? 'an agent'}`
                  : f.deliveredAt
                    ? `↗ picked up by ${f.claimedBy ?? 'an agent'}`
                    : '→ waiting for an agent…'}
              </span>
            )}
          </div>
        ))}
      {replying && (
        <div className="task-feedback-input">
          <input
            autoFocus
            placeholder="Feedback — any agent will pick this up…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') setReplying(false)
            }}
            onBlur={() => (draft.trim() ? submit() : setReplying(false))}
          />
        </div>
      )}
    </div>
  )
}

function ActivityList() {
  const activity = useStore((s) => s.activity)
  return (
    <div className="activity-list">
      {activity.length === 0 && (
        <div className="activity-empty">No activity yet. Add a frame, or connect an agent.</div>
      )}
      {activity.map((a) => (
        <div key={a.id} className="activity-item">
          <span className="dot" style={{ background: a.actorColor }} />
          <div>
            <div>
              <span className="who">
                {a.actorName}
                <span className="kind">{a.actorKind}</span>
              </span>{' '}
              <span className="msg">{a.message}</span>
            </div>
            <div className="when">{timeAgo(a.at)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
