import { useEffect, useRef, useState } from 'react'
import type { Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import { hue } from './hue.js'
import { seatColor } from './seatColor.js'
import { fitScale } from './fit.js'

export type TableMode = 'table' | 'tv'
// Without an explicit `scale`, the renderer fits the table to its own frame.
// `faces` is the HTTP origin that serves /faces/:hash; without it cards are plain colours.
export type TableRendererProps = { view: Snapshot; mode: TableMode; scale?: number; faces?: string | undefined }

// Card size in table millimetres. The type registry knows the real size; until the
// renderer reads it from there, the standard card is the only type that exists.
const CARD_MM = { w: 63, h: 88 }
const FAN_MAX = 12

export function TableRenderer({ view, mode, scale: fixedScale, faces }: TableRendererProps) {
  const floor = view.zones.find((z) => z.id === view.floor)
  if (!floor) throw new Error(`floor ${view.floor} is not among the zones`)
  const frame = useRef<HTMLDivElement | null>(null)
  const [fitted, setFitted] = useState(1)
  const margin = mode === 'table' ? 80 : 44
  useEffect(() => {
    const el = frame.current
    if (fixedScale !== undefined || !el || typeof ResizeObserver === 'undefined') return
    const update = () => setFitted(fitScale({ w: floor.geometry.w, h: floor.geometry.h }, { w: el.clientWidth, h: el.clientHeight }, margin))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fixedScale, floor.geometry.w, floor.geometry.h, margin])
  const scale = fixedScale ?? fitted
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
  const seatIndex = (id: string | undefined) => Math.max(0, view.seats.findIndex((s) => s.id === id))
  const seatName = (id: string | undefined) => view.seats.find((s) => s.id === id)?.name ?? id ?? ''

  const areas = view.zones.filter((z) => z.kind === 'area' && z.id !== floor.id)
  const piles = view.zones.filter((z) => z.kind === 'pile')
  const hands = view.zones.filter((z) => z.kind === 'hand')
  const loose = view.components.filter((c) => zoneById.get(c.zone)?.kind === 'area')

  return (
    <div className="byd-table-frame" data-mode={mode} ref={frame}>
      <div className="byd-table-wood">
        <div data-table style={{ position: 'relative', width: px(floor.geometry.w), height: px(floor.geometry.h) }}>
          {areas.map((z) => (
            <div
              key={z.id}
              className="byd-zone"
              data-area={z.id}
              style={{ left: left(z, 0), top: top(z, 0), width: px(z.geometry.w), height: px(z.geometry.h) }}
            >
              <span>{z.name}</span>
            </div>
          ))}
          {piles.map((z) => (
            <Pile
              key={z.id}
              zone={z}
              topCard={z.mode === 'order' ? byId.get(z.order[0] ?? '') : undefined}
              faces={faces}
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
              color={seatColor(seatIndex(z.owner))}
              rot={mode === 'table' ? edgeRotation(z, floor) : 0}
              left={left(z, z.geometry.w / 2)}
              top={top(z, z.geometry.h / 2)}
            />
          ))}
          {loose.map((c) => {
            const zone = zoneById.get(c.zone)
            if (!zone) return null
            return <Card key={c.id} c={c} left={left(zone, c.x)} top={top(zone, c.y)} px={px} onHold={setHeld} src={textureUrl(faces, c)} />
          })}
        </div>
      </div>
      {held && (
        <div className="byd-inspect">
          <div
            data-inspect={held.id}
            data-face={held.cardRef === null ? 'back' : 'front'}
            style={held.cardRef === null ? undefined : { ['--hue' as string]: hue(held.cardRef) }}
          >
            {held.cardRef ?? ''}
          </div>
        </div>
      )}
    </div>
  )
}

// A texture that may not exist yet: the server answers 202 while the render job is queued, the
// browser reports that as an error, and this tries again with growing pauses, a bounded number
// of times. The query only busts the cache; the hash is the identity.
const RETRY_MS = 1500
const RETRY_MAX = 8
function Texture({ src }: { src: string }) {
  const [attempt, setAttempt] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const onError = () => {
    if (attempt >= RETRY_MAX || timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      setAttempt((a) => a + 1)
    }, RETRY_MS * (attempt + 1))
  }
  return <img src={attempt === 0 ? src : `${src}?retry=${attempt}`} alt="" draggable={false} onError={onError} />
}

// The texture to show: the front when its hash is known (the seat may see it), else the back.
function textureUrl(faces: string | undefined, c: VisibleComponentState): string | undefined {
  if (!faces || !c.faces) return undefined
  const hash = c.cardRef !== null ? c.faces['front'] : c.faces['back']
  return hash ? `${faces}/faces/${hash}` : undefined
}

function Card({
  c,
  left,
  top,
  px,
  onHold,
  src,
}: {
  c: VisibleComponentState
  left: number
  top: number
  px: (mm: number) => number
  onHold(c: VisibleComponentState): void
  src?: string | undefined
}) {
  const face = c.cardRef === null ? 'back' : 'front'
  return (
    <div
      className="byd-card"
      data-component={c.id}
      data-face={face}
      onMouseDown={() => onHold(c)}
      style={{
        position: 'absolute',
        left,
        top,
        width: px(CARD_MM.w),
        height: px(CARD_MM.h),
        transform: `rotate(${c.rot}deg)`,
        ...(c.cardRef === null ? {} : { ['--hue' as string]: hue(c.cardRef) }),
      }}
    >
      {src && <Texture src={src} />}
      <span>{c.cardRef ?? ''}</span>
    </div>
  )
}

// A pile is a point; the stack is centred on it. A hidden pile has a count and nothing else.
function Pile({
  zone,
  topCard,
  faces,
  left,
  top,
  px,
}: {
  zone: ZoneView
  topCard: VisibleComponentState | undefined
  faces: string | undefined
  left: number
  top: number
  px: (mm: number) => number
}) {
  const src = topCard ? textureUrl(faces, topCard) : undefined
  const count = zone.mode === 'count' ? zone.count : zone.order.length
  const layers = Math.min(count, 12)
  const thickness = Array.from({ length: layers }, (_, i) => `0 ${-i * 1.2}px 0 #1f2b4a`).join(', ')
  return (
    <div
      className="byd-pile"
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
      <div
        className="byd-pile-top"
        data-face={topCard?.cardRef ? 'front' : 'back'}
        style={{
          boxShadow: thickness,
          transform: `translateY(${-(layers - 1) * 1.2}px)`,
          ...(topCard?.cardRef ? { ['--hue' as string]: hue(topCard.cardRef) } : {}),
        }}
      >
        {src && <Texture src={src} />}
        <span>{topCard?.cardRef ?? ''}</span>
      </div>
      <span className="byd-pile-count">
        {!zone.dynamic && <span>{zone.name} · </span>}
        <span>{count}</span>
      </span>
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
function Hand({
  zone,
  name,
  color,
  rot,
  left,
  top,
}: {
  zone: ZoneView
  name: string
  color: string
  rot: number
  left: number
  top: number
}) {
  const count = zone.mode === 'count' ? zone.count : zone.order.length
  const fan = Math.min(count, FAN_MAX)
  return (
    <div
      className="byd-hand"
      data-zone={zone.id}
      data-count={count}
      data-rot={rot}
      style={{ left, top, transform: `rotate(${rot}deg)`, ['--seat' as string]: color }}
    >
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
