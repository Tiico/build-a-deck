import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { DecksterMark } from '../brand/DecksterMark.js'
import { WOOD_EDGE } from '../brand/mark.js'
import { CardPreview } from '../editor/CardPreview.js'
import { LanguagePicker, useLang, useT } from '../i18n/index.js'
import { AboutLine } from './AboutLine.js'
import { CodeRow } from './CodeRow.js'
import { markPitchSeen } from './pitch.js'
import { loginUrl } from './session.js'
import { LANDING_BACK, LANDING_FACE, landingCards, type LandingCard } from './landingDeck.js'
import { ArrowGlyph } from '../glyphs.js'
import './landing.css'

// `/` for whoever is not logged in (#1009, beställarens beslut 2026-10-18, variant A «Bordet»): what
// the product is, said with a laid table rather than a sentence, and two doors. The maker's door
// is a link to the start page of the editor, through the login card at `/login` as every other
// way in; the player's is the code row (#675), on the first screen as it was under the card.
//
// It is a room of the account's in the button language (#44): its first action is the account's
// green fill, its second the account's outline, and the code row's button is drawn as it was under
// the login card. Only the shape is the page's own, a pill.
//
// The page is the sales line L36 grown up, so a visit here counts as the line having been seen:
// the login card a visitor reaches from here would otherwise sell her the product a second time.
export function LandingPage({ http, server, onNavigate }: { http: string; server: string | null; onNavigate(url: string): void }) {
  const t = useT()
  const { lang } = useLang()
  const cards = useMemo(() => landingCards(lang), [lang])
  const login = loginUrl(location.pathname + location.search, server)
  useEffect(() => markPitchSeen(), [])
  const [owl, oak, mist, fox, queen] = cards as [LandingCard, LandingCard, LandingCard, LandingCard, LandingCard]
  return (
    <div className="byd-account byd-landing" data-page="home" data-landing>
      <header className="byd-landing-head">
        <span className="byd-landing-mark">
          {/* The product's one mark (#1082), on the room's own dark. */}
          <DecksterMark className="byd-landing-logo" edge={WOOD_EDGE} />
          <span className="byd-landing-name">Deckster</span>
        </span>
        <nav aria-label={t('landing.nav')}>
          <a className="byd-landing-quiet" href="#byd-landing-steps">
            {t('landing.how')}
          </a>
          <a className="byd-landing-btn byd-secondary" href={login} data-landing-door="games">
            {t('landing.games')}
          </a>
        </nav>
      </header>

      <main>
        <section className="byd-landing-hero" aria-labelledby="byd-landing-title">
          <div className="byd-landing-pitch">
            <p className="byd-landing-eyebrow">{t('landing.eyebrow')}</p>
            <h1 id="byd-landing-title">
              {t('landing.title.build')} <em>{t('landing.title.play')}</em>
            </h1>
            <p className="byd-landing-lede">{t('landing.lede')}</p>
            <div className="byd-landing-ctas">
              <a className="byd-landing-btn byd-primary" href={login} data-landing-door="build">
                {t('landing.build')}
                <ArrowGlyph to="right" />
              </a>
              <span className="byd-landing-fine">{t('landing.fine')}</span>
            </div>
            <div className="byd-landing-code">
              <CodeRow server={server} onNavigate={onNavigate} />
            </div>
          </div>
          <Scene owl={owl} oak={oak} mist={mist} fox={fox} queen={queen} />
        </section>

        <section className="byd-landing-steps" id="byd-landing-steps" aria-labelledby="byd-landing-steps-title">
          <h2 id="byd-landing-steps-title">{t('landing.steps.title')}</h2>
          <ol>
            <li>
              <div className="byd-landing-pic byd-landing-rows" aria-hidden="true">
                <div>
                  <span>{t('landing.rows.title')}</span>
                  <span>{t('landing.rows.cost')}</span>
                  <span>{t('landing.rows.type')}</span>
                </div>
                {[owl, oak, mist].map((c, i) => (
                  <div key={c.id} {...(i === 1 ? { 'data-hot': '' } : {})}>
                    <span>{c.title}</span>
                    <span>{c.row['cost']}</span>
                    <span>{c.row['typ']}</span>
                  </div>
                ))}
              </div>
              <h3>{t('landing.step.rows')}</h3>
              <p>{t('landing.step.rows.body')}</p>
            </li>
            <li>
              <div className="byd-landing-pic byd-landing-template" aria-hidden="true">
                <Card card={owl} at="step" w={86} turn={-6} />
                <Card card={oak} at="step" w={86} turn={8} />
              </div>
              <h3>{t('landing.step.template')}</h3>
              <p>{t('landing.step.template.body')}</p>
            </li>
            <li>
              <div className="byd-landing-pic byd-landing-feltpic" aria-hidden="true">
                <div className="byd-landing-zone" style={{ left: '8%', width: '24%' }}>
                  <b>{t('landing.zone.draw')}</b>
                  <Back at="step" w={46} />
                </div>
                <div className="byd-landing-zone" style={{ left: '40%', width: '52%' }}>
                  <b>{t('landing.zone.middle')}</b>
                  <Card card={mist} at="step" w={46} turn={-5} />
                  <Card card={queen} at="step" w={46} turn={4} />
                </div>
              </div>
              <h3>{t('landing.step.table')}</h3>
              <p>{t('landing.step.table.body')}</p>
            </li>
            <li>
              <div className="byd-landing-pic byd-landing-talk" aria-hidden="true">
                <p style={{ '--seat': 'var(--byd-landing-seat-1)' } as CSSProperties}>
                  <i />
                  {t('landing.talk.unclear', { card: fox.title })}
                </p>
                <p style={{ '--seat': 'var(--byd-landing-seat-2)' } as CSSProperties}>
                  <i />
                  {t('landing.talk.strong', { card: oak.title })}
                </p>
                <p data-version>
                  <b>v2</b> {t('landing.talk.v2')}
                </p>
              </div>
              <h3>{t('landing.step.learn')}</h3>
              <p>{t('landing.step.learn.body')}</p>
            </li>
          </ol>
        </section>

        <section className="byd-landing-end" aria-labelledby="byd-landing-end-title">
          <div>
            <h2 id="byd-landing-end-title">{t('landing.end.title')}</h2>
            <p>{t('landing.end.body')}</p>
          </div>
          <a className="byd-landing-btn byd-primary" href={login} data-landing-door="end">
            {t('landing.end.go')}
            <ArrowGlyph to="right" />
          </a>
        </section>
      </main>

      <footer className="byd-landing-foot">
        <label className="byd-lang">
          {t('account.language')}
          <LanguagePicker />
        </label>
        <AboutLine http={http} />
      </footer>
    </div>
  )
}

