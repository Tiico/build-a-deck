// PROTOTYPE — flagging, ending, the survey, the observer (C8, C9, G3), on
// /prototype/session?variant=A|B|C. The phone is Ada's; the screen beside it is the TV with an
// observer (Eva) present, and the observer's own view. Engine in the browser; the survey is kept
// in memory. Question: how do you flag a moment, end the session and answer the survey on the
// phone — and how does the observer look to everyone?
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Intent, Snapshot } from '@byd/protocol'
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
  { key: 'A', name: 'Knappar i huvudet · enkät steg för steg' },
  { key: 'B', name: 'Ark från botten · enkät på en sida' },
  { key: 'C', name: 'Håll på loggraden · samtalsenkät' },
]

type Answers = { fun?: number; clarity?: number; balance?: number; change?: string }
type Ctx = { t: Table; view: Snapshot; act(seat: string | null, ...intents: Intent[]): void; ended: boolean; answers: Answers; setAnswers(a: Answers): void; sent: boolean; setSent(b: boolean): void; toast(msg: string): void; toastMsg: string | null }

export function SessionPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [t] = useState(scripted)
  const [, bump] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [sent, setSent] = useState(false)
  const [toastMsg, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }
  const act = (seat: string | null, ...intents: Intent[]) => {
    t.act(seat, ...intents)
    bump((n) => n + 1)
  }
  const view = t.view('A')
  const ctx: Ctx = { t, view, act, ended: t.state.ended, answers, setAnswers, sent, setSent, toast, toastMsg }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  const flags = t.log.filter((l) => l.intent.v === 'flag')
  return (
    <div className="ps-stage">
      <div className="ps-state">
        <span>seq <b>{t.state.seq}</b></span>
        <span>flaggor <b>{flags.length}</b></span>
        <span>avslutad <b>{String(t.state.ended)}</b></span>
        <span>enkät <b>{sent ? JSON.stringify(answers) : '—'}</b></span>
        {t.lastReason && <span style={{ color: '#ff8a8a' }}>avvisat: {t.lastReason}</span>}
        <button style={{ marginLeft: 'auto' }} onClick={() => act('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })}>Bo drar</button>
        <button onClick={() => { setAnswers({}); setSent(false); location.reload() }}>börja om</button>
      </div>
      <div className="ps-row">
        <V {...ctx} />
        <div>
          <Tv ctx={ctx} />
          <p className="ps-caption">TV:n med observatören Eva vid bordet, och sessionens slut.</p>
          <ObserverView ctx={ctx} />
          <p className="ps-caption">Evas egen vy: bordet med allas händer och dolda högar, en banderoll som säger vad hon är, och bara en knapp.</p>
        </div>
      </div>
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

// ---------- shared: the phone shell, the flag sheet, the end confirmation ----------

function Phone({ ctx, header, top, bottom, over }: { ctx: Ctx; header?: ReactNode; top?: ReactNode; bottom?: ReactNode; over?: ReactNode }) {
  const { view, t } = ctx
  const hand = view.components.filter((c) => c.zone === 'hand:A')
  return (
    <div className="ps-phone">
      <div className="byd-player" data-page="player">
        <header>
          <strong>Ada</strong>
          <span>{hand.length} kort</span>
          {header}
        </header>
        <div style={{ overflow: 'auto', minHeight: 0, display: 'grid', alignContent: 'start' }}>
          {top}
          <TableSummary view={view} activity={t.activity().slice(-8)} />
        </div>
        <HandStrip view={view} selected={new Set()} onTap={() => undefined} onHold={() => undefined} onLift={() => undefined} />
        <p className="byd-hint">tryck = titta · dra upp = spela · håll = välj flera</p>
        {bottom}
        {ctx.toastMsg && <div className="ps-toast">{ctx.toastMsg}</div>}
        {over}
      </div>
    </div>
  )
}

function FlagSheet({ ctx, context, onClose }: { ctx: Ctx; context?: string; onClose(): void }) {
  const [note, setNote] = useState('')
  const send = () => {
    ctx.act('A', { v: 'flag', ...(note.trim() ? { note: note.trim() } : {}) })
    ctx.toast('Ögonblicket är flaggat')
    onClose()
  }
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div className="byd-sheet ps-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="ps-sheet-title">Flagga det här ögonblicket</p>
        {context && <p>Vid: {context}</p>}
        <p>Tidsstämplas mot loggen. En kommentar är frivillig.</p>
        <textarea placeholder="Vad hände? (frivilligt)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} autoFocus />
        <div className="ps-actions">
          <button data-kind="flag" onClick={send}>Flagga</button>
          <button data-kind="quiet" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  )
}

function EndSheet({ ctx, onClose }: { ctx: Ctx; onClose(): void }) {
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div className="byd-sheet ps-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="ps-sheet-title">Avsluta sessionen?</p>
        <p>Loggen låses på version {ctx.t.state.version}, bordet kan inte spelas vidare, och alla får enkäten på sin telefon. Att bara lägga ifrån sig telefonen avslutar inget: bordet väntar.</p>
        <div className="ps-actions">
          <button data-kind="no" onClick={() => { ctx.act('A', { v: 'session.end' }); onClose() }}>Avsluta för alla</button>
          <button data-kind="quiet" onClick={onClose}>Inte än</button>
        </div>
      </div>
    </div>
  )
}

const QUESTIONS: { key: 'fun' | 'clarity' | 'balance'; text: string; low: string; high: string }[] = [
  { key: 'fun', text: 'Hur kul var det?', low: 'segt', high: 'jättekul' },
  { key: 'clarity', text: 'Hur tydliga var reglerna?', low: 'förvirrande', high: 'glasklara' },
  { key: 'balance', text: 'Hur balanserat kändes det?', low: 'någon körde över', high: 'jämnt' },
]

// ---------- A — buttons in the header; the survey one question per screen ----------

function VariantA(ctx: Ctx) {
  const [sheet, setSheet] = useState<'flag' | 'end' | null>(null)
  return (
    <Phone
      ctx={ctx}
      header={
        <>
          <span className="ps-spacer" />
          <button className="ps-hbtn" onClick={() => setSheet('flag')} disabled={ctx.ended}>⚑ Flagga</button>
          <button className="ps-hbtn" data-kind="end" onClick={() => setSheet('end')} disabled={ctx.ended}>Avsluta</button>
        </>
      }
      over={
        <>
          {sheet === 'flag' && <FlagSheet ctx={ctx} onClose={() => setSheet(null)} />}
          {sheet === 'end' && <EndSheet ctx={ctx} onClose={() => setSheet(null)} />}
          {ctx.ended && <StepSurvey ctx={ctx} />}
        </>
      }
    />
  )
}

function StepSurvey({ ctx }: { ctx: Ctx }) {
  const [step, setStep] = useState(0)
  const a = ctx.answers
  const set = (patch: Answers) => ctx.setAnswers({ ...a, ...patch })
  if (ctx.sent) return <div className="ps-survey"><div /><div className="ps-thanks"><strong>Tack, Ada.</strong><span>Dina svar är knutna till {ctx.t.state.version}.</span></div><div /></div>
  const q = QUESTIONS[step]
  const canNext = q ? a[q.key] !== undefined : true
  return (
    <div className="ps-survey">
      <div>
        <h1>Sessionen är slut</h1>
        <div className="ps-sub">Fyra frågor, en minut. Svaren knyts till version {ctx.t.state.version}.</div>
      </div>
      <div className="ps-q">
        {q ? (
          <>
            <h2>{q.text}</h2>
            <div className="ps-scale">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} aria-pressed={a[q.key] === n} onClick={() => set({ [q.key]: n })}>{n}</button>
              ))}
            </div>
            <div className="ps-scale-labels"><span>{q.low}</span><span>{q.high}</span></div>
          </>
        ) : (
          <>
            <h2>Vad skulle du ändra?</h2>
            <textarea placeholder="En mening räcker" value={a.change ?? ''} onChange={(e) => set({ change: e.target.value })} />
          </>
        )}
      </div>
      <div className="ps-nav">
        <div className="ps-dots">{[0, 1, 2, 3].map((i) => <i key={i} data-on={i <= step} />)}</div>
        {q ? <button disabled={!canNext} onClick={() => setStep(step + 1)}>Nästa</button> : <button onClick={() => ctx.setSent(true)}>Skicka</button>}
      </div>
    </div>
  )
}

