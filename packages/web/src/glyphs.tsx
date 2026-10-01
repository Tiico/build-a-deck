// The glyphs a control is drawn with where a character used to stand: ↶ and ⚑ were whatever the
// machine's font made of them, a hairline hook on a Mac and something else on Linux. These are
// the editor's own way of drawing — a 16 grid, a round stroke in the control's ink — so a row of
// them reads as one hand.

// A way back that turns and returns. Forward is the same hook seen in a mirror.
export function HookGlyph({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg className="byd-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false" data-mirrored={mirrored || undefined}>
      <path d="M6 3.25 2.75 6.5 6 9.75M2.75 6.5h6.75a3.25 3.25 0 0 1 0 6.5H7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function FlagGlyph() {
  return (
    <svg className="byd-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 14V2.5M3.5 3h8.25l-1.75 3 1.75 3H3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// One less and one more (#620), drawn rather than typed for the same reason as the two above: a
// font's minus sits on its own baseline and at its own weight, and beside the number it steps
// it was a different hand on every machine.
export function MinusGlyph() {
  return (
    <svg className="byd-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function PlusGlyph() {
  return (
    <svg className="byd-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 8h10M8 3v10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
