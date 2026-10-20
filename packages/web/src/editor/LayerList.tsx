import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { ASSET_PREFIX, isAssetRef } from './assets.js'
import type { Element } from './types.js'
import { useT } from '../i18n/index.js'
import { useSay } from '../status/StatusLive.js'

export type LayerListProps = {
  // Top-most first, the way the list is read.
  layers: Element[]
  selected: string | null
  onSelect(id: string): void
  // Where a layer ends up, as an index into this list — top-most first, as it is read. A list
  // that cannot be reordered — a group's layers, whose order is the base's — leaves this out.
  onReorder?(id: string, to: number): void
  // Locking a layer (L15). A locked layer keeps its place in the order — the lock is about the
  // card and not about the list — so this is offered even where `onReorder` is not.
  onLock?(id: string, locked: boolean): void
  // What the designer calls the layer. Null puts the name back to the id, which is what an empty
  // box means: the layer has no name of its own any more.
  onRename?(id: string, name: string | null): void
  // The heading the surrounding view gives the list; the list does not know its own frame.
  labelledBy: string
  // What a layer belongs to (#13): the base, the open group, or — a base layer the group takes
  // away — gone from the group's cards; and the group's rule. Nothing at all when the list is not
  // about a group.
  markOf?(id: string): LayerMark | null
  // The layers the open group takes away from its own cards: still listed, so the removal can be
  // seen and undone, but struck through — they are not on the card in front of the designer.
  removed?: ReadonlySet<string>
  // What a picture the template carries by itself is called (#320), by the hash of its bytes.
  pictureName?(hash: string): string
  // What a condition layer says on its row (#478): its condition and on how many cards it holds.
  conditionOf?(el: Element): ConditionSaid | null
}

// A condition in the words the row is written in (#699): the condition as the canvas says it —
// «om raritet = Karaktär» — the column's name as it stands inside those words, and how many cards
// it holds, «10 kort».
export type ConditionSaid = { words: string; field: string; cards: string }

// Whose a layer is while a group is open (#13, #699).
export type LayerMark = { of: 'base' | 'group' | 'removed'; rule: string }

// What the designer calls a layer: the name she gave it, or else its id — which is the word the
// wizard made out of the column and the word the properties panel puts in its heading (L15).
export function layerName(el: Element): string {
  return el.name ?? el.id
}

// What the layer shows, said after its name and only when that is not the name over again. An
// element the rail added is called `bild-1` until it is renamed, and then the column it draws is
// the one thing that says which picture it is.
//
// A picture the element carries by itself (#320) is a reference and not a word, so what is said
// is the picture's name, asked of the caller who knows the library; an empty frame says nothing.
export function layerShows(el: Element, pictureName?: (hash: string) => string): string | null {
  if (!('bind' in el)) return null
  if ('literal' in el.bind && el.kind === 'image') {
    if (!isAssetRef(el.bind.literal)) return el.bind.literal === '' ? null : el.bind.literal
    return pictureName ? pictureName(el.bind.literal.slice(ASSET_PREFIX.length)) : null
  }
  const shows = 'literal' in el.bind ? el.bind.literal : el.bind.field
  return shows === layerName(el) ? null : shows
}

// The two columns a row has. Focus lives on a cell, which is what a grid means (APG).
const COLS = ['lock', 'layer'] as const
type Col = (typeof COLS)[number]

