import { describe, expect, it, vi } from 'vitest'
import { executeGuardedBatch } from '../server/guardedBatch.ts'

describe('guarded tool batches', () => {
  it('runs website imports first and skips a speculative mutation after access is blocked', async () => {
    const calls = [{ name: 'create_frame' }, { name: 'import_webpage' }]
    const executed: string[] = []
    let blocked: string | undefined
    const execute = vi.fn(async (call: (typeof calls)[number]) => {
      executed.push(call.name)
      if (call.name === 'import_webpage') blocked = 'website blocked'
      return `${call.name}:executed`
    })

    const results = await executeGuardedBatch(calls, {
      priority: (call) => (call.name === 'import_webpage' ? 1 : 0),
      blocked: () => blocked,
      execute,
      skipped: (call, reason) => `${call.name}:skipped:${reason}`,
    })

    expect(executed).toEqual(['import_webpage'])
    expect(results).toEqual(['create_frame:skipped:website blocked', 'import_webpage:executed'])
  })

  it('can enforce a turn boundary after a successful website import', async () => {
    const calls = [{ name: 'create_frame' }, { name: 'import_webpage' }]
    const execute = vi.fn(async (call: (typeof calls)[number]) => `${call.name}:executed`)

    const results = await executeGuardedBatch(calls, {
      priority: (call) => (call.name === 'import_webpage' ? 1 : 0),
      blocked: (call) => (call.name === 'import_webpage' ? undefined : 'inspect the imported source first'),
      execute,
      skipped: (call, reason) => `${call.name}:skipped:${reason}`,
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(results).toEqual(['create_frame:skipped:inspect the imported source first', 'import_webpage:executed'])
  })
})
