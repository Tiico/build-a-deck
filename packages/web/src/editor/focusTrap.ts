import { useEffect, useRef, type RefObject } from 'react'

// The keyboard held inside a modal window for as long as it stands (#296).
//
// The editor had nothing of the kind. Its history is a panel that says `aria-modal="false"` and
// means it, and its questions are strips a reader may tab past and leave standing. A library
// dialog is neither: what is behind it is not what is being asked about, so a Tab that walked
// out of it into the table would be a Tab into a surface the dialog has covered. The hook does
// the four things a modal window owes the keyboard, and nothing else:
//
// - the focus moves in when the window opens, onto the first thing that can take it — or onto
//   what the window names, when a window opens on a search field rather than on its close;
// - Tab from the last thing cycles to the first and Shift+Tab from the first to the last, and a
//   focus that lands outside anyway (a click beside the window) is pulled back to the first;
// - Escape is the window's, and nothing behind it hears the press;
// - when the window closes, the focus goes back to whatever had it before — the control that
//   opened the window, in every case this tool has.
//
// What can take the focus is asked of the document and not written down as a list of tags: a
// refused button is not a stop, and neither is anything a `tabindex` has taken out of the order.
const TABBABLE = 'a[href], button, input, select, textarea, [tabindex]'

export function tabbablesIn(box: HTMLElement): HTMLElement[] {
  return [...box.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => {
    if (el.tabIndex < 0 || el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false
    if ((el as HTMLButtonElement).disabled) return false
    return true
  })
}

export type FocusTrapOptions = {
  onEscape?: (() => void) | undefined
  // Where the focus goes when the window opens, when it is not the first thing inside.
  initial?: (() => HTMLElement | null) | undefined
  // Whether the window is holding the keyboard right now (#388). A window that asks a question of
  // its own — and asks it outside itself, where the answer has to be able to take the focus — lets
  // go for as long as that question stands, and takes hold again when it is answered. Read live
  // rather than through the effect, because the question takes the focus in the same commit that
  // says it is standing: a trap that let go one effect later would have pulled the focus back out
  // of the question first.
  active?: boolean | undefined
}

export function useFocusTrap(box: RefObject<HTMLElement | null>, options: FocusTrapOptions = {}): void {
  // Read through a ref so the trap is set once per window and not once per render: the listeners
  // below are bound on mount, and a callback that changed identity must not unbind them.
  const latest = useRef(options)
  latest.current = options
  useEffect(() => {
    const el = box.current
    if (!el) return
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = () => tabbablesIn(el)[0]
    const enter = latest.current.initial?.() ?? first()
    enter?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (latest.current.active === false) return
      // Escape is the window's only where the window asked for it. A box that answers its own
      // Escape without closing — the door's name box (#384, #388) — has two levels of it, and a
      // trap that stopped the press here would answer for both of them.
      if (event.key === 'Escape' && latest.current.onEscape) {
        event.stopPropagation()
        event.preventDefault()
        latest.current.onEscape()
        return
      }
      if (event.key !== 'Tab') return
      const stops = tabbablesIn(el)
      const head = stops[0]
      const tail = stops[stops.length - 1]
      if (!head || !tail) return
      const at = document.activeElement
      if (event.shiftKey && (at === head || !el.contains(at))) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && at === tail) {
        event.preventDefault()
        head.focus()
      }
    }
    const onFocusIn = (event: FocusEvent) => {
      if (latest.current.active === false) return
      if (event.target instanceof Node && el.contains(event.target)) return
      first()?.focus()
    }
    el.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      el.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      // Back to the opener, when it is still on the page to go back to. A window whose opener
      // went with it — a row taken away — leaves the focus where the browser puts it, which is
      // no worse than before the window opened.
      if (before?.isConnected) before.focus()
    }
  }, [box])
}
