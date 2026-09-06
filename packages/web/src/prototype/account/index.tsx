// PROTOTYPE — logging in and "Mina spel" (G1), on /prototype/account?variant=A|B|C.
// Question: how does a creator arrive, log in with a magic link, and find her games? Guests never
// see this. No server: "skicka länk" flips to "kolla mejlen", and a fake link click logs you in.
import { useState, type FormEvent } from 'react'
import { Switcher } from './Switcher.js'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Kort i mitten' },
  { key: 'B', name: 'Pitch till vänster, formulär till höger' },
  { key: 'C', name: 'Mina spel med mjuk grind' },
]
const GAMES = [
  { id: 'skogens-herrar', name: 'Skogens herrar', rev: 12, played: 'spelat i går, 4 spelare', hues: [30, 110, 200, 330] },
  { id: 'natt-pa-marknaden', name: 'Natt på marknaden', rev: 3, played: 'aldrig spelat', hues: [260, 20, 180] },
  { id: 'kaffe-och-kort', name: 'Kaffe och kort', rev: 41, played: 'spelat för en vecka sedan, 2 spelare', hues: [40, 60, 90, 120, 150] },
]
type Stage = 'out' | 'sent' | 'in'
type Ctx = { stage: Stage; email: string; setEmail(e: string): void; send(e: FormEvent): void; clickLink(): void; logout(): void }

