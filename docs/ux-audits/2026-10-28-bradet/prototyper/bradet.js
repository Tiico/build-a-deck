// PROTOTYP — slit och släng (#1473). Ritar brädet på filten i tre varianter, i millimeter, i den
// skala matt.json säger. Inga mått räknas här: kortets kortsida och filtens storlek kommer ur
// measure.ts, som kör produktens fitScale/feltScale/handRoom/feltFor. Det här skriptet ritar bara.
'use strict'

const CARD = { w: 63, h: 88 }
const HAND_CARD = { w: 54, h: 75 }
const PB = { w: 240, h: 150 }
const SEAT_ALONG = 500
const PLACE = 600
const FLOOR_PX = 45
const SEAT_COLOURS = ['#e05c5c', '#3c8ce7', '#4caf6a', '#e8c040', '#b072e0', '#f08a3c', '#3cc8c8', '#e07ab0']
const SEAT_NAMES = ['Ada', 'Bo', 'Cleo', 'Dan', 'Eli', 'Fia', 'Gus', 'Hed']
const SCREENS = {
  tv1920: { w: 1920, h: 1080, label: 'TV 1920 × 1080', key: 'tv1920', stage: 'stage1920' },
  tv1280: { w: 1280, h: 720, label: 'TV 1280 × 720', key: 'tv1280', stage: 'stage1280' },
  bord1280: { w: 1280, h: 800, label: 'Bordsläge 1280 × 800', key: 'table1280' },
  telefon: { w: 390, h: 844, label: 'Telefon 390 × 844' },
  bordflik: { w: 1440, h: 900, label: 'Editorn 1440 × 900, fliken Bord' },
  ytan: { w: 1440, h: 900, label: 'Editorn 1440 × 900, där ytan designas' },
  produkt: { w: 1440, h: 900, label: 'Produktbilden (#1406)' },
}

const NOTES = {
  A: `<b>A — Brädet i filtens mitt.</b> Brädet ligger fast mitt på den gröna filten, högarna flyttar ut på var sin sida om det, och spelarbrädet ligger där «Framför» låg, med zonerna ovanpå. Filten växer bara så mycket brädet och spelarbräden kräver (K18:s regel med brädet som en term till). Editorn: brädets yta ritas i en egen flik «Bräde» med Mall:s verktyg, som «Låda» (L91); i Bord är brädet en rad överst i Spelyta och zonerna ritas på bilden.
<span class="plus">+ TV:n tappar ingenting vid 1920: fyraplatsbordet är breddbundet bredvid scenen, åttaplatsbordets filt rymmer redan brädet. + Platserna sitter runt brädet som vid ett riktigt bord.</span>
<span class="minus">− Bordsläget 1280 × 800 går från 46 till 44 px utan och 40 px med spelarbräden: filten blir högre.</span>`,
  B: `<b>B — Brädet bredvid filten.</b> Filten är exakt dagens; brädet och spelarbräden ligger som ett eget ark på mörkret till höger om den, där TV:n har bredd. Editorn: brädet och spelarbrädet är två nya sidor i Mall bredvid kortets fram- och baksida, och arket placeras i Bord under en egen rot «Bredvid bordet».
<span class="plus">+ Ingen zon och ingen hög på filten flyttar; ett spel utan bräde ser ut precis som i dag.</span>
<span class="minus">− Bredden var inte fri: scenen (K9 2026-10-25) tar redan den. TV-kortet faller från 57 till 41–42 px och åttaplatsbordets till 34–37: under K9:s golv i alla fall. − Platserna sitter inte runt brädet.</span>`,
  C: `<b>C — Brädet är bordet.</b> Brädets bild ersätter filtens grönt; bordet är brädet plus platsernas kant, och spelarbrädet är platsens kant. Högarna ligger på brädet, i zoner designern lämnar plats för. Editorn: ytan designas direkt i fliken Bord, med Mall:s lager i en högerspalt.
<span class="plus">+ Fyraplatsbordet blir smalare än i dag: TV-kortet går från 57 till 76 px (68 med spelarbräden).</span>
<span class="minus">− Åttaplatsbordet går under golvet (44 px, 41 med spelarbräden). − Designern måste rita leken och slänghögen på bilden. − Ett spel utan bräde har ett annat bord än ett med; Bord blir två verktyg i ett.</span>`,
}

// ---- tillstånd i adressen -----------------------------------------------------------------
const params = new URLSearchParams(location.search)
const state = {
  v: params.get('v') || 'A',
  yta: params.get('yta') || 'tv1920',
  platser: params.get('platser') || '4',
  brade: params.get('brade') || 'kvadrat',
  pb: params.get('pb') || '1',
  vikt: false,
  vrid: { x: -52, z: -18 },
}
let MATT = []

function set(key, val) {
  state[key] = val
  const p = new URLSearchParams()
  for (const k of ['v', 'yta', 'platser', 'brade', 'pb']) p.set(k, state[k])
  history.replaceState(null, '', '?' + p)
  render()
}

document.querySelectorAll('[data-grupp]').forEach((g) => {
  g.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (b) set(g.dataset.grupp, b.dataset.val)
  })
})
addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return
  const order = ['A', 'B', 'C']
  const i = order.indexOf(state.v)
  if (e.key === 'ArrowRight') set('v', order[(i + 1) % 3])
  if (e.key === 'ArrowLeft') set('v', order[(i + 2) % 3])
})
addEventListener('resize', () => render())

