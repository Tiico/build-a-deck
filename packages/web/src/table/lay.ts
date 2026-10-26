import type { Snapshot, ZoneView } from '@byd/protocol'
import { isDie, isPiece } from '../components.js'
import { CARD_MM, DIE_MM, TOKEN_MM } from './drop.js'
import { FAN_MAX, HAND_STEP_MM } from './hand.js'

// Var ett kort hamnar i en yta när den som spelar inte har pekat, och i vilken ordning det målas
// (L47, #449).
//
// Det är en fråga och inte två. En punkt utan en ordning lägger det nyaste kortet underst — vilket
// är precis vad «Framför mig» gjorde, eftersom ett `move` utan `index` landar på `index 0` och
// målas först — och en ordning utan en punkt lägger alla kort på samma millimeter. Så båda svaren
// ges här, av samma funktion, och båda vägarna in i en yta (telefonens och tangentbordets) ställer
// frågan till den.
//
// Regeln: kortet läggs fjädrat längs ytans långa axel, med handens eget steg, centrerat över den
// korta axeln, och det nyaste kortet läggs överst. Steget är `HAND_STEP_MM` och inte ett nytt tal:
// handen fjädrar redan med det, så en yta som fjädrar likadant säger «det här är kort som ligger
// framför någon» utan att någon behöver lära sig något nytt.
//
// Ingenting flyttar ett kort som redan ligger där (K2). Ett kort som dras dit för hand hamnar där
// det släpps; det här är bara vad verktyget gör innan någon har sagt något alls.

// Hur många kort en yta fjädrar innan fjädern slutar växa.
//
// Två tak, och det lägsta gäller. Handens eget `FAN_MAX` är det ena: en fjäder slutar växa där,
// och en yta som fjädrar som en hand slutar där handen slutar. Ytans egna rum är det andra: en
// yta som formgivaren gjort kortare än tolv steg får inte kasta ut kort ur sig, vilket är hela
// felet i den radvisa regel det här ersätter.
//
// För receptets egen yta framför en plats är de två samma tal, mätt och inte arrangerat:
// 63 + 11 × 26 = 349 mm i en yta som är 365 lång. En yta med två räknare bredvid sig är 240 lång
// och fjädrar sju kort; taket är då ytans och inte handens, och ingenting lämnar den ändå.
export function fanIn(g: { w: number; h: number }): number {
  const room = alongIsWidth(g) ? g.w : g.h
  const card = alongIsWidth(g) ? CARD_MM.w : CARD_MM.h
  return Math.max(1, Math.min(FAN_MAX, Math.floor((room - card) / HAND_STEP_MM) + 1))
}

// En yta framför en plats i norr eller söder är liggande, en i öster eller väster stående. Fjädern
// går längs den långa axeln, vilken det än är.
const alongIsWidth = (g: { w: number; h: number }): boolean => g.w >= g.h

// Kort nummer tretton, och varje kort efter det, läggs på tolvans millimeter.
//
// Det är handens eget svar buret vidare: `fanned` slutar vid `FAN_MAX` och antalet säger resten.
// En yta kan inte låta bli att rita sina kort som handen kan — de är riktiga komponenter med
// riktiga punkter — så det närmaste svaret är att fjädern slutar växa och att de kort som kommer
// efter lägger sig på det sista steget. Följden, uttryckligen: från och med det trettonde kortet
// går antalet inte längre att räkna på filten. Det nyaste kortet är fortfarande helt synligt, och
// ingenting lämnar ytan, någonsin. Att i stället låta fjädern fortsätta hade lagt kort utanför
// filten, och att lägga om alla kort hade flyttat kort som någon annan lagt (K2).
const stepOf = (g: { w: number; h: number }, i: number): number => Math.min(i, fanIn(g) - 1) * HAND_STEP_MM

// Hela millimetrar i loggen, som `besidePile` redan skriver dem.
const mm = (v: number): number => Math.round(v)

export type Laid = { x: number; y: number; index: number }