export function AccountPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [stage, setStage] = useState<Stage>('out')
  const [email, setEmail] = useState('')
  const ctx: Ctx = {
    stage,
    email,
    setEmail,
    send: (e) => {
      e.preventDefault()
      if (email.includes('@')) setStage('sent')
    },
    clickLink: () => setStage('in'),
    logout: () => setStage('out'),
  }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  return (
    <div className="pa-stage">
      <div className="pa-state">
        <span>läge <b>{stage === 'out' ? 'utloggad' : stage === 'sent' ? 'länk skickad' : `inloggad som ${email}`}</b></span>
        {stage === 'sent' && <button onClick={ctx.clickLink}>låtsas klicka på länken i mejlet</button>}
        {stage === 'in' && <button onClick={ctx.logout}>logga ut</button>}
      </div>
      <div className="pa-page">
        <V {...ctx} />
      </div>
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

function LoginForm({ ctx, title }: { ctx: Ctx; title?: string }) {
  if (ctx.stage === 'sent') {
    return (
      <div className="pa-sent">
        <strong>Kolla mejlen.</strong>
        <div className="pa-muted" style={{ color: '#bfe6cf' }}>Vi skickade en länk till {ctx.email}. Den fungerar i 15 minuter och bara en gång. Inget lösenord att komma ihåg.</div>
      </div>
    )
  }
  return (
    <form onSubmit={ctx.send} style={{ display: 'grid', gap: 10 }}>
      {title && <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>}
      <input className="pa-email" type="email" placeholder="din@epost.se" value={ctx.email} onChange={(e) => ctx.setEmail(e.target.value)} autoFocus />
      <button className="pa-btn" type="submit">Skicka inloggningslänk</button>
      <div className="pa-muted">Inget lösenord. Länken i mejlet loggar in dig; första gången skapar den ditt konto.</div>
    </form>
  )
}

// ---------- A — a card in the middle; home as a grid of game cards ----------
function VariantA(ctx: Ctx) {
  if (ctx.stage !== 'in') {
    return (
      <div className="pa-a">
        <div className="pa-a-card">
          <h1>build-your-deck</h1>
          <div className="pa-muted">Skapa ditt kortspel, speltesta det på skärmen, beställ hem det. Logga in för att komma till dina spel.</div>
          <LoginForm ctx={ctx} />
          <div className="pa-muted">Ska du bara spela? Skanna QR-koden på bordet — inget konto behövs.</div>
        </div>
      </div>
    )
  }
  return (
    <div className="pa-a">
      <div className="pa-a-home">
        <header>
          <h1>Mina spel</h1>
          <span className="pa-c-who">{ctx.email} · <a href="#" onClick={(e) => { e.preventDefault(); ctx.logout() }} style={{ color: '#9aa3b8' }}>logga ut</a></span>
        </header>
        <div className="pa-grid">
          {GAMES.map((g) => (
            <button key={g.id} className="pa-game">
              <div className="pa-fan">{g.hues.map((h) => <i key={h} style={{ ['--h' as string]: h }} />)}</div>
              <strong>{g.name}</strong>
              <span className="pa-muted">rev {g.rev} · {g.played}</span>
            </button>
          ))}
          <button className="pa-game" data-new="true">＋ Nytt spel</button>
        </div>
      </div>
    </div>
  )
}

// ---------- B — split pitch and form; home as rows with actions ----------
function VariantB(ctx: Ctx) {
  if (ctx.stage !== 'in') {
    return (
      <div className="pa-b">
        <div className="pa-b-pitch">
          <h1>Gör kortspelet.<br />Testa det i kväll.<br />Håll det i handen nästa vecka.</h1>
          <p>Bygg korten i editorn, kasta upp bordet på TV:n och låt vännerna spela från sina telefoner. Inga regler i vägen — bara kort, händer och högar som i verkligheten.</p>
          <ul>
            <li>Varje drag i en logg som går att spola tillbaka</li>
            <li>Flagga ögonblick, enkät efter varje session</li>
            <li>Beställ leken tryckt när den sitter</li>
          </ul>
        </div>
        <div className="pa-b-form">
          <LoginForm ctx={ctx} title="Logga in eller skapa konto" />
          <div className="pa-muted">Spelare behöver inget konto: de skannar QR-koden på bordet.</div>
        </div>
      </div>
    )
  }
  return (
    <div className="pa-b-home">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1>Mina spel</h1>
        <button className="pa-btn" style={{ marginLeft: 'auto' }}>＋ Nytt spel</button>
        <span className="pa-c-who">{ctx.email}</span>
      </header>
      <div className="pa-rows">
        {GAMES.map((g) => (
          <div key={g.id} className="pa-row">
            <div>
              <strong>{g.name}</strong>
              <small>rev {g.rev} · {g.played}</small>
            </div>
            <button>Öppna editorn</button>
            <button data-kind="go">Starta ett bord</button>
            <button>…</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- C — one page: the games are there behind a soft gate; the header logs you in ----------
function VariantC(ctx: Ctx) {
  const locked = ctx.stage !== 'in'
  return (
    <div className="pa-c">
      <header>
        <h1>build-your-deck</h1>
        {locked ? (
          ctx.stage === 'sent' ? (
            <span className="pa-c-who">Länk skickad till {ctx.email} — kolla mejlen</span>
          ) : (
            <form onSubmit={ctx.send}>
              <input className="pa-email" type="email" placeholder="din@epost.se" value={ctx.email} onChange={(e) => ctx.setEmail(e.target.value)} />
              <button className="pa-btn" type="submit">Logga in</button>
            </form>
          )
        ) : (
          <span className="pa-c-who">{ctx.email} · <a href="#" onClick={(e) => { e.preventDefault(); ctx.logout() }} style={{ color: '#9aa3b8' }}>logga ut</a></span>
        )}
      </header>
      {locked && (
        <div className="pa-c-hero">
          <div>
            <h2>Skapa ditt kortspel. Speltesta det i kväll.</h2>
            <div className="pa-muted">Skriv din e-post där uppe så skickar vi en länk. Inget lösenord. Spelare behöver inget konto alls.</div>
          </div>
          <div className="pa-fan" style={{ display: 'flex', alignItems: 'flex-end', height: 120, justifyContent: 'center' }}>
            {[30, 110, 200, 330, 260].map((h, i) => <i key={h} style={{ ['--h' as string]: h, width: 70, height: 98, borderRadius: 8, marginRight: -24, background: `hsl(${h} 40% 86%)`, transform: `rotate(${(i - 2) * 9}deg)`, boxShadow: '0 4px 10px rgba(0,0,0,.5)' }} />)}
          </div>
        </div>
      )}
      <div>
        <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>{locked ? 'Så här ser dina spel ut när du loggat in' : 'Mina spel'}</h2>
        <div className={locked ? 'pa-grid pa-c-locked' : 'pa-grid'}>
          {GAMES.map((g) => (
            <button key={g.id} className="pa-game">
              <div className="pa-fan">{g.hues.map((h) => <i key={h} style={{ ['--h' as string]: h }} />)}</div>
              <strong>{g.name}</strong>
              <span className="pa-muted">rev {g.rev} · {g.played}</span>
            </button>
          ))}
          <button className="pa-game" data-new="true">＋ Nytt spel</button>
        </div>
      </div>
    </div>
  )
}
