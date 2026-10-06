// PROTOTYP (#698, #736). Kastas när varianterna är valda.
// Visar den byggda appens bilder per variant och skärmstorlek, och, där det finns, per yta.
// Sidan sätter `window.PROTO = { prefix, varianter: { nyckel: [namn, anteckning] }, ytor?: [...], start }`.
const P = window.PROTO
const q = new URLSearchParams(location.search)
const storlekar = ['1280x800', '1024x768']
let v = P.varianter[q.get('v')] ? q.get('v') : P.start
let s = storlekar.includes(q.get('s')) ? q.get('s') : '1024x768'
let y = P.ytor && P.ytor.includes(q.get('y')) ? q.get('y') : P.ytor?.[0]
const $ = (id) => document.getElementById(id)
function rita() {
  const k = Object.keys(P.varianter)
  $('namn').textContent = `${k.indexOf(v) + 1}/${k.length} · ${P.varianter[v][0]}`
  $('anteckning').innerHTML = P.varianter[v][1]
  const fil = P.ytor ? `${P.prefix}-${v}-${y}-${s}.png` : `${P.prefix}-${v}-${s}.png`
  const img = $('bild'); img.src = `bilder/${fil}`; img.alt = `${P.varianter[v][0]}, ${s.replace('x', ' × ')}`
  for (const b of document.querySelectorAll('[data-s]')) b.setAttribute('aria-pressed', String(b.dataset.s === s))
  for (const b of document.querySelectorAll('[data-y]')) b.setAttribute('aria-pressed', String(b.dataset.y === y))
  history.replaceState(null, '', `?v=${v}&s=${s}${y ? `&y=${y}` : ''}`)
}
const steg = (d) => { const k = Object.keys(P.varianter); v = k[(k.indexOf(v) + d + k.length) % k.length]; rita() }
$('bak').onclick = () => steg(-1)
$('fram').onclick = () => steg(1)
for (const b of document.querySelectorAll('[data-s]')) b.onclick = () => { s = b.dataset.s; rita() }
for (const b of document.querySelectorAll('[data-y]')) b.onclick = () => { y = b.dataset.y; rita() }
addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') steg(-1); if (e.key === 'ArrowRight') steg(1) })
rita()
