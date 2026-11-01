import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { ComponentTypeDef } from '@byd/engine'
import { boardTypeOf, layBoards, type BoardKind } from '@byd/server/doc'
import type { FaceTemplate, Motif } from '@byd/template'
import type { CatalogFamily } from './font-catalog.js'
import type { CatalogIcon } from './icon-catalog.js'
import type { OwnIcon } from './IconCatalog.js'
import type { ProjectClient } from './ProjectClient.js'
import type { ProjectDoc } from './types.js'
import { PX_PER_MM } from './canvas.js'
import { TemplateCanvas } from './TemplateCanvas.js'
import { useMm } from './box-mm.js'
import { useT, type Key } from '../i18n/index.js'

// Fliken «Bräde» (#1481, variant A i #1473): brädets sida designas med Mall:s egen duk, som lådans ytor
// (L91): samma lager, verktyg och egenskaper som ett kort, och samma redigeringar, märkta `on: 'board'`.
// Till vänster spelets bräden och lagren för det valda, i mitten brädet i sitt eget mått med zonerna
// från Bord ovanpå som låsta konturer, så att bilden kan ritas runt dem, och till höger egenskaperna.
// Brädet läggs, byter storlek och tas bort i Bord; här ritas det.

export type BoardEditing = Pick<ProjectClient, 'patchBoardElement' | 'addBoardElement' | 'removeBoardElement' | 'moveBoardElement' | 'replaceBoardFace' | 'callOff'>

export type BoardTabProps = {
  doc: ProjectDoc
  edit: BoardEditing
  reading: boolean
  assetBase?: string | undefined
  motifs?: Record<string, Motif> | undefined
  // The board chosen, by its name in the document; null is the first.
  board: string | null
  onSelectBoard(id: string): void
  element: string | null
  onSelectElement(id: string | null): void
  onOpenFonts?: (() => void) | undefined
  onCatalogFont?: ((family: CatalogFamily) => Promise<string>) | undefined
  onCatalogIcon?: ((icon: CatalogIcon, gesture: string) => Promise<string>) | undefined
  onOwnIcon?: ((icon: OwnIcon, gesture: string) => Promise<string>) | undefined
  onAddPicture?: ((file: File) => Promise<string>) | undefined
}

// A board is the main board or a seat's player board, which is how the tab and the canvas name it.
export type BoardRole = 'main' | 'player'
export const boardRole = (board: BoardKind): BoardRole => (board.role !== undefined ? 'player' : 'main')
const ROLE_WORDS: Record<BoardRole, Key> = { main: 'board.kind.main', player: 'board.kind.player' }
// The canvas names the side it edits `board.` and the board's role, so a side of the board is never
// taken for a card's side or a face of the box (`BOX_FACE_NAMES`).
const canvasFace = (board: BoardKind) => `board.${boardRole(board)}`
// The side the tab draws: a board has one today (#1470, beslut 7).
const SIDE = 'front'
const EMPTY: FaceTemplate = { base: [], variants: {} }

