import { useRef, type KeyboardEvent } from 'react'
import { passToEditor } from './keys.js'

// A step back inside a field that is written in (#479, #481; L14). A field the editor controls
// gets no useful undo from the browser — one character at a time, or nothing — so the field keeps
// its own: what it held when it was entered, and every word finished since. Ctrl+Z comes back
// through them a word at a time, and once there is nothing of the field's own left the press is
// handed on to the editor's history, so the same key is never dead.
//
// Kept per field and per visit: a field entered again starts over from what it holds then.
export type WordSteps = {
  // The field was entered holding `value`; what it kept from an earlier visit is forgotten.
  enter(field: string, value: string): void
  // The field now holds `value`, by the designer's own hand.
  typed(field: string, value: string): void
  // What the field held when it was entered.
  first(field: string): string | undefined
  // Forget everything but what the field held when it was entered.
  reset(field: string): void
  // A key in the field. True when it was a step back and has been answered: by `write` with the
  // word to go back to, or by handing the press on to the editor. Without `write` the field is
  // given the word the way a keystroke would give it, so its own change handler writes it.
  undo(field: string, event: KeyboardEvent, write?: (value: string) => void): boolean
}

type Kept = { steps: string[]; last: string }

export function useWordSteps(): WordSteps {
  const kept = useRef(new Map<string, Kept>())
  // A word handed back through the field's own change handler is not a word typed.
  const restoring = useRef(false)
  return {
    enter: (field, value) => void kept.current.set(field, { steps: [value], last: value }),
    typed: (field, value) => {
      const own = kept.current.get(field)
      if (!own || restoring.current) return
      // A word just finished is a place the step back comes to.
      if (/\s$/.test(value) && !/\s$/.test(own.last)) own.steps.push(value)
      own.last = value
    },
    first: (field) => kept.current.get(field)?.steps[0],
    reset: (field) => {
      const own = kept.current.get(field)
      if (own) own.steps.splice(1)
    },
    undo: (field, event, write) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') return false
      // The field the key was pressed in, which is where it is heard or inside where it is heard.
      const el = event.target as HTMLInputElement | HTMLTextAreaElement
      const own = kept.current.get(field)
      const steps = own?.steps ?? []
      while (steps.length > 0 && steps[steps.length - 1] === el.value) steps.pop()
      const back = steps[steps.length - 1]
      if (back === undefined || !own) {
        passToEditor(event.nativeEvent)
        return true
      }
      event.preventDefault()
      own.last = back
      if (write) return write(back), true
      restoring.current = true
      try {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, back)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      } finally {
        restoring.current = false
      }
      return true
    },
  }
}
