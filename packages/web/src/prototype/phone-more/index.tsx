// PROTOTYPE — the phone owns more than a hand (C4): /prototype/phone-more?variant=A|B|C.
// Question: where do the seat's counters and its private area live on the phone next to the
// hand strip, and how does one change a counter or play to and from the area? Engine in the
// browser; you are Ada; Bo plays now and then.
import { useEffect, useState } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { HandStrip } from '../../player/HandStrip.js'
import { PlaySheet, targetsOf } from '../../player/PlaySheet.js'
import { TableSummary } from '../../player/TableSummary.js'
import { playIntents } from '../../player/play.js'
import { hue } from '../../table/hue.js'
import { Switcher } from './Switcher.js'
import { scripted, type Table } from './engine.js'
import '../../player/player.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Staplat: räknare, din yta, handen' },
  { key: 'B', name: 'Flikar: Hand · Framför dig · Räknare' },
  { key: 'C', name: 'Räknarna i huvudet, din yta som bricka' },
]
const ME = 'A'
type Ctx = {
  t: Table
  view: Snapshot
  hand: VisibleComponentState[]
  mine: VisibleComponentState[]
  counters: VisibleComponentState[]
  bump(c: VisibleComponentState, by: number): void
  set(c: VisibleComponentState, value: number): void
  lift(c: VisibleComponentState): void
  takeUp(c: VisibleComponentState): void
  flip(c: VisibleComponentState): void
}