// Vad ytan svarar om kortet som läggs i den som nummer `nth` i samma kuvert. Bara en yta svarar:
// en hög och en hand lägger själva korten där de ska ligga, och `null` betyder att den här frågan
// inte är ställd till den zonen.
//
// Fjädern är kortens (#1202). En räknare eller en tärning i ytan är ingen plats i den: räknad som
// ett kort sköt den nästa kort ett steg in, och eftersom en bricka läggs mitt på första kortets
// plats (#1177) räknades den platsen också som upptagen — kortet hamnade två steg in i en yta utan
// ett enda kort. Men ett kort läggs heller aldrig över en bricka (beställarens beslut i #1202,
// bredvid och aldrig över): ett steg där kortets ruta skulle täcka en räknare eller en tärning är
// inte ledigt, så brickan syns och går att klicka på — som en hand lägger kortet bredvid tärningen.
// Ordningen är allt som ligger i ytan, så `index` lägger kortet överst. `piece` är frågan en
// bricka ställer om sin egen plats, och den räknar allt i ytan som den alltid har gjort; var
// brickorna hamnar ändras inte här.
export function laidIn(view: Snapshot, zone: string, nth = 0, piece = false): Laid | null {
  const z: ZoneView | undefined = view.zones.find((x) => x.id === zone)
  if (!z || z.kind !== 'area') return null
  const held = z.mode === 'order' ? z.order.length : z.count
  const i = held + nth
  if (zone === view.floor && !piece) {
    const before = beforeSeat(view, z, nth)
    if (before) return { ...before, index: i }
  }
  const g = z.geometry
  const along = alongIsWidth(g)
  const here = view.components.filter((c) => c.zone === zone)
  const fanned = piece ? here : here.filter((c) => !isPiece(c))
  // Hur långt fjädern har kommit: allt i ytan, utom brickorna när det är ett kort som läggs. En
  // dold yta visar inte sina kort, men en bricka syns alltid, så de som syns dras från antalet.
  const counted = piece ? held : held - (here.length - fanned.length)
  // Var längs fjädern korten redan ligger — ytans egna och de som kuvertet lagt före det här.
  const taken = fanned.map((c) => (along ? c.x : c.y))
  const across = along ? mm((g.h - CARD_MM.h) / 2) : mm((g.w - CARD_MM.w) / 2)
  const at = (s: number): Rect => (along ? { x: s, y: across, ...CARD_MM } : { x: across, y: s, ...CARD_MM })
  // Brickorna kortet inte får täcka; en bricka som läggs frågar inte efter dem.
  const pieces = piece ? [] : here.filter(isPiece).map(rectOf)
  const clear = (s: number): boolean => pieces.every((p) => !overlaps(at(s), p))
  let step = 0
  for (let k = 0; k <= nth; k++) {
    step = freeStep(g, counted + k, taken, clear)
    taken.push(step)
  }
  const { x, y } = at(step)
  return { x, y, index: i }
}

// Ett kort som läggs fritt från en plats, alltså på golvet, landar framför platsen och mot filtens
// mitt (#1368, beställarens beslut 2026-10-25; L47 reviderad). Golvet är en yta som alla andra, så
// fjädern lades från golvets eget hörn: kortet låg vid filtens vänsterkant, långt från högarna och
// platserna, och TV:ns kamera ramade om för att ta med det.
//
// Kortet läggs i stället mitt för platsen, med sin mitt halvvägs mellan platsens egna ytor och
// filtens mittlinje, och aldrig närmare ytorna än receptets mellanrum mellan en plats ytor (10 mm).
// Halvvägs och inte tätt intill ytorna: där står TV:ns skylt för platsen (K26, #683), i pixlar, och
// ett kort tätt intill låg under den vid 1280. Bandet ligger redan inom det kameran ramar —
// platsernas ytor och högarna är det som är i spel (C5) — så ingenting behöver ramas om. Nästa kort
// läggs ett handsteg åt sidan, växelvis till höger och vänster om det första, så att fjädern står
// kvar mitt för platsen; ett steg där ett kort redan ligger, eller där kortet skulle täcka en bricka
// (#1202), är inte ledigt. Ingenting som redan ligger flyttas (K2).
//
// Ett steg som skulle lägga kortet på en hög eller på orden under den är inte heller ledigt. Orden
// hänger i pixlar och inte i millimeter, så rutan är mätt där de tar mest filt: på den minsta TV:n,
// 1280 × 720 med tre platser, når «Draghög» 37 mm under kortet och är 90 mm bred.
//
// Bara en läsare med en plats har ett «framför sig». Bordets egen skärm har ingen plats, och dess
// kort läggs som förut; `null` säger det.
const BEFORE_GAP_MM = 10
const PILE_WORDS_MM = { w: 90, below: 37 }

