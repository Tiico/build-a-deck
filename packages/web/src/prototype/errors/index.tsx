// PROTOTYPE — one family for every state where the screen cannot show what it promised
// (#12 route errors, #7 realtime status), on /prototype/errors?variant=A|B|C.
//
// Question: is a missing project, a lost WebSocket and a refused drag one thing said three
// places, or three things? The two issues ask for the same surface, so they get one answer.
//
// Nine states, three mocked routes, three genuinely different placements. Nothing here is
// wired to a server: the state is picked by hand so the words and the placement can be judged.
// Add `?alla=1` for a contact sheet of every state at once, `?bare` to drop the switcher.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Switcher } from './Switcher.js'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Helsidesbesked — läget tar hela vyn' },
  { key: 'B', name: 'En statusremsa som alltid finns' },
  { key: 'C', name: 'Varje route svarar i sin egen form' },
]

// ---------------------------------------------------------------------------
// The states. Nine, because that is how many the two issues name between them.
// ---------------------------------------------------------------------------
type StateKey = 'laddar' | 'länge' | 'saknas' | 'obehörig' | 'nätfel' | 'ansluter' | 'tappad' | 'återansluten' | 'avvisad'
const STATES: { key: StateKey; label: string }[] = [
  { key: 'laddar', label: 'Laddar' },
  { key: 'länge', label: 'Laddar länge' },
  { key: 'saknas', label: '404 saknas' },
  { key: 'obehörig', label: '401/403 stängt' },
  { key: 'nätfel', label: 'Nät-/serverfel' },
  { key: 'ansluter', label: 'Ansluter' },
  { key: 'tappad', label: 'Tappad anslutning' },
  { key: 'återansluten', label: 'Återansluten' },
  { key: 'avvisad', label: 'Avvisad handling' },
]
// The three states that happen on top of a view that already holds data. Everything else
// happens instead of one.
const HAS_DATA = new Set<StateKey>(['tappad', 'återansluten', 'avvisad'])

type Scene = 'bord' | 'telefon' | 'editor'
const SCENES: { key: Scene; label: string }[] = [
  { key: 'bord', label: 'Bordet / TV' },
  { key: 'telefon', label: 'Telefonen' },
  { key: 'editor', label: 'Editorn' },
]

type Tone = 'vänta' | 'saknas' | 'stängd' | 'brutet' | 'ok'
type Act = { label: string; primary?: boolean }
type Besked = {
  tone: Tone
  mark: string
  rubrik: string
  text: string
  acts: Act[]
  // Polite for anything the reader will get to in their own time; assertive only when what is
  // on the screen has stopped being true, or when something they asked for did not happen.
  live: 'polite' | 'assertive'
  // Does the state fix itself if we wait, or does it need a person? A 404 retried is a 404.
  retryable: boolean
}

// One wording for every route. Variants A and B use exactly this and nothing else.
function base(state: StateKey): Besked {
  switch (state) {
    case 'laddar':
      return { tone: 'vänta', mark: 'Laddar', rubrik: 'Hämtar…', text: 'Det brukar ta en sekund.', acts: [], live: 'polite', retryable: true }
    case 'länge':
      return { tone: 'vänta', mark: 'Laddar', rubrik: 'Det här tar längre tid än vanligt', text: 'Vi väntar fortfarande på svar. Vänta kvar, eller försök igen.', acts: [{ label: 'Försök igen', primary: true }, { label: 'Till mina spel' }], live: 'polite', retryable: true }
    case 'saknas':
      return { tone: 'saknas', mark: 'Finns inte', rubrik: 'Vi hittar inte det du sökte', text: 'Länken pekar på något som inte finns längre. Kontrollera adressen, eller gå till dina spel.', acts: [{ label: 'Till mina spel', primary: true }], live: 'assertive', retryable: false }
    case 'obehörig':
      return { tone: 'stängd', mark: 'Stängt', rubrik: 'Du har inte tillgång', text: 'Det här hör till ett annat konto. Logga in med rätt konto, eller be den som äger det att bjuda in dig.', acts: [{ label: 'Logga in', primary: true }, { label: 'Till mina spel' }], live: 'assertive', retryable: false }
    case 'nätfel':
      return { tone: 'brutet', mark: 'Ingen kontakt', rubrik: 'Vi når inte tjänsten', text: 'Det kan vara nätet där du är, eller så är tjänsten nere en stund. Inget av ditt arbete är borta.', acts: [{ label: 'Försök igen', primary: true }, { label: 'Till mina spel' }], live: 'assertive', retryable: true }
    case 'ansluter':
      return { tone: 'vänta', mark: 'Ansluter', rubrik: 'Ansluter…', text: 'Vi kopplar upp mot bordet.', acts: [], live: 'polite', retryable: true }
    case 'tappad':
      return { tone: 'brutet', mark: 'Frånkopplad', rubrik: 'Anslutningen bröts', text: 'Det du ser är från 14:32 och kan ha ändrats sedan dess. Ingenting du gör nu kommer fram.', acts: [{ label: 'Försök nu', primary: true }, { label: 'Lämna bordet' }], live: 'assertive', retryable: true }
    case 'återansluten':
      return { tone: 'ok', mark: 'Uppkopplad', rubrik: 'Uppkopplad igen', text: 'Bilden är uppdaterad till hur det ser ut nu.', acts: [], live: 'polite', retryable: false }
    case 'avvisad':
      return { tone: 'brutet', mark: 'Gick inte', rubrik: 'Draget gick inte igenom', text: 'Det är inte din tur än.', acts: [], live: 'assertive', retryable: false }
  }
}

