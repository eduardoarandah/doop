import * as React from 'react'

import { cn } from '@/lib/utils'

/* Full-viewport shell for the signed-out screens: a centred card on paper with
   the brand's warm glow in the top-right. dvh (not vh) so mobile browser chrome
   cannot push the card under the fold, and the padding tightens on small
   screens where 32px of gutter is a third of the width.
   The child centres with `margin: auto` rather than `place-items-center`: auto
   margins give back the leftover space, so a card taller than the screen — a
   phone in landscape, or the sign-up form with its extra field — starts at the
   top and scrolls instead of having its head cut off above the viewport. */
function AuthScreen({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="auth-screen"
      className={cn('flex h-dvh min-h-dvh flex-col overflow-y-auto bg-paper px-4 py-5 sm:p-8 [&>*]:m-auto', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { AuthScreen }
