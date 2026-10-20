import { useEffect, useState } from 'react'

// When the reader began waiting for what this page will show (#749).
//
// The built `index.html` says D5's «laddar» before the app has arrived — the shell — and switches
// to «laddar länge» four seconds after the navigation started, on the document's own clock. When
// the app takes over, its first wait is the same wait: the reader has not started waiting again
// because a script arrived. Counted from the app's mount instead, a slow line said «det tar längre
// tid» in the shell, then «ansluter» when the app drew its first frame, and «det tar längre tid»
// again four seconds later — a message that came, went and came back for no reason anyone was told.
//
// So `main.tsx` hands over the shell's clock when it finds the shell in `#root`, and the first wait
// of each surface starts there. Anything the page is asked for later — a retry a person pressed —
// is a new wait and starts when it is asked for. A surface mounted on its own, in a test or a
// preview, has no shell and starts its clock when it mounts, as it always did.
let navigationAt: number | null = null

// `performance.now()` counts from the navigation's start, which is the clock the shell reads too.
// A test passes the moment itself, or `null` for a page that had no shell.
export function continueShellClock(at: number | null = Date.now() - performance.now()): void {
  navigationAt = at
}

export function waitBegan(): number {
  return navigationAt ?? Date.now()
}

// Whether a wait that began at `began` has outlasted the silence it is allowed, and a render when it
// does, so the word changes without anything else having to happen first.
export function useWaitedLong(began: number, afterMs: number): boolean {
  const [, tick] = useState(0)
  const long = Date.now() - began > afterMs
  useEffect(() => {
    if (long) return
    const timer = setTimeout(() => tick((n) => n + 1), Math.max(0, afterMs - (Date.now() - began) + 50))
    return () => clearTimeout(timer)
  }, [long, began, afterMs])
  return long
}
