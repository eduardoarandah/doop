/** Execute a batch in priority order, but return results in the caller's
 * original order. Whenever the guard reports a reason for an operation, that
 * operation is represented by a skipped result instead of running
 * speculatively. */
export async function executeGuardedBatch<T, R>(
  items: readonly T[],
  options: {
    execute: (item: T) => Promise<R>
    blocked: (item: T) => string | undefined
    skipped: (item: T, reason: string) => R
    priority?: (item: T) => number
  },
): Promise<R[]> {
  const order = items.map((_, index) => index)
  const priority = options.priority
  if (priority) {
    order.sort((a, b) => priority(items[b]) - priority(items[a]) || a - b)
  }

  const results = new Array<R>(items.length)
  for (const index of order) {
    const item = items[index]
    const reason = options.blocked(item)
    results[index] = reason ? options.skipped(item, reason) : await options.execute(item)
  }
  return results
}
