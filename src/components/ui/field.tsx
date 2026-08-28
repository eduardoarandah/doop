import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/* Doop labels a control two ways: a loud uppercase micro-caption above form
   rows, or a plain sentence-case line in denser panels. */
const labelVariants = cva('block text-ink-soft', {
  variants: {
    variant: {
      caption: 'mb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-faint',
      form: 'mb-1.5 text-xs font-semibold uppercase tracking-[0.04em]',
      plain: 'mb-1 text-[13px] font-semibold text-ink',
    },
  },
  defaultVariants: { variant: 'caption' },
})

function Label({ className, variant, ...props }: React.ComponentProps<'label'> & VariantProps<typeof labelVariants>) {
  return <label data-slot="label" className={cn(labelVariants({ variant, className }))} {...props} />
}

/** A label + control + optional hint, stacked. */
function Field({
  label,
  hint,
  labelVariant,
  htmlFor,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  label?: React.ReactNode
  hint?: React.ReactNode
  labelVariant?: VariantProps<typeof labelVariants>['variant']
  htmlFor?: string
}) {
  return (
    <div data-slot="field" className={cn('min-w-0', className)} {...props}>
      {label ? (
        <Label variant={labelVariant} htmlFor={htmlFor}>
          {label}
        </Label>
      ) : null}
      {children}
      {hint ? <p className="mt-1.5 text-xs leading-snug text-ink-faint">{hint}</p> : null}
    </div>
  )
}

export { Field, Label, labelVariants }
