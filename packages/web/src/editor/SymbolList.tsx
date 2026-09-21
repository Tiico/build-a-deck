import type { ReactNode } from 'react'
import { symbolName, symbolPreview, type GameSymbol } from './symbols.js'
import { useT } from '../i18n/index.js'
import { PickList, pickKey, pickOptionId, type PickAction } from './picking.js'

// The library as a list to choose from (E4). It is offered in two places — at the brace in a cell
// being typed into (L2), and beside the Ikon tool on the canvas (#33) — and it is the same
// library, so it is one component and one set of keys rather than two that can drift apart.
//
// What a list of this kind *is* now lives in `picking`: no stops in the tab order, `aria-selected`
// on the one the keys are on, a press that refuses the focus so the sentence being written keeps
// it, and the driver pointing at the live option with `aria-activedescendant`. The rulebook's `[[`
// is the same doing over the game's own names (L23, #215), and one mechanism used twice is the
// whole point — so what is left here is only what a symbol, or a meaning, looks like in a row.

// What a key means over the list. Kept under its old name because the two surfaces that ask it
// ask about symbols; it is `pickKey` and nothing else.
export type SymbolListAction = PickAction
export const symbolListKey = pickKey

// Which option the driver points at. Built from the list's own id, so two lists on a page — the
// rail's and a cell's — never name the same element.
export const symbolOptionId = (list: string, symbol: GameSymbol): string => pickOptionId(list, symbol.id)
export const roleOptionId = (list: string, role: string | null): string => pickOptionId(list, role ?? '')

export type SymbolListProps = {
  // The id the list is known by, and what its options' ids are built from.
  id: string
  symbols: readonly GameSymbol[]
  active: number
  label: string
  // Where this one is drawn: the shared look is the class every list wears, and this places it.
  className: string
  // What a symbol looks like in its row, when it is not the library's own picture: the cell's
  // picker draws each one as a sample on the card's paper, in the meaning the keys are on (L34).
  sample?: ((symbol: GameSymbol) => ReactNode) | undefined
  onPick(symbol: GameSymbol): void
}

export function SymbolList({ id, symbols, active, label, className, sample, onPick }: SymbolListProps) {
  const t = useT()
  return (
    <PickList
      id={id}
      className={`byd-symbol-list ${className}`}
      label={label}
      options={symbols}
      keyOf={(symbol) => symbol.id}
      attrs={(symbol) => ({ 'data-symbol': symbolName(symbol, t) })}
      active={active}
      onPick={onPick}
    >
      {(symbol) => (
        <>
          {sample ? sample(symbol) : <img src={symbolPreview(symbol)} alt="" />}
          <span>{symbolName(symbol, t)}</span>
          <small>{t(symbol.category)}</small>
        </>
      )}
    </PickList>
  )
}

// The deck's meanings, offered where a symbol has just been named (E4). It is a second list and
// not the symbol list wearing a hat: the two hold different things and are chosen between by
// something the designer typed. What they share is the list they are both drawn as, because the
// focus is in the sentence being written in both cases.
//
// A meaning of `null` is «utan betydelse» (L34): the symbol as the card draws it in ink, first in
// the list so that ink is one of the rows and not an exception to them. The cell's picker offers
// it; the list opened by a typed bar does not, since the bar itself said a meaning was wanted.
export type Meaning = { role: string | null; colour: string }
export type RoleListProps = {
  id: string
  roles: readonly Meaning[]
  active: number
  label: string
  className: string
  // What «utan betydelse» is called, for a list that offers it.
  none?: string | undefined
  // A coloured copy of the very symbol the designer chose, on the card's paper (L34) — instead of
  // a name beside an abstract colour dot. Without it the row is the dot, as it was.
  sample?: ((meaning: Meaning) => ReactNode) | undefined
  onPick(role: string | null): void
}

export function RoleList({ id, roles, active, label, className, none, sample, onPick }: RoleListProps) {
  return (
    <PickList
      id={id}
      className={`byd-symbol-list byd-role-list ${className}`}
      label={label}
      options={roles}
      keyOf={({ role }) => role ?? ''}
      attrs={({ role }) => ({ 'data-role': role ?? '' })}
      active={active}
      onPick={({ role }) => onPick(role)}
    >
      {(meaning) => (
        <>
          {sample ? sample(meaning) : <span className="byd-role-swatch" style={{ background: meaning.colour }} />}
          <span>{meaning.role ?? none}</span>
        </>
      )}
    </PickList>
  )
}
