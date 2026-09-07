import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

export type RovingOptions = {
  // The items in the order they are rendered, identified the way React keys them.
  ids: string[]
  // What the surrounding view considers current; the single tab stop starts there.
  selected: string | null
  orientation: 'horizontal' | 'vertical'
  // A list whose selection follows focus tells the outside world about every move; a list that
  // activates on purpose (a tablist over costly panels) leaves that to Enter, Space or a click.
  followFocus?: boolean
  onActivate?(id: string): void
}

export type RovingItemProps = {
  tabIndex: number
  ref(el: HTMLElement | null): void
  onKeyDown(event: KeyboardEvent): void
  onFocus(): void
}

// A roving tabindex (APG): a list of items is one tab stop, and the arrow keys move focus inside
// it. Both the editor's tablist and its layer list are such lists, so the behaviour lives here
// once instead of being written twice.
export function useRoving({ ids, selected, orientation, followFocus = false, onActivate }: RovingOptions) {
  const [focused, setFocused] = useState<string | null>(null)
  const elements = useRef(new Map<string, HTMLElement>())
  // A selection made somewhere else — the wall opens the template by clicking an element — takes
  // the tab stop with it, so the one way in is always the item that is open.
  const chosen = useRef(selected)
  if (chosen.current !== selected) {
    chosen.current = selected
    if (focused !== selected) setFocused(selected)
  }
  const here = focused && ids.includes(focused) ? focused : selected && ids.includes(selected) ? selected : (ids[0] ?? null)
  const back = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  const forward = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'

  // Moving focus is the whole move: a list whose selection follows focus reports it from the
  // focus handler, so arriving by Tab, by arrow or by click all say the same thing.
  const moveTo = (id: string | undefined) => {
    if (!id) return
    setFocused(id)
    elements.current.get(id)?.focus()
  }

  // The list can change under the keyboard: a layer is removed, added or moved. Removing the
  // element that had focus drops focus on the document, which loses the reader's place, so the
  // item that took its position takes the focus too. A move keeps the same item — React keys it,
  // so its element (and its focus) simply travels — and an addition leaves focus alone.
  const order = useRef(ids)
  useLayoutEffect(() => {
    const before = order.current
    order.current = ids
    if (!focused || ids.includes(focused)) return
    const stranded = !document.activeElement || document.activeElement === document.body
    const heir = ids[Math.min(before.indexOf(focused), ids.length - 1)] ?? null
    setFocused(heir)
    if (heir && stranded) elements.current.get(heir)?.focus()
    // The list's identity is its ids, not the array that carries them.
  }, [ids.join('\u0000')])

  const itemProps = (id: string): RovingItemProps => ({
    tabIndex: id === here ? 0 : -1,
    ref: (el) => {
      if (el) elements.current.set(id, el)
      else elements.current.delete(id)
    },
    onFocus: () => {
      setFocused(id)
      if (followFocus) onActivate?.(id)
    },
    onKeyDown: (event) => {
      const at = ids.indexOf(id)
      // The ends wrap: a list this short is quicker to leave through its own end than to walk back.
      if (event.key === forward) moveTo(ids[(at + 1) % ids.length])
      else if (event.key === back) moveTo(ids[(at - 1 + ids.length) % ids.length])
      else if (event.key === 'Home') moveTo(ids[0])
      else if (event.key === 'End') moveTo(ids[ids.length - 1])
      else return
      event.preventDefault()
    },
  })

  return { itemProps }
}