// ---- ur recipe.ts, oförändrat utom att filtens storlek är en parameter -------------------
function edgeOf(i, n) {
  const edges = n <= 2 ? ['S', 'N'] : n === 3 ? ['S', 'N', 'E'] : ['S', 'N', 'E', 'W', 'S', 'N', 'E', 'W']
  return edges[i] || 'S'
}
function seatsAt(edge, n) {
  let c = 0
  for (let k = 0; k < n; k++) if (edgeOf(k, n) === edge) c++
  return c
}
function along(i, n) {
  const e = edgeOf(i, n)
  let before = 0
  for (let k = 0; k < i; k++) if (edgeOf(k, n) === e) before++
  return (before - (seatsAt(e, n) - 1) / 2) * PLACE
}
function handRect(i, n, felt) {
  const x = felt.w / 2, y = felt.h / 2
  const a = along(i, n) - SEAT_ALONG / 2
  switch (edgeOf(i, n)) {
    case 'N': return { x: a, y: -y, w: SEAT_ALONG, h: 60 }
    case 'E': return { x: x - 60, y: a, w: 60, h: SEAT_ALONG }
    case 'W': return { x: -x, y: a, w: 60, h: SEAT_ALONG }
    default: return { x: a, y: y - 60, w: SEAT_ALONG, h: 60 }
  }
}
// «Framför» med en räknare, som recipe.ts inFront ritar den.
function inFrontRect(i, n, felt) {
  const h = handRect(i, n, felt)
  const long = SEAT_ALONG - 10 - 125
  switch (edgeOf(i, n)) {
    case 'N': return { x: h.x, y: h.y + h.h + 10, w: long, h: 100 }
    case 'E': return { x: h.x - 110, y: h.y, w: 100, h: long }
    case 'W': return { x: h.x + h.w + 10, y: h.y, w: 100, h: long }
    default: return { x: h.x, y: h.y - 110, w: long, h: 100 }
  }
}
const edgeTurn = { S: 0, N: 180, E: -90, W: 90 }
// Spelarbrädet: ett per plats, innanför handen, där «Framför» låg.
function playerBoardAt(i, n, felt) {
  const e = edgeOf(i, n)
  const a = along(i, n)
  const d = 70 + PB.h / 2
  const c = e === 'S' ? { x: a, y: felt.h / 2 - d } : e === 'N' ? { x: a, y: -felt.h / 2 + d } : e === 'E' ? { x: felt.w / 2 - d, y: a } : { x: -felt.w / 2 + d, y: a }
  return { cx: c.x, cy: c.y, rot: edgeTurn[e] }
}

function record(v) {
  const n = +state.platser
  if (v === 'idag') return MATT.find((r) => r.seats === n && r.variant === 'idag')
  return MATT.find((r) => r.seats === n && r.variant === v && r.board === state.brade && r.playerBoards === (state.pb === '1'))
}
const boardSize = () => (state.brade === 'kvadrat' ? { w: 457, h: 457 } : { w: 610, h: 457 })

