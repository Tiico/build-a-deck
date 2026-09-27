// The keyboard's own rules in the editor, in one place so no surface can answer a key twice.

// Every key belongs to the field being typed in: Ctrl+Z there is the field's own step back — a word
// at a time, kept by the field itself (`word-steps.ts`), since a field the editor controls gets no
// useful one from the browser — and the project's would throw the typing away. A field with nothing
// of its own left hands the press on (`passToEditor`). A tick box owns none of them — it answers
// only the space bar — so the surfaces around it still hear the keyboard.
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
  // A key held down is one press. The browser goes on sending it thirty times a second, and none
  // of those is something the designer asked for a second time.
  if (event.repeat) return null
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 's') return 'save'
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  return null
}

// A step back a field has handed on (#479): a cell that has nothing of its own left to take back
// marks the press, and the editor, which leaves presses in a field to the field, takes this one.
const handed = new WeakSet<Event>()
export function passToEditor(event: Event): void {
  handed.add(event)
}
export function passedToEditor(event: Event): boolean {
  return handed.has(event)
}
