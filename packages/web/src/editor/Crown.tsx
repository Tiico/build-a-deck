import { useRef, type ReactNode, type RefObject } from 'react'
import { useDoor, usePressAway } from '../doors.js'
import { useT } from '../i18n/index.js'
import { ChevronGlyph } from '../glyphs.js'

// The crown a tab panel wears (#128, #130, variant B). One mechanism on several surfaces — the card
// wall and the card table, and the symbol library until it became Speltema's sheet (L57) — and not
// three fixes, because it is one question:
// what does a panel own at the top, and what scrolls under it.
//
// At the desk the row is exactly one row. What does not fit does not wrap and does not vanish: it
// falls into a named box that opens over the work. (Under the desk and under a finger the row
// breaks instead of hiding anything sideways — L54 — and the wall's does when a panel beside it
// leaves it narrower than its short boxes, #1000.) A crown that wraps was measured at 113 px on
// the card table at every width — thirteen filter chips do not fit on a line even at 1440 — which
// is over the 80 px that tab's own acceptance asks for. This holds one target plus its air.
//
// The price of a box is that a setting can be on without being seen, and it is paid in the label:
// **a box says its state, never only its name.** `Ögon: Deuteranopi`, `Guider (1)` — never `Ögon`.
// A colour-blindness filter left on without saying so is worse than no filter at all (E5), and a
// box whose label does not say what is chosen inside it is the same fault in miniature.

// The row itself. At the desk it never becomes two: `nowrap`, and what is too wide stands in a
// box.
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
  // A shorter word for what the box shows where its row is narrow (#477 fynd 12, variant B): for
  // a box with a choice, the choice — «Ogrupperad» for «Ingen gruppering» — and for a box that
  // counts, its name — «Kontroll (2)» for «Fysisk kontroll (2)». The box still says its state
  // either way; only the words shrink, and the whole sentence stays its name and tooltip.
  short?: string | undefined
  open: boolean
  onToggle(): void
  boxRef?: RefObject<HTMLButtonElement | null> | undefined
  // The one box that stands at the far end of the row. The report on a surface is not a tool of
  // the same kind as the rest and is not read in the same sweep, so it is not queued with them.
  end?: boolean | undefined
}

export function CrownBox({ name, state, count, short, open, onToggle, boxRef, end }: CrownBoxProps) {
  const t = useT()
  const said = state !== undefined ? t('crown.box.state', { name, state }) : count !== undefined ? t('crown.box.count', { name, n: count }) : name
  // Both forms are drawn and the row's width picks one, so nothing here has to know how wide it is.
  const words = (long: string, narrow: string) => (
    <>
      <span className="byd-crown-long">{long}</span>
      <span className="byd-crown-short">{narrow}</span>
    </>
  )
  return (
    <button
      ref={boxRef}
      type="button"
      className={end ? 'byd-crown-box byd-crown-end' : 'byd-crown-box'}
      aria-expanded={open}
      data-drop
      // The whole sentence is the box's name, whatever the row has room to show of it (#477): on a
      // wall narrower than a 1280 window's a box with a choice in it shows only the choice.
      aria-label={said}
      title={said}
      onClick={onToggle}
    >
      {state !== undefined ? (
        <>
          <span className="byd-crown-name">{t('crown.box.lead', { name })}</span>
          {short !== undefined ? words(state, short) : state}
        </>
      ) : short !== undefined ? (
        words(said, count !== undefined ? t('crown.box.count', { name: short, n: count }) : short)
      ) : (
        said
      )}
      <ChevronGlyph to="down" />
    </button>
  )
}

// What a box opened, standing over the work until it is closed. It closes the way every panel over
// the work closes (#133): Escape hands the focus back to the box it came from, a press in the work
// leaves the focus where the pointer put it. The order against a drag that is still held is
// `doors.ts`'s and not this component's (#152).
export function CrownDrawer({ label, opener, onClose, children }: { label: string; opener: RefObject<HTMLButtonElement | null>; onClose(): void; children: ReactNode }) {
  const drawer = useRef<HTMLDivElement>(null)
  useDoor('standing', () => {
    onClose()
    opener.current?.focus()
  })
  usePressAway(true, () => [opener.current, drawer.current], onClose)
  return (
    <div ref={drawer} className="byd-crown-drawer" data-crown-drawer role="group" aria-label={label}>
      {children}
    </div>
  )
}

// What the work adds up to, read under it rather than over it. The counts and the sort used to
// stack above the card table and cost it 189–218 px of its own height (#130).
export function CrownFoot({ children }: { children: ReactNode }) {
  return <div className="byd-crown-foot">{children}</div>
}
