import { useEffect, type RefObject } from 'react'

// A panel that hangs from a button — the history on the revision (B4), who has the game on the
// faces (D3) — is a non-modal popover, and a non-modal popover closes the two ways every
// application closes one: Escape, and a press anywhere outside it.
//
// Neither worked (#133). The only way out was pressing the same button again, so a designer who
// opened the history over the layer list had to find the revision in the header to get her work
// back — and both panels could stand open at once, over the work and over each other.
//
// Escape hands the focus back to the button that opened the panel, because a panel that took the
// focus has to give it back. A press outside does not: the pointer has already said where the
// focus should go.
//
// The panel is named by a selector rather than by a ref so that the panels themselves stay plain
// components with nothing to forward. `pointerdown` is what a real pointer sends; `mousedown` is
// there for the keyboard-free synthetic clicks the tests and older assistive software send, and
// closing twice is closing once.
export function useDismiss(open: boolean, opener: RefObject<HTMLElement | null>, panel: string, close: () => void): void {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      opener.current?.focus()
    }
    const outside = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(panel) || opener.current?.contains(target)) return
      close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('mousedown', outside, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('mousedown', outside, true)
    }
  }, [open, opener, panel, close])
}
