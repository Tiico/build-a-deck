import type { ReactNode } from 'react'
import type { Element } from '@byd/template'

// The glyphs a control is drawn with where a character used to stand: ↶ and ⚑ were whatever the
// machine's font made of them, a hairline hook on a Mac and something else on Linux. These are
// the editor's own way of drawing — a 16 grid, a round stroke in the control's ink — so a row of
// them reads as one hand.
//
// Every icon in the app comes from here (#1083, beställarens beslut A): the characters that stood
// in buttons and the SVGs that were each drawn on a grid of their own — 12, 14, 20, 24 — are these
// now, and `glyph-hand.test.ts` holds both the rest of `src` and this module to it. A glyph is
// 1em square unless its surface says otherwise, which is the size of the character it replaced;
// the shared rule in `buttons.css` lowers it onto the text's centre line.

// `data-glyph` says which drawing it is, so a test can ask for the meaning rather than for a path.
function Glyph({ name, children, mirrored }: { name: string; children: ReactNode; mirrored?: boolean }) {
  return (
    <svg className="byd-glyph" viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false" data-glyph={name} data-mirrored={mirrored || undefined}>
      {children}
    </svg>
  )
}

// The one stroke. Every line in every glyph is this path, so the weight cannot drift one icon at a
// time.
function Line({ d }: { d: string }) {
  return <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
}

// A filled dot, for the glyphs drawn in points: the grip, more, and the kind that is a row of icons.
function Dots({ at, r = 1.25 }: { at: readonly (readonly [number, number])[]; r?: number }) {
  return (
    <>
      {at.map(([cx, cy]) => (
        <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" />
      ))}
    </>
  )
}

// A way back that turns and returns. Forward is the same hook seen in a mirror.
export function HookGlyph({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <Glyph name="hook" mirrored={mirrored}>
      <Line d="M6 3.25 2.75 6.5 6 9.75M2.75 6.5h6.75a3.25 3.25 0 0 1 0 6.5H7" />
    </Glyph>
  )
}

export function FlagGlyph() {
  return (
    <Glyph name="flag">
      <Line d="M3.5 14V2.5M3.5 3h8.25l-1.75 3 1.75 3H3.5" />
    </Glyph>
  )
}

// One less and one more (#620), drawn rather than typed for the same reason as the two above: a
// font's minus sits on its own baseline and at its own weight, and beside the number it steps
// it was a different hand on every machine.
export function MinusGlyph() {
  return (
    <Glyph name="minus">
      <Line d="M3 8h10" />
    </Glyph>
  )
}

export function PlusGlyph() {
  return (
    <Glyph name="plus">
      <Line d="M3 8h10M8 3v10" />
    </Glyph>
  )
}

// Close, and take away: the × of every panel, chip and row.
export function CloseGlyph() {
  return (
    <Glyph name="close">
      <Line d="M4 4l8 8M12 4l-8 8" />
    </Glyph>
  )
}

// Done, saved, the one chosen.
export function CheckGlyph() {
  return (
    <Glyph name="check">
      <Line d="M3 8.5l3.25 3.25L13 5" />
    </Glyph>
  )
}

// A copy: one sheet laid over another (L75, the waiting room's «Kopiera länk»).
export function CopyGlyph() {
  return (
    <Glyph name="copy">
      <Line d="M6.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </Glyph>
  )
}

// A chevron, pointing where what it opens goes: down for a box that unfolds under it and for
// something open, right for something folded, and left and up for the two walks and the drawer
// that the felt opens upward. The four are one drawing turned.
const CHEVRON = { down: 'M4 6l4 4 4-4', right: 'M6 4l4 4-4 4', left: 'M10 4 6 8l4 4', up: 'M4 10l4-4 4 4' } as const
export function ChevronGlyph({ to }: { to: keyof typeof CHEVRON }) {
  return (
    <Glyph name={`chevron-${to}`}>
      <Line d={CHEVRON[to]} />
    </Glyph>
  )
}

// An arrow: a way somewhere, or a step in a direction. Left and right are the table's; up and
// down are the same arrow turned, for the crop's pad.
const ARROW = { left: 'M13 8H3M7 4 3 8l4 4', right: 'M3 8h10M9 4l4 4-4 4', up: 'M8 13V3M4 7l4-4 4 4', down: 'M8 3v10M4 9l4 4 4-4' } as const
export function ArrowGlyph({ to }: { to: keyof typeof ARROW }) {
  return (
    <Glyph name={`arrow-${to}`}>
      <Line d={ARROW[to]} />
    </Glyph>
  )
}

// A column's sort: both halves while it is not sorted, and the half that says which way once it
// is. The half stays where it stood in the pair, so the heading does not move when it turns.
const SORT = { none: 'M5 6l3-3 3 3M5 10l3 3 3-3', ascending: 'M5 6l3-3 3 3', descending: 'M5 10l3 3 3-3' } as const
export function SortGlyph({ by = 'none' }: { by?: keyof typeof SORT }) {
  return (
    <Glyph name={`sort-${by}`}>
      <Line d={SORT[by]} />
    </Glyph>
  )
}

export function PencilGlyph() {
  return (
    <Glyph name="pencil">
      <Line d="M10.5 2.75l2.75 2.75L6 12.75l-3.25.5.5-3.25z" />
    </Glyph>
  )
}