// ---------- B — a bottom bar with Flagga and Meny; the survey on one page ----------

function VariantB(ctx: Ctx) {
  const [sheet, setSheet] = useState<'flag' | 'menu' | 'end' | null>(null)
  return (
    <Phone
      ctx={ctx}
      bottom={
        !ctx.ended && (
          <div className="ps-bar">
            <button data-kind="flag" onClick={() => setSheet('flag')}>⚑ Flagga ögonblicket</button>
            <button onClick={() => setSheet('menu')}>Meny</button>
          </div>
        )
      }
      over={
        <>
          {sheet === 'flag' && <FlagSheet ctx={ctx} onClose={() => setSheet(null)} />}
          {sheet === 'menu' && (
            <div className="byd-sheet-backdrop" onClick={() => setSheet(null)}>
              <div className="byd-sheet ps-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="ps-menu">
                  <button onClick={() => setSheet(null)}>↶ Ångra mitt senaste drag</button>
                  <button onClick={() => setSheet(null)}>Lämna platsen (korten blandas tillbaka)</button>
                  <button data-kind="end" onClick={() => setSheet('end')}>Avsluta sessionen för alla…</button>
                </div>
              </div>
            </div>
          )}
          {sheet === 'end' && <EndSheet ctx={ctx} onClose={() => setSheet(null)} />}
          {ctx.ended && <PageSurvey ctx={ctx} />}
        </>
      }
    />
  )
}

