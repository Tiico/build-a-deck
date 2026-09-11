import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import type { Element, FaceTemplate, ProjectDoc, Row } from './types.js'
import { CardPreview } from './CardPreview.js'
import { arrowMove, fitScale, HANDLES, iconSized, movedTo, newElement, resizedTo, snapped, STAGE_SCALE, TOOLS, type Box, type ElementKind, type Grab, type Guides, type Handle } from './canvas.js'
import { elementsFor } from '@byd/template'
import { previewIcons } from './assets.js'
import { fieldsOf, takenNames } from './fields.js'
import { NewField } from './NewField.js'
import { isTyping } from './keys.js'
import { cardsInGroup, groupColumn, groupsOf, idsOnFace, layersOf, overriddenIds, ruleLabel, type Layer } from './groups.js'
import { LayerList } from './LayerList.js'
import type { CanvasStage } from './EditorStages.js'
import { useRoving } from './roving.js'
import { familiesInUse, previewFonts } from './fonts.js'
import { LIBRARY, type GameSymbol } from './symbols.js'
import { SymbolList, symbolListKey, symbolOptionId } from './SymbolList.js'
import type { ProjectCredit } from '@byd/server'
import { useT, type Key, type T } from '../i18n/index.js'

export type TemplateCanvasProps = {
  // Which of the four panels to draw, or nothing at all for the desk's four columns (L10). Below
  // 1024 px they are stages one at a time, and the canvas draws the one that is open.
  stage?: CanvasStage | null
  doc: ProjectDoc
  assetBase?: string | undefined
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
  // An icon placed from the tool row (#33). The symbol has to come into the game before an
  // element can show it, and the canvas cannot do that — only the client can name a symbol and
  // upload its bytes — so the canvas says which symbol was chosen and the client does both halves
  // as one edit. Two edits would be two versions and two steps back (B4), and the step in between
  // would be an element on the card pointing at an icon the game does not have.
  onPlaceIcon(symbol: GameSymbol): void
  // Where a layer ends up in the face's base list, which is the order the card is drawn in.
  onReorder(id: string, to: number): void
  // The group whose look is being edited, or nothing for the base every card inherits (#13).
  group: string | null
  onSelectGroup(group: string | null): void
  // The column whose values are the groups; `null` ungroups the deck.
  onGroupColumn(column: string | null): void
  // A column the deck does not have yet (#32). The binding is where a designer finds out it is
  // missing, so it is one of the two places the same form is opened from — and `bindTo` is the
  // element that went looking for it, bound to the new column by the same edit that makes it.
  // Making the column and binding to it are one thing the designer did, so they are one version
  // and one step back (B4); two edits would put an incoherent half-state between the two presses.
  onAddField(field: string, bindTo: string): void
  // Stops the open group from overriding a layer, so it is the base's again.
  onReset(id: string): void
  // The type the game is set in (B3). Uploading is the client's work — the file becomes one of
  // the project's assets — so the canvas asks for it and is told what the family came to be
  // called. What a typeface is licensed under is not in the file: only the designer knows it.
  onFontFile(file: File): Promise<string>
  onFontLicence(family: string, licence: ProjectCredit | null): void
  onRemoveFont(family: string): void
}

