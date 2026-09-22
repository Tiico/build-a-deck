// Genererar prototypen för #414, andra halvan: variant D — ytan framför en plats är publik.
//
// Ingenting här är ritat för hand som skulle kunna komma ur produkten:
//
//  · Bordet är `openingSetup` i `packages/server/src/recipe.ts` — wizardens startbord — lagt ut
//    av `setupFromProject` och byggt av `initialState` i `packages/engine`.
//  · Korten är `compile` i `packages/template`, den enda renderaren (E2), i 63 × 88 mm och satta
//    i startramen `DEFAULT_FRAME` ur `packages/web/src/wizard/frames.ts`.
//  · Handlingarna är riktiga intents körda genom `apply` i motorn. `Framför mig` är den
//    `playIntents` i `packages/web/src/player/play.ts` faktiskt skickar, med samma gren för en
//    publik zon som produkten har i dag.
//  · Varje ruta med trafik i är `JSON.stringify` på det `ServerMessage` servern skickar
//    (`packages/server/src/server.ts` gör exakt det), med snapshotten ur `project` — den enda
//    vägen från tillstånd till tråd — och patchen ur `diff`.
//  · Läckagetabellen körs av `mentions` och `cardsIn` ur `packages/e2e/support/frames.ts`, samma
//    två funktioner som `private-area.spec.ts` dömer på.
//
// Körs med:
//   packages/server/node_modules/.bin/tsx docs/ux-audits/2026-09-22/generera-414.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { SCHEMA_VERSION, type Applied, type Intent, type ServerMessage, type Snapshot, type ZoneView } from '../../../packages/protocol/src/index.js'
import { CARD_STANDARD_63x88, TOKEN_COUNTER, TypeRegistry, apply, diff, initialState, project, type SetupDef, type TableState } from '../../../packages/engine/src/index.js'
import { COUNTER_PITCH_MM, counterSpots, edgeOf, feltFor, handGeometry, inFront, countersAt, openingSetup, CHIP_MM, type Setup } from '../../../packages/server/src/recipe.js'
import { setupFromProject } from '../../../packages/server/src/setup.js'
import { facesOf, type Deck } from '../../../packages/server/src/faces.js'
import { DEFAULT_FRAME, type Field } from '../../../packages/web/src/wizard/frames.js'
import { compile, type Compiled } from '../../../packages/template/src/index.js'
import { cardsIn, mentions } from '../../../packages/e2e/support/frames.js'

const HÄR = new URL('.', import.meta.url).pathname
const måste = <T,>(v: T | undefined | null, vad: string): T => {
  if (v === undefined || v === null) throw new Error(`saknas: ${vad}`)
  return v
}

// ── Vakter ──────────────────────────────────────────────────────────────────────────────────
// En prototyp som påstår något ska falla när påståendet slutar vara sant. De här körs innan
// sidan skrivs, och kastar hellre än skriver en sida som ljuger.
const vakter: { vad: string; svar: string }[] = []
function vakt(vad: string, villkor: boolean, svar: string): void {
  if (!villkor) throw new Error(`vakten föll: ${vad} — ${svar}`)
  vakter.push({ vad, svar })
}

// ── Vad produkten säger om sig själv, läst ur koden ──────────────────────────────────────────
// Två rader prototypen bygger ett påstående på. De läses ur filerna i stället för att citeras ur
// minnet, så att en omskrivning fäller generatorn i stället för att tyst göra sidan osann.
const KÄLLA = (fil: string): string => readFileSync(`${HÄR}../../../${fil}`, 'utf8')

const PLAYSHEET = KÄLLA('packages/web/src/player/PlaySheet.tsx')
vakt(
  '`targetsOf` sållar på ägare och inte på synlighet',
  PLAYSHEET.includes('if (z.owner !== undefined && z.owner !== view.seat) return false'),
  'raden står kvar i PlaySheet.tsx',
)
const PLAY = KÄLLA('packages/web/src/player/play.ts')
vakt(
  '`playIntents` vänder upp kortet när målzonen är publik',
  PLAY.includes("const isPublic = target?.mode === 'order'") && PLAY.includes("[move, { v: 'flip', component: c.id, face: 'front' }]"),
  'grenen står kvar i play.ts',
)
const RECIPE = KÄLLA('packages/server/src/recipe.ts')
vakt(
  'receptet ger `mine:{plats}` synligheten `owner`',
  RECIPE.includes("{ id: `mine:${seat}`, kind: 'area', name: forSeat(name, seat), visibility: 'owner', owner: seat"),
  'raden står kvar i recipe.ts',
)
const BESLUT = KÄLLA('DESIGN-BESLUT.md').split('\n')
const RAD_623 = måste(
  BESLUT.findIndex((r) => r.startsWith('Wizarden ger varje plats en yta')),
  'raden om Framför mig i DESIGN-BESLUT.md',
)
vakt('raden om den privata ytan finns i DESIGN-BESLUT.md', RAD_623 > 0, `den står på rad ${RAD_623 + 1}`)

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
const TITLAR = ['Björnen', 'Vargen', 'Räven', 'Lodjuret', 'Älgen', 'Korpen', 'Uven', 'Grävlingen', 'Hjorten', 'Ekorren', 'Mården', 'Ormen', 'Haren', 'Ugglan', 'Lommen', 'Igelkotten']
const RADER = TITLAR.map((titel, i) => ({
  id: `kort-${i + 1}`,
  fields: {
    title: titel,
    cost: String((i % 4) + 1),
    body: 'När den kommer i spel: dra ett kort.\n\nSå länge den står kvar får dina djur +1 i styrka.',
    art: bild(...måste(PALETT[i % PALETT.length], 'palett')),
  },
}))

// Startbordet: fyra platser och en poängräknare per plats, precis som wizarden lägger det.
const STARTBORD: Setup = openingSetup({ players: 4, counters: [{ name: 'Poäng', start: 0 }] })
const PLATSER = 4
const NAMN: Record<string, string> = { A: 'Nina', B: 'Olle', C: 'Cissi', D: 'Dag' }

const registry = new TypeRegistry([CARD_STANDARD_63x88, TOKEN_COUNTER])
const template = { faces: { front: DEFAULT_FRAME.front(FÄLT), back: DEFAULT_FRAME.back } }
const deckRows = Object.fromEntries(RADER.map((r) => [r.id, r.fields]))

// Startramen är satt i EB Garamond, som inte reser med bygget (B3, #420). Filen ligger i den
// här katalogen sedan #420 och pinnas här, så att kortet på filten är satt i det ansikte ramen
// ber om och inte i vad maskinen råkar ha.
const FONTS = { 'EB Garamond': { stack: '"EB Garamond", serif', asset: 'asset:eb-garamond', src: '../typsnitt/eb-garamond.woff2' } }

// ── Ett bord, spelat ────────────────────────────────────────────────────────────────────────
type Läge = 'idag' | 'd' | 'ryggar' | 'privat'

// Vad varje variant gör med receptets `visibility` på ytorna framför platserna.
function setupFör(läge: Läge): Setup {
  const mine = (z: Setup['zones'][number]) => z.id.startsWith('mine:')
  if (läge === 'idag') return STARTBORD
  if (läge === 'privat')
    // D är valt — receptet ger alla ytor `all` — och formgivaren har tagit tillbaka sin egen.
    return { ...STARTBORD, zones: STARTBORD.zones.map((z) => (mine(z) ? { ...z, visibility: z.id === 'mine:A' ? ('owner' as const) : ('all' as const) } : z)) }
  return { ...STARTBORD, zones: STARTBORD.zones.map((z) => (mine(z) ? { ...z, visibility: 'all' as const } : z)) }
}

