import Anthropic from '@anthropic-ai/sdk'
import { firstConnected, withFreshToken } from './modelAccounts.ts'
import type { ModelAccount } from './modelAccounts.ts'
import { modelFor, ModelAuthError, runOpenAiTurn } from './openaiAgent.ts'
import type { StopReason, TurnBlock } from './openaiAgent.ts'

/**
 * Which model runs a Doop Agent turn, and on whose bill.
 *
 * The server's own ANTHROPIC_API_KEY pays for the free tasks every account
 * starts with. The moment a user connects a model account of their own — their
 * ChatGPT subscription or their own OpenAI key — their runs move onto it, and
 * the free-task meter stops applying to them entirely.
 *
 * A run is attributed to the humans whose cards, comments and feedback it
 * picked up, so the person who asked for the work is the person whose
 * subscription runs it.
 */

export type Provider = 'anthropic' | 'chatgpt' | 'openai-key'

export interface AgentTurnRequest {
  /** ordered system blocks; `cache` marks an Anthropic cache breakpoint */
  system: { text: string; cache?: boolean }[]
  tools: Anthropic.Tool[]
  messages: Anthropic.MessageParam[]
  maxTokens: number
}

export interface AgentTurnResult {
  content: TurnBlock[]
  stop_reason: StopReason
}

export interface AgentModel {
  provider: Provider
  /** for logs and the canvas status line, e.g. "ChatGPT (gpt-5)" */
  label: string
  /** the user whose account pays, when it isn't the server's key */
  userId?: string
  run(req: AgentTurnRequest): Promise<AgentTurnResult>
}

export { ModelAuthError }

const ANTHROPIC_MODEL = process.env.DOOP_AGENT_MODEL || 'claude-opus-5'

let anthropic: Anthropic | null = null
let warned = false

function anthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    if (!warned) {
      warned = true
      console.log(
        '[doop-agent] ANTHROPIC_API_KEY not set — the free Doop Agent tier is off. Users who connect their own ChatGPT subscription still get the agent; everyone else sees queued cards and @mentions go unpicked. See README → "The Doop Agent".',
      )
    }
    return null
  }
  if (!anthropic) anthropic = new Anthropic()
  return anthropic
}

function anthropicModel(client: Anthropic): AgentModel {
  return {
    provider: 'anthropic',
    label: `Doop (${ANTHROPIC_MODEL})`,
    async run(req) {
      const res = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: req.maxTokens,
        system: req.system.map((block) => ({
          type: 'text' as const,
          text: block.text,
          ...(block.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
        })),
        tools: req.tools,
        messages: req.messages,
      })
      const stop: StopReason =
        res.stop_reason === 'refusal'
          ? 'refusal'
          : res.stop_reason === 'max_tokens'
            ? 'max_tokens'
            : res.stop_reason === 'tool_use'
              ? 'tool_use'
              : 'end_turn'
      return { content: res.content as TurnBlock[], stop_reason: stop }
    },
  }
}

function openaiModel(account: ModelAccount): AgentModel {
  return {
    provider: account.kind,
    label: `${account.kind === 'chatgpt' ? 'ChatGPT' : 'OpenAI'} (${modelFor(account)})`,
    userId: account.userId,
    async run(req) {
      /* refreshed per turn, not per run: a long design run outlives an
         hour-long access token */
      const live = await withFreshToken(account)
      return runOpenAiTurn(live, {
        system: req.system.map((block) => block.text).join('\n\n'),
        tools: req.tools,
        messages: req.messages,
        maxTokens: req.maxTokens,
      })
    },
  }
}

/**
 * Pick the model for one run. `userIds` are the humans whose work the run
 * claimed, most relevant first. Returns null when nothing can run it — no
 * server key and nobody connected an account of their own.
 *
 * A connected account wins outright: someone who has just linked their ChatGPT
 * subscription expects the very next task to run on it, and the free tier is a
 * trial to get them here, not a balance to spend down first. It also means
 * connecting stops costing us anything from that moment on.
 */
export async function pickModel(userIds: (string | undefined)[]): Promise<AgentModel | null> {
  const candidates = [...new Set(userIds.filter((id): id is string => !!id))]
  const account = await firstConnected(candidates).catch((err) => {
    console.error('[doop-agent] could not read connected model accounts', err)
    return null
  })
  if (account) return openaiModel(account)
  const client = anthropicClient()
  return client ? anthropicModel(client) : null
}