// ---- brädets bild: konstruerad, i brädets egna millimeter -------------------------------
// Det här är dekor och inget förslag: en bild «designern valt», för att se zonerna mot något
// annat än filtens grönt.
function boardZones(b) {
  return [
    { name: 'Marknaden', x: b.w / 2 - 146, y: 34, w: 292, h: 104 },
    { name: 'Hamnen', x: 34, y: b.h - 148, w: 150, h: 112 },
    { name: 'Torget', x: b.w - 196, y: b.h - 160, w: 160, h: 124 },
  ]
}
function boardPiles(b) {
  return [
    { name: 'Kortlek', x: 34 + CARD.w / 2, y: b.h / 2 - 10, back: true },
    { name: 'Slänghög', x: b.w - 34 - CARD.w / 2, y: b.h / 2 - 10 },
  ]
}
function boardArt(b, id) {
  const track = []
  const step = 19
  const m = 8
  const cols = Math.floor((b.w - 2 * m) / step)
  const rows = Math.floor((b.h - 2 * m) / step)
  let k = 0
  const sq = (x, y) => {
    const fill = k % 5 === 0 ? '#c98d4b' : '#efe3c4'
    track.push(`<rect x="${x}" y="${y}" width="${step - 2}" height="${step - 2}" rx="2" fill="${fill}" stroke="#8a6a3c" stroke-width="0.6"/>`)
    if (k % 5 === 0) track.push(`<text x="${x + (step - 2) / 2}" y="${y + 12}" font-size="8" text-anchor="middle" fill="#4a3518" font-family="Georgia">${k}</text>`)
    k++
  }
  for (let c = 0; c < cols; c++) sq(m + c * step, m)
  for (let r = 1; r < rows; r++) sq(m + (cols - 1) * step, m + r * step)
  for (let c = cols - 2; c >= 0; c--) sq(m + c * step, m + (rows - 1) * step)
  for (let r = rows - 2; r > 0; r--) sq(m, m + r * step)
  const w = b.w, h = b.h
  return `<defs>
    <radialGradient id="pg${id}" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#f3e6c6"/><stop offset="1" stop-color="#d9bf8c"/></radialGradient>
    <linearGradient id="sea${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f8fb0"/><stop offset="1" stop-color="#2d5f80"/></linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#pg${id})"/>
  <path d="M0 ${h * 0.62} C ${w * 0.18} ${h * 0.55}, ${w * 0.3} ${h * 0.8}, ${w * 0.45} ${h} L 0 ${h} Z" fill="url(#sea${id})"/>
  <path d="M${w * 0.45} ${h} C ${w * 0.5} ${h * 0.7}, ${w * 0.62} ${h * 0.55}, ${w * 0.58} ${h * 0.3} S ${w * 0.75} ${h * 0.12}, ${w} ${h * 0.18}" fill="none" stroke="#5b9cc0" stroke-width="9" stroke-linecap="round"/>
  <g fill="#9bb86a" opacity=".55"><circle cx="${w * 0.78}" cy="${h * 0.42}" r="${h * 0.12}"/><circle cx="${w * 0.25}" cy="${h * 0.35}" r="${h * 0.1}"/></g>
  <g fill="#7a5a34" opacity=".8">${[0.32, 0.36, 0.4, 0.66, 0.7].map((f, i) => `<rect x="${w * f}" y="${h * (0.42 + (i % 2) * 0.05)}" width="12" height="10"/><path d="M${w * f - 2} ${h * (0.42 + (i % 2) * 0.05)} l8 -8 l8 8z"/>`).join('')}</g>
  <text x="${w / 2}" y="${h * 0.52}" font-family="Georgia" font-size="${Math.min(30, w / 16)}" font-weight="700" text-anchor="middle" fill="#5a3d1a" opacity=".85">Hamnstaden</text>
  <g transform="translate(${w * 0.86} ${h * 0.2})"><circle r="16" fill="none" stroke="#5a3d1a" stroke-width="1.2"/><path d="M0 -14 L4 0 L0 14 L-4 0Z" fill="#5a3d1a"/></g>
  ${track.join('')}`
}
function playerBoardArt(colour, name, id) {
  return `<defs><linearGradient id="pb${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ead2"/><stop offset="1" stop-color="#ddc79a"/></linearGradient></defs>
  <rect width="${PB.w}" height="${PB.h}" rx="5" fill="url(#pb${id})"/>
  <rect width="${PB.w}" height="22" rx="5" fill="${colour}"/><rect y="14" width="${PB.w}" height="8" fill="${colour}"/>
  <text x="10" y="15" font-family="Georgia" font-size="11" font-weight="700" fill="#14161c">${name}s verkstad</text>
  ${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${PB.w - 14 - i * 15}" cy="${PB.h - 12}" r="5" fill="none" stroke="#8a6a3c"/>`).join('')}`
}
function playerZones() {
  return [
    { name: 'Förråd', x: 10, y: 32, w: 80, h: 98 },
    { name: 'Byggt', x: 100, y: 32, w: 130, h: 98 },
  ]
}

// ---- att rita: allt i millimeter, med `s` px per mm för det som ska vara pixlar ------------
function cardSvg(x, y, rot, opts = {}) {
  const fill = opts.back ? '#1d2b4a' : '#f6efe0'
  const inner = opts.back
    ? `<rect x="4" y="4" width="${CARD.w - 8}" height="${CARD.h - 8}" rx="2" fill="none" stroke="#c9a85a" stroke-width="1"/>`
    : `<rect x="4" y="4" width="${CARD.w - 8}" height="14" rx="1.5" fill="${opts.colour || '#c98d4b'}"/><rect x="4" y="22" width="${CARD.w - 8}" height="34" rx="1.5" fill="#d9c9a4"/><rect x="6" y="62" width="40" height="3" fill="#8a7a5c"/><rect x="6" y="68" width="48" height="3" fill="#8a7a5c"/>`
  return `<g transform="translate(${x} ${y}) rotate(${rot || 0})"><g transform="translate(${-CARD.w / 2} ${-CARD.h / 2})"><rect width="${CARD.w}" height="${CARD.h}" rx="3" fill="${fill}" stroke="#00000040" stroke-width="0.5"/>${inner}</g></g>`
}
function fanSvg(cx, cy, rot, colour) {
  const cards = []
  for (let j = 0; j < 5; j++) {
    const t = (j - 2) * 7
    cards.push(`<g transform="rotate(${t} 0 ${HAND_CARD.h * 0.9})"><rect x="${-HAND_CARD.w / 2 + (j - 2) * 6}" y="${-HAND_CARD.h / 3}" width="${HAND_CARD.w}" height="${HAND_CARD.h}" rx="3" fill="#1d2b4a" stroke="${colour}" stroke-width="1.6"/></g>`)
  }
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})">${cards.join('')}</g>`
}
// En zon på en bild: streckad krita med mörk gloria, och namnet på en mörk platta över kanten.
// Gloria och platta är det som gör den läsbar mot en bild designern valt (fråga 2 i #1473).
function zoneSvg(z, s, opts = {}) {
  const px = (v) => v / s
  const label = z.name
  const fs = px(13)
  const tw = label.length * fs * 0.56 + px(14)
  const th = fs + px(8)
  return `<g>
    <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="${px(6)}" fill="rgb(10 14 22 / ${opts.tint ?? 0.16})" stroke="rgb(8 10 14 / .7)" stroke-width="${px(4)}"/>
    <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="${px(6)}" fill="none" stroke="#f4efe2" stroke-width="${px(1.6)}" stroke-dasharray="${px(7)} ${px(5)}"/>
    <rect x="${z.x + px(6)}" y="${z.y - th / 2}" width="${tw}" height="${th}" rx="${px(4)}" fill="rgb(16 19 26 / .9)" stroke="#f4efe2" stroke-opacity=".55" stroke-width="${px(1)}"/>
    <text x="${z.x + px(13)}" y="${z.y + fs * 0.36}" font-size="${fs}" font-family="system-ui" font-weight="600" fill="#f4efe2">${label}</text>
  </g>`
}
function pileSvg(p, s, rot = 0) {
  const fs = 12 / s
  return `${cardSvg(p.x, p.y, rot, { back: p.back })}<text x="${p.x}" y="${p.y + CARD.h / 2 + fs * 1.3}" font-size="${fs}" font-family="system-ui" font-weight="600" text-anchor="middle" fill="#f4efe2" stroke="#0b0d12" stroke-width="${3 / s}" paint-order="stroke">${p.name}</text>`
}
function seatNameSvg(i, n, felt, s) {
  const h = handRect(i, n, felt)
  const e = edgeOf(i, n)
  const fs = 13 / s
  const cx = h.x + h.w / 2, cy = h.y + h.h / 2
  const off = e === 'S' ? { x: 0, y: 46 } : e === 'N' ? { x: 0, y: -46 } : e === 'E' ? { x: 46, y: 0 } : { x: -46, y: 0 }
  return `<text x="${cx + off.x}" y="${cy + off.y}" font-size="${fs}" font-family="system-ui" font-weight="700" text-anchor="middle" fill="${SEAT_COLOURS[i]}" stroke="#0b0d12" stroke-width="${3 / s}" paint-order="stroke" transform="rotate(${edgeTurn[e]} ${cx + off.x} ${cy + off.y})">${SEAT_NAMES[i]}</text>`
}

