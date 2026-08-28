import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/* The plan/model pickers: a row of soft pills where the chosen one snaps to
   the hard-shadow treatment. `idle` is the read-only form used on rows that
   only list what a connection can do. */
const toggleChipVariants = cva(
  'inline-flex items-center gap-[7px] rounded-[9px] border px-3 py-2 text-[13px] font-medium transition-[background-color,color,box-shadow,border-color]',
  {
    variants: {
      state: {
        off: 'cursor-pointer border-transparent bg-paper-deep text-ink-soft hover:text-ink',
        on: 'border-ink bg-surface font-semibold text-ink shadow-[2px_2px_0_rgba(18,18,23,0.9)]',
        idle: 'cursor-default border-transparent bg-paper-deep text-ink-soft opacity-75',
      },
    },
    defaultVariants: { state: 'off' },
  },
)

/** A row of chips where exactly one is chosen. Arrow keys move between them. */
function ToggleChipGroup({
  className,
  value,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof ToggleGroupPrimitive.Root>, 'type' | 'value' | 'defaultValue' | 'onValueChange'> & {
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      data-slot="toggle-chip-group"
      value={value}
      onValueChange={(next) => next && onValueChange(next)}
      className={cn('flex flex-wrap gap-[9px]', className)}
      {...props}
    />
  )
}

/** One chip inside a ToggleChipGroup. */
function ToggleChipItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-chip"
      className={cn(
        toggleChipVariants({ state: 'off' }),
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink data-[state=on]:border-ink data-[state=on]:bg-surface data-[state=on]:font-semibold data-[state=on]:text-ink data-[state=on]:shadow-[2px_2px_0_rgba(18,18,23,0.9)]',
        className,
      )}
      {...props}
    />
  )
}

/** A chip that only reports state — the capability lists on unconnected rows. */
function ToggleChip({
  className,
  state,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof toggleChipVariants>) {
  return <span data-slot="toggle-chip" className={cn(toggleChipVariants({ state, className }))} {...props} />
}

export { ToggleChip, ToggleChipGroup, ToggleChipItem, toggleChipVariants }
