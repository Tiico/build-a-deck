// PROTOTYPE — three variants of "ångra / spola tillbaka" (B), on /prototype/rewind?variant=A|B|C.
// One screen shows the TV and both players' phones; the buttons drive the real engine in memory.
// Question: where does the decision to rewind live, and how does a phone ask for it?
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Activity, Intent, Snapshot } from '@byd/protocol'
import { TableRenderer } from '../../table/TableRenderer.js'
import { TvChrome } from '../../table/TvChrome.js'
import { describeActivity } from '../../table/describe.js'
import { HandStrip } from '../../player/HandStrip.js'
import { TableSummary } from '../../player/TableSummary.js'
import { Switcher } from './Switcher.js'
import { scripted, type Table } from './engine.js'
import '../../table/table.css'
import '../../player/player.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Dialog på TV:n' },
  { key: 'B', name: 'Tidslinje' },
  { key: 'C', name: 'Förhandsvisning på bordet' },
]

type Ctx = { t: Table; act(seat: string | null, ...intents: Intent[]): void; tv: Snapshot; activity: Activity[] }

export function RewindPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [t] = useState(scripted)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const act = (seat: string | null, ...intents: Intent[]) => {
    t.act(seat, ...intents)
    bump()
  }
  const ctx: Ctx = { t, act, tv: t.view(null), activity: t.activity() }
  const change = (key: string) => {
    setVariant(key)
    const q = new URLSearchParams(location.search)
    q.set('variant', key)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  return (
    <div className="pr-stage">
      <div className="pr-state">
        <span>seq <b>{t.state.seq}</b></span>
        <span>förslag <b>{t.state.rewind ? `${t.name(t.state.rewind.by)} → före seq ${t.state.rewind.toSeq + 1}` : '—'}</b></span>
        <span>ångra Ada: <b>{String(t.undo('A'))}</b></span>
        <span>ångra Bo: <b>{String(t.undo('B'))}</b></span>
        {t.lastReason && <span className="pr-reason">avvisat: {t.lastReason}</span>}
        <button className="pr-btn" data-kind="ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => act('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })}>Ada drar</button>
        <button className="pr-btn" data-kind="ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => act('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })}>Bo drar</button>
      </div>
      <V {...ctx} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

// ---------- shared frames (a TV that scales, a phone shell) ----------

// A 1920×1080 TV drawn at whatever width the stage has.
function TvFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.7)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(el.clientWidth / 1920)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="pr-tv" ref={ref}>
      <div className="pr-scale" style={{ transform: `scale(${scale})` }}>{children}</div>
    </div>
  )
}

function Tv({ view, activity, children, over }: { view: Snapshot; activity: Activity[]; children?: ReactNode; over?: ReactNode }) {
  return (
    <TvFrame>
      <div className="byd-fit" style={{ width: 1920, height: 1080, position: 'relative' }}>
        <TvChrome view={view} activity={activity} roomCode="MAL-7" joinUrl="https://deck.example/join?session=x">
          {children ?? <TableRenderer view={view} mode="tv" />}
        </TvChrome>
        {over}
      </div>
    </TvFrame>
  )
}

function Phone({ seat, t, activity, top, over, action }: { seat: string; t: Table; activity: Activity[]; top?: ReactNode; over?: ReactNode; action?: ReactNode }) {
  const view = t.view(seat)
  const hand = view.components.filter((c) => c.zone === `hand:${seat}`)
  return (
    <div className="pr-phone">
      <div className="byd-player" data-page="player">
        <header>
          <strong>{t.name(seat)}</strong>
          <span>{hand.length} kort</span>
          {action}
        </header>
        <div className="pr-scroll">
          {top}
          <TableSummary view={view} activity={activity} />
        </div>
        <HandStrip view={view} selected={new Set()} onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} />
        <p className="byd-hint">tryck = titta · dra upp = spela · håll = välj flera</p>
        {over}
      </div>
    </div>
  )
}

// What an undo means for a seat right now: a plain undo, a proposal, or nothing.
function undoIntent(t: Table, seat: string): { label: string; intents: Intent[] | null; contested: boolean } {
  const target = t.undo(seat)
  if (target === null) return { label: 'Ångra', intents: null, contested: false }
  if (target === 'contested') {
    const own = [...t.activity()].reverse().find((l) => l.by === seat)
    const toSeq = own ? t.activity().filter((l) => l.batch === own.batch)[0]!.seq - 1 : 0
    return { label: 'Ångra', intents: [{ v: 'rewind.propose', toSeq }], contested: true }
  }
  return { label: 'Ångra', intents: [{ v: 'undo.self' }], contested: false }
}

