import { useEffect, useRef, type PointerEvent as RPointerEvent } from 'react'

// Where a mouse arrives, read as the place a hover is let go of, and not only React's leave
// (#1325, #1450).
//
// React leaves a node on the browser's `pointerout`, which goes to whatever the pointer was last
// known to be over. When that node has since been taken away from under a mouse at rest — the words
// «Laddar kortet…» once the face arrives, a front swapped for a back — and the browser has not looked
// again before the next move, the `pointerout` goes to the node that is gone, and React's listener
// on the root never hears it. The `pointerover` where the mouse arrives names the node it was on as
// where it came from, and React lets that pass, counting on the `pointerout` to have said it. So the
// node is never left: a lift stays up with the mouse at the other end of the window.
//
// Where the pointer arrives is always said, on a node that is there. This listens for it until
// `inside` says the mouse is still on what it rested on, or until it is called off.
export function whenMouseArrivesOutside(inside: (target: Element | null) => boolean, leave: () => void): () => void {
  const arrived = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    if (inside(e.target instanceof Element ? e.target : null)) return
    leave()
  }
  window.addEventListener('pointerover', arrived, true)
  return () => window.removeEventListener('pointerover', arrived, true)
}

// A pair of hover handlers, as the felt hands them to the nodes it draws.
export type Pointing = { onPointerEnter(e?: RPointerEvent): void; onPointerLeave(e?: RPointerEvent): void }

// The felt's hover handlers made to let go where the mouse arrives as well as on React's leave: a
// mouse's enter listens until the mouse arrives on something that is not inside the node it entered,
// and then says the leave React did not. React's own leave calls the listening off. Every node a
// mouse rests on listens for itself, so a pile and the card on its top each let go when it is them
// the mouse has left.
export function useLetGoWhereMouseArrives(): (p: Pointing | undefined) => Pointing | undefined {
  const listening = useRef(new Map<Element, Set<() => void>>())
  useEffect(() => {
    const all = listening.current
    return () => {
      for (const offs of all.values()) for (const off of offs) off()
      all.clear()
    }
  }, [])
  const callOff = (el: Element) => {
    const offs = listening.current.get(el)
    if (!offs) return
    for (const off of offs) off()
    listening.current.delete(el)
  }
  return (p) =>
    p && {
      onPointerEnter: (e) => {
        p.onPointerEnter(e)
        const el = e?.currentTarget
        if (e?.pointerType !== 'mouse' || !(el instanceof Element)) return
        const offs = listening.current.get(el) ?? new Set<() => void>()
        listening.current.set(el, offs)
        const off = whenMouseArrivesOutside(
          (target) => target !== null && el.contains(target),
          () => {
            off()
            offs.delete(off)
            if (offs.size === 0 && listening.current.get(el) === offs) listening.current.delete(el)
            p.onPointerLeave()
          },
        )
        offs.add(off)
      },
      onPointerLeave: (e) => {
        if (e?.currentTarget instanceof Element) callOff(e.currentTarget)
        p.onPointerLeave(e)
      },
    }
}
