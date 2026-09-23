/* global document */
/* Filten, ritad för prototypen till #418.
 *
 * Geometrin är produktens egen, tagen ur `packages/server/src/recipe.ts` (SEAT_ALONG 500,
 * PLACE_SETTING 600, filten 1200 x 800 mm plus en kuvertlängd per extra plats vid en kant),
 * ur `packages/web/src/table/drop.ts` (kortet 63 x 88 mm, brickan 24 mm) och ur
 * `packages/web/src/table/hand.ts` (`edgeRotation`, `handRotation`).
 * Färger, typsnittsvikter och radier är tagna ur `packages/web/src/table/table.css`.
 *
 * Två saker är medvetet förenklade och påverkar inte frågan som ska avgöras:
 * inpassningen räknar inte om skalan lutningsmedvetet som `feltScale` gör, och ett zonnamn
 * placeras centrerat vid sin egen kant i stället för att skjutas ut från ett hörn enligt K19:s
 * hela regel. Vridningarna — som är vad issuet handlar om — är produktens, exakt.
 */

// ── Produktens mått ─────────────────────────────────────────────────────────────────────────
const SEAT_ALONG = 500
const PLACE_SETTING = 600
const FELT = { w: 1200, h: 800 }
const SEAT_GAP = 10
const CHIP_MM = 24
const COUNTER_PITCH_MM = 125
const COUNTER_SLOTS = 2
const CARD_MM = { w: 63, h: 88 }
const HAND_CARD_MM = { w: 54, h: 75 }
const BACK_TILT = 9
const WOOD_RIM_PX = 30
const WOOD_AIR_PX = 12
const TV_AIR_PX = 20

// seatColor.ts, ordagrant.
const PALETTE = ['#e05a4f', '#3c8ce7', '#3aa76d', '#d99a1f', '#8e6bd9', '#2bb5b5', '#d9699f', '#9bb63c']
export const seatColor = (i) => PALETTE[i % PALETTE.length] ?? '#666'

export const SEAT_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
export const SEAT_NAMES = { A: 'Nina', B: 'Bo', C: 'Cissi', D: 'Olle', E: 'Elsa', F: 'Frida', G: 'Gustav', H: 'Hanna' }

// ── recipe.ts ───────────────────────────────────────────────────────────────────────────────
export function edgeOf(i, count) {
  const edges = count <= 2 ? ['S', 'N'] : count === 3 ? ['S', 'N', 'E'] : ['S', 'N', 'E', 'W', 'S', 'N', 'E', 'W']
  return edges[i] ?? 'S'
}
const seatsAt = (edge, count) => Array.from({ length: count }, (_, k) => edgeOf(k, count)).filter((e) => e === edge).length

export function feltFor(count) {
  const busiest = (a, b) => Math.max(1, seatsAt(a, count), seatsAt(b, count))
  return { w: FELT.w + (busiest('S', 'N') - 1) * PLACE_SETTING, h: FELT.h + (busiest('E', 'W') - 1) * PLACE_SETTING }
}
function alongEdge(i, count) {
  const edge = edgeOf(i, count)
  const before = Array.from({ length: i }, (_, k) => edgeOf(k, count)).filter((e) => e === edge).length
  return (before - (seatsAt(edge, count) - 1) / 2) * PLACE_SETTING
}
const rect = (x, y, w, h) => ({ x, y, w, h })

export function handGeometry(i, count) {
  const { w, h } = feltFor(count)
  const along = alongEdge(i, count) - SEAT_ALONG / 2
  switch (edgeOf(i, count)) {
    case 'N': return rect(along, -h / 2, SEAT_ALONG, 60)
    case 'E': return rect(w / 2 - 60, along, 60, SEAT_ALONG)
    case 'W': return rect(-w / 2, along, 60, SEAT_ALONG)
    default: return rect(along, h / 2 - 60, SEAT_ALONG, 60)
  }
}
const countersLength = (n) => COUNTER_PITCH_MM * (n > 0 && n <= COUNTER_SLOTS ? n : 1)