function PageSurvey({ ctx }: { ctx: Ctx }) {
  const a = ctx.answers
  const set = (patch: Answers) => ctx.setAnswers({ ...a, ...patch })
  const done = QUESTIONS.every((q) => a[q.key] !== undefined)
  if (ctx.sent) return <div className="ps-survey"><div /><div className="ps-thanks"><strong>Tack, Ada.</strong><span>Dina svar är knutna till {ctx.t.state.version}.</span></div><div /></div>
  return (
    <div className="ps-survey">
      <div>
        <h1>Sessionen är slut</h1>
        <div className="ps-sub">Hur var det? Svaren knyts till version {ctx.t.state.version}.</div>
      </div>
      <div className="ps-survey-page">
        {QUESTIONS.map((q) => (
          <div className="ps-field" key={q.key}>
            <h2>{q.text}</h2>
            <div className="ps-scale">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} aria-pressed={a[q.key] === n} onClick={() => set({ [q.key]: n })}>{n}</button>
              ))}
            </div>
            <div className="ps-scale-labels"><span>{q.low}</span><span>{q.high}</span></div>
          </div>
        ))}
        <div className="ps-field">
          <h2>Vad skulle du ändra?</h2>
          <textarea placeholder="En mening räcker" value={a.change ?? ''} onChange={(e) => set({ change: e.target.value })} />
        </div>
      </div>
      <div className="ps-nav">
        <div className="ps-dots" />
        <button disabled={!done} onClick={() => ctx.setSent(true)}>Skicka</button>
      </div>
    </div>
  )
}

// ---------- C — hold a line in "Senast" to flag that moment; end in a menu; the survey as a chat ----------

function VariantC(ctx: Ctx) {
  const [sheet, setSheet] = useState<{ kind: 'flag'; context: string } | { kind: 'menu' } | { kind: 'end' } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lines = ctx.t.activity().slice(-8).reverse()
  const feed = (
    <div className="byd-summary" style={{ paddingBottom: 0 }}>
      <h2>Senast · håll för att flagga</h2>
      <ol>
        {lines.map((l) => (
          <li
            key={l.seq}
            style={{ touchAction: 'none', userSelect: 'none' }}
            onPointerDown={() => {
              timer.current = setTimeout(() => setSheet({ kind: 'flag', context: describeActivity(l, ctx.view) }), 400)
            }}
            onPointerUp={() => timer.current && clearTimeout(timer.current)}
            onPointerLeave={() => timer.current && clearTimeout(timer.current)}
          >
            {describeActivity(l, ctx.view)}
          </li>
        ))}
      </ol>
    </div>
  )
  return (
    <Phone
      ctx={ctx}
      header={<><span className="ps-spacer" /><button className="ps-hbtn" onClick={() => setSheet({ kind: 'menu' })}>⋯</button></>}
      top={feed}
      over={
        <>
          {sheet?.kind === 'flag' && <FlagSheet ctx={ctx} context={sheet.context} onClose={() => setSheet(null)} />}
          {sheet?.kind === 'menu' && (
            <div className="byd-sheet-backdrop" onClick={() => setSheet(null)}>
              <div className="byd-sheet ps-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="ps-menu">
                  <button onClick={() => { setSheet(null); ctx.act('A', { v: 'flag' }); ctx.toast('Ögonblicket är flaggat') }}>⚑ Flagga nu, utan ord</button>
                  <button data-kind="end" onClick={() => setSheet({ kind: 'end' })}>Avsluta sessionen för alla…</button>
                </div>
              </div>
            </div>
          )}
          {sheet?.kind === 'end' && <EndSheet ctx={ctx} onClose={() => setSheet(null)} />}
          {ctx.ended && <ChatSurvey ctx={ctx} />}
        </>
      }
    />
  )
}

