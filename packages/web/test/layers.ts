import { screen, within } from '@testing-library/react'

// The layer panel is a grid (L15): a row per layer, the lock in one cell and the layer itself in
// the other. A test that wants a layer asks for its row, and the two cells from there — the
// property panel has `option` elements of its own, and the canvas has other buttons, so a layer
// is never looked for in the document at large.
export const layerGrid = () => screen.getByRole('grid', { name: /lager|layers/i })
export const layerRows = () => within(layerGrid()).getAllByRole('row')
export const layerRow = (id: string): HTMLElement => {
  const row = layerRows().find((r) => r.getAttribute('data-layer') === id)
  if (!row) throw new Error(`no layer ${id} in the panel`)
  return row
}
// The cell that is the layer: pressing it selects the layer, and what it says is what the panel
// calls that layer.
export const layerPick = (id: string): HTMLElement => layerRow(id).querySelector('.byd-layer-pick') as HTMLElement
export const layerLock = (id: string): HTMLElement => layerRow(id).querySelector('.byd-layer-lock') as HTMLElement
export const layerIds = () => layerRows().map((r) => r.getAttribute('data-layer'))
// What the panel calls each layer, in the order it lists them. What a layer *shows* is a second
// line beside the name, read on its own where a test is about that.
export const layerNames = () => layerRows().map((r) => r.querySelector('.byd-layer-name')?.textContent)
export const layerShown = (id: string) => layerRow(id).querySelector('.byd-layer-shows')?.textContent ?? null
