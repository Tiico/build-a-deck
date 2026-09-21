import { Suspense, lazy, useId, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n/index.js'
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

// Lådans insida kommer när den efterfrågas (#304, #346:s väg). Mönstret bodde i editorns ark
// medan bara editorn bar det, och editorns ark hämtas när rutten öppnas (#186) — så ingenting av
// det vägdes mot filtens ansikte. Samma frågetecken på inloggningen, starten och guiden la hela
// mönstret i det ark första målningen väntar på. Ringen är målad innan någon tryckt och står kvar
// där; lådan står bakom ett tryck ingen gjort och reser när det görs.
const HelpBox = lazy(() => import('./HelpBox.js').then((m) => ({ default: m.HelpBox })))

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
        // Nothing stands in the box's place while it is on its way: a box is what a press asked
        // for, and half a box — a bordered empty panel — would be a worse answer than the moment
        // of nothing that the fetch actually is.
        <Suspense fallback={null}>
          <HelpBox id={boxId} topic={topic} ask={ask} onClose={close}>
            {children}
          </HelpBox>
        </Suspense>
      )}
    </span>
  )
}

// The placement is the box's, and pure, so a browser test can lay a box by it against a rectangle
// it has really measured. It is re-exported here because this is the module the pattern is known
// by; it lives apart so that the ring can be drawn without the box's code (see `help-place.ts`).
export { ROW, HELP_WIDTH, helpAnchor, helpPlacement, type HelpPlacement } from './help-place.js'
