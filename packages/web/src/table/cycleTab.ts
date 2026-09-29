import type { KeyboardEvent } from 'react'
import { tabbablesIn } from '../editor/focusTrap.js'

// Tab and Shift+Tab kept among a modal window's own stops, wrapping at the ends (#559 P-19). For a
// window that already owns its focus coming in and going back out, and needs only the keyboard
// held inside while it stands; `useFocusTrap` is the whole of that for the editor's windows.
export function cycleTab(event: KeyboardEvent, box: HTMLElement): void {
  const stops = tabbablesIn(box)
  const head = stops[0]
  const tail = stops[stops.length - 1]
  event.preventDefault()
  if (!head || !tail) return
  const at = stops.indexOf(document.activeElement as HTMLElement)
  const next = event.shiftKey ? (at <= 0 ? tail : stops[at - 1]) : at < 0 || at === stops.length - 1 ? head : stops[at + 1]
  next?.focus()
}