// Variant C only: the same nine states, said in the words of the route they land on.
const PER_SCENE: Record<Scene, Partial<Record<StateKey, Partial<Besked>>>> = {
  bord: {
    laddar: { rubrik: 'Dukar bordet…', text: 'Rum 4KJ2 hämtas.' },
    länge: { rubrik: 'Bordet dröjer', text: 'Vi väntar fortfarande på spelet. Ingen behöver göra något än.', acts: [{ label: 'Försök igen', primary: true }] },
    saknas: { rubrik: 'Rummet är slut', text: 'Koden som stod här gäller inte längre. Starta ett nytt rum från Mina spel.', acts: [{ label: 'Till mina spel', primary: true }] },
    obehörig: { rubrik: 'Bordet hör till ett annat konto', text: 'Logga in på kontot som äger spelet för att visa det på den här skärmen.', acts: [{ label: 'Logga in', primary: true }] },
    nätfel: { rubrik: 'Bordet når inte tjänsten', text: 'Kontrollera nätet på den här skärmen. Spelet ligger kvar och ingenting har gått förlorat.', acts: [{ label: 'Försök igen', primary: true }] },
    ansluter: { rubrik: 'Kopplar upp bordet…', text: 'Rum 4KJ2 är på väg upp.' },
    tappad: { rubrik: 'Bordet har tappat kontakten', text: 'Det som visas är från 14:32. Ingen kan spela förrän kontakten är tillbaka.', acts: [{ label: 'Försök nu', primary: true }] },
    återansluten: { rubrik: 'Bordet är igång igen', text: 'Bilden visar hur det ser ut nu.' },
    avvisad: { rubrik: 'Kortet kan inte vändas', text: 'Det ligger i en dold hög.' },
  },
  telefon: {
    laddar: { rubrik: 'Hämtar din hand…', text: 'Ett ögonblick.' },
    länge: { rubrik: 'Det tar längre tid än vanligt', text: 'Vi väntar fortfarande på rummet.', acts: [{ label: 'Försök igen', primary: true }, { label: 'Skanna QR igen' }] },
    saknas: { rubrik: 'Rummet finns inte', text: 'Rummet kan ha avslutats. Läs QR-koden på TV:n igen så kommer du in i det som pågår.', acts: [{ label: 'Skanna QR igen', primary: true }, { label: 'Till startsidan' }] },
    obehörig: { rubrik: 'Din plats är inte längre din', text: 'Någon annan sitter på platsen. Läs QR-koden på TV:n och sätt dig igen.', acts: [{ label: 'Skanna QR igen', primary: true }] },
    nätfel: { rubrik: 'Vi når inte rummet', text: 'Kontrollera nätet på telefonen. Din plats står kvar så länge spelet pågår.', acts: [{ label: 'Försök igen', primary: true }] },
    ansluter: { rubrik: 'Kopplar upp…', text: 'Vi letar upp ditt rum.' },
    tappad: { rubrik: 'Du är frånkopplad', text: 'Handen du ser är från 14:32. Vi försöker igen.', acts: [{ label: 'Försök nu', primary: true }] },
    återansluten: { rubrik: 'Uppkopplad igen', text: 'Din hand är uppdaterad.' },
    avvisad: { rubrik: 'Det är inte din tur', text: '' },
  },
  editor: {
    laddar: { rubrik: 'Öppnar spelet…', text: 'Skogens herrar hämtas.' },
    länge: { rubrik: 'Spelet dröjer', text: 'Vi väntar fortfarande på servern.', acts: [{ label: 'Försök igen', primary: true }, { label: 'Till mina spel' }] },
    saknas: { rubrik: 'Vi hittar inte spelet', text: 'Spelet kan vara borttaget, eller så blev det ett tecken fel i länken.', acts: [{ label: 'Till mina spel', primary: true }] },
    obehörig: { rubrik: 'Spelet hör till någon annan', text: 'Be den som äger spelet att bjuda in dig, eller logga in på rätt konto.', acts: [{ label: 'Logga in', primary: true }, { label: 'Till mina spel' }] },
    nätfel: { rubrik: 'Vi når inte servern', text: 'Ändringarna du gjort ligger kvar här. Vi sparar så fort kontakten är tillbaka.', acts: [{ label: 'Försök igen', primary: true }] },
    ansluter: { rubrik: 'Kopplar upp…', text: 'Vi hämtar den senaste versionen.' },
    tappad: { rubrik: 'Ingen kontakt med servern', text: 'Det du ser sparades senast 14:32. Osparat arbete ligger kvar här tills kontakten är tillbaka.', acts: [{ label: 'Försök nu', primary: true }] },
    återansluten: { rubrik: 'Sparat och uppkopplat igen', text: 'Allt du hann göra ligger på servern.' },
    avvisad: { rubrik: 'Bordet uppdaterades inte', text: 'Ett kort kunde inte renderas.' },
  },
}
const forScene = (state: StateKey, scene: Scene): Besked => ({ ...base(state), ...(PER_SCENE[scene][state] ?? {}) })

