import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDoor } from '../doors.js'
import { useT } from '../i18n/index.js'

// The crown a tab panel wears (#128, #130, variant B). One mechanism on three surfaces — the card
// wall, the symbol library and the card table — and not three fixes, because it is one question:
// what does a panel own at the top, and what scrolls under it.
//
// The row is exactly one row at every width. What does not fit does not wrap and does not vanish:
// it falls into a named box that opens over the work. A crown that wraps was measured at 113 px on
// the card table at every width — thirteen filter chips do not fit on a line even at 1440 — which
// is over the 80 px that tab's own acceptance asks for. This holds 61–65 px at 1024, 1280 and 1440.
//
// The price of a box is that a setting can be on without being seen, and it is paid in the label:
// **a box says its state, never only its name.** `Ögon: Deuteranopi`, `Guider (1)` — never `Ögon`.
// A colour-blindness filter left on without saying so is worse than no filter at all (E5), and a
// box whose label does not say what is chosen inside it is the same fault in miniature.
export function Crown({ children }: { children: ReactNode }) {
  return <div className="byd-crown">{children}</div>
}

// A box in the crown, and the drawer it opens under it. Only one is open at a time — two drawers
// over the work is the thing the crown exists to avoid — so the open one is held by the surface
// and handed back here.
export type CrownBoxProps = {
  // What the box is, and what is chosen inside it right now. `state` is the whole point: it is
  // rendered after the name and it is not optional for a box that holds a setting.
  name: string
  state?: string | undefined
  open: boolean
  onToggle(): void
  onClose(): void
  children: ReactNode
}

export function CrownBox({ name, state, open, onToggle, onClose, children }: CrownBoxProps) {
  const t = useT()
  const button = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={button}
        type="button"
        className="byd-crown-box"
        aria-expanded={open}
        aria-pressed={open}
        onClick={onToggle}
      >
        {state === undefined ? name : t('crown.box.state', { name, state })}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <CrownDrawer label={name} opener={button} onClose={onClose}>
          {children}
        </CrownDrawer>
      )}
    </>
  )
}

// The drawer itself is drawn by the crown's own row below it, so it is rendered out of the box's
// place in the flow and into the panel. It closes the way every panel over the work closes (#133):
// Escape hands the focus back to the box it came from, a press in the work leaves the focus where
// the pointer put it.
function CrownDrawer({ label, opener, onClose, children }: { label: string; opener: React.RefObject<HTMLButtonElement | null>; onClose(): void; children: ReactNode }) {
  const latest = useRef({ opener, onClose })
  latest.current = { opener, onClose }
  useDoor('standing', () => {
    onClose()
    opener.current?.focus()
  })
  useEffect(() => {
    const onPointerDown = (event: Event) => {
      const now = latest.current
      const target = event.target
      if (!(target instanceof Element)) return
      if (now.opener.current?.contains(target) || target.closest('[data-crown-drawer]')) return
      now.onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])
  return (
    <div className="byd-crown-drawer" data-crown-drawer role="group" aria-label={label}>
      {children}
    </div>
  )
}

// The filters do not leave the row. They keep their place in it and get a side scroll of their own
// with a fade and a button to the rest — hiding thirteen chips behind `Filter (13) ▾` would be
// hiding the one thing on this surface that is a state and not an action (#130).
export function CrownRail({ label, children }: { label: string; children: ReactNode }) {
  const scroll = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = scroll.current
    if (!el) return
    const look = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 1)
    look()
    el.addEventListener('scroll', look)
    const watch = new ResizeObserver(look)
    watch.observe(el)
    return () => {
      el.removeEventListener('scroll', look)
      watch.disconnect()
    }
  }, [children])
  const t = useT()
  return (
    <div className="byd-crown-rail" data-more={more ? 'true' : undefined}>
      <div className="byd-crown-rail-scroll" ref={scroll} role="group" aria-label={label}>
        {children}
      </div>
      {more && (
        <button
          type="button"
          className="byd-crown-more"
          aria-label={t('crown.rail.more')}
          onClick={() => scroll.current?.scrollBy({ left: scroll.current.clientWidth * 0.8, behavior: 'smooth' })}
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )
}

// What the work adds up to, read under it rather than over it. The counts and the sort used to
// stack above the table and cost it 189–218 px of its own height (#130).
export function CrownFoot({ children }: { children: ReactNode }) {
  return <div className="byd-crown-foot">{children}</div>
}
