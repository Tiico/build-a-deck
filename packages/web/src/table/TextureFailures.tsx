import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import './texture.css'

// A card whose texture is lost says so on its own face (issue #10), but a face is not an
// announcement: a screen reader is told nothing. The obvious repair — a live region per card —
// is worse than none, because a table of fifty-two cards would announce fifty-two times over
// each other and say nothing anyone can follow.
//
// So the cards report in and the screen keeps one region. It sits in `App`, which is the only
// place mounted exactly once per screen whichever route is showing: no view can forget it and
// no view can add a second. The count is what matters — which card it was is on the card.
const Report = createContext<((delta: number) => void) | null>(null)

export function TextureFailures({ children }: { children: ReactNode }) {
  const [lost, setLost] = useState(0)
  const report = useCallback((delta: number) => setLost((n) => n + delta), [])
  return (
    <Report.Provider value={report}>
      {children}
      {/* In the tree from the start and empty: a live region added along with its text is a
          region nothing was listening to. Polite, because a card that cannot be drawn is worth
          hearing about at the next pause and never worth cutting someone off for. */}
      <p className="byd-texture-lost" data-texture-failures role="status">
        {lost > 0 ? `${lost} kort kunde inte renderas` : ''}
      </p>
    </Report.Provider>
  )
}

// Counts this card in while its face is lost and out again the moment it is not — a retry, a new
// face, or the card leaving the screen. Without a `TextureFailures` above it, nothing is counted.
export function useTextureFailure(failed: boolean): void {
  const report = useContext(Report)
  useEffect(() => {
    if (!report || !failed) return
    report(1)
    return () => report(-1)
  }, [report, failed])
}
