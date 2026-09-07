// PROTOTYPE — the setup editor (B5, K2): /prototype/setup?variant=A|B|C. Question: how does a
// designer lay out the table — zones, seats, hands, piles, counters — and see what players get?
// Every variant edits the same setup and shows it on the real table renderer.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { TableRenderer, type TableHandle } from '../../table/TableRenderer.js'
import { Switcher } from './Switcher.js'
import { point, recipe, rect, tableOf, type Setup, type Zone } from './model.js'
import '../../table/table.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Lista med mått, bordet bredvid' },
  { key: 'B', name: 'Bordet är arbetsytan: dra och ändra storlek' },
  { key: 'C', name: 'Recept: några rattar, geometrin följer' },
]
type Ctx = { setup: Setup; set(next: Setup): void; patchZone(id: string, patch: Partial<Zone> | ((z: Zone) => Zone)): void; removeZone(id: string): void; addZone(kind: 'pile' | 'area'): void }

function withOwner(z: Zone, owner: string): Zone {
  const { owner: _o, ...rest } = z
  return owner ? { ...rest, owner } : rest
}

export function SetupPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [setup, set] = useState<Setup>(() => recipe(3, { mine: true, discard: true, market: true, counters: [{ name: 'Poäng', start: 0 }] }))
  const ctx: Ctx = {
    setup,
    set,
    patchZone: (id, patch) => set({ ...setup, zones: setup.zones.map((z) => (z.id === id ? (typeof patch === 'function' ? patch(z) : { ...z, ...patch }) : z)) }),
    removeZone: (id) => set({ ...setup, zones: setup.zones.filter((z) => z.id !== id) }),
    addZone: (kind) => {
      const n = setup.zones.filter((z) => z.id.startsWith('ny-')).length + 1
      set({ ...setup, zones: [...setup.zones, kind === 'pile' ? { id: `ny-${n}`, kind, name: `Hög ${n}`, visibility: 'all', geometry: point(0, 150) } : { id: `ny-${n}`, kind, name: `Yta ${n}`, visibility: 'all', geometry: rect(-150, 100, 300, 120) }] })
    },
  }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  const view = tableOf(setup)
  return (
    <div className="ps-stage">
      <div className="ps-state">
        <span>zoner <b>{setup.zones.length}</b> · platser <b>{setup.seats.length}</b> · räknare <b>{setup.counters.map((c) => c.name).join(', ') || '—'}</b></span>
        <span style={{ marginLeft: 'auto' }}>{view ? 'setupen är giltig' : 'setupen är ogiltig'}</span>
      </div>
      <V {...ctx} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

// The table as the screen would show it, from the setup.
function Preview({ setup, children, tableRef }: { setup: Setup; children?: React.ReactNode; tableRef?: React.RefObject<TableHandle | null> }) {
  const view = tableOf(setup)
  return (
    <div className="ps-preview">
      {view ? <TableRenderer ref={tableRef} view={view} mode="tv" /> : <p className="ps-invalid">Setupen går inte att bygga: golvet måste vara en area och varje hand behöver ägare och återlämningshög.</p>}
      {children}
    </div>
  )
}

// ---------- A — a list with numbers, the table beside ----------
// Every zone is a row: kind, name, owner, visibility, and x/y/w/h in millimetres. Seats and
// counters are small lists above. The table redraws on every keystroke.
function VariantA(ctx: Ctx) {
  const { setup } = ctx
  const num = (z: Zone, key: 'x' | 'y' | 'w' | 'h') => (
    <input type="number" aria-label={`${key} för ${z.name}`} value={z.geometry[key]} onChange={(e) => ctx.patchZone(z.id, { geometry: { ...z.geometry, [key]: Number(e.target.value) } })} />
  )
  return (
    <div className="ps-a">
      <div className="ps-form">
        <section>
          <h2>Platser</h2>
          <div className="ps-row">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} type="button" aria-pressed={setup.seats.length === n} onClick={() => ctx.set(recipe(n, { mine: setup.zones.some((z) => z.id.startsWith('mine:')), discard: setup.zones.some((z) => z.id === 'discard'), market: setup.zones.some((z) => z.id === 'market'), counters: setup.counters }))}>{n}</button>
            ))}
            <span className="ps-hint">antalet lägger ut händer, ytor och räknare på nytt</span>
          </div>
        </section>
        <section>
          <h2>Räknare per plats</h2>
          {setup.counters.map((c, i) => (
            <div key={i} className="ps-row">
              <input value={c.name} onChange={(e) => ctx.set({ ...setup, counters: setup.counters.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input type="number" value={c.start} onChange={(e) => ctx.set({ ...setup, counters: setup.counters.map((x, j) => (j === i ? { ...x, start: Number(e.target.value) } : x)) })} />
              <button type="button" onClick={() => ctx.set({ ...setup, counters: setup.counters.filter((_, j) => j !== i) })}>Ta bort</button>
            </div>
          ))}
          <button type="button" onClick={() => ctx.set({ ...setup, counters: [...setup.counters, { name: 'Liv', start: 20 }] })}>＋ Räknare</button>
        </section>
        <section>
          <h2>Zoner</h2>
          <table className="ps-table">
            <thead><tr><th>slag</th><th>namn</th><th>ägare</th><th>syns för</th><th>x</th><th>y</th><th>b</th><th>h</th><th /></tr></thead>
            <tbody>
              {setup.zones.map((z) => (
                <tr key={z.id} data-zone-row={z.id}>
                  <td><select value={z.kind} onChange={(e) => ctx.patchZone(z.id, { kind: e.target.value as Zone['kind'] })}><option value="area">area</option><option value="pile">hög</option><option value="hand">hand</option></select></td>
                  <td><input value={z.name} onChange={(e) => ctx.patchZone(z.id, { name: e.target.value })} /></td>
                  <td><select value={z.owner ?? ''} onChange={(e) => ctx.patchZone(z.id, (cur) => withOwner(cur, e.target.value))}><option value="">—</option>{setup.seats.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                  <td><select value={z.visibility} onChange={(e) => ctx.patchZone(z.id, { visibility: e.target.value as Zone['visibility'] })}><option value="all">alla</option><option value="owner">ägaren</option><option value="none">ingen</option></select></td>
                  <td>{num(z, 'x')}</td><td>{num(z, 'y')}</td>
                  <td>{z.kind === 'pile' ? '·' : num(z, 'w')}</td><td>{z.kind === 'pile' ? '·' : num(z, 'h')}</td>
                  <td>{z.id !== setup.floor && <button type="button" onClick={() => ctx.removeZone(z.id)}>×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ps-row"><button type="button" onClick={() => ctx.addZone('area')}>＋ Yta</button><button type="button" onClick={() => ctx.addZone('pile')}>＋ Hög</button></div>
        </section>
      </div>
      <Preview setup={setup} />
      <p className="ps-foot">A · varje zon är en rad med mått i millimeter · bordet ritas om vid varje tangenttryck</p>
    </div>
  )
}

// ---------- B — the table is the workspace ----------
// Zones as handles on the table itself: drag to move, corners to resize, click to select and
// name it in a small panel. Seats stand at the edges. Numbers are never typed.
function VariantB(ctx: Ctx) {
  const { setup } = ctx
  const [selected, setSelected] = useState<string | null>(null)
  const tableRef = useRef<TableHandle | null>(null)
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; start: { x: number; y: number }; geometry: Zone['geometry'] } | null>(null)
  const floor = setup.zones.find((z) => z.id === setup.floor)!
  // Where the felt sits inside the canvas, in pixels, and how many pixels a millimetre is.
  const [fit, setFit] = useState({ left: 0, top: 0, scale: 0.5 })
  const host = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const canvas = host.current
    const el = canvas?.querySelector('[data-table]') as HTMLElement | null
    if (!canvas || !el) return
    const update = () => {
      const c = canvas.getBoundingClientRect()
      const t = el.getBoundingClientRect()
      setFit({ left: t.left - c.left, top: t.top - c.top, scale: t.width / floor.geometry.w })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [floor.geometry.w, setup.zones.length])
  const { scale } = fit
  const toMm = (e: RPointerEvent) => tableRef.current?.toTable(e.clientX, e.clientY) ?? { x: 0, y: 0 }
  const down = (e: RPointerEvent, z: Zone, mode: 'move' | 'resize') => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { id: z.id, mode, start: toMm(e), geometry: { ...z.geometry } }
    setSelected(z.id)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toMm(e)
    const dx = Math.round((p.x - d.start.x) / 5) * 5
    const dy = Math.round((p.y - d.start.y) / 5) * 5
    ctx.patchZone(d.id, { geometry: d.mode === 'move' ? { ...d.geometry, x: d.geometry.x + dx, y: d.geometry.y + dy } : { ...d.geometry, w: Math.max(40, d.geometry.w + dx), h: Math.max(40, d.geometry.h + dy) } })
  }
  const up = () => (drag.current = null)
  const table = tableOf(setup)
  const sel = setup.zones.find((z) => z.id === selected)
  return (
    <div className="ps-b">
      <div className="ps-b-tools">
        <button type="button" onClick={() => ctx.addZone('area')}>＋ Yta</button>
        <button type="button" onClick={() => ctx.addZone('pile')}>＋ Hög</button>
        <span className="ps-hint">dra en zon för att flytta · dra hörnet för att ändra storlek · klicka för att namnge</span>
      </div>
      <div className="ps-canvas" ref={host} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {table && <TableRenderer ref={tableRef} view={table} mode="tv" />}
        <div className="ps-overlay" style={{ left: fit.left, top: fit.top, width: floor.geometry.w * scale, height: floor.geometry.h * scale }}>
          {setup.zones.filter((z) => z.id !== setup.floor).map((z) => {
            const g = z.geometry
            const w = z.kind === 'pile' ? 63 : g.w
            const h = z.kind === 'pile' ? 88 : g.h
            const x = z.kind === 'pile' ? g.x - 31.5 : g.x
            const y = z.kind === 'pile' ? g.y - 44 : g.y
            return (
              <div key={z.id} className="ps-handle" data-kind={z.kind} data-selected={selected === z.id ? 'true' : undefined} style={{ left: (x - floor.geometry.x) * scale, top: (y - floor.geometry.y) * scale, width: w * scale, height: h * scale }} onPointerDown={(e) => down(e, z, 'move')}>
                <span>{z.name}{z.owner ? ` · ${z.owner}` : ''}</span>
                {z.kind !== 'pile' && <i className="ps-corner" onPointerDown={(e) => down(e, z, 'resize')} />}
              </div>
            )
          })}
        </div>
        {sel && (
          <div className="ps-props">
            <strong>{sel.kind === 'pile' ? 'Hög' : sel.kind === 'hand' ? 'Hand' : 'Yta'}</strong>
            <label>Namn<input value={sel.name} onChange={(e) => ctx.patchZone(sel.id, { name: e.target.value })} /></label>
            <label>Ägare<select value={sel.owner ?? ''} onChange={(e) => ctx.patchZone(sel.id, (cur) => withOwner(cur, e.target.value))}><option value="">ingen</option>{setup.seats.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label>Syns för<select value={sel.visibility} onChange={(e) => ctx.patchZone(sel.id, { visibility: e.target.value as Zone['visibility'] })}><option value="all">alla</option><option value="owner">ägaren</option><option value="none">ingen</option></select></label>
            <label>Genväg<input value={sel.shortcut?.label ?? ''} placeholder={sel.name} onChange={(e) => ctx.patchZone(sel.id, (cur) => { const { shortcut: _s, ...rest } = cur; return e.target.value ? { ...rest, shortcut: { label: e.target.value, at: cur.shortcut?.at ?? 'top' } } : rest })} /></label>
            <span className="ps-hint">{Math.round(sel.geometry.x)}, {Math.round(sel.geometry.y)}{sel.kind !== 'pile' ? ` · ${Math.round(sel.geometry.w)} × ${Math.round(sel.geometry.h)} mm` : ''}</span>
            {sel.id !== setup.floor && <button type="button" onClick={() => { ctx.removeZone(sel.id); setSelected(null) }}>Ta bort zonen</button>}
          </div>
        )}
      </div>
      <p className="ps-foot">B · bordet är arbetsytan · zoner som handtag ovanpå den riktiga renderaren · egenskaper i ett litet fönster</p>
    </div>
  )
}

// ---------- C — a recipe ----------
// No geometry at all: how many players, what every seat gets, what the table has in common,
// and the counters. The layout follows from the recipe, as it does in the wizard today.
function VariantC(ctx: Ctx) {
  const { setup } = ctx
  const has = (id: string) => setup.zones.some((z) => z.id === id || z.id.startsWith(`${id}:`))
  const rebuild = (patch: Partial<{ players: number; mine: boolean; discard: boolean; market: boolean; counters: { name: string; start: number }[] }>) => {
    const players = patch.players ?? setup.seats.length
    ctx.set(recipe(players, { mine: patch.mine ?? has('mine'), discard: patch.discard ?? has('discard'), market: patch.market ?? has('market'), counters: patch.counters ?? setup.counters }))
  }
  return (
    <div className="ps-c">
      <div className="ps-recipe">
        <section>
          <h2>Spelare</h2>
          <div className="ps-row">{[1, 2, 3, 4, 5, 6].map((n) => <button key={n} type="button" aria-pressed={setup.seats.length === n} onClick={() => rebuild({ players: n })}>{n}</button>)}</div>
        </section>
        <section>
          <h2>Varje spelare har</h2>
          <label><input type="checkbox" checked disabled /> en hand</label>
          <label><input type="checkbox" checked={has('mine')} onChange={(e) => rebuild({ mine: e.target.checked })} /> en yta framför sig, bara egna ögon</label>
          <div className="ps-sub">
            <span>räknare</span>
            {setup.counters.map((c, i) => (
              <div key={i} className="ps-row">
                <input value={c.name} onChange={(e) => rebuild({ counters: setup.counters.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <span>från</span>
                <input type="number" value={c.start} onChange={(e) => rebuild({ counters: setup.counters.map((x, j) => (j === i ? { ...x, start: Number(e.target.value) } : x)) })} />
                <button type="button" onClick={() => rebuild({ counters: setup.counters.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => rebuild({ counters: [...setup.counters, { name: 'Liv', start: 20 }] })}>＋ Räknare</button>
          </div>
        </section>
        <section>
          <h2>Gemensamt på bordet</h2>
          <label><input type="checkbox" checked disabled /> en dold draghög</label>
          <label><input type="checkbox" checked={has('discard')} onChange={(e) => rebuild({ discard: e.target.checked })} /> en öppen kasthög</label>
          <label><input type="checkbox" checked={has('market')} onChange={(e) => rebuild({ market: e.target.checked })} /> en marknad, öppen yta i mitten</label>
        </section>
        <p className="ps-hint">Behöver spelet mer än så, som fler ytor eller egna mått, är det receptets gräns: då krävs A eller B.</p>
      </div>
      <Preview setup={setup} />
      <p className="ps-foot">C · inga mått · receptet bestämmer, geometrin följer · samma som wizarden, fast här och efteråt</p>
    </div>
  )
}