type Körning = {
  läge: Läge
  setupDef: SetupDef
  före: TableState
  efter: TableState
  spelade: string[]
  intents: Intent[]
  faces: Record<string, Record<string, string>>
  titles: Record<string, string>
}

function kör(läge: Läge): Körning {
  const setup = setupFör(läge)
  const setupDef = setupFromProject({ rows: RADER, setup } as never)
  const { faces, titles } = facesOf({ template, rows: deckRows, icons: {}, fonts: { 'EB Garamond': { stack: FONTS['EB Garamond'].stack, src: FONTS['EB Garamond'].src } } } as Deck, setupDef, registry, 300, 0)
  let state = initialState({ project: 'skogens-herrar', revision: 1 } as never, setupDef, registry)
  let n = 0
  const gör = (intent: Intent, by: string | null): void => {
    const line: Applied = { schemaVersion: SCHEMA_VERSION, seq: state.seq + 1, batch: `b${++n}`, at: '2026-09-22T19:00:00.000Z', by, intent }
    state = apply(state, registry, line)
  }
  for (const [seat, name] of Object.entries(NAMN)) gör({ v: 'seat.claim', seat, name }, null)
  const överst = (zone: string) => måste(state.zones[zone]?.order[0], `överst i ${zone}`)
  // Fem kort till Nina, tre till Olle. Draget är `split` i produkten; här är det ett `move`,
  // eftersom frågan inte är hur ett kort når handen utan vad som händer när det lämnar den.
  for (let i = 0; i < 5; i++) gör({ v: 'move', component: överst('draw'), to: 'hand:A' }, 'A')
  for (let i = 0; i < 3; i++) gör({ v: 'move', component: överst('draw'), to: 'hand:B' }, 'B')

  // «Framför mig», tre gånger, med exakt de intents telefonen skickar.
  const spelade: string[] = []
  const intents: Intent[] = []
  let före = state
  for (let i = 0; i < 3; i++) {
    const kort = överst('hand:A')
    if (i === 2) före = state
    const zon = måste(project(state, registry, 'A', { faces, titles }).zones.find((z) => z.id === 'mine:A'), 'mine:A för Nina')
    // `playIntents`, ord för ord — inklusive grenen som vänder upp kortet i en publik zon. Den
    // kan inte importeras hit (modulen drar in React och en .css), så den är skriven av; vakten
    // ovan läser att originalet fortfarande säger detsamma.
    const publik = zon.mode === 'order'
    const move: Intent = { v: 'move', component: kort, to: 'mine:A' }
    // Mellanläget är samma zon utan uppvändningen: korten ligger där med ryggen upp.
    const rad: Intent[] = publik && läge !== 'ryggar' ? [move, { v: 'flip', component: kort, face: 'front' }] : [move]
    for (const it of rad) gör(it, 'A')
    intents.push(...rad)
    spelade.push(kort)
  }
  return { läge, setupDef, före, efter: state, spelade, intents, faces, titles }
}

const KÖRNINGAR: Record<Läge, Körning> = { idag: kör('idag'), d: kör('d'), ryggar: kör('ryggar'), privat: kör('privat') }

// ── Vad som går över tråden ─────────────────────────────────────────────────────────────────
type Vy = { id: 'tv' | 'olle' | 'nina'; namn: string; seat: string | null }
const VYER: Vy[] = [
  { id: 'tv', namn: 'Televisionen', seat: null },
  { id: 'olle', namn: 'Olles telefon', seat: 'B' },
  { id: 'nina', namn: 'Ninas telefon', seat: 'A' },
]

const snapshotFör = (k: Körning, state: TableState, seat: string | null): Snapshot => project(state, registry, seat, { faces: k.faces, titles: k.titles })
// Ramen servern skickar: `ws.send(JSON.stringify(message))` i `packages/server/src/server.ts`.
const ram = (m: ServerMessage): string => JSON.stringify(m)

type Trafik = { snapshot: string; patch: string; zon: ZoneView; komponenter: unknown[]; korten: string[]; namngivna: string[] }
const trafik: Record<Läge, Record<string, Trafik>> = { idag: {}, d: {}, ryggar: {}, privat: {} }

for (const läge of Object.keys(KÖRNINGAR) as Läge[]) {
  const k = KÖRNINGAR[läge]
  for (const vy of VYER) {
    const före = snapshotFör(k, k.före, vy.seat)
    const efter = snapshotFör(k, k.efter, vy.seat)
    const snapshot = ram({ t: 'snapshot', snapshot: efter, activity: [] })
    const patch = ram({ t: 'patch', patch: diff(före, efter) })
    const zon = måste(efter.zones.find((z) => z.id === 'mine:A'), `mine:A i ${vy.id}`)
    const komponenter = efter.components.filter((c) => c.zone === 'mine:A')
    // Samma två funktioner som `private-area.spec.ts` dömer på, körda på de här ramarna.
    const alla = [snapshot, patch]
    const korten = cardsIn(alla, 'mine:A')
    const namngivna = Object.values(k.titles).filter((titel) => mentions(alla, titel).length > 0)
    trafik[läge][vy.id] = { snapshot, patch, zon, komponenter, korten, namngivna }
  }
}

// Vad Nina spelade, med sina riktiga titlar.
const NINAS_KORT = KÖRNINGAR.d.spelade.map((id) => {
  const c = måste(KÖRNINGAR.d.efter.components[id], id)
  return { id, cardRef: c.cardRef, titel: måste(KÖRNINGAR.d.titles[c.cardRef], c.cardRef), x: c.x, y: c.y }
})

// ── Vakterna som gör läckagetabellen icke-vakuös ────────────────────────────────────────────
vakt(
  'Nina får veta sina egna tre kort i de tre lägen där hon får det',
  (['idag', 'd', 'privat'] as Läge[]).every((l) => måste(trafik[l]['nina'], l).korten.length === 3),
  'sökningen kan hitta dem alls — det är vakten som gör nollorna nedan meningsfulla',
)
vakt(
  'i mellanläget får inte heller Nina veta vad hon själv lade',
  måste(trafik.ryggar['nina'], 'ryggar').korten.length === 0,
  "`canSeeFace` kräver framsidan i en `all`-zon, och ägarskapet ger henne ingenting där",
)
vakt('i dag får varken TV:n eller Olle veta något av dem', trafik.idag['tv']!.korten.length === 0 && trafik.idag['olle']!.korten.length === 0, 'noll identiteter i deras ramar')
vakt('med D får både TV:n och Olle alla tre', trafik.d['tv']!.korten.length === 3 && trafik.d['olle']!.korten.length === 3, 'tre identiteter i deras ramar')
vakt('med D reser också titlarna', trafik.d['tv']!.namngivna.length === 3, 'tre titlar i TV:ns ramar')
vakt('mellanläget lägger ut korten utan att namnge dem', trafik.ryggar['tv']!.komponenter.length === 3 && trafik.ryggar['tv']!.korten.length === 0, 'tre komponenter, noll identiteter')
vakt(
  'en yta formgivaren gjort privat säger exakt vad den sade före D',
  JSON.stringify(trafik.privat['tv']!.zon) === JSON.stringify(trafik.idag['tv']!.zon) && trafik.privat['tv']!.korten.length === 0,
  'zonvyn är identisk, tecken för tecken',
)
vakt('telefonen lägger alla tre korten på samma millimeter', NINAS_KORT.every((c) => c.x === 0 && c.y === 0), 'x = 0 och y = 0 för alla tre')

