// Genererar prototypen för #449: var ett kort hamnar i en publik yta när den som spelar inte
// har pekat.
//
// Prototypen till #414 (`generera-414.ts`, mergad i `a15eb530`) mätte fram frågan: telefonen
// skickar ingen position, alla tre korten får `x: 0, y: 0`, och det man ser är det första Nina
// spelade. Den här sidan svarar på var de i stället ska hamna, och gör det på produktens egna
// funktioner i stället för på ritade rutor:
//
//  · Bordet är `openingSetup` i `packages/server/src/recipe.ts` — wizardens startbord — lagt ut
//    av `setupFromProject` och byggt av `initialState` i `packages/engine`.
//  · Korten är `compile` i `packages/template`, den enda renderaren (E2), i 63 × 88 mm och satta
//    i startramen `DEFAULT_FRAME` ur `packages/web/src/wizard/frames.ts`.
//  · Handlingarna är `playIntents` i `packages/web/src/player/play.ts` — importerad, inte
//    avskriven — körd genom `apply` i motorn.
//  · Kandidaten «radvis» är `slotIn` i `packages/web/src/table/keyboard.ts`, ordagrant och
//    importerad: regeln produkten redan har på sin tangentbordsväg.
//  · Kandidaten «fjädrat» steg är `HAND_STEP_MM` ur `packages/web/src/table/hand.ts`.
//  · Skalan är `fitScale`, `TV_AIR_PX`, `feltWithHands`, `handExtent` och `turnToFit` ur
//    `packages/web/src/table/fit.ts` och `hand.ts`, ställda som `TableRenderer` ställer dem i
//    tv-läge — inte en egen uträkning som liknar dem.
//  · Var ett kort ritas är `absoluteOf` i `packages/web/src/table/drop.ts`, på snapshotten ur
//    `project` — den enda vägen från tillstånd till tråd.
//  · Att ett kort ligger kvar på filten prövas med `keptOnFelt` ur samma modul.
//
// Körs med:
//   packages/server/node_modules/.bin/tsx docs/ux-audits/2026-09-22/generera-449.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { SCHEMA_VERSION, type Applied, type Intent, type Snapshot, type VisibleComponentState, type ZoneView } from '../../../packages/protocol/src/index.js'
import { CARD_STANDARD_63x88, TOKEN_COUNTER, TypeRegistry, apply, initialState, project, type TableState } from '../../../packages/engine/src/index.js'
import { counterSpots, edgeOf, feltFor, handGeometry, inFront, countersAt, openingSetup, CHIP_MM, MAX_PLAYERS, SEAT_IDS, type Setup } from '../../../packages/server/src/recipe.js'
import { setupFromProject } from '../../../packages/server/src/setup.js'
import { facesOf, type Deck } from '../../../packages/server/src/faces.js'
import { DEFAULT_FRAME, type Field } from '../../../packages/web/src/wizard/frames.js'
import { compile, type Compiled } from '../../../packages/template/src/index.js'
import { playIntents } from '../../../packages/web/src/player/play.js'
import { slotIn } from '../../../packages/web/src/table/keyboard.js'
import { HAND_CARD_MM, HAND_STEP_MM, FAN_MAX, feltWithHands, handExtent, handRotation } from '../../../packages/web/src/table/hand.js'
import { CARD_MM, absoluteOf, ontoFelt } from '../../../packages/web/src/table/drop.js'
import { TV_AIR_PX, fitScale, turnToFit } from '../../../packages/web/src/table/fit.js'

const HÄR = new URL('.', import.meta.url).pathname
const måste = <T,>(v: T | undefined | null, vad: string): T => {
  if (v === undefined || v === null) throw new Error(`saknas: ${vad}`)
  return v
}

// ── Vakter ──────────────────────────────────────────────────────────────────────────────────
// En prototyp som påstår något ska falla när påståendet slutar vara sant. De körs innan sidan
// skrivs, och kastar hellre än skriver en sida som ljuger.
const vakter: { vad: string; svar: string }[] = []
function vakt(vad: string, villkor: boolean, svar: string): void {
  if (!villkor) throw new Error(`vakten föll: ${vad} — ${svar}`)
  vakter.push({ vad, svar })
}

const KÄLLA = (fil: string): string => readFileSync(`${HÄR}../../../${fil}`, 'utf8')

// ── Vad produkten säger om sig själv, läst ur koden ──────────────────────────────────────────
const PLAY = KÄLLA('packages/web/src/player/play.ts')
vakt(
  '`playIntents` tar emot en punkt som telefonen aldrig ger den',
  PLAY.includes("at?: { x: number; y: number }") && PLAY.includes("...(at ? { x: at.x, y: at.y } : {})"),
  'parametern `at` står kvar i play.ts — en placeringsregel behöver alltså inget nytt verb',
)
const SURFACE = KÄLLA('packages/web/src/player/PlayerSurface.tsx')
vakt(
  'telefonen skickar `undefined` som punkt, båda vägarna',
  (SURFACE.match(/playIntents\(view, \w+, zone, undefined, at\)/g) ?? []).length === 2,
  'både `play` och `playDirect` i PlayerSurface.tsx lämnar punkten tom',
)
const KEYBOARD = KÄLLA('packages/web/src/table/keyboard.ts')
vakt(
  '`slotIn` säger själv att den är en gissning och inte ett beslut',
  KEYBOARD.includes("This is the prototype's guess, not a product decision"),
  'raden står kvar i keyboard.ts',
)
const BESLUT = KÄLLA('DESIGN-BESLUT.md').split('\n')
const RAD_ÖPPEN = BESLUT.findIndex((r) => r.startsWith('Utläggningsregeln för ett kort som flyttas till en yta'))
vakt(
  'frågan står redan som öppen fråga i DESIGN-BESLUT.md',
  RAD_ÖPPEN > 0,
  `den står på rad ${RAD_ÖPPEN + 1}, i avsnitt I, och är den rad #449 stänger`,
)
const ÖPPEN_FRÅGA = måste(BESLUT[RAD_ÖPPEN], 'den öppna frågan')
const RECIPE = KÄLLA('packages/server/src/recipe.ts')
vakt(
  'receptets genväg «Framför mig» säger `at: \'top\'`',
  RECIPE.includes("mineShortcut: 'Framför mig'") && RECIPE.includes("{ label: words.mineShortcut, at: 'top' }"),
  'raden står kvar i recipe.ts — och `top` i en yta betyder `index 0`, som ritas underst',
)
const RENDERER = KÄLLA('packages/web/src/table/TableRenderer.tsx')
vakt(
  'filten ritar de lösa korten i zonens ordning och sätter ingen z-ordning',
  RENDERER.includes('{loose.map((c) => {') && !/z-?[Ii]ndex/.test(RENDERER),
  'det som står först i ordningen målas först och hamnar alltså underst',
)
const DROP = KÄLLA('packages/web/src/table/drop.ts')
vakt(
  'en dragning skickar `move` med en punkt',
  DROP.includes("({ v: 'move', component: id, to: dest.zone, x: dest.x + s.x, y: dest.y + s.y })"),
  'raden står kvar i drop.ts — det är vad «dra dit för hand» betyder på tråden',
)

// ── Leken ───────────────────────────────────────────────────────────────────────────────────
const FÄLT: Field[] = [
  { key: 'title', label: 'Titel', kind: 'text' },
  { key: 'cost', label: 'Kostnad', kind: 'number' },
  { key: 'body', label: 'Text', kind: 'text' },
  { key: 'art', label: 'Bild', kind: 'image' },
]

