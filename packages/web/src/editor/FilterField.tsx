import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useT } from '../i18n/index.js'

// The search field, and in it what the column doors have chosen (#617, variant A).
//
// A filter is a state the reader is standing in, and a state has to be read without opening
// anything (#128, #130). The chips in the crown were that reading and cost three quarters of the
// row; the doors in the head (`ColumnFilter`) are where the choice is made now, and this field is
// where the choice is read: one token per chosen value, «typ: varelse ×», in front of the text
// the designer searches with. Taking a token away is taking the tick away, from here, and the hand
// stays in the field.
//
// The keyboard's way in is the same field (L23): «typ:» lists the column's values under it, the
// list narrows as the designer types, the arrows walk it and Enter takes the value as a token. A
// character opens a list, as `{` does in a cell and `[[` does in the rulebook — and, as there, the
// price is that the way in does not show, so the placeholder says it.
export type FilterToken = { field: string; label: string; value: string }
// The column the designer has typed the name of, and the values that begin as she has typed.
export type TypedColumn = { field: string; label: string; options: readonly { value: string; count: number }[] }

export function FilterField({
  query,
  tokens,
  typed,
  hint,
  onQuery,
  onRemove,
  onPick,
}: {
  query: string
  tokens: readonly FilterToken[]
  typed: TypedColumn | null
  // The first column with a vocabulary, for the placeholder to show the way in with.
  hint: string | null
  onQuery(query: string): void
  onRemove(token: FilterToken): void
  onPick(field: string, value: string): void
}) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  // Which of the listed values the cursor stands on. It starts over whenever the list does.
  const [at, setAt] = useState(0)
  useEffect(() => setAt(0), [query])
  const options = typed?.options ?? []
  const cursor = options.length === 0 ? -1 : Math.min(at, options.length - 1)
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Backspace on an empty field takes the last token back, the way a token field reads.
    const last = tokens[tokens.length - 1]
    if (event.key === 'Backspace' && query === '' && last) {
      onRemove(last)
      return
    }
    if (!typed) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setAt((n) => Math.min(n + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setAt((n) => Math.max(n - 1, 0))
    } else if (event.key === 'Enter') {
      const under = options[cursor]
      if (!under) return
      event.preventDefault()
      onPick(typed.field, under.value)
    }
  }
  return (
    <div className="byd-data-filter" onClick={(event) => event.target === event.currentTarget && input.current?.focus()}>
      {tokens.map((token) => (
        <span key={`${token.field}\u0000${token.value}`} className="byd-chip">
          <span>{t('table.filter.token', { field: token.label, value: token.value })}</span>
          <button
            type="button"
            aria-label={t('table.filter.remove', { field: token.label, value: token.value })}
            onClick={() => {
              onRemove(token)
              input.current?.focus()
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        </span>
      ))}
      <input
        ref={input}
        type="search"
        aria-label={t('table.search')}
        placeholder={hint === null ? t('table.search.placeholder') : t('table.search.placeholder.typed', { field: hint })}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={onKeyDown}
        {...(typed ? { 'aria-autocomplete': 'list' as const, 'aria-expanded': true, 'aria-controls': 'byd-data-typed' } : {})}
      />
      {typed && (
        <div className="byd-data-typed" id="byd-data-typed" role="listbox" aria-label={typed.label}>
          {options.length === 0 ? (
            <p>{t('table.filter.none')}</p>
          ) : (
            options.map(({ value, count }, i) => (
              <div
                key={value}
                role="option"
                aria-label={value}
                aria-selected={i === cursor}
                // Down, not click: a click would take the focus from the field before it fired.
                onPointerDown={(event) => {
                  event.preventDefault()
                  onPick(typed.field, value)
                }}
              >
                <b>{t('table.filter.token', { field: typed.label, value: '' }).trim()}</b> {value}
                <small>{t('table.filter.cards', { n: count })}</small>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