// ── Filten ──────────────────────────────────────────────────────────────────────────────────
// Sändningsläget i halv skala: 960 × 540 står för 1920 × 1080. Skalan är `fit.ts`:s egen räkning
// för TV-läget — ingen ram kring träet, `TV_AIR_PX` luft — fast med halva rutan, så varje
// millimeter på sidan är exakt halva millimetern på en riktig TV.
const TV = { w: 960, h: 540 }
const TV_AIR_PX = 20
const FELT = feltFor(PLATSER)
const SKALA = Math.min((TV.w - 2 * TV_AIR_PX) / FELT.w, (TV.h - 2 * TV_AIR_PX) / FELT.h)
const px = (mm: number): number => mm * SKALA
const vänster = (mm: number): number => px(mm + FELT.w / 2)
const övre = (mm: number): number => px(mm + FELT.h / 2)
// En CSS-millimeter är 96/25.4 px. Ett kompilerat kort är 63 mm brett; för att rita det i
// filtens egna pixlar skalas det med kvoten och ingenting annat.
const CSS_MM = 96 / 25.4
const KORTSKALA = SKALA / CSS_MM
const KORT_MM = { w: CARD_STANDARD_63x88.physical.widthMm, h: CARD_STANDARD_63x88.physical.heightMm }
const KORT_PÅ_FILTEN_PX = px(KORT_MM.w)
const KORT_PÅ_TV_PX = KORT_PÅ_FILTEN_PX * 2

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Korten, kompilerade en gång var. Samma `compile` som renderaren och editorn kallar.
const kompilerade = new Map<string, Compiled>()
for (const kort of NINAS_KORT) {
  const scope = `#k-${kort.cardRef}`
  kompilerade.set(kort.cardRef, compile({ type: CARD_STANDARD_63x88, face: template.faces.front, row: måste(deckRows[kort.cardRef], kort.cardRef), icons: {}, scope, fonts: FONTS }))
}
const ryggScope = '#k-rygg'
const kompileradRygg = compile({ type: CARD_STANDARD_63x88, face: template.faces.back, row: måste(deckRows['kort-1'], 'kort-1'), icons: {}, scope: ryggScope, fonts: FONTS })
vakt('varje kort är kompilerat och bär sin titel', NINAS_KORT.every((k) => måste(kompilerade.get(k.cardRef), k.cardRef).html.includes(k.titel)), 'titeln står i den kompilerade markupen')

const kortHtml = (cardRef: string, extra = ''): string =>
  `<div class="filtkort" id="k-${esc(cardRef)}" style="${extra}transform:scale(${KORTSKALA.toFixed(5)})">${måste(kompilerade.get(cardRef), cardRef).html}</div>`
const ryggHtml = (): string => `<div class="filtkort" id="k-rygg" style="transform:scale(${KORTSKALA.toFixed(5)})">${kompileradRygg.html}</div>`

function filtHtml(läge: Läge): string {
  const bitar: string[] = []
  const zon = (g: { x: number; y: number; w: number; h: number }, id: string, namn: string, kant: string, inuti = ''): void => {
    const utanför =
      kant === 'S' ? `left:50%;top:-14px;transform:translateX(-50%)`
      : kant === 'N' ? `left:50%;top:100%;margin-top:3px;transform:translateX(-50%)`
      : kant === 'W' ? `left:100%;margin-left:5px;top:50%;transform:translateY(-50%)`
      : `left:0;margin-left:-5px;top:50%;transform:translate(-100%,-50%)`
    bitar.push(
      `<div class="byd-zone" data-area="${esc(id)}" style="left:${vänster(g.x).toFixed(1)}px;top:${övre(g.y).toFixed(1)}px;width:${px(g.w).toFixed(1)}px;height:${px(g.h).toFixed(1)}px"><span style="${utanför}">${esc(namn)}</span>${inuti}</div>`,
    )
  }
  // De två högarna på filten, ritade som kortryggar kring sin punkt, som `drop.ts` gör.
  const hög = (x: number, y: number, namn: string, n: number, tom: boolean): void => {
    bitar.push(
      `<div class="byd-pile${tom ? ' tom' : ''}" style="left:${vänster(x - KORT_MM.w / 2).toFixed(1)}px;top:${övre(y - KORT_MM.h / 2).toFixed(1)}px;width:${KORT_PÅ_FILTEN_PX.toFixed(1)}px;height:${px(KORT_MM.h).toFixed(1)}px"><b class="byd-pile-count">${n}</b><em>${esc(namn)}</em></div>`,
    )
  }
  const k = KÖRNINGAR[läge]
  const tv = måste(trafik[läge]['tv'], läge)
  const drag = måste(k.efter.zones['draw'], 'draw').order.length
  hög(-140, 0, 'Draghög', drag, false)
  hög(140, 0, 'Kasthög', 0, true)

  for (let i = 0; i < PLATSER; i++) {
    const seat = måste(['A', 'B', 'C', 'D'][i], 'plats')
    const kant = edgeOf(i, PLATSER)
    const front = inFront(i, PLATSER, 1)
    const chips = countersAt(i, PLATSER, 1)
    const hand = handGeometry(i, PLATSER)

    let inuti = ''
    if (seat === 'A') {
      if (tv.zon.mode === 'count' && tv.zon.count > 0) {
        // `.byd-area-count` ur `table.css`, som den ser ut sedan #437.
        inuti = `<b class="byd-area-count">${tv.zon.count}</b>`
      } else if (tv.zon.mode === 'order') {
        // Korten ligger där projektionen säger att de ligger: `absoluteOf` är zonens hörn plus
        // komponentens egna x och y, och telefonen skickar inga. Alla tre på samma millimeter.
        const ordning = tv.komponenter as { id: string; cardRef: string | null; x: number; y: number }[]
        inuti = ordning
          .map((c) => {
            const l = px(c.x)
            const t = px(c.y)
            const kropp = c.cardRef ? kortHtml(c.cardRef) : ryggHtml()
            return `<div class="filtplats" style="left:${l.toFixed(1)}px;top:${t.toFixed(1)}px;width:${KORT_PÅ_FILTEN_PX.toFixed(1)}px;height:${px(KORT_MM.h).toFixed(1)}px">${kropp}</div>`
          })
          .join('')
      }
    }
    zon(front, `mine:${seat}`, `Framför ${seat}`, kant, inuti)
    zon(chips, `counters:${seat}`, `Räknare ${seat}`, kant)
    for (const spot of counterSpots(chips, 1)) {
      bitar.push(
        `<div class="byd-token" style="left:${vänster(chips.x + spot.x).toFixed(1)}px;top:${övre(chips.y + spot.y).toFixed(1)}px;width:${px(CHIP_MM).toFixed(1)}px;height:${px(CHIP_MM).toFixed(1)}px"><b>0</b></div>`,
      )
    }
    // Handen: en solfjäder av ryggar vriden mot sin egen kant.
    const antal = måste(k.efter.zones[`hand:${seat}`], `hand:${seat}`).order.length
    const vrid = kant === 'S' ? 0 : kant === 'N' ? 180 : kant === 'E' ? -90 : 90
    const solfjäder = Array.from({ length: antal }, (_, j) => `<i style="transform:rotate(${((j - (antal - 1) / 2) * 9).toFixed(1)}deg);width:${px(54).toFixed(1)}px;height:${px(75).toFixed(1)}px;margin-left:${px(-27).toFixed(1)}px;margin-top:${px(-25).toFixed(1)}px"></i>`).join('')
    bitar.push(
      `<div class="byd-hand" style="left:${vänster(hand.x + hand.w / 2).toFixed(1)}px;top:${övre(hand.y + hand.h / 2).toFixed(1)}px;transform:rotate(${vrid}deg)">${solfjäder}${antal > 0 ? `<b class="byd-hand-count">${antal}</b>` : ''}</div>`,
    )
    bitar.push(
      `<div class="byd-seat-name" data-edge="${kant}" style="--seat:var(--seat-${seat.toLowerCase()});left:${vänster(hand.x + hand.w / 2).toFixed(1)}px;top:${övre(hand.y + hand.h / 2).toFixed(1)}px;transform:translate(-50%,-50%) rotate(${vrid}deg)">${esc(måste(NAMN[seat], seat))}</div>`,
    )
  }
  return `<div class="tv"><div class="filt" style="width:${px(FELT.w).toFixed(1)}px;height:${px(FELT.h).toFixed(1)}px">${bitar.join('')}</div></div>`
}

