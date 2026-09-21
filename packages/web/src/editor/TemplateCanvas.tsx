import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import type { Element, FaceTemplate, ProjectDoc, Row } from './types.js'
import { CardPreview } from './CardPreview.js'
import { arrowMove, fitScale, gridStep, HANDLES, round, iconSized, movedTo, newElement, resizedTo, snapped, STAGE_SCALE, TOOLS, ZOOM_MAX, ZOOM_MIN, ZOOM_NOTCH, ZOOM_STEP, zoomPercent, zoomTo, type Box, type ElementKind, type Grab, type Guides, type Handle } from './canvas.js'
import { useGesture, type Gesture } from './gesture.js'
import { scrubbed, SCRUB_PX } from './scrub.js'
import { afterPruning, bendStarted, bentEdge, bentPoints, edgeAt, grownPoint, handleAt, midpoints, movedHandle, movedPoint, prunedPoint, straightAll, straightPoint, type Arm, type Point } from './points.js'
import { DEFAULT_FILL, elementsFor, pathFor, shapeTakes, tileMarkup, type Motif, type Paint, type Pattern, type Shadow } from '@byd/template'
import { galleryIdOf, glyphGeometry, newPattern, ownPoints, PATTERNS, shadowIdOf, shapeChoice, SHADOWS, SHAPE_GALLERY, type Geometry, type Shape } from './shapes.js'
import { BACKS } from './backs.js'
import { assetRef, assetUrl, imageFieldsOf, isAssetRef, mediaInGame, previewIcons, ASSET_PREFIX } from './assets.js'
import { fieldsOf, takenNames } from './fields.js'
import { NewField } from './NewField.js'
import { isTyping } from './keys.js'
import { cardsInGroup, groupColumn, groupsOf, idsOnFace, layersOf, overriddenIds, ruleLabel, valuesIn, type Layer } from './groups.js'
import { LayerList, layerName } from './LayerList.js'
import { foldedProps, rememberFoldedProps } from './panes.js'
import { Question } from './Question.js'
import type { CanvasStage } from './EditorStages.js'
import { useRoving } from './roving.js'
import { cardWords, familiesInUse, previewFonts } from './fonts.js'
import { FontCatalog } from './FontCatalog.js'
import type { CatalogFamily } from './font-catalog.js'
import { LIBRARY, type GameSymbol } from './symbols.js'
import { SymbolList, symbolListKey, symbolOptionId } from './SymbolList.js'
import type { ProjectCredit } from '@byd/server'
import { useT, type Key, type T } from '../i18n/index.js'
import { Help } from './HelpDrawer.js'
import { useSay } from '../status/StatusLive.js'
import { DragDoor } from './DragDoor.js'
import { PictureLibraryDialog, type LibraryPicture } from './PictureLibrary.js'

export type TemplateCanvasProps = {
  // Which of the four panels to draw, or nothing at all for the desk's four columns (L10). Below
  // 1024 px they are stages one at a time, and the canvas draws the one that is open.
  stage?: CanvasStage | null
  doc: ProjectDoc
  assetBase?: string | undefined
  // What is drawn inside each picture (E1), keyed by the URL a resolved row carries.
  motifs?: Record<string, Motif> | undefined
  face: string
  // Which face is being edited (#13, L7). The back is a template like the front, and the switch
  // is what issue #14 hangs the default back and the group's own backs on.
  onSelectFace(face: string): void
  // A whole face laid down at once (L17): one of the ready-made backs. One edit, because it is
  // one thing the designer did — see `replaceFace` in the edit vocabulary.
  onReplaceFace(base: Element[]): void
  // The row the preview shows.
  row: string | null
  selectedElement: string | null
  onSelectElement(id: string | null): void
  // `gesture` is the token of the grab a patch belongs to, when it belongs to one. A drag is one
  // thing the designer did and the pointer reports it once per frame; the token is what lets the
  // editor put all those frames on one step back (#35). A patch from a property field has none:
  // it is a whole change on its own.
  onPatch(id: string, patch: Partial<Element>, gesture?: string): void
  // The grab called off rather than let go of (#142): Escape with the hand still down, or a
  // gesture the browser took away from the page. Putting the element back where the grab began
  // and leaving no step behind are both the document's business and not the canvas's, so the
  // canvas says which grab it was and the client takes the whole of it back at once.
  onCallOff(gesture: string): void
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
  // Locking a layer, and what the designer calls it (L15). Both are edits to the element like
  // any other, so they travel the same way everything else on this panel does.
  onLock(id: string, locked: boolean): void
  onRename(id: string, name: string | null): void
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
  // A family taken out of Google Fonts (#329, L27): the file is copied in as the project's own
  // asset, and the licence comes with it because the catalog knows the answer an uploaded file
  // cannot give.
  onCatalogFont(family: CatalogFamily): Promise<void>
  onRemoveFont(family: string): void
  // A picture brought in from the designer's own disk for the template's own picture (#320), by
  // the very path Media takes: it lands in the library, and the element is then bound to it.
  // Uploading is the client's work, so the canvas asks and is told the hash the bytes were
  // filed under.
  onAddPicture?: ((file: File) => Promise<string>) | undefined
}

