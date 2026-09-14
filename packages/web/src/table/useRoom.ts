import { useEffect, useState } from 'react'
import type { Size } from './fit.js'

// The window the reader is holding, watched rather than read once (K9, #75, #76, #77). A phone
// turned over is a new shape, and both surfaces that decide which way round a felt is drawn — the
// observer's and the seat's own — have to be asked again when it is, the same way the renderer
// refits to its frame. Off a browser it is no window at all, which every caller reads as "no
// evidence" rather than as a shape.
export function useRoom(): Size {
  const [room, setRoom] = useState<Size>(() => (typeof window === 'undefined' ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const update = () => setRoom({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return room
}