// The layers of the template as a grid: a row per layer, saying what it is called, what it shows
// and whether it is locked. It is a grid and not a listbox because a row carries a control of its
// own — a control inside an option is a control a screen reader cannot reach (UX-37, #82) — and
// the lock has to be reachable from the layer it belongs to.
// The selection follows focus on the layer itself: pointing at a layer only outlines it on the
// card, so there is nothing to defer to a second keystroke. The order is changed by dragging a
// layer onto another (#18, from variant C) and, because a list that can only be dragged is a list
// a keyboard has lost, by Alt and an arrow.
export function LayerList({ layers, selected, onSelect, onReorder, onLock, onRename, labelledBy, markOf, removed, pictureName, conditionOf }: LayerListProps) {
  const t = useT()
  const ids = layers.map((l) => l.id)
  const dragged = useRef<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // Which layer is being renamed. One at a time: a rename is something the designer is in the
  // middle of, not a state a row can be left in.
  const [renaming, setRenaming] = useState<string | null>(null)
  const { cellProps, focus } = useCells(ids, selected)
  // A field that took the focus gives it back (#8), and it has to wait for the row to be a row
  // again: the layer cell does not exist while its own name is being typed into, so focusing it
  // in the same breath as closing the field aims at nothing and the focus falls to `<body>`.
  // A field left by clicking elsewhere is not brought back — the focus went where it was sent.
  const back = useRef<string | null>(null)
  useEffect(() => {
    if (renaming !== null || !back.current) return
    const id = back.current
    back.current = null
    focus(id, 'layer')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the focus goes back when the rename ends, not whenever `focus` is a new function
  }, [renaming])

  // A condition layer nobody has named is called by its condition (#478): «if-guld» says
  // nothing the condition does not say better.
  const nameOf = (el: Element) => (el.kind === 'if' && !el.name ? (conditionOf?.(el)?.words ?? layerName(el)) : layerName(el))
  const say = useSay()
  const moveTo = (id: string, to: number) => {
    if (!onReorder || to < 0 || to >= layers.length) return
    onReorder(id, to)
  }
  // Alt and an arrow move the layer; the arrow alone moves the focus, which the grid answers.
  const withMove = (id: string, at: number, props: ReturnType<typeof cellProps>) => ({
    ...props,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        const to = at + (event.key === 'ArrowUp' ? -1 : 1)
        if (!onReorder || to < 0 || to >= layers.length) return
        moveTo(id, to)
        // The focus goes with the layer, so nothing is read when it moves; the new place is said
        // instead, as the card says every nudge (#556).
        const moved = layers[at]
        if (moved) say?.('polite', t('canvas.layer.moved', { name: nameOf(moved), at: to + 1, of: layers.length }))
        return
      }
      props.onKeyDown(event)
    },
  })
  const rename = (el: Element, value: string) => {
    const name = value.trim()
    if (!onRename || name === layerName(el)) return
    onRename(el.id, name === '' || name === el.id ? null : name)
  }

  return (
    <div role="grid" aria-labelledby={labelledBy} className="byd-layers">
      {layers.map((el, at) => {
        const name = nameOf(el)
        const condition = el.kind === 'if' ? (conditionOf?.(el) ?? null) : null
        // A condition nobody has named is written out whole and wraps (#699); a named one says its
        // condition after its name, the way any other layer says what it shows.
        const wraps = condition !== null && !el.name
        const shows = el.kind === 'if' ? (condition && el.name ? `${condition.words} · ${condition.cards}` : null) : layerShows(el, pictureName)
        const folder = el.kind === 'if' ? el : null
        // A condition layer is a folder (#478) that opens when it is chosen (#699, variant D): the
        // button that opened it without choosing it took 44 px of the 220 the row has, and the
        // keyboard, which chooses by walking, never reached it anyway.
        const unfold = folder !== null && selected === el.id
        const mark = markOf?.(el.id) ?? null
        // What a screen reader hears on the layer (#699): its name, what it shows, how many cards a
        // condition holds, and whose the layer is in a group — «om raritet = Silver, 14 kort»,
        // «title, från basen». The dot and the badge are for the eye; the words are the same.
        const said = [
          name,
          el.kind === 'if' ? (el.name ? condition?.words : null) : shows,
          condition?.cards,
          mark && t(mark.of === 'base' ? 'canvas.mark.base' : mark.of === 'group' ? 'canvas.mark.own.said' : 'canvas.mark.removedIn', { rule: mark.rule }),
        ]
          .filter(Boolean)
          .join(', ')
        const locked = el.locked === true
        return (
          <div
            key={el.id}
            role="row"
            data-layer={el.id}
            {...(removed?.has(el.id) ? { 'data-removed': '' } : {})}
            // Where the layer lands is the row's place, which is above that row dragged up and
            // below it dragged down (#478): the line is drawn on the side it will land on.
            {...(over === el.id && dragged.current !== el.id ? { 'data-over': dragged.current !== null && ids.indexOf(dragged.current) < at ? 'below' : 'above' } : {})}
            aria-selected={el.id === selected ? 'true' : 'false'}
            draggable={onReorder !== undefined && renaming !== el.id}
            onDragStart={() => (dragged.current = el.id)}
            onDragEnd={() => {
              dragged.current = null
              setOver(null)
            }}
            onDragOver={(event: DragEvent) => {
              event.preventDefault()
              setOver(el.id)
            }}
            onDrop={(event: DragEvent) => {
              event.preventDefault()
              const held = dragged.current
              dragged.current = null
              setOver(null)
              if (held && held !== el.id) moveTo(held, at)
            }}
          >
            <span role="gridcell" className="byd-layer-lockcell">
              <button
                type="button"
                className="byd-layer-lock"
                aria-pressed={locked}
                aria-label={t(locked ? 'canvas.layer.unlock' : 'canvas.layer.lock', { name })}
                disabled={onLock === undefined}
                {...withMove(el.id, at, cellProps(el.id, 'lock'))}
                onClick={() => onLock?.(el.id, !locked)}
              >
                <LockGlyph closed={locked} />
              </button>
            </span>
            <span role="gridcell" className="byd-layer-cell">
              {renaming === el.id ? (
                <input
                  className="byd-layer-rename"
                  aria-label={t('canvas.layer.rename', { name })}
                  defaultValue={layerName(el)}
                  autoFocus
                  // The old name is marked (#478), so what is typed replaces it rather than being
                  // written after it.
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== 'Escape') return
                    event.preventDefault()
                    if (event.key === 'Enter') rename(el, event.currentTarget.value)
                    back.current = el.id
                    setRenaming(null)
                  }}
                  onBlur={(event) => {
                    rename(el, event.currentTarget.value)
                    setRenaming(null)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="byd-layer-pick"
                  aria-label={said}
                  {...withMove(el.id, at, cellProps(el.id, 'layer', () => onSelect(el.id)))}
                  onClick={() => onSelect(el.id)}
                  onDoubleClick={() => onRename && setRenaming(el.id)}
                  onKeyDownCapture={(event) => {
                    // F2 renames, which is what a grid's own cell does everywhere else (APG).
                    if (event.key !== 'F2' || !onRename) return
                    event.preventDefault()
                    setRenaming(el.id)
                  }}
                >
                  <KindGlyph kind={el.kind} />
                  {/* A condition is written out whole and breaks over as many lines as it needs (#699,
                      variant D, which revises #569's cut at the start): «om raritet = / Karaktär · 10
                      kort». Nothing is cut, so the row needs no title to say what it hides. */}
                  {condition && wraps ? (
                    <span className="byd-layer-name" data-wraps="">
                      <ConditionWords said={condition} /> <span className="byd-layer-count">· {condition.cards}</span>
                    </span>
                  ) : (
                    <span className="byd-layer-name" title={name}>
                      {name}
                    </span>
                  )}
                  {shows && <i className="byd-layer-shows">{shows}</i>}
                  {/* In a group a base layer carries no mark (#699): «· bas» on every row said what
                      the rows all shared, and broke each of them in two. What the group changes
                      carries its badge, and a layer it takes away says so, struck through. */}
                  {mark?.of === 'group' && (
                    <span className="byd-layer-own" title={mark.rule}>
                      {t('canvas.mark.own')}
                    </span>
                  )}
                  {mark?.of === 'removed' && <span className="byd-layer-source">· {t('canvas.mark.removedIn', { rule: mark.rule })}</span>}
                </button>
              )}
              {folder && unfold && (
                <ul className="byd-layer-inside" aria-label={t('canvas.if.inside', { name })}>
                  {folder.children.map((child) => (
                    <li key={child.id}>
                      <KindGlyph kind={child.kind} />
                      {layerName(child)}
                    </li>
                  ))}
                </ul>
              )}
            </span>
            {/* The grip, and on a folder the folder's arrow in its place (#699): only a sign, since
                choosing the layer is what opens it, and still the grip on a list that can be dragged. */}
            {folder ? (
              <span className={onReorder ? 'byd-layer-grip byd-layer-folder' : 'byd-layer-folder'} data-open={unfold ? 'true' : 'false'} aria-hidden="true" />
            ) : (
              onReorder && (
                <span className="byd-layer-grip" aria-hidden="true">
                  ⠿
                </span>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

// A condition's words with the column's name set apart (#699): a long column name is hyphenated
// where the line has to break it — «Utrustnings-kategori» — while the value, which is what tells
// one condition from the next, breaks only between its words.
function ConditionWords({ said }: { said: ConditionSaid }) {
  const at = said.words.indexOf(said.field)
  if (at < 0 || said.field === '') return <>{said.words}</>
  const end = at + said.field.length
  return (
    <>
      <span className="byd-layer-field">{said.words.slice(0, end)}</span>
      {said.words.slice(end)}
    </>
  )
}

// Focus in a grid lives on a cell (APG): the grid is one tab stop, the up and down arrows walk
// the rows in the column they are in, left and right cross between the lock and the layer, and
// Home and End are the ends of that column.
function useCells(ids: string[], selected: string | null) {
  // Nothing is focused until something is: until then the one tab stop is whatever the view
  // considers selected, so tabbing into the panel lands on the layer that is open rather than on
  // whichever layer happens to be drawn first.
  const [at, setAt] = useState<{ id: string | null; col: Col }>({ id: null, col: 'layer' })
  const elements = useRef(new Map<string, HTMLElement>())
  const key = (id: string, col: Col) => `${id}\u0000${col}`
  // A selection made somewhere else — the wall opens the template by clicking an element — takes
  // the tab stop with it, so the one way in is always the layer that is open.
  const chosen = useRef(selected)
  if (chosen.current !== selected) {
    chosen.current = selected
    if (selected && selected !== at.id) setAt({ id: selected, col: 'layer' })
  }
  const here = { id: at.id && ids.includes(at.id) ? at.id : selected && ids.includes(selected) ? selected : (ids[0] ?? ''), col: at.col }

  const focus = (id: string, col: Col) => {
    setAt({ id, col })
    elements.current.get(key(id, col))?.focus()
  }

  // The grid can change under the keyboard: a layer is removed, added or moved. Removing the one
  // that had focus drops focus on the document, which loses the reader's place, so the layer that
  // took its position takes the focus too. A move keeps the same layer — React keys it, so its
  // element and its focus simply travel — and an addition leaves focus alone.
  const order = useRef(ids)
  useLayoutEffect(() => {
    const before = order.current
    order.current = ids
    // The cell that actually had focus, not the one the fallback would land on: after a removal
    // the fallback is already a layer that is still there, so asking it would answer that nothing
    // was lost and the focus would be left on `<body>`.
    if (!at.id || ids.includes(at.id)) return
    const stranded = !document.activeElement || document.activeElement === document.body
    const heir = ids[Math.min(before.indexOf(at.id), ids.length - 1)]
    if (!heir) return
    setAt({ id: heir, col: at.col })
    if (stranded) elements.current.get(key(heir, at.col))?.focus()
    // The grid's identity is its ids, not the array that carries them.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the grid’s identity is its ids, not the array that carries them
  }, [ids.join('\u0000')])

  const cellProps = (id: string, col: Col, onFocused?: () => void) => ({
    tabIndex: id === here.id && col === here.col ? 0 : -1,
    ref: (el: HTMLElement | null) => {
      if (el) elements.current.set(key(id, col), el)
      else elements.current.delete(key(id, col))
    },
    onFocus: () => {
      setAt({ id, col })
      onFocused?.()
    },
    onKeyDown: (event: KeyboardEvent) => {
      const row = ids.indexOf(id)
      const column = COLS.indexOf(col)
      // The ends wrap: a list this short is quicker to leave through its own end than to walk back.
      const toRow = (n: number) => focus(ids[(n + ids.length) % ids.length] ?? id, col)
      const toCol = (n: number) => focus(id, COLS[(n + COLS.length) % COLS.length] ?? col)
      if (event.key === 'ArrowDown') toRow(row + 1)
      else if (event.key === 'ArrowUp') toRow(row - 1)
      else if (event.key === 'ArrowRight') toCol(column + 1)
      else if (event.key === 'ArrowLeft') toCol(column - 1)
      else if (event.key === 'Home') toRow(0)
      else if (event.key === 'End') toRow(ids.length - 1)
      else return
      event.preventDefault()
    },
  })
  return { cellProps, focus }
}

// The glyph that says what kind of layer it is, drawn rather than written: the word for the kind
// is the first thing a 220 px panel runs out of room for, and a shape is quicker to recognise
// than its name anyway.
function KindGlyph({ kind }: { kind: Element['kind'] }) {
  return (
    <svg className="byd-layer-kind" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {kind === 'text' && <path d="M3 3h10v2.2M8 3v10M5.6 13h4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
      {kind === 'image' && (
        <>
          <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3.4 11.2 6.6 7.8l2 2.2 1.8-1.8 2.2 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </>
      )}
      {kind === 'icons' && (
        <>
          <circle cx="4" cy="8" r="1.8" fill="currentColor" />
          <circle cx="8" cy="8" r="1.8" fill="currentColor" />
          <circle cx="12" cy="8" r="1.8" fill="currentColor" />
        </>
      )}
      {kind === 'shape' && <rect x="2.6" y="3.6" width="10.8" height="8.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />}
      {(kind === 'group' || kind === 'if') && <path d="M3 4.5h10M3 8h10M3 11.5h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  )
}

// Open or shut, and the difference is the whole state: a padlock that only changes colour says
// nothing to anyone who cannot see the colour.
function LockGlyph({ closed }: { closed: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d={closed ? 'M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7' : 'M5.6 7V5.2a2.4 2.4 0 0 1 4.6-.8'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
