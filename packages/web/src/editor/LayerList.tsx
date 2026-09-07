import { useRef, type DragEvent, type KeyboardEvent } from 'react'
import type { Element } from './types.js'
import { useRoving } from './roving.js'

export type LayerListProps = {
  // Top-most first, the way the list is read.
  layers: Element[]
  selected: string | null
  onSelect(id: string): void
  // Where a layer ends up, as an index into this list — top-most first, as it is read.
  onReorder(id: string, to: number): void
  // The heading the surrounding view gives the list; the list does not know its own frame.
  labelledBy: string
}

// The layers of the template as a single-select listbox: each layer is an option that says its
// type and its name, and the selection follows focus — pointing at a layer only outlines it on
// the card, so there is nothing to defer to a second keystroke.
// The order is changed by dragging a layer onto another (#18, from variant C) and, because a
// list that can only be dragged is a list a keyboard has lost, by Alt and an arrow.
export function LayerList({ layers, selected, onSelect, onReorder, labelledBy }: LayerListProps) {
  const { itemProps } = useRoving({
    ids: layers.map((l) => l.id),
    selected,
    orientation: 'vertical',
    followFocus: true,
    onActivate: onSelect,
  })
  const dragged = useRef<string | null>(null)
  const moveTo = (id: string, to: number) => {
    if (to < 0 || to >= layers.length) return
    onReorder(id, to)
  }
  // Alt and an arrow move the layer; the arrow alone moves the focus, and the roving tabindex
  // below is left to answer that.
  const onKeyDown = (event: KeyboardEvent, id: string, at: number, roving: (e: KeyboardEvent) => void) => {
    if (!event.altKey) return roving(event)
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    moveTo(id, at + (event.key === 'ArrowUp' ? -1 : 1))
  }
  const onDrop = (event: DragEvent, at: number) => {
    event.preventDefault()
    const id = dragged.current
    dragged.current = null
    if (id && id !== layers[at]?.id) moveTo(id, at)
  }

  return (
    <ul role="listbox" aria-labelledby={labelledBy}>
      {layers.map((e, at) => {
        const roving = itemProps(e.id)
        return (
          <li
            key={e.id}
            role="option"
            data-layer={e.id}
            aria-selected={e.id === selected ? 'true' : 'false'}
            onClick={() => onSelect(e.id)}
            draggable
            onDragStart={() => (dragged.current = e.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(event, at)}
            {...roving}
            onKeyDown={(event) => onKeyDown(event, e.id, at, roving.onKeyDown)}
          >
            <span className="byd-layer-kind">{e.kind}</span> <span>{e.id}</span>
          </li>
        )
      })}
    </ul>
  )
}
