import { useContext, useMemo } from 'react'
import { SYMBOL_CSS, renderInline, type Symbols } from '@byd/template'
import { arrivingIn, holdIcons } from './assets.js'
import { Arriving } from './AssetImage.js'

// A sample of a symbol as the card will draw it (L34, #302).
//
// It is the string the picker is about to write — `{sköld|fara}`, `{sköld}` — handed to the one
// renderer and shown as the span it comes back as (E2). Nothing here draws a symbol: a sample that
// were an `<img>` painted by the editor would be a second code path, and a second code path is
// how a sample comes to promise a card that the card does not keep.
//
// And it stands on the card's paper, never on the editor's dark panel. The symbol is drawn in the
// card's ink, and against the panel «utan betydelse» vanished altogether — the sample was
// invisible in the first draft. So the paper is part of what a sample *is*, not a style somebody
// remembers to add: `paper` is the ground the card's own check judges the palette against, and it
// is written on the element for a test to read.
export type SymbolSampleProps = {
  // The string, exactly as it will be written into the cell.
  written: string
  symbols: Symbols
  paper: string
}

export function SymbolSample({ written, symbols, paper }: SymbolSampleProps) {
  const whole = useMemo(() => renderInline(written, symbols), [written, symbols])
  // A symbol whose bytes are still on their way is drawn as nothing yet, as a card draws it (#959).
  const held = arrivingIn(whole, useContext(Arriving))
  const inner = useMemo(
    () => ({ __html: held === '' ? whole : renderInline(written, { ...symbols, icons: holdIcons(symbols.icons, new Set(held.split(' '))) }) }),
    [whole, held, written, symbols],
  )
  return <span className="byd-symbol-sample" data-paper={paper} style={{ background: paper }} aria-hidden="true" dangerouslySetInnerHTML={inner} />
}

// The rules a sample is drawn with: the compiler's own, scoped to the sample so the panel around
// it is untouched. Laid once under each surface that shows samples — a `<style>` per sample
// would be one rule set per option in a list of twelve.
const SHEET = SYMBOL_CSS.map((rule) => `.byd-symbol-sample ${rule}`).join('\n')
export function SymbolSheet() {
  return <style>{SHEET}</style>
}