// Hela bordet för en variant: returnerar { svg, framed } där framed är det kameran ramar in.
function table(v, s, mode) {
  const r = record(v)
  const n = +state.platser
  const felt = r.felt
  const b = boardSize()
  const withPb = state.pb === '1' && v !== 'idag'
  const parts = []
  let framed = { x: -felt.w / 2, y: -felt.h / 2, w: felt.w, h: felt.h }

  // Filten.
  const feltFill = `<defs><radialGradient id="felt" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#2f7a52"/><stop offset="1" stop-color="#1d5638"/></radialGradient></defs>`
  parts.push(feltFill)
  if (mode === 'table') parts.push(`<rect x="${-felt.w / 2 - 30 / s}" y="${-felt.h / 2 - 30 / s}" width="${felt.w + 60 / s}" height="${felt.h + 60 / s}" rx="${14 / s}" fill="#6b4524"/>`)
  parts.push(`<rect x="${-felt.w / 2}" y="${-felt.h / 2}" width="${felt.w}" height="${felt.h}" rx="${8 / s}" fill="url(#felt)"/>`)

  // Brädet.
  let boardAt = null
  if (v === 'A' || v === 'C') boardAt = { x: -b.w / 2, y: -b.h / 2 }
  if (v === 'B') {
    const over = (r.drawnTv.w - 40 - r.beside.w - felt.w) / 2
    const x0 = felt.w / 2 + over + 40
    framed = { x: -felt.w / 2, y: -Math.max(felt.h, r.beside.h) / 2, w: felt.w + over + 40 + r.beside.w, h: Math.max(felt.h, r.beside.h) }
    boardAt = { x: x0, y: -r.beside.h / 2 }
    // Arket: brädet överst, spelarbräden i ett rutnät under eller bredvid.
    if (withPb) {
      const stacked = r.beside.h > b.h + 1 && r.beside.w <= Math.max(b.w, 2 * PB.w + 10) + 1
      const gx = stacked ? x0 : x0 + b.w + 20
      const gy = stacked ? -r.beside.h / 2 + b.h + 20 : -r.beside.h / 2
      for (let i = 0; i < n; i++) {
        const px = gx + (i % 2) * (PB.w + 10)
        const py = gy + Math.floor(i / 2) * (PB.h + 10)
        parts.push(`<g transform="translate(${px} ${py})">${playerBoardArt(SEAT_COLOURS[i], SEAT_NAMES[i], 'b' + i)}${playerZones().map((z) => zoneSvg(z, s)).join('')}</g>`)
      }
    }
  }
  if (boardAt && v !== 'idag') {
    parts.push(`<rect x="${boardAt.x + 3}" y="${boardAt.y + 5}" width="${b.w}" height="${b.h}" rx="4" fill="rgb(0 0 0 / .35)"/>`)
    parts.push(`<g transform="translate(${boardAt.x} ${boardAt.y})">${boardArt(b, 'm')}
      ${boardZones(b).map((z) => zoneSvg(z, s)).join('')}
      ${[0, 1, 2, 3].map((k) => cardSvg(b.w / 2 - 146 + 40 + k * 71, 34 + 56, 0, { colour: ['#c94f4f', '#4f86c9', '#58a05f', '#c9a04f'][k] })).join('')}
      ${v === 'C' ? boardPiles(b).map((p) => pileSvg(p, s)).join('') : ''}
    </g>`)
  }

  // Högarna: i dag och i B vid (±140, 0); i A på var sin sida om brädet; i C på brädet.
  if (v === 'idag' || v === 'B') {
    parts.push(pileSvg({ name: 'Kortlek', x: -140, y: 0, back: true }, s))
    parts.push(pileSvg({ name: 'Slänghög', x: 140, y: 0 }, s))
  }
  if (v === 'A') {
    const dx = b.w / 2 + 20 + CARD.w / 2
    parts.push(pileSvg({ name: 'Kortlek', x: -dx, y: 0, back: true }, s))
    parts.push(pileSvg({ name: 'Slänghög', x: dx, y: 0 }, s))
  }

  // Platserna.
  for (let i = 0; i < n; i++) {
    const e = edgeOf(i, n)
    if (withPb && v !== 'B') {
      const p = playerBoardAt(i, n, felt)
      parts.push(`<g transform="translate(${p.cx} ${p.cy}) rotate(${p.rot}) translate(${-PB.w / 2} ${-PB.h / 2})">${playerBoardArt(SEAT_COLOURS[i], SEAT_NAMES[i], 'p' + i)}${playerZones().map((z) => zoneSvg(z, s)).join('')}${cardSvg(165, 81, 0, { colour: SEAT_COLOURS[i] })}</g>`)
    } else {
      parts.push(zoneSvg({ ...inFrontRect(i, n, felt), name: 'Framför' }, s, { tint: 0.1 }))
    }
    const h = handRect(i, n, felt)
    parts.push(fanSvg(h.x + h.w / 2, h.y + h.h / 2, mode === 'tv' ? (e === 'N' ? 180 : 0) : edgeTurn[e], SEAT_COLOURS[i]))
    parts.push(seatNameSvg(i, n, felt, s))
  }
  return { svg: parts.join(''), framed }
}