function bild(himmel: string, ljus: string, mark: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 144"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${himmel}"/><stop offset="1" stop-color="${mark}"/></linearGradient></defs><rect width="220" height="144" fill="url(#g)"/><circle cx="168" cy="36" r="17" fill="${ljus}" opacity="0.85"/><path d="M0 120 L36 74 L72 120 Z" fill="${mark}" opacity="0.9"/><path d="M52 124 L96 62 L140 124 Z" fill="${mark}"/><path d="M124 122 L164 78 L204 122 Z" fill="${mark}" opacity="0.8"/><rect y="118" width="220" height="26" fill="${mark}"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

const PALETT: [string, string, string][] = [
  ['#2d5a3d', '#7fa86b', '#1b3527'],
  ['#4a3a5c', '#c9a86b', '#2a2036'],
  ['#5c3a2d', '#e0b06a', '#2e1c14'],
  ['#2d465c', '#8fc4e0', '#152430'],
]
const TITLAR = ['Björnen', 'Vargen', 'Räven', 'Lodjuret', 'Älgen', 'Korpen', 'Uven', 'Grävlingen', 'Hjorten', 'Ekorren', 'Mården', 'Ormen', 'Haren', 'Ugglan', 'Lommen', 'Igelkotten', 'Skatan', 'Bävern', 'Utter', 'Järven', 'Vesslan', 'Duvan', 'Sälen', 'Tranan']
const RADER = TITLAR.map((titel, i) => ({
  id: `kort-${i + 1}`,
  fields: {
    title: titel,
    cost: String((i % 4) + 1),
    body: 'När den kommer i spel: dra ett kort.\n\nSå länge den står kvar får dina djur +1 i styrka.',
    art: bild(...måste(PALETT[i % PALETT.length], 'palett')),
  },
}))

const NAMN: Record<string, string> = { A: 'Nina', B: 'Olle', C: 'Cissi', D: 'Dag', E: 'Ester', F: 'Frans', G: 'Greta', H: 'Hugo' }
const registry = new TypeRegistry([CARD_STANDARD_63x88, TOKEN_COUNTER])
const template = { faces: { front: DEFAULT_FRAME.front(FÄLT), back: DEFAULT_FRAME.back } }
const deckRows = Object.fromEntries(RADER.map((r) => [r.id, r.fields]))
// Startramen är satt i EB Garamond, som inte reser med bygget (B3, #420). Filen ligger i den här
// katalogen sedan #420 och pinnas här, så att kortet på filten är satt i det ansikte ramen ber om.
const FONTS = { 'EB Garamond': { stack: '"EB Garamond", serif', asset: 'asset:eb-garamond', src: '../typsnitt/eb-garamond.woff2' } }

// Var titeln står på startramens framsida, läst ur ramen själv och inte gissad. Det är den ruta
// som avgör om ett kort går att *namnge* när ett annat ligger över det — till skillnad från att
// bara gå att räkna.
const TITELRUTA = (() => {
  const el = template.faces.front.base.find((e) => e.id === 'title')
  if (!el || !('w' in el) || !('h' in el)) throw new Error('ramen har ingen titelruta')
  return { x: el.x, y: el.y, w: el.w, h: el.h }
})()
vakt(
  'startramens titel står mitt på kortet och inte längs en kant',
  TITELRUTA.y > CARD_MM.h * 0.4 && TITELRUTA.y + TITELRUTA.h < CARD_MM.h * 0.65,
  `titelrutan är ${TITELRUTA.w} × ${TITELRUTA.h} mm och börjar ${TITELRUTA.y} mm ned på ett ${CARD_MM.h} mm högt kort`,
)

// ── Kandidaterna ────────────────────────────────────────────────────────────────────────────
// Fyra regler ur issuet plus nuläget. Tre av dem räknar ut en punkt på klienten och skickar den
// med `move`, precis som en dragning gör; den fjärde är en utläggning i renderaren som räknas om
// varje gång zonen ändras, och den är därför den enda som kan flytta ett kort någon lagt själv.
type Kandidat = 'nu' | 'rad' | 'fjader' | 'stapel' | 'packa'
type Punkt = { x: number; y: number }

// Staplingens förskjutning. KONSTRUERAD: produkten har inget sådant mått, och issuet ber om
// «en aning förskjutet». Tio millimeter är valt för att vara den minsta förskjutning som syns
// på en TV vid åtta platser — vid 0,743 px/mm är det 7,4 px — och sidan säger att talet är valt.
const STAPEL_MM = 10
// Packningens luft mellan två kort när de får plats med råge. KONSTRUERAD, av samma skäl.
const PACK_LUFT = 6

// Zonens långa och korta axel: en yta framför en plats vid norr eller söder är liggande,
// en vid öster eller väster är stående. Reglerna räknar längs den långa axeln.
const liggande = (g: { w: number; h: number }): boolean => g.w >= g.h

// «Fjädrat», som handen: steget är `HAND_STEP_MM` — produktens eget mått på hur långt två kort i
// en läst fjäder sitter isär — och korten centreras över den korta axeln.
function fjadrat(g: { w: number; h: number }, i: number): Punkt {
  return liggande(g) ? { x: i * HAND_STEP_MM, y: (g.h - CARD_MM.h) / 2 } : { x: (g.w - CARD_MM.w) / 2, y: i * HAND_STEP_MM }
}

// «Staplat med förskjutning»: varje nytt kort en aning ned och åt höger.
function staplat(g: { w: number; h: number }, i: number): Punkt {
  return { x: (g.w - CARD_MM.w) / 2 + i * STAPEL_MM, y: (g.h - CARD_MM.h) / 2 + i * STAPEL_MM }
}

// «Zonen packar själv»: alla `n` kort läggs ut på nytt varje gång, jämnt längs den långa axeln,
// med steget krympt tills de ryms hela. Det är den enda kandidaten som inte kan lägga ett kort
// utanför sin zon — och den enda som räknar om ett kort någon annan har lagt.
function packat(g: { w: number; h: number }, i: number, n: number): Punkt {
  const längs = liggande(g) ? g.w : g.h
  const kort = liggande(g) ? CARD_MM.w : CARD_MM.h
  const steg = n <= 1 ? 0 : Math.min(kort + PACK_LUFT, (längs - kort) / (n - 1))
  const bredd = kort + steg * (n - 1)
  const start = (längs - bredd) / 2
  return liggande(g) ? { x: start + i * steg, y: (g.h - CARD_MM.h) / 2 } : { x: (g.w - CARD_MM.w) / 2, y: start + i * steg }
}

// ── Ett bord, spelat ────────────────────────────────────────────────────────────────────────
const SPELAT_MAX = 10
type Körning = {
  kandidat: Kandidat
  platser: number
  state: TableState
  vy: Snapshot
  faces: Record<string, Record<string, string>>
  titles: Record<string, string>
  spelade: string[]
  // Det kort Nina själv drog dit, och var hon släppte det.
  draget: { id: string; släpptes: Punkt } | null
}

// Startbordet med ytorna framför platserna gjorda publika — beslutet i #414, som #449 blockerar.
function bordet(platser: number): Setup {
  const start = openingSetup({ players: platser, counters: [{ name: 'Poäng', start: 0 }] })
  return { ...start, zones: start.zones.map((z) => (z.id.startsWith('mine:') ? { ...z, visibility: 'all' as const } : z)) }
}

function kör(kandidat: Kandidat, platser: number, antal: number, medDraget = false): Körning {
  const setup = bordet(platser)
  const setupDef = setupFromProject({ rows: RADER, setup } as never)
  const { faces, titles } = facesOf({ template, rows: deckRows, icons: {}, fonts: { 'EB Garamond': { stack: FONTS['EB Garamond'].stack, src: FONTS['EB Garamond'].src } } } as Deck, setupDef, registry, 300, 0)
  let state = initialState({ project: 'skogens-herrar', revision: 1 } as never, setupDef, registry)
  let n = 0
  const gör = (intent: Intent, by: string | null): void => {
    const line: Applied = { schemaVersion: SCHEMA_VERSION, seq: state.seq + 1, batch: `b${++n}`, at: '2026-09-23T19:00:00.000Z', by, intent }
    state = apply(state, registry, line)
  }
  const seats = SEAT_IDS.slice(0, platser)
  for (const seat of seats) gör({ v: 'seat.claim', seat, name: måste(NAMN[seat], seat) }, null)
  const överst = (zone: string) => måste(state.zones[zone]?.order[0], `överst i ${zone}`)
  // Nina får korten på hand först; det är ur handen «Framför mig» spelar.
  for (let i = 0; i < antal + 1; i++) gör({ v: 'move', component: överst('draw'), to: 'hand:A' }, 'A')
  for (let i = 0; i < 3; i++) gör({ v: 'move', component: överst('draw'), to: 'hand:B' }, 'B')

  const zonAv = (vy: Snapshot): ZoneView => måste(vy.zones.find((z) => z.id === 'mine:A'), 'mine:A')
  const spelade: string[] = []
  let draget: Körning['draget'] = null

  const spela = (): void => {
    // Ninas egen projektion, som är den telefonen räknar ur.
    const vy = project(state, registry, 'A', { faces, titles })
    const hand = vy.components.filter((c) => c.zone === 'hand:A')
    const kort = måste(hand[0], 'kort på Ninas hand')
    const zon = zonAv(vy)
    const i = zon.mode === 'order' ? zon.order.length : zon.count
    const g = zon.geometry
    // Var regeln säger att kortet ska landa. `nu` säger ingenting — det är hela felet.
    const at: Punkt | undefined =
      kandidat === 'nu' ? undefined
      : kandidat === 'rad' ? slotIn(vy, 'mine:A')
      : kandidat === 'fjader' ? fjadrat(g, i)
      : kandidat === 'stapel' ? staplat(g, i)
      : packat(g, i, i + 1)
    // `playIntents`, importerad ur produkten: `move` plus `flip` i en publik målzon.
    for (const it of playIntents(vy, [kort], 'mine:A', at)) gör(it, 'A')
    spelade.push(kort.id)
  }

  const halva = Math.ceil(antal / 2)
  for (let i = 0; i < (medDraget ? halva : antal); i++) spela()
  if (medDraget) {
    // Ett kort Nina drar dit själv med fingret, långt från varje regels egna platser: bortre
    // änden av ytan. På tråden är det samma `move` som en dragning skickar, med en punkt.
    const vy = project(state, registry, 'A', { faces, titles })
    const kort = måste(vy.components.filter((c) => c.zone === 'hand:A')[0], 'kort på Ninas hand')
    const g = zonAv(vy).geometry
    const släpptes = liggande(g) ? { x: g.w - CARD_MM.w, y: g.h - CARD_MM.h } : { x: g.w - CARD_MM.w, y: g.h - CARD_MM.h }
    for (const it of playIntents(vy, [kort], 'mine:A', släpptes)) gör(it, 'A')
    draget = { id: kort.id, släpptes }
    for (let i = halva; i < antal; i++) spela()
  }

  return { kandidat, platser, state, vy: project(state, registry, null, { faces, titles }), faces, titles, spelade, draget }
}

// ── Vad regeln gör med filten, mätt ─────────────────────────────────────────────────────────
type Ruta = { x: number; y: number; w: number; h: number }
const skär = (a: Ruta, b: Ruta): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

// Hur stor del av rutan `mål` som inte täcks av någon ruta i `över`. Exakt, genom att komprimera
// koordinaterna: alla rutor är axelriktade, så ett rutnät av de förekommande kanterna räcker.
function synligDel(mål: Ruta, över: readonly Ruta[]): number {
  const area = mål.w * mål.h
  if (area <= 0) return 0
  const xs = [...new Set([mål.x, mål.x + mål.w, ...över.flatMap((r) => [r.x, r.x + r.w])])].filter((v) => v >= mål.x && v <= mål.x + mål.w).sort((a, b) => a - b)
  const ys = [...new Set([mål.y, mål.y + mål.h, ...över.flatMap((r) => [r.y, r.y + r.h])])].filter((v) => v >= mål.y && v <= mål.y + mål.h).sort((a, b) => a - b)
  let fri = 0
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const cell: Ruta = { x: måste(xs[i], 'x'), y: måste(ys[j], 'y'), w: måste(xs[i + 1], 'x') - måste(xs[i], 'x'), h: måste(ys[j + 1], 'y') - måste(ys[j], 'y') }
      if (cell.w <= 0 || cell.h <= 0) continue
      const mitt = { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 }
      if (!över.some((r) => mitt.x > r.x && mitt.x < r.x + r.w && mitt.y > r.y && mitt.y < r.y + r.h)) fri += cell.w * cell.h
    }
  }
  return fri / area
}

type KortMått = {
  id: string
  cardRef: string | null
  titel: string
  ruta: Ruta
  synlig: number
  titelSynlig: number
  helInomZon: boolean
  utanförMm: number
}
// Två ritordningar. «I dag» är produktens: `Framför mig` har genvägen `at: 'top'`, `playIntents`
// utelämnar då `index`, `apply` läser det som `index 0`, och zonordningen målas i sin ordning —
// så det senast spelade kortet målas först och hamnar underst. «Omvänd» är vad genvägens andra
// värde, `place: 'bottom'`, redan skulle ge: `index: count`, alltså sist i ordningen och överst
// på filten. Ingen av dem kräver något nytt i protokollet.
type Ordning = 'idag' | 'omvand'

type Mått = {
  kandidat: Kandidat
  ordning: Ordning
  platser: number
  antal: number
  zon: Ruta
  kort: KortMått[]
  // Kortet Nina spelade sist, alltså det första i zonordningen — och därmed det som målas först.
  nyast: KortMått
  synligaKort: number
  helaTitlar: number
  utanförZon: number
  utanförFilten: number
  påGrannzon: number
  grannarnasNamn: string[]
}

// Var ett kort i ytan faktiskt *ritas*.
//
// För de fyra klientreglerna är det där tråden säger att det ligger: `absoluteOf` på zonens hörn
// plus komponentens egna x och y. En utläggning i renderaren läser inte de talen alls — den
// räknar om varje kort ur zonens rektangel och antalet i den — så där är den ritade punkten en
// annan sak än den lagrade, och sidan håller isär dem i stället för att låtsas att de är samma.
function ritadPunkt(k: Körning, vy: Snapshot, c: VisibleComponentState, index: number, antal: number): Punkt {
  if (k.kandidat !== 'packa') return absoluteOf(vy, c)
  const z = måste(vy.zones.find((x) => x.id === c.zone), c.zone)
  const p = packat(z.geometry, index, antal)
  return { x: z.geometry.x + p.x, y: z.geometry.y + p.y }
}