// Template mode (A): layers on the left, the card large in the middle with the selected element
// outlined, and its properties on the right. Every change goes through `onPatch` and lands on
// every card of the deck — there are no per-card exceptions (L3).
export function TemplateCanvas({ stage = null, doc, assetBase, motifs, face, onSelectFace, onReplaceFace, row, selectedElement, onSelectElement, onPatch, onCallOff, onRemove, onAdd, onPlaceIcon, onReorder, onLock, onRename, group, onSelectGroup, onGroupColumn, onAddField, onReset, onFontFile, onFontLicence, onRemoveFont, onCatalogFont, onAddPicture }: TemplateCanvasProps) {
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
  // The game's pictures as the library window lists them (#320), for the image element that is
  // bound to one of them rather than to a column.
  const pictures = useMemo<LibraryPicture[]>(() => mediaInGame(doc).map(({ hash, cards, template }) => ({ hash, name: doc.pictures?.[hash]?.name, cards, template })), [doc])
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
  // Which layer just refused to move, and why nothing happened (L15). A lock whose whole effect
  // is that nothing happens is indistinguishable from a broken editor, so it says so where the
  // card is — beside the thing that did not move, not at the top of the page.
  const [refused, setRefused] = useState<string | null>(null)
  // Which point of an own shape the designer is standing on (L38): the one whose handles are out,
  // and the one «Räta ut punkten» in the panel is about. It lives here rather than in the canvas
  // because the panel is the other half of it, and it is let go of when another layer is chosen.
  const [pointAt, setPointAt] = useState<number | null>(null)
  useEffect(() => setPointAt(null), [selectedElement])
  // The refusal stands only while the layer it is about is still there and still locked: unlocking
  // it, or taking it away, is the answer to the message and takes the message with it.
  const refusedLayer = panel.find((l) => l.element.id === refused && l.element.locked)?.element
  const patch = (id: string, changed: Partial<Element>, gesture?: string) => onPatch(id, iconSized(panel.find((l) => l.element.id === id)?.element, changed), gesture)
  // Which layer is being asked about before it goes (#143, L9). A card asks before it is removed
  // and a column asks and says what it takes with it; an element is the largest of the three —
  // it draws on every card that inherits it — and was the only one that went without a word, from
  // the key that in every browser means back. So it asks the question the other two ask, through
  // the same component, and the id is what it is about: the layer itself is looked up again each
  // render, so a step back or an edit from another screen takes the question with the layer.
  const [asking, setAsking] = useState<string | null>(null)
  const goes = panel.find((l) => l.element.id === asking && l.source !== 'removed')?.element
  // Where the keyboard stood when the question was opened. The key is heard on the document, so
  // the press comes from wherever the focus happened to be — a tool, a tab, a group strip — and
  // whichever answer is given the focus goes back there rather than to the top of the page, the
  // way a panel over the work hands it back to the button that opened it (#133).
  const asked = useRef<HTMLElement | null>(null)
  const ask = (id: string) => {
    asked.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setAsking(id)
  }
  const handBack = () => {
    const to = asked.current
    asked.current = null
    setAsking(null)
    to?.focus()
  }
  // The key is the card's again only once the question is answered: while it stands, the focus is
  // on one of its answers, and a second Delete there would ask about the same element twice.
  useElementKeys(asking === null ? el : undefined, ask, setRefused)
  // What a deletion is said in when it has happened. The editor has two live regions and no
  // surface makes a third (StatusLive), so the canvas asks for the polite one by name.
  const say = useSay()
  const stageEl = useRef<HTMLElement | null>(null)
  const zoom = useZoom(stageEl)
  // The grid is a layer to see by, not a rule (variant C, kept as an option): it is off until it
  // is asked for, and it never rounds an element to itself — the guides and the arrow keys are
  // what place things, and a 1 mm grid would take the half millimetre away.
  const [grid, setGrid] = useState(false)
  // Whether the typeface catalog's sheet stands under the card (#329, L27). Here and not in the
  // shelf, because the sheet is drawn in the canvas and the button that opens it is in the
  // properties: it is the canvas that the sheet takes 62 % of.
  const [catalog, setCatalog] = useState(false)
  // Whether the properties are folded away (#129). By hand and only by hand: a column that folds
  // itself when nothing is selected changes the card's width every time the designer clicks beside
  // an element, and the card moves under the pointer that is working on it. It is a view of this
  // desk and not of the game, so it is remembered in the browser and never in the document.
  const [folded, setFolded] = useState(foldedProps)
  const fold = (away: boolean) => {
    setFolded(away)
    rememberFoldedProps(away)
  }
  if (!faceTemplate) return <p>{t('template.faceMissing', { face })}</p>
  const overridden = group ? overriddenIds(faceTemplate, group) : new Set<string>()
  const fields = fieldsOf(doc)
  // How many cards a deletion here reaches, counted the way the line over the layer list already
  // counts them: the whole deck from the base, the rule's own cards from a group — which is also
  // exactly as far as `onRemove` goes.
  const drawnOn = column && group ? cardsInGroup(doc, group).length : doc.rows.length
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
    <div className="byd-canvas" {...(catalog ? { 'data-catalog': 'open' } : {})} {...(stage ? { 'data-stage': stage } : folded ? { 'data-folded': 'props' } : {})}>
      {/* The crown over the whole desk and not over the card alone (#129): which column makes the
          groups, which group is open, whether the properties are folded away, and which face is
          being edited. It spans the four columns because that is the only place its four controls
          fit on one line at 1024 — and one line is the point, since every row the crown takes is a
          row the card never gets back. Below the desk it belongs to the canvas stage, which is the
          only stage any of it is about. */}
      {shows('canvas') && (
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
          {column && <GroupMenu doc={doc} column={column} groups={groups} group={group} onSelect={onSelectGroup} />}
          {stage === null && <FoldProps folded={folded} onFold={fold} />}
          <FaceSwitch faces={Object.keys(doc.template.faces)} face={face} onSelect={onSelectFace} />
        </div>
      )}
      {shows('tools') && <ToolRail onAdd={add} onPlaceIcon={onPlaceIcon} />}
      {shows('layers') && (
      <aside className="byd-canvas-layers">
        {/* The column is a frame and not a scroller (#129): a crown that says which face is being
            listed and how many cards the panel is about, the list itself, and a foot with the line
            about dragging. All three used to scroll together — at 1024 the list ran 690 px past the
            bottom of the column and took its own heading with it, so the panel a designer was
            reading the end of had nothing left on it saying what she was reading. */}
        <div className="byd-canvas-crown">
          <h2 id="layers-heading">{t('canvas.layers', { face: faceName(face, t).toLowerCase() })}</h2>
          <p className="byd-canvas-affects">{affectsLabel(doc, column, group, t)}</p>
        </div>
        <div className="byd-canvas-scroll">
          {/* The ready-made backs (L17) stand in the open while the back is being edited, above the
              layers that make it up, rather than behind a button: whoever lands on an empty back
              should see the way on without hunting for it. Not inside a group — a group's back is
              an override of the base's (#14), and laying a whole face down there would quietly
              make every layer of it the group's own. */}
          {face === 'back' && !group && <BackGallery onReplaceFace={onReplaceFace} />}
          <LayerList
            layers={[...panel].reverse().map((l) => l.element)}
            selected={selectedElement}
            onSelect={onSelectElement}
            // The list reads top-most first; the base list is drawn back to front. One is the other
            // turned around, and that is the only place the two orders meet.
            // The order is the base's, shared by every group, so it is only moved from the base.
            {...(group ? {} : { onReorder: (id: string, to: number) => onReorder(id, faceTemplate.base.length - 1 - to) })}
            onLock={(id, locked) => {
              setRefused(null)
              onLock(id, locked)
            }}
            onRename={onRename}
            markOf={(id) => markOf(panel, column, group, id, t)}
            pictureName={(hash) => doc.pictures?.[hash]?.name ?? t('canvas.props.picture.unnamed')}
            removed={new Set(panel.filter((l) => l.source === 'removed').map((l) => l.element.id))}
            labelledBy="layers-heading"
          />
          <label className="byd-canvas-grid-toggle">
            <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
            {t('canvas.grid')}
          </label>
          {column && <GroupRules doc={doc} column={column} groups={groups} />}
        </div>
        {/* One line about dragging, and the keyboard behind the question mark (L32, #303). The
            whole sentence was six lines in this 220 px column — a third of the list's height,
            two layer rows that did not fit. In a group the order is the base's and there is
            nothing to move, so the line says that and offers no help about moving. */}
        <div className="byd-canvas-hint byd-help-row">
          <span>{t(group ? 'canvas.hint.group' : 'canvas.hint.base')}</span>
          {!group && (
            <Help topic={t('canvas.help.topic')}>
              <p>{t('canvas.help.order')}</p>
              <p>{t('canvas.help.rename')}</p>
              <p>{t('canvas.help.move')}</p>
            </Help>
          )}
        </div>
      </aside>
      )}
      {shows('canvas') && (
      <div className="byd-canvas-main">
        {/* The stage and the band beside it share a box of their own, so the band stands in the
            canvas' lower corner rather than inside the thing that scrolls: a control that pans
            away with the card is a control that is gone exactly when the card is big enough to
            need it. It stands beside the stage and never on it, which is what keeps it off the
            card at every zoom (#146, L19). */}
        <div className="byd-canvas-room">
        <main
          className="byd-canvas-stage"
          ref={stageEl}
          // A box that scrolls once the card is bigger than it (#146), and a box that scrolls is
          // a tab stop: panning that only a wheel can do leaves everything off screen to the
          // mouse alone, and accessibility is not relaxed in the editor (L12).
          tabIndex={0}
          onClick={() => onSelectElement(null)}
          {...(column ? { id: GROUP_PANEL, 'aria-labelledby': GROUP_BUTTON } : { 'aria-label': t('canvas.stage') })}
        >
          <CardPreview
            id="canvas"
            face={tabFace}
            row={rowData}
            icons={icons}
            fonts={fonts}
            scale={zoom.scale}
            assetBase={assetBase}
            motifs={motifs}
            selectedElement={selectedElement}
            onSelectElement={onSelectElement}
            overlay={<DragLayer grid={grid ? gridStep(zoom.scale) : null} boxes={shown.filter(isBox)} selected={selectedElement} onSelect={onSelectElement} onPatch={patch} onCallOff={onCallOff} onRefused={setRefused} point={pointAt} onPoint={setPointAt} />}
          />
          {refusedLayer && (
            <p className="byd-canvas-locked" role="alert">
              {t('canvas.layer.isLocked', { name: layerName(refusedLayer) })}
            </p>
          )}
        </main>
          <ZoomBand zoom={zoom} />
        </div>
        {/* Under the card and not on it. The stage deselects on a click anywhere in itself, so a
            question standing inside it would lose the layer the moment the answer that keeps it
            was pressed — which is the one answer that must cost nothing. It is otherwise the same
            strip the table asks its own two questions in, in the colours a deletion is asked in
            there, and in the column where the card it draws on is. */}
        {catalog && <FontCatalog words={cardWords(shown, rowData)} inGame={Object.keys(doc.fonts ?? {})} onChoose={onCatalogFont} onClose={() => setCatalog(false)} />}
        {goes && (
          <Question
            className="byd-canvas-question"
            label={removeLayerLabel(goes, face, drawnOn, t)}
            confirm={t('canvas.layer.remove.yes')}
            onConfirm={() => {
              onRemove(goes.id)
              // Said only once it has happened, and in the polite region: the layer is gone from
              // under a keyboard that may be nowhere near the panel it was listed in.
              say?.('polite', t('canvas.layer.removed', { name: layerName(goes), face: faceName(face, t).toLowerCase() }))
              handBack()
            }}
            onCancel={handBack}
          >
            {removeLayerLabel(goes, face, drawnOn, t)}
          </Question>
        )}
      </div>
      )}
      {shows('props') && !(stage === null && folded) && (
      <aside className="byd-canvas-props" id={PROPS_COLUMN}>
        <h2>{layer ? t('canvas.props.of', { id: layer.element.id }) : t('canvas.props')}</h2>
        {layer?.source === 'removed' && <p className="byd-canvas-affects">{t('canvas.removedIn', { rule: ruleLabel(column ?? '', group ?? '') })}</p>}
        {/* A panel with nothing in it says why rather than looking broken — and on a small screen
            the layers are another stage away, so it says where to go. */}
        {!layer && <p className="byd-canvas-hint">{t('canvas.props.empty')}</p>}
        {el && (
          <Properties
            el={el}
            face={face}
            fields={fields}
            imageFields={imageFieldsOf(doc)}
            pictures={pictures}
            assetBase={assetBase}
            onAddPicture={onAddPicture}
            taken={takenNames(doc)}
            fonts={Object.keys(doc.fonts ?? {})}
            icons={Object.keys(doc.icons)}
            valuesIn={(field) => valuesIn(doc, field)}
            onPatch={(changed, gesture) => patch(el.id, changed, gesture)}
            onAddField={onAddField}
            point={pointAt}
          />
        )}
        {layer && group && overridden.has(layer.element.id) && (
          <button type="button" className="byd-canvas-reset" onClick={() => onReset(layer.element.id)}>
            {t('canvas.reset')}
          </button>
        )}
        <FontShelf doc={doc} onFontFile={onFontFile} onFontLicence={onFontLicence} onRemoveFont={onRemoveFont} onOpenCatalog={() => setCatalog(true)} />
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
function FontShelf({ doc, onFontFile, onFontLicence, onRemoveFont, onOpenCatalog }: Pick<TemplateCanvasProps, 'doc' | 'onFontFile' | 'onFontLicence' | 'onRemoveFont'> & { onOpenCatalog(): void }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A file is over the control. The same word the table's picture cells use for the same moment
  // (#222), so the mark is one mark in one language wherever a file is let go in the tool.
  const [over, setOver] = useState(false)
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
              {/* Where the family came from (#329, L27). The badge is the lesser half of the
                  difference; the greater one is under it, in the licence. */}
              {font.source === 'catalog' && <span className="byd-fonts-badge">{t('fonts.catalog.badge')}</span>}
              {!used.includes(family) && (
                <button type="button" onClick={() => onRemoveFont(family)}>
                  {t('fonts.remove')}
                </button>
              )}
              <small>{t(font.asset ? 'fonts.travels' : 'fonts.staysBehind')}</small>
              <Licence family={family} licence={font.licence} settled={font.source === 'catalog'} onFontLicence={onFontLicence} />
            </li>
          ))}
        </ul>
      )}
      {/* The way into Google Fonts (#329, L27). It stands above the upload because it is the
          answer for nearly everyone: the whole catalog is free, and a catalog entry arrives
          knowing its licence, which is the one thing an uploaded file can never say.

          Second and not first, for all that: the primary fill belongs to the one action that
          puts the work on the table, and a view with two of them has none (#44). */}
      <button type="button" className="byd-fonts-catalog byd-secondary" onClick={onOpenCatalog}>
        {t('fonts.catalog.open')}
      </button>
      {/* The control is the receiver (#294, #291 variant B): a typeface is dropped on the button
          that takes one, not on a second box beside it and not on the whole canvas. Both halves
          of the drag are cancelled, because a file let go anywhere the page does not catch it is
          a browser leaving the editor to open the typeface as a page of its own. */}
      <label
        className="byd-fonts-upload byd-secondary"
        data-over={over ? 'true' : undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          // Closed while a file is already travelling, exactly as the picker is: two typefaces
          // out of one gesture is two families, and the second to land would say the first was
          // done.
          if (busy) return
          const dropped = [...(e.dataTransfer.files ?? [])]
          // Two files is a question this control cannot answer. Taking the first of them would
          // have thrown the rest away without a word, which is the one thing a drop must never
          // do: the family is named after the file, so the wrong first file is a wrong family.
          if (dropped.length > 1) {
            setError(t('fonts.upload.one'))
            return
          }
          take(dropped[0])
        }}
      >
        {t('fonts.upload')}
        <input className="byd-offscreen" type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" disabled={busy} onChange={(e) => take(e.target.files?.[0])} />
      </label>
      {/* While the bytes travel, said where the control is. `disabled` on an input that stands
          off the screen is a state only the keyboard can find, and a control that goes quiet is
          read as a control that did nothing. */}
      {busy && <p role="status">{t('fonts.upload.busy')}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

// What a typeface is borrowed under. Both halves are needed before anything is written: a
// licence with no holder credits no one, and a holder with no licence says nothing about what
// may be printed. Emptying either takes the credit away again.
//
// A family out of the catalog is `settled`: it arrived knowing both halves, so the boxes state
// the answer and are not open to being answered again (L27). Two boxes a designer is expected to
// be able to fill in about a typeface she did not make is the friction the catalog exists to
// take away, and leaving them editable here would put it back — the answer is the catalog's and
// changing it would only make the print order wrong.
function Licence({ family, licence, settled, onFontLicence }: { family: string; licence: ProjectCredit | undefined; settled?: boolean; onFontLicence: TemplateCanvasProps['onFontLicence'] }) {
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
  if (settled)
    return (
      <span className="byd-fonts-licence" data-settled="true">
        <input aria-label={t('fonts.licence.of', { family })} value={licence?.licence ?? ''} readOnly />
        <input aria-label={t('fonts.by.of', { family })} value={licence?.by ?? ''} readOnly />
      </span>
    )
  return (
    <span className="byd-fonts-licence">
      <input aria-label={t('fonts.licence.of', { family })} placeholder={t('fonts.licence')} value={what} onChange={(e) => setWhat(e.target.value)} onBlur={() => write(what, by)} />
      <input aria-label={t('fonts.by.of', { family })} placeholder={t('fonts.by')} value={by} onChange={(e) => setBy(e.target.value)} onBlur={() => write(what, by)} />
    </span>
  )
}

// How big the card is drawn, and who decided it (#146).
//
// Two answers, not two numbers: either the stage is fitting the card into itself — which is
// exactly what the canvas did before there was anything else, measured from the stage and the
// card as they are drawn and measured again whenever the window changes — or a designer has said
// a zoom, and then the window is none of its business. Where nothing can be measured (a headless
// test, a first paint) the card keeps the zoom the stage starts at.
//
// The zoom is never remembered. Every opening of the canvas starts on the fit, which is a
// deliberate departure from L4's pattern that a view remembers itself in the browser: nobody
// should be met by a crop they do not remember choosing (L19).
type Zoom = { scale: number; fitting: boolean; to(scale: number): void; by(delta: number): void; fit(): void }
function useZoom(stage: RefObject<HTMLElement | null>): Zoom {
  const [scale, setScale] = useState(STAGE_SCALE)
  const [fitting, setFitting] = useState(true)
  // What the card is drawn at right now, for the two readers that run outside a render: the fit,
  // which is a factor on the zoom the card already has, and the wheel, which steps from it.
  const drawn = useRef(scale)
  drawn.current = scale
  const measure = useCallback(() => {
    const el = stage.current
    const card = el?.querySelector('[data-card]')?.getBoundingClientRect()
    const room = el?.getBoundingClientRect()
    return card && room ? fitScale(drawn.current, { w: card.width, h: card.height }, { w: room.width, h: room.height }) : drawn.current
  }, [stage])
  useLayoutEffect(() => {
    if (!fitting || !stage.current) return
    const fit = () => setScale(measure())
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const watching = new ResizeObserver(fit)
    watching.observe(stage.current)
    return () => watching.disconnect()
  }, [stage, fitting, measure])
  const to = useCallback((next: number) => {
    setFitting(false)
    setScale(zoomTo(next))
  }, [])
  // `Ctrl` with the wheel over the canvas, which is the gesture every drawing tool answers. It is
  // hung on the element and not on React's `onWheel`, because React listens for a wheel passively
  // at the root and a passive listener cannot keep the browser from zooming the whole page.
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      to(drawn.current - Math.sign(event.deltaY) * ZOOM_NOTCH)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [stage, to])
  return { scale, fitting, to, by: (delta) => to(drawn.current + delta), fit: () => setFitting(true) }
}

