// PROTOTYPE — Variant B: "Filtbord". Bordsläge: the screen lies on the table, seats around all
// four edges, everything oriented toward its seat. CSS perspective gives a 2.5D feel; piles have
// thickness; hands are fans of card backs at each edge; presence is a coloured fingertip.
import { useState } from 'react'
import type { VisibleComponentState, ZoneView } from '@byd/protocol'
import { CURSORS, SEAT_COLORS, SEAT_NAMES, TABLE, hue, type Scene } from './data.js'

const S = 0.85
const px = (mm: number) => mm * S
const cx = (x: number) => px(x + TABLE.w / 2)
const cy = (y: number) => px(y + TABLE.h / 2)
const SEAT_ROT: Record<string, number> = { N: 180, E: -90, S: 0, W: 90 }

export function VariantB({ scene }: { scene: Scene }) {
  const { snapshot, state } = scene
  const [held, setHeld] = useState<VisibleComponentState | null>(null)
  const zoneById = new Map(snapshot.zones.map((z) => [z.id, z]))

  return (
    <div style={{ background: 'radial-gradient(ellipse at center, #2b2420 0%, #17120f 100%)', minHeight: '100vh', display: 'grid', placeItems: 'center', overflow: 'hidden', color: '#f3e9d6' }}>
      <div style={{ perspective: 1600, perspectiveOrigin: '50% 30%' }}>
        <div style={{ position: 'relative', width: px(TABLE.w) + 60, height: px(TABLE.h) + 60, padding: 30, boxSizing: 'border-box', transform: 'rotateX(24deg)', transformStyle: 'preserve-3d', borderRadius: 28, background: 'linear-gradient(135deg,#5a3b22,#3a2414)', boxShadow: '0 40px 80px rgba(0,0,0,.6), inset 0 2px 0 rgba(255,255,255,.08)' }}>
          <div style={{ position: 'absolute', inset: 30, borderRadius: 16, background: 'radial-gradient(ellipse at 50% 40%, #2e6b46, #1f4a30 70%, #173a26)', boxShadow: 'inset 0 0 60px rgba(0,0,0,.45)' }}>
            {snapshot.zones.filter((z) => z.kind === 'area' && z.id !== 'table').map((z) => <Outline key={z.id} z={z} />)}
            {snapshot.zones.filter((z) => z.kind === 'hand').map((z) => <Fan key={z.id} z={z} />)}
            {snapshot.zones.filter((z) => z.kind === 'pile').map((z) => <Stack key={z.id} z={z} snapshot={snapshot} />)}
            {snapshot.components.filter((c) => zoneById.get(c.zone)?.kind === 'area').map((c) => (
              <Card key={c.id} c={c} zone={zoneById.get(c.zone)!} onHold={setHeld} />
            ))}
            {CURSORS.map((p) => (
              <div key={p.seat} style={{ position: 'absolute', left: cx(p.x), top: cy(p.y), pointerEvents: 'none', transform: 'translate(-50%,-50%)' }}>
                <div style={{ width: 22, height: 22, borderRadius: 999, background: SEAT_COLORS[p.seat], opacity: 0.55, boxShadow: `0 0 0 6px ${SEAT_COLORS[p.seat]}33` }} />
              </div>
            ))}
            {Object.values(state.seats).map((s) => <SeatLabel key={s.id} seat={s.id} name={s.name ?? s.id} />)}
          </div>
        </div>
      </div>
      {held && (
        <div onMouseUp={() => setHeld(null)} style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)' }}>
          <div style={{ width: 252, height: 352, borderRadius: 14, background: held.cardRef ? `hsl(${hue(held.cardRef)} 40% 86%)` : '#33405a', color: held.cardRef ? '#1c1c1c' : '#ddd', padding: 18, boxSizing: 'border-box', boxShadow: '0 30px 60px rgba(0,0,0,.6)' }}>
            {held.cardRef ? <><div style={{ fontWeight: 700, fontSize: 24 }}>{held.cardRef}</div><div style={{ marginTop: 10, fontSize: 14, color: '#333' }}>Kostnad 3. När detta kort spelas: dra ett kort.</div></> : <div style={{ textAlign: 'center', marginTop: 140 }}>baksida</div>}
          </div>
        </div>
      )}
      <div style={{ position: 'fixed', top: 14, left: 18, fontSize: 13, opacity: 0.7 }}>Skogens herrar · v0.7 · KX7P</div>
    </div>
  )
}

