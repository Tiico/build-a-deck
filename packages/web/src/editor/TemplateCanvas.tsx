import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import type { Element, ProjectDoc, Row } from './types.js'
import { CardPreview } from './CardPreview.js'
import { arrowMove, fitScale, HANDLES, movedTo, newElement, resizedTo, snapped, STAGE_SCALE, TOOLS, type Box, type ElementKind, type Grab, type Guides, type Handle } from './canvas.js'
import { elementsFor } from '@byd/template'
import { fieldsOf } from './fields.js'
import { cardsInGroup, groupColumn, groupsOf, layersOf, overriddenIds, ruleLabel, type Layer } from './groups.js'
import { LayerList } from './LayerList.js'
import type { CanvasStage } from './EditorStages.js'
import { useRoving } from './roving.js'

export type TemplateCanvasProps = {
  // Which of the four panels to draw, or nothing at all for the desk's four columns (L10). Below
  // 1024 px they are stages one at a time, and the canvas draws the one that is open.
  stage?: CanvasStage | null
  doc: ProjectDoc
  face: string
  // Which face is being edited (#13, L7). The back is a template like the front, and the switch
  // is what issue #14 hangs the default back and the group's own backs on.
  onSelectFace(face: string): void
  // The row the preview shows.
  row: string | null
  selectedElement: string | null
  onSelectElement(id: string | null): void
  onPatch(id: string, patch: Partial<Element>): void
  onRemove(id: string): void
  onAdd(element: Element): void
  // Where a layer ends up in the face's base list, which is the order the card is drawn in.
  onReorder(id: string, to: number): void
  // The group whose look is being edited, or nothing for the base every card inherits (#13).
  group: string | null
  onSelectGroup(group: string | null): void
  // The column whose values are the groups; `null` ungroups the deck.
  onGroupColumn(column: string | null): void
  // Stops the open group from overriding a layer, so it is the base's again.
  onReset(id: string): void
}

