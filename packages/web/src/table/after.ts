import { useEffect, useState } from 'react'

// The sheet for what the felt says after something has happened (#682): the plate beside a
// refused drop, the corner's last line and the ⋯ menu. None of it is drawn on the first frame, so
// it travels in a chunk of its own rather than in the blocking sheet (L40, the #325 and #346 shape),
// and is asked for when a felt that can be played is mounted — long before the first drop.
let ready = false
let asked: Promise<void> | null = null

export function loadAfterSheet(): Promise<void> {
  asked ??= import('./felt-after.css').then(() => {
    ready = true
  })
  return asked
}

// Whether the sheet is in, for what may be drawn on arrival — a corner line from a table already
// played — and must never be drawn without its clothes.
export function useAfterSheet(): boolean {
  const [loaded, setLoaded] = useState(ready)
  useEffect(() => {
    if (loaded) return
    let live = true
    void loadAfterSheet().then(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [loaded])
  return loaded
}
