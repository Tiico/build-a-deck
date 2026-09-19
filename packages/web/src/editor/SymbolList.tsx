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
export const roleOptionId = (list: string, role: string): string => pickOptionId(list, role)

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
          <img src={symbolPreview(symbol)} alt="" />
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
export type RoleListProps = {
  id: string
  roles: readonly { role: string; colour: string }[]
  active: number
  label: string
  className: string
  onPick(role: string): void
}

export function RoleList({ id, roles, active, label, className, onPick }: RoleListProps) {
  return (
    <PickList
      id={id}
      className={`byd-symbol-list byd-role-list ${className}`}
      label={label}
      options={roles}
      keyOf={({ role }) => role}
      attrs={({ role }) => ({ 'data-role': role })}
      active={active}
      onPick={({ role }) => onPick(role)}
    >
      {({ role, colour }) => (
        <>
          <span className="byd-role-swatch" style={{ background: colour }} />
          <span>{role}</span>
        </>
      )}
    </PickList>
  )
}
