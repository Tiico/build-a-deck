import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { BoxFace, boxFaceSize, boxFaceType, tuckNet, type BoxNet, type BoxSide } from '@byd/engine'
import { boxFaceOf, boxOf, type GameBox } from '@byd/server/doc'
import type { FaceTemplate, Motif } from '@byd/template'
import type { CatalogFamily } from './font-catalog.js'
import type { CatalogIcon } from './icon-catalog.js'
import type { OwnIcon } from './IconCatalog.js'
import type { ProjectClient } from './ProjectClient.js'
import type { ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { NetLines } from './box-net.js'
import { PX_PER_MM } from './canvas.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { Scrub, TemplateCanvas, faceName } from './TemplateCanvas.js'
import { FootSaid } from './said.js'
import { useGesture } from './gesture.js'
import { LockGlyph } from '../glyphs.js'
import { useLang, useT, type Key, type T } from '../i18n/index.js'

// Fliken «Låda» (#1413, L91, #1406 runda 2, hybriden i läget «nätet»). Tuckboxen utvikt i millimeter
// mitt i, med flikar, vik- och snittlinjer och locket upp och ner som på arket. Till vänster lådans
// sex ytor och lagren för den valda, till höger måtten med ett lås per mått, formeln och luften, och
// under dem egenskaperna för det valda lagret.
//
// Ytan redigeras av Malls egen duk (`TemplateCanvas` med en `surface`): samma lager, verktyg och
// egenskaper som ett kort, och samma redigeringar, märkta `on: 'box'`. Varje yta i nätet ritas av den
// enda renderaren (E2) i sitt eget mått, också den neutrala ytan en låda har innan den ritats.
// Flikarna och linjerna är nätets egna, eftersom de aldrig trycks.
//
// «Visa upp» och vikningen mellan nätet och produktbilden är nästa skiva (#1414).

export const BOX_FACES: readonly BoxFace[] = BoxFace.options
const SIDES: readonly BoxSide[] = ['width', 'height', 'depth']

// What the tab asks of the client: the box's own edits and the canvas' way back from a drag.
export type BoxEditing = Pick<ProjectClient, 'lockBox' | 'setBoxClearance' | 'followDeck' | 'patchBoxElement' | 'addBoxElement' | 'removeBoxElement' | 'moveBoxElement' | 'replaceBoxFace' | 'callOff'>

export type BoxTabProps = {
  doc: ProjectDoc
  edit: BoxEditing
  reading: boolean
  assetBase?: string | undefined
  motifs?: Record<string, Motif> | undefined
  face: BoxFace
  onSelectFace(face: BoxFace): void
  element: string | null
  onSelectElement(id: string | null): void
  onOpenFonts?: (() => void) | undefined
  onCatalogFont?: ((family: CatalogFamily) => Promise<string>) | undefined
  onCatalogIcon?: ((icon: CatalogIcon, gesture: string) => Promise<string>) | undefined
  onOwnIcon?: ((icon: OwnIcon, gesture: string) => Promise<string>) | undefined
  onAddPicture?: ((file: File) => Promise<string>) | undefined
}

// The canvas names the face it edits `box.` and the document's key, so a face of the box is never
// taken for the card's side of the same name (`BOX_FACE_NAMES`).
const canvasFace = (face: BoxFace) => `box.${face}`

export function BoxTab({ doc, edit, reading, assetBase, motifs, face, onSelectFace, element, onSelectElement, onOpenFonts, onCatalogFont, onCatalogIcon, onOwnIcon, onAddPicture }: BoxTabProps) {
  const t = useT()
  const mm = useMm()
  const fit = useMemo(() => boxOf(doc), [doc])
  const drawings = useMemo(() => Object.fromEntries(BOX_FACES.map((f) => [f, boxFaceOf(doc, f)])) as Record<BoxFace, ReturnType<typeof boxFaceOf>>, [doc])
  const net = useMemo(() => tuckNet(fit.type, fit.size), [fit])
  const type = useMemo(() => boxFaceType(fit.type, face, fit.size), [fit, face])
  const size = boxFaceSize(face, fit.size)
  // The document the canvas reads: the game's, with the face being edited in the card's place and
  // no cards. A face of the box shows no card's column, so the canvas has none to offer it.
  const shown = drawings[face].template
  const view = useMemo<ProjectDoc>(() => ({ ...doc, rows: [], template: { faces: { [canvasFace(face)]: shown } } }), [doc, face, shown])
  const named = (f: BoxFace) => faceName(canvasFace(f), t)
  return (
    <TemplateCanvas
      doc={view}
      reading={reading}
      assetBase={assetBase}
      motifs={motifs}
      face={canvasFace(face)}
      onSelectFace={() => undefined}
      onReplaceFace={(base) => edit.replaceBoxFace(face, base)}
      row={null}
      selectedElement={element}
      onSelectElement={onSelectElement}
      onPatch={(id, patch, gesture) => edit.patchBoxElement(face, id, patch, gesture)}
      onCallOff={(gesture) => edit.callOff(gesture)}
      onAdd={(el) => edit.addBoxElement(face, el)}
      onReorder={(id, to) => edit.moveBoxElement(face, id, to)}
      onLock={(id, locked) => edit.patchBoxElement(face, id, { locked: locked ? true : undefined })}
      onRename={(id, name) => edit.patchBoxElement(face, id, { name: name ?? undefined })}
      onRemove={(id) => {
        edit.removeBoxElement(face, id)
        onSelectElement(null)
      }}
      group={null}
      onSelectGroup={() => undefined}
      onGroupColumn={() => undefined}
      onAddField={() => undefined}
      onReset={() => undefined}
      onOpenFonts={onOpenFonts}
      onCatalogFont={onCatalogFont}
      onCatalogIcon={onCatalogIcon}
      onOwnIcon={onOwnIcon}
      onAddPicture={onAddPicture}
      surface={{
        type,
        turned: net.panels.find((p) => p.face === face)?.turned ?? false,
        affects: t('box.affects', { w: mm(size.widthMm), h: mm(size.heightMm) }),
        layersHead: <FaceList doc={doc} fit={fit} drawings={drawings} face={face} assetBase={assetBase} motifs={motifs} onSelect={(f) => {
          onSelectFace(f)
          onSelectElement(null)
        }} />,
        propsHead: <Measures fit={fit} edit={edit} reading={reading} />,
        stage: (editing) => (
          <>
            <NetStage
              doc={doc}
              net={net}
              fit={fit}
              drawings={drawings}
              face={face}
              assetBase={assetBase}
              motifs={motifs}
              editing={editing}
              onChoose={(f) => {
                onSelectFace(f)
                onSelectElement(null)
              }}
              onDeselect={() => onSelectElement(null)}
            />
            <div className="byd-box-foot">
              <FootSaid>
                <p className="byd-box-foot-line">
                  <span>{t('box.editing', { face: named(face) })}</span>
                  <span className="byd-box-foot-size">
                    <b>{t('box.size.line', { w: mm(fit.size.width), h: mm(fit.size.height), d: mm(fit.size.depth) })}</b>
                    {' · '}
                    {t(cardsOf(fit) === 0 ? 'box.cards.none' : cardsOf(fit) === 1 ? 'box.cards.one' : 'box.cards.other', { n: cardsOf(fit) })}
                    {' · '}
                    {t(SIDES.some((s) => fit.locked[s]) ? 'box.state.locked' : 'box.state.follows')}
                  </span>
                </p>
              </FootSaid>
            </div>
          </>
        ),
      }}
    />
  )
}

// How many cards the deck has, read back out of its thickness.
const cardsOf = (fit: GameBox): number => Math.round(fit.deckMm / fit.card.thicknessMm)

// A measure as the reader writes it: «34,5» in Swedish, «34.5» in English.
function useMm(): (n: number) => string {
  const { lang } = useLang()
  return useMemo(() => {
    const format = new Intl.NumberFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: 2 })
    return (n: number) => format.format(n)
  }, [lang])
}

