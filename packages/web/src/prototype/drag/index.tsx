// PROTOTYPE — three ways to act on the shared table, on /prototype/drag?variant=A|B|C&mode=tv|table.
// Dragging is the same in all three (K1, K2). They differ in how the verbs a drag cannot express
// are reached: A gestures only, B a toolbar by the selection, C a radial menu on hold.
import { useEffect, useReducer, useState } from 'react'
import type { Intent, Snapshot } from '@byd/protocol'
import { describeActivity } from '../../table/describe.js'
import { Switcher } from './Switcher.js'
import { scripted, type Table } from './engine.js'
import { CARD_MM, DragTable, type Mode, type Target } from './Table.js'
import '../../table/table.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Bara gester' },
  { key: 'B', name: 'Verktygsrad vid markering' },
  { key: 'C', name: 'Radialmeny på håll' },
]

type Ctx = { t: Table; view: Snapshot; mode: Mode; act(intents: Intent[]): void }

export function DragPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'table' ? 'table' : 'tv')
  const [t] = useState(scripted)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const act = (intents: Intent[]) => {
    if (intents.length > 0) t.act(null, ...intents)
    bump()
  }
  const set = (k: string, v: string) => {
    const q = new URLSearchParams(location.search)
    q.set(k, v)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  const view = t.view(null)
  const last = t.activity().at(-1)
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  return (
    <div className="pd-stage">
      <div className="pd-state">
        <span>seq <b>{t.state.seq}</b></span>
        <span>senast <b>{last ? describeActivity(last, view) : '—'}</b></span>
        {t.lastReason && <span className="pd-reason">avvisat: {t.lastReason}</span>}
        <span style={{ marginLeft: 'auto' }}>läge</span>
        <button data-on={mode === 'tv'} onClick={() => { setMode('tv'); set('mode', 'tv') }}>TV</button>
        <button data-on={mode === 'table'} onClick={() => { setMode('table'); set('mode', 'table') }}>Bord (perspektiv)</button>
        <button onClick={() => act([{ v: 'undo.self' }])} disabled={!view.undo}>↶ ångra</button>
      </div>
      <div className="pd-main">
        <V t={t} view={view} mode={mode} act={act} />
      </div>
      <Switcher variants={VARIANTS} current={variant} onChange={(k) => { setVariant(k); set('variant', k) }} />
    </div>
  )
}

const flipOf = (view: Snapshot, id: string): Intent | null => {
  const c = view.components.find((x) => x.id === id)
  return c ? { v: 'flip', component: id, face: c.face === 'front' ? 'back' : 'front' } : null
}
const topOf = (view: Snapshot, pile: string): string | null => {
  const z = view.zones.find((x) => x.id === pile)
  return z?.mode === 'order' ? z.order[0] ?? null : null
}
const countOf = (view: Snapshot, pile: string): number => {
  const z = view.zones.find((x) => x.id === pile)
  return z ? (z.mode === 'count' ? z.count : z.order.length) : 0
}
const pileGeom = (view: Snapshot, pile: string) => view.zones.find((x) => x.id === pile)!.geometry

// ---------- A — gestures only: double-tap flips a card / shuffles a pile, wheel rotates, the
// pile's label is a handle for the whole pile. Split by count has no gesture.
function VariantA({ view, mode, act }: Ctx) {
  const dbl = (tg: Target) => {
    if (tg.kind === 'card') {
      const f = flipOf(view, tg.id)
      if (f) act([f])
    } else act([{ v: 'shuffle', pile: tg.id }])
  }
  return (
    <>
      <DragTable view={view} mode={mode} act={act} onDoubleTap={dbl} wheelRotates pileHandle />
      <div className="pd-hint">dra = flytta · släpp på kort = stapla · dubbeltryck kort = vänd · dubbeltryck hög = blanda · rulla = vrid · dra i etiketten = flytta hög</div>
    </>
  )
}

