// PROTOTYPE — editing the template on the canvas, on /prototype/canvas?variant=A|B|C. Question:
// how does a designer add elements and move them with the mouse and the arrow keys, as in an
// image editor? Boxes stand in for elements; positions are millimetres on a 63×88 card.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Switcher } from './Switcher.js'
import '../../editor/editor.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Verktygsrad till vänster, handtag, hjälplinjer, piltangenter' },
  { key: 'B', name: '+ Element-meny, egenskaper med steg, dra fritt' },
  { key: 'C', name: 'Rutnät med snäpp och lagerpanel som drar om ordningen' },
]
type El = { id: string; kind: 'text' | 'image' | 'icons' | 'shape'; x: number; y: number; w: number; h: number; label: string }
const START: El[] = [
  { id: 'frame', kind: 'shape', x: 1, y: 1, w: 61, h: 86, label: '' },
  { id: 'art', kind: 'image', x: 5, y: 5, w: 53, h: 30, label: 'bild' },
  { id: 'cost', kind: 'text', x: 50, y: 4, w: 10, h: 10, label: '5' },
  { id: 'title', kind: 'text', x: 5, y: 38, w: 53, h: 8, label: 'Drake' },
  { id: 'icons', kind: 'icons', x: 5, y: 47, w: 30, h: 5, label: '● ● ●' },
  { id: 'body', kind: 'text', x: 5, y: 54, w: 53, h: 28, label: 'När detta kort spelas: dra ett kort.' },
]
const SCALE = 6 // px per mm
const SNAP = 1

function useCanvas(snap: number) {
  const [els, setEls] = useState<El[]>(START)
  const [sel, setSel] = useState<string | null>('title')
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; mode: 'move' | 'resize' } | null>(null)
  const round = (v: number) => Math.round(v / snap) * snap
  const down = (e: RPointerEvent, id: string, mode: 'move' | 'resize' = 'move') => {
    e.stopPropagation()
    const el = els.find((x) => x.id === id)!
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: mode === 'move' ? el.x : el.w, oy: mode === 'move' ? el.y : el.h, mode }
    setSel(id)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.sx) / SCALE
    const dy = (e.clientY - d.sy) / SCALE
    setEls((xs) => xs.map((el) => {
      if (el.id !== d.id) return el
      if (d.mode === 'resize') return { ...el, w: Math.max(2, round(d.ox + dx)), h: Math.max(2, round(d.oy + dy)) }
      const nx = round(d.ox + dx)
      const ny = round(d.oy + dy)
      // Guides: snap to other elements' edges and the card's centre.
      const others = xs.filter((o) => o.id !== el.id)
      const gx = [31.5 - el.w / 2, ...others.flatMap((o) => [o.x, o.x + o.w - el.w])].find((v) => Math.abs(v - nx) < 1.2)
      const gy = [44 - el.h / 2, ...others.flatMap((o) => [o.y, o.y + o.h - el.h])].find((v) => Math.abs(v - ny) < 1.2)
      setGuides({ ...(gx !== undefined ? { x: gx + el.w / 2 } : {}), ...(gy !== undefined ? { y: gy + el.h / 2 } : {}) })
      return { ...el, x: gx ?? nx, y: gy ?? ny }
    }))
  }
  const up = () => { drag.current = null; setGuides({}) }
  const nudge = (dx: number, dy: number) => sel && setEls((xs) => xs.map((el) => (el.id === sel ? { ...el, x: el.x + dx, y: el.y + dy } : el)))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const step = e.shiftKey ? 5 : 0.5
      if (e.key === 'ArrowLeft') nudge(-step, 0)
      if (e.key === 'ArrowRight') nudge(step, 0)
      if (e.key === 'ArrowUp') nudge(0, -step)
      if (e.key === 'ArrowDown') nudge(0, step)
      if (e.key === 'Delete' || e.key === 'Backspace') sel && setEls((xs) => xs.filter((x) => x.id !== sel))
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const add = (kind: El['kind']) => {
    const id = `${kind}-${els.length + 1}`
    setEls((xs) => [...xs, { id, kind, x: 10, y: 20, w: kind === 'icons' ? 24 : 30, h: kind === 'text' ? 8 : kind === 'icons' ? 5 : 20, label: kind === 'text' ? 'Ny text' : kind === 'image' ? 'bild' : kind === 'icons' ? '● ●' : '' }])
    setSel(id)
  }
  const reorder = (id: string, dir: -1 | 1) => setEls((xs) => { const i = xs.findIndex((x) => x.id === id); const j = i + dir; if (j < 0 || j >= xs.length) return xs; const n = [...xs]; const t = n[i]!; n[i] = n[j]!; n[j] = t; return n })
  const patch = (id: string, p: Partial<El>) => setEls((xs) => xs.map((el) => (el.id === id ? { ...el, ...p } : el)))
  return { els, sel, setSel, guides, down, move, up, add, reorder, patch }
}
type C = ReturnType<typeof useCanvas>