// What the faces are drawn with, shared by the list and the net.
function useLook(doc: ProjectDoc, drawings: Record<BoxFace, { template: FaceTemplate }>, assetBase: string | undefined) {
  const icons = useMemo(() => previewIcons({ icons: doc.icons }, assetBase), [doc.icons, assetBase])
  const faces = useMemo(() => Object.fromEntries(BOX_FACES.map((f) => [f, drawings[f].template])), [drawings])
  const fonts = useMemo(() => previewFonts({ template: { faces }, fonts: doc.fonts }, assetBase), [faces, doc.fonts, assetBase])
  return { icons, fonts }
}

// The six faces, each a button with its picture, its name and its measure (#1406 runda 2). The
// flaps stand last and are no button: they are folded in and never printed, so there is nothing on
// them to draw. A list of buttons and not a listbox: choosing a face is the whole of it.
function FaceList({ doc, fit, drawings, face, assetBase, motifs, onSelect }: { doc: ProjectDoc; fit: GameBox; drawings: Record<BoxFace, { drawn: boolean; template: FaceTemplate }>; face: BoxFace; assetBase: string | undefined; motifs: Record<string, Motif> | undefined; onSelect(face: BoxFace): void }) {
  const t = useT()
  const mm = useMm()
  const look = useLook(doc, drawings, assetBase)
  return (
    <div className="byd-box-faces">
      <h2 id="byd-box-faces">{t('box.faces')}</h2>
      <ul aria-labelledby="byd-box-faces">
        {BOX_FACES.map((f) => {
          const size = boxFaceSize(f, fit.size)
          const thumb = THUMB_PX / (PX_PER_MM * Math.max(size.widthMm, size.heightMm))
          return (
            <li key={f}>
              <button type="button" aria-pressed={f === face} data-box-face={f} onClick={() => onSelect(f)}>
                <span className="byd-box-thumb" aria-hidden="true">
                  <CardPreview id={`box-thumb-${f}`} type={boxFaceType(fit.type, f, fit.size)} face={drawings[f].template} row={{}} icons={look.icons} fonts={look.fonts} scale={thumb} assetBase={assetBase} motifs={motifs} palette={doc.palette} />
                </span>
                <span className="byd-box-face-name">{faceName(canvasFace(f), t)}</span>
                <small>{t('box.face.size', { w: mm(size.widthMm), h: mm(size.heightMm) })}</small>
              </button>
            </li>
          )
        })}
        <li className="byd-box-flaps">
          <span className="byd-box-thumb" aria-hidden="true" />
          <span className="byd-box-face-name">{t('box.flaps')}</span>
          <small>{t('box.flaps.note')}</small>
        </li>
      </ul>
    </div>
  )
}
// How big a face's picture is in the list, on its longer side.
const THUMB_PX = 28

