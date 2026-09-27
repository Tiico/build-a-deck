import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { titleOfRow } from '@byd/server/doc'
import type { Element, FaceTemplate, ProjectDoc } from './types.js'
import { useT } from '../i18n/index.js'

type Card = ProjectDoc['rows'][number]

// Which card the template is drawn on, under the card itself (#478, beslut 2026-09-27, variant B).
// Mall never said, and another card was a round trip through Kortvägg. The row names the card and
// where it stands among the cards shown, steps to the one before and after, finds any of them by
// name — the deck's own title, with the id beside it where the title is empty or shared, as the
// card list in Media does (L22) — and says the values on it that decide how it looks.
export function CardRow({ cards, current, face, onPick }: { cards: readonly Card[]; current: Card | undefined; face: FaceTemplate | undefined; onPick(id: string): void }) {
  const t = useT()
  const listId = useId()
  const at = current ? cards.findIndex((card) => card.id === current.id) : -1
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const name = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const needle = query.trim().toLowerCase()
  const titled = cards.map((card) => ({ card, title: titleOfRow(card) }))
  const shared = (card: Card, title: string) => title === card.id || titled.some((other) => other.card.id !== card.id && other.title === title)
  const found = needle === '' ? titled : titled.filter(({ card, title }) => title.toLowerCase().includes(needle) || card.id.toLowerCase().includes(needle))
  const close = (back: boolean) => {
    setOpen(false)
    setQuery('')
    setActive(0)
    if (back) name.current?.focus()
  }
  const pick = (id: string) => {
    onPick(id)
    close(true)
  }
  // A press outside the list closes it where the reader is (L32).
  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((n) => Math.max(0, Math.min(found.length - 1, n + (event.key === 'ArrowDown' ? 1 : -1))))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = found[active]
      if (chosen) pick(chosen.card.id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    }
  }
  const step = (by: number) => {
    const next = cards[at + by]
    if (next) onPick(next.id)
  }
  const title = current ? titleOfRow(current) : ''
  const values = current ? lookOf(face, current) : []
  return (
    <div className="byd-card-row" role="group" aria-label={t('canvas.card.row')} ref={box}>
      <button type="button" aria-label={t('canvas.card.prev')} disabled={at <= 0} onClick={() => step(-1)}>
        ‹
      </button>
      <button ref={name} type="button" className="byd-card-row-name" aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? close(true) : setOpen(true))}>
        <span>{title}</span>
        <small>{t('canvas.card.of', { n: at + 1, of: cards.length })} ▾</small>
      </button>
      <button type="button" aria-label={t('canvas.card.next')} disabled={at < 0 || at >= cards.length - 1} onClick={() => step(1)}>
        ›
      </button>
      {values.length > 0 && (
        <p className="byd-card-row-values">
          {values.map(([column, value], i) => (
            <span key={column}>
              {i > 0 && ' · '}
              <b>{column}</b> {value}
            </span>
          ))}
        </p>
      )}
      {open && (
        <div className="byd-card-row-list">
          <input
            type="search"
            role="combobox"
            aria-label={t('canvas.card.search')}
            aria-expanded="true"
            aria-controls={listId}
            placeholder={t('canvas.card.search.of', { n: cards.length })}
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={keys}
          />
          <ul id={listId} role="listbox" aria-label={t('canvas.card.list')}>
            {found.length === 0 && <li className="byd-card-row-none">{t('canvas.card.none')}</li>}
            {found.map(({ card, title: named }, n) => (
              <li
                key={card.id}
                role="option"
                aria-selected={card.id === current?.id}
                data-active={n === active ? '' : undefined}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => pick(card.id)}
              >
                <span>{named}</span>
                {shared(card, named) && <small>{card.id}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// The values on a card that decide how the template draws it: the column its look is grouped by,
// every column a condition asks about, every column a colour follows — and how many there are.
function lookOf(face: FaceTemplate | undefined, card: Card): [string, string][] {
  const columns = new Set<string>()
  if (face?.variantBy) columns.add(face.variantBy)
  const walk = (elements: readonly Element[]) => {
    for (const el of elements) {
      if (el.kind === 'if') {
        columns.add(el.when.field)
        walk(el.children)
      }
      if ('fill' in el && el.fill && typeof el.fill === 'object') columns.add(el.fill.field)
    }
  }
  walk(face?.base ?? [])
  const out: [string, string][] = [...columns].map((column) => [column, String(card.fields[column] ?? '')])
  out.push(['antal', String(card.fields['antal'] ?? 1)])
  return out
}