// ---- ytorna -------------------------------------------------------------------------------
function screen(w, h, label) {
  const scen = document.getElementById('scen')
  scen.innerHTML = ''
  const room = { w: scen.clientWidth - 24, h: scen.clientHeight - 40 }
  const k = Math.min(1, room.w / w, room.h / h)
  const ram = document.createElement('div')
  ram.className = 'm-ram'
  ram.style.width = w * k + 'px'
  ram.style.height = h * k + 'px'
  ram.innerHTML = `<span class="etikett">${label}${k < 1 ? ` · visad i ${Math.round(k * 100)} %` : ''}</span>`
  const skarm = document.createElement('div')
  skarm.className = 'm-skarm'
  skarm.style.width = w + 'px'
  skarm.style.height = h + 'px'
  skarm.style.transform = `scale(${k})`
  ram.appendChild(skarm)
  scen.appendChild(ram)
  return skarm
}

function placeSvg(host, inner, framed, s, frame, pad = 160) {
  const vb = { x: framed.x - pad, y: framed.y - pad, w: framed.w + 2 * pad, h: framed.h + 2 * pad }
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2
  const W = vb.w * s, H = vb.h * s
  const svg = `<svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" width="${W}" height="${H}" style="left:${cx - W / 2}px;top:${cy - H / 2}px">${inner}</svg>`
  host.insertAdjacentHTML('beforeend', svg)
}

function cardBadge(px, today, extra) {
  const under = px < FLOOR_PX
  return `<div class="kortmatt"${under ? ' data-under' : ''}>Kortets kortsida: <b>${px.toFixed(0)} px</b> · i dag ${today.toFixed(0)} px${extra ? ' · ' + extra : ''}${under ? ' · under K9:s 45' : ''}</div>`
}

function renderTv(sc) {
  const r = record(state.v)
  const today = record('idag')
  const card = r[sc.key]
  const stage = r[sc.stage]
  const s = card / CARD.w
  const sk = screen(sc.w, sc.h, sc.label)
  const fw = sc.w - stage
  const air = 0.03 * Math.min(fw, sc.h)
  sk.innerHTML = `<div class="filtram" style="left:0;top:0;width:${fw}px;height:${sc.h}px"></div>
    <aside class="tv-scen" style="width:${stage}px"><span class="bredd">scen ${stage} px</span>
      <div class="kortet"><div class="stort" style="height:${Math.min(sc.h - 220, (stage - 40) * 88 / 63)}px">Hamnvakt</div><div class="raden">Ada lade Hamnvakt i Torget</div></div>
      <div class="fot"><div class="qr"></div><div>Öppna på telefonen<br><b>KX7P</b></div></div>
    </aside>`
  const host = sk.querySelector('.filtram')
  const t = table(state.v, s, 'tv')
  placeSvg(host, t.svg, t.framed, s, { x: air, y: air, w: fw - 2 * air, h: sc.h - 2 * air })
  host.insertAdjacentHTML('beforeend', cardBadge(card, today[sc.key], `scen ${stage} px (i dag ${today[sc.stage]})`))
}

function renderBord(sc) {
  const r = record(state.v)
  const today = record('idag')
  const card = r[sc.key]
  const s = card / CARD.w
  const sk = screen(sc.w, sc.h, sc.label + ' (/table och /online:s filt)')
  sk.innerHTML = `<div class="bord-huvud"><b>Hamnstaden</b><span>rev-12 · KX7P</span></div><div class="filtram lutad" style="left:0;top:57px;width:${sc.w}px;height:${sc.h - 57}px"><div class="tra" style="inset:0"></div></div>`
  const host = sk.querySelector('.tra')
  const t = table(state.v, s, 'table')
  placeSvg(host, t.svg, t.framed, s, { x: 0, y: 0, w: sc.w, h: sc.h - 57 })
  sk.querySelector('.filtram').insertAdjacentHTML('beforeend', cardBadge(card, today[sc.key], `1920 × 1080: ${r.table1920.toFixed(0)} px (i dag ${today.table1920.toFixed(0)})`))
}

function boardThumb(withNumbers) {
  const b = boardSize()
  const zs = boardZones(b)
  return `<svg viewBox="0 0 ${b.w} ${b.h}">${boardArt(b, 't')}${zs.map((z, i) => `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="6" fill="rgb(10 14 22 / .25)" stroke="#f4efe2" stroke-width="3" stroke-dasharray="10 7"/>${withNumbers ? `<circle cx="${z.x + 22}" cy="${z.y + 22}" r="17" fill="#2f3a55" stroke="#f4efe2" stroke-width="2"/><text x="${z.x + 22}" y="${z.y + 29}" font-size="20" font-weight="700" text-anchor="middle" fill="#fff" font-family="system-ui">${i + 1}</text>` : ''}`).join('')}</svg>`
}