export function BoardTab({ doc, edit, reading, assetBase, motifs, board, onSelectBoard, element, onSelectElement, onOpenFonts, onCatalogFont, onCatalogIcon, onOwnIcon, onAddPicture }: BoardTabProps) {
  const t = useT()
  const mm = useMm()
  const boards = useMemo(() => (doc.setup.boards ?? []).filter((b) => boardTypeOf(b.type) !== undefined), [doc.setup.boards])
  const chosen = boards.find((b) => b.id === board) ?? boards[0]
  const type = chosen ? boardTypeOf(chosen.type) : undefined
  const template = chosen?.faces?.[SIDE] ?? EMPTY
  const key = chosen ? canvasFace(chosen) : 'board.main'
  const view = useMemo<ProjectDoc>(() => ({ ...doc, rows: [], template: { faces: { [key]: template } } }), [doc, key, template])
  const zones = useMemo(() => (chosen ? zonesOn(doc, chosen) : []), [doc, chosen])
  if (!chosen || !type) return <p className="byd-canvas-hint">{t('board.none')}</p>
  const face = `${chosen.id}.${SIDE}`
  const { widthMm: w, heightMm: h } = type.physical
  return (
    <TemplateCanvas
      doc={view}
      reading={reading}
      assetBase={assetBase}
      motifs={motifs}
      face={key}
      onSelectFace={() => undefined}
      onReplaceFace={(base) => edit.replaceBoardFace(face, base)}
      row={null}
      selectedElement={element}
      onSelectElement={onSelectElement}
      onPatch={(id, patch, gesture) => edit.patchBoardElement(face, id, patch, gesture)}
      onCallOff={(gesture) => edit.callOff(gesture)}
      onAdd={(el) => edit.addBoardElement(face, el)}
      onReorder={(id, to) => edit.moveBoardElement(face, id, to)}
      onLock={(id, locked) => edit.patchBoardElement(face, id, { locked: locked ? true : undefined })}
      onRename={(id, name) => edit.patchBoardElement(face, id, { name: name ?? undefined })}
      onRemove={(id) => {
        edit.removeBoardElement(face, id)
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
        turned: false,
        affects: t('board.affects', { w: mm(w), h: mm(h), bleed: mm(type.print.bleedMm) }),
        layersHead: (
          <BoardList
            boards={boards}
            chosen={chosen.id}
            onSelect={(id) => {
              onSelectBoard(id)
              onSelectElement(null)
            }}
          />
        ),
        propsHead: (
          <div className="byd-board-notes">
            <p className="byd-canvas-hint">{t('board.fixed')}</p>
            {zones.length > 0 && <p className="byd-canvas-hint">{t('board.zones.note')}</p>}
          </div>
        ),
        stage: (editing) => <BoardStage type={type} zones={zones} editing={editing} onDeselect={() => onSelectElement(null)} label={t('board.stage', { board: t(ROLE_WORDS[boardRole(chosen)]) })} size={t('board.size', { w: mm(w), h: mm(h) })} />,
      }}
    />
  )
}