// ---------- A — a dialog in the middle of the TV; the other phone gets a banner ----------

function VariantA({ t, act, tv, activity }: Ctx) {
  const p = t.state.rewind
  const [asking, setAsking] = useState<string | null>(null)
  const undone = p ? t.undone(p.toSeq) : []
  const modal = p && (
    <div className="pr-a-modal">
      <div>
        <h1>{t.name(p.by)} vill spola tillbaka</h1>
        <p>{undone.length} drag tas tillbaka. Draghögen blandas om.</p>
        <ol>{undone.map((l) => <li key={l.seq}>{describeActivity(l, tv)}</li>)}</ol>
        <div className="pr-actions">
          <button className="pr-btn" data-kind="ok" onClick={() => act(null, { v: 'rewind.confirm', proposal: p.id })}>Godkänn</button>
          <button className="pr-btn" data-kind="no" onClick={() => act(null, { v: 'rewind.reject', proposal: p.id })}>Avvisa</button>
        </div>
      </div>
    </div>
  )
  const phone = (seat: string) => {
    const u = undoIntent(t, seat)
    const mine = p && p.by === seat
    const theirs = p && p.by !== seat
    const press = () => {
      if (!u.intents) return
      if (u.contested) setAsking(seat)
      else act(seat, ...u.intents)
    }
    return (
      <Phone
        key={seat}
        seat={seat}
        t={t}
        activity={activity}
        action={<button className="pr-btn" data-kind="quiet" disabled={!u.intents || !!p} onClick={press}>↶ Ångra</button>}
        top={
          mine ? (
            <div className="pr-a-wait">
              <span>⏳ Väntar på att någon godkänner på bordet…</span>
              <button className="pr-btn" data-kind="ghost" style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 12 }} onClick={() => act(seat, { v: 'rewind.reject', proposal: p.id })}>Dra tillbaka</button>
            </div>
          ) : theirs ? (
            <div className="pr-a-banner">
              <span>{t.name(p.by)} vill spola tillbaka {undone.length} drag.</span>
              <div>
                <button className="pr-btn" data-kind="ok" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => act(seat, { v: 'rewind.confirm', proposal: p.id })}>Godkänn</button>
                <button className="pr-btn" data-kind="no" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => act(seat, { v: 'rewind.reject', proposal: p.id })}>Nej</button>
              </div>
            </div>
          ) : undefined
        }
        over={
          asking === seat && u.intents ? (
            <div className="byd-sheet-backdrop" onClick={() => setAsking(null)}>
              <div className="byd-sheet" onClick={(e) => e.stopPropagation()}>
                <p className="pr-sheet-q">Någon annan har spelat sedan ditt drag.</p>
                <p>Att ångra nu tar tillbaka allas drag sedan dess, och alla måste vara med på det.</p>
                <div className="byd-sheet-targets">
                  <button onClick={() => { act(seat, ...u.intents!); setAsking(null) }}>Föreslå<small>visas på bordet</small></button>
                  <button onClick={() => setAsking(null)}>Låt vara</button>
                </div>
              </div>
            </div>
          ) : undefined
        }
      />
    )
  }
  return (
    <div className="pr-row">
      <Tv view={tv} activity={activity} over={modal} />
      <div className="pr-phones">{phone('A')}{phone('B')}</div>
    </div>
  )
}

// ---------- B — the log is the interface: a timeline on the TV, "spola hit" in the phone's feed ----------

