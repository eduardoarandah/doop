import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/lib/utils'

/** A meter with a value a screen reader can read — the free-task allowance
 *  was a bare div whose only signal was its inline width. */
function Progress({ className, value = 0, max = 100, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const pct = max ? Math.max(0, Math.min(100, ((value ?? 0) / max) * 100)) : 0
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn('h-[5px] w-full flex-none overflow-hidden rounded-full bg-paper-deep', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full rounded-full bg-brand transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
