import { useEffect, useRef, useState } from 'react'
import { fitScale, type Size } from './fit.js'

// Measures the element the returned ref is attached to and keeps the scale fitting it.
export function useFitScale(table: Size, margin: number): { ref: React.RefObject<HTMLDivElement | null>; scale: number } {
  const ref = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => setScale(fitScale(table, { w: el.clientWidth, h: el.clientHeight }, margin))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [table.w, table.h, margin])
  return { ref, scale }
}