// ---------- B — a click selects (shift adds); a toolbar with the verbs sits by the selection;
// dragging a selected card drags all selected. Split has a count stepper.
function VariantB({ view, mode, act }: Ctx) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [n, setN] = useState(1)
  const tap = (tg: Target, e: { clientX: number; clientY: number; shift: boolean }) => {
    setSelected((s) => {
      if (e.shift && tg.kind === 'card') {
        const next = new Set([...s].filter((id) => view.components.some((c) => c.id === id)))
        if (next.has(tg.id)) next.delete(tg.id)
        else next.add(tg.id)
        return next
      }
      return s.has(tg.id) && s.size === 1 ? new Set() : new Set([tg.id])
    })
    setAt({ x: e.clientX, y: e.clientY })
  }
  useEffect(() => {
    // Keep the toolbar by the selection as the table re-renders.
    const first = [...selected][0]
    if (!first) return
    const el = document.querySelector(`[data-component="${first}"], [data-zone="${first}"]`)
    if (!el) {
      setSelected(new Set())
      return
    }
    const r = el.getBoundingClientRect()
    setAt({ x: r.left + r.width / 2, y: r.bottom })
  }, [view, selected])
  const ids = [...selected].filter((id) => view.components.some((c) => c.id === id))
  const pile = [...selected].find((id) => view.zones.some((z) => z.id === id && z.kind === 'pile'))
  const run = (intents: (Intent | null)[]) => act(intents.filter((i): i is Intent => i !== null))
  return (
    <>
      <DragTable view={view} mode={mode} act={act} selected={selected} onTap={tap} onBackgroundTap={() => setSelected(new Set())} />
      {at && ids.length > 0 && (
        <div className="pd-toolbar" style={{ left: Math.min(Math.max(at.x, 250), window.innerWidth - 250), top: at.y }}>
          <button onClick={() => run(ids.map((id) => flipOf(view, id)))}>Vänd</button>
          <button onClick={() => run(ids.map((id) => ({ v: 'rotate', component: id, rot: (view.components.find((c) => c.id === id)?.rot ?? 0) + 90 })))}>Vrid 90°</button>
          {ids.length === 1 && <button onClick={() => run([{ v: 'reveal', components: ids }])}>Avslöja</button>}
          {ids.length > 1 && <button onClick={() => run(ids.slice(1).map((id) => ({ v: 'stack', component: id, onto: ids[0]! })))}>Stapla ({ids.length})</button>}
        </div>
      )}
      {at && pile && (
        <div className="pd-toolbar" style={{ left: Math.min(Math.max(at.x, 250), window.innerWidth - 250), top: at.y }}>
          <button onClick={() => run([{ v: 'shuffle', pile }])}>Blanda</button>
          <button onClick={() => { const top = topOf(view, pile); run([top ? flipOf(view, top) : null]) }} disabled={!topOf(view, pile)}>Vänd översta</button>
          <div className="pd-step">
            <button onClick={() => setN((x) => Math.max(1, x - 1))}>−</button>
            <span>{n}</span>
            <button onClick={() => setN((x) => Math.min(countOf(view, pile), x + 1))}>+</button>
            <button onClick={() => { const g = pileGeom(view, pile); run([{ v: 'split', pile, at: Math.min(n, countOf(view, pile)), x: g.x + CARD_MM.w + 20, y: g.y }]) }}>Dela av</button>
          </div>
          <button onClick={() => { const g = pileGeom(view, pile); run([{ v: 'split', pile, at: 1, x: g.x + CARD_MM.w + 20, y: g.y }]) }}>Dra 1</button>
        </div>
      )}
      <div className="pd-hint">klick = markera · shift-klick = fler · dra markering = flytta alla · verktyg vid markeringen</div>
    </>
  )
}

// ---------- C — hold on a card or pile opens a radial menu around the finger; slide to a verb
// and release. A quick drag before the hold is a move. Nothing is ever selected.
function VariantC({ view, mode, act }: Ctx) {
  const [menu, setMenu] = useState<{ tg: Target; x: number; y: number } | null>(null)
  useEffect(() => {
    if (!menu) return
    const up = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const btn = el?.closest<HTMLButtonElement>('.pd-radial button')
      if (btn) btn.click()
      setMenu(null)
    }
    window.addEventListener('pointerup', up, { once: true })
    return () => window.removeEventListener('pointerup', up)
  }, [menu])
  const items = (tg: Target): { label: string; intent: Intent | null; kind?: string }[] => {
    if (tg.kind === 'card') {
      const c = view.components.find((x) => x.id === tg.id)!
      return [
        { label: 'Vänd', intent: flipOf(view, tg.id) },
        { label: 'Vrid', intent: { v: 'rotate', component: tg.id, rot: c.rot + 90 } },
        { label: 'Avslöja', intent: { v: 'reveal', components: [tg.id] } },
        { label: 'Stäng', intent: null, kind: 'no' },
      ]
    }
    const g = pileGeom(view, tg.id)
    const count = countOf(view, tg.id)
    const top = topOf(view, tg.id)
    return [
      { label: 'Blanda', intent: { v: 'shuffle', pile: tg.id } },
      { label: 'Dra 1', intent: { v: 'split', pile: tg.id, at: 1, x: g.x + CARD_MM.w + 20, y: g.y } },
      { label: 'Dela på hälften', intent: count > 1 ? { v: 'split', pile: tg.id, at: Math.ceil(count / 2), x: g.x + CARD_MM.w + 20, y: g.y } : null },
      { label: 'Vänd översta', intent: top ? flipOf(view, top) : null },
      { label: 'Stäng', intent: null, kind: 'no' },
    ]
  }
  return (
    <>
      <DragTable view={view} mode={mode} act={act} onHold={(tg, e) => setMenu({ tg, x: e.clientX, y: e.clientY })} holdMs={320} pileHandle />
      {menu && (
        <div className="pd-radial" style={{ left: menu.x, top: menu.y }}>
          {items(menu.tg).map((it, i, all) => {
            const ang = -Math.PI / 2 + (i * 2 * Math.PI) / all.length
            return (
              <button key={it.label} data-kind={it.kind} style={{ left: Math.cos(ang) * 82, top: Math.sin(ang) * 82 }} disabled={it.intent === null && it.kind !== 'no'} onClick={() => it.intent && act([it.intent])}>
                {it.label}
              </button>
            )
          })}
        </div>
      )}
      <div className="pd-hint">dra = flytta · släpp på kort/hög = stapla · håll = meny (släpp på ett val) · dra i etiketten = flytta hög</div>
    </>
  )
}