function Outline({ z }: { z: ZoneView }) {
  const g = z.geometry
  return (
    <div style={{ position: 'absolute', left: cx(g.x), top: cy(g.y), width: px(g.w), height: px(g.h), borderRadius: 10, border: '2px solid rgba(255,255,255,.18)', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', left: 8, top: 4, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>{z.name}</div>
    </div>
  )
}

function Fan({ z }: { z: ZoneView }) {
  const g = z.geometry
  const n = z.mode === 'count' ? z.count : z.order.length
  const rot = SEAT_ROT[z.owner ?? 'S'] ?? 0
  return (
    <div style={{ position: 'absolute', left: cx(g.x + g.w / 2), top: cy(g.y + g.h / 2), transform: `translate(-50%,-50%) rotate(${rot}deg)` }}>
      <div style={{ position: 'relative', width: 0, height: 0 }}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: -px(31.5), top: -px(30), width: px(63), height: px(88), borderRadius: 6, background: 'repeating-linear-gradient(45deg,#3a4d7a,#3a4d7a 4px,#2f4068 4px,#2f4068 8px)', border: '2px solid #1f2b4a', transformOrigin: '50% 140%', transform: `rotate(${(i - (n - 1) / 2) * 9}deg)`, boxShadow: '0 2px 4px rgba(0,0,0,.4)' }} />
        ))}
        <div style={{ position: 'absolute', left: -14, top: px(58), background: 'rgba(0,0,0,.55)', borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{n}</div>
      </div>
    </div>
  )
}

function Stack({ z, snapshot }: { z: ZoneView; snapshot: Scene['snapshot'] }) {
  const g = z.geometry
  const n = z.mode === 'count' ? z.count : z.order.length
  const top = z.mode === 'order' ? snapshot.components.find((c) => c.id === z.order[0]) : undefined
  const layers = Math.min(n, 12)
  return (
    <div style={{ position: 'absolute', left: cx(g.x) - px(31.5), top: cy(g.y) - px(44), width: px(63), height: px(88), transform: `rotate(${g.rot}deg)` }}>
      {Array.from({ length: layers }, (_, i) => (
        <div key={i} style={{ position: 'absolute', inset: 0, transform: `translateY(${-i * 1.2}px)`, borderRadius: 6, border: '1px solid #1f2b4a', background: i === layers - 1 && top?.cardRef ? `hsl(${hue(top.cardRef)} 40% 86%)` : 'repeating-linear-gradient(45deg,#3a4d7a,#3a4d7a 4px,#2f4068 4px,#2f4068 8px)' }} />
      ))}
      {top?.cardRef && <div style={{ position: 'absolute', left: 6, top: 6 - (layers - 1) * 1.2, fontSize: 11, fontWeight: 700, color: '#1c1c1c' }}>{top.cardRef}</div>}
      <div style={{ position: 'absolute', left: '50%', bottom: -22, transform: 'translateX(-50%)', background: 'rgba(0,0,0,.55)', borderRadius: 999, padding: '2px 8px', fontSize: 12, whiteSpace: 'nowrap' }}>{z.dynamic ? '' : z.name + ' · '}{n}</div>
    </div>
  )
}

function Card({ c, zone, onHold }: { c: VisibleComponentState; zone: ZoneView; onHold(c: VisibleComponentState | null): void }) {
  const g = zone.geometry
  return (
    <div
      onMouseDown={() => onHold(c)}
      style={{ position: 'absolute', left: cx(g.x + c.x), top: cy(g.y + c.y), width: px(63), height: px(88), transform: `rotate(${c.rot}deg)`, borderRadius: 6, boxSizing: 'border-box', padding: 7, fontSize: 11, fontWeight: 700, cursor: 'grab', boxShadow: '0 3px 6px rgba(0,0,0,.45)', border: c.cardRef ? '1px solid rgba(0,0,0,.35)' : '2px solid #1f2b4a', background: c.cardRef ? `hsl(${hue(c.cardRef)} 40% 86%)` : 'repeating-linear-gradient(45deg,#3a4d7a,#3a4d7a 4px,#2f4068 4px,#2f4068 8px)', color: '#1c1c1c' }}
    >
      {c.cardRef ?? ''}
    </div>
  )
}

function SeatLabel({ seat, name }: { seat: string; name: string }) {
  const pos: Record<string, React.CSSProperties> = {
    N: { top: 6, left: '50%', transform: 'translateX(-50%) rotate(180deg)' },
    S: { bottom: 6, left: '50%', transform: 'translateX(-50%)' },
    E: { right: 6, top: '50%', transform: 'translateY(-50%) rotate(-90deg)' },
    W: { left: 6, top: '50%', transform: 'translateY(-50%) rotate(90deg)' },
  }
  return <div style={{ position: 'absolute', ...pos[seat], padding: '3px 10px', borderRadius: 999, background: SEAT_COLORS[seat], color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{name}</div>
}
