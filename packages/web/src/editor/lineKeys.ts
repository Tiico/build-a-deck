import type { KeyboardEvent } from 'react'

// Home and End in a field of the card table (#692, L49). On a Mac they are not caret keys: they
// scroll the nearest scroller to its top or its end, and in the table that scroller is the box —
// so End threw the table three thousand pixels down and left the cell being written in out of
// sight, with the caret where it was. What a field in a table means by them is what it means on
// every other machine: the caret to the start or the end of the line, Shift taking the selection
// with it, and the box left where it stands. So they are answered here, the same on every
// platform, and the browser never gets to scroll for them.
//
// Answers `true` when the key was one of them and has been taken.
export function lineKey(event: KeyboardEvent<HTMLElement>): boolean {
  if (event.key !== 'Home' && event.key !== 'End') return false
  // Ctrl/Cmd+Home and +End are the whole document's keys, and Alt belongs to the system.
  if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return false
  const el = event.currentTarget
  const toEnd = event.key === 'End'
  event.preventDefault()
  if (el instanceof HTMLInputElement) {
    // A number field has no selection to set; taking the key is still what keeps the box still.
    if (el.selectionStart === null || el.selectionEnd === null) return true
    const end = toEnd ? el.value.length : 0
    if (!event.shiftKey) {
      el.setSelectionRange(end, end)
      return true
    }
    // With Shift the end the caret is at moves and the other one stays — the anchor.
    const anchor = el.selectionDirection === 'backward' ? el.selectionEnd : el.selectionStart
    if (toEnd) el.setSelectionRange(anchor, end, 'forward')
    else el.setSelectionRange(end, anchor, 'backward')
    return true
  }
  // A writing area of its own (the body cell, L39): the line is the line as it is laid out, which
  // only the browser knows, so it is asked to move by one.
  el.ownerDocument.getSelection()?.modify(event.shiftKey ? 'extend' : 'move', toEnd ? 'forward' : 'backward', 'lineboundary')
  return true
}
