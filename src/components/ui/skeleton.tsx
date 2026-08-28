import * as React from 'react'

import { cn } from '@/lib/utils'

/** Loading placeholder — the pulse every empty tile and row shares. `index`
 *  staggers a grid of them so the wait reads as one wave, not a flash. */
function Skeleton({ className, index = 0, style, ...props }: React.ComponentProps<'div'> & { index?: number }) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-[skeleton-pulse_1.4s_ease-in-out_infinite] rounded-lg bg-paper-deep', className)}
      style={{ animationDelay: `${index * 0.12}s`, ...style }}
      {...props}
    />
  )
}

export { Skeleton }