export function inFront(i, count, counters) {
  const hand = handGeometry(i, count)
  const long = SEAT_ALONG - SEAT_GAP - countersLength(counters)
  switch (edgeOf(i, count)) {
    case 'N': return rect(hand.x, hand.y + hand.h + SEAT_GAP, long, 100)
    case 'E': return rect(hand.x - 110, hand.y, 100, long)
    case 'W': return rect(hand.x + hand.w + SEAT_GAP, hand.y, 100, long)
    default: return rect(hand.x, hand.y - 110, long, 100)
  }
}
export function countersAt(i, count, counters) {
  const hand = handGeometry(i, count)
  const long = countersLength(counters)
  const from = SEAT_ALONG - long
  switch (edgeOf(i, count)) {
    case 'N': return rect(hand.x + from, hand.y + hand.h + SEAT_GAP, long, 100)
    case 'E': return rect(hand.x - 110, hand.y + from, 100, long)
    case 'W': return rect(hand.x + hand.w + SEAT_GAP, hand.y + from, 100, long)
    default: return rect(hand.x + from, hand.y - 110, long, 100)
  }
}
function counterSpots(zone, counters) {
  const slots = counters > 0 && counters <= COUNTER_SLOTS ? counters : 1
  const alongX = zone.w >= zone.h
  const [long, across] = alongX ? [zone.w, zone.h] : [zone.h, zone.w]
  return Array.from({ length: counters }, (_, i) => {
    const along = ((Math.min(i, slots - 1) + 0.5) * long) / slots - CHIP_MM / 2
    const deep = across / 2 - CHIP_MM / 2
    return alongX ? { x: Math.round(along), y: Math.round(deep) } : { x: Math.round(deep), y: Math.round(along) }
  })
}

// ── hand.ts ─────────────────────────────────────────────────────────────────────────────────
// Vridningen ett namn bär i dag: den som vänder det mot sin ägare när filten ligger platt.
export const rimRotation = (edge) => (edge === 'S' ? 0 : edge === 'N' ? 180 : edge === 'E' ? -90 : 90)

// ── online/seat.ts ──────────────────────────────────────────────────────────────────────────
// `seatTurn`: halvvarv står alltid, kvartsvarv bara där `turnToFit` ändå ber om ett. Filten är
// liggande vid varje platsantal (1200x800 … 1800x1400) och fönstret är liggande, så `turnToFit`
// svarar 0 och en sidoplats vrids aldrig (#77).
export function seatTurn(edge, count, room) {
  const half = edge === 'S' ? 0 : edge === 'N' ? 180 : null
  if (half !== null) return half
  const felt = feltFor(count)
  const turnToFit = felt.w >= felt.h === room.w >= room.h ? 0 : 90
  return turnToFit === 90 ? (edge === 'E' ? 90 : 270) : 0
}

// ── Ritningen ───────────────────────────────────────────────────────────────────────────────
const el = (tag, cls, style) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (style) Object.assign(n.style, style)
  return n
}

/**
 * @param {object} o
 *   count   antal platser (2, 4, 6, 8)
 *   mode    'table' (filtbordet: bordsläget och distansvyn) | 'tv' (editorns förhandsvisning)
 *   me      platsindex som tittar, eller null (bordsskärmen / förhandsvisningen)
 *   variant 'nu' | 'a' | 'b' | 'c'
 *   box     { w, h } rutan filten ska passas in i, i pixlar
 */