function mät(k: Körning, antal: number, ordning: Ordning = 'idag'): Mått {
  const zonVy = måste(k.vy.zones.find((z) => z.id === 'mine:A'), 'mine:A')
  const zon: Ruta = { x: zonVy.geometry.x, y: zonVy.geometry.y, w: zonVy.geometry.w, h: zonVy.geometry.h }
  // Ritordningen är zonordningen: `project` skriver komponenterna i `z.order` och renderaren
  // målar dem i den ordningen utan z-ordning. Det som står först målas först och hamnar underst.
  const zonordning = k.vy.components.filter((c) => c.zone === 'mine:A')
  const nyastId = måste(zonordning[0], 'det senast spelade kortet').id
  // Platsen i zonen är kortets adress — där regeln la det — och den följer inte med när bara
  // ritordningen vänds. Rutorna räknas därför ur zonordningen, och bara målningen kastas om.
  const plats = new Map(zonordning.map((c, i) => [c.id, i]))
  const i_zonen = ordning === 'idag' ? zonordning : [...zonordning].reverse()
  const golv = måste(k.vy.zones.find((z) => z.id === k.vy.floor), 'golvet')
  const grannar = k.vy.zones.filter((z) => z.id !== 'mine:A' && z.id !== k.vy.floor && (z.kind === 'area' || z.kind === 'hand'))
  const rutaAv = (c: VisibleComponentState): Ruta => {
    const p = ritadPunkt(k, k.vy, c, måste(plats.get(c.id), c.id), zonordning.length)
    return { x: p.x, y: p.y, w: CARD_MM.w, h: CARD_MM.h }
  }
  const kort: KortMått[] = i_zonen.map((c, i) => {
    const ruta = rutaAv(c)
    const över = i_zonen.slice(i + 1).map(rutaAv)
    const titel: Ruta = { x: ruta.x + TITELRUTA.x, y: ruta.y + TITELRUTA.y, w: TITELRUTA.w, h: TITELRUTA.h }
    const inom = skär(ruta, zon)
    return {
      id: c.id,
      cardRef: c.cardRef,
      titel: c.title ?? c.id,
      ruta,
      synlig: synligDel(ruta, över),
      titelSynlig: synligDel(titel, över),
      helInomZon: inom >= ruta.w * ruta.h - 1e-6,
      utanförMm: Math.max(0, ruta.x + ruta.w - (zon.x + zon.w), zon.x - ruta.x, ruta.y + ruta.h - (zon.y + zon.h), zon.y - ruta.y),
    }
  })
  // Det senast spelade kortet är det som `move` la på `index 0`, alltså det första i zonordningen.
  const nyast = måste(kort.find((c) => c.id === nyastId), 'det senast spelade kortet')
  return {
    kandidat: k.kandidat,
    ordning,
    platser: k.platser,
    antal,
    zon,
    kort,
    nyast,
    synligaKort: kort.filter((c) => c.synlig > 0.0001).length,
    helaTitlar: kort.filter((c) => c.titelSynlig >= 0.999).length,
    utanförZon: kort.filter((c) => !c.helInomZon).length,
    // Hur många kort som inte ligger hela på filtens golv. Måttet är `ontoFelt` ur `drop.ts` —
    // samma funktion som drar tillbaka ett släpp som hamnat förbi kanten — körd på kortets ruta i
    // golvets egna koordinater. Att den ger ett svar här betyder inte att produkten tillämpar
    // det: `keptOnFelt` säger uttryckligen att bara *golvet* håller kvar det som släpps, och ett
    // kort som flyttas till en annan zon «keeps what it is given». En uträknad punkt som hamnar
    // utanför filten stannar alltså utanför filten.
    utanförFilten: kort.filter((c) => {
      const skjut = ontoFelt(golv, { x: c.ruta.x - golv.geometry.x, y: c.ruta.y - golv.geometry.y, w: c.ruta.w, h: c.ruta.h })
      return Math.abs(skjut.x) > 1e-6 || Math.abs(skjut.y) > 1e-6
    }).length,
    påGrannzon: kort.filter((c) => grannar.some((g) => skär(c.ruta, g.geometry) > 0)).length,
    grannarnasNamn: [...new Set(kort.flatMap((c) => grannar.filter((g) => skär(c.ruta, g.geometry) > 0).map((g) => g.name)))],
  }
}

const KANDIDATER: { id: Kandidat; namn: string; rubrik: string; mening: string; var: 'klienten' | 'renderaren' }[] = [
  { id: 'nu', namn: 'Nuläget', rubrik: 'ingen regel alls', mening: 'Telefonen skickar ingen punkt, `move` låter kortet behålla sina gamla koordinater, och ett handkort har 0,0. Tre kort på samma millimeter.', var: 'klienten' },
  { id: 'rad', namn: 'Radvis', rubrik: '`slotIn`, produktens egen', mening: 'Regeln produkten redan har: nästa lediga plats i en rad inne i zonen, uträknad ur zonens bredd. I dag går bara tangentbordet den vägen.', var: 'klienten' },
  { id: 'fjader', namn: 'Fjädrat', rubrik: `steg ${HAND_STEP_MM} mm, som handen`, mening: 'Korten överlappar som i en läst fjäder, med handens eget steg. Antalet syns även när ytan är trång; delar av varje kort döljs.', var: 'klienten' },
  { id: 'stapel', namn: 'Staplat', rubrik: `förskjutning ${STAPEL_MM} mm`, mening: 'Varje nytt kort en aning ned och åt höger. Billigast att bygga, och säger minst: en stapel med en kant.', var: 'klienten' },
  { id: 'packa', namn: 'Zonen packar', rubrik: 'utläggning i renderaren', mening: 'Ytan lägger ut alla sina kort på nytt varje gång, jämnt och alltid innanför sig själv. Den enda som aldrig spiller — och den enda som flyttar ett kort någon själv har lagt.', var: 'renderaren' },
]

const PLATSANTAL = [4, MAX_PLAYERS]
const ANTAL = [3, 6, SPELAT_MAX]

// Hela matrisen, körd.
const MATRIS = new Map<string, Mått>()
for (const kand of KANDIDATER) {
  for (const platser of PLATSANTAL) {
    for (const antal of ANTAL) {
      const k = kör(kand.id, platser, antal)
      for (const ordning of ['idag', 'omvand'] as Ordning[]) MATRIS.set(`${kand.id}|${platser}|${antal}|${ordning}`, mät(k, antal, ordning))
    }
  }
}
const M = (k: Kandidat, p: number, n: number, o: Ordning = 'idag'): Mått => måste(MATRIS.get(`${k}|${p}|${n}|${o}`), `${k}|${p}|${n}|${o}`)

// ── Var varje regel tar slut ────────────────────────────────────────────────────────────────
// Tre tak, mätta genom att spela ett kort i taget och se när påståendet slutar hålla. Det är den
// gräns issuet frågar efter — «var går gränsen där regeln slutar fungera, och vad gör den då?» —
// och den är inte samma tal för de tre sakerna en yta kan behöva kunna.
const TAK_SÖK = 16
type Tak = { inom: number; räknebar: number; läsbar: number }
function tak(kandidat: Kandidat, platser: number, ordning: Ordning): Tak {
  const t: Tak = { inom: 0, räknebar: 0, läsbar: 0 }
  for (let n = 1; n <= TAK_SÖK; n++) {
    const m = mät(kör(kandidat, platser, n), n, ordning)
    if (m.utanförZon === 0 && t.inom === n - 1) t.inom = n
    if (m.synligaKort === n && t.räknebar === n - 1) t.räknebar = n
    if (m.helaTitlar === n && t.läsbar === n - 1) t.läsbar = n
  }
  return t
}
const TAK = new Map<string, Tak>()
for (const kand of KANDIDATER) for (const p of PLATSANTAL) for (const o of ['idag', 'omvand'] as Ordning[]) TAK.set(`${kand.id}|${p}|${o}`, tak(kand.id, p, o))
const T = (k: Kandidat, p: number, o: Ordning = 'idag'): Tak => måste(TAK.get(`${k}|${p}|${o}`), `${k}|${p}|${o}`)
const takOrd = (v: number): string => (v >= TAK_SÖK ? `${TAK_SÖK}+` : String(v))

// ── K2-provet: kortet någon drar dit för hand ───────────────────────────────────────────────
// Nina spelar tre från telefonen, drar ett fjärde dit med fingret, och spelar tre till. Frågan
// är var det dragna kortet ligger efteråt — på tråden, och på filten.
type K2 = { kandidat: Kandidat; släpptes: Punkt; lagrat: Punkt; ritat: Punkt; flyttat: number; bryter: boolean }
const k2: K2[] = KANDIDATER.map((kand) => {
  const k = kör(kand.id, 4, 6, true)
  const draget = måste(k.draget, 'det dragna kortet')
  const c = måste(k.vy.components.find((x) => x.id === draget.id), draget.id)
  const lagrat = { x: c.x, y: c.y }
  const zon = måste(k.vy.zones.find((z) => z.id === 'mine:A'), 'mine:A')
  const i_zonen = k.vy.components.filter((x) => x.zone === 'mine:A')
  const plats = i_zonen.findIndex((x) => x.id === draget.id)
  // Var kortet *ritas*. För de fyra klientreglerna är det där det ligger; för en utläggning i
  // renderaren är det där utläggningen säger, oavsett vad tråden bär.
  const p = ritadPunkt(k, k.vy, c, plats, i_zonen.length)
  const ritat = { x: p.x - zon.geometry.x, y: p.y - zon.geometry.y }
  const flyttat = Math.hypot(ritat.x - draget.släpptes.x, ritat.y - draget.släpptes.y)
  return { kandidat: kand.id, släpptes: draget.släpptes, lagrat, ritat, flyttat, bryter: flyttat > 0.5 }
})
const K2_AV = (k: Kandidat): K2 => måste(k2.find((x) => x.kandidat === k), k)

// ── Vakter som gör talen icke-vakuösa ───────────────────────────────────────────────────────
vakt(
  'nuläget lägger alla tio korten på samma millimeter',
  M('nu', 4, SPELAT_MAX).kort.every((c) => c.ruta.x === M('nu', 4, SPELAT_MAX).zon.x && c.ruta.y === M('nu', 4, SPELAT_MAX).zon.y),
  'varje kort ligger på zonens hörn — det är felet #449 handlar om, mätt och inte citerat',
)
vakt(
  'nuläget visar ett kort av tio, och det är det första som spelades',
  M('nu', 4, SPELAT_MAX).synligaKort === 1 && M('nu', 4, SPELAT_MAX).nyast.synlig === 0,
  'det senast spelade kortet har noll synlig area; det som syns är det första',
)
vakt(
  'de fyra andra kandidaterna visar alla tre korten vid tre kort',
  KANDIDATER.filter((k) => k.id !== 'nu').every((k) => M(k.id, 4, 3).synligaKort === 3),
  'tre kort spelade blir tre kort man kan räkna på filten',
)
vakt(
  'mätningen kan se skillnad på synligt och dolt alls',
  M('stapel', 4, SPELAT_MAX).kort.some((c) => c.synlig < 0.5) && M('packa', 4, 3).kort.every((c) => c.synlig > 0.99),
  'någon kandidat döljer och någon döljer inte — annars hade nollorna inte betytt något',
)
vakt(
  'varje kort på filten bär en titel ur projektionen',
  [...MATRIS.values()].every((m) => m.kort.every((c) => c.cardRef !== null && c.titel !== c.id)),
  'ytan är publik, så `project` ger TV:n både `cardRef` och `title` — det är vad #414:s val D betyder',
)
vakt(
  'ingen kandidat utom nuläget lägger två kort på samma punkt',
  KANDIDATER.filter((k) => k.id !== 'nu').every((k) => {
    const m = M(k.id, 4, SPELAT_MAX)
    return new Set(m.kort.map((c) => `${c.ruta.x.toFixed(3)},${c.ruta.y.toFixed(3)}`)).size === m.kort.length
  }),
  'tio kort, tio olika punkter',
)
vakt(
  'K2-provet har ett kort som verkligen drogs dit för hand',
  k2.every((x) => x.släpptes.x > 0 && x.släpptes.y >= 0),
  'släpppunkten ligger inne i zonen och inte på dess hörn',
)
vakt(
  'de fyra klientreglerna låter det dragna kortet ligga kvar',
  k2.filter((x) => x.kandidat !== 'packa').every((x) => !x.bryter),
  'noll millimeters förflyttning för var och en av dem',
)
vakt(
  'utläggningen i renderaren flyttar det dragna kortet',
  K2_AV('packa').bryter,
  `${K2_AV('packa').flyttat.toFixed(1)} mm från där Nina släppte det — det är K2-brottet, mätt`,
)

