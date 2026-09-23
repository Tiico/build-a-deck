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
import { CARD_MM, absoluteOf, keptOnFelt } from '../../../packages/web/src/table/drop.js'
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
  DROP.includes("{ v: 'move', component: c.id, to: target.zone, x:") ,
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
type Mått = {
  kandidat: Kandidat
  platser: number
  antal: number
  zon: Ruta
  kort: KortMått[]
  // Kortet Nina spelade sist, alltså det översta i zonordningen.
  nyast: KortMått
  synligaKort: number
  helaTitlar: number
  utanförZon: number
  utanförFilten: number
  påGrannzon: number
}

function mät(k: Körning, antal: number): Mått {
  const zonVy = måste(k.vy.zones.find((z) => z.id === 'mine:A'), 'mine:A')
  const zon: Ruta = { x: zonVy.geometry.x, y: zonVy.geometry.y, w: zonVy.geometry.w, h: zonVy.geometry.h }
  const i_zonen = k.vy.components.filter((c) => c.zone === 'mine:A')
  // Ritordningen är zonordningen: `project` skriver komponenterna i `z.order` och renderaren
  // målar dem i den ordningen utan z-ordning. Det som står först målas först och hamnar underst.
  const golv = måste(k.vy.zones.find((z) => z.id === k.vy.floor), 'golvet')
  const grannar = k.vy.zones.filter((z) => z.id !== 'mine:A' && z.id !== k.vy.floor && z.kind === 'area')
  const rutaAv = (c: VisibleComponentState): Ruta => {
    const p = absoluteOf(k.vy, c)
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
  // Det senast spelade kortet är det som `move` la på `index 0`, alltså det första i ordningen.
  const nyast = måste(kort[0], 'det senast spelade kortet')
  return {
    kandidat: k.kandidat,
    platser: k.platser,
    antal,
    zon,
    kort,
    nyast,
    synligaKort: kort.filter((c) => c.synlig > 0.0001).length,
    helaTitlar: kort.filter((c) => c.titelSynlig >= 0.999).length,
    utanförZon: kort.filter((c) => !c.helInomZon).length,
    utanförFilten: kort.filter((c) => {
      const kvar = keptOnFelt({ x: c.ruta.x, y: c.ruta.y }, golv.geometry)
      return Math.abs(kvar.x - c.ruta.x) > 1e-6 || Math.abs(kvar.y - c.ruta.y) > 1e-6
    }).length,
    påGrannzon: kort.filter((c) => grannar.some((g) => skär(c.ruta, g.geometry) > 0)).length,
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
      MATRIS.set(`${kand.id}|${platser}|${antal}`, mät(kör(kand.id, platser, antal), antal))
    }
  }
}
const M = (k: Kandidat, p: number, n: number): Mått => måste(MATRIS.get(`${k}|${p}|${n}`), `${k}|${p}|${n}`)

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
  const ritat = kand.var === 'renderaren' ? packat(zon.geometry, plats, i_zonen.length) : lagrat
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
  for (const c of k.vy.components.filter((c) => c.zone === 'mine:A')) {
    const p = absoluteOf(k.vy, c)
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
  for (const c of k.vy.components.filter((c) => c.zone === 'mine:A')) {
    const p = absoluteOf(k.vy, c)
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
