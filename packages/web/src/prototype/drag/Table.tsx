// PROTOTYPE — the table renderer with direct manipulation: drag loose cards, the top card of a
// pile, or a whole pile; drop into zones, onto cards, onto piles. What a drag cannot say
// (flip, rotate, shuffle, split) is left to the variant through `onTap`, `onDoubleTap`, `onHold`.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import type { Intent, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import { hue } from '../../table/hue.js'
import { seatColor } from '../../table/seatColor.js'
import { fitScale } from '../../table/fit.js'
import { zoneAt } from '../../zones.js'
import { mappingFor, type Mapping } from './geometry.js'

export const CARD_MM = { w: 63, h: 88 }
export type Mode = 'table' | 'tv'
export type Target = { kind: 'card'; id: string; zone: string } | { kind: 'pile'; id: string }
export type Props = {
  view: Snapshot
  mode: Mode
  act(intents: Intent[]): void
  selected?: ReadonlySet<string>
  onTap?(t: Target, e: { clientX: number; clientY: number; shift: boolean }): void
  onDoubleTap?(t: Target): void
  onHold?(t: Target, e: { clientX: number; clientY: number }): void
  onBackgroundTap?(): void
  holdMs?: number
  // Wheel over a card rotates it (A).
  wheelRotates?: boolean
  // Whether the pile's label is a handle for the whole pile.
  pileHandle?: boolean
  children?: ReactNode
}

type Drag = {
  target: Target | { kind: 'pileAll'; id: string }
  ids: string[] // cards moving together
  grab: { x: number; y: number } // table mm where the pointer went down
  at: { x: number; y: number } // current pointer in table mm
  started: boolean
  origin: Record<string, { x: number; y: number }> // absolute mm of each moving card at start
}

