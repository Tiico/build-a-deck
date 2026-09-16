import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useDoor } from '../doors.js'
import { useT } from '../i18n/index.js'

// The crown a tab panel wears (#128, #130, variant B). One mechanism on three surfaces — the card
// wall, the symbol library and the card table — and not three fixes, because it is one question:
// what does a panel own at the top, and what scrolls under it.
//
// The row is exactly one row at every width. What does not fit does not wrap and does not vanish:
// it falls into a named box that opens over the work. A crown that wraps was measured at 113 px on
// the card table at every width — thirteen filter chips do not fit on a line even at 1440 — which
// is over the 80 px that tab's own acceptance asks for. This holds one target plus its air.
//
// The price of a box is that a setting can be on without being seen, and it is paid in the label:
// **a box says its state, never only its name.** `Ögon: Deuteranopi`, `Guider (1)` — never `Ögon`.
// A colour-blindness filter left on without saying so is worse than no filter at all (E5), and a
// box whose label does not say what is chosen inside it is the same fault in miniature.

// The row itself. It never becomes two: `nowrap`, and what is too wide either scrolls inside a
// rail or stands in a box.
export function Crown({ children }: { children: ReactNode }) {
  return <div className="byd-crown">{children}</div>
}

// A box in the crown: a button that carries its state, and nothing else. What it opens is drawn by
// the surface, under the row rather than inside it — a drawer among the boxes would make the row
// two rows, which is the one thing the crown may not be.
export type CrownBoxProps = {
  // What the box is, and what is chosen inside it right now. The state is the whole point of B: it
  // is rendered after the name, and a box that holds a setting does not leave it out. A box says it
  // one of two ways — `Ögon: Deuteranopi` for a chosen value, `Guider (1)` for a number of things
  // that are on — and the two never mix, because the reader learns the shapes and not the wording.
  name: string
  state?: string | undefined
  count?: number | undefined
  open: boolean
  onToggle(): void
  boxRef?: RefObject<HTMLButtonElement | null> | undefined
  // The one box that stands at the far end of the row. The report on a surface is not a tool of
  // the same kind as the rest and is not read in the same sweep, so it is not queued with them.
  end?: boolean | undefined
}

export function CrownBox({ name, state, count, open, onToggle, boxRef, end }: CrownBoxProps) {
  const t = useT()
  const said = state !== undefined ? t('crown.box.state', { name, state }) : count !== undefined ? t('crown.box.count', { name, n: count }) : name
  return (
    <button
      ref={boxRef}
      type="button"
      className={end ? 'byd-crown-box byd-crown-end' : 'byd-crown-box'}
      aria-expanded={open}
      onClick={onToggle}
    >
      {said}
      <span aria-hidden="true">▾</span>
    </button>
  )
}

// What a box opened, standing over the work until it is closed. It closes the way every panel over
// the work closes (#133): Escape hands the focus back to the box it came from, a press in the work
// leaves the focus where the pointer put it. The order against a drag that is still held is
// `doors.ts`'s and not this component's (#152).
export function CrownDrawer({ label, opener, onClose, children }: { label: string; opener: RefObject<HTMLButtonElement | null>; onClose(): void; children: ReactNode }) {
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
      // The box that opened it is left alone: it already closes the drawer, and closing on the way
      // down would only let the click that follows open it again.
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
// with a fade and a button to the rest — putting thirteen chips behind `Filter (13) ▾` would be
// hiding the one thing on that surface that is a state rather than an action (#130). What falls
// into a box there is the import and the export, which are done once and are not a state at all.
export function CrownRail({ label, children }: { label: string; children: ReactNode }) {
  const t = useT()
  const scroll = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = scroll.current
    if (!el) return
    // Whether there is anything to the right is measured and not assumed: the arrow is a promise
    // that something is there, and an arrow that points at nothing is worse than none.
    const look = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 1)
    look()
    el.addEventListener('scroll', look)
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(look) : null
    watch?.observe(el)
    return () => {
      el.removeEventListener('scroll', look)
      watch?.disconnect()
    }
  })
  return (
    <div className="byd-crown-rail" {...(more ? { 'data-more': 'true' } : {})}>
      <div className="byd-crown-rail-scroll" ref={scroll} role="group" aria-label={label}>
        {children}
      </div>
      {more && (
        <button
          type="button"
          className="byd-crown-more"
          aria-label={t('crown.rail.more')}
          onClick={() => scroll.current?.scrollBy({ left: Math.round(scroll.current.clientWidth * 0.8), behavior: 'smooth' })}
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )
}

// What the work adds up to, read under it rather than over it. The counts and the sort used to
// stack above the card table and cost it 189–218 px of its own height (#130).
export function CrownFoot({ children }: { children: ReactNode }) {
  return <div className="byd-crown-foot">{children}</div>
}