// Saving: a turn that has not come back round yet.
export function RefreshGlyph() {
  return (
    <Glyph name="refresh">
      <Line d="M13 8a5 5 0 1 1-1.46-3.54M13 2.75V5.5h-2.75" />
    </Glyph>
  )
}

// What a row is held by to be dragged.
export function GripGlyph() {
  return (
    <Glyph name="grip">
      <Dots at={[[6, 4], [10, 4], [6, 8], [10, 8], [6, 12], [10, 12]]} />
    </Glyph>
  )
}

export function MoreGlyph() {
  return (
    <Glyph name="more">
      <Dots at={[[3.5, 8], [8, 8], [12.5, 8]]} />
    </Glyph>
  )
}

// Open or shut, and the difference is the whole state: a padlock that only changes colour says
// nothing to anyone who cannot see the colour. Open is the shackle swung out of its right foot.
export function LockGlyph({ open = false }: { open?: boolean }) {
  return (
    <Glyph name={open ? 'lock-open' : 'lock'}>
      <Line d={`${open ? 'M5.5 7.5V5.5a2.5 2.5 0 0 1 4.85-.85' : 'M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2'}M4.5 7.5h7a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z`} />
    </Glyph>
  )
}

// The rules: an open book.
export function BookGlyph() {
  return (
    <Glyph name="book">
      <Line d="M8 4.5C6.5 3.25 4.5 3 2.5 3.25v9c2-.25 4 0 5.5 1.25 1.5-1.25 3.5-1.5 5.5-1.25v-9C11.5 3 9.5 3.25 8 4.5zM8 4.5v9" />
    </Glyph>
  )
}

export function PlayGlyph() {
  return (
    <Glyph name="play">
      <Line d="M5 3.5v9l7.5-4.5z" />
    </Glyph>
  )
}

// Erase the last figure typed.
export function EraseGlyph() {
  return (
    <Glyph name="erase">
      <Line d="M6 3.5h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6L2 8zM8 6.25l3.5 3.5M11.5 6.25 8 9.75" />
    </Glyph>
  )
}

// Something that could not happen (#1073): the warning sign the notice band was decided with,
// drawn in this hand rather than on the 24 grid it came on.
export function WarningGlyph() {
  return (
    <Glyph name="warning">
      <Line d="M8 2.75 2 13.25h12zM8 6.75v2.75M8 11.5v.01" />
    </Glyph>
  )
}

// A picture's frame: empty while the whole picture is used, and with the window inside it once a
// crop is cut out of it.
export function FrameGlyph({ cropped = false }: { cropped?: boolean }) {
  return (
    <Glyph name={cropped ? 'frame-cropped' : 'frame'}>
      <Line d={`M4 3h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z${cropped ? 'M6 6h4v4H6z' : ''}`} />
    </Glyph>
  )
}

// The glyph that says what kind of layer it is, drawn rather than written: the word for the kind
// is the first thing a 220 px panel runs out of room for, and a shape is quicker to recognise
// than its name anyway.
const KIND: Partial<Record<Element['kind'], string>> = {
  text: 'M3 3h10v2.2M8 3v10M5.6 13h4.8',
  image: 'M3.6 3.2h8.8a1.4 1.4 0 0 1 1.4 1.4v6.8a1.4 1.4 0 0 1-1.4 1.4H3.6a1.4 1.4 0 0 1-1.4-1.4V4.6a1.4 1.4 0 0 1 1.4-1.4zM3.4 11.2 6.6 7.8l2 2.2 1.8-1.8 2.2 3',
  shape: 'M4.2 3.6h7.6a1.6 1.6 0 0 1 1.6 1.6v5.6a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6V5.2a1.6 1.6 0 0 1 1.6-1.6z',
  group: 'M3 4.5h10M3 8h10M3 11.5h6',
  if: 'M3 4.5h10M3 8h10M3 11.5h6',
}
export function KindGlyph({ kind }: { kind: Element['kind'] }) {
  const d = KIND[kind]
  return (
    <Glyph name={`kind-${kind}`}>
      {d !== undefined && <Line d={d} />}
      {kind === 'icons' && <Dots at={[[4, 8], [8, 8], [12, 8]]} r={1.8} />}
    </Glyph>
  )
}

// The five the secondary controls needed beyond the twenty (L73, #1101, led 3), in the same hand.
// The way out of a table and out of an account: a door with the arrow leaving it.
export function ExitGlyph() {
  return (
    <Glyph name="exit">
      <Line d="M9.5 2.75H4a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h5.5M6.5 8h7M11 5.25 13.75 8 11 10.75" />
    </Glyph>
  )
}

// When the last move happened: a clock, read before the sentence it times.
export function ClockGlyph() {
  return (
    <Glyph name="clock">
      <Line d="M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11M8 4.75V8l2.25 1.5" />
    </Glyph>
  )
}

// The account's own page: a person.
export function PersonGlyph() {
  return (
    <Glyph name="person">
      <Line d="M8 2.75a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M3.25 13.75c0-2.75 2.1-4.25 4.75-4.25s4.75 1.5 4.75 4.25" />
    </Glyph>
  )
}

// A file coming in: the arrow lands on the shelf.
export function ImportGlyph() {
  return (
    <Glyph name="import">
      <Line d="M8 2.5v8.25M4.75 7.5 8 10.75l3.25-3.25M3 13.5h10" />
    </Glyph>
  )
}

// The whole hand laid out: four cards in a grid.
export function GridGlyph() {
  return (
    <Glyph name="grid">
      <Line d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />
    </Glyph>
  )
}