// The game's boards, each a button with its role and its measure. A list of buttons and not a
// listbox: choosing a board is the whole of it.
function BoardList({ boards, chosen, onSelect }: { boards: readonly BoardKind[]; chosen: string; onSelect(id: string): void }) {
  const t = useT()
  const mm = useMm()
  return (
    <div className="byd-board-list">
      <h2 id="byd-board-list">{t('board.boards')}</h2>
      <ul aria-labelledby="byd-board-list">
        {boards.map((b) => {
          const physical = boardTypeOf(b.type)?.physical
          return (
            <li key={b.id}>
              <button type="button" aria-pressed={b.id === chosen} data-board-pick={b.id} onClick={() => onSelect(b.id)}>
                <span>{t(ROLE_WORDS[boardRole(b)])}</span>
                {physical && <small>{t(boardRole(b) === 'player' ? 'board.size.player' : 'board.size', { w: mm(physical.widthMm), h: mm(physical.heightMm) })}</small>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// A zone of Bord that lies on the board, in the board's own millimetres: the main board's as it lies,
// a player board's as it lies at the first seat, before it is turned to the seat.
type OnBoard = { id: string; name: string; x: number; y: number; w: number; h: number }
function zonesOn(doc: ProjectDoc, board: BoardKind): OnBoard[] {
  const laid = layBoards(doc.setup).find((l) => l.board.id === board.id)
  const type = boardTypeOf(board.type)
  if (!laid || !type) return []
  const home = doc.setup.zones.find((z) => z.id === laid.zone)
  if (!home) return []
  const { widthMm: w, heightMm: h } = type.physical
  const turned = laid.rot % 180 !== 0
  const [fw, fh] = turned ? [h, w] : [w, h]
  const cx = home.geometry.x + laid.x + w / 2
  const cy = home.geometry.y + laid.y + h / 2
  const foot = { x: cx - fw / 2, y: cy - fh / 2, w: fw, h: fh }
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.5
  return doc.setup.zones.flatMap((z) => {
    if (z.kind !== 'area' || z.id === laid.zone || z.id === doc.setup.floor) return []
    const g = z.geometry
    const inside = g.x >= foot.x - 0.5 && g.y >= foot.y - 0.5 && g.x + g.w <= foot.x + foot.w + 0.5 && g.y + g.h <= foot.y + foot.h + 0.5
    const whole = near(g.x, foot.x) && near(g.y, foot.y) && near(g.w, foot.w) && near(g.h, foot.h)
    if (!inside || whole) return []
    // Back into the board's own frame, undoing the seat's turn.
    const local = unturn({ x: g.x - foot.x, y: g.y - foot.y, w: g.w, h: g.h }, laid.rot, fw, fh)
    return [{ id: z.id, name: z.name, ...local }]
  })
}
function unturn(r: { x: number; y: number; w: number; h: number }, rot: number, fw: number, fh: number): { x: number; y: number; w: number; h: number } {
  switch (((rot % 360) + 360) % 360) {
    case 90:
      return { x: r.y, y: fw - r.x - r.w, w: r.h, h: r.w }
    case 180:
      return { x: fw - r.x - r.w, y: fh - r.y - r.h, w: r.w, h: r.h }
    case 270:
      return { x: fh - r.y - r.h, y: r.x, w: r.h, h: r.w }
    default:
      return r
  }
}

// The board in the middle, fitted to the room it is given with air round it, with the canvas' hand
// on its side and Bord's zones over it as locked outlines that answer nothing.
function BoardStage({ type, zones, editing, onDeselect, label, size }: { type: ComponentTypeDef; zones: OnBoard[]; editing(scale: number): ReactNode; onDeselect(): void; label: string; size: string }) {
  const t = useT()
  const room = useRef<HTMLElement | null>(null)
  const { widthMm: w, heightMm: h } = type.physical
  const scale = useFitted(room, w, h)
  const px = PX_PER_MM * scale
  return (
    <section ref={room} className="byd-canvas-stage byd-board-stage" aria-label={label} tabIndex={0} onClick={onDeselect} style={{ ['--byd-canvas-scale' as string]: String(scale) }}>
      <div className="byd-board-sheet" style={{ width: `${w * px}px`, height: `${h * px}px` }}>
        {editing(scale)}
        {zones.map((z) => (
          <div key={z.id} className="byd-board-zone" data-board-zone={z.id} aria-hidden="true" style={{ left: `${z.x * px}px`, top: `${z.y * px}px`, width: `${z.w * px}px`, height: `${z.h * px}px` }}>
            <span>{t('board.zone.from', { name: z.name })}</span>
          </div>
        ))}
      </div>
      <p className="byd-board-foot">{size}</p>
    </section>
  )
}

// How big the board is drawn: the whole of it in the room with air round it, never larger than its
// own measure. Where nothing can be measured (a headless test, a first paint) it is drawn at a scale
// a desk's stage holds.
const AIR_PX = 32
const FOOT_PX = 32
const START = 0.25
function useFitted(room: RefObject<HTMLElement | null>, w: number, h: number): number {
  const [scale, setScale] = useState(START)
  useLayoutEffect(() => {
    const el = room.current
    if (!el) return
    const fit = () => {
      const box = el.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) return
      const next = Math.min((box.width - 2 * AIR_PX) / (w * PX_PER_MM), (box.height - 2 * AIR_PX - FOOT_PX) / (h * PX_PER_MM), 1)
      if (next > 0) setScale(Math.round(next * 1000) / 1000)
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const watching = new ResizeObserver(fit)
    watching.observe(el)
    return () => watching.disconnect()
  }, [room, w, h])
  return scale
}
