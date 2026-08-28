import * as React from 'react'

import { cn } from '@/lib/utils'

/* The stacked rows panels are built from: a caption, an optional explanatory
   line, then rows that are usually buttons. Kept dumb — callers decide what
   goes in the title and meta slots. */
function ListSection({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-section"
      className={cn(
        'flex items-center justify-between gap-2 px-4 pb-1.5 pt-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-faint',
        className,
      )}
      {...props}
    />
  )
}

/** The explanatory line an empty section shows instead of rows. */
function ListHint({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-hint"
      className={cn('border-b border-line-soft px-4 pb-3 pt-0.5 text-xs leading-[1.5] text-ink-faint', className)}
      {...props}
    />
  )
}

function ListRow({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      data-slot="list-row"
      className={cn(
        'flex w-full flex-col gap-[3px] border-b border-line-soft px-4 py-[11px] text-left text-ink transition-colors hover:bg-paper',
        className,
      )}
      {...props}
    />
  )
}

/** A row that is not interactive (decisions, read-only history). */
function ListItem({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-item"
      className={cn('flex flex-col gap-[3px] border-b border-line-soft px-4 py-[9px]', className)}
      {...props}
    />
  )
}

function ListTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="list-title" className={cn('text-[13px] font-bold', className)} {...props} />
}

function ListSummary({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="list-summary" className={cn('truncate text-xs text-ink-soft', className)} {...props} />
}

function ListMeta({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="list-meta" className={cn('text-[11px] text-ink-faint', className)} {...props} />
}

export { ListSection, ListHint, ListRow, ListItem, ListTitle, ListSummary, ListMeta }
