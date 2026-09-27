import { useState, type ChangeEvent, type KeyboardEvent } from 'react'

// A number typed into a field is a draft until it is finished (#478).
//
// Every keystroke used to be written as it came: `12.5` wrote 0, 1, 12 and 12.5 — four versions
// for anyone watching the same project, and a card that jumped under the designer's hand — an
// emptied field wrote `Number('')`, which is 0, so a heading typed down to nothing vanished, and a
// floor like Storlek's 1 pt held only for the drag and the arrows. The same shape stood in the
// table's `antal` and the table's counters, so it is answered once, here.
//
// The rule: the digits belong to the field until it is left or Enter is pressed. Then exactly one
// number is written — the draft read the way a reader writes it (a decimal comma is a decimal
// point), held to the field's own floor and ceiling. A draft that is no number at all, the empty
// one included, writes nothing and the field shows what it had. Escape throws the draft away.

// What a finished draft writes, or `null` for nothing at all.
export function settled(draft: string, bounds: { min?: number | undefined; max?: number | undefined } = {}): number | null {
  const text = draft.trim().replace(',', '.')
  if (text === '') return null
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  return Math.min(bounds.max ?? Infinity, Math.max(bounds.min ?? -Infinity, n))
}

export type NumberDraft = {
  value: string
  onChange(event: ChangeEvent<HTMLInputElement>): void
  onBlur(): void
  // `true` when the key was the draft's own (Enter or Escape over a draft) and is spent.
  onKey(event: KeyboardEvent<HTMLInputElement>): boolean
  // Drops the draft without writing it, for a change that comes another way (an arrow press).
  drop(): void
}

export function useNumberDraft({ value, min, max, onCommit }: { value: number; min?: number | undefined; max?: number | undefined; onCommit(value: number): void }): NumberDraft {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    setDraft(null)
    const next = settled(draft, { min, max })
    if (next !== null && next !== value) onCommit(next)
  }
  return {
    value: draft ?? String(value),
    onChange: (event) => setDraft(event.target.value),
    onBlur: commit,
    onKey: (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        commit()
        return true
      }
      if (event.key === 'Escape' && draft !== null) {
        // The draft is what Escape is about while there is one; whatever stands around the field
        // keeps standing.
        event.preventDefault()
        event.stopPropagation()
        setDraft(null)
        return true
      }
      return false
    },
    drop: () => setDraft(null),
  }
}
