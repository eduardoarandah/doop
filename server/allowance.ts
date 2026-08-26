import { eq, sql } from 'drizzle-orm'
import { db } from './db/index.ts'
import { residentUsage } from './db/schema.ts'
import { oauthAccessToken } from './db/auth-schema.ts'
import { getStatus } from './modelAccounts.ts'
import type { AccountKind } from './modelAccounts.ts'

/**
 * Free-tier metering for the resident design team. Anything that triggers
 * resident work consumes one of RESIDENT_TASK_LIMIT free tasks: a board card,
 * an element comment that @mentions a resident, feedback on a task, and every
 * retry. Two things lift the meter entirely: connecting your own MCP agent
 * (Claude Code, Codex — your subscription, your model, driving the canvas
 * from outside), or connecting a model account so the Doop Agent itself runs
 * on your ChatGPT subscription or OpenAI key. Both take effect immediately —
 * a connected user is never metered again, and their remaining free tasks
 * simply stop being relevant.
 */

export const RESIDENT_TASK_LIMIT = Math.max(0, Number(process.env.RESIDENT_TASK_LIMIT ?? 5))

export interface Allowance {
  used: number
  limit: number
  /** the user has completed the MCP OAuth flow with their own agent */
  connected: boolean
  /** the user connected a model account the Doop Agent can run on */
  byoModel: boolean
  /** which kind, for the UI copy */
  byoKind?: AccountKind
  /** the ChatGPT account's email, so the UI can name what is connected */
  byoEmail?: string
  /** the agent is running on this user's own account right now — connecting
   *  takes effect immediately, it does not wait for the free tasks to run out */
  onOwnAccount: boolean
}

/** An OAuth access token ever issued to this user = an agent of their own
 *  completed the connect flow. Expired rows still count — the point is proof
 *  they can connect, not a live session. */
async function hasOwnAgent(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: oauthAccessToken.id })
    .from(oauthAccessToken)
    .where(eq(oauthAccessToken.userId, userId))
    .limit(1)
  return !!row
}

async function usedCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ used: residentUsage.used })
    .from(residentUsage)
    .where(eq(residentUsage.userId, userId))
  return row?.used ?? 0
}

export async function getAllowance(userId: string): Promise<Allowance> {
  const [connected, used, model] = await Promise.all([
    hasOwnAgent(userId),
    usedCount(userId),
    getStatus(userId).catch(() => ({ connected: false }) as Awaited<ReturnType<typeof getStatus>>),
  ])
  return {
    used,
    limit: RESIDENT_TASK_LIMIT,
    connected,
    byoModel: model.connected,
    ...(model.kind ? { byoKind: model.kind } : {}),
    ...(model.email ? { byoEmail: model.email } : {}),
    onOwnAccount: model.connected,
  }
}

/** Spend one resident task. ok:false = the free tier is used up and the user
 *  has neither connected an agent of their own nor a model account for the
 *  Doop Agent to run on. */
export async function consumeResidentTask(userId: string): Promise<Allowance & { ok: boolean }> {
  const current = await getAllowance(userId)
  if (current.connected || current.byoModel) return { ...current, ok: true }
  if (current.used >= current.limit) return { ...current, ok: false }
  /* guarded upsert: concurrent requests can never push `used` past the limit */
  const rows = await db
    .insert(residentUsage)
    .values({ userId, used: 1, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: residentUsage.userId,
      set: { used: sql`${residentUsage.used} + 1`, updatedAt: Date.now() },
      setWhere: sql`${residentUsage.used} < ${RESIDENT_TASK_LIMIT}`,
    })
    .returning({ used: residentUsage.used })
  const applied = rows[0]
  if (!applied) return { ...current, used: current.limit, ok: false }
  return { ...current, used: applied.used, ok: true }
}
