// The keyboard's own rules in the editor, in one place so no surface can answer a key twice.

// Every key belongs to the field being typed in: Ctrl+Z there is the field's own step back, which
// the browser already does well, and the project's would throw the typing away. A tick box owns
// none of them — it answers only the space bar — so the surfaces around it still hear the keyboard.
const TICKED = ['checkbox', 'radio', 'button', 'submit', 'reset']

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLInputElement) return !TICKED.includes(target.type)
  return target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

// The editor's chords (#35). Cmd on a Mac, Ctrl everywhere else, and both accepted either way so a
// borrowed keyboard still works. Ctrl+Y is deliberately not among them: Shift+Z already says
// forward, and a second binding for one thing is a third thing to remember.
export type Chord = 'undo' | 'redo' | 'save'

export function chordOf(event: KeyboardEvent): Chord | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 's') return 'save'
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  return null
}