export function renderFelt(host, o) {
  const { count, mode, me = null, variant = 'nu', box, hand: handCards = 5, draw = 40, discard = 7, up = 0 } = o
  const felt = feltFor(count)
  const room = { w: 1280, h: 800 }
  // Distansvyn är den enda ytan som vrider filten (C5 + #77).
  const rot = mode === 'table' && me !== null ? seatTurn(edgeOf(me, count), count, room) : 0
  const swapped = rot % 180 !== 0
  const rim = mode === 'table' ? WOOD_RIM_PX : 0
  // Luften runt träet, `fit.ts`: 12 px i bordsläge, 20 på en TV. Den är vad en hand som hänger
  // förbi kanten ligger i, så utan den kapas solfjädern vid ramens kant.
  const air = mode === 'table' ? WOOD_AIR_PX : TV_AIR_PX
  const pad = rim + air
  const shown = swapped ? { w: felt.h, h: felt.w } : felt
  const scale = Math.min((box.w - 2 * pad) / shown.w, (box.h - 2 * pad) / shown.h)
  const px = (mm) => mm * scale

  host.textContent = ''
  const frame = el('div', 'byd-table-frame')
  frame.dataset.mode = mode
  // `table.css`: under 460 px filt ryms inte zonernas och högarnas namn bredvid det de namnger,
  // och bordsläget slutar rita dem (K19, #76). Prototypen lyder samma regel, annars visar den en
  // krock produkten inte har.
  if (mode === 'table' && px(felt.w) <= 460) frame.dataset.gomda = 'true'
  // Och `data-tight`: på en smal filt sätts namnen i 12 px utan spärr, eftersom spärren ensam är
  // en sjättedel av vad ett namn tar.
  if (px(felt.w) < 700) frame.dataset.tight = 'true'
  // Ramen sluter om träet i stället för att fylla rutan: den mörka grunden är bordets rum och
  // inte fönstret, och ett fält av den utan bord i skulle påstå ett fönster som inte är mätt.
  Object.assign(frame.style, { width: `${Math.round(px(felt.w)) + 2 * pad}px`, height: `${Math.round(px(felt.h)) + 2 * pad}px` })
  const wood = el('div', 'byd-table-wood')
  const table = el('div', 'byd-table')
  table.dataset.table = 'true'
  Object.assign(table.style, {
    width: `${px(felt.w)}px`,
    height: `${px(felt.h)}px`,
    transform: rot ? `rotate(${rot}deg)` : '',
  })
  table.style.setProperty('--unrotate', `${-rot}deg`)
  wood.append(table)
  frame.append(wood)
  host.append(frame)

  // Filtens egna koordinater: mm om origo i mitten → px från filtens övre vänstra hörn.
  const left = (mm) => px(mm + felt.w / 2)
  const top = (mm) => px(mm + felt.h / 2)

  const zone = (g, name, rimSide) => {
    const z = el('div', 'byd-zone', { left: `${left(g.x)}px`, top: `${top(g.y)}px`, width: `${px(g.w)}px`, height: `${px(g.h)}px` })
    const span = el('span')
    span.textContent = name
    // K19 förenklad: namnet ligger utanför zonen, bort från närmaste kant, och står alltid
    // upprätt i läsarens riktning — vilket är precis vad produkten gör i dag.
    const off = 4
    const place =
      rimSide === 'N' ? { left: '50%', top: '100%', margin: `${off}px 0 0` }
      : rimSide === 'S' ? { left: '50%', top: '0', margin: `${-off}px 0 0` }
      : rimSide === 'E' ? { left: '0', top: '50%', margin: `0 0 0 ${-off}px` }
      : { left: '100%', top: '50%', margin: `0 0 0 ${off}px` }
    Object.assign(span.style, place)
    const shift = rimSide === 'N' ? 'translate(-50%, 0)' : rimSide === 'S' ? 'translate(-50%, -100%)' : rimSide === 'E' ? 'translate(-100%, -50%)' : 'translate(0, -50%)'
    span.style.transform = `${shift} rotate(${-rot}deg)`
    z.append(span)
    table.append(z)
  }

  // Två högar mitt på filten, så att zonnamnens läsriktning syns bredvid platsnamnens.
  const pile = (x, y, label, n) => {
    const p = el('div', 'byd-pile', { left: `${left(x)}px`, top: `${top(y)}px`, width: `${px(CARD_MM.w)}px`, height: `${px(CARD_MM.h)}px` })
    const count = el('span', 'byd-pile-count')
    // Etiketten ska hamna under sin hög på skärmen, inte under den i filtens riktning: på en
    // halvvarvad filt är «nedanför» i filtens koordinater ovanför i läsarens.
    if (rot === 180) {
      Object.assign(count.style, { top: '0', transform: 'translate(-50%, calc(-100% - 6px)) rotate(180deg)' })
    } else {
      count.style.transform = `translate(-50%, 6px) rotate(${-rot}deg)`
    }
    const nm = el('span', 'byd-pile-name')
    nm.textContent = label
    const b = el('b', 'byd-pile-n')
    b.textContent = String(n)
    count.append(nm, b)
    p.append(count)
    table.append(p)
  }
  pile(-CARD_MM.w - 180, -CARD_MM.h / 2, 'Draghög', draw)
  pile(180, -CARD_MM.h / 2, 'Kasthög', discard)
  // Marknadens uppvända kort, lagda till höger om draghögen: det andra av de två exemplen i
  // beställningen («vända upp ett par kort»). De ritas som framsidor och inte som baksidor.
  for (let k = 0; k < up; k++) {
    const c = el('div', 'byd-up', {
      left: `${left(-CARD_MM.w - 180 + (k + 1) * (CARD_MM.w + 12))}px`,
      top: `${top(CARD_MM.h / 2 + 24)}px`,
      width: `${px(CARD_MM.w)}px`,
      height: `${px(CARD_MM.h)}px`,
      fontSize: `${Math.max(7, px(CARD_MM.w) * 0.16)}px`,
    })
    const b = el('b')
    b.textContent = ['Kol', 'Järn', 'Glas', 'Salt'][k] ?? '·'
    c.append(b)
    table.append(c)
  }

  for (let i = 0; i < count; i++) {
    const edge = edgeOf(i, count)
    const colour = seatColor(i)
    const hand = handGeometry(i, count)
    const front = inFront(i, count, 2)
    const chips = countersAt(i, count, 2)
    const id = SEAT_IDS[i]
    // Editorns förhandsvisning har inga spelare: brickan bär platsens bokstav (K19).
    const label = mode === 'tv' ? id : SEAT_NAMES[id]

    zone(front, `Framför ${id}`, edge)
    zone(chips, `Räknare ${id}`, edge)

    for (const spot of counterSpots(chips, 2)) {
      const chip = el('div', 'byd-token', {
        left: `${left(chips.x + spot.x)}px`,
        top: `${top(chips.y + spot.y)}px`,
        width: `${px(CHIP_MM)}px`,
        height: `${px(CHIP_MM)}px`,
      })
      // I dag följer brickan filtens vridning; i varje förslag vänds den tillbaka.
      chip.style.transform = variant === 'nu' ? '' : `rotate(${-rot}deg)`
      const v = el('b')
      v.textContent = '6'
      v.style.fontSize = `${Math.max(7, px(CHIP_MM) * 0.42)}px`
      chip.append(v)
      table.append(chip)
    }

    // Handen: en solfjäder av baksidor vriden mot sin egen kant (`handRotation`, mode table).
    const fanRot = mode === 'table' ? rimRotation(edge) : 0
    const at = { x: hand.x + hand.w / 2, y: hand.y + hand.h / 2 }
    const fan = el('div', 'byd-hand', { left: `${left(at.x)}px`, top: `${top(at.y)}px`, transform: `rotate(${fanRot}deg)` })
    fan.style.setProperty('--seat', colour)
    for (let k = 0; k < handCards; k++) {
      const card = el('i', 'byd-back', {
        left: `${px(-HAND_CARD_MM.w / 2)}px`,
        top: `${px(-HAND_CARD_MM.h / 3)}px`,
        width: `${px(HAND_CARD_MM.w)}px`,
        height: `${px(HAND_CARD_MM.h)}px`,
        transform: `rotate(${(k - 2) * BACK_TILT}deg)`,
      })
      fan.append(card)
    }
    table.append(fan)

    // ── Platsnamnet: hela frågan i #418 ────────────────────────────────────────────────────
    const tag = el('div', 'byd-seat-name')
    tag.dataset.edge = edge
    tag.dataset.variant = variant
    if (me === i) tag.dataset.me = 'true'
    tag.style.setProperty('--seat', colour)
    tag.textContent = label

    // «Bordskort»: namnet bär sin kants egen vridning, som i dag.
    // «Läsriktning»: namnet vänds tillbaka mot den som tittar, som zonnamnen redan gör.
    const placeCard =
      variant === 'nu' ? true
      : variant === 'b' ? mode === 'table' && me === null
      : false
    const own = placeCard ? rimRotation(edge) : -rot

    const alongX = left(hand.x + hand.w / 2)
    const alongY = top(hand.y + hand.h / 2)
    if (edge === 'S') Object.assign(tag.style, { left: `${alongX}px`, bottom: '6px' })
    else if (edge === 'N') Object.assign(tag.style, { left: `${alongX}px`, top: '6px' })
    else if (edge === 'W') Object.assign(tag.style, { top: `${alongY}px`, left: '6px' })
    else Object.assign(tag.style, { top: `${alongY}px`, right: '6px' })

    // Samma centreringar som `table.css` skriver, men med vridningen given av varianten. Vid en
    // sidokant kompenserar `table.css` för att en vriden låda sticker ut längs den andra axeln
    // med halva namnets längd; ett upprätt namn vrids inte och ska därför inte kompenseras, annars
    // skjuts det ut över kanten och vidare ut på träet.
    const half = '10.5px'
    const sideways = placeCard && (edge === 'E' || edge === 'W')
    const shift =
      edge === 'S' || edge === 'N' ? 'translateX(-50%)'
      : !sideways ? 'translateY(-50%)'
      : edge === 'E' ? `translateX(calc(50% - ${half})) translateY(-50%)`
      : `translateX(calc(${half} - 50%)) translateY(-50%)`
    tag.style.transform = `${shift} rotate(${own}deg)`

    // Variant C: namnet står upprätt, och ägarskapet sägs i stället av ett färgat band längs
    // platsens egna 500 mm av kanten. Bandet ligger under allt annat på filten.
    if (variant === 'c') {
      const band = el('div', 'seat-band')
      band.style.setProperty('--seat', colour)
      if (me === i) band.dataset.me = 'true'
      const t = 14 // mm; ett band, inte en list
      const g =
        edge === 'S' ? rect(hand.x, felt.h / 2 - t, SEAT_ALONG, t)
        : edge === 'N' ? rect(hand.x, -felt.h / 2, SEAT_ALONG, t)
        : edge === 'E' ? rect(felt.w / 2 - t, hand.y, t, SEAT_ALONG)
        : rect(-felt.w / 2, hand.y, t, SEAT_ALONG)
      Object.assign(band.style, { left: `${left(g.x)}px`, top: `${top(g.y)}px`, width: `${px(g.w)}px`, height: `${px(g.h)}px` })
      table.prepend(band)
    }
    table.append(tag)
  }
  return { rot, scale, felt, frame, wood, table, px, left, top }
}
