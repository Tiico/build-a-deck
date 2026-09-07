// PROTOTYPE — the tables a guest sat at, saved to an account (G1): /prototype/played?variant=A|B|C.
// Question: where do "the tables you played at" live next to "your games" on the start page, and
// what does the moment of saving one look like? No server; the state bar stands in for it.
import { useState } from 'react'
import { hue } from '../../table/hue.js'
import { seatColor } from '../../table/seatColor.js'
import { Switcher } from './Switcher.js'
import '../../account/account.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Två rutnät: mina spel, sedan bord jag spelat vid' },
  { key: 'B', name: 'En tidslinje: allt jag gjort, senast först' },
  { key: 'C', name: 'Två flikar, och sparandet som en banderoll' },
]

type Game = { id: string; name: string; rev: number }
type Played = { id: string; game: string; owner: string; seat: string; seatIndex: number; name: string; at: string; ended: boolean; survey: boolean; flags: number; code?: string }
const GAMES: Game[] = [
  { id: 'skogens-herrar', name: 'Skogens herrar', rev: 14 },
  { id: 'hamnen', name: 'Hamnen', rev: 3 },
]
const PLAYED: Played[] = [
  { id: 't1', game: 'Skogens herrar', owner: 'Ada', seat: 'B', seatIndex: 1, name: 'Bo', at: 'i går 19:40', ended: true, survey: true, flags: 2 },
  { id: 't2', game: 'Kortstriden', owner: 'Cy', seat: 'A', seatIndex: 0, name: 'Bosse', at: 'i lördags', ended: true, survey: false, flags: 0 },
  { id: 't3', game: 'Hamnen', owner: 'Ada', seat: 'C', seatIndex: 2, name: 'Bo', at: 'just nu', ended: false, survey: false, flags: 1, code: 'EDADKC' },
]
type Ctx = { games: Game[]; played: Played[]; justClaimed: Played | null; dismiss(): void }

export function PlayedPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [claimed, setClaimed] = useState<boolean>(true)
  const [asGuestOnly, setGuestOnly] = useState(false)
  const played = asGuestOnly ? PLAYED : PLAYED
  const games = asGuestOnly ? [] : GAMES
  const ctx: Ctx = { games, played, justClaimed: claimed ? (PLAYED[0] ?? null) : null, dismiss: () => setClaimed(false) }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  return (
    <div className="pp-stage">
      <div className="pp-state">
        <span>du är <b>bo@example.com</b></span>
        <span>egna spel <b>{games.length}</b> · spelade bord <b>{played.length}</b></span>
        <span style={{ marginLeft: 'auto' }}>läge</span>
        <button onClick={() => setClaimed(true)} style={claimed ? on : undefined}>kom just från claim-länken</button>
        <button onClick={() => setClaimed(false)} style={!claimed ? on : undefined}>vanligt besök</button>
        <button onClick={() => setGuestOnly((g) => !g)} style={asGuestOnly ? on : undefined}>bara gäst, inga egna spel</button>
      </div>
      <div className="byd-account byd-account-wide" data-page="home">
        <V {...ctx} />
      </div>
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}
const on: React.CSSProperties = { background: '#7dd3a0', color: '#0b2a18' }

function Header() {
  return (
    <header>
      <h1>Mina spel</h1>
      <span className="byd-who">bo@example.com · <a href="#">logga ut</a></span>
    </header>
  )
}
function GameCards({ games }: { games: Game[] }) {
  return (
    <div className="byd-home-grid">
      {games.map((p) => (
        <a key={p.id} className="byd-home-game" href="#">
          <div className="byd-home-fan">{[0, 1, 2, 3].map((i) => <i key={i} style={{ ['--hue' as string]: (hue(p.id) + i * 55) % 360 }} />)}</div>
          <strong>{p.name}</strong>
          <span className="byd-muted">rev {p.rev}</span>
        </a>
      ))}
      <a className="byd-home-game" data-new href="#">＋ Nytt spel</a>
    </div>
  )
}
const Seat = ({ p }: { p: Played }) => <i className="pp-seat" style={{ ['--seat' as string]: seatColor(p.seatIndex) }}>{p.seat}</i>

// ---------- A — two grids ----------
// Own games first as today; the tables sat at as a second grid of cards, each a table with the
// seat's colour, the name played under, and what came of it. Saving is a toast at the top.
function VariantA(ctx: Ctx) {
  return (
    <div className="byd-home">
      {ctx.justClaimed && (
        <div className="pp-toast" role="status">
          <span>Sparat: du spelade <b>{ctx.justClaimed.game}</b> som <b>{ctx.justClaimed.name}</b> {ctx.justClaimed.at}.</span>
          <button onClick={ctx.dismiss}>OK</button>
        </div>
      )}
      <Header />
      {ctx.games.length > 0 ? <GameCards games={ctx.games} /> : <p className="byd-muted">Du har inga egna spel än. <a href="#">Gör ett</a> — det tar en kvart.</p>}
      <h2 className="pp-h2">Bord du spelat vid</h2>
      <div className="byd-home-grid">
        {ctx.played.map((p) => (
          <div key={p.id} className="byd-home-game pp-played" data-played={p.id}>
            <div className="pp-played-top">
              <Seat p={p} />
              <span className="byd-muted">{p.at}</span>
            </div>
            <strong>{p.game}</strong>
            <span className="byd-muted">{p.owner}s bord · du var {p.name}</span>
            <span className="pp-facts">
              {p.ended ? (p.survey ? 'enkät besvarad' : 'enkät obesvarad') : 'pågår'}
              {p.flags > 0 && ` · ${p.flags} flaggade`}
            </span>
            {!p.ended && p.code && <a href="#" className="pp-action">Tillbaka till bordet</a>}
            {p.ended && !p.survey && <a href="#" className="pp-action">Svara på enkäten</a>}
          </div>
        ))}
      </div>
      <p className="pp-hint">egna spel först, som i dag · spelade bord som ett andra rutnät · sparandet är en rad överst</p>
    </div>
  )
}

