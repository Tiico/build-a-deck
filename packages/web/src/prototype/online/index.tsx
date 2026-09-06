// PROTOTYPE — fully online (C2): both roles in one window, on /prototype/online?variant=A|B|C.
// You are Ada (seat A). Question: where does my hand live next to the table, and how do I play
// a card from it? Engine in the browser; the real table renderer; Bo makes a move now and then.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'
import { TableRenderer, type TableMode } from '../../table/TableRenderer.js'
import { fitScale } from '../../table/fit.js'
import { hue } from '../../table/hue.js'
import { seatColor } from '../../table/seatColor.js'
import { describeActivity } from '../../table/describe.js'
import { zoneAt } from '../../zones.js'
import { Switcher } from './Switcher.js'
import { scripted, type Table } from './engine.js'
import '../../table/table.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Telefonens remsa under bordet' },
  { key: 'B', name: 'Handen utfläktad på filten' },
  { key: 'C', name: 'Bordet + handen som kolumn' },
]
const ME = 'A'
type Ctx = { t: Table; view: Snapshot; hand: VisibleComponentState[]; act(intents: Intent[]): void; play(card: VisibleComponentState, clientX: number, clientY: number): void; frame: React.RefObject<HTMLDivElement | null>; scale: number; mode: TableMode; setMode(m: TableMode): void }

