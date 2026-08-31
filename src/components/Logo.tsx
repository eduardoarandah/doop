/** The Disc-D: a half-disc with a dot resting under its stem, reading as
 *  Doop's initial — the frame and the cursor beside it. (Identity round 10.)
 *
 *  The tile is part of the mark, so every call site gets the same lockup
 *  without having to supply its own background. */
export function Logo({ className = 'size-[30px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden>
      <rect width="200" height="200" rx="48" fill="#111110" />
      <g fill="#fdfdfc" transform="translate(14,0)">
        <path d="M78 36 A 64 64 0 0 1 78 164 Z" />
        <circle cx="50" cy="146" r="19" />
      </g>
    </svg>
  )
}