// The zoom's own band, in the canvas' lower corner (#146, L19). Beside the stage and not in the
// crown: a control in the crown is the one furthest from the work it is about, and every row the
// crown takes is a row the card never gets back.
//
// Beside the stage rather than floating on it, because the decision put the control in the width
// the fitting already leaves over — 323 px of chequerboard at 1440 — and a control that occupies
// what nothing else wants costs the card nothing. Floating, it did not do that: the fitting
// centres the card, so only half the spare width lies on the right, and the band covered the card
// at every desk. Standing in a column of the canvas room it covers nothing at any zoom, and where
// the fitting leaves no width at all — 1024 with the properties open — the stylesheet lays it
// down in a row under the stage instead. Which of the two is a question about boxes, so it is
// asked and answered in the stylesheet; `canvas-band.test.tsx` measures both.
function ZoomBand({ zoom }: { zoom: Zoom }) {
  const t = useT()
  const per = zoomPercent(zoom.scale)
  const said = t('canvas.zoom.percent', { n: per })
  return (
    <div className="byd-canvas-zoom" role="group" aria-label={t('canvas.zoom')}>
      {/* The percentage leads, and leads quietly: it is a fact and not a control, and standing
          last it was a third box the same size and shape as the two buttons beside it — a reader
          had no way to tell which of `100 %` and `228 %` could be pressed. */}
      <output aria-label={t('canvas.zoom')}>{said}</output>
      <button type="button" data-step aria-label={t('canvas.zoom.out')} onClick={() => zoom.by(-ZOOM_STEP)}>
        −
      </button>
      <input
        type="range"
        min={zoomPercent(ZOOM_MIN)}
        max={zoomPercent(ZOOM_MAX)}
        step={1}
        value={per}
        aria-label={t('canvas.zoom.level')}
        // The number alone is a number; what a reader needs is the measure it is in.
        aria-valuetext={said}
        onChange={(event) => zoom.to(Number(event.target.value) / 100)}
      />
      <button type="button" data-step aria-label={t('canvas.zoom.in')} onClick={() => zoom.by(ZOOM_STEP)}>
        +
      </button>
      {/* Two choices and not two doings: which of them the card stands on is said, so the fit is
          something to see rather than something to infer from a percentage. */}
      <button type="button" aria-pressed={zoom.fitting} onClick={zoom.fit}>
        {t('canvas.zoom.fit')}
      </button>
      <button type="button" aria-pressed={!zoom.fitting && per === 100} onClick={() => zoom.to(1)}>
        {t('canvas.zoom.actual')}
      </button>
    </div>
  )
}

// An element that has a box of its own, and can therefore be dragged. A condition around other
// elements has none.
type BoxElement = Element & Box
function isBox(el: Element): el is BoxElement {
  return 'w' in el && 'h' in el
}

// What kind of element it is, in the word a reader hears rather than the word the model holds
// (#144, A4). The layer list draws the same fact as a glyph; a name read aloud has to say it.
const KIND_WORDS: Record<Element['kind'], Key> = {
  text: 'canvas.kind.text',
  image: 'canvas.kind.image',
  icons: 'canvas.kind.icons',
  shape: 'canvas.kind.shape',
  group: 'canvas.kind.group',
  if: 'canvas.kind.if',
}

// The two arms a point can carry (L38), in the order the outline reads them: the one the side
// arriving at the point ends on, then the one the side leaving it starts from.
const ARMS: readonly Arm[] = ['in', 'out']