// ── Telefonerna ─────────────────────────────────────────────────────────────────────────────
// 390 px, bredden varje telefonyta i repot döms på. Innehållet är skisserat och inte produktens
// React — utom orden, som är `sv.play.ts`:s egna, och korten, som är `compile`s.
const TELEFON_BREDD = 390
const TELEFONKORT = 62 // px bred i remsan; `player.css` ritar den privata remsans kort ungefär så
const TELEFONSKALA = TELEFONKORT / (KORT_MM.w * CSS_MM)

function olleHtml(läge: Läge): string {
  const t = måste(trafik[läge]['olle'], läge)
  // `TableSummary` ritar `targetsOf`, som sållar bort varje zon med en annan ägare — oavsett
  // synlighet. Vakten ovan läser att raden står kvar. Framför A står alltså inte i listan i
  // något läge, och det är hela poängen med den här rutan.
  const rader = [
    ['Draghög', String(måste(KÖRNINGAR[läge].efter.zones['draw'], 'draw').order.length)],
    ['Kasthög', '0'],
    ['Räknare A', '0'],
    ['Räknare B', '0'],
  ]
  return `<div class="telefon" style="width:${TELEFON_BREDD}px">
  <div class="tfhuvud"><b>Olle</b><span>plats B</span></div>
  <div class="tfsektion"><h4>Din hand · 3 kort</h4><div class="tfremsa">${'<i class="tfrygg"></i>'.repeat(3)}</div></div>
  <div class="tfsektion"><h4>Framför dig · 0</h4><p class="tftom">Inget framför dig. Spela ett kort hit från handen.</p></div>
  <div class="tfsektion"><h4>Bordet</h4><div class="tfbrickor">${rader.map(([n, v]) => `<div class="tfbricka"><b>${esc(måste(n, 'n'))}</b><u>${esc(måste(v, 'v'))} kort</u></div>`).join('')}</div>
    <p class="tfsaknas">Framför A står inte här — <code>targetsOf</code> sållar på <b>ägare</b> och inte på synlighet.</p></div>
  <div class="tfsektion"><h4>Senast</h4><p class="tfrad">Nina lade ett kort i Framför A</p><p class="tfrad">Nina lade ett kort i Framför A</p><p class="tfrad">Nina lade ett kort i Framför A</p></div>
  <div class="tfsanning ${t.korten.length > 0 ? 'lack' : 'ok'}">I webbläsaren ligger <b>${t.korten.length}</b> av Ninas kortidentiteter${t.korten.length > 0 ? ` — ${esc(t.namngivna.join(', '))}` : ''}.</div>
</div>`
}

function ninaHtml(läge: Läge): string {
  const t = måste(trafik[läge]['nina'], läge)
  const vänd = läge === 'ryggar'
  const kort = NINAS_KORT.map(
    (k) =>
      `<div class="tfkort">${vänd ? `<div class="tfbild"><div class="filtkort" style="transform:scale(${TELEFONSKALA.toFixed(5)})">${kompileradRygg.html}</div></div>` : `<div class="tfbild"><div class="filtkort" style="transform:scale(${TELEFONSKALA.toFixed(5)})">${måste(kompilerade.get(k.cardRef), k.cardRef).html}</div></div>`}<div class="tfverb"><button type="button">Ta upp</button><button type="button">Kasta</button></div></div>`,
  ).join('')
  return `<div class="telefon" style="width:${TELEFON_BREDD}px">
  <div class="tfhuvud"><b>Nina</b><span>plats A</span></div>
  <div class="tfsektion"><h4>Din hand · 2 kort</h4><div class="tfremsa">${'<i class="tfrygg"></i>'.repeat(2)}</div>
    <div class="tfknappar"><button type="button" class="primar">Framför mig</button><button type="button">Kasta</button><button type="button">Spela…</button></div></div>
  <div class="tfsektion"><h4>Framför dig · 3</h4><div class="tfprivat">${kort}</div>${vänd ? '<p class="tftom">Ninas egen ram säger <code>cardRef: null</code> för alla tre. Hennes telefon kan inte rita dem och kan inte namnge dem.</p>' : ''}</div>
  <div class="tfsektion"><h4>Senast</h4><p class="tfrad">Nina lade ett kort i Framför A</p></div>
  <div class="tfsanning ${vänd ? 'lack' : 'ok'}">${
    vänd
      ? 'Nina får veta <b>0</b> av sina egna kort. En publik zon kräver framsidan för <i>alla</i>, och ägarskapet ger henne ingenting där.'
      : `Nina får veta sina egna <b>${t.korten.length}</b> kort. Det är vakten som gör nollorna i de andra rutorna meningsfulla.`
  }</div>
</div>`
}

// ── Trafikrutorna ───────────────────────────────────────────────────────────────────────────
const byte = (s: string): number => Buffer.byteLength(s, 'utf8')
const klipp = (s: string, n = 2000): string => (s.length <= n ? s : `${s.slice(0, n)}\n… (${s.length - n} tecken till)`)

function zonruta(läge: Läge, vy: Vy): string {
  const t = måste(trafik[läge][vy.id], vy.id)
  const komponenter = JSON.stringify(t.komponenter, null, 1)
  return `<div class="ruta">
  <div class="rutrubrik"><b>${esc(vy.namn)}</b><span>${byte(t.snapshot).toLocaleString('sv-SE')} byte i snapshot-ramen</span></div>
  <pre><code>${esc(JSON.stringify(t.zon, null, 1))}</code></pre>
  <p class="etikett">komponenter i <code>mine:A</code> i samma ram (${t.komponenter.length} st)</p>
  <pre><code>${esc(klipp(komponenter, 1400))}</code></pre>
  <p class="dom ${t.korten.length > 0 ? 'lack' : 'ok'}"><code>cardsIn(ramarna, 'mine:A')</code> → <b>${t.korten.length}</b>${t.korten.length ? ` · ${esc(t.korten.join(', '))}` : ''}</p>
  <p class="dom ${t.namngivna.length > 0 ? 'lack' : 'ok'}"><code>mentions</code> på varje titel → <b>${t.namngivna.length}</b>${t.namngivna.length ? ` · ${esc(t.namngivna.join(', '))}` : ''}</p>
</div>`
}

const LÄGEN: { id: Läge; namn: string; rubrik: string; mening: string }[] = [
  { id: 'idag', namn: 'I dag', rubrik: "<code>visibility: 'owner'</code>", mening: 'Receptets startbord. Ytan är Ninas ensam; filten ritar talet sedan #437 och ingenting mer.' },
  { id: 'd', namn: 'D · publik', rubrik: "<code>visibility: 'all'</code>", mening: 'Ytan är publik i receptet. `playIntents` vänder upp kortet av sig självt, eftersom den redan har en gren för en publik målzon.' },
  { id: 'ryggar', namn: 'D utan uppvändning', rubrik: "<code>visibility: 'all'</code>, kortet ligger kvar", mening: 'Mellanläget ingen har föreslagit: ytan är publik, men kortet landar med ryggen upp. Filten ritar tre riktiga kort; identiteten stannar på servern.' },
  { id: 'privat', namn: 'Formgivarens egen', rubrik: "D valt, <code>mine:A</code> satt till <code>'owner'</code>", mening: 'D är receptets val, och formgivaren har tagit tillbaka just den här ytan. B:s väg går fortfarande att gå.' },
]