export function PhoneMorePrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [t] = useState(scripted)
  const [, tick] = useState(0)
  const [lifted, setLifted] = useState<VisibleComponentState | null>(null)
  const rerender = () => tick((n) => n + 1)
  const act = (...intents: Parameters<Table['act']>[1][]) => {
    t.act(ME, ...intents)
    rerender()
  }
  const view = t.view(ME)
  // What the folded table and the sheet should not offer: counter zones, and other seats'
  // private areas (a finding: targetsOf must learn this for real).
  const forTable: Snapshot = { ...view, zones: view.zones.filter((z) => !z.id.startsWith('counters:') && !(z.id.startsWith('mine:') && z.id !== `mine:${ME}`)) }
  const hand = view.components.filter((c) => c.zone === `hand:${ME}`)
  const mine = view.components.filter((c) => c.zone === `mine:${ME}`)
  const counters = view.components.filter((c) => c.zone === `counters:${ME}`)
  // Bo plays now and then, and his life goes down, so the table is alive.
  useEffect(() => {
    const timer = setInterval(() => {
      const bo = t.view('B')
      const life = bo.components.find((c) => c.zone === 'counters:B' && c.cardRef === 'Liv')
      if (life && life.counter !== undefined && Math.random() < 0.5) t.act('B', { v: 'setCounter', component: life.id, value: life.counter - 1 })
      else t.act('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
      rerender()
    }, 5000)
    return () => clearInterval(timer)
  }, [t])
  const ctx: Ctx = {
    t,
    view: forTable,
    hand,
    mine,
    counters,
    bump: (c, by) => act({ v: 'setCounter', component: c.id, value: (c.counter ?? 0) + by }),
    set: (c, value) => act({ v: 'setCounter', component: c.id, value }),
    lift: setLifted,
    takeUp: (c) => act({ v: 'move', component: c.id, to: `hand:${ME}` }),
    flip: (c) => act({ v: 'flip', component: c.id, face: c.face === 'front' ? 'back' : 'front' }),
  }
  const play = (zone: string, at: 'top' | 'bottom') => {
    if (lifted) act(...playIntents(view, [lifted], zone, undefined, at))
    setLifted(null)
  }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  return (
    <div className="pm-stage">
      <div className="pm-state">
        <span>seq <b>{t.state.seq}</b></span>
        <span>du är <b>Ada</b> · hand <b>{hand.length}</b> · framför dig <b>{mine.length}</b></span>
        {t.lastReason && <span style={{ color: '#ff8a8a' }}>avvisat: {t.lastReason}</span>}
        <span style={{ marginLeft: 'auto' }}>Bo: liv {t.view('B').components.find((c) => c.zone === 'counters:B' && c.cardRef === 'Liv')?.counter}</span>
      </div>
      <div className="pm-phone">
        <V {...ctx} />
        {lifted && <PlaySheet view={forTable} count={1} label={lifted.cardRef ?? ''} onPlay={play} onClose={() => setLifted(null)} />}
      </div>
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

// ---------- shared pieces ----------
function Head({ ctx, children }: { ctx: Ctx; children?: React.ReactNode }) {
  return (
    <header>
      <strong>Ada</strong>
      <span>{ctx.hand.length} kort</span>
      {children}
      <button type="button">⚑ Flagga</button>
    </header>
  )
}
// A counter as a pill: tap the sides to count, hold the number to type.
function CounterPill({ c, ctx, big }: { c: VisibleComponentState; ctx: Ctx; big?: boolean }) {
  return (
    <div className="pm-counter" data-big={big ? 'true' : undefined} data-counter={c.cardRef}>
      <button type="button" aria-label={`${c.cardRef} minus`} onClick={() => ctx.bump(c, -1)}>−</button>
      <div onClick={() => { const v = prompt(`${c.cardRef}:`, String(c.counter ?? 0)); if (v !== null && v.trim() !== '' && Number.isFinite(Number(v))) ctx.set(c, Math.round(Number(v))) }}>
        <b>{c.counter ?? 0}</b>
        <span>{c.cardRef}</span>
      </div>
      <button type="button" aria-label={`${c.cardRef} plus`} onClick={() => ctx.bump(c, 1)}>+</button>
    </div>
  )
}
// A card in front of you: smaller than the hand, face up or down, with what you can do to it.
function MineCard({ c, ctx, size }: { c: VisibleComponentState; ctx: Ctx; size: 'small' | 'tile' }) {
  const up = c.cardRef !== null
  return (
    <div className="pm-mine-card" data-size={size} data-face={up ? 'front' : 'back'} style={up ? { ['--hue' as string]: hue(c.cardRef ?? '') } : undefined}>
      <strong>{c.cardRef ?? ''}</strong>
      <div className="pm-mine-actions">
        <button type="button" onClick={() => ctx.flip(c)}>{up ? 'Vänd ner' : 'Vänd upp'}</button>
        <button type="button" onClick={() => ctx.takeUp(c)}>Ta upp</button>
        <button type="button" onClick={() => ctx.lift(c)}>Spela…</button>
      </div>
    </div>
  )
}

// ---------- A — stacked ----------
// Counters as a row under the head; the private area as a smaller strip above the hand; the
// table summary in between, as today. Everything is one screen, nothing changes place.
function VariantA(ctx: Ctx) {
  return (
    <div className="byd-player pm-a" data-page="player">
      <Head ctx={ctx} />
      <div className="pm-counters-row">
        {ctx.counters.map((c) => <CounterPill key={c.id} c={c} ctx={ctx} />)}
      </div>
      <TableSummary view={ctx.view} activity={[]} />
      <section className="pm-mine-strip">
        <h2>Framför dig · {ctx.mine.length}</h2>
        <div>{ctx.mine.map((c) => <MineCard key={c.id} c={c} ctx={ctx} size="small" />)}{ctx.mine.length === 0 && <p className="pm-empty">Inget framför dig. Spela ett kort hit från handen.</p>}</div>
      </section>
      <HandStrip view={ctx.view} selected={new Set()} onTap={() => undefined} onHold={() => undefined} onLift={ctx.lift} />
      <p className="byd-hint">räknare överst · din yta som en mindre remsa · handen nederst som förut · dra upp ett kort för att spela</p>
    </div>
  )
}

// ---------- B — tabs ----------
// Three tabs at the bottom, each with the whole middle: the hand as today, the area in front of
// you as a grid of tiles, the counters as big dials. The summary sits in the hand tab.
function VariantB(ctx: Ctx) {
  const [tab, setTab] = useState<'hand' | 'mine' | 'counters'>('hand')
  return (
    <div className="byd-player pm-b" data-page="player">
      <Head ctx={ctx} />
      {tab === 'hand' && (
        <>
          <TableSummary view={ctx.view} activity={[]} />
          <HandStrip view={ctx.view} selected={new Set()} onTap={() => undefined} onHold={() => undefined} onLift={ctx.lift} />
        </>
      )}
      {tab === 'mine' && (
        <div className="pm-mine-grid">
          {ctx.mine.map((c) => <MineCard key={c.id} c={c} ctx={ctx} size="tile" />)}
          {ctx.mine.length === 0 && <p className="pm-empty">Inget framför dig än.</p>}
        </div>
      )}
      {tab === 'counters' && (
        <div className="pm-dials">
          {ctx.counters.map((c) => <CounterPill key={c.id} c={c} ctx={ctx} big />)}
        </div>
      )}
      <nav className="pm-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'hand'} onClick={() => setTab('hand')}>Hand <em>{ctx.hand.length}</em></button>
        <button role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>Framför dig <em>{ctx.mine.length}</em></button>
        <button role="tab" aria-selected={tab === 'counters'} onClick={() => setTab('counters')}>Räknare <em>{ctx.counters.map((c) => c.counter ?? 0).join('·')}</em></button>
      </nav>
      <p className="byd-hint">tre flikar nederst · varje flik får hela mitten · räknarna som stora rattar</p>
    </div>
  )
}

// ---------- C — counters in the head, the area as a board ----------
// The counters as chips in the head, always in sight; the middle is your board: the cards in
// front of you as a fan you can act on, with the table summary folded into one line above it.
function VariantC(ctx: Ctx) {
  const zones = targetsOf(ctx.view).filter((z) => z.id !== ctx.view.floor && !z.id.startsWith('mine:'))
  return (
    <div className="byd-player pm-c" data-page="player">
      <Head ctx={ctx}>
        <span className="pm-chips">
          {ctx.counters.map((c) => (
            <button key={c.id} type="button" className="pm-chip" data-counter={c.cardRef} onClick={(e) => ctx.bump(c, e.shiftKey ? -1 : 1)} onContextMenu={(e) => { e.preventDefault(); ctx.bump(c, -1) }} title="tryck: +1 · håll/högerklick: −1">
              <em>{c.cardRef}</em> <b>{c.counter ?? 0}</b>
            </button>
          ))}
        </span>
      </Head>
      <div className="pm-board">
        <div className="pm-board-line">{zones.map((z) => <span key={z.id}>{z.name} <b>{z.count}</b></span>)}</div>
        <h2>Framför dig</h2>
        <div className="pm-fan">
          {ctx.mine.map((c, i) => (
            <div key={c.id} style={{ transform: `rotate(${(i - (ctx.mine.length - 1) / 2) * 6}deg) translateY(${Math.abs(i - (ctx.mine.length - 1) / 2) * 4}px)` }}>
              <MineCard c={c} ctx={ctx} size="tile" />
            </div>
          ))}
          {ctx.mine.length === 0 && <p className="pm-empty">Tomt. Spela hit från handen.</p>}
        </div>
      </div>
      <HandStrip view={ctx.view} selected={new Set()} onTap={() => undefined} onHold={() => undefined} onLift={ctx.lift} />
      <p className="byd-hint">räknarna som chips i huvudet (tryck +1, håll −1) · mitten är din bricka · handen nederst</p>
    </div>
  )
}
