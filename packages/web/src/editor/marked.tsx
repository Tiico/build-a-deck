import { createContext, useContext, useState, type ReactNode } from 'react'
import { noSelection, type Selection } from './selection.js'

// Which cards the next bulk change is about (#17), held where every surface that acts on it can
// see it (#222, L22).
//
// The marking is the deck's and not one panel's. It is made in the card table — the checkboxes,
// "markera alla synliga", the filter that lets a card go — and it is acted on there *and* in the
// media library, because "lägg bilden på de markerade korten" is deliberately the bulk editor's
// own selection and not a second mechanism beside it. Kept inside the table's component it would
// be thrown away by the one step the library asks the designer to take: walking over to the
// Media tab, which unmounts the table.
//
// A table mounted without the provider keeps a marking of its own, exactly as a surface mounted
// without a language provider speaks Swedish (A4): one seam, and never half a wire.
export type MarkedCards = readonly [Selection, (next: Selection) => void]

const MarkedContext = createContext<MarkedCards | null>(null)

export function MarkedProvider({ children }: { children: ReactNode }) {
  const here = useState<Selection>(noSelection)
  return <MarkedContext.Provider value={here}>{children}</MarkedContext.Provider>
}

export function useMarked(): MarkedCards {
  const shared = useContext(MarkedContext)
  // Both are asked for on every render — a hook is never behind a condition — and the one the
  // surface is standing in is the one that answers.
  const own = useState<Selection>(noSelection)
  return shared ?? own
}