function VariantB({ t, act, tv, activity }: Ctx) {
  const p = t.state.rewind
  const strip = (
    <>
      <div className="pr-b-strip">
        {activity.slice(-8).map((l) => (
          <div key={l.seq} className="pr-b-chip" data-undone={p ? l.seq > p.toSeq && !l.intent.v.startsWith('rewind.') : false} data-mark={p ? l.seq === p.toSeq + 1 : false}>
            <small>#{l.seq}</small>
            <span>{describeActivity(l, tv)}</span>
          </div>
        ))}
      </div>
      {p && (
        <div className="pr-b-bar">
          <span>{t.name(p.by)} föreslår: tillbaka till före #{p.toSeq + 1} ({t.undone(p.toSeq).length} drag)</span>
          <button className="pr-btn" data-kind="ok" onClick={() => act(null, { v: 'rewind.confirm', proposal: p.id })}>Godkänn</button>
          <button className="pr-btn" data-kind="no" onClick={() => act(null, { v: 'rewind.reject', proposal: p.id })}>Avvisa</button>
        </div>
      )}
    </>
  )
  const phone = (seat: string) => {
    const u = undoIntent(t, seat)
    const feed = (
      <div className="byd-summary pr-b-feed" style={{ paddingBottom: 0 }}>
        <h2>Spola tillbaka</h2>
        <ol>
          {activity.slice(-6).map((l) => (
            <li key={l.seq} data-undone={p ? l.seq > p.toSeq && !l.intent.v.startsWith('rewind.') : false}>
              <span>{describeActivity(l, tv)}</span>
              {!p && <button onClick={() => act(seat, { v: 'rewind.propose', toSeq: l.seq - 1 })}>spola hit</button>}
              {p && p.by !== seat && l.seq === p.toSeq + 1 && (
                <span style={{ display: 'flex', gap: 4 }}>
                  <button style={{ background: '#7dd3a0', color: '#0b2a18' }} onClick={() => act(seat, { v: 'rewind.confirm', proposal: p.id })}>ja</button>
                  <button style={{ background: '#3a2a2d', color: '#ff9a9a' }} onClick={() => act(seat, { v: 'rewind.reject', proposal: p.id })}>nej</button>
                </span>
              )}
              {p && p.by === seat && l.seq === p.toSeq + 1 && <button onClick={() => act(seat, { v: 'rewind.reject', proposal: p.id })}>ångra förslag</button>}
            </li>
          ))}
        </ol>
      </div>
    )
    return (
      <Phone
        key={seat}
        seat={seat}
        t={t}
        activity={activity}
        action={<button className="pr-btn" data-kind="quiet" disabled={!u.intents || !!p} onClick={() => u.intents && act(seat, ...u.intents)}>↶ {u.contested ? 'Föreslå ångra' : 'Ångra'}</button>}
        top={feed}
      />
    )
  }
  return (
    <div className="pr-row">
      <TvFrame>
        <div className="byd-fit" style={{ width: 1920, height: 1080 }}>
          <TvChrome view={tv} activity={activity} roomCode="MAL-7" joinUrl="https://deck.example/join?session=x">
            <div className="pr-b-wrap">
              <TableRenderer view={tv} mode="tv" />
              <div className="pr-b-over">{strip}</div>
            </div>
          </TvChrome>
        </div>
      </TvFrame>
      <div className="pr-phones">{phone('A')}{phone('B')}</div>
    </div>
  )
}

// ---------- C — the TV shows the table as it would become; only phones decide; one tap on the phone ----------

function VariantC({ t, act, tv, activity }: Ctx) {
  const p = t.state.rewind
  const shown = p ? t.viewAt(p.toSeq, null) : tv
  const over = p && (
    <>
      <div className="pr-c-ghost" />
      <div className="pr-c-label">
        <span>FÖRSLAG</span>
        <span>så här såg bordet ut före <b>{describeActivity(t.undone(p.toSeq)[0]!, tv).toLowerCase()}</b></span>
        <span>· väntar på {t.state.seats[p.by === 'A' ? 'B' : 'A']?.name}</span>
      </div>
    </>
  )
  const phone = (seat: string) => {
    const u = undoIntent(t, seat)
    const mine = p && p.by === seat
    const theirs = p && p.by !== seat
    return (
      <Phone
        key={seat}
        seat={seat}
        t={t}
        activity={activity}
        action={<button className="pr-btn" data-kind="quiet" disabled={!u.intents || !!p} onClick={() => u.intents && act(seat, ...u.intents)}>↶ Ångra</button>}
        over={
          theirs ? (
            <div className="pr-c-ask">
              <h1>{t.name(p.by)} vill spola tillbaka</h1>
              <p>Bordet visar hur det såg ut. {t.undone(p.toSeq).length} drag tas tillbaka, draghögen blandas om.</p>
              <button className="pr-btn" data-kind="ok" onClick={() => act(seat, { v: 'rewind.confirm', proposal: p.id })}>Godkänn</button>
              <button className="pr-btn" data-kind="no" onClick={() => act(seat, { v: 'rewind.reject', proposal: p.id })}>Neka</button>
            </div>
          ) : mine ? (
            <div className="pr-c-mine">
              <span>Du föreslår att spola tillbaka {t.undone(p.toSeq).length} drag. Bordet visar resultatet; {t.state.seats[seat === 'A' ? 'B' : 'A']?.name} avgör.</span>
              <button className="pr-btn" data-kind="ghost" onClick={() => act(seat, { v: 'rewind.reject', proposal: p.id })}>Dra tillbaka förslaget</button>
            </div>
          ) : undefined
        }
      />
    )
  }
  return (
    <div className="pr-row">
      <Tv view={shown} activity={activity} over={over} />
      <div className="pr-phones">{phone('A')}{phone('B')}</div>
    </div>
  )
}