function ChatSurvey({ ctx }: { ctx: Ctx }) {
  const a = ctx.answers
  const set = (patch: Answers) => ctx.setAnswers({ ...a, ...patch })
  const [text, setText] = useState('')
  const asked = QUESTIONS.filter((q, i) => i === 0 || a[QUESTIONS[i - 1]!.key] !== undefined)
  const allScales = QUESTIONS.every((q) => a[q.key] !== undefined)
  const bottom = useRef<HTMLDivElement | null>(null)
  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [a, ctx.sent])
  return (
    <div className="ps-survey">
      <div>
        <h1>Sessionen är slut</h1>
        <div className="ps-sub">Några snabba frågor. Svaren knyts till version {ctx.t.state.version}.</div>
      </div>
      <div className="ps-chat">
        {asked.map((q) => (
          <div key={q.key} style={{ display: 'contents' }}>
            <div className="ps-msg">{q.text}</div>
            {a[q.key] !== undefined ? (
              <div className="ps-msg" data-me="true">{a[q.key]} / 5</div>
            ) : (
              <div className="ps-chips">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => set({ [q.key]: n })}>{n === 1 ? `1 · ${q.low}` : n === 5 ? `5 · ${q.high}` : n}</button>)}</div>
            )}
          </div>
        ))}
        {allScales && (
          <>
            <div className="ps-msg">Vad skulle du ändra?</div>
            {ctx.sent ? (
              <>
                <div className="ps-msg" data-me="true">{a.change || '—'}</div>
                <div className="ps-msg">Tack, Ada. Det här hamnar hos den som gjorde spelet, knutet till {ctx.t.state.version}.</div>
              </>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <textarea style={{ minHeight: 70, borderRadius: 12, border: '1px solid #2c3242', background: '#1b1e27', color: '#fff', padding: 10, font: '15px system-ui' }} placeholder="Skriv, eller hoppa över" value={text} onChange={(e) => setText(e.target.value)} />
                <div className="ps-chips">
                  <button onClick={() => { set({ change: text }); ctx.setSent(true) }}>Skicka</button>
                  <button onClick={() => { set({ change: '' }); ctx.setSent(true) }}>Hoppa över</button>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottom} />
      </div>
      <div />
    </div>
  )
}

// ---------- the TV and the observer's view ----------

function TvFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.4)
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
    <div className="ps-tv" ref={ref}>
      <div className="ps-scale" style={{ transform: `scale(${scale})` }}>{children}</div>
    </div>
  )
}

function Tv({ ctx }: { ctx: Ctx }) {
  const view = ctx.t.view(null)
  const flags = ctx.t.log.filter((l) => l.intent.v === 'flag').length
  return (
    <TvFrame>
      <div className="byd-fit" style={{ width: 1920, height: 1080, position: 'relative' }}>
        <TvChrome view={view} activity={ctx.t.activity()} roomCode="MAL-7" joinUrl="https://deck.example/join?session=x">
          <TableRenderer view={view} mode="tv" />
        </TvChrome>
        <div style={{ position: 'absolute', right: 40, bottom: 44, zIndex: 5 }}>
          <span className="ps-observer-chip"><i /> Eva tittar på · ser allt</span>
        </div>
        {ctx.ended && (
          <div className="ps-ended">
            <div>
              <h1>Sessionen är avslutad</h1>
              <p>Loggen är låst på {ctx.t.state.version}. Enkäten finns på telefonerna.</p>
              <div className="ps-summary" style={{ justifyContent: 'center' }}>
                <span><b>{ctx.t.state.seq}</b>drag</span>
                <span><b>{flags}</b>flaggade ögonblick</span>
                <span><b>{view.seats.filter((s) => s.name).length}</b>spelare</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </TvFrame>
  )
}

function ObserverView({ ctx }: { ctx: Ctx }) {
  const view = ctx.t.observerView()
  return (
    <TvFrame>
      <div className="byd-fit" style={{ width: 1920, height: 1080, position: 'relative' }}>
        <TvChrome view={view} activity={ctx.t.activity()} roomCode="MAL-7">
          <TableRenderer view={view} mode="tv" />
        </TvChrome>
        <div className="ps-obs-banner">
          <span>Du är observatör: du ser allas händer och alla högar. Alla vet att du är här.</span>
          <button onClick={() => { ctx.act(null, { v: 'flag', observer: 'Eva' }); ctx.toast('Eva flaggade') }} disabled={ctx.ended}>⚑ Flagga</button>
        </div>
      </div>
    </TvFrame>
  )
}