export function DragTable({ view, mode, act, selected, onTap, onDoubleTap, onHold, onBackgroundTap, holdMs = 350, wheelRotates, pileHandle, children }: Props) {
  const floor = view.zones.find((z) => z.id === view.floor)!
  const frame = useRef<HTMLDivElement | null>(null)
  const wood = useRef<HTMLDivElement | null>(null)
  const table = useRef<HTMLDivElement | null>(null)
  const [fitted, setFitted] = useState(1)
  const margin = mode === 'table' ? 80 : 44
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const update = () => setFitted(fitScale({ w: floor.geometry.w, h: floor.geometry.h }, { w: el.clientWidth, h: el.clientHeight }, margin))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [floor.geometry.w, floor.geometry.h, margin])
  const scale = fitted
  const px = (mm: number) => mm * scale
  const zoneById = new Map(view.zones.map((z) => [z.id, z]))
  const byId = new Map(view.components.map((c) => [c.id, c]))
  const absOf = (c: VisibleComponentState) => {
    const z = zoneById.get(c.zone)!
    return { x: z.geometry.x + c.x, y: z.geometry.y + c.y }
  }
  const left = (mmX: number) => px(mmX - floor.geometry.x)
  const top = (mmY: number) => px(mmY - floor.geometry.y)

  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const mapping = useRef<Mapping | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTap = useRef<{ id: string; at: number }>({ id: '', at: 0 })
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  const down = (e: RPointerEvent, target: Drag['target']) => {
    e.stopPropagation()
    if (!frame.current || !wood.current || !table.current) return
    mapping.current = mappingFor(frame.current, wood.current, table.current, mode, scale, floor.geometry)
    const at = mapping.current.toTable(e.clientX, e.clientY)
    let ids: string[] = []
    const origin: Drag['origin'] = {}
    if (target.kind === 'card') {
      ids = selected?.has(target.id) ? [...selected].filter((id) => byId.has(id)) : [target.id]
      for (const id of ids) origin[id] = absOf(byId.get(id)!)
    }
    const d: Drag = { target, ids, grab: at, at, started: false, origin }
    dragRef.current = d
    setDrag(d)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    clearHold()
    if (onHold && target.kind !== 'pileAll') {
      const t = target
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null
        if (dragRef.current && !dragRef.current.started) {
          dragRef.current = null
          setDrag(null)
          onHold(t, { clientX: e.clientX, clientY: e.clientY })
        }
      }, holdMs)
    }
  }
  const move = (e: RPointerEvent) => {
    const d = dragRef.current
    if (!d || !mapping.current) return
    const at = mapping.current.toTable(e.clientX, e.clientY)
    const started = d.started || Math.hypot(at.x - d.grab.x, at.y - d.grab.y) > 4
    if (started) clearHold()
    const next = { ...d, at, started }
    dragRef.current = next
    setDrag(next)
  }
  const up = (e: RPointerEvent) => {
    const d = dragRef.current
    clearHold()
    dragRef.current = null
    setDrag(null)
    if (!d) return
    if (!d.started) {
      if (d.target.kind === 'pileAll') return
      const now = Date.now()
      if (onDoubleTap && lastTap.current.id === d.target.id && now - lastTap.current.at < 350) {
        lastTap.current = { id: '', at: 0 }
        onDoubleTap(d.target)
        return
      }
      lastTap.current = { id: d.target.id, at: now }
      onTap?.(d.target, { clientX: e.clientX, clientY: e.clientY, shift: e.shiftKey })
      return
    }
    act(dropIntents(view, d, byId, zoneById))
  }

  const areas = view.zones.filter((z) => z.kind === 'area' && z.id !== floor.id)
  const piles = view.zones.filter((z) => z.kind === 'pile')
  const hands = view.zones.filter((z) => z.kind === 'hand')
  const loose = view.components.filter((c) => zoneById.get(c.zone)?.kind === 'area')
  const dx = drag?.started ? drag.at.x - drag.grab.x : 0
  const dy = drag?.started ? drag.at.y - drag.grab.y : 0
  const moving = new Set(drag?.started ? drag.ids : [])
  const pileDragging = drag?.started && (drag.target.kind === 'pile' || drag.target.kind === 'pileAll') ? drag.target.id : null

  return (
    <div className="byd-table-frame" data-mode={mode} ref={frame} onPointerDown={() => onBackgroundTap?.()}>
      <div className="byd-table-wood" ref={wood}>
        <div data-table ref={table} style={{ position: 'relative', width: px(floor.geometry.w), height: px(floor.geometry.h) }}>
          {areas.map((z) => (
            <div key={z.id} className="byd-zone" data-area={z.id} style={{ left: left(z.geometry.x), top: top(z.geometry.y), width: px(z.geometry.w), height: px(z.geometry.h) }}>
              <span>{z.name}</span>
            </div>
          ))}
          {piles.map((z) => {
            const topCard = z.mode === 'order' ? byId.get(z.order[0] ?? '') : undefined
            const count = z.mode === 'count' ? z.count : z.order.length
            const whole = pileDragging === z.id && drag?.target.kind === 'pileAll'
            const gx = z.geometry.x + (whole ? dx : 0)
            const gy = z.geometry.y + (whole ? dy : 0)
            const shown = pileDragging === z.id && drag?.target.kind === 'pile' ? count - 1 : count
            return (
              <div
                key={z.id}
                className="byd-pile"
                data-zone={z.id}
                data-count={count}
                data-selected={selected?.has(z.id) ? 'true' : undefined}
                style={{ position: 'absolute', left: left(gx) - px(CARD_MM.w / 2), top: top(gy) - px(CARD_MM.h / 2), width: px(CARD_MM.w), height: px(CARD_MM.h), zIndex: whole ? 50 : undefined }}
              >
                <PileTop count={shown} card={pileDragging === z.id && drag?.target.kind === 'pile' && z.mode === 'order' ? byId.get(z.order[1] ?? '') : topCard} onDown={(e) => down(e, { kind: 'pile', id: z.id })} onMove={move} onUp={up} />
                <span
                  className="byd-pile-count"
                  style={pileHandle ? { cursor: 'grab', padding: '4px 12px', border: '1px solid rgba(255,255,255,.35)' } : undefined}
                  onPointerDown={pileHandle ? (e) => down(e, { kind: 'pileAll', id: z.id }) : undefined}
                  onPointerMove={move}
                  onPointerUp={up}
                >
                  {!z.dynamic && <span>{z.name} · </span>}
                  <span>{count}</span>
                  {pileHandle && <span> ✥</span>}
                </span>
              </div>
            )
          })}
          {hands.map((z) => (
            <Hand key={z.id} zone={z} name={view.seats.find((s) => s.id === z.owner)?.name ?? z.owner ?? ''} color={seatColor(Math.max(0, view.seats.findIndex((s) => s.id === z.owner)))} rot={mode === 'table' ? edgeRotation(z, floor) : 0} left={left(z.geometry.x + z.geometry.w / 2)} top={top(z.geometry.y + z.geometry.h / 2)} />
          ))}
          {loose.map((c) => {
            const a = absOf(c)
            const m = moving.has(c.id)
            return (
              <div
                key={c.id}
                className="byd-card"
                data-component={c.id}
                data-face={c.cardRef === null ? 'back' : 'front'}
                data-selected={selected?.has(c.id) ? 'true' : undefined}
                onPointerDown={(e) => down(e, { kind: 'card', id: c.id, zone: c.zone })}
                onPointerMove={move}
                onPointerUp={up}
                onWheel={wheelRotates ? (e) => act([{ v: 'rotate', component: c.id, rot: c.rot + (e.deltaY > 0 ? 15 : -15) }]) : undefined}
                style={{
                  position: 'absolute',
                  left: left(a.x + (m ? dx : 0)),
                  top: top(a.y + (m ? dy : 0)),
                  width: px(CARD_MM.w),
                  height: px(CARD_MM.h),
                  transform: `rotate(${c.rot}deg)${m ? ' scale(1.06)' : ''}`,
                  zIndex: m ? 60 : undefined,
                  boxShadow: m ? '0 18px 30px rgba(0,0,0,.6)' : undefined,
                  touchAction: 'none',
                  ...(c.cardRef === null ? {} : { ['--hue' as string]: hue(c.cardRef) }),
                }}
              >
                <span>{c.cardRef ?? ''}</span>
              </div>
            )
          })}
          {drag?.started && drag.target.kind === 'pile' && (
            <div className="byd-card" data-face={topFace(view, drag.target.id, byId)} style={{ position: 'absolute', left: left(drag.at.x) - px(CARD_MM.w / 2), top: top(drag.at.y) - px(CARD_MM.h / 2), width: px(CARD_MM.w), height: px(CARD_MM.h), zIndex: 60, transform: 'scale(1.06)', boxShadow: '0 18px 30px rgba(0,0,0,.6)', pointerEvents: 'none', ...(hueOfTop(view, drag.target.id, byId)) }}>
              <span>{labelOfTop(view, drag.target.id, byId)}</span>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

function topOf(view: Snapshot, pileId: string, byId: Map<string, VisibleComponentState>) {
  const z = view.zones.find((x) => x.id === pileId)
  return z?.mode === 'order' ? byId.get(z.order[0] ?? '') : undefined
}
const topFace = (v: Snapshot, id: string, b: Map<string, VisibleComponentState>) => (topOf(v, id, b)?.cardRef ? 'front' : 'back')
const hueOfTop = (v: Snapshot, id: string, b: Map<string, VisibleComponentState>) => {
  const c = topOf(v, id, b)
  return c?.cardRef ? { ['--hue' as string]: hue(c.cardRef) } : {}
}
const labelOfTop = (v: Snapshot, id: string, b: Map<string, VisibleComponentState>) => topOf(v, id, b)?.cardRef ?? ''

// What a drop means (K1, K2): onto a loose card → stack; onto a pile → onto that pile; inside a
// zone rectangle → move there; anywhere else → free placement on the floor.
function dropIntents(view: Snapshot, d: Drag, byId: Map<string, VisibleComponentState>, zoneById: Map<string, ZoneView>): Intent[] {
  const floor = view.zones.find((z) => z.id === view.floor)!
  const point = d.at
  const hit = hitAt(view, point, byId, zoneById, new Set(d.ids), d.target.kind === 'pileAll' ? d.target.id : d.target.kind === 'pile' ? d.target.id : null)
  if (d.target.kind === 'pileAll') {
    const z = zoneById.get(d.target.id)!
    const dest = zoneAt(view.zones, view.floor, z.geometry.x + (d.at.x - d.grab.x), z.geometry.y + (d.at.y - d.grab.y))
    const area = zoneById.get(dest.zone)!
    const to = area.kind === 'area' ? area.id : floor.id
    return [{ v: 'movePile', pile: z.id, to, x: z.geometry.x + (d.at.x - d.grab.x), y: z.geometry.y + (d.at.y - d.grab.y) }]
  }
  if (d.target.kind === 'pile') {
    const pile = zoneById.get(d.target.id)!
    if (hit?.kind === 'pile' && hit.id !== pile.id) return [{ v: 'split', pile: pile.id, at: 1, to: hit.id }]
    // Onto a loose card: possible only when the top card's id is known (a public pile). From a
    // hidden pile the wire gives no id to stack — a finding, see NOTES.
    const topId = pile.mode === 'order' ? pile.order[0] : undefined
    if (hit?.kind === 'card' && topId) return [{ v: 'draw', from: pile.id, to: hit.zone, count: 1 }, { v: 'stack', component: topId, onto: hit.id }]
    const dest = zoneAt(view.zones, view.floor, point.x - CARD_MM.w / 2, point.y - CARD_MM.h / 2)
    const zone = zoneById.get(dest.zone)!
    if (zone.kind === 'hand') return [{ v: 'split', pile: pile.id, at: 1, to: zone.id }]
    return [{ v: 'split', pile: pile.id, at: 1, x: point.x, y: point.y }]
  }
  // cards
  const intents: Intent[] = []
  if (d.ids.length === 1 && hit?.kind === 'card') return [{ v: 'stack', component: d.ids[0]!, onto: hit.id }]
  if (hit?.kind === 'pile') return d.ids.map((id) => ({ v: 'move', component: id, to: hit.id }))
  for (const id of d.ids) {
    const o = d.origin[id]!
    const dest = zoneAt(view.zones, view.floor, o.x + (d.at.x - d.grab.x), o.y + (d.at.y - d.grab.y))
    intents.push({ v: 'move', component: id, to: dest.zone, x: dest.x, y: dest.y })
  }
  return intents
}

// The topmost loose card or the pile under a point, ignoring what is being dragged.
function hitAt(view: Snapshot, p: { x: number; y: number }, byId: Map<string, VisibleComponentState>, zoneById: Map<string, ZoneView>, ignore: Set<string>, ignorePile: string | null): Target | null {
  for (const c of [...view.components].reverse()) {
    if (ignore.has(c.id)) continue
    const z = zoneById.get(c.zone)
    if (!z || z.kind !== 'area') continue
    const ax = z.geometry.x + c.x
    const ay = z.geometry.y + c.y
    if (p.x >= ax && p.x <= ax + CARD_MM.w && p.y >= ay && p.y <= ay + CARD_MM.h) return { kind: 'card', id: c.id, zone: c.zone }
  }
  for (const z of view.zones) {
    if (z.kind !== 'pile' || z.id === ignorePile) continue
    const g = z.geometry
    if (Math.abs(p.x - g.x) <= CARD_MM.w / 2 && Math.abs(p.y - g.y) <= CARD_MM.h / 2) return { kind: 'pile', id: z.id }
  }
  void byId
  return null
}

function PileTop({ count, card, onDown, onMove, onUp }: { count: number; card: VisibleComponentState | undefined; onDown(e: RPointerEvent): void; onMove(e: RPointerEvent): void; onUp(e: RPointerEvent): void }) {
  const layers = Math.min(Math.max(count, 0), 12)
  const thickness = Array.from({ length: layers }, (_, i) => `0 ${-i * 1.2}px 0 #1f2b4a`).join(', ')
  return (
    <div
      className="byd-pile-top"
      data-face={card?.cardRef ? 'front' : 'back'}
      onPointerDown={count > 0 ? onDown : undefined}
      onPointerMove={onMove}
      onPointerUp={onUp}
      style={{ boxShadow: thickness, transform: `translateY(${-(layers - 1) * 1.2}px)`, touchAction: 'none', cursor: count > 0 ? 'grab' : 'default', ...(count === 0 ? { background: 'transparent', border: '2px dashed rgba(255,255,255,.25)' } : card?.cardRef ? { ['--hue' as string]: hue(card.cardRef) } : {}) }}
    >
      <span>{count > 0 ? card?.cardRef ?? '' : ''}</span>
    </div>
  )
}

function edgeRotation(hand: ZoneView, floor: ZoneView): number {
  const dx = hand.geometry.x + hand.geometry.w / 2 - (floor.geometry.x + floor.geometry.w / 2)
  const dy = hand.geometry.y + hand.geometry.h / 2 - (floor.geometry.y + floor.geometry.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? -90 : 90
  return dy > 0 ? 0 : 180
}

function Hand({ zone, name, color, rot, left, top }: { zone: ZoneView; name: string; color: string; rot: number; left: number; top: number }) {
  const count = zone.mode === 'count' ? zone.count : zone.order.length
  const fan = Math.min(count, 12)
  return (
    <div className="byd-hand" data-zone={zone.id} data-count={count} style={{ left, top, transform: `rotate(${rot}deg)`, ['--seat' as string]: color }}>
      <div className="byd-hand-fan">
        {Array.from({ length: fan }, (_, i) => (
          <i key={i} className="byd-back" style={{ transform: `rotate(${(i - (fan - 1) / 2) * 9}deg)` }} />
        ))}
      </div>
      <div className="byd-hand-name">
        <span>{name}</span>
        <b>{count}</b>
      </div>
    </div>
  )
}