// ---------------------------------------------------------------------------
// Document titles. Fact-finding for #12: today nothing writes `document.title`; the only title
// in the product is the static one in packages/web/index.html. The full list lives in NOTES.md;
// this is the same list, live, so the tab can be read off a screenshot.
// ---------------------------------------------------------------------------
const ROUTE_TITLE: Record<Scene, string> = {
  bord: 'Bordet · Rum 4KJ2',
  telefon: 'Din hand · Rum 4KJ2',
  editor: 'Skogens herrar · Editor',
}
function documentTitle(state: StateKey, scene: Scene): string {
  const overrides: Partial<Record<StateKey, string>> = {
    laddar: 'Laddar',
    länge: 'Laddar',
    saknas: scene === 'editor' ? 'Spelet finns inte' : 'Rummet finns inte',
    obehörig: 'Ingen tillgång',
    nätfel: 'Ingen kontakt',
    ansluter: 'Ansluter',
    tappad: 'Frånkopplad',
  }
  return `${overrides[state] ?? ROUTE_TITLE[scene]} · build-your-deck`
}

// ---------------------------------------------------------------------------
// Retrying without becoming a reload loop: three automatic attempts at 2, 4 and 8 seconds,
// then it stops and waits for a person. Nothing here reloads the document; a retry re-runs the
// request in place, which is the whole difference between recovering and starting over.
// ---------------------------------------------------------------------------
const PLAN = [2, 4, 8]
function useRetry(active: boolean): { attempt: number; left: number; manual: boolean } {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active) {
      setTick(0)
      return
    }
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [active])
  let attempt = 1
  let spent = 0
  for (const d of PLAN) {
    if (tick >= spent + d) {
      spent += d
      attempt++
    } else break
  }
  const left = attempt <= PLAN.length ? spent + PLAN[attempt - 1]! - tick : 0
  return { attempt, left, manual: attempt > PLAN.length }
}

// ---------------------------------------------------------------------------
// Announcing. Both regions are in the tree from the start and empty, the way TextureFailures
// does it: a live region created together with its text is a region nobody was listening to.
// ---------------------------------------------------------------------------
// The contact sheet shows nine states at once; nine live regions would all speak over each
// other and say nothing. Only the interactive view announces.
const Quiet = createContext(false)

