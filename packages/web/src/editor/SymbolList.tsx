import type { ReactNode } from 'react'
import { PickList, pickKey, pickOptionId, type PickAction } from './picking.js'

// What a key means over the brace's lists (E4, L34). The library itself is drawn by the brace's
// box (`SymbolBox`) and, since #1093, nowhere else — the rail's Ikon tool opens the libraries'
// sheet instead — so what is left here is the meanings' list and the key it is driven by.
//
// What a list of this kind *is* lives in `picking`: no stops in the tab order, `aria-selected` on
// the one the keys are on, a press that refuses the focus so the sentence being written keeps it,
// and the driver pointing at the live option with `aria-activedescendant`.

// What a key means over the list. Kept under its old name because the surfaces that ask it ask
// about symbols; it is `pickKey` and nothing else.
export type SymbolListAction = PickAction
export const symbolListKey = pickKey

// Which option the driver points at, built from the list's own id.
export const roleOptionId = (list: string, role: string | null): string => pickOptionId(list, role ?? '')

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
