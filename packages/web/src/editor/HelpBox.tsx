import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useDoor } from '../doors.js'
import { useT } from '../i18n/index.js'
import { ROW, helpAnchor, helpPlacement, type HelpPlacement } from './help-place.js'
import '../help-box.css'

// The inside of the help pattern: the box itself, and the stylesheet that draws it (L32, #303).
//
// It stands in a module of its own so that both can travel when the box is asked for (#304,
// #346's way). The pattern used to live in the editor's sheet, which is fetched when the route
// opens (#186), so none of it was ever weighed against the felt's face. The same question mark
// now stands on the login, the start page and the guided start — the first screens anyone sees —
// and the whole pattern in the sheet the first painting blocks on was 813 bytes over the budget
// that exists to say so. The ring is painted before anyone presses it and keeps its rules there;
// the box is behind a press nobody has made.
//
// Nothing about the box's behaviour is new here. What was `HelpBox` inside `HelpDrawer.tsx` is
// what this file is.

// A press outside the box closes it. The focus is left where the pointer put it — on the control
// that was pressed — and goes back to the question mark only when the press landed on nothing
// that takes it, because otherwise it would fall to `<body>`.
const TAKES_FOCUS = 'a[href], button, input, select, textarea, [tabindex], [contenteditable]'

export type HelpBoxProps = { id: string; topic: string; ask: RefObject<HTMLButtonElement | null>; onClose(focusBack: boolean): void; children: ReactNode }

export function HelpBox({ id, topic, ask, onClose, children }: HelpBoxProps) {
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

// The hook under the reading: it does nothing but hold a box against what `helpPlacement` says.
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