export function CanvasPrototype() {
  const [variant, setVariant] = useState(new URLSearchParams(location.search).get('variant') ?? 'A')
  const change = (k: string) => { setVariant(k); const q = new URLSearchParams(location.search); q.set('variant', k); history.replaceState(null, '', `?${q}`) }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  return (
    <div className="byd-editor tc-stage" data-mode="template">
      <header>
        <strong>Skogens herrar</strong>
        <span className="byd-editor-rev">rev 12</span>
        <nav role="tablist">
          <button role="tab" type="button" aria-selected="false">Kortvägg</button>
          <button role="tab" type="button" aria-selected="true">Mall</button>
          <button role="tab" type="button" aria-selected="false">Tabell</button>
        </nav>
        <span className="byd-editor-spacer" />
        <button type="button">Spara</button>
        <button type="button" className="byd-editor-primary">Uppdatera bordet</button>
      </header>
      <div />
      <V key={variant} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

function Card({ c, grid, handles }: { c: C; grid?: boolean; handles?: boolean }) {
  return (
    <div className="tc-card" data-grid={grid} style={{ width: 63 * SCALE, height: 88 * SCALE }} onPointerDown={() => c.setSel(null)}>
      {c.els.map((el) => (
        <div
          key={el.id}
          className="tc-el"
          data-kind={el.kind}
          aria-selected={c.sel === el.id}
          style={{ left: el.x * SCALE, top: el.y * SCALE, width: el.w * SCALE, height: el.h * SCALE }}
          onPointerDown={(e) => c.down(e, el.id)}
          onPointerMove={c.move}
          onPointerUp={c.up}
        >
          <span>{el.label}</span>
          {handles && c.sel === el.id && (
            <>
              <i className="tc-h" data-h="nw" /><i className="tc-h" data-h="ne" /><i className="tc-h" data-h="sw" />
              <i className="tc-h tc-h-se" data-h="se" onPointerDown={(e) => c.down(e, el.id, 'resize')} onPointerMove={c.move} onPointerUp={c.up} />
              <b className="tc-pos">{el.x}, {el.y} · {el.w}×{el.h} mm</b>
            </>
          )}
        </div>
      ))}
      {c.guides.x !== undefined && <div className="tc-guide-v" style={{ left: c.guides.x * SCALE }} />}
      {c.guides.y !== undefined && <div className="tc-guide-h" style={{ top: c.guides.y * SCALE }} />}
    </div>
  )
}

function Props({ c }: { c: C }) {
  const el = c.els.find((x) => x.id === c.sel)
  if (!el) return <p className="tc-muted">Markera ett element.</p>
  const num = (k: 'x' | 'y' | 'w' | 'h') => (
    <label key={k}>
      {k}
      <input type="number" step={0.5} value={el[k]} onChange={(e) => c.patch(el.id, { [k]: Number(e.target.value) })} />
    </label>
  )
  return (
    <div className="tc-props">
      <h2>{el.id} · {el.kind}</h2>
      <div className="tc-grid4">{(['x', 'y', 'w', 'h'] as const).map(num)}</div>
      <p className="tc-muted">Piltangenter flyttar 0,5 mm, med shift 5 mm. Delete tar bort.</p>
    </div>
  )
}

// ---------- A — a tool rail on the left, handles on the selection, smart guides ----------
function VariantA() {
  const c = useCanvas(0.5)
  return (
    <div className="tc-a">
      <aside className="tc-rail" role="toolbar" aria-label="Verktyg">
        {([['text', 'T'], ['image', '▣'], ['icons', '●●'], ['shape', '◻']] as const).map(([k, g]) => (
          <button key={k} type="button" title={`Lägg till ${k}`} onClick={() => c.add(k)}>{g}<small>{k}</small></button>
        ))}
      </aside>
      <main className="tc-stage-main">
        <Card c={c} handles />
        <p className="tc-hint">dra elementet · hörnet ändrar storlek · hjälplinjer snäpper mot kanter och mitten · piltangenter 0,5 mm, shift 5 mm</p>
      </main>
      <aside className="tc-side">
        <h2>Lager</h2>
        <ul className="tc-layers">
          {[...c.els].reverse().map((el) => (
            <li key={el.id} aria-selected={c.sel === el.id} onClick={() => c.setSel(el.id)}>
              <span className="byd-layer-kind">{el.kind}</span> {el.id}
              <span className="byd-editor-spacer" />
              <button type="button" onClick={(e) => { e.stopPropagation(); c.reorder(el.id, 1) }} title="framåt">↑</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); c.reorder(el.id, -1) }} title="bakåt">↓</button>
            </li>
          ))}
        </ul>
        <Props c={c} />
      </aside>
    </div>
  )
}