// ── Filten ──────────────────────────────────────────────────────────────────────────────────
// Sändningsläget i halv skala: 960 × 540 står för 1920 × 1080.
//
// Skalan är produktens egen och inte en uträkning som liknar den: `TableRenderer` i tv-läge
// passar in *filten med sina händer på* i fönstret med `TV_AIR_PX` luft, och `fitScale` växer
// aldrig förbi 1:1. Den sista detaljen är inte en petitess — vid fyra platser vill 1920 × 1080
// ha 1,3 px/mm, och taket gör den till 1,0. Prototypen till #414 räknade skalan för hand och
// sade därför 1,3000; det talet var fel, och det här är den rättelsen.
const RIKTIG_TV = { w: 1920, h: 1080 }
function tvSkala(vy: Snapshot): number {
  const golv = måste(vy.zones.find((z) => z.id === vy.floor), 'golvet')
  const händer = vy.zones.filter((z) => z.kind === 'hand')
  const felted = feltWithHands(golv.geometry, händer.map((z) => handExtent(z, golv, handRotation(z, golv, 'tv'))))
  const rotate = turnToFit(felted, RIKTIG_TV)
  const drawn = rotate % 180 === 0 ? felted : { w: felted.h, h: felted.w }
  return fitScale(drawn, RIKTIG_TV, TV_AIR_PX)
}
const HALVA_TV = { w: RIKTIG_TV.w / 2, h: RIKTIG_TV.h / 2 }
const SKALA_PÅ_TV: Record<number, number> = Object.fromEntries(PLATSANTAL.map((p) => [p, tvSkala(kör('nu', p, 1).vy)]))
vakt(
  '`fitScale` sätter taket 1:1 och inte filtens egen kvot',
  måste(SKALA_PÅ_TV[4], '4') === 1,
  `vid fyra platser ville rutan ha ${((RIKTIG_TV.h - 2 * TV_AIR_PX) / feltFor(4).h).toFixed(4)} px/mm och produkten ger ${måste(SKALA_PÅ_TV[4], '4').toFixed(4)}`,
)

const CSS_MM = 96 / 25.4
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Korten, kompilerade en gång var. Samma `compile` som renderaren och editorn kallar.
const kompilerade = new Map<string, Compiled>()
for (const rad of RADER.slice(0, SPELAT_MAX + 2)) {
  kompilerade.set(rad.id, compile({ type: CARD_STANDARD_63x88, face: template.faces.front, row: måste(deckRows[rad.id], rad.id), icons: {}, scope: `.k-${rad.id}`, fonts: FONTS }))
}
const kompileradRygg = compile({ type: CARD_STANDARD_63x88, face: template.faces.back, row: måste(deckRows['kort-1'], 'kort-1'), icons: {}, scope: '.k-rygg', fonts: FONTS })
vakt(
  'varje kompilerat kort bär sin egen titel i markupen',
  RADER.slice(0, SPELAT_MAX + 2).every((r) => måste(kompilerade.get(r.id), r.id).html.includes(String(r.fields.title))),
  'titeln står i den kompilerade markupen och är inte skriven bredvid',
)
vakt('ryggen är kompilerad ur samma mall', kompileradRygg.html.includes('data-card'), 'baksidan är produktens och inte en ritad ruta')

const kortHtml = (cardRef: string, skala: number): string =>
  `<div class="filtkort k-${esc(cardRef)}" style="transform:scale(${skala.toFixed(5)})">${måste(kompilerade.get(cardRef), cardRef).html}</div>`
const ryggHtml = (skala: number): string => `<div class="filtkort k-rygg" style="transform:scale(${skala.toFixed(5)})">${kompileradRygg.html}</div>`

// En filt, ritad ur en körning. `halv` är sändningsläget i halv skala.
function filtHtml(k: Körning, halv = true): string {
  const platser = k.platser
  const skala = måste(SKALA_PÅ_TV[platser], String(platser)) / (halv ? 2 : 1)
  const FELT = feltFor(platser)
  const px = (mm: number): number => mm * skala
  const vänster = (mm: number): number => px(mm + FELT.w / 2)
  const övre = (mm: number): number => px(mm + FELT.h / 2)
  const kortskala = skala / CSS_MM
  const bitar: string[] = []
  const zon = (g: { x: number; y: number; w: number; h: number }, id: string, namn: string, kant: string, inuti = ''): void => {
    const utanför =
      kant === 'S' ? `left:50%;top:-13px;transform:translateX(-50%)`
      : kant === 'N' ? `left:50%;top:100%;margin-top:3px;transform:translateX(-50%)`
      : kant === 'W' ? `left:100%;margin-left:5px;top:50%;transform:translateY(-50%)`
      : `left:0;margin-left:-5px;top:50%;transform:translate(-100%,-50%)`
    bitar.push(
      `<div class="byd-zone" data-area="${esc(id)}" style="left:${vänster(g.x).toFixed(1)}px;top:${övre(g.y).toFixed(1)}px;width:${px(g.w).toFixed(1)}px;height:${px(g.h).toFixed(1)}px"><span style="${utanför}">${esc(namn)}</span>${inuti}</div>`,
    )
  }
  const hög = (x: number, y: number, namn: string, n: number): void => {
    bitar.push(
      `<div class="byd-pile${n === 0 ? ' tom' : ''}" style="left:${vänster(x - CARD_MM.w / 2).toFixed(1)}px;top:${övre(y - CARD_MM.h / 2).toFixed(1)}px;width:${px(CARD_MM.w).toFixed(1)}px;height:${px(CARD_MM.h).toFixed(1)}px">${n > 0 ? ryggHtml(kortskala) : ''}<b class="byd-pile-count">${n}</b><em>${esc(namn)}</em></div>`,
    )
  }
  hög(-140, 0, 'Draghög', måste(k.state.zones['draw'], 'draw').order.length)
  hög(140, 0, 'Kasthög', 0)

  const seats = SEAT_IDS.slice(0, platser)
  seats.forEach((seat, i) => {
    const kant = edgeOf(i, platser)
    const front = inFront(i, platser, 1)
    const chips = countersAt(i, platser, 1)
    const hand = handGeometry(i, platser)
    zon(front, `mine:${seat}`, `Framför ${seat}`, kant)
    zon(chips, `counters:${seat}`, `Räknare ${seat}`, kant)
    for (const spot of counterSpots(chips, 1)) {
      bitar.push(`<div class="byd-token" style="left:${vänster(chips.x + spot.x).toFixed(1)}px;top:${övre(chips.y + spot.y).toFixed(1)}px;width:${px(CHIP_MM).toFixed(1)}px;height:${px(CHIP_MM).toFixed(1)}px"><b>0</b></div>`)
    }
    const antal = måste(k.state.zones[`hand:${seat}`], `hand:${seat}`).order.length
    const vrid = kant === 'S' ? 0 : kant === 'N' ? 180 : kant === 'E' ? -90 : 90
    const handSkala = kortskala * (HAND_CARD_MM.w / CARD_MM.w)
    const solfjäder = Array.from(
      { length: Math.min(antal, FAN_MAX) },
      (_, j) =>
        `<i style="transform:rotate(${((j - (Math.min(antal, FAN_MAX) - 1) / 2) * 9).toFixed(1)}deg);width:${px(HAND_CARD_MM.w).toFixed(1)}px;height:${px(HAND_CARD_MM.h).toFixed(1)}px;margin-left:${px(-HAND_CARD_MM.w / 2).toFixed(1)}px;margin-top:${px(-(HAND_CARD_MM.h - 28)).toFixed(1)}px">${ryggHtml(handSkala)}</i>`,
    ).join('')
    bitar.push(`<div class="byd-hand" style="left:${vänster(hand.x + hand.w / 2).toFixed(1)}px;top:${övre(hand.y + hand.h / 2).toFixed(1)}px;transform:rotate(${vrid}deg)">${solfjäder}${antal > 0 ? `<b class="byd-hand-count">${antal}</b>` : ''}</div>`)
    const namnPlats =
      kant === 'S' ? `left:${vänster(hand.x + hand.w / 2).toFixed(1)}px;top:${(px(FELT.h) - 11).toFixed(1)}px`
      : kant === 'N' ? `left:${vänster(hand.x + hand.w / 2).toFixed(1)}px;top:11px`
      : kant === 'E' ? `left:${(px(FELT.w) - 14).toFixed(1)}px;top:${övre(hand.y + hand.h / 2).toFixed(1)}px`
      : `left:14px;top:${övre(hand.y + hand.h / 2).toFixed(1)}px`
    bitar.push(`<div class="byd-seat-name" style="--seat:var(--seat-${seat.toLowerCase()});${namnPlats};transform:translate(-50%,-50%) rotate(${vrid}deg)">${esc(måste(NAMN[seat], seat))}</div>`)
  })

  // Korten i Ninas yta, där projektionen säger att de ligger — `absoluteOf`, i zonordning, och
  // alltså i den ordning renderaren målar dem.
  const iYtan = k.vy.components.filter((c) => c.zone === 'mine:A')
  for (const [i, c] of iYtan.entries()) {
    const p = ritadPunkt(k, k.vy, c, i, iYtan.length)
    const kropp = c.cardRef ? kortHtml(c.cardRef, kortskala) : ryggHtml(kortskala)
    const märke = k.draget && c.id === k.draget.id ? '<u class="draget"></u>' : ''
    bitar.push(`<div class="filtplats" style="left:${vänster(p.x).toFixed(1)}px;top:${övre(p.y).toFixed(1)}px;width:${px(CARD_MM.w).toFixed(1)}px;height:${px(CARD_MM.h).toFixed(1)}px">${kropp}${märke}</div>`)
  }
  return `<div class="tv" style="width:${(halv ? HALVA_TV.w : RIKTIG_TV.w)}px;height:${(halv ? HALVA_TV.h : RIKTIG_TV.h)}px"><div class="filt" style="width:${px(FELT.w).toFixed(1)}px;height:${px(FELT.h).toFixed(1)}px">${bitar.join('')}</div></div>`
}

// Ett utsnitt av filten kring Ninas yta, i TV:ns egna pixlar och inte uppförstorat: det är vad
// en människa i rummet ser av just den ytan, med grannarnas kanter kvar så att spill syns.
function utsnittHtml(k: Körning, antal: number): string {
  const platser = k.platser
  const skala = måste(SKALA_PÅ_TV[platser], String(platser))
  const FELT = feltFor(platser)
  const px = (mm: number): number => mm * skala
  const zonVy = måste(k.vy.zones.find((z) => z.id === 'mine:A'), 'mine:A')
  const g = zonVy.geometry
  const LUFT = 70 // mm runt zonen som utsnittet visar med
  const ruta = { x: g.x - LUFT, y: g.y - LUFT, w: g.w + 2 * LUFT, h: g.h + 2 * LUFT }
  const vänster = (mm: number): number => px(mm - ruta.x)
  const övre = (mm: number): number => px(mm - ruta.y)
  const kortskala = skala / CSS_MM
  const bitar: string[] = []
  // Golvets kant, om den skär utsnittet.
  bitar.push(`<div class="utsnitt-golv" style="left:${vänster(-FELT.w / 2).toFixed(1)}px;top:${övre(-FELT.h / 2).toFixed(1)}px;width:${px(FELT.w).toFixed(1)}px;height:${px(FELT.h).toFixed(1)}px"></div>`)
  for (const z of k.vy.zones) {
    if (z.kind === 'pile' || z.id === k.vy.floor) continue
    const egen = z.id === 'mine:A'
    bitar.push(
      `<div class="byd-zone${egen ? ' egen' : ''}" style="left:${vänster(z.geometry.x).toFixed(1)}px;top:${övre(z.geometry.y).toFixed(1)}px;width:${px(z.geometry.w).toFixed(1)}px;height:${px(z.geometry.h).toFixed(1)}px"><span style="left:2px;top:-12px">${esc(z.name)}</span></div>`,
    )
  }
  const iYtan = k.vy.components.filter((c) => c.zone === 'mine:A')
  for (const [i, c] of iYtan.entries()) {
    const p = ritadPunkt(k, k.vy, c, i, iYtan.length)
    const kropp = c.cardRef ? kortHtml(c.cardRef, kortskala) : ryggHtml(kortskala)
    bitar.push(`<div class="filtplats" style="left:${vänster(p.x).toFixed(1)}px;top:${övre(p.y).toFixed(1)}px;width:${px(CARD_MM.w).toFixed(1)}px;height:${px(CARD_MM.h).toFixed(1)}px">${kropp}</div>`)
  }
  const m = M(k.kandidat, platser, antal)
  const larm = m.utanförZon > 0 || m.synligaKort < antal
  return `<figure class="utsnitt">
  <div class="utsnitt-duk" style="width:${px(ruta.w).toFixed(1)}px;height:${px(ruta.h).toFixed(1)}px">${bitar.join('')}</div>
  <figcaption><b>${antal} kort</b> · ${m.synligaKort} syns · ${m.helaTitlar} hela titlar · <span class="${larm ? 'warn' : 'ok'}">${m.utanförZon} utanför ytan</span></figcaption>
</figure>`
}