function beforeSeat(view: Snapshot, floor: ZoneView, nth: number): { x: number; y: number } | null {
  const seat = view.seat
  if (seat === null) return null
  const own = view.zones.filter((z) => z.owner === seat && z.kind === 'area').map((z) => z.geometry)
  const hand = view.zones.find((z) => z.owner === seat && z.kind === 'hand')?.geometry
  const box = bounds(own.length > 0 ? own : hand ? [hand] : [])
  if (!box) return null
  const g = floor.geometry
  const centre = { x: g.x + g.w / 2, y: g.y + g.h / 2 }
  const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
  const edge = view.seats.find((s) => s.id === seat)?.edge ?? edgeToward(mid, centre)
  // The card's corner at the first step, in the table's millimetres: its middle halfway from the
  // zones' inner edge to the felt's middle line, and never nearer the zones than the gap.
  const first = (() => {
    switch (edge) {
      case 'N': {
        const inner = box.y + box.h
        return { x: mid.x - CARD_MM.w / 2, y: Math.max((inner + centre.y) / 2 - CARD_MM.h / 2, inner + BEFORE_GAP_MM) }
      }
      case 'E':
        return { x: Math.min((box.x + centre.x) / 2 - CARD_MM.w / 2, box.x - BEFORE_GAP_MM - CARD_MM.w), y: mid.y - CARD_MM.h / 2 }
      case 'W': {
        const inner = box.x + box.w
        return { x: Math.max((inner + centre.x) / 2 - CARD_MM.w / 2, inner + BEFORE_GAP_MM), y: mid.y - CARD_MM.h / 2 }
      }
      default:
        return { x: mid.x - CARD_MM.w / 2, y: Math.min((box.y + centre.y) / 2 - CARD_MM.h / 2, box.y - BEFORE_GAP_MM - CARD_MM.h) }
    }
  })()
  const across = edge === 'E' || edge === 'W' ? { x: 0, y: 1 } : { x: 1, y: 0 }
  const at = (k: number): Rect => {
    const s = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * HAND_STEP_MM
    return { x: mm(first.x + s * across.x - g.x), y: mm(first.y + s * across.y - g.y), ...CARD_MM }
  }
  const here = view.components.filter((c) => c.zone === floor.id)
  const taken = here.filter((c) => !isPiece(c)).map((c) => ({ x: c.x, y: c.y }))
  const pieces = here.filter(isPiece).map(rectOf)
  // A pile and the words that hang under it, which a card in front of a seat is not laid on.
  const piles = view.zones
    .filter((z) => z.kind === 'pile')
    .flatMap((z) => [
      { x: z.geometry.x - CARD_MM.w / 2 - g.x, y: z.geometry.y - CARD_MM.h / 2 - g.y, ...CARD_MM },
      { x: z.geometry.x - PILE_WORDS_MM.w / 2 - g.x, y: z.geometry.y + CARD_MM.h / 2 - g.y, w: PILE_WORDS_MM.w, h: PILE_WORDS_MM.below },
    ])
  const clear = (r: Rect) => [...pieces, ...piles].every((p) => !overlaps(r, p))
  const free = (r: Rect) => taken.every((p) => Math.abs(p.x - r.x) >= HAND_STEP_MM / 2 || Math.abs(p.y - r.y) >= HAND_STEP_MM / 2)
  const steps = Array.from({ length: FAN_MAX }, (_, k) => at(k))
  let chosen = at(0)
  for (let k = 0; k <= nth; k++) {
    const open = steps.filter(free)
    chosen = open.find(clear) ?? open[0] ?? at(FAN_MAX - 1)
    taken.push({ x: chosen.x, y: chosen.y })
  }
  return { x: chosen.x, y: chosen.y }
}

// The edge a seat without one of its own sits at: the side of the felt its zones lie nearest to.
function edgeToward(p: { x: number; y: number }, centre: { x: number; y: number }): 'N' | 'E' | 'S' | 'W' {
  const dx = p.x - centre.x
  const dy = p.y - centre.y
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N'
}

function bounds(boxes: readonly Rect[]): Rect | null {
  if (boxes.length === 0) return null
  const x0 = Math.min(...boxes.map((b) => b.x))
  const y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w))
  const y1 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

type Rect = { x: number; y: number; w: number; h: number }
const rectOf = (c: { x: number; y: number; type: { id: string } }): Rect => {
  const size = isDie(c) ? DIE_MM : TOKEN_MM
  return { x: c.x, y: c.y, w: size, h: size }
}
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// Nästa plats i fjädern där inget kort redan ligger (K16, #560 P-11). Antalet säger var fjädern
// står, men ett kort som lämnat ytan lämnar en lucka, och ett kort som släppts för hand ligger där
// handen släppte det: räknat bara på antalet lades nästa kort ovanpå ett kvarvarande. Så steget
// provas från antalets plats och framåt, sedan från början, och det första där inget kort ligger
// närmare än ett halvt steg — och där kortet inte täcker en bricka (#1202) — är svaret. Täcker
// varje ledigt steg en bricka går kortet till det första steget utan kort ändå, och en fjäder utan
// ledig plats svarar som förut, på tolvans millimeter — ingenting lämnar ytan, någonsin.
function freeStep(g: { w: number; h: number }, i: number, taken: readonly number[], clear: (s: number) => boolean): number {
  const fan = fanIn(g)
  const first = Math.min(i, fan - 1)
  const order = [...Array.from({ length: fan - first }, (_, k) => first + k), ...Array.from({ length: first }, (_, k) => k)]
  const free = order.map((k) => mm(k * HAND_STEP_MM)).filter((s) => taken.every((t) => Math.abs(t - s) >= HAND_STEP_MM / 2))
  return free.find(clear) ?? free[0] ?? mm(stepOf(g, i))
}