function Announce({ besked }: { besked: Besked }) {
  const quiet = useContext(Quiet)
  const said = quiet ? '' : `${besked.rubrik}${besked.text ? `. ${besked.text}` : ''}`
  return (
    <>
      <p className="pe-sr" role="status" style={SR}>{besked.live === 'polite' ? said : ''}</p>
      <p className="pe-sr" role="alert" style={SR}>{besked.live === 'assertive' ? said : ''}</p>
    </>
  )
}
const SR: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', margin: 0 }

// The heading takes focus when a state replaces a whole view, so a keyboard reader is not left
// at the top of a document that no longer holds what they were reading.
function useHeadingFocus(active: boolean) {
  const quiet = useContext(Quiet)
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (active && !quiet) ref.current?.focus()
  }, [active, quiet])
  return ref
}

function Countdown({ retry }: { retry: { attempt: number; left: number; manual: boolean } }) {
  if (retry.manual) return <span className="pe-countdown">Vi har försökt {PLAN.length} gånger. Nästa försök gör du.</span>
  return (
    <span className="pe-countdown">
      <span className="pe-spin" aria-hidden="true" />
      Nytt försök om {retry.left} s · försök {retry.attempt} av {PLAN.length}
    </span>
  )
}

function Body({ besked, headingId, focusHeading, retry, spinner, lead }: { besked: Besked; headingId: string; focusHeading?: boolean; retry?: ReturnType<typeof useRetry>; spinner?: boolean; lead?: ReactNode }) {
  const ref = useHeadingFocus(focusHeading === true)
  return (
    <div className="pe-besked">
      <span className="pe-mark">{besked.mark}</span>
      <h2 id={headingId} ref={ref} tabIndex={-1}>
        {spinner === true && <span className="pe-spin" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: '-3px', marginRight: 10 }} />}
        {besked.rubrik}
      </h2>
      {besked.text !== '' && <p>{besked.text}</p>}
      {retry && <Countdown retry={retry} />}
      {(besked.acts.length > 0 || lead) && (
        <div className="pe-acts">
          {lead}
          {besked.acts.map((a) => (
            <button key={a.label} type="button" className="pe-btn" {...(a.primary === true && !lead ? { 'data-primary': '' } : {})}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The mocked routes. Identical in all three variants, so that what differs between the
// variants is only what happens to them.
// ---------------------------------------------------------------------------
const CARDS = ['Drake', 'Riddare', 'Fallgrop', 'Smedjan', 'Krogen', 'Snara']
const ACTION: Record<Scene, string> = { bord: 'Vänd kortet', telefon: 'Spela kortet', editor: 'Uppdatera bordet' }

function SceneBody({ scene, stale = false, empty = false, inline }: { scene: Scene; stale?: boolean; empty?: boolean; inline?: ReactNode }) {
  const head =
    scene === 'editor' ? (
      <header><strong style={{ letterSpacing: 0 }}>Skogens herrar</strong><span className="pe-dim">rev 12</span><span className="pe-sp" /><button type="button" className="pe-btn">Spara</button></header>
    ) : (
      <header><span className="pe-dim">Rum</span><strong>4KJ2</strong><span className="pe-sp" /><span className="pe-dim">{scene === 'telefon' ? 'Plats B · Nina' : '4 spelare'}</span></header>
    )
  const middle = empty ? (
    <div className="pe-blank" />
  ) : scene === 'bord' ? (
    <div className="pe-felt">
      <div className="pe-felt-row">
        <div className="pe-pile">Draghög<br />24</div>
        {CARDS.slice(0, 3).map((c) => <div key={c} className="pe-card">{c}</div>)}
        <div className="pe-pile">Kasthög<br />7</div>
      </div>
      <div className="pe-felt-row">{CARDS.slice(3, 6).map((c) => <div key={c} className="pe-card">{c}</div>)}</div>
    </div>
  ) : scene === 'telefon' ? (
    <div className="pe-phone">
      <div className="pe-mini">
        <div className="pe-pile">Draghög<br />24</div>
        {CARDS.slice(0, 2).map((c) => <div key={c} className="pe-card">{c}</div>)}
      </div>
      <div className="pe-hand">{CARDS.slice(0, 4).map((c) => <div key={c} className="pe-card">{c}</div>)}</div>
    </div>
  ) : (
    <div className="pe-wall">{[...CARDS, ...CARDS].map((c, i) => <div key={`${c}${String(i)}`} className="pe-card">{c}</div>)}</div>
  )
  return (
    <div className="pe-scene" data-stale={stale} {...(empty ? { 'data-void': '' } : {})} {...(stale ? { 'aria-busy': true } : {})}>
      {head}
      {middle}
      <footer>
        <button
          type="button"
          className={`pe-btn${inline ? ' pe-refused' : ''}`}
          data-primary=""
          {...(inline ? { 'aria-describedby': 'pe-inline-msg' } : {})}
        >
          {ACTION[scene]}
        </button>
        <button type="button" className="pe-btn">Ångra</button>
        {inline}
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A — one helsidesbesked. Anything that blocks takes the whole view; anything that does not is
// a line at the top. One component, one wording, every route.
// ---------------------------------------------------------------------------
function VariantA({ state, scene }: { state: StateKey; scene: Scene }) {
  const b = base(state)
  const [tries, setTries] = useState(1)
  useEffect(() => setTries(1), [state])
  // The two states that do not block: nothing has stopped being true, so the view stays.
  if (state === 'återansluten' || state === 'avvisad') {
    return (
      <div className="pe-frame pe-rows">
        <div className={`pe-strip pe-tone-${b.tone}`}>
          <div className="pe-besked pe-tight"><h2>{b.rubrik}</h2>{b.text !== '' && <p>{b.text}</p>}</div>
        </div>
        <SceneBody scene={scene} />
        <Announce besked={b} />
      </div>
    )
  }
  const waiting = state === 'laddar' || state === 'ansluter'
  // The retry is a button and only a button, and it says which attempt this is, so it is
  // visibly a request being made again and not the page reloading itself in a circle.
  const showRetry = b.retryable && !waiting
  const acts = showRetry ? b.acts.filter((a) => !a.label.startsWith('Försök')) : b.acts
  return (
    <div className="pe-frame">
      <div className={`pe-full pe-tone-${b.tone}`}>
        <Body
          besked={{ ...b, acts }}
          headingId="pe-a-h"
          focusHeading
          spinner={waiting}
          {...(showRetry ? { lead: <button type="button" className="pe-btn" data-primary="" onClick={() => setTries((n) => n + 1)}>Försök igen</button> } : {})}
        />
        {showRetry && <p className="pe-tries">Försök {tries} · sidan laddas inte om, vi frågar bara servern en gång till.</p>}
      </div>
      <Announce besked={b} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// B — one strip, always in the tree, empty when nothing is wrong. Nothing ever takes the view;
// what cannot be trusted behind the strip is dimmed and taken out of the tab order.
// ---------------------------------------------------------------------------
function VariantB({ state, scene }: { state: StateKey; scene: Scene }) {
  const b = base(state)
  // Everything the transport can fix, the transport retries by itself; the countdown is what
  // makes that visible rather than a page that keeps blinking for reasons nobody can see.
  const retry = useRetry(b.retryable)
  const stale = state === 'tappad'
  const empty = state !== 'tappad' && !HAS_DATA.has(state)
  const acts = b.acts.filter((a) => !a.label.startsWith('Försök'))
  return (
    <div className="pe-frame pe-rows">
      <div className={`pe-strip pe-tone-${b.tone}`}>
        <div className="pe-besked pe-tight">
          <h2 id="pe-b-h">{b.rubrik}</h2>
          {b.text !== '' && <p>{b.text}</p>}
        </div>
        {b.retryable && <Countdown retry={retry} />}
        <div className="pe-acts">
          {b.retryable && <button type="button" className="pe-btn" data-primary="">Försök nu</button>}
          {acts.map((a) => <button key={a.label} type="button" className="pe-btn" {...(a.primary === true && !b.retryable ? { 'data-primary': '' } : {})}>{a.label}</button>)}
        </div>
      </div>
      <div className="pe-under" {...(stale || empty ? { inert: true } : {})}>
        <SceneBody scene={scene} stale={stale} empty={empty} />
      </div>
      <Announce besked={b} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// C — the same nine states, but each route decides where the message stands and says it in its
// own words: a card the room can read on the TV, a sheet under the thumb on the phone, a bar in
// the chrome where the save status already lives in the editor. A refusal is inline, at the
// control that caused it.
// ---------------------------------------------------------------------------
function VariantC({ state, scene }: { state: StateKey; scene: Scene }) {
  const b = forScene(state, scene)
  // Only the transport retries itself. A 404 retried is a 404, and a refusal is an answer.
  const retry = useRetry(b.retryable && HAS_DATA.has(state))
  // A refusal belongs at the control that was refused, not at the top of the document.
  if (state === 'avvisad') {
    const inline = (
      <span id="pe-inline-msg" className={`pe-inline pe-tone-${b.tone}`}>
        {b.rubrik}{b.text !== '' && ` — ${b.text.replace(/\.$/, '')}`}
      </span>
    )
    return (
      <div className="pe-frame">
        <SceneBody scene={scene} inline={inline} />
        <Announce besked={b} />
      </div>
    )
  }
  // Nothing behind worth keeping: the route says its own sentence, over the whole view.
  if (!HAS_DATA.has(state)) {
    const waiting = state === 'laddar' || state === 'ansluter'
    return (
      <div className="pe-frame">
        <div className={`pe-full pe-tone-${b.tone}`}>
          <Body besked={b} headingId="pe-c-h" focusHeading spinner={waiting} />
        </div>
        <Announce besked={b} />
      </div>
    )
  }
  // Data behind: the room reads a card across the felt, the thumb reaches a sheet, and the
  // editor already has a place where "saved / not saved" lives.
  const stale = state === 'tappad'
  if (scene === 'editor') {
    return (
      <div className="pe-frame pe-rows">
        <div className={`pe-bar pe-tone-${b.tone}`}>
          <div className="pe-besked pe-tight"><h2>{b.rubrik}</h2>{b.text !== '' && <p>{b.text}</p>}</div>
          {stale && <Countdown retry={retry} />}
          <div className="pe-acts">{b.acts.map((a) => <button key={a.label} type="button" className="pe-btn" {...(a.primary === true ? { 'data-primary': '' } : {})}>{a.label}</button>)}</div>
        </div>
        <div className="pe-under" {...(stale ? { inert: true } : {})}><SceneBody scene={scene} stale={stale} /></div>
        <Announce besked={b} />
      </div>
    )
  }
  return (
    <div className="pe-frame">
      <div className="pe-under" {...(stale ? { inert: true } : {})}><SceneBody scene={scene} stale={stale} /></div>
      <div className={`${scene === 'bord' ? 'pe-card-mid' : 'pe-sheet'} pe-tone-${b.tone}`}>
        <Body besked={b} headingId="pe-c-h" {...(stale ? { retry } : {})} />
      </div>
      <Announce besked={b} />
    </div>
  )
}


// ---------------------------------------------------------------------------
export function ErrorsPrototype() {
  const q = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(q.get('variant') ?? 'A')
  const [state, setState] = useState<StateKey>((q.get('läge') as StateKey | null) ?? 'tappad')
  const [scene, setScene] = useState<Scene>((q.get('vy') as Scene | null) ?? (window.innerWidth < 700 ? 'telefon' : 'bord'))
  const sheet = q.has('alla')
  useEffect(() => {
    document.title = documentTitle(state, scene)
  }, [state, scene])
  const change = (k: string) => {
    setVariant(k)
    const next = new URLSearchParams(location.search)
    next.set('variant', k)
    history.replaceState(null, '', `?${next}`)
  }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  return (
    <div className="pe" {...(sheet ? { 'data-sheet': '' } : {})}>
      <div className="pe-rail">
        <div className="pe-rail-row">
          <b>Vy</b>
          {SCENES.map((s) => <button key={s.key} type="button" className="pe-chip" aria-pressed={scene === s.key} onClick={() => setScene(s.key)}>{s.label}</button>)}
          <span className="pe-sp" />
          <span className="pe-title-line">titel: {documentTitle(state, scene)}</span>
        </div>
        {!sheet && (
          <div className="pe-rail-row">
            <b>Läge</b>
            {STATES.map((s) => <button key={s.key} type="button" className="pe-chip" aria-pressed={state === s.key} onClick={() => setState(s.key)}>{s.label}</button>)}
          </div>
        )}
      </div>
      {sheet ? (
        <Quiet.Provider value={true}>
          <div className="pe-sheetgrid">
            {STATES.map((s) => (
              <figure key={s.key} className="pe-cell">
                <figcaption>{s.label}</figcaption>
                <div className="pe-frame"><V state={s.key} scene={scene} /></div>
              </figure>
            ))}
          </div>
        </Quiet.Provider>
      ) : (
        <div className="pe-viewport"><V state={state} scene={scene} /></div>
      )}
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}