// The box's measures, a lock each, the formula that gives them, and the air (#1406, beslut 4).
function Measures({ fit, edit, reading }: { fit: GameBox; edit: BoxEditing; reading: boolean }) {
  const t = useT()
  const mm = useMm()
  const typing = useGesture('box-air')
  const n = cardsOf(fit)
  const source: Record<BoxSide, string> = {
    width: t('box.source.around', { card: mm(fit.card.widthMm), air: mm(fit.clearance.around) }),
    height: t('box.source.around', { card: mm(fit.card.heightMm), air: mm(fit.clearance.around) }),
    depth: t(n === 1 ? 'box.source.depth.one' : 'box.source.depth.other', { n, t: mm(fit.card.thicknessMm), air: mm(fit.clearance.depth) }),
  }
  const roomy = fit.clearance.around + 1
  return (
    <div className="byd-box-measures">
      <section aria-labelledby="byd-box-size">
        <h2 id="byd-box-size">{t('box.size')}</h2>
        <dl className="byd-box-sides">
          {SIDES.map((side) => {
            const locked = fit.locked[side]
            const short = locked && fit.size[side] < fit.follows[side]
            return (
              <div key={side} className="byd-box-side" {...(locked ? { 'data-locked': '' } : {})}>
                <dt>{t(SIDE_WORDS[side])}</dt>
                <dd>
                  <b>{t('box.mm', { mm: mm(fit.size[side]) })}</b>
                  <small>{locked ? t(short ? 'box.locked.needs' : 'box.locked', { mm: mm(fit.follows[side]) }) : source[side]}</small>
                </dd>
                <dd className="byd-box-lock">
                  <button
                    type="button"
                    aria-pressed={locked}
                    aria-label={t(LOCK_WORDS[side])}
                    title={t(locked ? 'box.lock.held' : 'box.lock.follows')}
                    disabled={reading}
                    onClick={() => edit.lockBox(side, locked ? null : fit.size[side])}
                  >
                    <LockGlyph open={!locked} />
                  </button>
                </dd>
              </div>
            )
          })}
        </dl>
        <p className="byd-box-formula">{t('box.formula', { n, t: mm(fit.card.thicknessMm), deck: mm(fit.deckMm), holds: fit.holds })}</p>
        {fit.over > 0 ? (
          <div className="byd-box-over" role="status">
            <p>
              <b>{fit.over === 1 ? t('box.over.one') : t('box.over.other', { n: fit.over })}</b> {shortWords(fit, t, mm)}
            </p>
            {!reading && (
              <button type="button" className="byd-secondary" onClick={() => edit.followDeck()}>
                {t('box.follow')}
              </button>
            )}
          </div>
        ) : (
          <p className="byd-canvas-hint">{t('box.hint')}</p>
        )}
      </section>
      <section aria-labelledby="byd-box-air">
        <h2 id="byd-box-air">{t('box.air')}</h2>
        {/* In the panel's own number fields, so the air is typed and pulled as a layer's measure is. */}
        <div className="byd-props">
        <div className="byd-box-air">
          {(['around', 'depth'] as const).map((side) => (
            <div key={side} className="byd-box-air-f">
              <span aria-hidden="true">{t(side === 'around' ? 'box.air.around' : 'box.air.depth')}</span>
              <Scrub
                name={t(side === 'around' ? 'box.air.around' : 'box.air.depth')}
                icon={t(side === 'around' ? 'box.air.grip.around' : 'box.air.grip.depth')}
                unit="mm"
                step={0.5}
                min={0}
                max={10}
                value={fit.clearance[side]}
                readOnly={reading}
                gesture={typing}
                // The type's own air is no answer of the designer's, so it is written as none.
                onWrite={(value) => edit.setBoxClearance(side, value === fit.type.holds.clearanceMm[side] ? null : value)}
              />
            </div>
          ))}
        </div>
        </div>
        <p className="byd-canvas-hint">{t('box.air.hint', { air: mm(roomy), w: mm(fit.card.widthMm + 2 * roomy), h: mm(fit.card.heightMm + 2 * roomy) })}</p>
      </section>
    </div>
  )
}
const SIDE_WORDS: Record<BoxSide, Key> = { width: 'box.side.width', height: 'box.side.height', depth: 'box.side.depth' }
const LOCK_WORDS: Record<BoxSide, Key> = { width: 'box.lock.width', height: 'box.lock.height', depth: 'box.lock.depth' }

