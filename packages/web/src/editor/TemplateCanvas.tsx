import { useLayoutEffect, useRef } from 'react'
import type { Element, ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { fieldsOf } from './fields.js'

export type TemplateCanvasProps = {
  doc: ProjectDoc
  face: string
  // The row the preview shows.
  row: string | null
  selectedElement: string | null
  onSelectElement(id: string | null): void
  onPatch(id: string, patch: Partial<Element>): void
}

// Template mode (A): layers on the left, the card large in the middle with the selected element
// outlined, and its properties on the right. Every change goes through `onPatch` and lands on
// every card of the deck — there are no per-card exceptions (L3).
export function TemplateCanvas({ doc, face, row, selectedElement, onSelectElement, onPatch }: TemplateCanvasProps) {
  const faceTemplate = doc.template.faces[face]
  const layers = faceTemplate ? [...faceTemplate.base].reverse() : []
  const layerIds = layers.map((layer) => layer.id)
  const layerOrder = layerIds.join('\0')
  const layerList = useRef<HTMLUListElement>(null)
  const layerButtons = useRef(new Map<string, HTMLButtonElement>())
  const focusedLayer = useRef<string | null>(null)
  const previousLayerIds = useRef<string[]>([])

  useLayoutEffect(() => {
    const focusedId = focusedLayer.current
    if (focusedId && !layerIds.includes(focusedId)) {
      const previousIndex = previousLayerIds.current.indexOf(focusedId)
      const nextId = layerIds[Math.min(Math.max(previousIndex, 0), layerIds.length - 1)] ?? null
      if (nextId) layerButtons.current.get(nextId)?.focus()
      else layerList.current?.focus()
      focusedLayer.current = nextId
      onSelectElement(nextId)
    }
    previousLayerIds.current = layerIds
  }, [layerOrder, onSelectElement])

  if (!faceTemplate) return <p>Mallen saknar sidan {face}.</p>
  const rowData = doc.rows.find((r) => r.id === row)?.fields ?? doc.rows[0]?.fields ?? {}
  const el = faceTemplate.base.find((e) => e.id === selectedElement)
  const fields = fieldsOf(doc)

  return (
    <div className="byd-canvas">
      <aside className="byd-canvas-layers">
        <h2 id="layers-heading">Lager</h2>
        <ul ref={layerList} role="list" aria-labelledby="layers-heading" tabIndex={-1}>
          {layers.map((e) => (
            <li
              key={e.id}
              role="listitem"
              data-layer={e.id}
            >
              <button
                ref={(button) => {
                  if (button) layerButtons.current.set(e.id, button)
                  else layerButtons.current.delete(e.id)
                }}
                type="button"
                data-layer-control={e.id}
                aria-pressed={e.id === selectedElement}
                onFocus={() => {
                  focusedLayer.current = e.id
                }}
                onBlur={(event) => {
                  if (!layerList.current?.contains(event.relatedTarget as Node | null)) focusedLayer.current = null
                }}
                onClick={() => onSelectElement(e.id)}
              >
                <span className="byd-layer-kind">{e.kind}</span> <span>{e.id}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="byd-canvas-stage" onClick={() => onSelectElement(null)}>
        <CardPreview id="canvas" face={faceTemplate} row={rowData} icons={doc.icons} scale={2.6} selectedElement={selectedElement} onSelectElement={onSelectElement} />
      </main>
      <aside className="byd-canvas-props">
        <h2>{el ? `Egenskaper · ${el.id}` : 'Egenskaper'}</h2>
        {el && <Properties el={el} fields={fields} onPatch={(patch) => onPatch(el.id, patch)} />}
      </aside>
    </div>
  )
}

function Properties({ el, fields, onPatch }: { el: Element; fields: string[]; onPatch(patch: Partial<Element>): void }) {
  const num = (label: string, key: 'x' | 'y' | 'w' | 'h') =>
    key in el ? (
      <label>
        {label}
        <input type="number" step={0.5} value={(el as Record<string, unknown>)[key] as number} onChange={(e) => onPatch({ [key]: Number(e.target.value) } as Partial<Element>)} />
      </label>
    ) : null
  return (
    <div className="byd-props">
      {num('X (mm)', 'x')}
      {num('Y (mm)', 'y')}
      {num('Bredd (mm)', 'w')}
      {num('Höjd (mm)', 'h')}
      {el.kind === 'text' && (
        <>
          <label>
            Fält
            <select value={'field' in el.bind ? el.bind.field : ''} onChange={(e) => onPatch({ bind: { field: e.target.value } })}>
              {fields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label>
            Storlek (pt)
            <input type="number" step={0.5} value={el.font.sizePt} onChange={(e) => onPatch({ font: { ...el.font, sizePt: Number(e.target.value) } })} />
          </label>
          <label>
            Vikt
            <select value={el.font.weight ?? 400} onChange={(e) => onPatch({ font: { ...el.font, weight: Number(e.target.value) as 400 | 600 | 700 | 800 } })}>
              {[400, 600, 700, 800].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <label>
            Färg
            <input type="color" value={el.color} onChange={(e) => onPatch({ color: e.target.value })} />
          </label>
          <label>
            Anpassning
            <select value={el.fit ?? 'shrink'} onChange={(e) => onPatch({ fit: e.target.value as 'shrink' | 'fixed' })}>
              <option value="shrink">krymp till gräns</option>
              <option value="fixed">fast storlek</option>
            </select>
          </label>
        </>
      )}
      {el.kind === 'shape' && (
        <label>
          Fyllning
          <input type="color" value={el.fill ?? '#000000'} onChange={(e) => onPatch({ fill: e.target.value })} />
        </label>
      )}
    </div>
  )
}
