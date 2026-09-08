// PROTOTYPE — sharing a game (D3): /prototype/share?variant=A|B|C. Question: where does a
// designer say who else may work on the game, and in what role? All three speak the same roles
// the server enforces, and show the same members.
import { useState } from 'react'
import { ROLES, roleWord, type Role } from '@byd/server/doc'
import { Switcher } from './Switcher.js'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'En panel från editorns huvud' },
  { key: 'B', name: 'På spelets kort på startsidan' },
  { key: 'C', name: 'De som är inne är dörren' },
]
type Member = { email: string; role: Role; here?: boolean }
type Ctx = { members: Member[]; invite(email: string, role: Role): void; drop(email: string): void; sent: string | null }

export function SharePrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [members, setMembers] = useState<Member[]>([
    { email: 'ada@example.com', role: 'owner', here: true },
    { email: 'bo@example.com', role: 'editor', here: true },
    { email: 'cilla@example.com', role: 'tester' },
  ])
  const [sent, setSent] = useState<string | null>(null)
  const ctx: Ctx = {
    members,
    invite: (email, role) => {
      setMembers((m) => [...m, { email, role }])
      setSent(email)
    },
    drop: (email) => setMembers((m) => m.filter((x) => x.email !== email)),
    sent,
  }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  return (
    <div className="sh-stage">
      <div className="sh-state">
        <span>
          {members.length} personer · {members.filter((m) => m.here).length} inne just nu · en inbjudan mejlas, lever en vecka och går att använda en gång
        </span>
      </div>
      <V {...ctx} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

// The list of people and what each may do, shared by every variant.
function People({ members, drop }: { members: Member[]; drop(email: string): void }) {
  return (
    <ul className="sh-people">
      {members.map((m) => (
        <li key={m.email} data-here={m.here ? 'true' : undefined}>
          <i style={{ ['--who' as string]: colour(m.email) }}>{m.email.slice(0, 1).toUpperCase()}</i>
          <span>
            <b>{m.email}</b>
            <small>
              {roleWord(m.role)}
              {m.here ? ' · inne nu' : ''}
            </small>
          </span>
          {m.role !== 'owner' && (
            <button type="button" onClick={() => drop(m.email)}>
              Ta bort
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function Invite({ invite, sent }: { invite(email: string, role: Role): void; sent: string | null }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  return (
    <form
      className="sh-invite"
      onSubmit={(e) => {
        e.preventDefault()
        if (!email.includes('@')) return
        invite(email, role)
        setEmail('')
      }}
    >
      <input type="email" aria-label="Adress att bjuda in" placeholder="namn@exempel.se" value={email} onChange={(e) => setEmail(e.target.value)} />
      <select aria-label="Roll" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        {ROLES.filter((r) => r !== 'owner').map((r) => (
          <option key={r} value={r}>
            {roleWord(r)}
          </option>
        ))}
      </select>
      <button type="submit">Bjud in</button>
      {sent && <p role="status">Inbjudan är skickad till {sent}.</p>}
    </form>
  )
}

const colour = (seed: string): string => {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 55% 55%)`
}

// ---------- A — a panel from the editor's header ----------
function VariantA(ctx: Ctx) {
  const [open, setOpen] = useState(true)
  return (
    <div className="sh-a">
      <div className="sh-editor">
        <header>
          <strong>Skogens herrar</strong>
          <span className="sh-rev">rev 4</span>
          <nav>
            {['Kortvägg', 'Mall', 'Tabell', 'Symboler', 'Regler', 'Bord'].map((t) => (
              <span key={t} data-on={t === 'Kortvägg' ? 'true' : undefined}>
                {t}
              </span>
            ))}
          </nav>
          <span className="sh-spacer" />
          <div className="sh-avatars">
            {ctx.members
              .filter((m) => m.here)
              .map((m) => (
                <i key={m.email} style={{ ['--who' as string]: colour(m.email) }}>
                  {m.email.slice(0, 1).toUpperCase()}
                </i>
              ))}
          </div>
          <button type="button" onClick={() => setOpen((o) => !o)}>
            Dela
          </button>
        </header>
        <div className="sh-body">
          <div className="sh-cards">
            {['Drake', 'Riddare', 'Trollkarl'].map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          {open && (
            <aside className="sh-panel">
              <h2>Delat med</h2>
              <People members={ctx.members} drop={ctx.drop} />
              <Invite invite={ctx.invite} sent={ctx.sent} />
            </aside>
          )}
        </div>
      </div>
      <p className="sh-foot">A · delningen hör till arbetet · en panel bredvid korten, där man redan är</p>
    </div>
  )
}

// ---------- B — on the game's card at home ----------
function VariantB(ctx: Ctx) {
  const [open, setOpen] = useState(true)
  return (
    <div className="sh-b">
      <div className="sh-home">
        <h1>Mina spel</h1>
        <div className="sh-grid">
          <div className="sh-game">
            <div className="sh-fan">
              <i />
              <i />
              <i />
            </div>
            <strong>Skogens herrar</strong>
            <span>rev 4 · 2 bord · delat med {ctx.members.length - 1}</span>
            <button type="button" onClick={() => setOpen((o) => !o)}>
              ⋯
            </button>
            {open && (
              <div className="sh-sheet">
                <h2>Delat med</h2>
                <People members={ctx.members} drop={ctx.drop} />
                <Invite invite={ctx.invite} sent={ctx.sent} />
              </div>
            )}
          </div>
          <div className="sh-game sh-new">＋ Nytt spel</div>
        </div>
      </div>
      <p className="sh-foot">B · delningen hör till spelet, inte till stunden man redigerar det · på kortet där spelet bor</p>
    </div>
  )
}

// ---------- C — the people who are here are the door ----------
function VariantC(ctx: Ctx) {
  const [open, setOpen] = useState(true)
  return (
    <div className="sh-c">
      <div className="sh-editor">
        <header>
          <strong>Skogens herrar</strong>
          <span className="sh-rev">rev 4</span>
          <nav>
            {['Kortvägg', 'Mall', 'Tabell'].map((t) => (
              <span key={t} data-on={t === 'Kortvägg' ? 'true' : undefined}>
                {t}
              </span>
            ))}
          </nav>
          <span className="sh-spacer" />
          <button type="button" className="sh-avatars sh-door" aria-label="Vilka som har spelet" onClick={() => setOpen((o) => !o)}>
            {ctx.members
              .filter((m) => m.here)
              .map((m) => (
                <i key={m.email} style={{ ['--who' as string]: colour(m.email) }}>
                  {m.email.slice(0, 1).toUpperCase()}
                </i>
              ))}
            <b>{ctx.members.filter((m) => m.here).length} inne</b>
          </button>
        </header>
        <div className="sh-body">
          <div className="sh-cards">
            {['Drake', 'Riddare', 'Trollkarl'].map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          {open && (
            <aside className="sh-panel sh-panel-right">
              <h2>Vilka som har spelet</h2>
              <p className="sh-hint">De som är inne nu står överst. Samma lista säger vem som får vara med.</p>
              <People members={[...ctx.members].sort((a, b) => Number(!!b.here) - Number(!!a.here))} drop={ctx.drop} />
              <Invite invite={ctx.invite} sent={ctx.sent} />
            </aside>
          )}
        </div>
      </div>
      <p className="sh-foot">C · vilka som är inne och vilka som får vara med är samma fråga · avatarerna är dörren</p>
    </div>
  )
}
