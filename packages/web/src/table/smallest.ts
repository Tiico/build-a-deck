import { useEffect, useState } from 'react'
import type { VisibleComponentState } from '@byd/protocol'

// What a card's smallest text was fitted to (#523), as the renderer found it when it drew the
// texture: the answer to how large a surface must hold the card up for its words to be read (K26).
// It is asked of the server the picture comes from, for the face the card shows — the front when
// the seat may see it, else the back, exactly as `Texture` chooses — and never through the object
// store, whose link carries nothing a page can read.
//
// Per face and not per card: the hash is the face, and a face does not change. So the answer is
// kept for as long as the page lives, and every card wearing the face shares it.
const RETRY_MS = 1500
const RETRY_MAX = 8
const known = new Map<string, number | null>()
const asking = new Map<string, Promise<number | null>>()

// For tests: a page that starts afresh.
export function forgetFits(): void {
  known.clear()
  asking.clear()
}

const hashOf = (c: VisibleComponentState): string | undefined => (c.cardRef !== null ? c.faces?.['front'] : c.faces?.['back'])

async function ask(url: string): Promise<number | null> {
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 200) {
        const { smallestPt } = (await res.json()) as { smallestPt: number | null }
        return typeof smallestPt === 'number' ? smallestPt : null
      }
      // Still being rendered: the same patience the texture itself has.
      if (res.status !== 202) return null
    } catch {
      return null
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS * (attempt + 1)))
  }
  return null
}

// Null until it is known, and for a face that says nothing: the surface then holds the card up at
// the width it has for the wizard's own frame, as it did before this was asked.
export function useSmallestPt(faces: string | undefined, c: VisibleComponentState | undefined): number | null {
  const hash = c ? hashOf(c) : undefined
  const url = faces && hash ? `${faces}/faces/${hash}/fit` : undefined
  const [, heard] = useState(0)
  useEffect(() => {
    if (!url || known.has(url)) return
    let live = true
    let pending = asking.get(url)
    if (!pending) {
      pending = ask(url).then((pt) => {
        known.set(url, pt)
        asking.delete(url)
        return pt
      })
      asking.set(url, pending)
    }
    void pending.then(() => live && heard((n) => n + 1))
    return () => {
      live = false
    }
  }, [url])
  return url ? (known.get(url) ?? null) : null
}
