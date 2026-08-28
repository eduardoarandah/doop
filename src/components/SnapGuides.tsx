import { memo } from 'react'
import { useStore } from '../lib/store'

/* Alignment guide lines, drawn in world coordinates inside the world layer.
   Thickness counter-scales via --zoom (like .remote-cursor) so lines stay
   hairline at any zoom. Only re-renders while a drag is actually snapped. */
export const SnapGuides = memo(function SnapGuides() {
  const guides = useStore((s) => s.snapGuides)
  return (
    <>
      {guides.map((g, i) => (
        <div
          key={i}
          className={`pointer-events-none absolute z-[25] bg-brand ${
            g.axis === 'v' ? 'w-[calc(1px/var(--zoom,1))]' : 'h-[calc(1px/var(--zoom,1))]'
          }`}
          style={
            g.axis === 'v'
              ? { left: g.at, top: g.from, height: g.to - g.from }
              : { top: g.at, left: g.from, width: g.to - g.from }
          }
        />
      ))}
    </>
  )
})