// ── Sidan ───────────────────────────────────────────────────────────────────────────────────
const stilar = [...[...kompilerade.values()].map((c) => c.css), kompileradRygg.css].join('\n')

const filtar = LÄGEN.map((l) => `<div class="lage" data-lage="${l.id}">${filtHtml(l.id)}</div>`).join('')
const olletelefoner = LÄGEN.map((l) => `<div class="lage" data-lage="${l.id}">${olleHtml(l.id)}</div>`).join('')
const ninatelefoner = LÄGEN.map((l) => `<div class="lage" data-lage="${l.id}">${ninaHtml(l.id)}</div>`).join('')
const trafikrutor = LÄGEN.map((l) => `<div class="lage" data-lage="${l.id}"><div class="rad3">${VYER.map((v) => zonruta(l.id, v)).join('')}</div></div>`).join('')
const beskrivningar = LÄGEN.map((l) => `<div class="lage" data-lage="${l.id}"><p class="lagetext"><b>${esc(l.namn)}</b> — ${l.rubrik}. ${l.mening}</p></div>`).join('')

const summaHtml = `<table class="summa">
<thead><tr><th>Läge</th><th>Zonen på tråden</th><th>Komponenter i ramen</th><th>Identiteter TV:n får</th><th>Identiteter Olle får</th><th>Identiteter Nina får</th><th>Snapshot till TV:n</th></tr></thead>
<tbody>${LÄGEN.map((l) => {
  const tv = måste(trafik[l.id]['tv'], 'tv')
  const olle = måste(trafik[l.id]['olle'], 'olle')
  const nina = måste(trafik[l.id]['nina'], 'nina')
  return `<tr><th>${esc(l.namn)}</th><td><code>mode: '${tv.zon.mode}'</code></td><td>${tv.komponenter.length}</td><td class="${tv.korten.length ? 'warn' : 'ok'}">${tv.korten.length}</td><td class="${olle.korten.length ? 'warn' : 'ok'}">${olle.korten.length}</td><td>${nina.korten.length}</td><td>${byte(tv.snapshot).toLocaleString('sv-SE')} byte</td></tr>`
}).join('')}</tbody>
</table>`

const patchHtml = VYER.map((v) => {
  const idag = måste(trafik.idag[v.id], v.id)
  const d = måste(trafik.d[v.id], v.id)
  return `<div class="ruta">
  <div class="rutrubrik"><b>${esc(v.namn)}</b><span>tredje «Framför mig»</span></div>
  <p class="etikett">i dag · ${byte(idag.patch).toLocaleString('sv-SE')} byte</p>
  <pre><code>${esc(klipp(idag.patch, 900))}</code></pre>
  <p class="etikett">med D · ${byte(d.patch).toLocaleString('sv-SE')} byte</p>
  <pre><code>${esc(klipp(d.patch, 1400))}</code></pre>
</div>`
}).join('')

const vaktHtml = vakter.map((v) => `<li><b>${esc(v.vad)}</b> — ${esc(v.svar)}</li>`).join('')

// Den färdiga ersättningen för raden i DESIGN-BESLUT.md, som den skulle klistras in.
const ERSÄTTNING = `Wizarden ger varje plats en yta "Framför {plats}" som hela bordet ser in i och en räknarzon som alla ser, med räknarna ur en lista (en poängräknare som standard).
Ytan är publik därför att telefonens mest framträdande knapp heter "Framför mig" och den rimliga förväntan efter att ha spelat ett kort runt en TV är att kortet syns; ett startbord som svarar med en tom ruta är ett bord på skärmen som inte är bordet i rummet.
Kortet landar med framsidan upp, vilket \`playIntents\` redan gör av sig självt i varje publik målzon, och identiteten lämnar därmed servern till varje klient — vilket är en verklig ändring av vad \`mode\` skickar och inte en ritning.
Det som inte ändras: dold information är fortfarande zonens fråga och inte kortets. En yta formgivaren sätter till \`owner\` är privat igen, och filten säger då hur mycket och aldrig vad (#414, val B, #437) — byte för byte samma zonvy som före det här beslutet.
En lek som behöver en dold yta framför varje plats gör den i editorn, och en lek som behöver en publik yta där korten ligger med ryggen upp får den genom att spela dit utan att vända.`

