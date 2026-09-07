import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import type { Element, ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { arrowMove, fitScale, HANDLES, movedTo, newElement, resizedTo, snapped, STAGE_SCALE, TOOLS, type Box, type ElementKind, type Grab, type Guides, type Handle } from './canvas.js'
import { fieldsOf } from './fields.js'
import { LayerList } from './LayerList.js'
import { useRoving } from './roving.js'

export type TemplateCanvasProps = {
  doc: ProjectDoc
  face: string
  // The row the preview shows.
  row: string | null
  selectedElement: string | null
  onSelectElement(id: string | null): void
  onPatch(id: string, patch: Partial<Element>): void
  onRemove(id: string): void
  onAdd(element: Element): void
  // Where a layer ends up in the face's base list, which is the order the card is drawn in.
  onReorder(id: string, to: number): void
}

// Template mode (A): layers on the left, the card large in the middle with the selected element
// outlined, and its properties on the right. Every change goes through `onPatch` and lands on
// every card of the deck — there are no per-card exceptions (L3).
export function TemplateCanvas({ doc, face, row, selectedElement, onSelectElement, onPatch, onRemove, onAdd, onReorder }: TemplateCanvasProps) {
  const faceTemplate = doc.template.faces[face]
  const el = faceTemplate?.base.find((e) => e.id === selectedElement)
  useElementKeys(el, onPatch, onRemove)
  const stage = useRef<HTMLElement | null>(null)
  const scale = useStageFit(stage)
  // The grid is a layer to see by, not a rule (variant C, kept as an option): it is off until it
  // is asked for, and it never rounds an element to itself — the guides and the arrow keys are
  // what place things, and a 1 mm grid would take the half millimetre away.
  const [grid, setGrid] = useState(false)
  if (!faceTemplate) return <p>Mallen saknar sidan {face}.</p>
  const rowData = doc.rows.find((r) => r.id === row)?.fields ?? doc.rows[0]?.fields ?? {}
  const fields = fieldsOf(doc)
  // A new element is added where it can be seen and is selected at once, so the next thing the
  // designer does — drag it, nudge it, bind it — is about the element they just asked for.
  const add = (kind: ElementKind) => {
    const element = newElement(kind, { taken: faceTemplate.base.map((e) => e.id), field: fields[0], card: CARD_STANDARD_63x88.physical })
    onAdd(element)
    onSelectElement(element.id)
  }

  return (
    <div className="byd-canvas">
      <ToolRail onAdd={add} />
      <aside className="byd-canvas-layers">
        <h2 id="layers-heading">Lager</h2>
        <LayerList
          layers={[...faceTemplate.base].reverse()}
          selected={selectedElement}
          onSelect={onSelectElement}
          // The list reads top-most first; the base list is drawn back to front. One is the other
          // turned around, and that is the only place the two orders meet.
          onReorder={(id, to) => onReorder(id, faceTemplate.base.length - 1 - to)}
          labelledBy="layers-heading"
        />
        <label className="byd-canvas-grid-toggle">
          <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
          Rutnät 1 mm
        </label>
        <p className="byd-canvas-hint">Dra ett lager för att ändra ordningen, eller håll Alt och tryck pil upp eller ner.</p>
      </aside>
      <main className="byd-canvas-stage" ref={stage} onClick={() => onSelectElement(null)}>
        <CardPreview
          id="canvas"
          face={faceTemplate}
          row={rowData}
          icons={doc.icons}
          scale={scale}
          selectedElement={selectedElement}
          onSelectElement={onSelectElement}
          overlay={<DragLayer grid={grid} boxes={faceTemplate.base.filter(isBox)} selected={selectedElement} onSelect={onSelectElement} onPatch={onPatch} />}
        />
      </main>
      <aside className="byd-canvas-props">
        <h2>{el ? `Egenskaper · ${el.id}` : 'Egenskaper'}</h2>
        {el && <Properties el={el} fields={fields} onPatch={(patch) => onPatch(el.id, patch)} />}
      </aside>
    </div>
  )
}

// The zoom that shows a whole card: measured from the stage and the card as they are drawn, and
// measured again whenever the window changes. Where nothing can be measured — a headless test,
// a first paint — the card keeps the zoom the stage starts at.
function useStageFit(stage: RefObject<HTMLElement | null>): number {
  const [scale, setScale] = useState(STAGE_SCALE)
  useLayoutEffect(() => {
    const el = stage.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      const card = el.querySelector('[data-card]')?.getBoundingClientRect()
      const room = el.getBoundingClientRect()
      if (card) setScale((was) => fitScale(was, { w: card.width, h: card.height }, { w: room.width, h: room.height }))
    }
    fit()
    const watching = new ResizeObserver(fit)
    watching.observe(el)
    return () => watching.disconnect()
  }, [stage])
  return scale
}

// An element that has a box of its own, and can therefore be dragged. A condition around other
// elements has none.
type BoxElement = Element & Box
function isBox(el: Element): el is BoxElement {
  return 'w' in el && 'h' in el
}

