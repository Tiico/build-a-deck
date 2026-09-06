// PROTOTYPE — Variant A: "Remsan" (K4 as decided). A horizontal strip of big cards, one and a
// half visible. Tap → inspect. Drag up → a sheet with zone shortcuts. Long-press → multi-select.
// The table is a slim status bar on top: zone counts, and who just did what.
import { useRef, useState } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { BODY, hue, targets } from './data.js'

export function VariantA({ view }: { view: Snapshot }) {
  const hand = view.components.filter((c) => c.zone === `hand:${view.seat}`)
  const [inspect, setInspect] = useState<VisibleComponentState | null>(null)
  const [lifted, setLifted] = useState<VisibleComponentState | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sent, setSent] = useState<string | null>(null)
  const startY = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zones = targets(view)

  return (
    <div style={{ height: '100vh', background: '#14161c', color: '#eee', display: 'grid', gridTemplateRows: '52px 1fr auto', fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderBottom: '1px solid #262a35', fontSize: 12, color: '#9aa3b8', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Cy</span>
        {zones.filter((z) => z.id !== view.floor).map((z) => (
          <span key={z.id} style={{ background: '#1f2330', borderRadius: 999, padding: '3px 9px' }}>{z.name} <b style={{ color: '#fff' }}>{z.count}</b></span>
        ))}
      </header>

      <div style={{ padding: '14px 18px', overflow: 'auto', fontSize: 13, color: '#9aa3b8' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {zones.filter((z) => z.id !== view.floor).map((z) => (
            <div key={z.id} style={{ background: '#1b1e27', borderRadius: 10, padding: 10, minHeight: 52 }}>
              <div style={{ color: '#fff', fontWeight: 600 }}>{z.name}</div>
              <div style={{ fontSize: 12 }}>{z.count} kort</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>Senast</div>
        {(sent ? [`Du skickade ett kort till ${sent}`] : []).concat(['Ada drog 1 från Draghög', 'Bo flyttade ett kort till Marknad', 'Di vände ett kort']).map((l, i) => (
          <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid #1f2330', color: i === 0 && sent ? '#7dd3a0' : undefined }}>{l}</div>
        ))}
      </div>

      <div style={{ paddingBottom: 24 }}>
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '10px 24px', scrollSnapType: 'x mandatory' }}>
          {hand.map((c) => (
            <div
              key={c.id}
              onPointerDown={(e) => {
                startY.current = e.clientY
                timer.current = setTimeout(() => {
                  setSelected((s) => new Set(s).add(c.id))
                  timer.current = null
                }, 450)
              }}
              onPointerMove={(e) => {
                if (startY.current !== null && startY.current - e.clientY > 40) {
                  if (timer.current) clearTimeout(timer.current)
                  setLifted(c)
                  startY.current = null
                }
              }}
              onPointerUp={() => {
                if (timer.current) {
                  clearTimeout(timer.current)
                  timer.current = null
                  if (startY.current !== null) setInspect(c)
                }
                startY.current = null
              }}
              style={{ flex: '0 0 62vw', aspectRatio: '63 / 88', scrollSnapAlign: 'center', borderRadius: 14, background: `hsl(${hue(c.cardRef ?? '')} 40% 86%)`, color: '#1c1c1c', padding: 16, boxSizing: 'border-box', outline: selected.has(c.id) ? '4px solid #7dd3a0' : 'none', boxShadow: '0 8px 24px rgba(0,0,0,.5)', touchAction: 'pan-x', userSelect: 'none' }}
            >
              <div style={{ fontWeight: 800, fontSize: 20 }}>{c.cardRef}</div>
              <div style={{ fontSize: 13, marginTop: 10, color: '#333', lineHeight: 1.35 }}>{BODY[c.cardRef ?? ''] ?? 'Kostnad 2.'}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#5b6478', marginTop: 6 }}>
          {selected.size > 0 ? `${selected.size} valda · dra upp för att spela` : `${hand.length} kort · tryck = titta · dra upp = spela · håll = välj flera`}
        </div>
      </div>

      {inspect && (
        <div onClick={() => setInspect(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'grid', placeItems: 'center' }}>
          <div style={{ width: '86vw', aspectRatio: '63 / 88', borderRadius: 18, background: `hsl(${hue(inspect.cardRef ?? '')} 40% 86%)`, color: '#1c1c1c', padding: 22, boxSizing: 'border-box' }}>
            <div style={{ fontWeight: 800, fontSize: 28 }}>{inspect.cardRef}</div>
            <div style={{ fontSize: 17, marginTop: 14, lineHeight: 1.4 }}>{BODY[inspect.cardRef ?? ''] ?? 'Kostnad 2.'}</div>
          </div>
        </div>
      )}

      {lifted && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', alignContent: 'end' }} onClick={() => setLifted(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1b1e27', borderRadius: '20px 20px 0 0', padding: '18px 18px 30px' }}>
            <div style={{ fontSize: 13, color: '#9aa3b8', marginBottom: 12 }}>Spela <b style={{ color: '#fff' }}>{selected.size > 1 ? `${selected.size} kort` : lifted.cardRef}</b> till</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {zones.map((z) => (
                <button key={z.id} onClick={() => { setSent(z.name); setLifted(null); setSelected(new Set()) }} style={{ padding: '16px 14px', borderRadius: 12, border: '1px solid #2c3242', background: '#242938', color: '#fff', fontSize: 16, fontWeight: 600, textAlign: 'left' }}>
                  {z.name}
                  <div style={{ fontSize: 12, color: '#9aa3b8', fontWeight: 400, marginTop: 2 }}>{z.kind === 'pile' ? `${z.count} kort · lägg överst` : 'lägg fritt'}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