// Template mode (A): layers on the left, the card large in the middle with the selected element
// outlined, and its properties on the right. Every change goes through `onPatch` and lands on
// every card of the deck — there are no per-card exceptions (L3).
export function TemplateCanvas({ stage = null, doc, face, onSelectFace, row, selectedElement, onSelectElement, onPatch, onRemove, onAdd, onReorder, group, onSelectGroup, onGroupColumn, onReset }: TemplateCanvasProps) {
  const faceTemplate = doc.template.faces[face]
  const column = groupColumn(doc)
  const groups = groupsOf(doc)
  // The card the canvas shows: with a group open it must be a card of that group, or the group
  // could not be seen. A group whose cards have all gone is shown on the rule itself.
  const rowData = previewRow(doc, column, group, row)
  // What the open group actually draws: the base with its overrides in place and its removals
  // taken out. The compiler decides that (L3), so the canvas asks the compiler rather than
  // working it out a second time.
  const shown = faceTemplate ? elementsFor(faceTemplate, rowData) : []
  // The panel is the drawn layers plus the ones this group has taken away, so a removal can be
  // seen and undone; the card itself draws only what the compiler returned.
  const panel = faceTemplate ? layersOf(faceTemplate, group) : []
  const layer = panel.find((l) => l.element.id === selectedElement)
  const el = layer?.source === 'removed' ? undefined : layer?.element
  useElementKeys(el, onPatch, onRemove)
  const stageEl = useRef<HTMLElement | null>(null)
  const scale = useStageFit(stageEl)
  // The grid is a layer to see by, not a rule (variant C, kept as an option): it is off until it
  // is asked for, and it never rounds an element to itself — the guides and the arrow keys are
  // what place things, and a 1 mm grid would take the half millimetre away.
  const [grid, setGrid] = useState(false)
  if (!faceTemplate) return <p>Mallen saknar sidan {face}.</p>
  const overridden = group ? overriddenIds(faceTemplate, group) : new Set<string>()
  const fields = fieldsOf(doc)
  // A new element is added where it can be seen and is selected at once, so the next thing the
  // designer does — drag it, nudge it, bind it — is about the element they just asked for.
  const add = (kind: ElementKind) => {
    const element = newElement(kind, { taken: shown.map((e) => e.id), field: fields[0], card: CARD_STANDARD_63x88.physical })
    onAdd(element)
    onSelectElement(element.id)
  }

  // One panel or all four: a stage draws exactly what it is named after, so nothing is mounted
  // twice and nothing a tab does not point at is left in the tab order.
  const shows = (which: CanvasStage) => stage === null || stage === which
  return (
    <div className="byd-canvas" {...(stage ? { 'data-stage': stage } : {})}>
      {shows('tools') && <ToolRail onAdd={add} />}
      {shows('layers') && (
      <aside className="byd-canvas-layers">
        <h2 id="layers-heading">Lager · {(FACE_NAMES[face] ?? face).toLowerCase()}</h2>
        <p className="byd-canvas-affects">{affectsLabel(doc, column, group)}</p>
        <LayerList
          layers={[...panel].reverse().map((l) => l.element)}
          selected={selectedElement}
          onSelect={onSelectElement}
          // The list reads top-most first; the base list is drawn back to front. One is the other
          // turned around, and that is the only place the two orders meet.
          // The order is the base's, shared by every group, so it is only moved from the base.
          {...(group ? {} : { onReorder: (id: string, to: number) => onReorder(id, faceTemplate.base.length - 1 - to) })}
          markOf={(id) => markOf(panel, column, group, id)}
          removed={new Set(panel.filter((l) => l.source === 'removed').map((l) => l.element.id))}
          labelledBy="layers-heading"
        />
        <label className="byd-canvas-grid-toggle">
          <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
          Rutnät 1 mm
        </label>
        <p className="byd-canvas-hint">
          {group
            ? 'Lagrens ordning är basens och ändras med basfliken vald.'
            : 'Dra ett lager för att ändra ordningen, eller håll Alt och tryck pil upp eller ner.'}
        </p>
        {column && <GroupRules doc={doc} column={column} groups={groups} />}
      </aside>
      )}
      {shows('canvas') && (
      <div className="byd-canvas-main">
        <div className="byd-canvas-strip">
          <label className="byd-canvas-group-column">
            Grupperas av kolumnen
            <select value={column ?? ''} onChange={(event) => onGroupColumn(event.target.value === '' ? null : event.target.value)}>
              <option value="">— ingen —</option>
              {fields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          {column && <GroupTabs column={column} groups={groups} group={group} onSelect={onSelectGroup} />}
          {/* The strip is two rows at every width: the group tabs are the one thing in it that
              can run out of room, and they scroll, so the front/back switch keeps its own right
              edge instead of being pushed past it (#13). */}
          <FaceSwitch faces={Object.keys(doc.template.faces)} face={face} onSelect={onSelectFace} />
        </div>
        <main
          className="byd-canvas-stage"
          ref={stageEl}
          onClick={() => onSelectElement(null)}
          {...(column ? { role: 'tabpanel', id: GROUP_PANEL, 'aria-labelledby': groupTabId(group) } : {})}
        >
          <CardPreview
            id="canvas"
            face={faceTemplate}
            row={rowData}
            icons={doc.icons}
            scale={scale}
            selectedElement={selectedElement}
            onSelectElement={onSelectElement}
            overlay={<DragLayer grid={grid} boxes={shown.filter(isBox)} selected={selectedElement} onSelect={onSelectElement} onPatch={onPatch} />}
          />
        </main>
      </div>
      )}
      {shows('props') && (
      <aside className="byd-canvas-props">
        <h2>{layer ? `Egenskaper · ${layer.element.id}` : 'Egenskaper'}</h2>
        {layer?.source === 'removed' && <p className="byd-canvas-affects">Lagret är borttaget i {ruleLabel(column ?? '', group ?? '')}.</p>}
        {/* A panel with nothing in it says why rather than looking broken — and on a small screen
            the layers are another stage away, so it says where to go. */}
        {!layer && <p className="byd-canvas-hint">Välj ett lager i lagerlistan, eller ett element på kortet.</p>}
        {el && <Properties el={el} fields={fields} onPatch={(patch) => onPatch(el.id, patch)} />}
        {layer && group && overridden.has(layer.element.id) && (
          <button type="button" className="byd-canvas-reset" onClick={() => onReset(layer.element.id)}>
            Återgå till basen
          </button>
        )}
      </aside>
      )}
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

// The groups on the canvas (#13, variant A): the base every card inherits, then one tab per
// value the grouping column carries. A tab is a rule, never a bag of cards — which is why the
// tab says `typ = fälla` and not "fällorna".
const GROUP_PANEL = 'byd-canvas-group-panel'
const groupTabId = (group: string | null) => `byd-group-tab-${group ?? 'bas'}`

function GroupTabs({ column, groups, group, onSelect }: { column: string; groups: string[]; group: string | null; onSelect(group: string | null): void }) {
  const ids = ['', ...groups]
  const { itemProps } = useRoving({ ids, selected: group ?? '', orientation: 'horizontal' })
  return (
    <div className="byd-canvas-groups" role="tablist" aria-label="Kortgrupper">
      {ids.map((g) => (
        <button
          key={g}
          id={groupTabId(g === '' ? null : g)}
          role="tab"
          type="button"
          aria-selected={(group ?? '') === g ? 'true' : 'false'}
          aria-controls={GROUP_PANEL}
          onClick={() => onSelect(g === '' ? null : g)}
          {...itemProps(g)}
        >
          {g === '' ? 'Bas (alla)' : ruleLabel(column, g)}
        </button>
      ))}
    </div>
  )
}

// Variant B's rule list, kept as the summary beside the canvas: every group as its rule, how many
// cards it is about, and what it changes against the base on each face. Reading, not editing —
// the editing is the tabs and the card.
function GroupRules({ doc, column, groups }: { doc: ProjectDoc; column: string; groups: string[] }) {
  return (
    <>
      <h2 id="groups-heading">Grupper</h2>
      <ul className="byd-canvas-rules" aria-labelledby="groups-heading">
        {groups.map((g) => (
          <li key={g}>
            {ruleLabel(column, g)} · {cardsLabel(cardsInGroup(doc, g).length)} · {changesLabel(doc, g)}
          </li>
        ))}
      </ul>
    </>
  )
}

// What a group changes against the base, face by face. A group that changes nothing yet is not
// an error — it is a group waiting to be designed — so it says so instead of showing an empty line.
function changesLabel(doc: ProjectDoc, group: string): string {
  const parts: string[] = []
  for (const [id, face] of Object.entries(doc.template.faces)) {
    const ids = [...overriddenIds(face, group)]
    if (ids.length > 0) parts.push(`${(FACE_NAMES[id] ?? id).toLowerCase()}: ${ids.join(', ')}`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'ärver basen helt'
}

// What a layer belongs to, said on the layer itself: the base every card inherits, the open
// group, or — for a base layer the group has taken away — that it is gone for this group's cards.
function markOf(panel: Layer[], column: string | null, group: string | null, id: string): string | null {
  if (!group) return null
  const source = panel.find((l) => l.element.id === id)?.source
  if (source === 'removed') return `borttaget i ${ruleLabel(column ?? '', group)}`
  return source === 'group' ? ruleLabel(column ?? '', group) : 'bas'
}

// Which cards the open tab is about: the whole deck for the base, the cards the rule matches for
// a group. A designer must never have to count rows to know what a change will reach.
function affectsLabel(doc: ProjectDoc, column: string | null, group: string | null): string {
  if (!column || !group) return `Alla ${doc.rows.length} kort`
  return `${cardsLabel(cardsInGroup(doc, group).length)} med ${ruleLabel(column, group)}`
}

function cardsLabel(count: number): string {
  return `${count} kort`
}

// The card the canvas shows. With a group open it is a card of that group; a group whose cards
// have all gone is still shown, on a row made of the rule itself, so its design can be reached.
function previewRow(doc: ProjectDoc, column: string | null, group: string | null, row: string | null): Row {
  if (column && group) return cardsInGroup(doc, group)[0]?.fields ?? { [column]: group }
  const picked = doc.rows.find((r) => r.id === row)?.fields ?? doc.rows[0]?.fields ?? {}
  return picked
}

// Which face is being edited (#13, L7). A radio group, not a tablist: the canvas is one surface
// and this says which side of the card it shows, so the arrows both move and choose (APG), and
// the whole switch is a single tab stop.
export const FACE_NAMES: Record<string, string> = { front: 'Framsida', back: 'Baksida' }

function FaceSwitch({ faces, face, onSelect }: { faces: string[]; face: string; onSelect(face: string): void }) {
  const { itemProps } = useRoving({ ids: faces, selected: face, orientation: 'horizontal', followFocus: true, onActivate: onSelect })
  return (
    <div className="byd-canvas-faces" role="radiogroup" aria-label="Kortsida">
      {faces.map((f) => (
        <button key={f} type="button" role="radio" aria-checked={f === face ? 'true' : 'false'} onClick={() => onSelect(f)} {...itemProps(f)}>
          {FACE_NAMES[f] ?? f}
        </button>
      ))}
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