// Why the deck does not fit, in the words Fysisk kontroll says it in (#1412).
function shortWords(fit: GameBox, t: T, mm: (n: number) => string): string {
  if (fit.short === 'width') return t('wall.box.width', { card: mm(fit.card.widthMm), room: mm(Math.max(0, fit.size.width - 2 * fit.clearance.around)) })
  if (fit.short === 'height') return t('wall.box.height', { card: mm(fit.card.heightMm), room: mm(Math.max(0, fit.size.height - 2 * fit.clearance.around)) })
  return t('wall.box.depth', { deck: mm(fit.deckMm), room: mm(fit.roomMm) })
}

// The net in the middle (#1406 variant A): every face drawn by the one renderer in its place on the
// sheet, the one being edited with the canvas' hand on it, and the flaps and lines between them.
// It is fitted to the room it is given, so the whole sheet is always in view.
function NetStage({ doc, net, fit, drawings, face, assetBase, motifs, editing, onChoose, onDeselect }: { doc: ProjectDoc; net: BoxNet; fit: GameBox; drawings: Record<BoxFace, { template: FaceTemplate }>; face: BoxFace; assetBase: string | undefined; motifs: Record<string, Motif> | undefined; editing(scale: number): ReactNode; onChoose(face: BoxFace): void; onDeselect(): void }) {
  const t = useT()
  const look = useLook(doc, drawings, assetBase)
  const room = useRef<HTMLElement | null>(null)
  const scale = useFitted(room, net)
  const px = PX_PER_MM * scale
  return (
    <section ref={room} className="byd-canvas-stage byd-box-stage" aria-label={t('box.net')} tabIndex={0} onClick={onDeselect} style={{ ['--byd-canvas-scale' as string]: String(scale) }}>
      <div className="byd-box-net" style={{ width: `${net.width * px}px`, height: `${net.height * px}px` }}>
        <NetLines net={net} px={px} part="flaps" />
        {net.panels.map((p) => (
          <div
            key={p.face}
            className="byd-box-panel"
            data-face={p.face}
            {...(p.face === face ? { 'data-chosen': '' } : { 'aria-hidden': 'true' })}
            {...(p.turned ? { 'data-turned': '' } : {})}
            style={{ left: `${p.x * px}px`, top: `${p.y * px}px`, width: `${p.width * px}px`, height: `${p.height * px}px` }}
            onClick={(event) => {
              if (p.face === face) return
              event.stopPropagation()
              onChoose(p.face)
            }}
          >
            {p.face === face ? (
              editing(scale)
            ) : (
              <CardPreview id={`box-net-${p.face}`} type={boxFaceType(fit.type, p.face, fit.size)} face={drawings[p.face].template} row={{}} icons={look.icons} fonts={look.fonts} scale={scale} assetBase={assetBase} motifs={motifs} palette={doc.palette} />
            )}
          </div>
        ))}
        <NetLines net={net} px={px} part="lines" />
      </div>
    </section>
  )
}

// How big the net is drawn: the whole sheet in the room with air round it, never larger than twice
// its own measure. Where nothing can be measured (a headless test, a first paint) it is drawn at a
// scale a desk's stage holds.
const NET_AIR_PX = 32
const NET_START = 0.75
function useFitted(room: RefObject<HTMLElement | null>, net: BoxNet): number {
  const [scale, setScale] = useState(NET_START)
  useLayoutEffect(() => {
    const el = room.current
    if (!el) return
    const fit = () => {
      const box = el.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) return
      const next = Math.min((box.width - 2 * NET_AIR_PX) / (net.width * PX_PER_MM), (box.height - 2 * NET_AIR_PX) / (net.height * PX_PER_MM), 2)
      if (next > 0) setScale(Math.round(next * 1000) / 1000)
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const watching = new ResizeObserver(fit)
    watching.observe(el)
    return () => watching.disconnect()
  }, [room, net])
  return scale
}