// ── Sidan ───────────────────────────────────────────────────────────────────────────────────
const pct = (v: number): string => `${(v * 100).toFixed(0)} %`
const stilar = [...[...kompilerade.values()].map((c) => c.css), kompileradRygg.css].join('\n')

// En växel per fråga: vilken kandidat, och hur många som sitter vid bordet.
const väljare = (namn: string, grupp: string, val: { id: string; text: string }[], förvalt: string): string =>
  `<div class="switch" role="group" aria-label="${esc(namn)}">${val
    .map((v) => `<button type="button" data-grupp="${grupp}" data-valj="${esc(v.id)}" aria-pressed="${v.id === förvalt ? 'true' : 'false'}">${esc(v.text)}</button>`)
    .join('')}</div>`

const lägeAttr = (k: Kandidat, p: number): string => `data-kand="${k}" data-platser="${p}"`

const filtar = KANDIDATER.flatMap((kand) =>
  PLATSANTAL.map((p) => `<div class="lage" ${lägeAttr(kand.id, p)}>${filtHtml(kör(kand.id, p, 3))}</div>`),
).join('')

const utsnitten = KANDIDATER.flatMap((kand) =>
  PLATSANTAL.map((p) => `<div class="lage" ${lägeAttr(kand.id, p)}><div class="utsnittsrad">${ANTAL.map((n) => utsnittHtml(kör(kand.id, p, n), n)).join('')}</div></div>`),
).join('')

const beskrivningar = KANDIDATER.flatMap((kand) =>
  PLATSANTAL.map((p) => {
    const m = M(kand.id, p, 3)
    return `<div class="lage" ${lägeAttr(kand.id, p)}><p class="lagetext"><b>${esc(kand.namn)}</b> — ${kand.rubrik}. ${kand.mening} <span class="led">Räknas ${kand.var === 'klienten' ? 'på klienten och skickas med <code>move</code>' : 'i renderaren, varje gång zonen ändras'}. Ytan är ${m.zon.w} × ${m.zon.h} mm vid ${p} platser.</span></p></div>`
  }),
).join('')

// Ordningsrutan: vad man faktiskt ser av det senast spelade kortet.
const ordningen = KANDIDATER.flatMap((kand) =>
  PLATSANTAL.map((p) => {
    const rader = ANTAL.map((n) => {
      const m = M(kand.id, p, n)
      const o = M(kand.id, p, n, 'omvand')
      return `<tr><th>${n} kort</th><td>${esc(m.nyast.titel)}</td><td class="${m.nyast.synlig > 0.001 ? 'ok' : 'warn'}">${pct(m.nyast.synlig)}</td><td class="${m.nyast.titelSynlig >= 0.999 ? 'ok' : 'warn'}">${pct(m.nyast.titelSynlig)}</td><td class="${o.nyast.synlig > 0.001 ? 'ok' : 'warn'}">${pct(o.nyast.synlig)}</td><td class="${o.nyast.titelSynlig >= 0.999 ? 'ok' : 'warn'}">${pct(o.nyast.titelSynlig)}</td><td class="${o.synligaKort === n ? 'ok' : 'warn'}">${o.synligaKort} av ${n}</td></tr>`
    }).join('')
    return `<div class="lage" ${lägeAttr(kand.id, p)}><table class="summa"><thead><tr><th rowspan="2">Läge</th><th rowspan="2">Nyast är</th><th colspan="2">I dag · <code>at: 'top'</code></th><th colspan="3">Omvänd · <code>place: 'bottom'</code></th></tr><tr><th>synlig</th><th>titeln synlig</th><th>synlig</th><th>titeln synlig</th><th>kort som syns</th></tr></thead><tbody>${rader}</tbody></table></div>`
  }),
).join('')

// Taken: var varje regel tar slut, mätt genom att spela ett kort i taget.
const takHtml = PLATSANTAL.map((p) =>
  `<div class="lage-platser" data-platser="${p}"><table class="summa"><thead><tr><th>Regel</th><th>Ryms hela i ytan upp till</th><th>Går att räkna upp till</th><th>Alla titlar fria upp till</th><th>Kort av ${SPELAT_MAX} utanför filten</th><th>…på en grannzon</th><th>K2</th></tr></thead><tbody>${KANDIDATER.map((kand) => {
    const t = T(kand.id, p)
    const m = M(kand.id, p, SPELAT_MAX)
    const x = K2_AV(kand.id)
    return `<tr class="${x.bryter ? 'bryter' : ''}"><th>${esc(kand.namn)}</th><td class="${t.inom >= 6 ? 'ok' : 'warn'}">${takOrd(t.inom)} kort</td><td class="${t.räknebar >= 6 ? 'ok' : 'warn'}">${takOrd(t.räknebar)} kort</td><td class="${t.läsbar >= 6 ? 'ok' : 'warn'}">${takOrd(t.läsbar)} kort</td><td class="${m.utanförFilten > 0 ? 'warn' : 'ok'}">${m.utanförFilten}</td><td class="${m.påGrannzon > 0 ? 'warn' : 'ok'}">${m.påGrannzon}${m.grannarnasNamn.length ? ` · ${esc(m.grannarnasNamn.join(', '))}` : ''}</td><td class="${x.bryter ? 'warn' : 'ok'}">${x.bryter ? 'bryter' : 'håller'}</td></tr>`
  }).join('')}</tbody></table></div>`,
).join('')

// K2-rutan.
const k2Html = KANDIDATER.map((kand) => {
  const x = K2_AV(kand.id)
  return `<tr class="${x.bryter ? 'bryter' : ''}"><th>${esc(kand.namn)}</th><td>${x.släpptes.x.toFixed(1)}, ${x.släpptes.y.toFixed(1)}</td><td>${x.lagrat.x.toFixed(1)}, ${x.lagrat.y.toFixed(1)}</td><td>${x.ritat.x.toFixed(1)}, ${x.ritat.y.toFixed(1)}</td><td class="${x.bryter ? 'warn' : 'ok'}">${x.flyttat.toFixed(1)} mm</td><td class="${x.bryter ? 'warn' : 'ok'}">${x.bryter ? 'bryter mot K2' : 'ligger kvar'}</td></tr>`
}).join('')

const k2Filtar = KANDIDATER.map((kand) => `<div class="lage" data-kand="${kand.id}" data-platser="4">${filtHtml(kör(kand.id, 4, 6, true))}</div>`).join('')

// Hela matrisen, som en tabell.
const matrisHtml = `<table class="summa matris">
<thead><tr><th>Kandidat</th><th>Platser</th>${ANTAL.map((n) => `<th colspan="3">${n} kort</th>`).join('')}</tr>
<tr><th></th><th></th>${ANTAL.map(() => '<th>syns</th><th>hela titlar</th><th>utanför ytan</th>').join('')}</tr></thead>
<tbody>${KANDIDATER.flatMap((kand) =>
  PLATSANTAL.map((p) => {
    const celler = ANTAL.map((n) => {
      const m = M(kand.id, p, n)
      return `<td class="${m.synligaKort === n ? 'ok' : 'warn'}">${m.synligaKort}/${n}</td><td class="${m.helaTitlar === n ? 'ok' : m.helaTitlar === 0 ? 'warn' : ''}">${m.helaTitlar}</td><td class="${m.utanförZon > 0 ? 'warn' : 'ok'}">${m.utanförZon}${m.påGrannzon > 0 ? ` (${m.påGrannzon} på grannen)` : ''}</td>`
    }).join('')
    return `<tr><th>${esc(kand.namn)}</th><td>${p}</td>${celler}</tr>`
  }),
).join('')}</tbody>
</table>`

const vaktHtml = vakter.map((v) => `<li><b>${esc(v.vad)}</b> — ${esc(v.svar)}</li>`).join('')

// Måttlistan uppe: varje tal ur koden.
const mått4 = M('nu', 4, 3)

// Var `slotIn` lägger det allra första kortet i seatytan, anropad på en tom sådan zon. Det är
// talet som visar att regeln aldrig har prövats mot den här rektangeln: ett kort är ${CARD_MM.h}
// mm högt och ytan ${mått4.zon.h} mm djup, så luften regeln lägger till räcker för att skjuta ut
// redan kort ett.
const TOM_ZON: Snapshot = { seq: 0, seat: null, floor: 'table', seats: [], zones: [{ id: 'mine:A', kind: 'area', name: 'Framför A', geometry: { ...mått4.zon, rot: 0 }, dynamic: false, mode: 'order', order: [] }], components: [], rewind: null, undo: null, ended: false }
const SLOT_FÖRSTA = slotIn(TOM_ZON, 'mine:A')
vakt(
  '`slotIn` skjuter ut redan det första kortet ur seatytan',
  SLOT_FÖRSTA.y + CARD_MM.h > mått4.zon.h,
  `den lägger kortet på y = ${SLOT_FÖRSTA.y} mm i en yta som är ${mått4.zon.h} mm djup, och kortet är ${CARD_MM.h} mm högt`,
)

