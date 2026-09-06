import { useEffect, useState } from 'react'
import type { Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'

export type TableMode = 'table' | 'tv'
export type TableRendererProps = { view: Snapshot; mode: TableMode; scale?: number }

// Card size in table millimetres. The type registry knows the real size; until the
// renderer reads it from there, the standard card is the only type that exists.
const CARD_MM = { w: 63, h: 88 }

export function TableRenderer({ view, mode, scale = 1 }: TableRendererProps) {
  const floor = view.zones.find((z) => z.id === view.floor)
  if (!floor) throw new Error(`floor ${view.floor} is not among the zones`)
  // Hold to inspect (K8): private to whoever holds, released on mouse-up anywhere.
  const [held, setHeld] = useState<VisibleComponentState | null>(null)
  useEffect(() => {
    if (!held) return
    const release = () => setHeld(null)
    document.addEventListener('mouseup', release)
    return () => document.removeEventListener('mouseup', release)
  }, [held])
  const zoneById = new Map(view.zones.map((z) => [z.id, z]))
  const byId = new Map(view.components.map((c) => [c.id, c]))
  const px = (mm: number) => mm * scale
  const left = (zone: ZoneView, x: number) => px(zone.geometry.x + x - floor.geometry.x)
  const top = (zone: ZoneView, y: number) => px(zone.geometry.y + y - floor.geometry.y)

  const piles = view.zones.filter((z) => z.kind === 'pile')
  const hands = view.zones.filter((z) => z.kind === 'hand')
  const seatName = (id: string | undefined) => view.seats.find((s) => s.id === id)?.name ?? id ?? ''
  const loose = view.components.filter((c) => zoneById.get(c.zone)?.kind === 'area')

  return (
    <div data-table style={{ position: 'relative', width: px(floor.geometry.w), height: px(floor.geometry.h) }}>
      {piles.map((z) => (
        <Pile
          key={z.id}
          zone={z}
          topCard={z.mode === 'order' ? byId.get(z.order[0] ?? '') : undefined}
          left={left(z, 0)}
          top={top(z, 0)}
          px={px}
        />
      ))}
      {hands.map((z) => (
        <Hand
          key={z.id}
          zone={z}
          name={seatName(z.owner)}
          rot={mode === 'table' ? edgeRotation(z, floor) : 0}
          left={left(z, z.geometry.w / 2)}
          top={top(z, z.geometry.h / 2)}
        />
      ))}
      {loose.map((c) => {
        const zone = zoneById.get(c.zone)
        if (!zone) return null
        return <Card key={c.id} c={c} left={left(zone, c.x)} top={top(zone, c.y)} px={px} onHold={setHeld} />
      })}
      {held && (
        <div data-inspect={held.id} data-face={held.cardRef === null ? 'back' : 'front'}>
          {held.cardRef ?? ''}
        </div>
      )}
    </div>
  )
}

function Card({ c, left, top, px, onHold }: { c: VisibleComponentState; left: number; top: number; px: (mm: number) => number; onHold(c: VisibleComponentState): void }) {
  const face = c.cardRef === null ? 'back' : 'front'
  return (
    <div
      data-component={c.id}
      data-face={face}
      onMouseDown={() => onHold(c)}
      style={{ position: 'absolute', left, top, width: px(CARD_MM.w), height: px(CARD_MM.h), transform: `rotate(${c.rot}deg)` }}
    >
      {c.cardRef ?? ''}
    </div>
  )
}

// A pile is a point; the stack is centred on it. A hidden pile has a count and nothing else.
function Pile({
  zone,
  topCard,
  left,
  top,
  px,
}: {
  zone: ZoneView
  topCard: VisibleComponentState | undefined
  left: number
  top: number
  px: (mm: number) => number
}) {
  const count = zone.mode === 'count' ? zone.count : zone.order.length
  return (
    <div
      data-zone={zone.id}
      data-count={count}
      data-dynamic={zone.dynamic ? 'true' : 'false'}
      style={{
        position: 'absolute',
        left: left - px(CARD_MM.w / 2),
        top: top - px(CARD_MM.h / 2),
        width: px(CARD_MM.w),
        height: px(CARD_MM.h),
        transform: `rotate(${zone.geometry.rot}deg)`,
      }}
    >
      <span>{topCard?.cardRef ?? ''}</span>
      <span>{count}</span>
      {!zone.dynamic && <span>{zone.name}</span>}
    </div>
  )
}

// In table mode a hand faces the edge it sits at, like a real player would (C5).
function edgeRotation(hand: ZoneView, floor: ZoneView): number {
  const dx = hand.geometry.x + hand.geometry.w / 2 - (floor.geometry.x + floor.geometry.w / 2)
  const dy = hand.geometry.y + hand.geometry.h / 2 - (floor.geometry.y + floor.geometry.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? -90 : 90
  return dy > 0 ? 0 : 180
}

// Other seats' hands are a fan of backs and a count; the owner reads theirs on the phone.
function Hand({ zone, name, rot, left, top }: { zone: ZoneView; name: string; rot: number; left: number; top: number }) {
  const count = zone.mode === 'count' ? zone.count : zone.order.length
  return (
    <div
      data-zone={zone.id}
      data-count={count}
      data-rot={rot}
      style={{ position: 'absolute', left, top, transform: `translate(-50%, -50%) rotate(${rot}deg)` }}
    >
      <span>{name}</span> <span>{count}</span>
    </div>
  )
}