export function OnlinePrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [mode, setMode] = useState<TableMode>('tv')
  const [t] = useState(scripted)
  const [, bump] = useState(0)
  const rerender = () => bump((n) => n + 1)
  const act = (intents: Intent[]) => {
    t.act(ME, ...intents)
    rerender()
  }
  const frame = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.5)
  const full = t.view(ME)
  const view = t.viewWithoutHand(ME)
  const hand = full.components.filter((c) => c.zone === `hand:${ME}`)
  const floor = view.zones.find((z) => z.id === view.floor)
  useEffect(() => {
    const el = frame.current?.querySelector('.byd-table-frame') as HTMLElement | null
    if (!el || !floor) return
    const update = () => setScale(fitScale({ w: floor.geometry.w, h: floor.geometry.h }, { w: el.clientWidth, h: el.clientHeight }, mode === 'table' ? 80 : 44))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [variant, mode, floor?.geometry.w, floor?.geometry.h])
  // Bo plays now and then, so the table is alive.
  useEffect(() => {
    const timer = setInterval(() => {
      const bo = t.view('B').components.filter((c) => c.zone === 'hand:B')
      const card = bo[0]
      if (card && Math.random() < 0.5) t.act('B', { v: 'move', component: card.id, to: 'table', x: 100 + Math.random() * 600, y: 100 + Math.random() * 300 }, { v: 'flip', component: card.id, face: 'front' })
      else t.act('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
      rerender()
    }, 6000)
    return () => clearInterval(timer)
  }, [])
  // Playing a card from the hand: drop it where the pointer is over the table (K2, K11).
  const play = (card: VisibleComponentState, clientX: number, clientY: number) => {
    const table = frame.current?.querySelector('[data-table]')
    if (!table || !floor) return
    const r = table.getBoundingClientRect()
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return
    const x = (clientX - r.left) / scale + floor.geometry.x - 31.5
    const y = (clientY - r.top) / scale + floor.geometry.y - 44
    const dest = zoneAt(view.zones, view.floor, x, y)
    const isPublic = view.zones.find((z) => z.id === dest.zone)?.mode === 'order'
    act(isPublic ? [{ v: 'move', component: card.id, to: dest.zone, x: dest.x, y: dest.y }, { v: 'flip', component: card.id, face: 'front' }] : [{ v: 'move', component: card.id, to: dest.zone, x: dest.x, y: dest.y }])
  }
  const ctx: Ctx = { t, view, hand, act, play, frame, scale, mode, setMode }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  return (
    <div className="po-stage">
      <div className="po-state">
        <span>seq <b>{t.state.seq}</b></span>
        <span>du är <b style={{ color: seatColor(0) }}>Ada</b> på distans · hand <b>{hand.length}</b></span>
        {t.lastReason && <span style={{ color: '#ff8a8a' }}>avvisat: {t.lastReason}</span>}
        <span style={{ marginLeft: 'auto' }}>bordet</span>
        <button onClick={() => setMode('tv')} style={mode === 'tv' ? { background: '#7dd3a0', color: '#0b2a18' } : undefined}>TV-läge</button>
        <button onClick={() => setMode('table')} style={mode === 'table' ? { background: '#7dd3a0', color: '#0b2a18' } : undefined}>Bordsläge</button>
        <button onClick={() => act([{ v: 'draw', from: 'draw', to: `hand:${ME}`, count: 1 }])}>dra ett kort</button>
      </div>
      <div className="po-main" ref={frame}>
        <V {...ctx} />
      </div>
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

// A card in my hand that can be dragged out onto the table: a fixed ghost follows the pointer,
// the drop plays it where it lands.
function HandCard({ c, ctx, style }: { c: VisibleComponentState; ctx: Ctx; style?: React.CSSProperties }) {
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const down = (e: RPointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setGhost({ x: e.clientX, y: e.clientY })
  }
  const move = (e: RPointerEvent) => ghost && setGhost({ x: e.clientX, y: e.clientY })
  const up = (e: RPointerEvent) => {
    if (ghost) ctx.play(c, e.clientX, e.clientY)
    setGhost(null)
  }
  return (
    <>
      <div className="po-card" data-lifted={ghost ? 'true' : 'false'} style={{ ['--hue' as string]: hue(c.cardRef ?? ''), ...style }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setGhost(null)}>
        {c.cardRef}
      </div>
      {ghost && (
        <div className="po-ghost" style={{ left: ghost.x, top: ghost.y, width: 63 * ctx.scale, height: 88 * ctx.scale, ['--hue' as string]: hue(c.cardRef ?? '') }}>
          {c.cardRef}
        </div>
      )}
    </>
  )
}

function Tools({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <button onClick={() => ctx.act([{ v: 'undo.self' }])} disabled={!ctx.view.undo}>↶ Ångra</button>
      <button onClick={() => ctx.act([{ v: 'flag' }])}>⚑ Flagga</button>
    </>
  )
}

// ---------- A — the phone's strip docked under the table ----------
function VariantA(ctx: Ctx) {
  return (
    <div className="po-a">
      <TableRenderer view={ctx.view} mode={ctx.mode} scale={ctx.scale} onAct={ctx.act} />
      <div className="po-a-strip">
        {ctx.hand.map((c) => (
          <HandCard key={c.id} c={c} ctx={ctx} />
        ))}
        <div className="po-tools">
          <Tools ctx={ctx} />
        </div>
      </div>
      <div className="po-hint">bordet ovan är spelbart som på TV:n · handen är telefonens remsa · dra ett kort upp på bordet</div>
    </div>
  )
}

// ---------- B — the fan on the felt ----------
function VariantB(ctx: Ctx) {
  const n = ctx.hand.length
  return (
    <div className="po-b">
      <TableRenderer view={ctx.view} mode={ctx.mode} scale={ctx.scale} onAct={ctx.act} />
      <div className="po-b-fan">
        {ctx.hand.map((c, i) => (
          <HandCard key={c.id} c={c} ctx={ctx} style={{ transform: `rotate(${(i - (n - 1) / 2) * 8}deg) translateY(${Math.abs(i - (n - 1) / 2) * 6}px)` }} />
        ))}
      </div>
      <div className="po-b-me" style={{ ['--seat' as string]: seatColor(0) }}>Ada · din hand</div>
      <div className="po-b-tools">
        <Tools ctx={ctx} />
      </div>
      <div className="po-hint">handen ligger som en fläkt vid din kant · håll musen över för att läsa · dra rakt upp på filten</div>
    </div>
  )
}

// ---------- C — the table and a side panel ----------
function VariantC(ctx: Ctx) {
  const recent = ctx.t.activity().slice(-6).reverse()
  return (
    <div className="po-c">
      <TableRenderer view={ctx.view} mode={ctx.mode} scale={ctx.scale} onAct={ctx.act} />
      <aside className="po-c-side">
        <header>
          <strong>Ada</strong>
          <span>{ctx.hand.length} kort på hand</span>
        </header>
        <div className="po-c-hand">
          {ctx.hand.map((c) => (
            <HandCard key={c.id} c={c} ctx={ctx} />
          ))}
          <ul className="po-c-feed">
            {recent.map((l) => (
              <li key={l.seq}>{describeActivity(l, ctx.view)}</li>
            ))}
          </ul>
        </div>
        <footer>
          <Tools ctx={ctx} />
          <button>Avsluta…</button>
        </footer>
      </aside>
      <div className="po-hint" style={{ left: '35%' }}>bordet till vänster · handen och kontrollerna i en kolumn till höger · dra ett kort in på bordet</div>
    </div>
  )
}