// Template mode (A): layers on the left, the card large in the middle with the selected element
// outlined, and its properties on the right. Every change goes through `onPatch` and lands on
// every card of the deck — there are no per-card exceptions (L3).
export function TemplateCanvas({ stage = null, doc, assetBase, face, onSelectFace, row, selectedElement, onSelectElement, onPatch, onRemove, onAdd, onPlaceIcon, onReorder, group, onSelectGroup, onGroupColumn, onAddField, onReset, onFontFile, onFontLicence, onRemoveFont }: TemplateCanvasProps) {
  const t = useT()
  const faceTemplate = doc.template.faces[face]
  const column = groupColumn(doc)
  const groups = groupsOf(doc)
  // The card the canvas shows: with a group open it must be a card of that group, or the group
  // could not be seen. A group whose cards have all gone is shown on the rule itself.
  const rowData = previewRow(doc, column, group, row)
  // The face the open tab is about (#13): with a group open, the face as it stands, so the group
  // is applied; with no group open, the face without its grouping rule, which is the base.
  const tabFace = useMemo(() => faceOfTab(faceTemplate, group), [faceTemplate, group])
  // What the card is compiled from, worked out once per document. Both build a fresh object every
  // call, and the compiler is memoised on identity — so without this the card is compiled again
  // for every re-render of the canvas, which is every pointer move of a drag (E1, B3).
  const icons = useMemo(() => previewIcons(doc, assetBase), [doc, assetBase])
  const fonts = useMemo(() => previewFonts(doc, assetBase), [doc, assetBase])
  // What the open tab actually draws: the base with the group's overrides in place and its
  // removals taken out. The compiler decides that (L3), so the canvas asks the compiler rather
  // than working it out a second time.
  const shown = elementsFor(tabFace, rowData)
  // The panel is the drawn layers plus the ones this group has taken away, so a removal can be
  // seen and undone; the card itself draws only what the compiler returned.
  const panel = faceTemplate ? layersOf(faceTemplate, group) : []
  const layer = panel.find((l) => l.element.id === selectedElement)
  const el = layer?.source === 'removed' ? undefined : layer?.element
  // One door for every change to an element, so a rule about a kind is applied once instead of at
  // each of the ways to make the change. A single icon is its box (#33): the corner handles and
  // the two numbers in the panel are two ways to the same thing, and both come through here.
  const patch = (id: string, changed: Partial<Element>) => onPatch(id, iconSized(panel.find((l) => l.element.id === id)?.element, changed))
  useElementKeys(el, patch, onRemove)
  const stageEl = useRef<HTMLElement | null>(null)
  const scale = useStageFit(stageEl)
  // The grid is a layer to see by, not a rule (variant C, kept as an option): it is off until it
  // is asked for, and it never rounds an element to itself — the guides and the arrow keys are
  // what place things, and a 1 mm grid would take the half millimetre away.
  const [grid, setGrid] = useState(false)
  if (!faceTemplate) return <p>{t('template.faceMissing', { face })}</p>
  const overridden = group ? overriddenIds(faceTemplate, group) : new Set<string>()
  const fields = fieldsOf(doc)
  // A new element is added where it can be seen and is selected at once, so the next thing the
  // designer does — drag it, nudge it, bind it — is about the element they just asked for.
  const add = (kind: ElementKind) => {
    const element = newElement(kind, { taken: idsOnFace(faceTemplate), field: fields[0], card: CARD_STANDARD_63x88.physical })
    onAdd(element)
    onSelectElement(element.id)
  }

  // One panel or all four: a stage draws exactly what it is named after, so nothing is mounted
  // twice and nothing a tab does not point at is left in the tab order.
  const shows = (which: CanvasStage) => stage === null || stage === which
  return (
    <div className="byd-canvas" {...(stage ? { 'data-stage': stage } : {})}>
      {shows('tools') && <ToolRail onAdd={add} onPlaceIcon={onPlaceIcon} />}
      {shows('layers') && (
      <aside className="byd-canvas-layers">
        <h2 id="layers-heading">{t('canvas.layers', { face: faceName(face, t).toLowerCase() })}</h2>
        <p className="byd-canvas-affects">{affectsLabel(doc, column, group, t)}</p>
        <LayerList
          layers={[...panel].reverse().map((l) => l.element)}
          selected={selectedElement}
          onSelect={onSelectElement}
          // The list reads top-most first; the base list is drawn back to front. One is the other
          // turned around, and that is the only place the two orders meet.
          // The order is the base's, shared by every group, so it is only moved from the base.
          {...(group ? {} : { onReorder: (id: string, to: number) => onReorder(id, faceTemplate.base.length - 1 - to) })}
          markOf={(id) => markOf(panel, column, group, id, t)}
          removed={new Set(panel.filter((l) => l.source === 'removed').map((l) => l.element.id))}
          labelledBy="layers-heading"
        />
        <label className="byd-canvas-grid-toggle">
          <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
          {t('canvas.grid')}
        </label>
        <p className="byd-canvas-hint">
          {t(group ? 'canvas.hint.group' : 'canvas.hint.base')}
        </p>
        {column && <GroupRules doc={doc} column={column} groups={groups} />}
      </aside>
      )}
      {shows('canvas') && (
      <div className="byd-canvas-main">
        <div className="byd-canvas-strip">
          <label className="byd-canvas-group-column">
            {t('canvas.groupBy')}
            <select value={column ?? ''} onChange={(event) => onGroupColumn(event.target.value === '' ? null : event.target.value)}>
              <option value="">{t('canvas.groupBy.none')}</option>
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
            face={tabFace}
            row={rowData}
            icons={icons}
            fonts={fonts}
            scale={scale}
            assetBase={assetBase}
            selectedElement={selectedElement}
            onSelectElement={onSelectElement}
            overlay={<DragLayer grid={grid} boxes={shown.filter(isBox)} selected={selectedElement} onSelect={onSelectElement} onPatch={patch} />}
          />
        </main>
      </div>
      )}
      {shows('props') && (
      <aside className="byd-canvas-props">
        <h2>{layer ? t('canvas.props.of', { id: layer.element.id }) : t('canvas.props')}</h2>
        {layer?.source === 'removed' && <p className="byd-canvas-affects">{t('canvas.removedIn', { rule: ruleLabel(column ?? '', group ?? '') })}</p>}
        {/* A panel with nothing in it says why rather than looking broken — and on a small screen
            the layers are another stage away, so it says where to go. */}
        {!layer && <p className="byd-canvas-hint">{t('canvas.props.empty')}</p>}
        {el && <Properties el={el} fields={fields} taken={takenNames(doc)} fonts={Object.keys(doc.fonts ?? {})} icons={Object.keys(doc.icons)} onPatch={(changed) => patch(el.id, changed)} onAddField={onAddField} />}
        {layer && group && overridden.has(layer.element.id) && (
          <button type="button" className="byd-canvas-reset" onClick={() => onReset(layer.element.id)}>
            {t('canvas.reset')}
          </button>
        )}
        <FontShelf doc={doc} onFontFile={onFontFile} onFontLicence={onFontLicence} onRemoveFont={onRemoveFont} />
      </aside>
      )}
    </div>
  )
}