// The layer that takes the pointer (#18, variant A): one transparent box over each element, in
// the card's own millimetres. It draws no card content — the compiler behind it is still the one
// renderer — and it holds the pointer with pointer capture, so a fast drag or a trackpad that
// leaves the box keeps moving the element it grabbed.
function DragLayer({ boxes, grid, selected, onSelect, onPatch, onCallOff, onRefused, point, onPoint }: { boxes: BoxElement[]; grid: number | null; selected: string | null; onSelect(id: string): void; onPatch: TemplateCanvasProps['onPatch']; onCallOff: TemplateCanvasProps['onCallOff']; onRefused(id: string): void; point: number | null; onPoint(at: number | null): void }) {
  const t = useT()
  const say = useSay()
  const layer = useRef<HTMLDivElement | null>(null)
  const grab = useRef<(Grab & { id: string; handle: Handle | null; gesture: string; moved: boolean }) | null>(null)
  // What makes one grab tell itself apart from the next one on the same element (L14). Two drags
  // of the same title are two things the designer did, and two steps back.
  const grabs = useGesture('grab')
  const [guides, setGuides] = useState<Guides>({ x: null, y: null })
  // Whether a grab is running at all, which is the one thing about it that has to be drawn: the
  // way out of the drag is a door in the tree, and a door can only stand there while there is a
  // drag to leave. Everything else about the grab stays in the ref above, where it is read inside
  // an event and never drawn.
  const [holding, setHolding] = useState(false)
  // The element the keyboard has taken hold of, and the token every nudge of that holding carries
  // (#144). A mode to go into was chosen over the arrows always moving: an arrow over the card
  // then means walking about until the designer says otherwise, and no stray press ever moves the
  // card's contents. The token is what makes the whole holding one step back (L14) and what
  // Escape gives back through (#142) — the keyboard's holding is a grab like the pointer's.
  const [moving, setMoving] = useState<{ id: string; gesture: string; from: { x: number; y: number } } | null>(null)

  // A shape of the designer's own (L26): which element wears points, and which point the
  // keyboard is to be put on after one has been taken away.
  const own = boxes.find((b) => b.id === selected && b.kind === 'shape' && b.points !== undefined && !b.locked) as (BoxElement & Shape) | undefined
  // The point whose handles are out. A point that has since been taken away leaves none behind.
  const chosen = point !== null && point < (own?.points ?? []).length ? point : null
  const ownPointsOf = (box: BoxElement): Point[] => ('points' in box && box.points ? box.points : [])
  const shaping = useRef<{ id: string; box: BoxElement; from: Point[]; at: Point; mmPerPx: number; gesture: string; point: number | null; edge: number | null; arm: Arm | null; base: Point; wait: boolean } | null>(null)
  const shapes = useGesture('point')
  // The browser fires a click of its own once a drag has begun and ended on the same button, and
  // a mid-dot is a button. Its click is the way in for the hand that has no pointer (L24) and has
  // to stay — so the drag says it already shaped the outline, and the click that comes after it
  // steps aside rather than adding the point a second time.
  const shaped = useRef(false)
  const [landing, setLanding] = useState<number | null>(null)
  useEffect(() => {
    if (landing === null) return
    setLanding(null)
    const mark = layer.current?.querySelector(`[data-point="${landing}"]`)
    if (mark instanceof HTMLElement) mark.focus()
  }, [landing])

  // Where the pointer is, in the element box's own millimetres, which is the list's own frame.
  const mmIn = (event: ReactPointerEvent<HTMLElement> | { clientX: number; clientY: number }, box: BoxElement, rect: DOMRect): Point => {
    const mmPerPx = CARD_STANDARD_63x88.physical.widthMm / rect.width
    return { x: (event.clientX - rect.left) * mmPerPx - box.x, y: (event.clientY - rect.top) * mmPerPx - box.y }
  }

  // A grab that is about the outline and not about the element: a point taken hold of, a mid-dot
  // pulled out, or the edge itself pressed. `base` is what the pointer is carrying, so the thing
  // under the hand follows it rather than jumping to it.
  const takeHold = (event: ReactPointerEvent<HTMLElement>, box: BoxElement, what: { point: number | null; edge: number | null; arm?: Arm; base: Point }) => {
    const rect = layer.current?.getBoundingClientRect()
    if (!rect?.width) return
    event.stopPropagation()
    onSelect(box.id)
    if (what.point !== null && what.arm === undefined) onPoint(what.point)
    shaped.current = false
    // A bend is held back until the pointer has left four device pixels behind it (L38): the
    // mid-dot is a click and a drag at once, and nothing about which of the two it is may be
    // decided before then. A point and a handle are taken hold of and not clicked, so they move
    // as soon as the pointer does.
    shaping.current = { id: box.id, box, from: ownPointsOf(box), at: { x: event.clientX, y: event.clientY }, mmPerPx: CARD_STANDARD_63x88.physical.widthMm / rect.width, gesture: shapes.begin(), arm: what.arm ?? null, wait: what.point === null, ...what }
    setHolding(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const shapeMove = (event: ReactPointerEvent<HTMLElement>) => {
    const held = shaping.current
    if (!held) return
    // Four device pixels before a press on a mid-dot is a drag (L38). A hand resting on a
    // trackpad always moves some pixel, so a shakier threshold would take «lägg till en punkt»
    // away from the shaky hand; released before it, the press was the click it looked like.
    if (held.wait && !bendStarted(held.at, { x: event.clientX, y: event.clientY })) return
    held.wait = false
    const to = { x: round(held.base.x + (event.clientX - held.at.x) * held.mmPerPx), y: round(held.base.y + (event.clientY - held.at.y) * held.mmPerPx) }
    // A click is a grab that went nowhere: it selects, and leaves the outline alone. On a mid-dot
    // that matters most of all — a press and a release used to add a point on top of the edge it
    // already lay on.
    if (to.x === held.base.x && to.y === held.base.y) return
    const box = { w: held.box.w, h: held.box.h }
    // What is taken hold of is what changes (L38): a handle bends its own point's curve and
    // carries the opposite arm with it unless Alt breaks the mirroring, a point moves, and the
    // side itself — grabbed on the edge or at the mid-dot — bends so that its middle follows.
    const points =
      held.arm !== null && held.point !== null
        ? movedHandle(held.from, held.point, held.arm, to, box, !event.altKey)
        : held.point !== null
          ? movedPoint(held.from, held.point, to, box)
          : bentEdge(held.from, held.edge ?? 0, to, box)
    shaped.current = true
    // The curve that has just come into being shows its handles, which is what makes the gesture
    // teach the next one: they hang on the point the side left.
    if (held.point === null) onPoint(held.edge ?? 0)
    onPatch(held.id, { points } as Partial<Element>, held.gesture)
  }

  // The keyboard on one handle (L38): L26's own two steps, and the mirroring holds here exactly
  // as it does under the hand — Alt breaks it for this arm alone.
  const handleKeys = (event: ReactKeyboardEvent<HTMLElement>, box: BoxElement, index: number, arm: Arm) => {
    const points = ownPointsOf(box)
    const at = handleAt(points, index, arm)
    if (!at) return
    const nudged = arrowMove(at, event.key, event.shiftKey)
    if (!nudged) return
    event.preventDefault()
    onPatch(box.id, { points: movedHandle(points, index, arm, { ...at, ...nudged }, box, !event.altKey) } as Partial<Element>, shapes.begin())
  }

  // The keyboard on one point (L26): half a millimetre to the arrow and five with shift, the two
  // steps every other nudge on the canvas has, and Delete to give the point up. Each press is a
  // doing of its own and a step of its own back.
  const pointKeys = (event: ReactKeyboardEvent<HTMLElement>, box: BoxElement, index: number) => {
    const points = ownPointsOf(box)
    const at = points[index]
    if (!at) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      const left = prunedPoint(points, index)
      // Two points are a line and not a shape (L26). The floor is said out loud rather than
      // swallowed: a key that silently does nothing reads as a control that is broken.
      if (!left) return say?.('assertive', t('canvas.point.least'))
      onPatch(box.id, { points: left } as Partial<Element>, shapes.begin())
      return setLanding(afterPruning(points, index))
    }
    const nudged = arrowMove(at, event.key, event.shiftKey)
    if (!nudged) return
    event.preventDefault()
    onPatch(box.id, { points: movedPoint(points, index, { ...at, ...nudged }, box) } as Partial<Element>, shapes.begin())
  }

  const down = (event: ReactPointerEvent<HTMLElement>, box: BoxElement, handle: Handle | null) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelect(box.id)
    // A locked layer is still a layer you can point at — pointing selects it, so its properties
    // can be read and its lock found — but the pointer never takes hold of it (L15).
    if (box.locked) return onRefused(box.id)
    const rect = layer.current?.getBoundingClientRect()
    if (!rect?.width) return
    // «Ytan flyttar, punkten formar» (L26). The fill drags the element like any other, but the
    // edge of a shape of the designer's own is a hit area wider than it looks — 2,4 mm, because
    // ±1,5 mm was measured in the prototype and a click aimed at the middle of the edge missed
    // it — and a press there grows a point where the pointer is.
    if (handle === null && own?.id === box.id) {
      const points = ownPointsOf(box)
      const edge = edgeAt(points, mmIn(event, box, rect))
      // The middle of the side is what a bend moves (L38), so that is what the pointer carries:
      // a pull near one end bends the side by how far it was pulled rather than by where along
      // it the hand happened to land.
      if (edge) return takeHold(event, box, { point: null, edge: edge.edge, base: midpoints(points)[edge.edge] ?? edge.at })
    }
    grab.current = { id: box.id, box, handle, gesture: grabs.begin(), moved: false, at: { x: event.clientX, y: event.clientY }, mmPerPx: CARD_STANDARD_63x88.physical.widthMm / rect.width }
    setHolding(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    // The outline comes first: a grab that is about a point is never also about the element.
    if (shaping.current) return shapeMove(event)
    const held = grab.current
    if (!held) return
    const to = { x: event.clientX, y: event.clientY }
    if (held.handle) {
      held.moved = true
      return onPatch(held.id, resizedTo(held, to, held.handle), held.gesture)
    }
    const others = boxes.filter((b) => b.id !== held.id)
    const placed = snapped(held.box, movedTo(held, to), others, CARD_STANDARD_63x88.physical)
    setGuides(placed.guides)
    // A click is a grab that went nowhere: it selects, and leaves the template alone.
    if (placed.at.x === held.box.x && placed.at.y === held.box.y) return
    held.moved = true
    onPatch(held.id, placed.at, held.gesture)
  }
  const up = () => {
    grab.current = null
    shaping.current = null
    setHolding(false)
    setGuides({ x: null, y: null })
  }
  // The drag taken back rather than let go of (#142): Escape with the hand still down, and a
  // gesture the browser took away from the page, which are the same thing happening. A grab that
  // moved nothing has nothing to take back and says nothing either — that is the click the move
  // above already leaves the template alone for.
  const callOff = () => {
    const held = grab.current
    const shaped = shaping.current
    up()
    if (shaped) {
      onCallOff(shaped.gesture)
      return say?.('polite', t('editor.drag.cancelled'))
    }
    if (!held?.moved) return
    onCallOff(held.gesture)
    say?.('polite', t('editor.drag.cancelled'))
  }

  // The move taken back rather than ended (#142, #144), which is the pointer's own way out heard
  // from a hand that has no pointer: the element goes back where the holding began, and the
  // holding leaves no step behind. A mode entered and left again without a nudge in it moved
  // nothing, so there is nothing to take back and nothing to say.
  const callOffMove = () => {
    const held = moving
    setMoving(null)
    const box = held && boxes.find((b) => b.id === held.id)
    if (!held || !box || (box.x === held.from.x && box.y === held.from.y)) return
    onCallOff(held.gesture)
    say?.('polite', t('canvas.element.back', { name: layerName(box), x: held.from.x, y: held.from.y }))
  }

  // The keyboard on an element of the card (#144). Enter and Space are both the way in and the
  // way out of the move mode; the arrows belong to the mode and to nothing else.
  //
  // Both, because the box wears the button role and a button is answered with either key — and
  // because a box is a `div`, where the browser does nothing of its own with Enter and scrolls the
  // page with Space. A Space the mode did not take is the card sliding out from under the hand
  // that pressed it, which is worse than a key that does nothing, so every way out of this branch
  // is behind the same `preventDefault` — the refusal a locked layer gets included (L15).
  //
  // A Space that arrives in the middle of a nudging session therefore lets go, exactly as Enter
  // does: one meaning per key, and letting go keeps what was moved. Taking the move back is
  // Escape's, and stays Escape's alone (#142).
  const keys = (event: ReactKeyboardEvent<HTMLElement>, box: BoxElement) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (moving?.id === box.id) return setMoving(null)
      // A locked layer is one the keyboard can stand on and read, and never one it takes hold of
      // (L15) — the same answer the pointer already gets, said in the same place.
      if (box.locked) return onRefused(box.id)
      return setMoving({ id: box.id, gesture: grabs.begin(), from: { x: box.x, y: box.y } })
    }
    // The two steps the pointer already has, in the hand that has no pointer: half a millimetre,
    // and five with shift. Every nudge of one holding carries its token, so the whole of it is
    // one step back and Escape can give the element back to where the holding began.
    if (moving?.id !== box.id) return
    const nudged = arrowMove(box, event.key, event.shiftKey)
    if (!nudged) return
    event.preventDefault()
    onPatch(box.id, nudged, moving.gesture)
    // Where it now lies, said out loud. Half a millimetre is exactly the distance a screen cannot
    // show, so a nudge that is only drawn is a nudge nobody can check.
    say?.('polite', t('canvas.element.at', { name: layerName(box), x: box.x, y: box.y, ...nudged }))
  }

  return (
    <div className="byd-drag-layer" data-drag-layer ref={layer}>
      {/* The way out of the drag, for the hand that changed its mind before it let go (#142). The
          same door the table's head hangs over its own pull, and it stands only while there is a
          drag to leave. */}
      {holding && <DragDoor onCancel={callOff} />}
      {/* And the same door for the move the keyboard is holding (#144). It is `held` like the
          pointer's, because it is the same thing: something under the hand at this moment, and a
          press that arrives while it is down is about that and not about a panel over the work. */}
      {moving && <DragDoor onCancel={callOffMove} />}
      {/* The measure over the card, drawn in the card's own millimetre and as densely as the zoom
          leaves room for (#146, L19): the step is the drawing, so nothing about the grid is said
          twice. */}
      {grid !== null && <div className="byd-drag-grid" data-grid aria-hidden="true" style={{ '--byd-grid-step': `${grid}mm` } as CSSProperties} />}
      {/* Read backwards, and stacked forwards. The keyboard meets the elements in the order the
          layer list reads them — top-most first, which is the order the designer already has in
          front of her (#144) — while the pointer must still find the top-most box on top of the
          pile, which is the order the card is drawn in. The two orders are each other turned
          around, so the tree carries one and `z-index` carries the other. */}
      {[...boxes].reverse().map((box, fromTop) => (
        <div
          key={box.id}
          className="byd-drag-box"
          data-drag={box.id}
          // The element is a control of its own (#144): a toggle, because pressing it is what
          // opens and closes the move mode, and a name that says what it is and where it lies.
          role="button"
          tabIndex={0}
          aria-label={t(moving?.id === box.id ? 'canvas.element.moving' : 'canvas.element', { name: layerName(box), kind: t(KIND_WORDS[box.kind]), x: box.x, y: box.y })}
          aria-pressed={moving?.id === box.id}
          {...(moving?.id === box.id ? { 'data-moving': '' } : {})}
          onKeyDown={(event) => keys(event, box)}
          style={{ left: `${box.x}mm`, top: `${box.y}mm`, width: `${box.w}mm`, height: `${box.h}mm`, zIndex: boxes.length - 1 - fromTop }}
          // The selection follows the focus here for the same reason it does in the layer list
          // (L15): arriving on an element is the whole of choosing it, and the properties beside
          // the card — where a size is typed in millimetres — must be about what the keyboard
          // stands on.
          onFocus={() => onSelect(box.id)}
          // The keyboard leaving the element is letting go of it, the way lifting a finger ends a
          // drag: what was moved stays moved, and nothing goes on wearing a frame that promises
          // the next arrow will move it.
          onBlur={() => {
            if (moving?.id === box.id) setMoving(null)
          }}
          onPointerDown={(event) => down(event, box, null)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={callOff}
          onClick={(event) => event.stopPropagation()}
        >
          {box.id === selected &&
            !box.locked &&
            HANDLES.map((corner) => (
              <i
                key={corner}
                className="byd-drag-handle"
                data-handle={corner}
                // Hidden from the reader rather than named (#144, as decided): four handles on
                // each of five elements would be twenty more tab stops for a size the property
                // panel's millimetre fields already take exactly.
                aria-hidden="true"
                onPointerDown={(event) => down(event, box, corner)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={callOff}
              />
            ))}
        </div>
      ))}
      {/* The marks on a shape of the designer's own (L26), drawn after every box and above them
          all: the point lies above the edge and above the fill in the hit order, which is what
          keeps a press near a point from being an accidental new one. They are siblings of the
          boxes rather than children of one, because a box already wears the button role and a
          control inside a control is a control a screen reader never reaches (UX-37).

          The mid-dots come first and the points after, so where the two meet the point is on
          top — in the tree and in the tab order both, since the outline is walked point by
          point and the dot between two points comes after the first of them. */}
      {own &&
        midpoints(own.points ?? []).map((mid, edge) => (
          <button
            key={`mid-${edge}`}
            type="button"
            className="byd-point byd-point-mid"
            data-mid={edge}
            // Half the strength of a point (L26): hollow and toned down, so fourteen marks on a
            // banner of 45 × 20 mm read as seven points and seven places a point could go.
            data-weak=""
            aria-label={t('canvas.point.mid', { n: edge + 1 })}
            style={{ left: `${own.x + mid.x}mm`, top: `${own.y + mid.y}mm` }}
            onPointerDown={(event) => event.button === 0 && takeHold(event, own, { point: null, edge, base: mid })}
            onPointerMove={shapeMove}
            onPointerUp={up}
            onPointerCancel={callOff}
            // The way in for the hand that has no pointer. A way in that only exists under a
            // pointer is no way in at all (L24), and adding a point is the whole of this door.
            onClick={() => {
              if (shaped.current) {
                shaped.current = false
                return
              }
              onPatch(own.id, { points: grownPoint(own.points ?? [], edge, mid, own) } as Partial<Element>, shapes.begin())
            }}
          />
        ))}
      {own &&
        (own.points ?? []).map((point, index) => (
          <button
            key={`point-${index}`}
            type="button"
            className="byd-point"
            data-point={index}
            aria-label={t('canvas.point', { n: index + 1, of: (own.points ?? []).length })}
            style={{ left: `${own.x + point.x}mm`, top: `${own.y + point.y}mm` }}
            onPointerDown={(event) => event.button === 0 && takeHold(event, own, { point: index, edge: null, base: point })}
            onPointerMove={shapeMove}
            onPointerUp={up}
            onPointerCancel={callOff}
            // Walking onto a point is choosing it, so the handles it carries come out under the
            // keyboard exactly as they do under the hand (L38).
            onFocus={() => onPoint(index)}
            onKeyDown={(event) => pointKeys(event, own, index)}
          />
        ))}
      {/* The handles of the one point that is chosen (L38), drawn above the points themselves.
          Three kinds of mark now stand on the same outline and the shape has to carry the
          difference: a point is a square, a mid-dot a hollow circle, and a handle a filled
          circle on a dashed arm — in the felt's own amber, where the point is the canvas's blue.
          They hang on one point at a time, so the price is two marks and not two per point. */}
      {own &&
        chosen !== null &&
        ARMS.map((arm) => {
          const from = (own.points ?? [])[chosen]
          const at = handleAt(own.points ?? [], chosen, arm)
          if (!from || !at) return null
          return (
            <Fragment key={`arm-${arm}`}>
              <i
                className="byd-point-arm"
                aria-hidden="true"
                style={{ left: `${own.x + from.x}mm`, top: `${own.y + from.y}mm`, width: `${Math.hypot(at.x - from.x, at.y - from.y)}mm`, transform: `rotate(${Math.atan2(at.y - from.y, at.x - from.x)}rad)` }}
              />
              <button
                type="button"
                className="byd-point byd-point-handle"
                data-arm={arm}
                aria-label={arm === 'in' ? t('canvas.point.handle.in', { n: chosen + 1 }) : t('canvas.point.handle.out', { n: chosen + 1 })}
                style={{ left: `${own.x + at.x}mm`, top: `${own.y + at.y}mm` }}
                onPointerDown={(event) => event.button === 0 && takeHold(event, own, { point: chosen, edge: null, arm, base: at })}
                onPointerMove={shapeMove}
                onPointerUp={up}
                onPointerCancel={callOff}
                onKeyDown={(event) => handleKeys(event, own, chosen, arm)}
              />
            </Fragment>
          )
        })}
      {guides.x !== null && <div className="byd-drag-guide" data-guide="x" aria-hidden="true" style={{ left: `${guides.x}mm` }} />}
      {guides.y !== null && <div className="byd-drag-guide" data-guide="y" aria-hidden="true" style={{ top: `${guides.y}mm` }} />}
    </div>
  )
}

// The groups on the canvas (#13, #129): the base every card inherits, then one entry per value the
// grouping column carries. An entry is a rule, never a bag of cards — which is why it says
// `typ = fälla` and not "fällorna" — and it carries the count of cards that rule is about.
//
// A menu in the crown rather than a row of tabs (variant C, as decided). The row was a silent side
// scroller: on a deck with eleven groups, 823 px of it were out of sight at 1024 with no arrow, no
// fade and no keyboard way to the rest, and eight of the twelve entries lay past the crown's own
// right edge — the last one visible cut through the middle of its own word. Wrapping the row
// (variant A) showed all of them and charged the card 265 px of height for eleven buttons that are
// pressed once an hour, and the charge grew with the deck — a designer with twenty groups paid the
// most. The button is one row whatever the deck is, and it is the only shape that says which group
// is open *and* how many cards that is without opening anything.
const GROUP_PANEL = 'byd-canvas-group-panel'
const GROUP_BUTTON = 'byd-canvas-group-button'
const GROUP_MENU = 'byd-canvas-group-menu'
const groupItemId = (group: string | null) => `byd-group-item-${group ?? 'bas'}`

function GroupMenu({ doc, column, groups, group, onSelect }: { doc: ProjectDoc; column: string; groups: string[]; group: string | null; onSelect(group: string | null): void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement | null>(null)
  // The base is one of the choices and is not one of the groups, so it travels as the empty string
  // — the same stand-in the tabs used, and the same one `onSelect` turns back into nothing.
  const ids = ['', ...groups]
  const { itemProps, focus } = useRoving({ ids, selected: group ?? '', orientation: 'vertical' })
  // The keys land on the group that is open the moment the menu is, so the first arrow moves from
  // where the designer already is rather than from the top of a list of eleven. On opening and not
  // on every render: the menu must not take the focus back from what the designer does inside it.
  useEffect(() => {
    if (open) focus(group ?? '')
  }, [open])
  // The way out, and back to the button the menu was opened from: closing unmounts whatever had
  // the focus, so without this a keyboard that opened the menu is dropped on `<body>`.
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  const pick = (g: string) => {
    setOpen(false)
    button.current?.focus()
    onSelect(g === '' ? null : g)
  }
  const label = (g: string) => (g === '' ? t('canvas.group.base') : ruleLabel(column, g))
  const cards = (g: string) => (g === '' ? doc.rows.length : cardsInGroup(doc, g).length)
  // What the button says: the open group and how many cards it is about, which is the whole of
  // what the row of tabs used to say and could not fit.
  const says = `${label(group ?? '')} · ${cardsLabel(cards(group ?? ''), t)}`
  return (
    <div
      className="byd-canvas-group"
      // The focus gone out of the crown takes the menu with it: a list of groups hanging over the
      // card nobody is on is a list about nothing.
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        id={GROUP_BUTTON}
        ref={button}
        className="byd-canvas-group-open"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        {...(open ? { 'aria-controls': GROUP_MENU } : {})}
        // The name says what the button is for as well as what it stands on: "Kortgrupper" and
        // then the open group, so a reader who arrives on it hears the question and the answer.
        aria-label={t('canvas.group.menu', { group: says })}
        onClick={() => setOpen((was) => !was)}
      >
        {says}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          id={GROUP_MENU}
          className="byd-canvas-groups"
          role="menu"
          aria-label={t('canvas.groups')}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            event.preventDefault()
            close()
          }}
        >
          {ids.map((g) => (
            <button key={g} id={groupItemId(g === '' ? null : g)} className="byd-choice" role="menuitemradio" type="button" aria-checked={(group ?? '') === g ? 'true' : 'false'} onClick={() => pick(g)} {...itemProps(g)}>
              {label(g)}
              <small>{cardsLabel(cards(g), t)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// The properties folded away, and back (#129, variant A). At 1024 the column held its 280 px
// whether or not anything was selected, and the card was left 456 px of a 1024 px desk; folded it
// is 736. A disclosure and not a toggle: what the button governs is a column that is there or is
// not, and it says which of the two the press will make it.
const PROPS_COLUMN = 'byd-canvas-props-column'

function FoldProps({ folded, onFold }: { folded: boolean; onFold(away: boolean): void }) {
  const t = useT()
  return (
    <button className="byd-canvas-fold" type="button" aria-expanded={!folded} aria-controls={PROPS_COLUMN} onClick={() => onFold(!folded)}>
      {t(folded ? 'canvas.props.show' : 'canvas.props.fold')}
    </button>
  )
}

// Variant B's rule list, kept as the summary beside the canvas: every group as its rule, how many
// cards it is about, and what it changes against the base on each face. Reading, not editing —
// the editing is the crown's menu and the card.
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

// What a template element takes with it, in the three things that make it the largest of the
// editor's three deletions: what the designer named it, which side of the card it is drawn on,
// and how many cards inherit it. A column says the same kind of sentence before it goes (#32) —
// what is lost, counted in the deck rather than in the template — and this is that sentence for
// an element. It is the question's own name as well as its words, so hearing it and reading it
// are the same sentence twice.
function removeLayerLabel(el: Element, face: string, cards: number, t: T): string {
  return t(cards === 1 ? 'canvas.layer.remove.one' : 'canvas.layer.remove.other', { name: layerName(el), face: faceName(face, t).toLowerCase(), n: cards })
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

// The same switch stands beside the crop in Media (#295, variant A), where the sides are said in
// their short names — «Fram» and «Bak» — because there they stand directly over one large card
// and the word beside the card is the whole label. One control for "which side", not two.
export function FaceSwitch({ faces, face, names = FACE_NAMES, onSelect }: { faces: string[]; face: string; names?: Record<string, Key>; onSelect(face: string): void }) {
  const t = useT()
  const { itemProps } = useRoving({ ids: faces, selected: face, orientation: 'horizontal', followFocus: true, onActivate: onSelect })
  return (
    <div className="byd-canvas-faces" role="radiogroup" aria-label={t('canvas.faceSwitch')}>
      {faces.map((f) => {
        const key = names[f]
        return (
          <button key={f} type="button" className="byd-choice" role="radio" aria-checked={f === face ? 'true' : 'false'} onClick={() => onSelect(f)} {...itemProps(f)}>
            {key ? t(key) : f}
          </button>
        )
      })}
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

// Taking the selected element away with a key (#143), wherever the focus is — the layer list, the
// card, the panel around them. Two things are left alone: a key a control has already answered
// (the layer list's own arrows say so by preventing the default), and any key typed into a field.
//
// Backspace is heard here as well as Delete, and that is why the asking is the whole of what it
// does (#143). Listening wherever the focus is was the right decision and is kept; what was wrong
// was that the key nobody presses on purpose — back in every browser, one character in every
// field — reached all the way to the removal with nothing in between.
//
// The arrows used to be answered here too, from wherever the keyboard happened to stand (#18).
// They are not any more (#144): a move is made from the element itself, inside a mode the designer
// goes into on purpose, so that an arrow pressed somewhere unrelated never moves the card's
// contents and the same key never means two things.
function useElementKeys(el: Element | undefined, onAsk: (id: string) => void, onRefused: (id: string) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!el || event.defaultPrevented || isTyping(event.target)) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      event.preventDefault()
      // A locked layer does not go either (L15), and says so beside the card that did not change.
      if (el.locked) return onRefused(el.id)
      onAsk(el.id)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })
}


// The fill of a shape (L16): one colour, or a rule that reads one off the deck. The switch is
// the whole of the choice — a colour the designer has already picked becomes the rule's fallback,
// so turning it on changes no card until a value is given a colour of its own, and turning it off
// leaves the shape wearing that fallback. A deck with nothing in it is offered no rule: a rule on
// a column of no values is a form with nothing to fill in.
function Fill({ fill, fields, valuesIn, onPatch }: { fill: Paint | undefined; fields: string[]; valuesIn(field: string): string[]; onPatch(patch: Partial<Element>, gesture?: string): void }) {
  const t = useT()
  // A colour picker writes all the way through a drag of it (L14).
  const picking = useGesture('fill')
  const rule = typeof fill === 'object' ? fill : null
  const plain = typeof fill === 'string' ? fill : (rule?.else ?? '#000000')
  const values = rule ? valuesIn(rule.field) : []
  // Every value the rule paints, including one whose cards have all gone: a colour with nothing
  // left to show it on is still a colour the designer must be able to find and take away (L3).
  const painted = rule ? [...new Set([...values, ...Object.keys(rule.map)])] : []
  const write = (map: Record<string, string>, gesture?: string) => rule && onPatch({ fill: { ...rule, map } }, gesture)
  return (
    <>
      {fields.length > 0 && (
        <label className="byd-props-switch">
          <input
            type="checkbox"
            checked={rule !== null}
            onChange={(e) => onPatch({ fill: e.target.checked ? { field: fields[0] ?? '', map: {}, else: plain } : plain })}
          />
          {t('canvas.props.fill.byField')}
        </label>
      )}
      {!rule && (
        <label>
          {t('canvas.props.fill')}
          <input type="color" value={plain} {...picking.visit} onChange={(e) => onPatch({ fill: e.target.value }, picking.token())} />
        </label>
      )}
      {rule && (
        <div className="byd-props-paint">
          <label>
            {t('canvas.props.fill.field')}
            <select value={rule.field} onChange={(e) => onPatch({ fill: { ...rule, field: e.target.value } })}>
              {[...new Set([...fields, rule.field])].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <ul>
            {painted.map((value) => (
              <li key={value} data-value={value}>
                <label>
                  {value}
                  <input type="color" value={rule.map[value] ?? rule.else ?? '#000000'} {...picking.visit} onChange={(e) => write({ ...rule.map, [value]: e.target.value }, picking.token())} />
                </label>
                {/* A value back to the fallback, which is not the same as a value painted the
                    fallback's colour: one follows the fallback when it changes and the other does
                    not, and the difference is only sayable with a way back. */}
                {rule.map[value] !== undefined && (
                  <button type="button" aria-label={t('canvas.props.fill.clear', { value })} onClick={() => write(Object.fromEntries(Object.entries(rule.map).filter(([k]) => k !== value)))}>
                    ×
                  </button>
                )}
              </li>
            ))}
            <li data-value="">
              <label>
                {t('canvas.props.fill.rest')}
                <input type="color" value={rule.else ?? '#000000'} {...picking.visit} onChange={(e) => onPatch({ fill: { ...rule, else: e.target.value } }, picking.token())} />
              </label>
            </li>
          </ul>
        </div>
      )}
    </>
  )
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

// What the four numbers point at while the layer is locked, so a reader who lands in the field
// hears why it will not take what is typed into it.
const LOCKED_NOTE = 'byd-props-locked-note'

// The panel stands in named sections and every one of them is open (L25). The head is a heading
// and not a button on purpose: a section that can be shut is a state the panel would have to
// remember between two selections — and a designer who changes what she has selected is owed the
// same panel every time, not the one she left folded behind the last element.
function Section({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="byd-props-sec" aria-label={name}>
      <h3 className="byd-props-sec-head">{name}</h3>
      <div className="byd-props-rows">{children}</div>
    </section>
  )
}

// A number in the panel, marked with an icon and dragged rather than typed (L25). The icon is the
// field's name and its grip at once: it carries its own name out loud — «Bredd (mm), dra för att
// ändra» — beside the field's, so the word is not gone from the panel, it is only not drawn.
//
// The grip is where the drag lives, and the drag is one entry in the history however many times
// the pointer reports it (L14): the token is made at `pointerdown` and every step of the pull
// wears it. What the pointer has travelled but not yet spent is kept on the hold, so a step that
// took three reports of one pixel still arrives.
function Scrub({
  name,
  icon,
  unit,
  value,
  step,
  min,
  max,
  readOnly,
  describedBy,
  gesture,
  onWrite,
}: {
  name: string
  icon: string
  unit?: string
  value: number
  step: number
  min?: number
  max?: number
  readOnly?: boolean
  describedBy?: string
  // Every write of this number belongs to a doing: the pull it was made in, or the visit to the
  // field the digits were typed during (L14).
  gesture: Gesture
  onWrite(value: number, gesture?: string): void
}) {
  const t = useT()
  const held = useRef<{ x: number; rest: number; token: string; value: number } | null>(null)
  const take = (event: ReactPointerEvent<HTMLElement>) => {
    if (readOnly || event.button !== 0) return
    event.preventDefault()
    held.current = { x: event.clientX, rest: 0, token: gesture.begin(), value }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const drag = (event: ReactPointerEvent<HTMLElement>) => {
    const hold = held.current
    if (!hold) return
    const next = scrubbed(hold.value, { travel: hold.rest + (event.clientX - hold.x), step, shift: event.shiftKey, min, max })
    hold.x = event.clientX
    hold.rest = next.rest
    if (next.value === hold.value) return
    hold.value = next.value
    onWrite(next.value, hold.token)
  }
  const letGo = () => {
    held.current = null
  }
  // The keyboard's way to the same number, and the one thing about the panel L12 does not relax:
  // the arrows take the drag's own step, Shift takes ten of them, and one press is a whole thing
  // done and so a step of its own in the history (L14). The grip answers left and right for the
  // reader who never lands in the field; the field answers up and down, which is what a number
  // field already promises — and it is handled here rather than left to the browser because the
  // browser knows nothing about Shift.
  const nudge = (steps: number, shift: boolean) => {
    if (readOnly) return
    const next = scrubbed(value, { travel: steps * SCRUB_PX, step, shift, min, max })
    if (next.value !== value) onWrite(next.value)
  }
  const keys = (event: ReactKeyboardEvent<HTMLElement>, up: string, down: string) => {
    const steps = event.key === up ? 1 : event.key === down ? -1 : 0
    if (steps === 0 || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    nudge(steps, event.shiftKey)
  }
  return (
    <div className="byd-props-f">
      <span
        className="byd-props-grip"
        role="button"
        tabIndex={readOnly ? -1 : 0}
        aria-label={t('canvas.props.grip', { name })}
        aria-hidden={readOnly ? 'true' : undefined}
        onPointerDown={take}
        onPointerMove={drag}
        onPointerUp={letGo}
        onPointerCancel={letGo}
        onKeyDown={(event) => keys(event, 'ArrowRight', 'ArrowLeft')}
      >
        {icon}
      </span>
      <input
        type="number"
        aria-label={name}
        step={step}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        value={value}
        readOnly={readOnly === true}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        {...gesture.visit}
        onKeyDown={(event) => keys(event, 'ArrowUp', 'ArrowDown')}
        onChange={(e) => onWrite(Number(e.target.value), gesture.token())}
      />
      {/* The unit is drawn and not said: the field's own name already ends in it, and a reader
          hearing «Bredd (mm)» followed by «mm» hears it twice. It keeps its place even on a
          number that has no unit — a corner count — so every field in the panel is the same
          width and the column of them reads as a column. */}
      <span className="byd-props-unit" aria-hidden="true">
        {unit ?? ''}
      </span>
    </div>
  )
}

// `fields` are the columns the picker offers; `taken` is every name a new one would collide with,
// which is those plus the card's own id (#32). `icons` is the game's own set (E4), which is what
// an icon placed on the card is chosen from and changed to.
function Properties({
  el,
  face,
  fields,
  imageFields,
  pictures,
  assetBase,
  onAddPicture,
  taken,
  fonts,
  icons,
  valuesIn,
  onPatch,
  onAddField,
  point,
}: {
  el: Element
  face: string
  fields: string[]
  imageFields: string[]
  pictures: readonly LibraryPicture[]
  assetBase: string | undefined
  onAddPicture: ((file: File) => Promise<string>) | undefined
  taken: string[]
  fonts: string[]
  icons: string[]
  valuesIn(field: string): string[]
  onPatch(patch: Partial<Element>, gesture?: string): void
  onAddField(field: string, bindTo: string): void
  // Which point of an own shape the canvas is standing on (L38), for the one command that is
  // about a point rather than about the whole shape.
  point: number | null
}) {
  const t = useT()
  // A picture of the template's own (#320): whether the window over the game's pictures is open
  // for this element, and the column each element was drawn from before it was given a fixed
  // picture — so «Från kolumn» is the way back to where it was, and only otherwise a guess at the
  // first column the template draws as a picture. Held here and not in the element: the model
  // carries what the card is, not what it used to be.
  const [choosing, setChoosing] = useState(false)
  const wasFrom = useRef(new Map<string, string>())
  const fixedRef = useRef<HTMLInputElement>(null)
  const [backToSwitch, setBackToSwitch] = useState(false)
  useEffect(() => {
    if (!backToSwitch) return
    fixedRef.current?.focus()
    setBackToSwitch(false)
  }, [backToSwitch])
  const isFixed = el.kind === 'image' && 'literal' in el.bind
  // Whether this element has anything to say about what it shows. A shape shows nothing but
  // itself, so it is given no section about it — a heading over an empty section is a promise
  // the panel does not keep.
  const content = el.kind === 'icons' || el.kind === 'image' || ('bind' in el && !isFixed)
  const closeLibrary = () => {
    setChoosing(false)
    setBackToSwitch(true)
  }
  const toColumn = () => {
    const field = wasFrom.current.get(el.id) ?? imageFields[0] ?? fields[0]
    if (field === undefined) setMaking(true)
    else onPatch({ bind: { field } })
  }
  // The controls here that write many times over for one thing the designer did: a measurement is
  // a patch per digit typed, a colour is one per step of the picker's dragging (L14). What is
  // chosen from a list or ticked writes once and stays a step of its own.
  const typing = useGesture('props')
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
  // A locked layer's box can be read but not typed into, and not pulled either (L15): the lock is
  // about where the element sits and how big it is, and these four numbers are exactly that. What
  // it is set in, what colour it is and which column it draws stay open — locking a layer is not
  // freezing its design.
  const num = (label: Key, key: 'x' | 'y' | 'w' | 'h', icon: string) =>
    key in el ? (
      <Scrub
        name={t(label)}
        icon={icon}
        unit="mm"
        step={0.5}
        value={(el as Record<string, unknown>)[key] as number}
        readOnly={el.locked === true}
        {...(el.locked ? { describedBy: LOCKED_NOTE } : {})}
        gesture={typing}
        onWrite={(value, gesture) => onPatch({ [key]: value } as Partial<Element>, gesture)}
      />
    ) : null
  return (
    <div className="byd-props">
      {el.locked && (
        <p className="byd-props-locked" id={LOCKED_NOTE}>
          {t('canvas.props.locked')}
        </p>
      )}
      <Section name={t('canvas.props.sec.layout')}>
        {num('canvas.props.x', 'x', 'X')}
        {num('canvas.props.y', 'y', 'Y')}
        {num('canvas.props.w', 'w', 'B')}
        {num('canvas.props.h', 'h', 'H')}
      </Section>
      {/* What the element shows (#32, #320, #33): the column it draws, or the one picture or
          icon it carries itself. Every element that shows data says which column it shows. */}
      {content && (
        <Section name={t('canvas.props.sec.content')}>
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
          {/* Where a picture comes from (#320): the row's column, or one picture the template carries
              itself — a background, a frame, a logo that is the same on every card. The switch only
              opens the question; the window over the game's pictures is what answers it, and closing
              the window unanswered leaves the element on its column. Going back is going back to the
              column it was drawn from. */}
          {el.kind === 'image' && (
            <div className="byd-props-source" role="radiogroup" aria-label={t('canvas.props.source')}>
              <label>
                <input type="radio" name={`${el.id}-source`} checked={!isFixed} onChange={toColumn} />
                {t('canvas.props.source.field')}
              </label>
              <label>
                <input ref={fixedRef} type="radio" name={`${el.id}-source`} checked={isFixed} onChange={() => setChoosing(true)} />
                {t('canvas.props.source.fixed')}
              </label>
            </div>
          )}
          {el.kind === 'image' && isFixed && (
            <FixedPicture el={el} pictures={pictures} assetBase={assetBase} onChoose={() => setChoosing(true)} />
          )}
          {el.kind === 'image' && isFixed && making && (
            <NewField
              taken={taken}
              onCreate={(field) => {
                onAddField(field, el.id)
                closeForm()
              }}
              onCancel={closeForm}
            />
          )}
          {'bind' in el && !isFixed && (
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
        </Section>
      )}
      {choosing && assetBase && (
        <PictureLibraryDialog
          target={t('library.target.element', { id: el.id, face: faceName(face, t).toLowerCase() })}
          count={1}
          replacing={el.kind === 'image' && 'literal' in el.bind && isAssetRef(el.bind.literal) ? 1 : 0}
          pictures={pictures}
          assetBase={assetBase}
          onUpload={onAddPicture}
          onApply={(hash) => {
            if ('bind' in el && 'field' in el.bind) wasFrom.current.set(el.id, el.bind.field)
            onPatch({ bind: { literal: assetRef(hash) } })
            closeLibrary()
          }}
          onClose={closeLibrary}
        />
      )}
      {el.kind === 'text' && (
        <Section name={t('canvas.props.sec.text')}>
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
          <Scrub name={t('canvas.props.size')} icon="A" unit="pt" step={0.5} min={1} value={el.font.sizePt} gesture={typing} onWrite={(sizePt, gesture) => onPatch({ font: { ...el.font, sizePt } }, gesture)} />
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
            <input type="color" value={el.color} {...typing.visit} onChange={(e) => onPatch({ color: e.target.value }, typing.token())} />
          </label>
          <label>
            {t('canvas.props.fit')}
            <select value={el.fit ?? 'shrink'} onChange={(e) => onPatch({ fit: e.target.value as 'shrink' | 'fixed' })}>
              <option value="shrink">{t('canvas.fit.shrink')}</option>
              <option value="fixed">{t('canvas.fit.fixed')}</option>
            </select>
          </label>
        </Section>
      )}
      {/* A picture fills its frame, so the frame is exactly what is seen and the handles, the
          outline and the guides all stand on the picture itself. The one thing that can put air
          back between them is the picture keeping its own shape, so that is the choice offered —
          and turning it off stretches the picture to the frame rather than fitting it inside one.
          A picture fitted whole inside its frame keeps its proportions too, so it reads as on;
          turning it off and on again lands on filling, which is the frame the switch is about. */}
      {el.kind === 'image' && (
        <Section name={t('canvas.props.sec.picture')}>
          <label className="byd-props-switch">
            <input type="checkbox" checked={(el.fit ?? 'cover') !== 'fill'} onChange={(e) => onPatch({ fit: e.target.checked ? 'cover' : 'fill' })} />
            {t('canvas.props.keepRatio')}
          </label>
          {/* The other thing a picture can be fitted by (E1): what is drawn in the file rather
              than the file. A deck's art arrives one file per card, and two files holding the
              same motif rarely hold it at the same size — one carries a wide transparent border,
              the next almost none — so fitting files draws the motif a different size on every
              card. With this on, the air each file carries is measured and left out, and the
              motif is the same size throughout. A file nothing has measured is fitted as a file,
              so turning this on can never lose a picture. */}
          <label className="byd-props-switch">
            <input type="checkbox" checked={el.trim === true} onChange={(e) => onPatch({ trim: e.target.checked ? true : undefined })} />
            {t('canvas.props.trim')}
          </label>
          {/* The deck's measure (E1), which is the half of «Bildernas mått» that survives (#221,
              L22, beslut 3). Taking the air off a file still cannot say how big the drawing
              should be drawn, so two files whose proportions differ draw their motifs at
              different sizes; this is what makes them agree. It stands here rather than on the
              card wall because it is a share of *this* frame, and the frame is the template's —
              which part of a picture is the picture is the picture's own question, answered once
              in the library. Switching it off leaves the picture fitted as it was. */}
          <label className="byd-props-switch">
            <input type="checkbox" checked={el.frame !== undefined} onChange={(e) => onPatch({ frame: e.target.checked ? { fill: DEFAULT_FILL } : undefined })} />
            {t('canvas.props.evenMotifs')}
          </label>
        </Section>
      )}
      {el.kind === 'shape' && <ShapeProps el={el} point={point} fields={fields} valuesIn={valuesIn} onPatch={onPatch} />}
    </div>
  )
}

// The picture an image element carries by itself (#320), as the panel shows it: the picture and
// its name, and the way to another one. An element let go of its picture — the picture was taken
// out of Media — stands with an empty frame, and says so rather than showing nothing.
function FixedPicture({ el, pictures, assetBase, onChoose }: { el: Element & { kind: 'image' }; pictures: readonly LibraryPicture[]; assetBase: string | undefined; onChoose(): void }) {
  const t = useT()
  const ref = 'literal' in el.bind ? el.bind.literal : ''
  const hash = isAssetRef(ref) ? ref.slice(ASSET_PREFIX.length) : null
  const picture = hash === null ? undefined : pictures.find((p) => p.hash === hash)
  const name = hash === null ? t('canvas.props.picture.none') : (picture?.name ?? t('canvas.props.picture.unnamed'))
  return (
    <div className="byd-props-picture">
      {hash !== null && assetBase && <img src={assetUrl(assetBase, hash)} alt="" />}
      <span>{name}</span>
      <button type="button" className="byd-secondary" onClick={onChoose}>
        {t('canvas.props.picture.choose')}
      </button>
    </div>
  )
}

// Everything a shape is (L17): which outline, the numbers that outline reads, what fills it, and
// what it casts. Stacked in the order a designer works in — the shape first, because every other
// control here answers to it.
function ShapeProps({ el, point, fields, valuesIn, onPatch }: { el: Shape; point: number | null; fields: string[]; valuesIn(field: string): string[]; onPatch(patch: Partial<Element>, gesture?: string): void }) {
  const t = useT()
  // The numbers, the two sliders and the line's colour: every one of them writes all the way
  // through being pushed or typed into (L14). The gallery above them chooses once.
  const pushing = useGesture('shape')
  // A shape of the designer's own (L26) reads none of the parametric numbers: the point list is
  // the outline, and a corner count that draws nothing any more is a control that looks broken.
  const own = el.points !== undefined
  const takes = own ? { corners: false, innerRatio: false, rotation: false, radius: false } : shapeTakes(el.shape)
  const chosen = galleryIdOf(el)
  // The door into a shape of her own, offered only on an outline that consists of points and
  // only while she has not walked through it — the way back is the gallery above.
  const door = own ? null : ownPoints(el)
  // Whether the point the designer stands on is one that can be straightened at all.
  const at = point === null ? undefined : (el.points ?? [])[point]
  const bent = at !== undefined && (at.in !== undefined || at.out !== undefined)
  // A line has no inside (L17), so it is offered no fill and no pattern — only the line itself.
  const solid = el.shape !== 'line'
  return (
    <>
      <Section name={t('canvas.props.shape')}>
        <div className="byd-props-gallery" role="group" aria-label={t('canvas.props.shape')}>
          {SHAPE_GALLERY.map((entry) => (
            <button key={entry.id} type="button" aria-label={t(entry.name)} title={t(entry.name)} aria-pressed={chosen === entry.id} onClick={() => onPatch(shapeChoice(entry, el))}>
              <ShapeGlyph geometry={glyphGeometry(entry, GLYPH)} />
            </button>
          ))}
        </div>
        {door && (
          <button type="button" className="byd-props-disclose" onClick={() => onPatch(door)}>
            {t('canvas.props.own')}
          </button>
        )}
        {/* The two ways back out of a curve (L38). «Räta ut punkten» is offered for the point the
            designer is standing on and only while it carries a handle; «Räta ut alla» gives the
            whole outline back as the polygon L26 wrote. Neither is offered on an outline that has
            no curve in it at all — a command that would change nothing reads as a broken one. */}
        {own && bentPoints(el.points ?? []) && (
          <div className="byd-props-straighten">
            {bent && (
              <button type="button" className="byd-secondary" onClick={() => onPatch({ points: straightPoint(el.points ?? [], point ?? 0) })}>
                {t('canvas.props.straight')}
              </button>
            )}
            <button type="button" className="byd-secondary" onClick={() => onPatch({ points: straightAll(el.points ?? []) })}>
              {t('canvas.props.straightAll')}
            </button>
          </div>
        )}
        {takes.corners && (
          <Scrub name={t('canvas.props.corners')} icon="⬡" step={1} min={3} max={24} value={el.corners ?? 6} gesture={pushing} onWrite={(corners, gesture) => onPatch({ corners }, gesture)} />
        )}
        {takes.radius && (
          <Scrub name={t('canvas.props.radius')} icon="◜" unit="mm" step={0.5} min={0} value={el.radiusMm ?? 0} gesture={pushing} onWrite={(radiusMm, gesture) => onPatch({ radiusMm }, gesture)} />
        )}
        {takes.rotation && (
          <Scrub name={t('canvas.props.rotation')} icon="∠" unit="°" step={1} min={0} max={360} value={el.rotationDeg ?? 0} gesture={pushing} onWrite={(rotationDeg, gesture) => onPatch({ rotationDeg }, gesture)} />
        )}
        {takes.innerRatio && (
          <Scrub name={t('canvas.props.innerRatio')} icon="✧" unit="%" step={1} min={5} max={95} value={Math.round((el.innerRatio ?? 0.45) * 100)} gesture={pushing} onWrite={(share, gesture) => onPatch({ innerRatio: share / 100 }, gesture)} />
        )}
      </Section>
      {/* What fills the outline, and over it the pattern that is a layer and not a fill (L17). */}
      {solid && (
        <Section name={t('canvas.props.sec.fill')}>
          <Fill fill={el.fill} fields={fields} valuesIn={valuesIn} onPatch={onPatch} />
          <PatternProps pattern={el.pattern} fill={el.fill} onPatch={onPatch} />
        </Section>
      )}
      <Section name={t('canvas.props.sec.line')}>
        <label>
          {t('canvas.props.stroke')}
          <input type="color" value={el.stroke ?? '#111111'} {...pushing.visit} onChange={(e) => onPatch({ stroke: e.target.value, ...((el.strokeMm ?? 0) > 0 ? {} : { strokeMm: 0.5 }) }, pushing.token())} />
        </label>
        <Scrub name={t('canvas.props.strokeMm')} icon="▬" unit="mm" step={0.1} min={0} value={el.strokeMm ?? 0} gesture={pushing} onWrite={(strokeMm, gesture) => onPatch({ strokeMm }, gesture)} />
      </Section>
      {/* What the shape does as a whole rather than what one layer of it is: how see-through it
          is (#317), and what it casts (L17). In per cent, because that is the unit the value is
          thought in — the document keeps the share of one. It was a slider and is now the panel's
          one number control like every other (L25): the same arrow keys, the same grip, and the
          same one entry in the history per drag. Offered on a line as well, which has no inside
          to fill but is ink all the same. */}
      <Section name={t('canvas.props.sec.effects')}>
        <Scrub name={t('canvas.props.opacity')} icon="◐" unit="%" step={1} min={0} max={100} value={Math.round((el.opacity ?? 1) * 100)} gesture={pushing} onWrite={(share, gesture) => onPatch({ opacity: share / 100 }, gesture)} />
        <ShadowProps shadow={el.shadow} onPatch={onPatch} />
      </Section>
    </>
  )
}

// A pattern is a layer over the fill and not a fill of its own (L17), which is what the switch's
// wording has to carry: turning it on changes nothing about the colour underneath.
function PatternProps({ pattern, fill, onPatch }: { pattern: Pattern | undefined; fill: Paint | undefined; onPatch(patch: Partial<Element>, gesture?: string): void }) {
  const t = useT()
  const pushing = useGesture('pattern')
  return (
    <>
      <label className="byd-props-switch">
        <input type="checkbox" checked={pattern !== undefined} onChange={(e) => onPatch({ pattern: e.target.checked ? newPattern(fill) : undefined })} />
        {t('canvas.props.pattern')}
      </label>
      {pattern && (
        <div className="byd-props-paint">
          {/* Named for what the tiles are and not for the switch above them: two things under
              one name is a reader hearing the same words twice and learning nothing. */}
          <div className="byd-props-gallery" role="group" aria-label={t('canvas.props.pattern.kind')}>
            {PATTERNS.map((kind) => (
              <button key={kind.kind} type="button" aria-label={t(kind.name)} title={t(kind.name)} aria-pressed={pattern.kind === kind.kind} onClick={() => onPatch({ pattern: { ...pattern, kind: kind.kind } })}>
                <PatternGlyph kind={kind.kind} />
              </button>
            ))}
          </div>
          <label>
            {t('canvas.props.pattern.color')}
            <input type="color" value={pattern.color} {...pushing.visit} onChange={(e) => onPatch({ pattern: { ...pattern, color: e.target.value } }, pushing.token())} />
          </label>
          <Scrub name={t('canvas.props.pattern.scale')} icon="⊞" unit="mm" step={0.5} min={0.5} value={pattern.scaleMm} gesture={pushing} onWrite={(scaleMm, gesture) => onPatch({ pattern: { ...pattern, scaleMm } }, gesture)} />
          <Scrub name={t('canvas.props.pattern.angle')} icon="∠" unit="°" step={1} min={0} max={180} value={pattern.angleDeg ?? 0} gesture={pushing} onWrite={(angleDeg, gesture) => onPatch({ pattern: { ...pattern, angleDeg } }, gesture)} />
        </div>
      )}
    </>
  )
}

// Four shadows and a way past them (L17). `Ingen` is one of the four rather than the absence of
// a choice, so the panel can say which one the shape wears; `Anpassa` appears only once there is
// a shadow, because five sliders for a shadow that does not exist are five sliders about nothing.
function ShadowProps({ shadow, onPatch }: { shadow: Shadow | undefined; onPatch(patch: Partial<Element>, gesture?: string): void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const chosen = shadowIdOf(shadow)
  const pushing = useGesture('shadow')
  const at = (next: Partial<Shadow>, gesture?: string) => onPatch({ shadow: { ...(shadow ?? SHADOWS[1]?.shadow ?? { dxMm: 0, dyMm: 0.6, blurMm: 1.2, color: '#000000' }), ...next } }, gesture)
  return (
    <>
      <div className="byd-props-chips" role="group" aria-label={t('canvas.props.shadow')}>
        {SHADOWS.map((preset) => (
          <button key={preset.id} type="button" aria-pressed={chosen === preset.id} onClick={() => onPatch({ shadow: preset.shadow })}>
            {t(preset.name)}
          </button>
        ))}
      </div>
      {shadow && (
        <button type="button" className="byd-props-disclose" aria-expanded={open} onClick={() => setOpen(!open)}>
          {/* The triangle is a picture of what `aria-expanded` already says. Drawn with CSS
              `content` it joined the button's name and the control was read out as "▸ Anpassa",
              so it is a hidden span: seen by the eye, skipped by the name. */}
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> {t('canvas.shadow.custom')}
        </button>
      )}
      {shadow && open && (
        <div className="byd-props-paint">
          <Scrub name={t('canvas.shadow.dx')} icon="↔" unit="mm" step={0.1} value={shadow.dxMm} gesture={pushing} onWrite={(dxMm, gesture) => at({ dxMm }, gesture)} />
          <Scrub name={t('canvas.shadow.dy')} icon="↕" unit="mm" step={0.1} value={shadow.dyMm} gesture={pushing} onWrite={(dyMm, gesture) => at({ dyMm }, gesture)} />
          <Scrub name={t('canvas.shadow.blur')} icon="◌" unit="mm" step={0.1} min={0} value={shadow.blurMm} gesture={pushing} onWrite={(blurMm, gesture) => at({ blurMm }, gesture)} />
          <label>
            {t('canvas.shadow.color')}
            <input type="color" value={shadow.color} {...pushing.visit} onChange={(e) => at({ color: e.target.value }, pushing.token())} />
          </label>
          <Scrub name={t('canvas.shadow.opacity')} icon="◐" unit="%" step={1} min={0} max={100} value={Math.round((shadow.opacity ?? 1) * 100)} gesture={pushing} onWrite={(share, gesture) => at({ opacity: share / 100 }, gesture)} />
        </div>
      )}
    </>
  )
}

// A gallery button's picture is drawn by the same path generator the card is drawn by, so what
// is on the button can never disagree with what pressing it produces. The glyph box is wider
// than it is tall: a capsule in a square box is a circle, and a gallery where two buttons draw
// the same picture is a gallery that cannot be read.
const GLYPH = { w: 20, h: 15 }
function ShapeGlyph({ geometry }: { geometry: Geometry }) {
  const inset = 1.2
  const open = geometry.shape === 'line'
  const d = pathFor(geometry.shape, { x: inset, y: inset, w: GLYPH.w - 2 * inset, h: GLYPH.h - 2 * inset }, geometry)
  return (
    <svg viewBox={`0 0 ${GLYPH.w} ${GLYPH.h}`} width={GLYPH.w} height={GLYPH.h} aria-hidden="true" focusable="false">
      <path d={d} fill={open ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={open ? 2 : 0} strokeLinejoin="round" />
    </svg>
  )
}

const TILE = 22
function PatternGlyph({ kind }: { kind: Pattern['kind'] }) {
  const id = `byd-tile-${kind}`
  return (
    <svg viewBox={`0 0 ${TILE} ${TILE}`} width={TILE} height={TILE} aria-hidden="true" focusable="false">
      <defs>
        <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" dangerouslySetInnerHTML={{ __html: tileMarkup(kind, 7, 'currentColor') }} />
      </defs>
      <rect width={TILE} height={TILE} rx="3" fill={`url(#${id})`} />
    </svg>
  )
}

// The ready-made backs (L17), each drawn by the one renderer at thumbnail size — a picture of a
// card is a compiled card here as everywhere else (E2), so a back can never look like one thing
// in the gallery and another once it is laid down.
function BackGallery({ onReplaceFace }: { onReplaceFace(base: Element[]): void }) {
  const t = useT()
  return (
    <div className="byd-backs" role="group" aria-label={t('canvas.backs')}>
      <h2>{t('canvas.backs')}</h2>
      <div className="byd-backs-list">
        {BACKS.map((back) => (
          <button key={back.id} type="button" onClick={() => onReplaceFace(back.base(t))}>
            <span className="byd-backs-card">
              <CardPreview id={`byd-back-${back.id}`} face={{ base: back.base(t), variants: {} }} row={{}} icons={{}} scale={0.26} />
            </span>
            <span>{t(back.name)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