const sida = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Var kortet hamnar i en publik yta (#449)</title>
<link rel="stylesheet" href="proto.css">
<style>
${stilar}

html, body { height: auto; overflow: auto; }
body { padding: 0 0 120px; }
:root { --seat-e: #b06fe0; --seat-f: #e08a3b; --seat-g: #4fc4c4; --seat-h: #e05f93; }
.ark { max-width: 1520px; margin: 0 auto; padding: 0 var(--s5); }
h1 { font-size: 22px; color: #fff; margin: var(--s5) 0 var(--s2); }
h2 { font-size: 15px; color: #fff; margin: 0 0 var(--s3); letter-spacing: .5px; }
h3 { font-size: 13px; color: #fff; margin: 0 0 var(--s2); }
.ark > p, section > p, .kolumn > p { margin: 0 0 var(--s2); max-width: 84ch; line-height: 1.6; color: #c3cbdd; }
code { background: var(--sunk); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; color: #ffd98a; font-size: 12px; }
section { margin: var(--s5) 0; padding: var(--s4) 0 0; border-top: 1px solid var(--line); }
.led { color: var(--quiet); }

/* Växlarna: kandidat och platsantal, och sidan byter alla sina rutor på en gång. */
.lage, .lage-platser { display: none; }
${PLATSANTAL.map((p) => `body[data-platser='${p}'] .lage-platser[data-platser='${p}']`).join(',\n')} { display: block; }
${KANDIDATER.flatMap((k) => PLATSANTAL.map((p) => `body[data-kand='${k.id}'][data-platser='${p}'] .lage[data-kand='${k.id}'][data-platser='${p}']`)).join(',\n')} { display: block; }
.vaxel { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; padding: var(--s2) var(--s5); background: #2a2417; border-bottom: 1px solid #4a4230; color: #ffd98a; font-size: 11px; line-height: 1.5; }
.vaxel .switch { background: #1f1b12; }
.vaxel .switch button { color: #c8b98d; }
.vaxel .switch button[aria-pressed='true'] { background: #ffd98a; color: #241a0c; }
.vaxel .etikettord { font-weight: 700; letter-spacing: .5px; text-transform: uppercase; font-size: 10px; color: #c8b98d; }
.lagetext { margin: 0; max-width: 92ch; }
.lagetext b { color: #ffe9b8; }

/* Sändningsläget i halv skala: 960 × 540 står för 1920 × 1080. */
.tv { position: relative; border-radius: 10px; background: #05070b; border: 1px solid #1b1f2a; display: grid; place-items: center; overflow: hidden; }
.filt { position: relative; background: var(--tv-felt); border: 1px solid var(--tv-felt-line); border-radius: 4px; }
.byd-zone { position: absolute; box-sizing: border-box; border: 1.5px solid var(--tv-zone-line); border-radius: 6px; }
.byd-zone.egen { border-color: #ffd98a; }
.byd-zone > span { position: absolute; color: var(--tv-zone-name); font: 600 8px/1 'Roboto Condensed', system-ui; letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; }
.byd-pile { position: absolute; }
.byd-pile.tom { border: 1.5px dashed var(--tv-zone-line); border-radius: 3px; }
.byd-pile-count { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 4px); padding: 1px 6px; border-radius: 999px; background: rgba(0,0,0,.55); color: var(--hand-count-ink); font: 600 10px system-ui; }
.byd-pile > em { position: absolute; left: 50%; top: 100%; margin-top: 20px; transform: translateX(-50%); font-style: normal; color: var(--tv-zone-name); font: 600 8px/1 'Roboto Condensed', system-ui; letter-spacing: 1px; text-transform: uppercase; }
.byd-token { position: absolute; border-radius: 50%; background: #f0b64a; color: #1c1c1c; display: grid; place-items: center; }
.byd-token b { font: 700 8px/1 system-ui; }
.byd-hand { position: absolute; }
.byd-hand i { position: absolute; display: block; transform-origin: 50% 140%; overflow: hidden; border-radius: 2px; }
.byd-hand-count { position: absolute; left: 50%; top: 34px; transform: translateX(-50%); padding: 1px 6px; border-radius: 999px; background: var(--hand-count-bg); color: var(--hand-count-ink); font: 600 10px system-ui; }
.byd-seat-name { position: absolute; padding: 1px 7px; border-radius: 999px; background: var(--seat); color: #10131a; font: 800 9px/14px system-ui; letter-spacing: .6px; white-space: nowrap; }

/* Ett kort på filten: kompilerad markup i sin verkliga millimeterstorlek, skalad till filtens
   pixlar. Ingen ritad ruta någonstans. */
.filtplats { position: absolute; }
.filtkort { transform-origin: 0 0; }
.filtkort [data-card] { border-radius: 3mm; overflow: hidden; box-shadow: 0 1px 0 rgba(0,0,0,.6), 0 6px 14px rgba(0,0,0,.5); }
.filtplats u.draget { position: absolute; inset: -3px; border: 2px solid #ffd98a; border-radius: 5px; }

/* Utsnittet: filten kring Ninas yta i TV:ns egna pixlar, inte uppförstorad. */
.utsnittsrad { display: flex; gap: var(--s5); flex-wrap: wrap; align-items: flex-start; }
.utsnitt { margin: 0; }
.utsnitt-duk { position: relative; background: var(--tv-felt); border-radius: 4px; overflow: hidden; }
.utsnitt-golv { position: absolute; border: 1px solid var(--tv-felt-line); border-radius: 4px; box-sizing: border-box; }
.utsnitt figcaption { margin-top: 6px; font-size: 11px; color: var(--quiet-2); font-variant-numeric: tabular-nums; }
.utsnitt figcaption b { color: #dfe6f5; }
.utsnitt figcaption .ok { color: var(--good); }
.utsnitt figcaption .warn { color: #ff9d9d; font-weight: 700; }

.summa { border-collapse: collapse; width: 100%; margin: var(--s3) 0 0; font-size: 12px; font-variant-numeric: tabular-nums; }
.summa th, .summa td { border: 1px solid var(--line); padding: 6px 9px; text-align: left; }
.summa thead th { background: var(--sunk); color: #fff; font-size: 11px; }
.summa tbody th { background: var(--sunk); color: #dfe6f5; white-space: nowrap; }
.summa td.ok { color: var(--good); font-weight: 700; }
.summa td.warn { color: #ff9d9d; font-weight: 700; }
.summa tr.bryter th { color: #ffb9b9; }
.matris { font-size: 11px; }

.kolumner { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: var(--s4); }
.kolumn { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: var(--s4); }
.kolumn h3 { font-size: 13px; }
.kolumn ul { margin: 0; padding-left: 17px; color: #c3cbdd; line-height: 1.65; font-size: 12px; }
.kolumn ul b { color: #fff; }
.beslut { background: #101820; border: 1px solid #24384a; border-radius: 12px; padding: var(--s4); }
.beslut pre { margin: 0; background: #0b1117; border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; }
.beslut pre code { background: none; border: 0; padding: 0; color: #dfe6f5; font: 11px/1.6 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
.rad2 { display: grid; grid-template-columns: ${HALVA_TV.w}px minmax(0,1fr); gap: var(--s5); align-items: start; }

.fotnot { margin-top: var(--s5); padding-top: var(--s4); border-top: 1px solid var(--line); font-size: 11px; color: var(--quiet); }
.fotnot ul { padding-left: 17px; line-height: 1.75; }
.fotnot b { color: #dfe6f5; }
.matt-lista { display: flex; gap: var(--s4); flex-wrap: wrap; margin: var(--s3) 0 0; font-size: 11px; color: var(--quiet-2); font-variant-numeric: tabular-nums; }
.matt-lista u { text-decoration: none; color: #ffd98a; font-weight: 700; }
@media (max-width: 1560px) { .rad2 { grid-template-columns: 1fr; } }
@media (max-width: 1100px) { .kolumner { grid-template-columns: 1fr; } }
</style>
</head>
<body data-kand="nu" data-platser="4">

<div class="vaxel">
  <b>#449 · var kortet hamnar</b>
  <span class="etikettord">Regel</span>
  ${väljare('Vilken placeringsregel', 'kand', KANDIDATER.map((k) => ({ id: k.id, text: k.namn })), 'nu')}
  <span class="etikettord">Platser</span>
  ${väljare('Hur många som sitter vid bordet', 'platser', PLATSANTAL.map((p) => ({ id: String(p), text: String(p) })), '4')}
  ${beskrivningar}
</div>

<div class="ark">
<h1>Var kortet hamnar i en publik yta</h1>
<p>Nina trycker <b>Framför mig</b> tre gånger. Telefonen skickar ingen position, <code>move</code> låter kortet behålla de koordinater det hade, och ett handkort har 0,0 — så alla tre korten får zonens hörn och ritas ovanpå varandra. Den här sidan prövar fyra regler för var de i stället ska hamna, mot nuläget, på wizardens eget startbord med ytorna framför platserna gjorda publika: beslutet i <a href="https://github.com/Tiico/build-a-deck/issues/414">#414</a>, som det här blockerar.</p>
<p>Frågan är inte ny. Den står redan som öppen fråga i <b>DESIGN-BESLUT.md</b>, avsnitt I, rad ${RAD_ÖPPEN + 1}, sedan tangentbordet fick sin väg (K16), och koden som gissar svaret säger det själv: <code>slotIn</code> i <code>keyboard.ts</code> bär raden «this is the prototype's guess, not a product decision». Det #449 avgör är alltså om den gissningen blir produktens svar, eller ersätts — och svaret gäller båda vägarna in, eftersom två vägar som räknar olika är två bord.</p>
<div class="matt-lista">
  <span>ytan framför en plats <u>${mått4.zon.w} × ${mått4.zon.h} mm</u> vid varje platsantal</span>
  <span>kortet <u>${CARD_MM.w} × ${CARD_MM.h} mm</u></span>
  <span>titelrutan i startramen <u>${TITELRUTA.w} × ${TITELRUTA.h} mm</u> vid y ${TITELRUTA.y}</span>
  <span>filten vid 4 platser <u>${feltFor(4).w} × ${feltFor(4).h} mm</u> → <u>${måste(SKALA_PÅ_TV[4], '4').toFixed(4)} px/mm</u></span>
  <span>vid ${MAX_PLAYERS} platser <u>${feltFor(MAX_PLAYERS).w} × ${feltFor(MAX_PLAYERS).h} mm</u> → <u>${måste(SKALA_PÅ_TV[MAX_PLAYERS], 'max').toFixed(4)} px/mm</u></span>
  <span>ett kort på en riktig 1920 × 1080 <u id="matt-tv">${(CARD_MM.w * måste(SKALA_PÅ_TV[4], '4')).toFixed(1)} px</u> / <u>${(CARD_MM.w * måste(SKALA_PÅ_TV[MAX_PLAYERS], 'max')).toFixed(1)} px</u></span>
  <span>uppmätt på filten här <u id="matt-kort">—</u></span>
</div>

<section>
  <h2>1 · Tre kort, på TV:n</h2>
  <p>Sändningsläget i halv skala: 960 × 540 står för 1920 × 1080. Skalan är <code>fitScale</code>, <code>TV_AIR_PX</code> och <code>feltWithHands</code> ur produkten, ställda som <code>TableRenderer</code> ställer dem i tv-läge — och inte en egen uträkning som liknar dem. Nina sitter på plats A, längst ned.</p>
  <div class="rad2">
    <div>${filtar}</div>
    <div>
      <h3>Vad man ser av det hon spelade sist</h3>
      <p class="led">Det senast spelade kortet är det <code>move</code> la på <code>index 0</code>. <code>project</code> skriver komponenterna i zonens ordning, och renderaren målar dem i den ordningen utan någon z-ordning — så det som står först målas först och hamnar underst. Siffrorna nedan är den synliga arean, räknad på rutorna, och den synliga delen av just titelrutan: det som avgör om ett kort går att <i>namnge</i> och inte bara räkna.</p>
      ${ordningen}
    </div>
  </div>
</section>

<section>
  <h2>2 · När ytan fylls</h2>
  <p>Samma yta i TV:ns egna pixlar, inte uppförstorad, med grannzonernas kanter kvar så att spill syns. Tre lägen: den berättelse issuet börjar i, en yta med ${ANTAL[1]} kort, och en yta med ${SPELAT_MAX}. Bildtexten under varje utsnitt är mätt på samma rutor som tabellen.</p>
  ${utsnitten}
</section>

<section>
  <h2>3 · Kortet någon drar dit för hand (K2)</h2>
  <p>K2 är formgivarens och spelarens frihet: ett kort som dras dit ska hamna där det släpps. Provet är sex kort i ytan, där det fjärde kom dit med fingret i stället för från telefonen — på tråden samma <code>move</code> med en punkt som <code>drop.ts</code> skickar — och tre spelades efter det. Frågan är var det ligger efteråt.</p>
  <div class="rad2">
    <div>${k2Filtar}<p class="led" style="margin-top:var(--s2)">Det gula märket är kortet Nina drog dit. Gäller fyra platser.</p></div>
    <div>
      <table class="summa"><thead><tr><th>Kandidat</th><th>Släpptes på</th><th>Ligger på tråden</th><th>Ritas på</th><th>Flyttat</th><th>Dom</th></tr></thead><tbody>${k2Html}</tbody></table>
      <p class="led" style="margin-top:var(--s3)">De fyra första räknar ut en punkt <b>på klienten</b> och skickar den med <code>move</code>, precis som en dragning gör. Ett kort som redan ligger någonstans rörs därför aldrig: <code>apply</code> skriver bara den komponent intenten namnger. <b>Zonen packar själv</b> är något annat — en utläggning i renderaren som räknas om varje gång zonen ändras — och den läser inte kortets <code>x</code> och <code>y</code> alls. Det är inte ett fel i regeln utan vad regeln <i>är</i>, och därför en egen rad i beslutet.</p>
    </div>
  </div>
</section>

<section>
  <h2>4 · Var varje regel tar slut</h2>
  <p>Issuet frågar var gränsen går. Det är tre olika gränser, och ingen regel har samma tal på alla tre. Talen är mätta genom att spela ett kort i taget, upp till ${TAK_SÖK}, och se när påståendet slutar hålla. Tabellen följer platsväxeln uppe; siffrorna är desamma vid båda platsantalen, eftersom <code>inFront</code> ger samma ${M('nu', 4, 3).zon.w} × ${M('nu', 4, 3).zon.h} mm vid varje.</p>
  ${takHtml}
  <p class="led" style="margin-top:var(--s3)"><b>Ingen kandidat är bra på alla tre.</b> Radvis kan läsas hur många kort som helst men ligger <i>aldrig</i> innanför ytan — inte ens med ett enda kort. Fjädrat ryms exakt ${T('fjader', 4).inom} kort, vilket är samma <code>FAN_MAX</code> som handen har, men bara ett kort i taget går att namnge. Staplat ryms ett. Zonen som packar sig själv ryms alltid och läser ${T('packa', 4).läsbar} — och är den enda som flyttar ett kort någon lagt själv.</p>
  <h3 style="margin-top:var(--s5)">Hela matrisen</h3>
  <p class="led">Fem regler, två platsantal, tre fyllnadsgrader, med dagens ritordning.</p>
  ${matrisHtml}
</section>

<section>
  <h2>5 · Vad prototypen hittade</h2>
  <div class="kolumner">
    <div class="kolumn">
      <h3>Regeln finns redan — på en av två vägar</h3>
      <ul>
        <li><b><code>slotIn</code> är produktens svar i dag — för tangentbordet.</b> Den räknar ut nästa lediga plats i en rad och skickar den med <code>move</code>, så två kort landar aldrig på samma millimeter. Telefonen anropar den aldrig: <code>PlayerSurface</code> skickar <code>undefined</code> där punkten ska stå, på båda sina vägar.</li>
        <li><b>Ingen ändring i protokollet behövs för någon av de fyra första.</b> <code>playIntents</code> tar redan emot en punkt — parametern heter <code>at</code> och står oanvänd — och <code>move</code> bär <code>x</code> och <code>y</code>. En regel är ett argument, inte ett verb.</li>
        <li><b>Men <code>slotIn</code> som den står ryms inte i seatytan — inte med ett enda kort.</b> Den lägger första kortet på y = ${SLOT_FÖRSTA.y} mm i en yta som är ${mått4.zon.h} mm djup, och kortet är ${CARD_MM.h} mm högt: ${(SLOT_FÖRSTA.y + CARD_MM.h - mått4.zon.h).toFixed(0)} mm utanför direkt. Vid ${SPELAT_MAX} kort ligger <b>${M('rad', 4, SPELAT_MAX).utanförFilten} av ${SPELAT_MAX}</b> helt utanför filten och ${M('rad', 4, SPELAT_MAX).påGrannzon} på ${esc(M('rad', 4, SPELAT_MAX).grannarnasNamn.join(', '))}. Regeln är skriven för filtens stora ytor och aldrig prövad mot den yta receptet ger varje plats.</li>
        <li><b>Och ingenting drar tillbaka dem.</b> <code>keptOnFelt</code> i <code>drop.ts</code> håller bara kvar det som släpps på <i>golvet</i>; «a zone that is not the floor keeps what it is given». En uträknad punkt som hamnar förbi filtkanten stannar där, och filten har ingen <code>overflow: hidden</code> — kortet ritas på mörkret utanför.</li>
        <li><b>Svaret gäller båda vägarna in.</b> Väljer beställaren något annat än radvis måste <code>slotIn</code> bytas i samma andetag, annars lägger tangentbordet och telefonen korten på två olika sätt i samma yta.</li>
      </ul>
    </div>
    <div class="kolumn">
      <h3>Ordningen är omvänd, och det är genvägens ord som gör det</h3>
      <ul>
        <li><b>Genvägen säger <code>at: 'top'</code>.</b> Receptet ger <code>mine:{plats}</code> genvägen «Framför mig» med <code>at: 'top'</code>, och <code>playIntents</code> översätter <code>top</code> till <i>ingen</i> <code>index</code>, vilket <code>apply</code> läser som <code>index 0</code>.</li>
        <li><b>I en hög är <code>index 0</code> toppen. I en yta är det ritordningens början</b> — alltså botten av det man ser. Samma ord betyder motsatta saker i de två zonslagen, och det är hela felet: kortet Nina just tryckte på hamnar underst.</li>
        <li><b>Rättelsen kräver inget nytt heller.</b> <code>playIntents</code> har redan <code>place: 'bottom'</code>, som skickar <code>index: count</code> och lägger kortet sist i ordningen — alltså överst på filten. Det är genvägens <code>at</code> som ska säga det, eller så ska ytan läsa det tvärtom mot högen.</li>
        <li><b>Med ordningen vänd blir det nyaste kortet helt synligt i varje kandidat</b> — ${pct(M('fjader', 4, 3, 'omvand').nyast.synlig)} mot ${pct(M('fjader', 4, 3).nyast.synlig)} för fjädrat vid tre kort, och ${pct(M('stapel', 4, 3, 'omvand').nyast.synlig)} mot ${pct(M('stapel', 4, 3).nyast.synlig)} för staplat. Det är mätt på samma rutor, med bara målningen kastad om.</li>
        <li><b>Och slivern som blir kvar av de äldre korten byter ände.</b> Med dagens ordning ser man varje korts <i>högra</i> kant, alltså slutet av titeln; med ordningen vänd ser man dess <i>vänstra</i>, alltså början. Det är skillnaden mellan «…rnen» och «Björ…».</li>
        <li><b>Men ordningen räddar inte nuläget.</b> Vänd eller ovänd syns <b>${M('nu', 4, 3, 'omvand').synligaKort}</b> kort av tre när alla tre ligger på samma millimeter — bara ett annat av dem. Ordningsfrågan är en följdfråga till placeringen och inte ett alternativ till den.</li>
      </ul>
    </div>
    <div class="kolumn">
      <h3>Titeln står mitt på kortet, inte längs kanten</h3>
      <ul>
        <li><b>Startramens titel är ${TITELRUTA.w} × ${TITELRUTA.h} mm och börjar ${TITELRUTA.y} mm ned</b> på ett ${CARD_MM.h} mm högt kort — mätt i <code>DEFAULT_FRAME</code> och inte gissat. Konsten ligger ovanför den, kostnaden uppe till höger.</li>
        <li><b>Det avgör vad «fjädrat» är värt.</b> En hand fungerar överlappande därför att man håller den och kan sprida den; en yta på en TV kan man inte röra. Med handens eget steg på ${HAND_STEP_MM} mm visar varje kort utom det sista sina ${HAND_STEP_MM} vänstra millimeter, och titelrutan börjar ${TITELRUTA.x} mm in och är ${TITELRUTA.w} mm bred — så ${pct(Math.min(1, Math.max(0, (HAND_STEP_MM - TITELRUTA.x) / TITELRUTA.w)))} av titeln syns. Vid ${SPELAT_MAX} kort ger fjädringen <b>${M('fjader', 4, SPELAT_MAX).helaTitlar}</b> hela titlar.</li>
        <li><b>En regel kan svara på «hur många» utan att svara på «vilka».</b> Fjädrat och staplat låter en räkna korten; bara radvis och packningen låter en läsa dem. Vilket av de två ytan ska kunna är beställarens fråga, och den är inte samma fråga som placeringen.</li>
        <li><b>Om svaret är «läsa» är ytan för liten för mer än ${Math.floor(mått4.zon.w / CARD_MM.w)} kort.</b> ${mått4.zon.w} mm rymmer ${Math.floor(mått4.zon.w / CARD_MM.w)} kort kant i kant och ${mått4.zon.h} mm rymmer bara ett i djup. Packningen läser ${T('packa', 4).läsbar} innan titlarna börjar täckas, och det är taket för <i>varje</i> regel som inte låter korten lämna ytan. Bortom det måste antingen ytan växa — vilket rör K18:s kuvert och alltså filtens storlek — eller korten överlappa.</li>
        <li><b>Fjädringens tak är handens.</b> Med ${HAND_STEP_MM} mm steg ryms ${T('fjader', 4).inom} kort hela i ytan, vilket är exakt <code>FAN_MAX</code> — talet produkten redan har bestämt att en fjäder slutar växa vid. Det är ingen konstruktion från prototypens sida: ${CARD_MM.w} + ${T('fjader', 4).inom - 1} × ${HAND_STEP_MM} = ${CARD_MM.w + (T('fjader', 4).inom - 1) * HAND_STEP_MM} mm i en yta på ${mått4.zon.w}. Vad som händer bortom taket har handen redan ett svar på: antalet säger resten.</li>
      </ul>
    </div>
    <div class="kolumn">
      <h3>Åtta platser: ytan är lika stor, men skärmen är mindre</h3>
      <ul>
        <li><b>Ytan krymper inte.</b> <code>inFront</code> räknar ${mått4.zon.w} × ${mått4.zon.h} mm ur platsens ${'500'} mm längs kanten, och det talet är detsamma vid två platser som vid ${MAX_PLAYERS}. Det som ändras är filten: ${feltFor(4).w} × ${feltFor(4).h} mm vid fyra, ${feltFor(MAX_PLAYERS).w} × ${feltFor(MAX_PLAYERS).h} vid ${MAX_PLAYERS}.</li>
        <li><b>Så det är pixlarna som tar slut, inte millimetrarna.</b> ${måste(SKALA_PÅ_TV[4], '4').toFixed(3)} px/mm vid fyra platser mot ${måste(SKALA_PÅ_TV[MAX_PLAYERS], 'max').toFixed(3)} vid ${MAX_PLAYERS}: ett kort går från ${(CARD_MM.w * måste(SKALA_PÅ_TV[4], '4')).toFixed(0)} px brett till ${(CARD_MM.w * måste(SKALA_PÅ_TV[MAX_PLAYERS], 'max')).toFixed(0)}. Varje regel lägger korten på samma millimeter vid båda platsantalen; skillnaden är att det som var ett kort blir en frimärksstor bild.</li>
        <li><b>Det gör överlappande regler sämre vid åtta och inte bättre.</b> Fjädringens ${HAND_STEP_MM} mm är ${(HAND_STEP_MM * måste(SKALA_PÅ_TV[MAX_PLAYERS], 'max')).toFixed(0)} px vid ${MAX_PLAYERS} platser, och staplingens ${STAPEL_MM} mm är ${(STAPEL_MM * måste(SKALA_PÅ_TV[MAX_PLAYERS], 'max')).toFixed(0)} px. En förskjutning på ${(STAPEL_MM * måste(SKALA_PÅ_TV[MAX_PLAYERS], 'max')).toFixed(0)} px syns på tre meters håll som en tjockare kant och inte som flera kort.</li>
        <li><b>Ytan är dessutom inte liggande vid varje plats.</b> Platserna vid öster och väster får en <i>stående</i> yta, ${mått4.zon.h} × ${mått4.zon.w} mm, eftersom <code>inFront</code> vänder rektangeln mot kanten. En regel som läser <code>geometry.w</code> — som <code>slotIn</code> gör — får därför fyra kort i bredd vid södra kanten och ett vid den östra. Regeln måste läsa zonens <i>långa</i> axel och inte dess bredd.</li>
      </ul>
    </div>
    <div class="kolumn">
      <h3>Att packa är att ha två svar på var kortet ligger</h3>
      <ul>
        <li><b>De fyra första räknar på klienten och skriver ned svaret.</b> Punkten reser i <code>move</code>, <code>apply</code> skriver den i tillståndet, <code>project</code> skickar den, och filten ritar den. Ett svar, en väg.</li>
        <li><b>En utläggning i renderaren läser inte de talen alls.</b> Komponenten bär fortfarande <code>x: ${K2_AV('packa').lagrat.x.toFixed(0)}, y: ${K2_AV('packa').lagrat.y.toFixed(0)}</code> på tråden medan skärmen ritar den på ${K2_AV('packa').ritat.x.toFixed(0)}, ${K2_AV('packa').ritat.y.toFixed(0)}. Det är inte bara K2-brottet — det är att var ett kort ligger blir två påståenden som kan gå isär, i ett repo vars regel är att <code>project</code> är enda vägen från tillstånd till tråd.</li>
        <li><b>Det finns en tredje form som ingen har föreslagit: packa i loggen.</b> Klienten skickar ett kuvert (K3) med ett <code>move</code> per kort i ytan i stället för ett. Då finns bara ett svar igen, packningen går att ångra, och återspelningen är identisk. Priset är ${SPELAT_MAX + 1} intents i stället för 2 för det tionde kortet, och att <i>flytten av grannens kort står i loggen med Ninas namn på</i>.</li>
        <li><b>Den formen bryter fortfarande mot K2</b> — det dragna kortet flyttas ändå — men den bryter mot den <i>synligt</i>, och det är skillnaden mellan ett beslut och en avvikelse.</li>
      </ul>
    </div>
  </div>
</section>

<section>
  <h2>6 · Vad prototypen rekommenderar</h2>
  <div class="kolumner">
    <div class="kolumn" style="border-color:#3c6a4a">
      <h3>Fjädrat, med ordningen vänd</h3>
      <p style="margin:0 0 var(--s2);font-size:12px;line-height:1.65">Det är den enda kandidaten som klarar alla tre villkoren issuet ställer utan att något annat beslut behöver rivas upp:</p>
      <ul>
        <li><b>Den lämnar aldrig ytan</b> upp till ${T('fjader', 4).inom} kort, och det taket är produktens eget (<code>FAN_MAX</code>) och inte ett valt tal.</li>
        <li><b>Antalet går att räkna</b> vid varje fyllnadsgrad och vid varje platsantal — ${M('fjader', MAX_PLAYERS, SPELAT_MAX).synligaKort} av ${SPELAT_MAX} syns även vid ${MAX_PLAYERS} platser.</li>
        <li><b>K2 är orörd.</b> Punkten räknas på klienten och skrivs i loggen; ett kort som dras dit ligger kvar där det släpptes, mätt till ${K2_AV('fjader').flyttat.toFixed(1)} mm.</li>
        <li><b>Med <code>place: 'bottom'</code> är det nyaste kortet helt läsbart</b> (${pct(M('fjader', 4, 3, 'omvand').nyast.synlig)}), och de äldre visar sina vänstra ${HAND_STEP_MM} mm, alltså början av sina titlar.</li>
        <li><b>Den är redan känd för ögat.</b> Handen fjädrar med samma steg, så en yta som fjädrar säger «det här är kort som ligger framför någon» utan att någon behöver lära sig något nytt.</li>
      </ul>
      <p style="margin:var(--s3) 0 0;font-size:12px;line-height:1.65"><b>Priset, uttryckligen:</b> bara ett kort i taget går att namnge från soffan. Är det viktigare att kunna <i>läsa</i> alla kort i ytan än att kunna räkna dem, är fjädrat fel och packningen rätt — och då måste K2 vika med en egen rad.</p>
    </div>
    <div class="kolumn">
      <h3>Vad beställaren måste avgöra</h3>
      <ul>
        <li><b>Ska ytan kunna läsas eller räknas?</b> Ingen regel gör båda bortom ${T('packa', 4).läsbar} kort, och ytan är ${mått4.zon.w} × ${mått4.zon.h} mm vid varje platsantal. Det är den enda frågan som verkligen delar kandidaterna.</li>
        <li><b>Får ordningen bytas?</b> Att <code>Framför mig</code> lägger kortet underst är ett fel i genvägens <code>at</code> och inte i placeringen. Det kan rättas oavsett vilken regel som väljs, och prototypen mäter att det är gratis.</li>
        <li><b>Om packningen väljs: viker K2 för receptets egna ytor?</b> Det är en egen rad i DESIGN-BESLUT.md, och den måste också säga om packningen sker i renderaren (två svar) eller i loggen (ett svar, ${SPELAT_MAX + 1} intents).</li>
        <li><b>Gäller regeln alla publika ytor eller bara receptets?</b> Prototypen kan inte svara: protokollet har ingen idé om en zon «med egen layout» — en zon är en rektangel och ingenting mer. Antingen gäller regeln varje <code>area</code>, eller så måste ett nytt begrepp införas, och det är ett eget beslut.</li>
      </ul>
    </div>
  </div>
</section>

<section>
  <h2>7 · Vad den öppna frågan säger, ordagrant</h2>
  <p>Raden står i avsnitt I, rad ${RAD_ÖPPEN + 1}, och generatorn letar upp den på text — den faller om raden skrivs om:</p>
  <div class="beslut"><pre><code>${esc(ÖPPEN_FRÅGA)}</code></pre></div>
  <p style="margin-top:var(--s3)">Prototypen föreslår inget <code>### L</code>-nummer. De delas ut när någon implementerar, och ett reserverat nummer blir taget. Men beslutet behöver <b>två</b> rader och inte en: vilken regel som gäller, och — om valet blir «zonen packar själv» — att K2:s frihet uttryckligen viker för den i receptets egna ytor.</p>
</section>

<div class="fotnot">
  <b>Vad som är mätt och vad som är konstruerat</b>
  <ul>
    <li><b>Mätt:</b> varje tal i tabellerna och i bildtexterna. Bordet är <code>openingSetup</code>, tillståndet är <code>initialState</code> plus riktiga intents genom <code>apply</code>, handlingarna är <code>playIntents</code> <i>importerad</i> ur <code>packages/web/src/player/play.ts</code>, och var ett kort ligger är <code>absoluteOf</code> på snapshotten ur <code>project</code>.</li>
    <li><b>Mätt:</b> kandidaten «radvis». Den är <code>slotIn</code> ur <code>packages/web/src/table/keyboard.ts</code>, importerad och anropad som <code>intentsForPlace</code> anropar den. Det är inte en rekonstruktion av regeln utan regeln.</li>
    <li><b>Mätt:</b> skalan. <code>fitScale</code>, <code>TV_AIR_PX</code>, <code>turnToFit</code>, <code>feltWithHands</code> och <code>handExtent</code> ur produkten, i den ordning <code>TableRenderer</code> ställer dem i tv-läge, med <code>rotate = 0</code> och <code>margin = 0</code> som <code>/table</code> lämnar dem.</li>
    <li><b>Mätt:</b> synlig area och synlig titelruta. Rutorna är kortets och titelelementets egna millimetrar, och täckningen räknas exakt på komprimerade koordinater — inte uppskattad ur en bild.</li>
    <li><b>Mätt:</b> korten. <code>compile</code> i <code>packages/template</code> — den enda renderaren (E2) — i 63 × 88 mm, satt i startramen <code>DEFAULT_FRAME</code> med EB Garamond pinnad ur en riktig woff2 i den här katalogen. Ingen ritad ruta liknar ett kort någonstans på sidan.</li>
    <li><b>Konstruerat:</b> staplingens förskjutning på ${STAPEL_MM} mm och packningens luft på ${PACK_LUFT} mm. Produkten har inga sådana mått, och issuet säger bara «en aning förskjutet». Talen är valda och sidan säger det.</li>
    <li><b>Konstruerat:</b> fjädringens form. Steget är produktens eget (<code>HAND_STEP_MM</code>), men att en yta ska fjädra <i>längs sin långa axel från ena änden</i> är prototypens val; handen fjädrar kring sin mitt och lutar korten, vilket en yta inte gör.</li>
    <li><b>Konstruerat:</b> filtens möbler runt ytan — högarnas och handens utseende, zonnamnens exakta utskjutning (K19 har en noggrannare regel), och att filten inte lutar. Geometrin, zonernas rektanglar och skalan är produktens.</li>
    <li><b>Konstruerat:</b> leken. ${RADER.length} djur och en poängräknare; inget spel i katalogen ser ut så.</li>
    <li><b>Utanför prototypen:</b> vad som händer när ytan har en egen layout formgivaren satt. Protokollet har ingen sådan idé i dag — en zon är en rektangel och ingenting mer — så frågan «gäller regeln bara ytor utan egen layout?» har inget «utan egen layout» att peka på. Att införa ett sådant begrepp är ett eget beslut och en egen fråga.</li>
    <li><b>Utanför prototypen:</b> vad telefonen ritar av en annan plats publika yta. <code>targetsOf</code> sållar på ägare och inte på synlighet, vilket prototypen till #414 mätte och som följer med i D:s implementation.</li>
  </ul>
  <b style="margin-top:var(--s3);display:block">Vakter som kördes innan sidan skrevs (${vakter.length})</b>
  <ul>${vaktHtml}</ul>
</div>
</div>

<script type="module">
// Växlarna, och en vakt mot tomhet: sidan påstår ett kortmått i pixlar, så den mäter också att
// kortet verkligen ritades och hur brett det blev. Ritades inget kort säger den det, i stället
// för att visa ett tomt fält.
function mät() {
  const k = document.body.dataset.kand
  const p = document.body.dataset.platser
  const el = document.querySelector('.lage[data-kand="' + k + '"][data-platser="' + p + '"] .filt [data-card]')
  const r = el?.getBoundingClientRect()
  const ut = document.getElementById('matt-kort')
  const bredd = r && r.width > 0 ? r.width : 0
  // Filten ritas i halv skala, så ett kort på en riktig TV är dubbelt så brett som här.
  ut.textContent = bredd > 0 ? bredd.toFixed(1) + ' px i halv skala, ' + (bredd * 2).toFixed(1) + ' px på en riktig TV' : 'INGET KORT RITADES'
  ut.style.color = bredd === 0 ? '#ff9d9d' : ''
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-valj]')
  if (!b) return
  const grupp = b.dataset.grupp
  document.body.dataset[grupp === 'kand' ? 'kand' : 'platser'] = b.dataset.valj
  document.querySelectorAll('button[data-grupp="' + grupp + '"]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
  mät()
})
await document.fonts.ready
mät()
</script>
</body>
</html>
`


writeFileSync(`${HÄR}prototyper/05-kortets-plats.html`, sida)
console.log('skrev prototyper/05-kortets-plats.html')
console.table(
  KANDIDATER.flatMap((k) =>
    PLATSANTAL.map((p) => {
      const tre = M(k.id, p, 3)
      const full = M(k.id, p, SPELAT_MAX)
      return {
        kandidat: k.namn,
        platser: p,
        'syns vid 3': `${tre.synligaKort}/3`,
        'syns vid 10': `${full.synligaKort}/${SPELAT_MAX}`,
        'hela titlar vid 10': full.helaTitlar,
        'utanför ytan vid 10': full.utanförZon,
        'nyast synlig': pct(tre.nyast.synlig),
        K2: K2_AV(k.id).bryter ? `bryter (${K2_AV(k.id).flyttat.toFixed(1)} mm)` : 'ok',
      }
    }),
  ),
)
console.log(`${vakter.length} vakter gröna`)