function renderTelefon(sc) {
  const sk = screen(sc.w, sc.h, sc.label + ' — ingen filt vid 390 (C2), telefonen flyttar till zoner')
  const v = state.v
  const b = boardSize()
  const zs = boardZones(b)
  const withPb = state.pb === '1'
  const zoneRows = (prefix) => zs.map((z, i) => `<div class="zon"><i>${prefix ? i + 1 : '▦'}</i><span>${z.name}<br><small>${i === 0 ? '4 kort uppvända' : 'tom'}</small></span><button>Lägg här</button></div>`).join('')
  const mine = withPb
    ? `<h3>Mitt spelarbräde</h3>${v === 'C' ? `<div class="eget"><svg viewBox="0 0 ${PB.w} ${PB.h}">${playerBoardArt(SEAT_COLOURS[0], 'Ada', 'ph')}${playerZones().map((z) => `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="4" fill="rgb(10 14 22 / .2)" stroke="#f4efe2" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${z.x + 6}" y="${z.y + 14}" font-size="10" fill="#fff" font-family="system-ui" font-weight="700" stroke="#000" stroke-width="2" paint-order="stroke">${z.name}</text>`).join('')}</svg></div>` : ''}
       ${playerZones().map((z) => `<div class="zon"><i>▤</i><span>${z.name}<br><small>tom</small></span><button>Lägg här</button></div>`).join('')}`
    : ''
  const tab = 'Bordet'
  sk.innerHTML = `<div class="tel" style="inset:0">
    <header><b>Hamnstaden</b><span>Ada · din tur</span></header>
    <main>
      ${v === 'B' ? `<h3>Brädet</h3><div class="karta">${boardThumb(true)}</div><p class="not">B: en orörlig karta över arket, med zonerna numrerade. Kartan är ingen filt: den går inte att lägga på (C2).</p>` : ''}
      <h3>På brädet</h3>${zoneRows(v === 'B')}
      <h3>Spelyta</h3>
      <div class="zon"><i>▮</i><span>Kortlek<br><small>42 kort</small></span><button>Dra</button></div>
      <div class="zon"><i>▯</i><span>Slänghög<br><small>3 kort</small></span><button>Lägg här</button></div>
      ${mine}
      <p class="not">Kortets storlek på telefonen beror inte på brädet: telefonen ritar ingen filt, och brädets zoner är rader som alla andra (beslut 11 i #1470).${v === 'C' ? ' C: spelarbrädets bild står överst i «Framför mig», och här under «Bordet» som rader.' : ''}</p>
    </main>
    <nav><span>Handen</span><span>Framför mig</span><span aria-current="page">${tab}</span><span>Mer</span></nav>
  </div>`
}

const ICON = {
  board: '<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5" fill="none" stroke="currentColor"/><path d="M1.5 6h13M6 1.5v13" stroke="currentColor"/></svg>',
  zone: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-dasharray="2 1.5"/></svg>',
  pile: '<svg viewBox="0 0 16 16"><rect x="4" y="2" width="8" height="11" rx="1" fill="none" stroke="currentColor"/><path d="M5 14h7" stroke="currentColor"/></svg>',
  hand: '<svg viewBox="0 0 16 16"><path d="M3 12l3-9 4 1-1 8z" fill="none" stroke="currentColor"/></svg>',
}
function edTabs(active, extra) {
  const tabs = ['Kortvägg', 'Mall', 'Tabell', 'Bord', 'Låda', ...(extra ? [extra] : []), 'Speltema', 'Media', 'Regler']
  return `<header class="ed-huvud"><span class="hem">← Mina spel</span><strong>Hamnstaden</strong><span class="rev">rev-12</span><nav class="ed-flikar" role="tablist">${tabs.map((t) => `<button role="tab" aria-selected="${t === active}"${t === extra ? ' data-ny' : ''}>${t}</button>`).join('')}</nav><span class="spacer"></span><span class="sparat">Sparat</span><span class="who">NO</span></header>`
}
function tree(v) {
  const b = boardSize()
  const size = `${b.w} × ${b.h}`
  const withPb = state.pb === '1'
  const zs = boardZones(b).map((z) => `<div class="rad" data-in="2">${ICON.zone}${z.name}<small>yta</small></div>`).join('')
  const pbRows = withPb ? `<div class="rad" data-in="1" data-ny>${ICON.board}Spelarbräde<small>240 × 150 · per plats</small></div>${playerZones().map((z) => `<div class="rad" data-in="2">${ICON.zone}${z.name}<small>yta per plats</small></div>`).join('')}` : ''
  const spel = `<div class="spel">${state.platser} spelare · medurs · leken i Kortlek</div>`
  if (v === 'A') {
    return `${spel}<h4>Spelyta <b>＋</b></h4>
      <div class="rad" data-in="1" aria-selected="true" data-ny>${ICON.board}Brädet<small>${size} mm · fast</small></div>
      <div class="falt"><label>Storlek<select><option>457 × 457 mm, vikt en gång</option><option>610 × 457 mm, vikt en gång</option><option>584 × 584 mm, vikt två gånger</option></select></label>
        <span class="knapp">Rita brädets yta i fliken Bräde</span>
        <p>Brädet ligger fast där setupen lägger det och flyttas inte vid bordet (beslut 6). Zonerna ritas här, ovanpå bilden.</p></div>
      ${zs}
      <div class="rad" data-in="1">${ICON.pile}Kortlek<small>leken</small></div>
      <div class="rad" data-in="1">${ICON.pile}Slänghög</div>
      <h4>Varje plats <b>＋</b></h4>
      <div class="rad" data-in="1">${ICON.hand}Hand</div>
      ${withPb ? pbRows : `<div class="rad" data-in="1">${ICON.zone}Framför</div>`}`
  }
  if (v === 'B') {
    return `${spel}<h4>Spelyta <b>＋</b></h4>
      <div class="rad" data-in="1">${ICON.pile}Kortlek<small>leken</small></div>
      <div class="rad" data-in="1">${ICON.pile}Slänghög</div>
      <h4>Varje plats <b>＋</b></h4>
      <div class="rad" data-in="1">${ICON.hand}Hand</div>
      <div class="rad" data-in="1">${ICON.zone}Framför</div>
      <h4>Bredvid bordet <b>＋</b></h4>
      <div class="rad" data-in="1" aria-selected="true" data-ny>${ICON.board}Brädet<small>${size} mm</small></div>
      <div class="falt"><p>Ytan ritas i Mall, sidan «Bräde». Arket ligger till höger om filten.</p><span class="knapp kantad">Öppna sidan Bräde i Mall</span></div>
      ${zs}${pbRows}`
  }
  return `${spel}<h4>Bordet är brädet <b>＋</b></h4>
    <div class="falt"><label>Bordets yta<select><option>Ett bräde, ${size} mm</option><option>Grön filt (inget bräde)</option></select></label><p>Bordet är brädet plus platsernas kant. Högarna ligger på brädet: lämna plats för dem i bilden.</p></div>
    ${zs}
    <div class="rad" data-in="1">${ICON.pile}Kortlek<small>på brädet</small></div>
    <div class="rad" data-in="1">${ICON.pile}Slänghög<small>på brädet</small></div>
    <h4>Varje plats <b>＋</b></h4>
    <div class="rad" data-in="1">${ICON.hand}Hand</div>
    ${withPb ? pbRows.replace('Spelarbräde', 'Platsens kant = spelarbräde') : `<div class="rad" data-in="1">${ICON.zone}Framför</div>`}`
}