// ---------- B — one timeline ----------
// Nothing is a grid: one list of what happened, newest first — a table sat at, a game edited, a
// table started — each with an action. Own games are a row of chips above.
function VariantB(ctx: Ctx) {
  const events = [
    ...ctx.played.map((p) => ({ at: p.at, kind: 'played' as const, p })),
    { at: 'i tisdags', kind: 'edited' as const, game: 'Skogens herrar', rev: 14 },
    { at: 'förra veckan', kind: 'edited' as const, game: 'Hamnen', rev: 3 },
  ]
  const order = ['just nu', 'i går 19:40', 'i tisdags', 'i lördags', 'förra veckan']
  events.sort((a, b) => order.indexOf(a.at) - order.indexOf(b.at))
  return (
    <div className="byd-home">
      <Header />
      {ctx.games.length > 0 && (
        <div className="pp-chips">
          {ctx.games.map((g) => (
            <a key={g.id} href="#" className="pp-chip"><i style={{ ['--hue' as string]: hue(g.id) }} />{g.name}</a>
          ))}
          <a href="#" className="pp-chip" data-new>＋ Nytt spel</a>
        </div>
      )}
      <ol className="pp-timeline">
        {ctx.justClaimed && (
          <li className="pp-tl pp-tl-claim">
            <time>nyss</time>
            <div>
              <strong>Bordet sparades till ditt konto</strong>
              <span className="byd-muted">{ctx.justClaimed.game}, som {ctx.justClaimed.name} {ctx.justClaimed.at}. Enkäten och flaggorna är dina nu.</span>
            </div>
            <button onClick={ctx.dismiss}>OK</button>
          </li>
        )}
        {events.map((e, i) =>
          e.kind === 'played' ? (
            <li key={i} className="pp-tl" data-played={e.p.id}>
              <time>{e.at}</time>
              <div>
                <strong><Seat p={e.p} /> Spelade {e.p.game}</strong>
                <span className="byd-muted">vid {e.p.owner}s bord som {e.p.name} · {e.p.ended ? (e.p.survey ? 'enkät besvarad' : 'enkät obesvarad') : 'pågår'}{e.p.flags > 0 ? ` · ${e.p.flags} flaggade` : ''}</span>
              </div>
              {!e.p.ended ? <a href="#" className="pp-action">Tillbaka</a> : !e.p.survey ? <a href="#" className="pp-action">Svara</a> : <a href="#" className="pp-action">Se svar</a>}
            </li>
          ) : (
            <li key={i} className="pp-tl">
              <time>{e.at}</time>
              <div>
                <strong>Ändrade {e.game}</strong>
                <span className="byd-muted">rev {e.rev}</span>
              </div>
              <a href="#" className="pp-action">Öppna</a>
            </li>
          ),
        )}
      </ol>
      <p className="pp-hint">en tidslinje för allt: spelat, ändrat, startat · egna spel som chips överst · sparandet är en rad i tidslinjen</p>
    </div>
  )
}

// ---------- C — two tabs and a banner ----------
// "Mina spel" and "Spelat" as tabs; Spelat is a table with columns. Saving is a banner above the
// tabs that names the table and offers the survey at once.
function VariantC(ctx: Ctx) {
  const [tab, setTab] = useState<'games' | 'played'>(ctx.justClaimed ? 'played' : 'games')
  return (
    <div className="byd-home">
      {ctx.justClaimed && (
        <div className="pp-banner">
          <div>
            <strong>Välkommen tillbaka, {ctx.justClaimed.name}.</strong>
            <span>Bordet vid {ctx.justClaimed.game} {ctx.justClaimed.at} hör nu till ditt konto.</span>
          </div>
          {!ctx.justClaimed.survey && <a href="#" className="pp-action">Svara på enkäten</a>}
          <button onClick={ctx.dismiss}>Stäng</button>
        </div>
      )}
      <Header />
      <div className="pp-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'games'} onClick={() => setTab('games')}>Mina spel <em>{ctx.games.length}</em></button>
        <button role="tab" aria-selected={tab === 'played'} onClick={() => setTab('played')}>Spelat <em>{ctx.played.length}</em></button>
      </div>
      {tab === 'games' ? (
        <GameCards games={ctx.games} />
      ) : (
        <table className="pp-table">
          <thead>
            <tr><th>När</th><th>Spel</th><th>Bord</th><th>Du</th><th>Utfall</th><th /></tr>
          </thead>
          <tbody>
            {ctx.played.map((p) => (
              <tr key={p.id} data-played={p.id}>
                <td>{p.at}</td>
                <td><strong>{p.game}</strong></td>
                <td className="byd-muted">{p.owner}s</td>
                <td><Seat p={p} /> {p.name}</td>
                <td className="byd-muted">{p.ended ? (p.survey ? 'enkät besvarad' : 'enkät obesvarad') : 'pågår'}{p.flags > 0 ? ` · ${p.flags} flaggade` : ''}</td>
                <td>{!p.ended ? <a href="#" className="pp-action">Tillbaka</a> : !p.survey ? <a href="#" className="pp-action">Svara</a> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="pp-hint">två flikar, spelat som en tabell · sparandet som banderoll ovanför, med enkäten direkt</p>
    </div>
  )
}
