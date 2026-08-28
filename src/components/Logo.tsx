/** The layered D: two stacked frames — the human's layer over the agent's —
 *  forming Doop's initial. (From the founder's sketch, identity round 7.) */
export function Logo({ className = 'size-[30px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <rect width="100" height="100" rx="20" fill="#1C1A15" />
      <path
        d="M37 31 H63 A10 10 0 0 1 73 41 V63 A10 10 0 0 1 63 73 H37 Z"
        fill="none"
        stroke="#E5533C"
        strokeWidth="6"
      />
      <path
        d="M28 22 H54 A10 10 0 0 1 64 32 V54 A10 10 0 0 1 54 64 H28 Z"
        fill="none"
        stroke="#F2EFE6"
        strokeWidth="6"
      />
    </svg>
  )
}
