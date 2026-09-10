import { symbolName, symbolPreview, type GameSymbol } from './symbols.js'
import { useT } from '../i18n/index.js'

// The library as a list to choose from (E4). It is offered in two places — at the brace in a cell
// being typed into (L2), and beside the Ikon tool on the canvas (#33) — and it is the same
// library, so it is one component and one set of keys rather than two that can drift apart.
//
// The focus stays on whatever opened the list: the cell, or the tool in the rail. So the options
// are not stops in the tab order and pressing one does not take the focus from what is driving
// it; which one the keys are on is said with `aria-selected`, and the driver points at it with
// `aria-activedescendant`.

// What a key means over the list. A pure answer rather than a handler, because the two libraries
// have to hear it in the two places the focus actually is, and must still answer it identically.
export type SymbolListAction = { active: number } | 'pick' | 'close'
export function symbolListKey(key: string, count: number, active: number): SymbolListAction | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowDown':
      return { active: Math.min(count - 1, active + 1) }
    case 'ArrowUp':
      return { active: Math.max(0, active - 1) }
    case 'Enter':
      return 'pick'
    case 'Escape':
      return 'close'
    default:
      return null
  }
}

// Which option the driver points at. Built from the list's own id, so two lists on a page — the
// rail's and a cell's — never name the same element.
export const symbolOptionId = (list: string, symbol: GameSymbol): string => `${list}-${symbol.id}`

export type SymbolListProps = {
  // The id the list is known by, and what its options' ids are built from.
  id: string
  symbols: readonly GameSymbol[]
  active: number
  label: string
  // Where this one is drawn: the shared look is the class every list wears, and this places it.
  className: string
  onPick(symbol: GameSymbol): void
}

export function SymbolList({ id, symbols, active, label, className, onPick }: SymbolListProps) {
  const t = useT()
  return (
    <div id={id} className={`byd-symbol-list ${className}`} role="listbox" aria-label={label}>
      {symbols.map((symbol, i) => (
        <button
          key={symbol.id}
          id={symbolOptionId(id, symbol)}
          type="button"
          role="option"
          tabIndex={-1}
          data-symbol={symbolName(symbol, t)}
          aria-selected={i === active}
          // The press must not be a change of focus: what is driving the list is a cell being
          // typed into or the tool that opened it, and either would lose the list on losing it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(symbol)}
        >
          <img src={symbolPreview(symbol)} alt="" />
          <span>{symbolName(symbol, t)}</span>
          <small>{t(symbol.category)}</small>
        </button>
      ))}
    </div>
  )
}
