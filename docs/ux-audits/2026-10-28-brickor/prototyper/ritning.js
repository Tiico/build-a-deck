// PROTOTYP (#1474). Brickornas ritning, delad av filten, telefonen, editorn och den fysiska kopian.
// Kastas när varianterna är valda. Ingenting här importeras av appen.
//
// Måtten är millimeter, som i typregistret: en sexhörning 52 mm mellan de raka sidorna (spetsen
// uppåt, 60 mm hög), en kvadrat 45 mm (Carcassonnes), en rund markör 25 mm (ett mynt), och kortet
// 63 × 88. Kartongen är 2 mm; på filten ritas kanten 2,5 mm för att synas (C1), som högarnas.

const MM = { hex: { w: 52, h: 52 * 2 / Math.sqrt(3) }, square: { w: 45, h: 45 }, round: { w: 25, h: 25 }, card: { w: 63, h: 88 } }
const STEP = { hex: 60, square: 90, round: 90 }
const SHAPE_NAME = { hex: 'sexhörning', square: 'kvadrat', round: 'rund' }
const EDGE_MM = 2.5

// Spelet i prototypen: «Skogens råd» (samma spel som lådans prototyp), med en lek kort och en lek
// unika landskapsbrickor, och en identisk markör, guldmyntet.
const LAND = {
  skog: { namn: 'Skog', bg: '#2f6b3a', ink: '#f3e9d6' },
  åker: { namn: 'Åker', bg: '#d6ae45', ink: '#2b2110' },
  sjö: { namn: 'Sjö', bg: '#2f6fae', ink: '#f3e9d6' },
  berg: { namn: 'Berg', bg: '#80858d', ink: '#f3e9d6' },
  äng: { namn: 'Äng', bg: '#79b257', ink: '#1f2a12' },
}
const TILES = [
  ['L01', 'Granskog', 'skog', 2], ['L02', 'Rågåker', 'åker', 3], ['L03', 'Tjärn', 'sjö', 1],
  ['L04', 'Fjäll', 'berg', 4], ['L05', 'Blomsteräng', 'äng', 2], ['L06', 'Björkhage', 'skog', 1],
  ['L07', 'Kornfält', 'åker', 2], ['L08', 'Älvmynning', 'sjö', 3], ['L09', 'Kalfjäll', 'berg', 3],
  ['L10', 'Slåtteräng', 'äng', 1], ['L11', 'Tallmo', 'skog', 3], ['L12', 'Linåker', 'åker', 1],
  ['L13', 'Göl', 'sjö', 2], ['L14', 'Klippa', 'berg', 2], ['L15', 'Hagmark', 'äng', 3],
  ['L16', 'Urskog', 'skog', 4], ['L17', 'Vete', 'åker', 4], ['L18', 'Fjärd', 'sjö', 4],
].map(([id, namn, land, varde]) => ({ id, namn, land, varde }))
const CARDS = [
  ['K01', 'Rådslag', 'Varje spelare drar ett kort.'], ['K02', 'Torka', 'Åkrar ger inget denna runda.'],
  ['K03', 'Timmer', 'Ta 2 guld för varje skog.'], ['K04', 'Vårflod', 'Sjöar flyttar sig ett steg.'],
  ['K05', 'Marknad', 'Byt en bricka med en granne.'], ['K06', 'Stormnatt', 'Vrid en bricka 60°.'],
].map(([id, namn, text]) => ({ id, namn, text }))

let uid = 0
const nid = (p) => `${p}${++uid}`

