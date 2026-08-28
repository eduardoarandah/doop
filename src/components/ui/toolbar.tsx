import * as React from 'react'

import { cn } from '@/lib/utils'

/* The floating pill of quiet controls that hovers over the canvas. Its buttons
   grow to a 40px touch target on phones — small enough to read as a toolbar,
   big enough to hit. */
function Toolbar({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="toolbar"
      role="toolbar"
      className={cn(
        'flex items-center gap-px rounded-[12px] border border-line bg-surface p-1 shadow-pop sm:gap-1 sm:p-[5px]',
        className,
      )}
      {...props}
    />
  )
}

function ToolbarButton({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      data-slot="toolbar-button"
      className={cn(
        'min-h-10 rounded-lg border-0 bg-transparent px-[9px] py-[7px] text-[13px] font-semibold text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink sm:min-h-0 sm:px-3 sm:py-2',
        className,
      )}
      {...props}
    />
  )
}

function ToolbarDivider({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="toolbar-divider" className={cn('mx-1 h-5 w-px bg-line', className)} {...props} />
}

/** A read-only readout between controls (the zoom percentage). */
const ToolbarValue = React.forwardRef<HTMLSpanElement, React.ComponentProps<'span'>>(function ToolbarValue(
  { className, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      data-slot="toolbar-value"
      className={cn('min-w-[44px] text-center font-mono text-xs sm:min-w-[52px]', className)}
      {...props}
    />
  )
})

export { Toolbar, ToolbarButton, ToolbarDivider, ToolbarValue }