// The fonts the game carries (B3), under the properties because that is where a family is
// chosen. Each one says whether it travels to the printer, and under what licence it is
// borrowed — a typeface is borrowed exactly as a symbol is (E4), and the print order carries
// both. A family no element is set in can go; one in use has no button, so a card is never
// left pointing at a family the game no longer has.
function FontShelf({ doc, onFontFile, onFontLicence, onRemoveFont }: Pick<TemplateCanvasProps, 'doc' | 'onFontFile' | 'onFontLicence' | 'onRemoveFont'>) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const families = Object.entries(doc.fonts ?? {})
  const used = familiesInUse(doc)
  const take = (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    void onFontFile(file)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }
  return (
    <section className="byd-fonts">
      <h2 id="byd-fonts-heading">{t('fonts.title')}</h2>
      {families.length === 0 ? (
        <p className="byd-canvas-affects">{t('fonts.none')}</p>
      ) : (
        <ul aria-labelledby="byd-fonts-heading">
          {families.map(([family, font]) => (
            <li key={family} data-font={family}>
              <span className="byd-fonts-name" style={{ fontFamily: font.stack }}>
                {family}
              </span>
              {!used.includes(family) && (
                <button type="button" onClick={() => onRemoveFont(family)}>
                  {t('fonts.remove')}
                </button>
              )}
              <small>{t(font.asset ? 'fonts.travels' : 'fonts.staysBehind')}</small>
              <Licence family={family} licence={font.licence} onFontLicence={onFontLicence} />
            </li>
          ))}
        </ul>
      )}
      <label className="byd-fonts-upload">
        {t('fonts.upload')}
        <input type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" disabled={busy} onChange={(e) => take(e.target.files?.[0])} />
      </label>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

// What a typeface is borrowed under. Both halves are needed before anything is written: a
// licence with no holder credits no one, and a holder with no licence says nothing about what
// may be printed. Emptying either takes the credit away again.
function Licence({ family, licence, onFontLicence }: { family: string; licence: ProjectCredit | undefined; onFontLicence: TemplateCanvasProps['onFontLicence'] }) {
  const t = useT()
  const [what, setWhat] = useState(licence?.licence ?? '')
  const [by, setBy] = useState(licence?.by ?? '')
  const write = (nextWhat: string, nextBy: string) => {
    const stated = nextWhat.trim() !== '' && nextBy.trim() !== ''
    if (stated) {
      if (nextWhat.trim() === licence?.licence && nextBy.trim() === licence.by) return
      onFontLicence(family, { licence: nextWhat.trim(), by: nextBy.trim() })
      return
    }
    if (licence) onFontLicence(family, null)
  }
  return (
    <span className="byd-fonts-licence">
      <input aria-label={t('fonts.licence.of', { family })} placeholder={t('fonts.licence')} value={what} onChange={(e) => setWhat(e.target.value)} onBlur={() => write(what, by)} />
      <input aria-label={t('fonts.by.of', { family })} placeholder={t('fonts.by')} value={by} onChange={(e) => setBy(e.target.value)} onBlur={() => write(what, by)} />
    </span>
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
  const t = useT()
  const ids = ['', ...groups]
  const { itemProps } = useRoving({ ids, selected: group ?? '', orientation: 'horizontal' })
  return (
    <div className="byd-canvas-groups" role="tablist" aria-label={t('canvas.groups')}>
      {ids.map((g) => (
        <button
          key={g}
          id={groupTabId(g === '' ? null : g)}
          className="byd-choice"
          role="tab"
          type="button"
          aria-selected={(group ?? '') === g ? 'true' : 'false'}
          aria-controls={GROUP_PANEL}
          onClick={() => onSelect(g === '' ? null : g)}
          {...itemProps(g)}
        >
          {g === '' ? t('canvas.group.base') : ruleLabel(column, g)}
        </button>
      ))}
    </div>
  )
}

// Variant B's rule list, kept as the summary beside the canvas: every group as its rule, how many
// cards it is about, and what it changes against the base on each face. Reading, not editing —
// the editing is the tabs and the card.
function GroupRules({ doc, column, groups }: { doc: ProjectDoc; column: string; groups: string[] }) {
  const t = useT()
  return (
    <>
      <h2 id="groups-heading">{t('canvas.rules')}</h2>
      <ul className="byd-canvas-rules" aria-labelledby="groups-heading">
        {groups.map((g) => (
          <li key={g}>
            {ruleLabel(column, g)} · {cardsLabel(cardsInGroup(doc, g).length, t)} · {changesLabel(doc, g, t)}
          </li>
        ))}
      </ul>
    </>
  )
}

// What a group changes against the base, face by face. A group that changes nothing yet is not
// an error — it is a group waiting to be designed — so it says so instead of showing an empty line.
function changesLabel(doc: ProjectDoc, group: string, t: T): string {
  const parts: string[] = []
  for (const [id, face] of Object.entries(doc.template.faces)) {
    const ids = [...overriddenIds(face, group)]
    if (ids.length > 0) parts.push(`${faceName(id, t).toLowerCase()}: ${ids.join(', ')}`)
  }
  return parts.length > 0 ? parts.join(' · ') : t('canvas.group.inherits')
}

// What a layer belongs to, said on the layer itself: the base every card inherits, the open
// group, or — for a base layer the group has taken away — that it is gone for this group's cards.
function markOf(panel: Layer[], column: string | null, group: string | null, id: string, t: T): string | null {
  if (!group) return null
  const source = panel.find((l) => l.element.id === id)?.source
  if (source === 'removed') return t('canvas.mark.removedIn', { rule: ruleLabel(column ?? '', group) })
  return source === 'group' ? ruleLabel(column ?? '', group) : t('canvas.mark.base')
}

// Which cards the open tab is about: the whole deck for the base, the cards the rule matches for
// a group. A designer must never have to count rows to know what a change will reach.
function affectsLabel(doc: ProjectDoc, column: string | null, group: string | null, t: T): string {
  if (!column || !group) return t(doc.rows.length === 1 ? 'canvas.affects.all.one' : 'canvas.affects.all.other', { n: doc.rows.length })
  return t('canvas.affects.group', { cards: cardsLabel(cardsInGroup(doc, group).length, t), rule: ruleLabel(column, group) })
}

function cardsLabel(count: number, t: T): string {
  return t(count === 1 ? 'wall.cards.one' : 'wall.cards.other', { n: count })
}

// A face the template does not have: the canvas says so instead, and this is what it says it of.
const NO_FACE: FaceTemplate = { base: [], variants: {} }

// The face the open tab is about (#13). With a group open that is the face as it stands, and the
// compiler puts that group's overrides in place, drops what it removes and adds what is its own.
// With no group open it is the face without its grouping rule — the base, which is what the tab
// is called, what the layer panel beside it lists, and what an edit made there reaches.
//
// Handing the compiler the whole face on the base tab drew the preview as its own group draws it,
// while the panel listed the base alone: the designer was shown, and could drag, elements the
// panel did not list and the properties could not reach. A drag on one of those goes to the base,
// where a group's own element is not, so the edit was refused from inside a pointer handler once
// per pointermove (#41) — but the element being there at all was the bug, and the refusal only
// how it announced itself.
function faceOfTab(face: FaceTemplate | undefined, group: string | null): FaceTemplate {
  if (!face) return NO_FACE
  if (group || !face.variantBy) return face
  return { base: face.base, variants: face.variants }
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
export const FACE_NAMES: Record<string, Key> = { front: 'canvas.face.front', back: 'canvas.face.back' }

// A face by the name the reader's language gives it; a face the template invented keeps its own
// id, which is the designer's word and not the tool's.
export function faceName(face: string, t: T): string {
  const key = FACE_NAMES[face]
  return key ? t(key) : face
}

function FaceSwitch({ faces, face, onSelect }: { faces: string[]; face: string; onSelect(face: string): void }) {
  const t = useT()
  const { itemProps } = useRoving({ ids: faces, selected: face, orientation: 'horizontal', followFocus: true, onActivate: onSelect })
  return (
    <div className="byd-canvas-faces" role="radiogroup" aria-label={t('canvas.faceSwitch')}>
      {faces.map((f) => (
        <button key={f} type="button" className="byd-choice" role="radio" aria-checked={f === face ? 'true' : 'false'} onClick={() => onSelect(f)} {...itemProps(f)}>
          {faceName(f, t)}
        </button>
      ))}
    </div>
  )
}

// The tools that add an element (#18, variant A). A toolbar is one tab stop with the arrows
// moving inside it (APG), the same roving tabindex the tablist and the layer list already use, so
// the way to the card is never four presses of Tab longer than it has to be.
//
// The icon is the one tool that asks something before it places anything (#33): every other kind
// has a default it can be given, and an icon has no default that is not somebody's guess. So the
// library opens where the icon will stand, rather than two tabs away in the Symboler panel.
const TOOL_SYMBOLS = 'byd-tool-symbols'

function ToolRail({ onAdd, onPlaceIcon }: { onAdd(kind: ElementKind): void; onPlaceIcon(symbol: GameSymbol): void }) {
  const t = useT()
  const { itemProps, focus } = useRoving({ ids: TOOLS.map((tool) => tool.id), selected: null, orientation: 'vertical' })
  const [picking, setPicking] = useState(false)
  // Which symbol the arrow keys are on. The focus never leaves the tool while the library is
  // open — the cell picker keeps it in the cell being typed into for the same reason — so this is
  // where "which one" lives, exactly as it does there.
  const [choice, setChoice] = useState(0)
  // The way out of the library, and back to the tool it was opened from (#8). Closing it unmounts
  // whatever was focused inside it, so without this the focus falls to `<body>` and a rail reached
  // with the keyboard has to be reached again from the top.
  const close = () => {
    setPicking(false)
    setChoice(0)
    focus('icon')
  }
  // Which symbol the arrows are on, when the library is open at all.
  const under = LIBRARY[choice]
  const pick = (symbol: GameSymbol) => {
    setPicking(false)
    setChoice(0)
    onPlaceIcon(symbol)
  }
  return (
    <aside
      className="byd-canvas-tools"
      role="toolbar"
      aria-label={t('canvas.tools')}
      aria-orientation="vertical"
      // Escape, wherever in the rail it was pressed. The tool below answers it first when that is
      // where the focus is; this is the same way out for a press that arrived anywhere else.
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !picking || event.defaultPrevented) return
        event.preventDefault()
        close()
      }}
      // The focus gone out of the rail altogether takes the library with it. A list hanging beside
      // a tool nobody is on is a list about nothing, and it hangs over the canvas being worked on.
      // Nothing inside the library can trigger this: the options give the focus straight back.
      onBlur={(event) => {
        if (!picking || event.currentTarget.contains(event.relatedTarget)) return
        setPicking(false)
        setChoice(0)
      }}
    >
      {TOOLS.map((tool) => {
        const roving = itemProps(tool.id)
        const button = (
          <button
            key={tool.id}
            type="button"
            {...(tool.id === 'icon' ? { 'aria-expanded': picking, ...(picking && under ? { 'aria-controls': TOOL_SYMBOLS, 'aria-activedescendant': symbolOptionId(TOOL_SYMBOLS, under) } : {}) } : {})}
            // Another tool is another element, and the library was opened for this one: leaving it
            // floating over the rail while a text box lands on the card is a list about nothing.
            onClick={() => {
              if (tool.id === 'icon') return setPicking((open) => !open)
              setPicking(false)
              setChoice(0)
              onAdd(tool.id)
            }}
            {...roving}
            // While the library is open the arrows are the list's, not the rail's. Otherwise they
            // walk to the next tool with the list still hanging over it — which is the rail
            // answering a key that was meant for the library.
            onKeyDown={(event) => {
              const act = tool.id === 'icon' && picking ? symbolListKey(event.key, LIBRARY.length, choice) : null
              if (!act) return roving.onKeyDown(event)
              event.preventDefault()
              if (act === 'close') return close()
              if (act === 'pick') return void (under && pick(under))
              setChoice(act.active)
            }}
          >
            <span aria-hidden="true">{tool.glyph}</span>
            {t(tool.name)}
          </button>
        )
        if (tool.id !== 'icon') return button
        // The library hangs off the tool it was opened from and not off the rail, so it opens
        // beside the button that was pressed rather than two rows above it. That is what the
        // wrapper is for and all it is for.
        return (
          <div key={tool.id} className="byd-canvas-tool-icon">
            {button}
            {/* The same library the Symboler tab fills and the brace in a cell opens (E4), and
                the same component: one library seen the same way wherever it is offered. Choosing
                here is choosing an icon and placing it at once — one thing the designer did, so
                one edit and one step back (B4, #32). */}
            {picking && <SymbolList id={TOOL_SYMBOLS} className="byd-canvas-symbols" symbols={LIBRARY} active={choice} label={t('canvas.symbols')} onPick={pick} />}
          </div>
        )
      })}
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


// The value the field picker carries for its last entry, which is not a field but a door (#32).
// Every way a column can come into a deck trims the name it is given — the form that makes one
// does, and a CSV import's headers do — so no key in any document begins with a space, and this
// value does. That is a guarantee about the document rather than a guess about what a designer is
// unlikely to type. The empty string could not be used: it is already what the picker shows for
// an element bound to a literal.
//
// This was a NUL byte first. A NUL has the same property and one other: grep and rg decide a file
// is binary by finding one, and skip the whole of it in silence, so every name in this file fell
// out of codebase search at once and nothing said so.
const NEW_FIELD = ' new'

// `fields` are the columns the picker offers; `taken` is every name a new one would collide with,
// which is those plus the card's own id (#32). `icons` is the game's own set (E4), which is what
// an icon placed on the card is chosen from and changed to.
function Properties({ el, fields, taken, fonts, icons, onPatch, onAddField }: { el: Element; fields: string[]; taken: string[]; fonts: string[]; icons: string[]; onPatch(patch: Partial<Element>): void; onAddField(field: string, bindTo: string): void }) {
  const t = useT()
  // Whether the picker's last entry has been chosen and the form is standing open under it.
  const [making, setMaking] = useState(false)
  // A form that took the focus gives it back (#8). Back is the picker the door was opened from,
  // which is where the designer was and — when the answer was yes — is now showing the column she
  // made. Either way out unmounts the button that was pressed, so without this the focus falls to
  // `<body>` and a panel reached with the keyboard has to be reached again from the top.
  const fieldRef = useRef<HTMLSelectElement>(null)
  const [refocus, setRefocus] = useState(false)
  useEffect(() => {
    if (!refocus) return
    fieldRef.current?.focus()
    setRefocus(false)
  }, [refocus])
  const closeForm = () => {
    setMaking(false)
    setRefocus(true)
  }
  const num = (label: Key, key: 'x' | 'y' | 'w' | 'h') =>
    key in el ? (
      <label>
        {t(label)}
        <input type="number" step={0.5} value={(el as Record<string, unknown>)[key] as number} onChange={(e) => onPatch({ [key]: Number(e.target.value) } as Partial<Element>)} />
      </label>
    ) : null
  return (
    <div className="byd-props">
      {num('canvas.props.x', 'x')}
      {num('canvas.props.y', 'y')}
      {num('canvas.props.w', 'w')}
      {num('canvas.props.h', 'h')}
      {/* Which icon a single one shows (#33). It is bound to a name rather than to a column
          because this icon is the card's and not the row's — a suit mark is the same on every
          card — so the set is what it is chosen from, and the field picker below is the way to
          make it the row's after all. The name it already carries is offered whatever the set
          holds, exactly as the family picker offers the one an element is already set in: an
          element is never moved to another icon behind the designer's back.

          And it stays here when the element has been bound to a column, saying that the icons
          come from there rather than pointing at a name the element does not show. Naming one is
          then the way back: the two pickers are two ways of saying the same thing, so each is the
          way out of what the other did, and neither has to guess a name to go back to. */}
      {el.kind === 'icons' && (icons.length > 0 || 'literal' in el.bind) && (
        <label>
          {t('canvas.props.icon')}
          <select value={'literal' in el.bind ? el.bind.literal : ''} onChange={(e) => e.target.value !== '' && onPatch({ bind: { literal: e.target.value } })}>
            {'field' in el.bind && <option value="">{t('canvas.props.icon.fromField')}</option>}
            {[...new Set([...icons, ...('literal' in el.bind ? [el.bind.literal] : [])])].map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {'bind' in el && (
        // Every element that shows data says which column it shows — a picture and a row of
        // icons as much as a text box, or one added from the tool rail could never be bound.
        <label className="byd-props-field">
          {t('canvas.props.field')}
          <select
            ref={fieldRef}
            value={'field' in el.bind ? el.bind.field : ''}
            onChange={(e) => (e.target.value === NEW_FIELD ? setMaking(true) : e.target.value !== '' && onPatch({ bind: { field: e.target.value } }))}
          >
            {/* An element bound to a value shows no column, and the picker says so. Without this
                the browser draws the first column as the chosen one and the panel states a
                binding the element does not have. */}
            {!('field' in el.bind) && <option value="">{t('canvas.props.field.none')}</option>}
            {fields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            {/* The second door (#32): the designer noticed the column was missing here, so this
                is where she is allowed to make it — and the element is bound to it at once. */}
            <option value={NEW_FIELD}>{t('canvas.props.field.new')}</option>
          </select>
          {making && (
            <NewField
              taken={taken}
              onCreate={(field) => {
                // One call, because it is one thing: the column and this element's binding to it
                // arrive together or the first Ctrl+Z leaves the column standing with the element
                // bound back to whatever it showed before.
                onAddField(field, el.id)
                closeForm()
              }}
              onCancel={closeForm}
            />
          )}
        </label>
      )}
      {el.kind === 'text' && (
        <>
          <label>
            {/* The families the project names, and the one this element is already set in even
                when the project has forgotten it — an element is never moved to another type
                behind the designer's back. */}
            {t('canvas.props.font')}
            <select value={el.font.family} onChange={(e) => onPatch({ font: { ...el.font, family: e.target.value } })}>
              {[...new Set([...fonts, el.font.family])].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('canvas.props.size')}
            <input type="number" step={0.5} value={el.font.sizePt} onChange={(e) => onPatch({ font: { ...el.font, sizePt: Number(e.target.value) } })} />
          </label>
          <label>
            {t('canvas.props.weight')}
            <select value={el.font.weight ?? 400} onChange={(e) => onPatch({ font: { ...el.font, weight: Number(e.target.value) as 400 | 600 | 700 | 800 } })}>
              {[400, 600, 700, 800].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('canvas.props.color')}
            <input type="color" value={el.color} onChange={(e) => onPatch({ color: e.target.value })} />
          </label>
          <label>
            {t('canvas.props.fit')}
            <select value={el.fit ?? 'shrink'} onChange={(e) => onPatch({ fit: e.target.value as 'shrink' | 'fixed' })}>
              <option value="shrink">{t('canvas.fit.shrink')}</option>
              <option value="fixed">{t('canvas.fit.fixed')}</option>
            </select>
          </label>
        </>
      )}
      {el.kind === 'shape' && (
        <label>
          {t('canvas.props.fill')}
          <input type="color" value={el.fill ?? '#000000'} onChange={(e) => onPatch({ fill: e.target.value })} />
        </label>
      )}
    </div>
  )
}