function hexPoints(w, h, x = 0, y = 0) {
  const r = h / 2, cx = x + w / 2, cy = y + h / 2
  return Array.from({ length: 6 }, (_, i) => { const a = (-90 + 60 * i) * Math.PI / 180; return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}` }).join(' ')
}
function shapeEl(shape, w, h, attrs = '') {
  if (shape === 'hex') return `<polygon points="${hexPoints(w, h)}" ${attrs}/>`
  if (shape === 'round') return `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" ${attrs}/>`
  if (shape === 'card') return `<rect width="${w}" height="${h}" rx="3" ${attrs}/>`
  return `<rect width="${w}" height="${h}" rx="2" ${attrs}/>`
}

// Ett landskaps konst, ritad i rutan w × h; samma konst i alla former, klippt av formen.
function landArt(land, w, h, seed = 1) {
  const L = LAND[land]
  let s = seed * 9301 + 49297
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  let out = `<rect width="${w}" height="${h}" fill="${L.bg}"/>`
  if (land === 'skog') for (let i = 0; i < 16; i++) { const x = r() * w, y = r() * h * 0.8, k = 4 + r() * 4; out += `<polygon points="${x},${y} ${x - k * 0.7},${y + k * 1.5} ${x + k * 0.7},${y + k * 1.5}" fill="${i % 3 ? '#1e4d28' : '#4b9154'}"/>` }
  if (land === 'åker') for (let i = -h; i < w + h; i += 4) out += `<line x1="${i}" y1="0" x2="${i + h * 0.6}" y2="${h}" stroke="#b98f2c" stroke-width="1.3"/>`
  if (land === 'sjö') for (let y = 6; y < h; y += 7) out += `<path d="M0 ${y} q 4 -2.5 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0" fill="none" stroke="#8fc2ec" stroke-width="1" opacity=".8"/>`
  if (land === 'berg') for (let i = 0; i < 4; i++) { const x = (i + 0.2 + r() * 0.4) * w / 3.6, b = h * (0.62 + r() * 0.12), k = 9 + r() * 6; out += `<polygon points="${x},${b - k * 1.3} ${x - k},${b} ${x + k},${b}" fill="#5f646c"/><polygon points="${x},${b - k * 1.3} ${x - k * 0.35},${b - k * 0.85} ${x + k * 0.35},${b - k * 0.85}" fill="#f3f3f0"/>` }
  if (land === 'äng') for (let i = 0; i < 26; i++) out += `<circle cx="${r() * w}" cy="${r() * h * 0.8}" r="${0.9 + r() * 0.6}" fill="${i % 3 ? '#f3e9d6' : '#e98fb5'}"/>`
  return out
}

// Brickans framsida enligt lekens mall: bakgrunden väljs av kolumnen Landskap (L3), namnet i ett
// band nedtill, värdet i en cirkel. Formen klipper; mallen är densamma i alla tre former.
function tileFace(t, shape, w, h) {
  const L = LAND[t.land]
  const band = shape === 'round' ? 0 : Math.min(11, h * 0.2)
  const fs = shape === 'hex' ? 5.6 : 5.2
  return landArt(t.land, w, h, t.id.charCodeAt(2) + t.id.charCodeAt(1)) +
    `<circle cx="${w / 2}" cy="${h * 0.34}" r="6.2" fill="#f3e9d6" stroke="#2b2110" stroke-width=".6"/>` +
    `<text x="${w / 2}" y="${h * 0.34 + 0.2}" font-size="7.6" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#2b2110" font-family="system-ui">${t.varde}</text>` +
    (band ? `<rect x="0" y="${h * 0.62}" width="${w}" height="${band}" fill="#f3e9d6" opacity=".92"/><text x="${w / 2}" y="${h * 0.62 + band / 2 + 0.3}" font-size="${fs}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#2b2110" font-family="system-ui">${t.namn}</text>` : '')
}
function tileBack(shape, w, h) {
  return `<rect width="${w}" height="${h}" fill="#4a3424"/>` +
    `<polygon points="${hexPoints(w * 0.5, h * 0.5, w * 0.25, h * 0.25)}" fill="none" stroke="#c7a46a" stroke-width="1.2"/>` +
    `<polygon points="${w / 2},${h * 0.36} ${w / 2 - 5},${h * 0.58} ${w / 2 + 5},${h * 0.58}" fill="#c7a46a"/>` +
    `<rect x="${w / 2 - 0.9}" y="${h * 0.58}" width="1.8" height="3" fill="#c7a46a"/>`
}
function coinFace(side, w, h) {
  const id = nid('g')
  return `<defs><radialGradient id="${id}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ffe7a0"/><stop offset=".55" stop-color="#d9a73a"/><stop offset="1" stop-color="#9a6d1c"/></radialGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#${id})"/><circle cx="${w / 2}" cy="${h / 2}" r="${w * 0.36}" fill="none" stroke="#8a6116" stroke-width=".7"/>` +
    `<text x="${w / 2}" y="${h / 2 + 0.4}" font-size="${w * 0.42}" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#6d4a0e" font-family="system-ui">${side === 'back' ? 5 : 1}</text>`
}
function cardFace(c, w, h) {
  return `<rect width="${w}" height="${h}" fill="#f6efe0"/><rect x="3" y="3" width="${w - 6}" height="${h * 0.45}" fill="#2f6b3a"/>` +
    landArt('skog', w - 6, h * 0.45, c.id.charCodeAt(2)).replace(/<rect width[^>]*>/, '').replace(/^/, `<g transform="translate(3 3)">`) + `</g>` +
    `<text x="5" y="${h * 0.45 + 12}" font-size="7" font-weight="800" fill="#2b2110" font-family="system-ui">${c.namn}</text>` +
    `<text x="5" y="${h * 0.45 + 22}" font-size="4.4" fill="#2b2110" font-family="system-ui">${c.text.slice(0, 26)}</text>` +
    `<text x="5" y="${h * 0.45 + 28}" font-size="4.4" fill="#2b2110" font-family="system-ui">${c.text.slice(26)}</text>`
}
function cardBack(w, h) {
  return `<rect width="${w}" height="${h}" fill="#2f477e"/><rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="2" fill="none" stroke="#7d93c4" stroke-width="1"/>` +
    `<polygon points="${w / 2},${h / 2 - 9} ${w / 2 - 7},${h / 2 + 6} ${w / 2 + 7},${h / 2 + 6}" fill="#7d93c4"/>`
}

/**
 * En bit som SVG, i pixlar. `item` = { kind: 'tile'|'coin'|'card', shape, tile?, card?, up, rot }.
 * `edge` ritar kartongens kant under ytan (C1), alltid nedåt på skärmen; ytan roteras ovanpå den.
 * `layers` ritar en hög: så många kanter under varandra, som filtens kortbuntar.
 */
function pieceSvg(item, px, { edge = true, layers = 1, cls = '', label = '' } = {}) {
  const shape = item.kind === 'card' ? 'card' : item.shape
  const { w, h } = MM[shape]
  const e = edge ? EDGE_MM : 0
  const stackMm = edge ? Math.min(layers - 1, 8) * 0.9 : 0
  const pad = shape === 'hex' || shape === 'round' ? 0 : 0
  const vbW = w + pad * 2, vbH = h + e + stackMm
  const clip = nid('c')
  const face = !item.up
    ? (item.kind === 'card' ? cardBack(w, h) : item.kind === 'coin' ? coinFace('back', w, h) : tileBack(shape, w, h))
    : (item.kind === 'card' ? cardFace(item.card, w, h) : item.kind === 'coin' ? coinFace('front', w, h) : tileFace(item.tile, shape, w, h))
  const rot = item.rot || 0
  let under = ''
  if (edge) {
    for (let i = Math.min(layers - 1, 8); i >= 0; i--) {
      const dy = i * 0.9 + e
      under += `<g transform="translate(0 ${dy})"><g class="dreh" style="--r:${rot}deg">${shapeEl(shape, w, h, `fill="${item.kind === 'coin' ? '#7a5512' : i ? '#3a2c20' : '#2a1f16'}" stroke="#16110c" stroke-width=".4"`)}</g></g>`
    }
  }
  return `<svg class="bit ${cls}" width="${(vbW * px).toFixed(1)}" height="${(vbH * px).toFixed(1)}" viewBox="0 0 ${vbW} ${vbH}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} style="overflow:visible">
    <defs><clipPath id="${clip}">${shapeEl(shape, w, h)}</clipPath></defs>
    ${under}
    <g class="dreh" style="--r:${rot}deg"><g clip-path="url(#${clip})">${face}</g>${shapeEl(shape, w, h, 'fill="none" stroke="rgba(0,0,0,.45)" stroke-width=".5"')}</g>
  </svg>`
}

// Påsen (filtvariant B): ett tygknyte med snöre, i millimeter som brickorna.
function bagSvg(px, count) {
  const w = 74, h = 70
  return `<svg width="${w * px}" height="${h * px}" viewBox="0 0 ${w} ${h}" aria-hidden="true" style="overflow:visible">
    <ellipse cx="37" cy="66" rx="30" ry="4" fill="rgba(0,0,0,.35)"/>
    <path d="M22 20 C 6 30, 4 62, 37 64 C 70 62, 68 30, 52 20 Z" fill="#6b4f8a" stroke="#3c2a52" stroke-width="1"/>
    <path d="M22 20 C 26 26, 48 26, 52 20" fill="none" stroke="#3c2a52" stroke-width="1"/>
    <path d="M26 20 C 24 10, 30 6, 33 12 M48 20 C 50 10, 44 6, 41 12" fill="#6b4f8a" stroke="#3c2a52" stroke-width="1"/>
    <path d="M24 21 C 30 24, 44 24, 50 21" fill="none" stroke="#e9d7a8" stroke-width="1.6" stroke-dasharray="3 1.5"/>
    <circle cx="51" cy="23" r="1.6" fill="#e9d7a8"/><path d="M51 24 l 3 9 M51 24 l -1 10" stroke="#e9d7a8" stroke-width="1"/>
    <path d="M16 40 C 18 50, 24 56, 30 58" fill="none" stroke="#866aa6" stroke-width="2" opacity=".6"/>
  </svg>`
}