function renderBordflik(sc, layered) {
  const v = state.v
  const sk = screen(sc.w, sc.h, sc.label)
  const three = v === 'C' && layered
  sk.innerHTML = `<div class="ed byd-editor">${edTabs('Bord', v === 'A' ? 'Bräde' : null)}<div class="ed-kropp"${three ? ' data-tre' : ''}><aside class="trad">${tree(v)}</aside><div class="duk"></div>${three ? layerPanel('bord') : ''}</div></div>`
  const duk = sk.querySelector('.duk')
  const r = record(v)
  const b = boardSize()
  // Dukens skala: hela bordet in, som Bord-flikens miniatyr gör (fitScale, 40 px luft).
  const dw = duk.clientWidth || sc.w - 300 - (three ? 280 : 0)
  const dh = duk.clientHeight || sc.h - 56
  const fr = v === 'B' ? { w: r.framedTv.w, h: r.framedTv.h } : { w: r.drawnTv.w, h: r.drawnTv.h }
  const s = Math.min((dw - 80) / fr.w, (dh - 80) / fr.h)
  const t = table(v, s, 'tv')
  duk.style.background = '#15171c'
  duk.classList.add('filtram')
  duk.style.position = 'relative'
  placeSvg(duk, t.svg, t.framed, s, { x: 0, y: 0, w: dw, h: dh })
  if (v === 'A' || v === 'C') {
    // Brädet valt: en ram runt det i dukens pixlar.
    const cx = dw / 2, cy = dh / 2
    duk.insertAdjacentHTML('beforeend', `<div style="position:absolute;left:${cx - (b.w / 2) * s - 3}px;top:${cy - (b.h / 2) * s - 3}px;width:${b.w * s + 6}px;height:${b.h * s + 6}px;outline:2px solid #3c8ce7;pointer-events:none"></div><div style="position:absolute;left:${cx - (b.w / 2) * s}px;top:${cy + (b.h / 2) * s + 8}px;color:#9cc4f5;font:12px system-ui">Brädet · ${b.w} × ${b.h} mm · ligger fast${v === 'C' ? ' · är bordet' : ''}</div>`)
  }
}

function layerPanel(where) {
  return `<aside class="egen"><h4>${where === 'bord' ? 'Bordets yta · lager' : 'Egenskaper'}</h4>
    <div class="rad" style="display:flex;gap:8px;min-height:36px;align-items:center">▣ Bakgrund · bild</div>
    <div class="rad" style="display:flex;gap:8px;min-height:36px;align-items:center">▦ Poängspåret</div>
    <div class="rad" style="display:flex;gap:8px;min-height:36px;align-items:center">T «Hamnstaden»</div>
    <div class="rad" style="display:flex;gap:8px;min-height:36px;align-items:center">◐ Kompassen</div>
    <h4>Mått</h4>
    <div class="rader"><label>Bredd<input value="${boardSize().w} mm"></label><label>Höjd<input value="${boardSize().h} mm"></label></div>
    <label>Vikning<select><option>En gång (väntar på partnern, F1)</option></select></label>
    <label>Utfall<input value="3 mm (tryckpaketet, beslut 12)"></label>
    <p>Zonerna från Bord ligger ovanpå som låsta konturer, så bilden kan ritas runt dem.</p></aside>`
}

function renderYtan(sc) {
  const v = state.v
  if (v === 'C') return renderBordflik(sc, true)
  const sk = screen(sc.w, sc.h, sc.label + (v === 'A' ? ' — fliken «Bräde» (som «Låda», L91)' : ' — Mall, sidan «Bräde»'))
  const b = boardSize()
  const sides = v === 'A' ? ['Huvudbräde', 'Spelarbräde'] : ['Framsida', 'Baksida', 'Bräde', 'Spelarbräde']
  const sel = v === 'A' ? 'Huvudbräde' : 'Bräde'
  sk.innerHTML = `<div class="ed byd-editor">${edTabs(v === 'A' ? 'Bräde' : 'Mall', v === 'A' ? 'Bräde' : null)}
    <div class="mallkrona"><div class="sidor">${sides.map((x) => `<button aria-pressed="${x === sel}"${v === 'B' && (x === 'Bräde' || x === 'Spelarbräde') ? ' data-ny' : ''}>${x}</button>`).join('')}</div><span>${b.w} × ${b.h} mm · 3 mm utfall</span><span class="spacer"></span><span>${v === 'A' ? 'Samma lager, verktyg och egenskaper som ett kort i Mall' : 'Kortets sidor och brädets i samma väljare'}</span></div>
    <div class="ed-kropp" data-tre style="grid-template-columns:68px minmax(0,1fr) 280px"><div class="verktyg"><i>▭</i><i>T</i><i>▣</i><i>◯</i><i>⌖</i></div><div class="duk" style="background:repeating-conic-gradient(#202329 0 25%, #1b1d23 0 50%) 0 0/24px 24px"></div>${layerPanel('ytan')}</div></div>`
  const duk = sk.querySelector('.duk')
  const dw = duk.clientWidth, dh = duk.clientHeight
  const s = Math.min((dw - 100) / b.w, (dh - 100) / b.h)
  const zs = boardZones(b).map((z) => `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="4" fill="none" stroke="#9cc4f5" stroke-width="${1.5 / s}" stroke-dasharray="${6 / s} ${4 / s}"/><text x="${z.x + 6 / s}" y="${z.y + 16 / s}" font-size="${12 / s}" fill="#9cc4f5" font-family="system-ui" stroke="#0b0d12" stroke-width="${3 / s}" paint-order="stroke">${z.name} · från Bord</text>`).join('')
  const bleed = 3
  duk.insertAdjacentHTML('beforeend', `<svg style="position:absolute;left:${(dw - b.w * s) / 2}px;top:${(dh - b.h * s) / 2}px;overflow:visible" width="${b.w * s}" height="${b.h * s}" viewBox="0 0 ${b.w} ${b.h}"><rect x="${-bleed}" y="${-bleed}" width="${b.w + 2 * bleed}" height="${b.h + 2 * bleed}" fill="#d9bf8c" opacity=".5"/>${boardArt(b, 'e')}${zs}<line x1="${b.w / 2}" y1="-8" x2="${b.w / 2}" y2="${b.h + 8}" stroke="#f0b64a" stroke-width="${1 / s}" stroke-dasharray="${4 / s} ${3 / s}"/><text x="${b.w / 2 + 4 / s}" y="${-4 / s}" font-size="${11 / s}" fill="#f0b64a" font-family="system-ui">vik</text></svg>`)
}