// The laid table: a felt on wood with a draw pile, two cards in the middle, cards dealt off the pile
// and three phones holding hands. All of it is a picture, and said once as one: what it shows is
// what the heading beside it says.
function Scene({ owl, oak, mist, fox, queen }: Record<'owl' | 'oak' | 'mist' | 'fox' | 'queen', LandingCard>) {
  const t = useT()
  const seats = [
    { name: 'Ada', seat: 1, hand: [owl, mist, queen], turn: true },
    { name: 'Cleo', seat: 3, hand: [mist, fox, oak], turn: false },
    { name: 'Bo', seat: 2, hand: [queen, oak, owl], turn: false },
  ]
  // The table is drawn once, in a frame of its own size, and zoomed to the width its column has: a
  // laid table is a picture, and a picture keeps its proportions when the page narrows rather than
  // having each card, phone and pile reflow on its own. Measured before the first paint, so the
  // table is never seen at the wrong size.
  const frame = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = frame.current
    if (!box) return
    const fit = () => box.style.setProperty('--byd-landing-scene-zoom', String(box.clientWidth / SCENE_W))
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(fit)
    watch.observe(box)
    return () => watch.disconnect()
  }, [])
  return (
    <div className="byd-landing-scene" ref={frame} role="img" aria-label={t('landing.scene')}>
      <div className="byd-landing-table">
      <div className="byd-landing-wood">
        <div className="byd-landing-felt">
          <div className="byd-landing-zone" style={{ left: '5%', width: '20%' }}>
            <b>{t('landing.zone.draw.count', { count: 48 })}</b>
          </div>
          <div className="byd-landing-zone" style={{ left: '32%', width: '63%' }}>
            <b>{t('landing.zone.middle')}</b>
          </div>
          <div className="byd-landing-deal">
            <Back at="pile" />
            {DEALS.map((d, i) => (
              <Back key={i} at="flying" style={{ '--d': `${d.delay}s`, '--x': d.x, '--y': d.y, '--r': d.turn } as CSSProperties} />
            ))}
          </div>
          <div className="byd-landing-played">
            <Card card={oak} at="played" turn={-4} />
            <Card card={fox} at="played" turn={3} />
          </div>
        </div>
      </div>
      {seats.map((s) => (
        <div key={s.name} className="byd-landing-phone" data-seat={s.seat} style={{ '--seat': `var(--byd-landing-seat-${s.seat})` } as CSSProperties}>
          <div className="byd-landing-screen">
            <div className="byd-landing-bar" />
            <div className="byd-landing-who">
              <i />
              {s.name}
            </div>
            <div className="byd-landing-front">
              <b>{t('landing.phone.front')}</b>
            </div>
            {s.turn && <span className="byd-landing-turn">{t('landing.phone.turn')}</span>}
            <div className="byd-landing-hand">
              {s.hand.map((c, i) => (
                <Card key={c.id} card={c} at="hand" turn={(i - 1) * 16} />
              ))}
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}

// The size the table is drawn at, before it is zoomed to its column (`landing.css` says the same).
const SCENE_W = 700

// Where the cards dealt off the pile land before they fade: towards each phone, on the felt.
const DEALS = [
  { delay: 0, x: '-20%', y: '120%', turn: '-14deg' },
  { delay: 0.35, x: '520%', y: '120%', turn: '14deg' },
  { delay: 0.7, x: '250%', y: '130%', turn: '3deg' },
  { delay: 1.05, x: '-20%', y: '120%', turn: '-8deg' },
  { delay: 1.4, x: '520%', y: '120%', turn: '8deg' },
]

// A card on the landing page, drawn by the one renderer at its own size and zoomed to the width the
// stylesheet gives its place (`--byd-landing-card-w`, in pixels without the unit, because a zoom is a
// number), so the same card is the same drawing on a phone in the scene and in a step below.
type Place = 'played' | 'hand' | 'step' | 'pile' | 'flying'
let drawn = 0
function Card({ card, at, w, turn = 0 }: { card: LandingCard; at: Place; w?: number; turn?: number }) {
  const id = useMemo(() => `byd-landing-${card.id}-${++drawn}`, [card.id])
  return (
    <span className="byd-landing-card" data-at={at} style={{ '--turn': `${turn}deg`, ...(w ? { '--byd-landing-card-w': w } : {}) } as CSSProperties}>
      <CardPreview id={id} face={LANDING_FACE} row={card.row} icons={NO_ICONS} palette={undefined} />
    </span>
  )
}

function Back({ at, w, style }: { at: Place; w?: number; style?: CSSProperties }) {
  const id = useMemo(() => `byd-landing-back-${++drawn}`, [])
  return (
    <span className="byd-landing-card" data-at={at} style={{ ...style, ...(w ? { '--byd-landing-card-w': w } : {}) } as CSSProperties}>
      <CardPreview id={id} face={LANDING_BACK} row={NO_ROW} icons={NO_ICONS} palette={undefined} />
    </span>
  )
}

const NO_ICONS: Record<string, string> = {}
const NO_ROW = {}