// The layer that takes the pointer (#18, variant A): one transparent box over each element, in
// the card's own millimetres. It draws no card content — the compiler behind it is still the one
// renderer — and it holds the pointer with pointer capture, so a fast drag or a trackpad that
// leaves the box keeps moving the element it grabbed.
function DragLayer({ boxes, grid, selected, onSelect, onPatch }: { boxes: BoxElement[]; grid: boolean; selected: string | null; onSelect(id: string): void; onPatch: TemplateCanvasProps['onPatch'] }) {
  const layer = useRef<HTMLDivElement | null>(null)
  const grab = useRef<(Grab & { id: string; handle: Handle | null }) | null>(null)
  const [guides, setGuides] = useState<Guides>({ x: null, y: null })

  const down = (event: ReactPointerEvent<HTMLElement>, box: BoxElement, handle: Handle | null) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelect(box.id)
    const rect = layer.current?.getBoundingClientRect()
    if (!rect?.width) return
    grab.current = { id: box.id, box, handle, at: { x: event.clientX, y: event.clientY }, mmPerPx: CARD_STANDARD_63x88.physical.widthMm / rect.width }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const held = grab.current
    if (!held) return
    const to = { x: event.clientX, y: event.clientY }
    if (held.handle) return onPatch(held.id, resizedTo(held, to, held.handle))
    const others = boxes.filter((b) => b.id !== held.id)
    const placed = snapped(held.box, movedTo(held, to), others, CARD_STANDARD_63x88.physical)
    setGuides(placed.guides)
    // A click is a grab that went nowhere: it selects, and leaves the template alone.
    if (placed.at.x === held.box.x && placed.at.y === held.box.y) return
    onPatch(held.id, placed.at)
  }
  const up = () => {
    grab.current = null
    setGuides({ x: null, y: null })
  }

  return (
    <div className="byd-drag-layer" data-drag-layer ref={layer} aria-hidden="true">
      {grid && <div className="byd-drag-grid" data-grid />}
      {boxes.map((box) => (
        <div
          key={box.id}
          className="byd-drag-box"
          data-drag={box.id}
          style={{ left: `${box.x}mm`, top: `${box.y}mm`, width: `${box.w}mm`, height: `${box.h}mm` }}
          onPointerDown={(event) => down(event, box, null)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onClick={(event) => event.stopPropagation()}
        >
          {box.id === selected &&
            HANDLES.map((corner) => (
              <i
                key={corner}
                className="byd-drag-handle"
                data-handle={corner}
                onPointerDown={(event) => down(event, box, corner)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
              />
            ))}
        </div>
      ))}
      {guides.x !== null && <div className="byd-drag-guide" data-guide="x" style={{ left: `${guides.x}mm` }} />}
      {guides.y !== null && <div className="byd-drag-guide" data-guide="y" style={{ top: `${guides.y}mm` }} />}
    </div>
  )
}

// The four tools that add an element (#18, variant A). A toolbar is one tab stop with the arrows
// moving inside it (APG), the same roving tabindex the tablist and the layer list already use, so
// the way to the card is never four presses of Tab longer than it has to be.
function ToolRail({ onAdd }: { onAdd(kind: ElementKind): void }) {
  const { itemProps } = useRoving({ ids: TOOLS.map((t) => t.kind), selected: null, orientation: 'vertical' })
  return (
    <aside className="byd-canvas-tools" role="toolbar" aria-label="Verktyg" aria-orientation="vertical">
      {TOOLS.map((tool) => (
        <button key={tool.kind} type="button" onClick={() => onAdd(tool.kind)} {...itemProps(tool.kind)}>
          <span aria-hidden="true">{tool.glyph}</span>
          {tool.name}
        </button>
      ))}
    </aside>
  )
}

// The keyboard over the card (#18): the arrows nudge the selected element and Delete takes it
// away, wherever the focus is — the layer list, the card, the panel around them. Two things are
// left alone: a key a control has already answered (the layer list's own arrows say so by
// preventing the default), and any key typed into a field.
function useElementKeys(el: Element | undefined, onPatch: TemplateCanvasProps['onPatch'], onRemove: TemplateCanvasProps['onRemove']) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!el || event.defaultPrevented || isTyping(event.target)) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        return onRemove(el.id)
      }
      // An element without a box of its own — a condition around others — has nothing to move.
      if (!('x' in el)) return
      const moved = arrowMove(el, event.key, event.shiftKey)
      if (!moved) return
      event.preventDefault()
      onPatch(el.id, moved)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })
}

// Backspace deletes a card element only when it is not deleting a character, and an arrow moves
// one only when it is not stepping a number or picking an option: a field being typed in owns
// every key it gets. A tick box owns none of them — it answers only the space bar — so the card
// still hears the keyboard from there.
const TICKED = ['checkbox', 'radio', 'button', 'submit', 'reset']
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLInputElement) return !TICKED.includes(target.type)
  return target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
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
      {'bind' in el && (
        // Every element that shows data says which column it shows — a picture and a row of
        // icons as much as a text box, or one added from the tool rail could never be bound.
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
      )}
      {el.kind === 'text' && (
        <>
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