// ---------- B — a "+ Element" menu, properties with steppers; free dragging without handles ----------
function VariantB() {
  const c = useCanvas(0.5)
  const [menu, setMenu] = useState(false)
  return (
    <div className="tc-b">
      <main className="tc-stage-main">
        <div className="tc-topbar">
          <span className="tc-addwrap">
            <button type="button" className="byd-editor-primary" onClick={() => setMenu((m) => !m)}>+ Element ▾</button>
            {menu && (
              <div className="tc-menu" role="menu">
                {(['text', 'image', 'icons', 'shape'] as const).map((k) => <button key={k} role="menuitem" onClick={() => { c.add(k); setMenu(false) }}>{k === 'text' ? 'Textruta' : k === 'image' ? 'Bildyta' : k === 'icons' ? 'Ikonrad' : 'Form'}</button>)}
              </div>
            )}
          </span>
          <span className="tc-muted">Dra elementen fritt. Finjustera med fälten eller piltangenterna.</span>
        </div>
        <Card c={c} />
      </main>
      <aside className="tc-side">
        <Props c={c} />
        <h2>Lager</h2>
        <ul className="tc-layers">{[...c.els].reverse().map((el) => <li key={el.id} aria-selected={c.sel === el.id} onClick={() => c.setSel(el.id)}><span className="byd-layer-kind">{el.kind}</span> {el.id}</li>)}</ul>
      </aside>
    </div>
  )
}

// ---------- C — a millimetre grid with snapping, and layers you drag to reorder ----------
function VariantC() {
  const c = useCanvas(SNAP)
  const [dragId, setDragId] = useState<string | null>(null)
  return (
    <div className="tc-a">
      <aside className="tc-rail" role="toolbar" aria-label="Verktyg">
        {([['text', 'T'], ['image', '▣'], ['icons', '●●'], ['shape', '◻']] as const).map(([k, g]) => (
          <button key={k} type="button" title={`Lägg till ${k}`} onClick={() => c.add(k)}>{g}<small>{k}</small></button>
        ))}
      </aside>
      <main className="tc-stage-main"><Card c={c} grid handles /></main>
      <aside className="tc-side">
        <h2>Lager · dra för att ordna</h2>
        <ul className="tc-layers">
          {[...c.els].reverse().map((el) => (
            <li key={el.id} draggable aria-selected={c.sel === el.id} onClick={() => c.setSel(el.id)} onDragStart={() => setDragId(el.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId && dragId !== el.id) { const from = c.els.findIndex((x) => x.id === dragId); const to = c.els.findIndex((x) => x.id === el.id); c.reorder(dragId, to > from ? 1 : -1) } setDragId(null) }}>
              <span className="tc-grip">⋮⋮</span><span className="byd-layer-kind">{el.kind}</span> {el.id}
            </li>
          ))}
        </ul>
        <Props c={c} />
        <p className="tc-muted">Rutnät 1 mm; allt snäpper. Piltangenter 0,5 mm ändå, för det som ska sitta mellan linjerna.</p>
      </aside>
    </div>
  )
}