function renderProdukt(sc) {
  const sk = screen(sc.w, sc.h, sc.label + ' — lugn, påkostad, aldrig en lådöppning')
  const b = boardSize()
  const k = Math.min(1.25, 900 / b.w)
  const W = b.w * k, H = b.h * k
  const half = W / 2
  const art = (side) => `<svg viewBox="${side === 'v' ? 0 : b.w / 2} 0 ${b.w / 2} ${b.h}" width="${half}" height="${H}" preserveAspectRatio="none">${boardArt(b, 'pr' + side)}</svg>`
  sk.innerHTML = `<div class="produkt"><div class="golv"></div>
    <div class="text"><b>Hamnstaden</b>Huvudbräde ${b.w} × ${b.h} mm, vikt en gång, 2 mm gråpapp med linnetryck. Visas med texturen ur den enda renderaren (E2), som lådan i L91.</div>
    <div class="scen3d" style="width:${W}px;height:${H}px">
      <div class="skugga"></div>
      <div class="halva" style="left:0;width:${half}px;height:${H}px"><div class="yta">${art('v')}</div><div class="bak"></div></div>
      <div class="halva hoger" style="left:${half}px;width:${half}px;height:${H}px;transform-origin:0 50%"><div class="yta">${art('h')}</div><div class="bak"></div></div>
    </div>
    <div class="knappar"><button data-g="vik">${state.vikt ? 'Vik ut' : 'Vik ihop'}</button><button data-g="vrid">Vrid ett kvarts varv</button></div></div>`
  const scene = sk.querySelector('.scen3d')
  const right = sk.querySelector('.hoger')
  const apply = () => {
    scene.style.transform = `rotateX(${-state.vrid.x}deg) rotateZ(${state.vrid.z}deg) translateX(${state.vikt ? -half / 2 : 0}px)`
    right.style.transform = state.vikt ? 'rotateY(-178deg) translateZ(2px)' : 'rotateY(0deg)'
  }
  apply()
  sk.querySelector('[data-g="vik"]').onclick = (e) => { state.vikt = !state.vikt; e.target.textContent = state.vikt ? 'Vik ut' : 'Vik ihop'; apply() }
  sk.querySelector('[data-g="vrid"]').onclick = () => { state.vrid.z -= 90; apply() }
  const p = sk.querySelector('.produkt')
  let drag = null
  p.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; drag = { x: e.clientX, y: e.clientY, v: { ...state.vrid } }; p.setPointerCapture(e.pointerId) })
  p.addEventListener('pointermove', (e) => { if (!drag) return; state.vrid = { x: Math.max(-80, Math.min(-10, drag.v.x - (e.clientY - drag.y) * 0.3)), z: drag.v.z + (e.clientX - drag.x) * 0.3 }; apply() })
  p.addEventListener('pointerup', () => { drag = null })
}

function renderMatt() {
  const r = record(state.v)
  const t = record('idag')
  const box = (label, px, today, extra) => `<span${px < FLOOR_PX ? ' data-under' : ''}>${label} <u>${px.toFixed(0)}</u> px <small>(i dag ${today.toFixed(0)}${extra ? ', ' + extra : ''})</small></span>`
  document.getElementById('matt').innerHTML = [
    box('TV 1920', r.tv1920, t.tv1920, `scen ${r.stage1920}`),
    box('TV 1280', r.tv1280, t.tv1280),
    box('Bord 1280 × 800', r.table1280, t.table1280),
    box('Bord 1920', r.table1920, t.table1920),
    '<span data-ingen>390: ingen filt (C2)</span>',
    `<span data-ingen>filt ${r.felt.w} × ${r.felt.h} mm${r.beside ? ` + ark ${r.beside.w} × ${r.beside.h}` : ''}</span>`,
  ].join('')
  document.getElementById('anteckning').innerHTML = NOTES[state.v]
}

function render() {
  if (!MATT.length) return
  document.querySelectorAll('[data-grupp]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.val === state[g.dataset.grupp]))))
  renderMatt()
  const sc = SCREENS[state.yta]
  if (state.yta.startsWith('tv')) renderTv(sc)
  else if (state.yta === 'bord1280') renderBord(sc)
  else if (state.yta === 'telefon') renderTelefon(sc)
  else if (state.yta === 'bordflik') renderBordflik(sc, false)
  else if (state.yta === 'ytan') renderYtan(sc)
  else renderProdukt(sc)
}

fetch('matt.json').then((r) => r.json()).then((m) => { MATT = m; render() })
