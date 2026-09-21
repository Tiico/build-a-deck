import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useDoor } from '../doors.js'
import { useT } from '../i18n/index.js'
import { placeBox, type Anchor, type Placement, type Viewport, type Wants } from './placement.js'
import '../help.css'

// The one help pattern the product has (L32, #303): a question mark that opens a box under itself.
//
// The editor was to have less explanatory prose and more working controls. The inventory said
// where the prose actually costs: not in characters but in pixels, in a few strings standing in
// narrow columns — `canvas.hint.base` was six lines and a third of the layer list's height. The
// prose moves in here, behind a question mark that stands beside the heading or the line it
// explains, and the surface is the same height whether the box is open or closed: the box is
// layered over the work and never in its flow. That is what made this pattern the choice over an
// unfolding in the flow (back to the old height the moment it opens) and a help mode that lights
// every text at once (more than the old height).
//
// Hover does not open it. The way in is click and focus, nothing else: a box opened by hover
// vanishes when the pointer moves to reach it, and the phone has no hover at all. One way in, one
// way out — `Esc`, the cross, or a press outside. The focus goes into the box when it opens and
// back to the question mark when it closes; otherwise it falls to `<body>` and the panel has to
// be reached again from the top (#8, #133).
//
// What never comes in here: an error, a waiting status, or the sentence that says what an action
// costs. Those stay on the surface (L32).
//
// The interface is deliberately small — what the help is about, and the text — because #304 and
// #305 reuse it on the felt and the phone and must not have to learn a second shape.
export type HelpProps = {
  // What the box is about, in the reader's language, as it is said in the question mark's name
  // («Hjälp om lagerlistan») and over the box.
  topic: string
  children: ReactNode
  id?: string | undefined
}

export function Help({ topic, children, id }: HelpProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ask = useRef<HTMLButtonElement>(null)
  const auto = useId()
  const boxId = `${id ?? auto}-help`
  const close = (focusBack: boolean) => {
    setOpen(false)
    if (focusBack) ask.current?.focus()
  }
  return (
    <span className="byd-help">
      <button ref={ask} type="button" className="byd-help-ask" aria-label={t('help.about', { topic })} aria-expanded={open} aria-controls={open ? boxId : undefined} onClick={() => (open ? close(true) : setOpen(true))}>
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <HelpBox id={boxId} topic={topic} ask={ask} onClose={close}>
          {children}
        </HelpBox>
      )}
    </span>
  )
}

// A press outside the box closes it. The focus is left where the pointer put it — on the control
// that was pressed — and goes back to the question mark only when the press landed on nothing
// that takes it, because otherwise it would fall to `<body>`.
const TAKES_FOCUS = 'a[href], button, input, select, textarea, [tabindex], [contenteditable]'

function HelpBox({ id, topic, ask, onClose, children }: { id: string; topic: string; ask: RefObject<HTMLButtonElement | null>; onClose(focusBack: boolean): void; children: ReactNode }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const cross = useRef<HTMLButtonElement>(null)
  const latest = useRef(onClose)
  latest.current = onClose
  const place = useFixedPlacement(ask, box)
  useDoor('standing', () => latest.current(true))
  useLayoutEffect(() => {
    cross.current?.focus()
  }, [])
  useEffect(() => {
    const onPointerDown = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      // The question mark is left alone: it already closes the box, and closing on the way down
      // would only let the click that follows open it again.
      if (ask.current?.contains(target) || box.current?.contains(target)) return
      latest.current(!target.closest(TAKES_FOCUS))
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [ask])
  return (
    <div
      ref={box}
      id={id}
      className="byd-help-box"
      role="dialog"
      aria-labelledby={`${id}-topic`}
      data-place-y={place?.y}
      data-place-x={place?.x}
      style={place?.style}
      // Tab out of the box closes it, and the focus lands on the stop after the question mark, as
      // it would have without the box. A box that is not modal must not be a place the keyboard
      // gets left in.
      onBlur={(event) => {
        const to = event.relatedTarget
        if (to instanceof Node && box.current?.contains(to)) return
        latest.current(to === null)
      }}
    >
      <b id={`${id}-topic`} className="byd-help-topic">
        {topic}
      </b>
      <button ref={cross} type="button" className="byd-help-close" aria-label={t('help.close')} onClick={() => latest.current(true)}>
        <span aria-hidden="true">×</span>
      </button>
      {children}
    </div>
  )
}

// Where the box goes: under the question mark while there is room below, above it when there is
// not, and hanging from its right edge when its left would run off the window (#229). The reading
// is `placeBox`'s; what differs from a slot's box is that this one is fixed to the window rather
// than to its own wrapper, because the wrapper stands inside columns that clip their overflow —
// the layer column is 220 px wide and the box is 260 — and a box clipped by the column it helps
// with is no help. Pure, so that a browser test can lay a box by it against a rectangle it has
// really measured; the hook under it does nothing but hold a box against the reading.
export type HelpPlacement = Pick<Placement, 'y' | 'x'> & { style: CSSProperties }
const GAP = 6
// The width the stylesheet gives the box, said again here for a reading taken before the box has
// been laid out — a wish of nought fits anywhere, and that is exactly what the flip is asking.
export const HELP_WIDTH = 260

// What the box hangs from. Across, it is the question mark: the box's left edge is the ring's.
// Down, it is the whole row the question mark stands in when there is one — the heading or the
// line the help is about — so a box that flips upward over a line that wraps never lands on the
// words it explains. A question mark standing alone in a wider bar hangs the box from itself.
export const ROW = '.byd-help-row'
export function helpAnchor(ask: Anchor, row: Anchor | null): Anchor {
  if (!row) return ask
  const top = Math.min(ask.y, row.y)
  return { x: ask.x, y: top, w: ask.w, h: Math.max(ask.y + ask.h, row.y + row.h) - top }
}

export function helpPlacement(anchor: Anchor, wants: Wants, view: Viewport): HelpPlacement {
  const at = placeBox(anchor, { w: wants.w || HELP_WIDTH, h: wants.h }, view, { gap: GAP })
  const style: CSSProperties = { ['--byd-place-room' as string]: `${at.room}px` }
  if (at.y === 'down') style.top = `${anchor.y + anchor.h + GAP}px`
  else style.bottom = `${view.h - anchor.y + GAP}px`
  if (at.x === 'start') style.left = `${anchor.x}px`
  else style.right = `${view.w - (anchor.x + anchor.w)}px`
  return { y: at.y, x: at.x, style }
}

function useFixedPlacement(ask: RefObject<HTMLButtonElement | null>, box: RefObject<HTMLElement | null>): HelpPlacement | null {
  const [place, setPlace] = useState<HelpPlacement | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const a = ask.current
      const b = box.current
      if (!a || !b) return
      const r = a.getBoundingClientRect()
      const row = a.closest(ROW)?.getBoundingClientRect() ?? null
      const anchor = helpAnchor({ x: r.left, y: r.top, w: r.width, h: r.height }, row && { x: row.left, y: row.top, w: row.width, h: row.height })
      // `scrollHeight` and not the drawn height: the drawn one is whatever the last placement left
      // it at, and measuring that would let the box ratchet itself smaller on every scroll.
      setPlace(helpPlacement(anchor, { w: b.offsetWidth, h: b.scrollHeight }, { w: window.innerWidth, h: window.innerHeight }))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [ask, box])
  return place
}
