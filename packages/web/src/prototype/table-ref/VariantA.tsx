// PROTOTYPE — Variant A: "Planritning". Strict top-down schematic. Every zone is an outlined,
// labelled rectangle; cards are clean tiles with their name; hands are count chips.
// Optimised for reading the state, not for atmosphere.
import { useState } from 'react'
import type { VisibleComponentState, ZoneView } from '@byd/protocol'
import { CURSORS, SEAT_COLORS, SEAT_NAMES, TABLE, hue, type Scene } from './data.js'

const S = 0.9 // px per mm
const px = (mm: number) => mm * S
const cx = (x: number) => px(x + TABLE.w / 2)
const cy = (y: number) => px(y + TABLE.h / 2)

export function VariantA({ scene }: { scene: Scene }) {
  const { snapshot, state } = scene
  const [inspect, setInspect] = useState<VisibleComponentState | null>(null)
  const zoneById = new Map(snapshot.zones.map((z) => [z.id, z]))

  return (
    <div style={{ background: '#e9ebe6', minHeight: '100vh', padding: 24, color: '#1c1c1c' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', maxWidth: px(TABLE.w), margin: '0 auto 12px' }}>
        <div style={{ fontWeight: 600 }}>Skogens herrar · v0.7</div>
        <div style={{ fontSize: 13, color: '#666' }}>seq {snapshot.seq} · rumskod <b>KX7P</b></div>
      </div>
      <div style={{ position: 'relative', width: px(TABLE.w), height: px(TABLE.h), margin: '0 auto', background: '#f7f8f5', border: '1px solid #c9ccc4', borderRadius: 6, overflow: 'hidden' }}>
        {snapshot.zones.filter((z) => z.kind !== 'pile' && z.id !== 'table').map((z) => <ZoneBox key={z.id} z={z} />)}
        {snapshot.zones.filter((z) => z.kind === 'pile').map((z) => <Pile key={z.id} z={z} zoneById={zoneById} snapshot={snapshot} />)}
        {snapshot.components.filter((c) => zoneById.get(c.zone)?.kind === 'area').map((c) => (
          <Card key={c.id} c={c} zone={zoneById.get(c.zone)!} onHover={setInspect} />
        ))}
        {CURSORS.map((p) => (
          <div key={p.seat} style={{ position: 'absolute', left: cx(p.x), top: cy(p.y), transform: 'translate(-2px,-2px)', pointerEvents: 'none' }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: SEAT_COLORS[p.seat] }} />
            <div style={{ fontSize: 11, marginTop: 2, color: SEAT_COLORS[p.seat], fontWeight: 600 }}>{SEAT_NAMES[p.seat]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
        {Object.values(state.seats).map((s) => {
          const hand = zoneById.get(`hand:${s.id}`)
          const count = hand?.mode === 'count' ? hand.count : hand?.order.length ?? 0
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: '#fff', border: `2px solid ${SEAT_COLORS[s.id]}`, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={{ color: '#666' }}>{count} kort</span>
            </div>
          )
        })}
      </div>
      {inspect && (
        <div style={{ position: 'fixed', left: 24, bottom: 24, width: 189, height: 264, borderRadius: 10, background: inspect.cardRef ? `hsl(${hue(inspect.cardRef)} 45% 88%)` : '#5b6a86', border: '2px solid #333', padding: 12, boxSizing: 'border-box', boxShadow: '0 10px 30px rgba(0,0,0,.3)' }}>
          {inspect.cardRef ? <><div style={{ fontWeight: 700, fontSize: 18 }}>{inspect.cardRef}</div><div style={{ fontSize: 12, color: '#444', marginTop: 8 }}>Kostnad 3. När detta kort spelas: dra ett kort.</div></> : <div style={{ color: '#fff', textAlign: 'center', marginTop: 100 }}>dolt</div>}
        </div>
      )}
    </div>
  )
}

function ZoneBox({ z }: { z: ZoneView }) {
  const g = z.geometry
  const count = z.mode === 'count' ? z.count : z.order.length
  return (
    <div style={{ position: 'absolute', left: cx(g.x), top: cy(g.y), width: px(g.w), height: px(g.h), border: '1.5px dashed #9aa08f', borderRadius: 4, boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', left: 6, top: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#7a8070' }}>
        {z.name}{z.owner ? ` · ${SEAT_NAMES[z.owner]}` : ''}{z.kind === 'hand' ? ` · ${count}` : ''}
      </div>
    </div>
  )
}

function Pile({ z, snapshot }: { z: ZoneView; zoneById: Map<string, ZoneView>; snapshot: Scene['snapshot'] }) {
  const g = z.geometry
  const count = z.mode === 'count' ? z.count : z.order.length
  const top = z.mode === 'order' ? snapshot.components.find((c) => c.id === z.order[0]) : undefined
  return (
    <div style={{ position: 'absolute', left: cx(g.x) - px(31.5), top: cy(g.y) - px(44), width: px(63), height: px(88), transform: `rotate(${g.rot}deg)` }}>
      {[2, 1, 0].map((i) => (
        <div key={i} style={{ position: 'absolute', inset: 0, transform: `translate(${i * 2}px, ${-i * 2}px)`, borderRadius: 5, border: '1.5px solid #333', background: top?.cardRef ? `hsl(${hue(top.cardRef)} 45% 88%)` : '#5b6a86' }} />
      ))}
      {top?.cardRef && <div style={{ position: 'absolute', left: 6, top: 6, fontSize: 11, fontWeight: 700 }}>{top.cardRef}</div>}
      <div style={{ position: 'absolute', right: -8, top: -8, background: '#111', color: '#fff', borderRadius: 999, fontSize: 11, padding: '2px 7px', fontWeight: 600 }}>{count}</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: -18, textAlign: 'center', fontSize: 11, color: '#7a8070', textTransform: 'uppercase', letterSpacing: 1 }}>{z.dynamic ? 'hög' : z.name}</div>
    </div>
  )
}

function Card({ c, zone, onHover }: { c: VisibleComponentState; zone: ZoneView; onHover(c: VisibleComponentState | null): void }) {
  const g = zone.geometry
  return (
    <div
      onMouseEnter={() => onHover(c)}
      onMouseLeave={() => onHover(null)}
      style={{ position: 'absolute', left: cx(g.x + c.x), top: cy(g.y + c.y), width: px(63), height: px(88), transform: `rotate(${c.rot}deg)`, borderRadius: 5, border: '1.5px solid #333', boxSizing: 'border-box', padding: 6, fontSize: 11, fontWeight: 700, background: c.cardRef ? `hsl(${hue(c.cardRef)} 45% 88%)` : '#5b6a86', color: c.cardRef ? '#1c1c1c' : '#fff', cursor: 'pointer' }}
    >
      {c.cardRef ?? ''}
    </div>
  )
}
