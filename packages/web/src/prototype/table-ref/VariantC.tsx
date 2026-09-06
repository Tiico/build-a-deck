// PROTOTYPE — Variant C: "Sändning". TV-läge for a wall screen three metres away: dark, large,
// one orientation. Table on top; a dock of seat panels below with hand count and last action;
// an activity feed from the log on the right; inspection as a big panel, not a popup.
import { useState } from 'react'
import type { VisibleComponentState, ZoneView } from '@byd/protocol'
import { CURSORS, SEAT_COLORS, SEAT_NAMES, TABLE, describe, hue, type Scene } from './data.js'

const S = 0.72
const px = (mm: number) => mm * S
const cx = (x: number) => px(x + TABLE.w / 2)
const cy = (y: number) => px(y + TABLE.h / 2)

export function VariantC({ scene }: { scene: Scene }) {
  const { snapshot, state, log } = scene
  const [focus, setFocus] = useState<VisibleComponentState | null>(null)
  const zoneById = new Map(snapshot.zones.map((z) => [z.id, z]))
  const lastBy = (seat: string) => [...log].reverse().find((l) => l.by === seat)

  return (
    <div style={{ background: '#0d0f14', color: '#e8eaf0', minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 340px', gridTemplateRows: '64px 1fr 150px', fontSize: 16 }}>
      <header style={{ gridColumn: '1 / 3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', borderBottom: '1px solid #232733' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>Skogens herrar <span style={{ color: '#7d8597', fontWeight: 400 }}>v0.7</span></div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <div style={{ color: '#7d8597' }}>anslut med telefon</div>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 26, letterSpacing: 6, background: '#1a1e29', padding: '4px 14px', borderRadius: 8 }}>KX7P</div>
          <div style={{ width: 44, height: 44, background: 'repeating-conic-gradient(#e8eaf0 0 25%, #0d0f14 0 50%) 0 0 / 8px 8px', borderRadius: 4 }} />
        </div>
      </header>

      <main style={{ display: 'grid', placeItems: 'center', padding: 16 }}>
        <div style={{ position: 'relative', width: px(TABLE.w), height: px(TABLE.h), borderRadius: 18, background: '#151924', border: '1px solid #262b3a' }}>
          {snapshot.zones.filter((z) => z.kind === 'area' && z.id !== 'table').map((z) => <Outline key={z.id} z={z} />)}
          {snapshot.zones.filter((z) => z.kind === 'pile').map((z) => <Pile key={z.id} z={z} snapshot={snapshot} />)}
          {snapshot.components.filter((c) => zoneById.get(c.zone)?.kind === 'area').map((c) => (
            <Card key={c.id} c={c} zone={zoneById.get(c.zone)!} focused={focus?.id === c.id} onFocus={setFocus} />
          ))}
          {CURSORS.map((p) => (
            <div key={p.seat} style={{ position: 'absolute', left: cx(p.x), top: cy(p.y), pointerEvents: 'none', transform: 'translate(-50%,-50%)' }}>
              <div style={{ width: 18, height: 18, borderRadius: 999, border: `3px solid ${SEAT_COLORS[p.seat]}`, background: 'transparent' }} />
              <div style={{ position: 'absolute', left: 22, top: -2, fontSize: 13, fontWeight: 700, color: SEAT_COLORS[p.seat] }}>{SEAT_NAMES[p.seat]}</div>
            </div>
          ))}
        </div>
      </main>

      <aside style={{ borderLeft: '1px solid #232733', display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
        <div style={{ padding: 20, borderBottom: '1px solid #232733' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, color: '#7d8597', marginBottom: 10 }}>Inspektion</div>
          <div style={{ width: 210, height: 294, borderRadius: 12, background: focus ? (focus.cardRef ? `hsl(${hue(focus.cardRef)} 40% 86%)` : '#33405a') : '#1a1e29', color: '#1c1c1c', padding: 16, boxSizing: 'border-box', display: 'grid', alignContent: 'start', border: focus ? 'none' : '1px dashed #2c3242' }}>
            {focus?.cardRef ? <><div style={{ fontWeight: 700, fontSize: 22 }}>{focus.cardRef}</div><div style={{ marginTop: 10, fontSize: 14, color: '#333' }}>Kostnad 3. När detta kort spelas: dra ett kort.</div></> : <div style={{ color: '#7d8597', fontSize: 13, alignSelf: 'center', textAlign: 'center' }}>{focus ? 'dolt kort' : 'peka på ett kort'}</div>}
          </div>
        </div>
        <div style={{ padding: 20, overflow: 'auto' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, color: '#7d8597', marginBottom: 10 }}>Senast</div>
          {[...log].reverse().slice(0, 9).map((l) => (
            <div key={l.seq} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #1a1e29', fontSize: 14 }}>
              <span style={{ color: '#4c5468', fontFamily: 'ui-monospace, monospace', width: 30 }}>{l.seq}</span>
              <span style={{ color: l.by ? SEAT_COLORS[l.by] : '#9aa3b8' }}>{describe(l)}</span>
            </div>
          ))}
        </div>
      </aside>

      <footer style={{ gridColumn: '1 / 3', display: 'grid', gridTemplateColumns: `repeat(${Object.keys(state.seats).length}, 1fr)`, gap: 14, padding: '14px 28px', borderTop: '1px solid #232733' }}>
        {Object.values(state.seats).map((s) => {
          const hand = zoneById.get(`hand:${s.id}`)
          const n = hand?.mode === 'count' ? hand.count : hand?.order.length ?? 0
          const last = lastBy(s.id)
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 14, alignItems: 'center', background: '#151924', borderRadius: 14, padding: 14, borderLeft: `6px solid ${SEAT_COLORS[s.id]}` }}>
              <div style={{ width: 56, height: 56, borderRadius: 999, background: SEAT_COLORS[s.id], display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 800 }}>{(s.name ?? s.id)[0]}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{s.name}</div>
                <div style={{ color: '#9aa3b8', fontSize: 14 }}>{n} kort på hand</div>
                <div style={{ color: '#7d8597', fontSize: 13, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{last ? describe(last) : '—'}</div>
              </div>
            </div>
          )
        })}
      </footer>
    </div>
  )
}

function Outline({ z }: { z: ZoneView }) {
  const g = z.geometry
  return (
    <div style={{ position: 'absolute', left: cx(g.x), top: cy(g.y), width: px(g.w), height: px(g.h), borderRadius: 10, border: '2px solid #2c3242', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', left: 10, top: -11, background: '#151924', padding: '0 6px', fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7d8597' }}>{z.name}</div>
    </div>
  )
}

function Pile({ z, snapshot }: { z: ZoneView; snapshot: Scene['snapshot'] }) {
  const g = z.geometry
  const n = z.mode === 'count' ? z.count : z.order.length
  const top = z.mode === 'order' ? snapshot.components.find((c) => c.id === z.order[0]) : undefined
  return (
    <div style={{ position: 'absolute', left: cx(g.x) - px(31.5), top: cy(g.y) - px(44), width: px(63), height: px(88), transform: `rotate(${g.rot}deg)` }}>
      {[3, 2, 1, 0].map((i) => (
        <div key={i} style={{ position: 'absolute', inset: 0, transform: `translate(${i * 2}px, ${-i * 2}px)`, borderRadius: 8, border: '2px solid #0d0f14', background: i === 0 && top?.cardRef ? `hsl(${hue(top.cardRef)} 40% 86%)` : '#3a4d7a' }} />
      ))}
      {top?.cardRef && <div style={{ position: 'absolute', left: 8, top: 8, fontSize: 13, fontWeight: 700, color: '#1c1c1c' }}>{top.cardRef}</div>}
      <div style={{ position: 'absolute', right: -14, top: -14, minWidth: 30, height: 30, borderRadius: 999, background: '#e8eaf0', color: '#0d0f14', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800 }}>{n}</div>
      <div style={{ position: 'absolute', left: '50%', bottom: -24, transform: 'translateX(-50%)', fontSize: 13, color: '#7d8597', letterSpacing: 1.5, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{z.dynamic ? 'hög' : z.name}</div>
    </div>
  )
}

function Card({ c, zone, focused, onFocus }: { c: VisibleComponentState; zone: ZoneView; focused: boolean; onFocus(c: VisibleComponentState): void }) {
  const g = zone.geometry
  return (
    <div
      onMouseEnter={() => onFocus(c)}
      style={{ position: 'absolute', left: cx(g.x + c.x), top: cy(g.y + c.y), width: px(63), height: px(88), transform: `rotate(${c.rot}deg)`, borderRadius: 8, boxSizing: 'border-box', padding: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: focused ? '3px solid #e8eaf0' : 'none', outlineOffset: 2, background: c.cardRef ? `hsl(${hue(c.cardRef)} 40% 86%)` : '#3a4d7a', color: '#1c1c1c', border: '2px solid #0d0f14' }}
    >
      {c.cardRef ?? ''}
    </div>
  )
}