const sida = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>När «Framför mig» betyder att kortet syns (#414, variant D)</title>
<link rel="stylesheet" href="proto.css">
<style>
${stilar}

html, body { height: auto; overflow: auto; }
body { padding: 0 0 120px; }
.ark { max-width: 1440px; margin: 0 auto; padding: 0 var(--s5); }
h1 { font-size: 22px; color: #fff; margin: var(--s5) 0 var(--s2); }
h2 { font-size: 15px; color: #fff; margin: 0 0 var(--s3); letter-spacing: .5px; }
h3 { font-size: 13px; color: #fff; margin: 0 0 var(--s2); }
.ark > p, section > p, .kolumn > p { margin: 0 0 var(--s2); max-width: 82ch; line-height: 1.6; color: #c3cbdd; }
code { background: var(--sunk); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; color: #ffd98a; font-size: 12px; }
section { margin: var(--s5) 0; padding: var(--s4) 0 0; border-top: 1px solid var(--line); }
.led { color: var(--quiet); }

/* Växeln: en av fyra lägen syns åt gången, och sidan byter alla sina rutor på en gång. */
.lage { display: none; }
body[data-lage='idag'] .lage[data-lage='idag'],
body[data-lage='d'] .lage[data-lage='d'],
body[data-lage='ryggar'] .lage[data-lage='ryggar'],
body[data-lage='privat'] .lage[data-lage='privat'] { display: block; }
.vaxel { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; padding: var(--s2) var(--s5); background: #2a2417; border-bottom: 1px solid #4a4230; color: #ffd98a; font-size: 11px; line-height: 1.5; }
.vaxel .switch { background: #1f1b12; }
.vaxel .switch button { color: #c8b98d; }
.vaxel .switch button[aria-pressed='true'] { background: #ffd98a; color: #241a0c; }
.lagetext { margin: 0; max-width: 78ch; }
.lagetext b { color: #ffe9b8; }

/* Sändningsläget i halv skala: 960 × 540 står för 1920 × 1080. */
.tv { position: relative; width: 960px; height: 540px; border-radius: 10px; background: #05070b; border: 1px solid #1b1f2a; display: grid; place-items: center; overflow: hidden; }
.filt { position: relative; background: var(--tv-felt); border: 1px solid var(--tv-felt-line); border-radius: 4px; }
.byd-zone { position: absolute; box-sizing: border-box; border: 1.5px solid var(--tv-zone-line); border-radius: 6px; }
.byd-zone > span { position: absolute; color: var(--tv-zone-name); font: 600 8px/1 'Roboto Condensed', system-ui; letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; }
.byd-area-count { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); padding: 2px 8px; border-radius: 999px; background: rgba(0,0,0,.55); color: var(--hand-count-ink); font: 600 12px system-ui; }
.byd-pile { position: absolute; border-radius: 3px; border: 1.5px solid var(--back-line); background: repeating-linear-gradient(45deg, var(--back-a), var(--back-a) 3px, var(--back-b) 3px, var(--back-b) 6px); }
.byd-pile.tom { background: none; border-style: dashed; border-color: var(--tv-zone-line); }
.byd-pile-count { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 4px); padding: 1px 6px; border-radius: 999px; background: rgba(0,0,0,.55); color: var(--hand-count-ink); font: 600 10px system-ui; }
.byd-pile > em { position: absolute; left: 50%; top: 100%; margin-top: 20px; transform: translateX(-50%); font-style: normal; color: var(--tv-zone-name); font: 600 8px/1 'Roboto Condensed', system-ui; letter-spacing: 1px; text-transform: uppercase; }
.byd-token { position: absolute; border-radius: 50%; background: #f0b64a; color: #1c1c1c; display: grid; place-items: center; }
.byd-token b { font: 700 8px/1 system-ui; }
.byd-hand { position: absolute; }
.byd-hand i { position: absolute; display: block; border-radius: 2px; border: 1px solid var(--back-line); background: repeating-linear-gradient(45deg, var(--back-a), var(--back-a) 3px, var(--back-b) 3px, var(--back-b) 6px); transform-origin: 50% 140%; }
.byd-hand-count { position: absolute; left: 50%; top: 34px; transform: translateX(-50%); padding: 1px 6px; border-radius: 999px; background: var(--hand-count-bg); color: var(--hand-count-ink); font: 600 10px system-ui; }
.byd-seat-name { position: absolute; padding: 1px 7px; border-radius: 999px; background: var(--seat); color: #10131a; font: 800 9px/14px system-ui; letter-spacing: .6px; white-space: nowrap; }
.byd-seat-name[data-edge='S'] { margin-top: 18px; }
.byd-seat-name[data-edge='N'] { margin-top: -18px; }

/* Ett kort på filten: kompilerad markup i sin verkliga millimeterstorlek, skalad till filtens
   pixlar. Ingen ritad ruta någonstans. */
.filtplats { position: absolute; }
.filtkort { transform-origin: 0 0; }
.filtkort [data-card] { border-radius: 3mm; overflow: hidden; box-shadow: 0 1px 0 rgba(0,0,0,.6), 0 6px 14px rgba(0,0,0,.5); }

.rad2 { display: grid; grid-template-columns: 960px minmax(0,1fr); gap: var(--s5); align-items: start; }
.telefonpar { display: flex; gap: var(--s4); align-items: flex-start; flex-wrap: wrap; }
.telefon { border-radius: 16px; background: var(--phone-bg); border: 1px solid #2a3038; padding: var(--s3); color: #c7cede; font-size: 12px; }
.tfhuvud { display: flex; align-items: baseline; gap: var(--s2); padding-bottom: var(--s2); border-bottom: 1px solid var(--phone-line); }
.tfhuvud b { color: #fff; font-size: 14px; }
.tfhuvud span { color: var(--quiet); font-size: 11px; }
.tfsektion { padding: var(--s3) 0; border-bottom: 1px solid var(--phone-line); }
.tfsektion h4 { margin: 0 0 var(--s2); font: 700 11px system-ui; text-transform: uppercase; letter-spacing: 1.4px; color: var(--quiet); }
.tfremsa { display: flex; gap: 5px; }
.tfrygg { display: block; width: 54px; height: 75px; border-radius: 3px; border: 1px solid var(--back-line); background: repeating-linear-gradient(45deg, var(--back-a), var(--back-a) 4px, var(--back-b) 4px, var(--back-b) 8px); }
.tfknappar { display: flex; gap: 6px; margin-top: var(--s3); }
.tfknappar button { flex: 1; min-height: 44px; border-radius: 10px; border: 1px solid var(--phone-line); background: #141b20; color: #dfe6f5; font: 700 12px system-ui; }
.tfknappar button.primar { background: #1f7a4d; border-color: #2aa468; color: #fff; }
.tfprivat { display: flex; gap: 8px; }
.tfkort { display: grid; gap: 4px; }
.tfbild { width: 62px; height: 87px; overflow: hidden; }
.tfverb { display: grid; gap: 3px; }
.tfverb button { min-height: 28px; border-radius: 7px; border: 1px solid var(--phone-line); background: #141b20; color: #c7cede; font: 600 10px system-ui; }
.tftom { margin: 0; color: var(--quiet); font-size: 11px; }
.tfbrickor { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.tfbricka { border: 1px solid var(--phone-line); border-radius: 9px; padding: 7px 9px; }
.tfbricka b { display: block; color: #dfe6f5; font-size: 12px; }
.tfbricka u { text-decoration: none; color: var(--quiet); font-size: 11px; }
.tfsaknas { margin: var(--s2) 0 0; color: var(--quiet); font-size: 11px; line-height: 1.5; }
.tfrad { margin: 0 0 3px; color: var(--quiet-2); font-size: 11px; }
.tfsanning { margin-top: var(--s3); border-radius: 9px; padding: 8px 10px; font-size: 11px; line-height: 1.5; }
.tfsanning.ok { background: #16281e; border: 1px solid #2c5540; color: #b9e8cd; }
.tfsanning.lack { background: #2b1618; border: 1px solid #5a2b2e; color: #ffb9b9; }
.tfsanning b { font-weight: 800; }

.rad3 { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: var(--s4); align-items: start; }
.ruta { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: var(--s3); min-width: 0; }
.rutrubrik { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s2); margin-bottom: var(--s2); }
.rutrubrik b { color: #fff; font-size: 13px; }
.rutrubrik span { color: var(--quiet); font-size: 11px; font-variant-numeric: tabular-nums; }
.etikett { margin: var(--s2) 0 4px; color: var(--quiet); font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; }
pre { margin: 0; background: #0f1218; border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; overflow: auto; max-height: 260px; }
pre code { background: none; border: 0; padding: 0; color: #cfd8ea; font: 11px/1.5 ui-monospace, Menlo, monospace; white-space: pre; }
.dom { margin: var(--s2) 0 0; font-size: 11px; line-height: 1.5; border-left: 2px solid; padding-left: 8px; }
.dom.ok { border-color: #7dd3a0; color: #b9e8cd; }
.dom.lack { border-color: #d9534f; color: #ffb9b9; }

.summa { border-collapse: collapse; width: 100%; margin: var(--s3) 0 0; font-size: 12px; font-variant-numeric: tabular-nums; }
.summa th, .summa td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; }
.summa thead th { background: var(--sunk); color: #fff; font-size: 11px; }
.summa tbody th { background: var(--sunk); color: #dfe6f5; }
.summa td.ok { color: var(--good); font-weight: 700; }
.summa td.warn { color: #ff9d9d; font-weight: 700; }

.beslut { background: #101820; border: 1px solid #24384a; border-radius: 12px; padding: var(--s4); }
.beslut pre { max-height: none; background: #0b1117; }
.beslut pre code { color: #dfe6f5; white-space: pre-wrap; }

.kolumner { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: var(--s4); }
.kolumn { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: var(--s4); }
.kolumn h3 { font-size: 13px; }
.kolumn ul { margin: 0; padding-left: 17px; color: #c3cbdd; line-height: 1.65; font-size: 12px; }
.kolumn ul b { color: #fff; }

.fotnot { margin-top: var(--s5); padding-top: var(--s4); border-top: 1px solid var(--line); font-size: 11px; color: var(--quiet); }
.fotnot ul { padding-left: 17px; line-height: 1.75; }
.fotnot b { color: #dfe6f5; }
.matt-lista { display: flex; gap: var(--s4); flex-wrap: wrap; margin: var(--s3) 0 0; font-size: 11px; color: var(--quiet-2); font-variant-numeric: tabular-nums; }
.matt-lista u { text-decoration: none; color: #ffd98a; font-weight: 700; }
@media (max-width: 1500px) { .rad2 { grid-template-columns: 1fr; } }
@media (max-width: 1100px) { .rad3, .kolumner { grid-template-columns: 1fr; } }
</style>
</head>
<body data-lage="idag">

<div class="vaxel">
  <b>#414 · variant D</b>
  <div class="switch" role="group" aria-label="Vad ytan framför en plats är">
    ${LÄGEN.map((l, i) => `<button type="button" data-valj="${l.id}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(l.namn)}</button>`).join('')}
  </div>
  ${beskrivningar}
</div>

<div class="ark">
<h1>När «Framför mig» betyder att kortet syns</h1>
<p>Halva #414 är byggd: filten ritar antalet i den privata ytan (val B, <a href="https://github.com/Tiico/build-a-deck/pull/437">#437</a>). Den andra halvan är obesvarad — om telefonens mest framträdande knapp <b>Framför mig</b> rimligen borde betyda att kortet <i>syns</i>, och därmed vad startbordet <i>är</i>. Den här sidan går på djupet på ett enda svar: <b>D · ytan är publik</b>.</p>
<p>Bordet nedan är wizardens eget startbord, fyra platser och en poängräknare, lagt ut av <code>openingSetup</code>. Nina sitter på plats A och har tryckt <b>Framför mig</b> tre gånger. Varje ruta på sidan byter läge med växeln uppe.</p>
<div class="matt-lista">
  <span>filten <u>${FELT.w} × ${FELT.h} mm</u></span>
  <span>skala <u>${SKALA.toFixed(4)} px/mm</u></span>
  <span>ett kort på den halva filten <u>${KORT_PÅ_FILTEN_PX.toFixed(1)} px</u></span>
  <span>samma kort på en riktig 1920 × 1080 <u>${KORT_PÅ_TV_PX.toFixed(1)} px</u></span>
  <span>uppmätt i sidan <u id="matt-kort">—</u></span>
</div>

<section>
  <h2>1 · Vad de tre skärmarna visar</h2>
  <p>Sändningsläget i halv skala: 960 × 540 står för 1920 × 1080, som prototyp 2 gjorde. Telefonerna står i 390 px, bredden varje telefonyta i repot döms på.</p>
  <div class="rad2">
    <div>${filtar}</div>
    <div class="telefonpar">
      <div>${olletelefoner}</div>
      <div>${ninatelefoner}</div>
    </div>
  </div>
</section>

<section>
  <h2>2 · Vad som faktiskt läcker, sagt på trafiken</h2>
  <p>Repots egen regel: dold information verifieras på nätverkstrafiken och inte på skärmen. Rutorna nedan är inte en beskrivning av vad servern skulle skicka — de <i>är</i> vad den skickar. Snapshotten kommer ur <code>project</code>, den enda vägen från tillstånd till tråd, ramen är <code>JSON.stringify</code> på samma <code>ServerMessage</code> som <code>server.ts</code> lägger i socketen, och domen under varje ruta körs av <code>cardsIn</code> och <code>mentions</code> ur <code>packages/e2e/support/frames.ts</code> — samma två funktioner som <code>private-area.spec.ts</code> dömer på.</p>
  ${trafikrutor}
  ${summaHtml}
  <p class="led" style="margin-top:var(--s3)">Bytetalen är hela ramen, inte bara zonen: ett bord med ${RADER.length} kort, fyra platser och fyra räknare.</p>
</section>

<section>
  <h2>3 · Patchen det tredje trycket skickar</h2>
  <p><code>diff</code> mellan de två projektionerna för <i>samma</i> vy, som aktören räknar den. I dag säger patchen till TV:n att en yta gick från två till tre. Med D bär den kortet.</p>
  <div class="rad3">${patchHtml}</div>
</section>

<section>
  <h2>4 · Vad rad ${RAD_623 + 1} i DESIGN-BESLUT.md måste ersättas med</h2>
  <p>Raden står i <b>C4 · Telefonens <code>player</code>-vy</b>, under «Räknare och privata zoner». Den lyder i dag:</p>
  <pre><code>${esc(måste(BESLUT[RAD_623], 'raden'))}</code></pre>
  <p>Beslutskommentaren och prototyp 2 talar båda om <i>rad 603</i>. Den siffran har flyttat: dokumentet har vuxit sedan dess, och meningen står i dag på rad ${RAD_623 + 1}. Det är samma mening.</p>
  <div class="beslut">
    <h3>Färdig att klistra in i stället</h3>
    <pre><code>${esc(ERSÄTTNING)}</code></pre>
  </div>
  <p class="led" style="margin-top:var(--s3)">Ett eget <code>### L&lt;n&gt;</code>-beslut behövs utöver det: D ändrar receptet, och receptet är ett beslut. Prototypen föreslår inget nummer — de delas ut när någon implementerar, och ett reserverat nummer blir taget.</p>
</section>

<section>
  <h2>5 · Vad prototypen hittade på vägen</h2>
  <div class="kolumner">
    <div class="kolumn">
      <h3>D kostar ingenting i protokoll — och en placeringsregel som inte finns</h3>
      <ul>
        <li><b>Inget nytt verb.</b> <code>playIntents</code> har redan en gren för en publik målzon: <code>const isPublic = target?.mode === 'order'</code>, och då skickas <code>move</code> <i>plus</i> <code>flip</code> till framsidan. D är alltså en bokstav i receptet — <code>'owner'</code> blir <code>'all'</code> — och inget annat.</li>
        <li><b>Men korten hamnar på varandra.</b> Telefonen skickar ingen position, så alla tre komponenterna får <code>x: 0, y: 0</code> och <code>absoluteOf</code> ritar dem på zonens hörn, exakt ovanpå varandra. Det syns i filten ovan under <i>D · publik</i>: det ligger tre kort där och man ser ett. I dag märks det inte, eftersom bara ägaren ser in i ytan och hennes telefon ritar en remsa och inte en filt. Med D är det rummets bild.</li>
        <li><b>Och det äldsta kortet ligger överst.</b> <code>Framför mig</code> lägger kortet på <code>index 0</code>, <code>project</code> skriver komponenterna i zonens ordning, och det som står först i ramen ritas underst. Det man ser av stapeln är alltså det första kortet Nina spelade.</li>
        <li>Båda är samma fråga: <b>ett startbord med en publik yta behöver en regel för var kortet landar i den.</b> Den finns inte i dag, och den är inte formgivarens sak — hon har inte bett om zonen, receptet gav henne den.</li>
      </ul>
    </div>
    <div class="kolumn">
      <h3>Olles skärm säger ingenting — hans webbläsare vet allt</h3>
      <ul>
        <li><code>TableSummary</code> ritar <code>targetsOf</code>, och <code>targetsOf</code> sållar bort varje zon med en <b>annan ägare</b>: <code>if (z.owner !== undefined &amp;&amp; z.owner !== view.seat) return false</code>. Synligheten står inte i villkoret.</li>
        <li>D ändrar synligheten och inte ägarskapet. <b>Framför A står därför inte i Olles översikt i något av lägena på den här sidan</b> — samtidigt som hans socket har tagit emot alla tre identiteterna och alla tre titlarna.</li>
        <li>Det är exakt den sortens skillnad repots regel är skriven för: ett kort som är borta från någons skärm kan mycket väl ha skickats till deras webbläsare, och en konsol är ett tangenttryck bort.</li>
        <li>Så D är inte bara ett beslut om filten. <b>Antingen måste telefonöversikten börja rita en annan plats publika yta, eller så skickas kort till klienter som med flit inte visar dem.</b> Det senare är inte ett läckage i teknisk mening — ytan <i>är</i> publik — men det är en yta som är publik på en skärm och osynlig på en annan.</li>
      </ul>
    </div>
    <div class="kolumn">
      <h3>Mellanläget ingen har nämnt: publik yta, ryggen upp</h3>
      <ul>
        <li>En publik zon och en framsida är två saker, inte en. Tar man bort <code>flip</code> ur <code>playIntents</code>-raden ligger kortet i en publik zon <b>med ryggen upp</b>, och <code>canSeeFace</code> svarar nej för alla utom ägaren.</li>
        <li>Vad det ger: filten ritar tre <i>riktiga</i> kort på riktiga platser — variant C ur prototyp 2 — och <code>cardsIn</code> hittar <b>noll</b> identiteter hos TV:n och hos Olle. Läget <i>D utan uppvändning</i> i växeln ovan är den körningen, och siffran i tabellen är mätt.</li>
        <li>Priset i trafik: komponenternas <i>existens</i> och <i>läge</i> reser till alla. Att en spelare har lagt tre kort går att räkna — vilket är precis vad B redan säger — men ingen vet vilka.</li>
        <li><b>Priset som gör vägen ofärdig som den står:</b> inte heller <i>Nina</i> får veta vad hon själv lade. <code>canSeeFace</code> kräver framsidan i en <code>'all'</code>-zon, och att hon äger zonen ger henne ingenting där; hennes egen ram säger <code>cardRef: null</code> för alla tre, och siffran i tabellen är mätt. Vid ett riktigt bord vet man vad man själv lagt med ryggen upp. Mellanläget behöver alltså en regel till — ett <code>showTo</code> till ägaren när kortet spelas, eller en fjärde synlighet — och det är ett protokollnära beslut och ingen ritning.</li>
        <li>Med den regeln på plats svarar vägen på issuets fråga utan att kosta dold information: «spela ett kort» betyder att ett kort syns ligga där, och «vänd upp» blir en egen, avsiktlig handling.</li>
      </ul>
    </div>
    <div class="kolumn">
      <h3>Vad D kostar i spelkänsla</h3>
      <ul>
        <li><b>Blufflekar.</b> En yta framför en plats är den naturliga platsen för ett spelat kort <i>med ryggen upp</i> — insatsen i en budgivning, det dolda draget i ett simultanspel. Med D är startbordets yta fel bord för den leken, och formgivaren måste veta att hon ska ändra den.</li>
        <li><b>Dolda användningar.</b> Zonen heter «Framför mig» på telefonen, och en formgivare som använder den till något som <i>ska</i> vara dolt får en publik yta gratis och utan varning. Det är den ena riktiga risken med D, och den är en fråga om vad editorn säger, inte om vad filten ritar.</li>
        <li><b>Motsatsen är också sann.</b> I dag får en formgivare som vill ha en publik yta framför varje plats — vilket är de flesta kortspel — ett bord som döljer det centrala och måste ändra fyra till åtta zoner innan hennes spel går att titta på.</li>
        <li><b>Vad som inte ändras:</b> handen. <code>hand:{plats}</code> är <code>owner</code> i receptet och rörs inte av D, och telefonens egen hjälptext står kvar som den är: «De andra ser hur många kort du har, aldrig vilka.»</li>
      </ul>
    </div>
  </div>
</section>

<section>
  <h2>6 · Att B:s väg fortfarande går att gå</h2>
  <p>Läget <b>Formgivarens egen</b> i växeln är ett bord där D är receptets val och formgivaren har satt <code>mine:A</code> tillbaka till <code>'owner'</code>. Generatorn jämför den zonvyn med dagens, tecken för tecken:</p>
  <pre><code>${esc(JSON.stringify(måste(trafik.privat['tv'], 'privat').zon, null, 1))}</code></pre>
  <p>Det är samma sträng som <i>I dag</i> skickar, och <code>cardsIn</code> hittar noll identiteter hos TV:n och hos Olle. B — filten ritar talet — är alltså svaret för varje yta en formgivare själv gör privat, precis som beslutet från 2026-09-22 sade, och D tar inte den vägen ifrån henne.</p>
</section>

<div class="fotnot">
  <b>Vad som är mätt och vad som är konstruerat</b>
  <ul>
    <li><b>Mätt:</b> varje tal i trafikrutorna och i tabellen. Bordet är <code>openingSetup</code>, tillståndet är <code>initialState</code> plus riktiga intents genom <code>apply</code>, ramarna är <code>project</code> och <code>diff</code> serialiserade som <code>server.ts</code> serialiserar dem, och domarna är <code>cardsIn</code> och <code>mentions</code> ur e2e-svitens eget stöd.</li>
    <li><b>Mätt:</b> korten. <code>compile</code> i <code>packages/template</code> — den enda renderaren (E2) — i 63 × 88 mm, satt i startramen <code>DEFAULT_FRAME</code> med EB Garamond pinnad ur en riktig woff2 i den här katalogen. Ingen ritad ruta liknar ett kort någonstans på sidan.</li>
    <li><b>Mätt:</b> att korten hamnar på varandra. <code>x</code> och <code>y</code> i komponentrutorna är projektionens egna, och filten ritar dem där.</li>
    <li><b>Mätt:</b> att <code>targetsOf</code> sållar på ägare, att <code>playIntents</code> vänder upp kortet i en publik zon och att receptet ger <code>mine:{plats}</code> synligheten <code>owner</code> — generatorn läser raderna ur källfilerna och faller om någon av dem skrivs om.</li>
    <li><b>Konstruerat:</b> telefonerna. Orden är <code>sv.play.ts</code>:s egna och korten är kompilerade, men layouten är skisserad och inte produktens React. En prototyp av telefonen hade svarat på en annan fråga än den här.</li>
    <li><b>Konstruerat:</b> filtens möbler runt ytan — högarnas och handens utseende, zonnamnens exakta utskjutning (K19 har en mer noggrann regel), och att filten inte lutar. Geometrin, zonernas rektanglar och skalan är produktens.</li>
    <li><b>Konstruerat:</b> leken. Sexton djur och en poängräknare; inget spel i katalogen ser ut så.</li>
    <li><b>Utanför prototypen:</b> vad editorn ska säga när en formgivare gör en yta publik eller privat. Prototypen visar att båda vägarna finns, inte hur valet presenteras.</li>
  </ul>
  <b style="margin-top:var(--s3);display:block">Vakter som kördes innan sidan skrevs (${vakter.length})</b>
  <ul>${vaktHtml}</ul>
</div>
</div>

<script>
// Växeln, och en vakt mot tomhet: sidan påstår ett kortmått i pixlar, så den mäter också att
// kortet verkligen ritades och hur brett det blev.
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-valj]')
  if (!b) return
  document.body.dataset.lage = b.dataset.valj
  document.querySelectorAll('button[data-valj]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
})
await document.fonts.ready
const synligt = document.querySelector('.lage[data-lage="d"] [data-card]') ?? document.querySelector('[data-card]')
const ruta = synligt?.getBoundingClientRect()
const mätt = document.getElementById('matt-kort')
if (ruta && ruta.width > 0) mätt.textContent = ruta.width.toFixed(1) + ' px'
else mätt.textContent = 'inget kort ritades'
</script>
</body>
</html>
`

writeFileSync(`${HÄR}prototyper/04-framfor-mig-publik.html`, sida)
console.log('skrev prototyper/04-framfor-mig-publik.html')
console.table(
  LÄGEN.map((l) => ({
    läge: l.namn,
    zon: måste(trafik[l.id]['tv'], 'tv').zon.mode,
    komponenter: måste(trafik[l.id]['tv'], 'tv').komponenter.length,
    'tv får': måste(trafik[l.id]['tv'], 'tv').korten.length,
    'olle får': måste(trafik[l.id]['olle'], 'olle').korten.length,
    'nina får': måste(trafik[l.id]['nina'], 'nina').korten.length,
    'byte till tv': byte(måste(trafik[l.id]['tv'], 'tv').snapshot),
  })),
)
console.log(`${vakter.length} vakter gröna`)
