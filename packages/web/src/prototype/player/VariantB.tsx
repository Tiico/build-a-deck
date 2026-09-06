// PROTOTYPE — Variant B: "Kortlek i handen". One card fills the screen; swipe sideways to
// thumb through the hand, swipe up to play (same zone sheet). A thumbnail row shows the whole
// hand and jumps. Maximum readability, minimum overview.
import { useRef, useState } from 'react'
import type { Snapshot } from '@byd/protocol'
import { BODY, hue, targets } from './data.js'

export function VariantB({ view }: { view: Snapshot }) {
  const hand = view.components.filter((c) => c.zone === `hand:${view.seat}`)
  const [i, setI] = useState(0)
  const [sheet, setSheet] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const card = hand[i]!
  const zones = targets(view)

  return (
    <div
      onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        if (!start.current) return
        const dx = e.clientX - start.current.x
        const dy = e.clientY - start.current.y
        start.current = null
        if (dy < -60 && Math.abs(dx) < 60) setSheet(true)
        else if (dx > 50) setI((v) => Math.max(0, v - 1))
        else if (dx < -50) setI((v) => Math.min(hand.length - 1, v + 1))
      }}
      style={{ height: '100vh', background: `radial-gradient(circle at 50% 20%, hsl(${hue(card.cardRef ?? '')} 30% 22%), #0e1014)`, color: '#eee', display: 'grid', gridTemplateRows: '44px 1fr auto', fontFamily: 'system-ui', touchAction: 'none', userSelect: 'none' }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', fontSize: 12, color: '#9aa3b8' }}>
        <span><b style={{ color: '#fff', fontSize: 14 }}>Cy</b> · {hand.length} kort</span>
        <span>{sent ? <span style={{ color: '#7dd3a0' }}>→ {sent}</span> : `${i + 1} / ${hand.length}`}</span>
      </header>

      <div style={{ display: 'grid', placeItems: 'center', padding: '0 22px' }}>
        <div style={{ width: '100%', aspectRatio: '63 / 88', borderRadius: 20, background: `hsl(${hue(card.cardRef ?? '')} 40% 86%)`, color: '#1c1c1c', padding: 24, boxSizing: 'border-box', boxShadow: '0 30px 60px rgba(0,0,0,.6)' }}>
          <div style={{ fontWeight: 800, fontSize: 30 }}>{card.cardRef}</div>
          <div style={{ fontSize: 18, marginTop: 16, lineHeight: 1.4 }}>{BODY[card.cardRef ?? ''] ?? 'Kostnad 2.'}</div>
          <div style={{ position: 'relative', top: 'calc(100% - 200px)', fontSize: 12, color: '#555', textAlign: 'center' }}>svep upp för att spela</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '10px 16px 26px' }}>
        {hand.map((c, k) => (
          <div key={c.id} onClick={() => setI(k)} style={{ width: 40, height: 56, borderRadius: 6, background: `hsl(${hue(c.cardRef ?? '')} 40% 86%)`, opacity: k === i ? 1 : 0.5, transform: k === i ? 'translateY(-6px)' : 'none', border: k === i ? '2px solid #fff' : '2px solid transparent' }} />
        ))}
      </div>

      {sheet && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', alignContent: 'end' }} onClick={() => setSheet(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1b1e27', borderRadius: '20px 20px 0 0', padding: '18px 18px 30px' }}>
            <div style={{ fontSize: 13, color: '#9aa3b8', marginBottom: 12 }}>Spela <b style={{ color: '#fff' }}>{card.cardRef}</b> till</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {zones.map((z) => (
                <button key={z.id} onClick={() => { setSent(z.name); setSheet(false) }} style={{ padding: '16px', borderRadius: 12, border: '1px solid #2c3242', background: '#242938', color: '#fff', fontSize: 17, fontWeight: 600, textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{z.name}</span><span style={{ color: '#9aa3b8', fontWeight: 400 }}>{z.kind === 'pile' ? `${z.count}` : ''}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
