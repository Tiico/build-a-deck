import type { Element } from './types.js'
import { useRoving } from './roving.js'

export type LayerListProps = {
  // Top-most first, the way the list is read.
  layers: Element[]
  selected: string | null
  onSelect(id: string): void
  // The heading the surrounding view gives the list; the list does not know its own frame.
  labelledBy: string
}

// The layers of the template as a single-select listbox: each layer is an option that says its
// type and its name, and the selection follows focus — pointing at a layer only outlines it on
// the card, so there is nothing to defer to a second keystroke.
export function LayerList({ layers, selected, onSelect, labelledBy }: LayerListProps) {
  const { itemProps } = useRoving({
    ids: layers.map((l) => l.id),
    selected,
    orientation: 'vertical',
    followFocus: true,
    onActivate: onSelect,
  })
  return (
    <ul role="listbox" aria-labelledby={labelledBy}>
      {layers.map((e) => (
        <li key={e.id} role="option" data-layer={e.id} aria-selected={e.id === selected ? 'true' : 'false'} onClick={() => onSelect(e.id)} {...itemProps(e.id)}>
          <span className="byd-layer-kind">{e.kind}</span> <span>{e.id}</span>
        </li>
      ))}
    </ul>
  )
}
