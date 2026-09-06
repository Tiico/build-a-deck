// PROTOTYPE — Variant C: "Bräde + hand". The top half is a mini table: every public zone as a
// tappable tile with its count and, for piles, the top card. The bottom half is the hand as a
// two-column grid. Tap a card, tap a tile. No gestures at all.
import { useState } from 'react'
import type { Snapshot } from '@byd/protocol'
import { BODY, hue, targets } from './data.js'

export function VariantC({ view }: { view: Snapshot }) {
  const hand = view.components.filter((c) => c.zone === `hand:${view.seat}`)
  const [picked, setPicked] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [inspect, setInspect] = useState<string | null>(null)
  const zones = targets(view)
  const topOf = (id: string) => {
    const z = view.zones.find((x) => x.id === id)
    if (!z || z.mode !== 'order') return null
    return view.components.find((c) => c.id === z.order[0])?.cardRef ?? null
  }

  return (
    <div style={{ height: '100vh', background: '#f2f0ea', color: '#1c1c1c', display: 'grid', gridTemplateRows: 'auto 1fr', fontFamily: 'system-ui' }}>
      <section style={{ padding: '54px 14px 12px', background: '#1f4a30', color: '#fff' }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{picked ? 'Välj var kortet ska' : sent ? `Skickade till ${sent}` : 'Bordet'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {zones.map((z) => (
            <button key={z.id} disabled={!picked} onClick={() => { setSent(z.name); setPicked(null) }} style={{ padding: 10, minHeight: 70, borderRadius: 10, border: picked ? '2px solid #7dd3a0' : '1px solid rgba(255,255,255,.2)', background: picked ? 'rgba(125,211,160,.15)' : 'rgba(255,255,255,.08)', color: '#fff', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>
              {z.name}
              <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400, marginTop: 4 }}>{z.kind === 'pile' ? `${z.count} kort${topOf(z.id) ? ` · ${topOf(z.id)}` : ''}` : z.count > 0 ? `${z.count} kort` : 'tom'}</div>
            </button>
          ))}
        </div>
      </section>

      <section style={{ padding: 14, overflow: 'auto' }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Din hand · {hand.length} kort {picked ? '· tryck på en zon ovanför' : '· tryck för att välja, håll för att läsa'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {hand.map((c) => (
            <div
              key={c.id}
              onClick={() => setPicked(picked === c.id ? null : c.id)}
              onContextMenu={(e) => { e.preventDefault(); setInspect(c.cardRef) }}
              style={{ aspectRatio: '63 / 88', borderRadius: 10, background: `hsl(${hue(c.cardRef ?? '')} 40% 86%)`, padding: 10, boxSizing: 'border-box', outline: picked === c.id ? '3px solid #1f4a30' : 'none', boxShadow: '0 2px 6px rgba(0,0,0,.15)', userSelect: 'none' }}
            >
              <div style={{ fontWeight: 800, fontSize: 15 }}>{c.cardRef}</div>
              <div style={{ fontSize: 11, marginTop: 6, color: '#444', lineHeight: 1.3 }}>{BODY[c.cardRef ?? ''] ?? 'Kostnad 2.'}</div>
            </div>
          ))}
        </div>
      </section>

      {inspect && (
        <div onClick={() => setInspect(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center' }}>
          <div style={{ width: '86vw', aspectRatio: '63 / 88', borderRadius: 18, background: `hsl(${hue(inspect)} 40% 86%)`, padding: 22, boxSizing: 'border-box' }}>
            <div style={{ fontWeight: 800, fontSize: 28 }}>{inspect}</div>
            <div style={{ fontSize: 17, marginTop: 14, lineHeight: 1.4 }}>{BODY[inspect] ?? 'Kostnad 2.'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
