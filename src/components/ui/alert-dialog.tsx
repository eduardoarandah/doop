import * as React from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'

import { cn } from '@/lib/utils'
import { Button } from './button'
import { modalVariants } from './modal'

/* "Are you sure?" as a real dialog rather than window.confirm: it can be
   styled, it says what will happen in the app's own voice, and — the part
   window.confirm cannot do — it names its action ("Delete guide") instead of
   an anonymous OK. Radix gives it the alertdialog role, focus on the safe
   action, and Escape/outside-click that both mean cancel. */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[80] animate-[fade-in_0.15s_ease] bg-[rgba(18,18,23,0.45)]" />
        <AlertDialogPrimitive.Content
          data-slot="confirm-dialog"
          className={cn(modalVariants({ size: 'sm' }), 'z-[80]')}
        >
          <AlertDialogPrimitive.Title className="font-display text-[20px] font-extrabold tracking-[-0.02em]">
            {title}
          </AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className="mt-2 text-sm leading-[1.55] text-ink-soft">
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}
          <div className="mt-[26px] flex flex-wrap justify-end gap-2.5 [&>*]:max-xs:flex-1 [&>*]:max-xs:justify-center">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant={destructive ? 'danger-solid' : 'primary'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

export { ConfirmDialog }
