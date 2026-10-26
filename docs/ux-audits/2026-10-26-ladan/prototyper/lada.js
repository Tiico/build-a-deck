// Delat av runda 2 (#1406): lådans ytor, nätet, produktbilden och editorns krom, utbrutna ur
// index.html (runda 1, @57a0819) utan ändring utöver att luften går att ändra (beslut 4) och att
// den neutrala lådan bär spelets namn och lekens färg (beslut 5). PROTOTYP, slängs med beslutet.
// ── Glyferna: #1083:s hand, 16-rutnät, 1,6 rund linje ────────────────────────────────────────────
const P = {
  lasT: 'M4.5 7.25h7v6h-7zM5.75 7.25V5.5a2.25 2.25 0 0 1 4.5 0v1.75',
  lasO: 'M4.5 7.25h7v6h-7zM5.75 7.25V5.5a2.25 2.25 0 0 1 4.4-.7',
  lada: 'M2.5 5 8 2.5 13.5 5v6L8 13.5 2.5 11zM2.5 5 8 7.5l5.5-2.5M8 7.5v6',
  varv: 'M12.75 8A4.75 4.75 0 1 1 11.3 4.6M12.75 2.75V5.5H10',
  text: 'M3.5 4h9M8 4v8.5',
  bild: 'M2.75 3.5h10.5v9H2.75zM2.75 11l3.5-3.5 2.5 2.5 1.5-1.5 3 3',
  form: 'M3 3h10v10H3z',
  pen: 'M10.5 2.75 13.25 5.5 6 12.75H3.25V10z',
  spela: 'M5 3.5v9l7-4.5z',
}
const g = (n, cls = 'g') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n]}"/></svg>`

// ── Tillståndet ──────────────────────────────────────────────────────────────────────────────────
const q = new URLSearchParams(location.search)
let v = (q.get('v') || 'B').toUpperCase()
let yta = q.get('yta') || 'editor'
let lang = q.get('lang') || 'sv'
let n = Number(q.get('lek') || 108)
let designad = q.get('design') !== 'tom'
let st = {}
const omstart = () => { st = { yta: 'fram', las: { W: false, H: false, D: false }, lasade: null, fast: false, rx: -14, ry: -32, genom: false, mini: 'nat' } }
omstart()
const en = () => lang === 'en'
const L = (sv, eng) => (en() ? eng : sv)
const tal = (x) => { const r = Math.round(x * 10) / 10; return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', en() ? '.' : ',') }

// ── Måtten ur leken ──────────────────────────────────────────────────────────────────────────────
// Kortets typ: 63 × 88 mm, 0,3 mm (recipe.ts). Luft 1 mm runt kortet och 2 mm i djupet,
// avrundat uppåt till en halv millimeter. Det låsta måttet är det lådan hade när det låstes.
const KORT = { w: 63, h: 88, t: 0.3 }
let LUFT = 1, DJUPLUFT = 2
const rakna = (antal) => ({ W: KORT.w + 2 * LUFT, H: KORT.h + 2 * LUFT, D: Math.ceil((antal * KORT.t + DJUPLUFT) * 2) / 2 })
function matt() {
  const r = rakna(n)
  const lasta = st.lasade ?? rakna(108)
  const d = { ...r }
  if (v === 'C') { if (st.fast) Object.assign(d, lasta) } else for (const k of ['W', 'H', 'D']) if (st.las[k]) d[k] = lasta[k]
  const lek = n * KORT.t
  const rymmer = Math.floor((d.D - DJUPLUFT) / KORT.t + 1e-9)
  const over = d.D < r.D
  return { d, r, lek, rymmer, over, forMycket: Math.max(0, n - rymmer) }
}
const GLIM = 12, TUCK = 20, BLEED = 3
const natMatt = (d) => ({ w: GLIM + 2 * d.D + 2 * d.W, h: 2 * TUCK + 2 * d.D + d.H })
const A4 = { w: 297, h: 210 }

// ── Ytorna: en funktion ritar varje yta överallt (E2) ────────────────────────────────────────────
const YTOR = [
  ['fram', 'Framsida', 'Front'], ['bak', 'Baksida', 'Back'], ['vanster', 'Vänster sida', 'Left side'],
  ['hoger', 'Höger sida', 'Right side'], ['lock', 'Lock', 'Lid'], ['botten', 'Botten', 'Bottom'],
]
const ytNamn = (k) => { const y = YTOR.find((x) => x[0] === k); return en() ? y[2] : y[1] }
const ytMatt = (k, d) => (k === 'fram' || k === 'bak' ? [d.W, d.H] : k === 'vanster' || k === 'hoger' ? [d.D, d.H] : [d.W, d.D])
function trad(w, h, x0, y0, s, fill) {
  return `<polygon points="${x0},${y0} ${x0 + w / 2},${y0 - h * s} ${x0 + w},${y0}" fill="${fill}"/>`
}
// Lådans innehåll är designerns och står på svenska oavsett verktygets språk (A4).
function ytaInre(k, w, h, titel = 'Skogens råd') {
  const ord = titel.split(' ')
  if (k === 'fram') {
    let skog = ''
    const fx = [[-4, .34, '#0e2a1b'], [8, .42, '#123622'], [22, .30, '#0e2a1b'], [36, .46, '#16402a'], [48, .33, '#0e2a1b'], [58, .40, '#123622']]
    for (const [x, s, f] of fx) skog += trad(18, h, x * w / 65, h - 12, s, f)
    return `<rect width="${w}" height="${h}" fill="#1d4a31"/><rect width="${w}" height="${h * .55}" fill="#25583b"/>
      <circle cx="${w * .78}" cy="${h * .16}" r="${w * .07}" fill="#f3e7c9" opacity=".9"/>${skog}
      <rect x="0" y="${h - 12}" width="${w}" height="12" fill="#0b2013"/>
      <text x="${w / 2}" y="${h * .27}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="${w * .15}" fill="#f3e7c9">${ord[0]}</text>
      <text x="${w / 2}" y="${h * .27 + w * .15}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="${w * .15}" fill="#f3e7c9">${ord.slice(1).join(' ')}</text>
      <text x="${w / 2}" y="${h * .27 + w * .25}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${w * .048}" fill="#cfe8d8">Ett kortspel för 2–4 spelare</text>
      <text x="${w / 2}" y="${h - 4.6}" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="700" font-size="3.4" fill="#f3e7c9">2–4 · 30 min · 10+</text>
      <rect x="2.5" y="2.5" width="${w - 5}" height="${h - 5}" fill="none" stroke="#c9a85a" stroke-width=".5"/>`
  }
  if (k === 'bak') {
    const mk = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-7" y="-10" width="14" height="19.5" rx="1" fill="#f6efe0" stroke="#7c6c4c" stroke-width=".3"/><rect x="-7" y="-10" width="14" height="4.5" rx="1" fill="#25583b"/><rect x="-5.5" y="-4" width="11" height="7" fill="#cfe0c8"/></g>`
    return `<rect width="${w}" height="${h}" fill="#f3ecdc"/><rect width="${w}" height="9" fill="#1d4a31"/>
      <text x="${w / 2}" y="6.4" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="4.4" fill="#f3e7c9">${titel}</text>
      <text x="6" y="17" font-family="system-ui" font-size="2.7" fill="#3b3426">Rådet samlas när månen står högt.</text>
      <text x="6" y="21" font-family="system-ui" font-size="2.7" fill="#3b3426">Spela ut djur, samla röster och</text>
      <text x="6" y="25" font-family="system-ui" font-size="2.7" fill="#3b3426">bli skogens nya röst.</text>
      ${mk(w * .27, h * .52, -8)}${mk(w * .5, h * .5, 0)}${mk(w * .73, h * .52, 8)}
      <text x="${w / 2}" y="${h - 14}" text-anchor="middle" font-family="system-ui" font-size="2.6" fill="#3b3426">Innehåll: 108 kort och ett regelhäfte</text>
      <text x="${w / 2}" y="${h - 8}" text-anchor="middle" font-family="system-ui" font-weight="700" font-size="3" fill="#1d4a31">2–4 spelare · 30 min · 10+</text>`
  }
  if (k === 'vanster' || k === 'hoger') {
    return `<rect width="${w}" height="${h}" fill="#1d4a31"/><rect x="0" y="${h - 12}" width="${w}" height="12" fill="#0b2013"/>
      <text transform="translate(${w / 2 + 2} ${h * .45}) rotate(-90)" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="${Math.min(6, w * .2)}" fill="#f3e7c9">${titel}</text>
      ${trad(10, h, w / 2 - 5, h - 14, .12, '#123622')}`
  }
  if (k === 'lock') {
    return `<rect width="${w}" height="${h}" fill="#1d4a31"/>
      <text x="${w / 2}" y="${h / 2 + 2}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="${Math.min(7, h * .2)}" fill="#f3e7c9">${titel}</text>`
  }
  return `<rect width="${w}" height="${h}" fill="#f3ecdc"/>
    <text x="${w / 2}" y="${h / 2 - 1}" text-anchor="middle" font-family="system-ui" font-weight="700" font-size="3.4" fill="#1d4a31">2–4 spelare · 30 min · 10+</text>
    <text x="${w / 2}" y="${h / 2 + 4.5}" text-anchor="middle" font-family="system-ui" font-size="2.8" fill="#3b3426">108 kort · ${titel}</text>`
}
const ytaSVG = (k, d, px, titel, extra = '') => { const [w, h] = ytMatt(k, d); return `<svg viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" ${extra} role="img" aria-label="${ytNamn(k)}">${ytaInre(k, w, h, titel)}</svg>` }
// Ett spel utan låda (variant A): ett omslag av namnet och första kortet, i spelets färg.
function genereratInre(w, h, titel) {
  return `<rect width="${w}" height="${h}" fill="#26303f"/><text x="${w / 2}" y="${h * .2}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="${w * .11}" fill="#e6ecfa">${titel}</text>
    <g transform="translate(${w * .2} ${h * .3}) scale(${(w * .6) / 63})">${kortInre()}</g>`
}
const genereratSVG = (d, px, titel) => `<svg viewBox="0 0 ${d.W} ${d.H}" width="${d.W * px}" height="${d.H * px}" role="img" aria-label="${L('Omslag av namnet och första kortet', 'Cover from the name and the first card')}">${genereratInre(d.W, d.H, titel)}</svg>`
// Lekens första kort, Skogsvaktaren, 63 × 88 mm.
function kortInre(farg = '#25583b', namn = 'Skogsvaktaren') {
  return `<rect width="63" height="88" rx="3" fill="#f6efe0"/><rect width="63" height="14" rx="3" fill="${farg}"/><rect y="10" width="63" height="4" fill="${farg}"/>
    <text x="31.5" y="9.6" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="6" fill="#f3e7c9">${namn}</text>
    <rect x="5" y="18" width="53" height="36" rx="1.5" fill="#cfe0c8"/>${trad(14, 88, 12, 52, .26, '#25583b')}${trad(16, 88, 26, 52, .32, '#1d4a31')}${trad(12, 88, 41, 52, .22, '#25583b')}
    <text x="6" y="62" font-family="system-ui" font-size="3.4" fill="#3b3426">Titta på två kort i Skogen.</text>
    <text x="6" y="67" font-family="system-ui" font-size="3.4" fill="#3b3426">Lägg ett av dem överst.</text>
    <circle cx="55" cy="80" r="4" fill="${farg}"/><text x="55" y="81.3" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="4" fill="#fff">3</text>`
}
const kortSVG = (hpx, farg, namn, extra = '') => `<svg viewBox="0 0 63 88" height="${hpx}" width="${hpx * 63 / 88}" ${extra} role="img" aria-label="${namn ?? 'Skogsvaktaren'}">${kortInre(farg, namn)}</svg>`

// ── Lådan i 3D ───────────────────────────────────────────────────────────────────────────────────
function lada3d(d, s, rx, ry, o = {}) {
  const W = d.W * s, H = d.H * s, D = d.D * s
  const titel = o.titel ?? 'Skogens råd'
  const y = (k, w, h, tf, left, top) => `<div class="yta" data-yta="${k}" ${o.vald === k ? 'data-vald' : ''} style="width:${w}px;height:${h}px;left:${left}px;top:${top}px;transform:${tf}">${o.tom ? neutralSVG(k, d, titel, o.farg) : ytaSVG(k, d, s, titel).replace(/width="[\d.]+" height="[\d.]+"/, '')}</div>`
  let lek = ''
  if (o.lek) {
    const m = o.lek, cw = KORT.w * s, ch = KORT.h * s, ld = m.lek * s
    const over = ld > (d.D - DJUPLUFT) * s
    // Leken står mot framsidans insida och växer bakåt; går den ut genom baksidan blir den röd.
    const z0 = D / 2 - LUFT * s
    const f = (tf, w, h, cls = '') => `<i class="${cls}" style="width:${w}px;height:${h}px;transform:${tf}"></i>`
    lek = `<div class="lek" ${over ? 'data-over' : ''} style="left:${(W - cw) / 2}px;top:${(H - ch) / 2}px;width:${cw}px;height:${ch}px">
      ${f(`translateZ(${z0}px)`, cw, ch, 'fram')}${f(`translateZ(${z0 - ld}px)`, cw, ch, 'fram')}
      ${f(`translateX(${cw - ld / 2}px) rotateY(90deg) translateZ(${z0 - ld / 2}px)`.replace(`translateZ(${z0 - ld / 2}px)`, '') + ` translateX(0)`, ld, ch)}
    </div>`
    // Sidan på leken: ett plan längs högerkanten.
    lek = lek.replace('</div>', `<i style="width:${ld}px;height:${ch}px;transform:translateX(${cw - ld / 2}px) translateZ(${z0 - ld / 2}px) rotateY(90deg)"></i><i style="width:${ld}px;height:${ch}px;transform:translateX(${-ld / 2}px) translateZ(${z0 - ld / 2}px) rotateY(-90deg)"></i></div>`)
  }
  let mattEtiketter = ''
  if (o.etiketter) {
    const e = o.etiketter
    mattEtiketter = `
      <div class="matt3" style="left:0;top:${H + 10}px;width:${W}px;height:34px;transform:translateZ(${D / 2}px)">${e.W}</div>
      <div class="matt3 lodrat" style="left:${-64}px;top:0;width:56px;height:${H}px;transform:translateZ(${D / 2}px)">${e.H}</div>
      <div class="matt3" style="left:${(W - D) / 2}px;top:${H + 10}px;width:${D}px;height:34px;transform:rotateY(90deg) translateZ(${W / 2}px)">${e.D}</div>`
  }
  return `<div class="b3" ${o.genom ? 'data-genom' : ''} style="width:${W}px;height:${H}px${o.stil ? ';' + o.stil : ''}"><div class="b3-kropp" style="transform:rotateX(${rx}deg) rotateY(${ry}deg)">
    ${y('fram', W, H, `translateZ(${D / 2}px)`, 0, 0)}
    ${y('bak', W, H, `rotateY(180deg) translateZ(${D / 2}px)`, 0, 0)}
    ${y('hoger', D, H, `rotateY(90deg) translateZ(${W / 2}px)`, (W - D) / 2, 0)}
    ${y('vanster', D, H, `rotateY(-90deg) translateZ(${W / 2}px)`, (W - D) / 2, 0)}
    ${y('lock', W, D, `rotateX(90deg) translateZ(${H / 2}px)`, 0, (H - D) / 2)}
    ${y('botten', W, D, `rotateX(-90deg) translateZ(${H / 2}px)`, 0, (H - D) / 2)}
    ${lek}${mattEtiketter}
  </div></div>`
}

// ── Produktbilden (B) ────────────────────────────────────────────────────────────────────────────
// Lådan och leken som två föremål på samma golv, i lekens egna mått: lådan W × H × D, leken
// 63 × 88 × (antal × 0,3) mm bredvid. Varje plan bär en normal (data-n), och `belys` räknar
// skuggning och glans ur den efter vridningen. Ytorna är texturer från den enda renderaren (E2);
// här står ytaSVG i deras ställe, och presentationen ritar aldrig ett kort själv.
const LJUS = { studio: [-0.45, -0.7, 0.55], kvall: [0.6, -0.45, 0.65] }
let ljusval = 'studio'
function produkt(d, s, o = {}) {
  const W = d.W * s, H = d.H * s, D = d.D * s
  const lekT = (o.antal ?? 108) * KORT.t * s, cw = KORT.w * s, ch = KORT.h * s
  const gap = 16 * s
  const total = o.utanLek ? W : W + gap + cw
  const bx = -total / 2 + W / 2, kx = total / 2 - cw / 2
  const rw = Math.max(total, D) * 1.32, rh = H * 1.5
  const titel = o.titel ?? 'Skogens råd'
  const plan = (w, h, cx, cy, cz, tf, n, inne, cls = '', glans = 0) => `<div class="p-yta ${cls}" data-n="${n}" data-glans="${glans}" style="--mm:${s}px;width:${w}px;height:${h}px;left:${(rw - w) / 2}px;top:${(rh - h) / 2}px;transform:translate3d(${cx}px,${cy}px,${cz}px) ${tf}">${inne}<i class="ljus"></i>${glans ? '<i class="glans"></i>' : ''}<i class="slitage"></i></div>`
  // Den neutrala lådan (beslut 5): spelets namn och lekens färg, inget mer.
  const tex = (k) => (o.tom ? neutralSVG(k, d, titel, o.farg) : ytaSVG(k, d, s, titel).replace(/width="[\d.]+" height="[\d.]+"/, ''))
  const tomCls = ''
  // Lådan: sex plan runt (bx, 0, 0). Lacken (glans 1) ligger på framsida och lock, resten är matt laminat.
  let html = ''
  html += plan(W, H, bx, 0, 0, `translateZ(${D / 2}px)`, '0,0,1', tex('fram'), tomCls, 1)
  html += plan(W, H, bx, 0, 0, `rotateY(180deg) translateZ(${D / 2}px)`, '0,0,-1', tex('bak'), tomCls, .4)
  html += plan(D, H, bx, 0, 0, `rotateY(90deg) translateZ(${W / 2}px)`, '1,0,0', tex('hoger'), tomCls, .4)
  html += plan(D, H, bx, 0, 0, `rotateY(-90deg) translateZ(${W / 2}px)`, '-1,0,0', tex('vanster'), tomCls, .4)
  html += plan(W, D, bx, 0, 0, `rotateX(90deg) translateZ(${H / 2}px)`, '0,-1,0', tex('lock'), tomCls, 1)
  html += plan(W, D, bx, 0, 0, `rotateX(-90deg) translateZ(${H / 2}px)`, '0,1,0', tex('botten'), tomCls)
  // Leken: ett block av kort, framkortet uppvänt, kanterna randiga av korten.
  if (!o.utanLek) {
    const ky = (H - ch) / 2, kz = D / 2 - lekT / 2 + 6 * s
    html += plan(cw, ch, kx, ky, kz, `translateZ(${lekT / 2}px)`, '0,0,1', kortSVG(ch).replace(/width="[\d.]+"/, '').replace(/height="[\d.]+"/, ''), 'lek-yta', .6)
    html += plan(cw, ch, kx, ky, kz, `rotateY(180deg) translateZ(${lekT / 2}px)`, '0,0,-1', '<svg viewBox="0 0 63 88"><rect width="63" height="88" rx="3" fill="#1d4a31"/><rect x="4" y="4" width="55" height="80" rx="2" fill="none" stroke="#c9a85a" stroke-width=".6"/></svg>', 'lek-yta', .3)
    html += plan(lekT, ch, kx, ky, kz, `rotateY(90deg) translateZ(${cw / 2}px)`, '1,0,0', '', 'kortkant lek-yta')
    html += plan(lekT, ch, kx, ky, kz, `rotateY(-90deg) translateZ(${cw / 2}px)`, '-1,0,0', '', 'kortkant lek-yta')
    html += plan(cw, lekT, kx, ky, kz, `rotateX(90deg) translateZ(${ch / 2}px)`, '0,-1,0', '', 'kortkant liggande lek-yta')
  }
  const golv = `<div class="p-golv" style="width:${total * 1.5}px;height:${Math.max(D, lekT) * 3.2}px;left:${(rw - total * 1.5) / 2}px;top:${(rh - Math.max(D, lekT) * 3.2) / 2}px;transform:translate3d(0,${H / 2 + 1}px,0) rotateX(90deg)"></div>`
  let etik = ''
  if (o.etiketter) {
    const e = o.etiketter
    etik = `<div class="matt3" style="position:absolute;left:${(rw - W) / 2}px;top:${(rh - H) / 2 + H + 12}px;width:${W}px;height:34px;transform:translate3d(${bx}px,0,${D / 2}px)">${e.W}</div>
      <div class="matt3 lodrat" style="position:absolute;left:${(rw - W) / 2 - 64}px;top:${(rh - H) / 2}px;width:56px;height:${H}px;transform:translate3d(${bx}px,0,${D / 2}px)">${e.H}</div>
      <div class="matt3" style="position:absolute;left:${(rw - D) / 2}px;top:${(rh - H) / 2 + H + 12}px;width:${D}px;height:34px;transform:translate3d(${bx}px,0,0) rotateY(90deg) translateZ(${W / 2}px)">${e.D}</div>`
  }
  return `<div class="produkt" ${o.drag ? 'data-drag' : ''} ${o.auto ? 'data-auto' : ''} data-rx="${o.rx ?? -12}" data-ry="${o.ry ?? -28}" style="width:${rw}px;height:${rh}px${o.stil ? ';' + o.stil : ''}"><div class="p-rot" style="transform-style:preserve-3d">${golv}${html}${etik}</div></div>`
}
// Ljuset: skuggning efter normalen, glans där halvvektorn mellan ljus och betraktare möter ytan.
function belys(el) {
  const rx = Number(el.dataset.rx) * Math.PI / 180, ry = Number(el.dataset.ry) * Math.PI / 180
  const rot = el.querySelector('.p-rot')
  rot.style.transform = `rotateX(${el.dataset.rx}deg) rotateY(${el.dataset.ry}deg)`
  const [lx0, ly0, lz0] = LJUS[ljusval]; const ll = Math.hypot(lx0, ly0, lz0); const Lv = [lx0 / ll, ly0 / ll, lz0 / ll]
  const Hh = [Lv[0], Lv[1], Lv[2] + 1]; const hl = Math.hypot(...Hh); Hh[0] /= hl; Hh[1] /= hl; Hh[2] /= hl
  for (const p of el.querySelectorAll('.p-yta')) {
    let [x, y, z] = p.dataset.n.split(',').map(Number)
    // CSS: rotateX(a) rotateY(b) ger Rx(Ry(n)).
    const x1 = x * Math.cos(ry) + z * Math.sin(ry), z1 = -x * Math.sin(ry) + z * Math.cos(ry)
    const y2 = y * Math.cos(rx) - z1 * Math.sin(rx), z2 = y * Math.sin(rx) + z1 * Math.cos(rx)
    const n = [x1, y2, z2]
    const diff = Math.max(0, n[0] * Lv[0] + n[1] * Lv[1] + n[2] * Lv[2])
    p.querySelector('.ljus').style.opacity = (0.62 * (1 - (0.28 + 0.72 * diff))).toFixed(3)
    const g = p.querySelector('.glans')
    if (g) {
      const spec = Math.pow(Math.max(0, n[0] * Hh[0] + n[1] * Hh[1] + n[2] * Hh[2]), 18) * Number(p.dataset.glans)
      g.style.opacity = (0.55 * spec).toFixed(3)
      g.style.transform = `translateX(${(n[0] * 60).toFixed(1)}%)`
    }
  }
}
const lugn = matchMedia('(prefers-reduced-motion: reduce)')
function snurra(t) {
  for (const el of document.querySelectorAll('.produkt')) {
    if (el.dataset.auto !== undefined && !el.dataset.held && !lugn.matches) {
      el.dataset.bas ??= el.dataset.ry
      el.dataset.ry = (Number(el.dataset.bas) + 22 * Math.sin(t / 3200)).toFixed(2)
    }
    belys(el)
  }
  requestAnimationFrame(snurra)
}

// ── Nätet ────────────────────────────────────────────────────────────────────────────────────────
function nat(d, px, o = {}) {
  const { W, H, D } = d
  const nm = natMatt(d)
  const xL = GLIM, xF = GLIM + D, xR = GLIM + D + W, xB = GLIM + 2 * D + W
  const yLid = TUCK, yK = TUCK + D, yBot = TUCK + D + H, yTuck2 = TUCK + 2 * D + H
  const panel = (k, x, y, w, h, rot = 0) => `<g data-yta="${k}"><svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rot ? `<g transform="rotate(180 ${w / 2} ${h / 2})">${ytaInre(k, w, h)}</g>` : ytaInre(k, w, h)}</svg>${o.vald === k ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#3c8ce7" stroke-width="${1.6 / px * 2}"/>` : ''}</g>`
  const flik = (pts) => `<polygon points="${pts}" fill="#d9d4c7" stroke="#222" stroke-width="${0.6 / px * 2}"/>`
  const dd = D * .8
  const lim = `<polygon points="0,${yK + 5} ${GLIM},${yK} ${GLIM},${yBot} 0,${yBot - 5}" fill="url(#lim)" stroke="#222" stroke-width="${0.6 / px * 2}"/>`
  const tuck = (x, y, uppat) => uppat
    ? `<path d="M${x} ${y + TUCK} V${y + 6} Q${x} ${y} ${x + 8} ${y} H${x + W - 8} Q${x + W} ${y} ${x + W} ${y + 6} V${y + TUCK}" fill="#d9d4c7" stroke="#222" stroke-width="${0.6 / px * 2}"/>`
    : `<path d="M${x} ${y} V${y + TUCK - 6} Q${x} ${y + TUCK} ${x + 8} ${y + TUCK} H${x + W - 8} Q${x + W} ${y + TUCK} ${x + W} ${y + TUCK - 6} V${y}" fill="#d9d4c7" stroke="#222" stroke-width="${0.6 / px * 2}"/>`
  const vik = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#222" stroke-width="${0.5 / px * 2}" stroke-dasharray="2 1.4"/>`
  const ark = o.a4 ? `<rect x="${(nm.w - A4.w) / 2}" y="${(nm.h - A4.h) / 2}" width="${A4.w}" height="${A4.h}" fill="#3a3f4b" opacity=".55" stroke="#6f7a90" stroke-width="${0.5 / px * 2}"/><text x="${(nm.w - A4.w) / 2 + 3}" y="${(nm.h - A4.h) / 2 + 6}" font-family="system-ui" font-size="${11 / px}" fill="#c3cbdd">A4 · 297 × 210 mm</text>` : ''
  const pad = o.a4 ? Math.max(0, (A4.w - nm.w) / 2 + 2) : 0
  const padY = o.a4 ? Math.max(0, (A4.h - nm.h) / 2 + 2) : 0
  const vb = `${-pad} ${-padY} ${nm.w + 2 * pad} ${nm.h + 2 * padY}`
  return `<svg viewBox="${vb}" width="${(nm.w + 2 * pad) * px}" height="${(nm.h + 2 * padY) * px}" role="img" aria-label="${L('Lådans nät', 'The box net')}">
    <defs><pattern id="lim" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="#d9d4c7"/><line x1="0" y1="0" x2="0" y2="3" stroke="#7a7f8c" stroke-width=".8"/></pattern></defs>
    ${ark}${lim}
    ${flik(`${xL},${yK} ${xL + 3},${yK - dd} ${xL + D - 3},${yK - dd} ${xL + D},${yK}`)}${flik(`${xR},${yK} ${xR + 3},${yK - dd} ${xR + D - 3},${yK - dd} ${xR + D},${yK}`)}
    ${flik(`${xL},${yBot} ${xL + 3},${yBot + dd} ${xL + D - 3},${yBot + dd} ${xL + D},${yBot}`)}${flik(`${xR},${yBot} ${xR + 3},${yBot + dd} ${xR + D - 3},${yBot + dd} ${xR + D},${yBot}`)}
    ${tuck(xB, 0, true)}${tuck(xF, yTuck2, false)}
    ${panel('lock', xB, yLid, W, D, 1)}${panel('vanster', xL, yK, D, H)}${panel('fram', xF, yK, W, H)}${panel('hoger', xR, yK, D, H)}${panel('bak', xB, yK, W, H)}${panel('botten', xF, yBot, W, D)}
    <rect x="${xL}" y="${yK}" width="${nm.w - GLIM}" height="${H}" fill="none" stroke="#222" stroke-width="${0.6 / px * 2}"/>
    ${vik(xL, yK, xL, yBot)}${vik(xF, yK, xF, yBot)}${vik(xR, yK, xR, yBot)}${vik(xB, yK, xB, yBot)}
    ${vik(xB, yLid, xB + W, yLid)}${vik(xB, yK, xB + W, yK)}${vik(xF, yBot, xF + W, yBot)}${vik(xF, yTuck2, xF + W, yTuck2)}
    ${vik(xL, yK, xL + D, yK)}${vik(xR, yK, xR + D, yK)}${vik(xL, yBot, xL + D, yBot)}${vik(xR, yBot, xR + D, yBot)}
  </svg>`
}

// ── Editorns krom ────────────────────────────────────────────────────────────────────────────────
const FLIKAR = [['wall', 'Kortvägg', 'Card wall'], ['template', 'Mall', 'Template'], ['table', 'Tabell', 'Table'], ['theme', 'Speltema', 'Theme'], ['media', 'Media', 'Media'], ['rules', 'Regler', 'Rules'], ['tables', 'Bord', 'Tables']]
function huvud(vald, nyFlik) {
  const m = matt()
  const flikar = [...FLIKAR]
  if (nyFlik) flikar.splice(2, 0, ['box', 'Låda', 'Box'])
  return `<div class="ed-huvud"><span class="hem">‹ ${L('Mina spel', 'My games')}</span><strong>Skogens råd</strong><span class="rev">v7</span><span class="sparat">${L('Sparat', 'Saved')}</span><span class="spacer"></span>
    <div class="ed-flikar" role="tablist">${flikar.map(([k, sv, eng]) => `<button role="tab" aria-selected="${k === vald}" ${k === 'box' ? 'data-ny' : ''}>${L(sv, eng)}</button>`).join('')}</div>
    <span class="spacer"></span><button class="ed-knapp kantad" ${m.over ? 'data-varnar' : ''}>${L('Fysisk kontroll', 'Physical check')} (${m.over ? 1 : 0})</button><span class="who">N</span></div>`
}
const lasKnapp = (k, tryckt) => `<button class="las-knapp" data-las="${k}" aria-pressed="${tryckt}" aria-label="${tryckt ? L('Följ leken igen', 'Follow the deck again') : L('Lås måttet', 'Lock the size')}" title="${tryckt ? L('Låst. Klicka för att följa leken igen', 'Locked. Click to follow the deck again') : L('Följer leken. Klicka för att låsa', 'Follows the deck. Click to lock')}">${g(tryckt ? 'lasT' : 'lasO')}</button>`

// A: tre rader med var sitt lås, och formeln som ger dem.
function mattA(m, interaktiv = true) {
  const { d, r } = m
  const rad = (k, namn, varde, kalla) => {
    const last = st.las[k]
    return `<div class="mrad"><span>${namn}</span><div>${last ? `<b>${tal(varde)} mm</b><small style="color:#e8c06a">${L('låst', 'locked')}${d[k] < r[k] ? ` · ${L('leken behöver', 'the deck needs')} ${tal(r[k])}` : ''}</small>` : `<b>${tal(varde)} mm</b><small>${kalla}</small>`}</div>${interaktiv ? lasKnapp(k, last) : ''}</div>`
  }
  return `<div class="matt-tab">
    ${rad('W', L('Bredd', 'Width'), d.W, L(`kortet ${KORT.w} + 2 × ${LUFT} luft`, `card ${KORT.w} + 2 × ${LUFT} clearance`))}
    ${rad('H', L('Höjd', 'Height'), d.H, L(`kortet ${KORT.h} + 2 × ${LUFT} luft`, `card ${KORT.h} + 2 × ${LUFT} clearance`))}
    ${rad('D', L('Djup', 'Depth'), d.D, L(`${n} kort × ${tal(KORT.t)} + ${DJUPLUFT} luft`, `${n} cards × ${tal(KORT.t)} + ${DJUPLUFT} clearance`))}
  </div>
  <p class="formel">${n} × ${tal(KORT.t)} = <em>${tal(m.lek)} mm</em> ${L('lek', 'deck')} · ${L('ryms', 'fits')} ${m.over ? `<s>${m.rymmer}</s>` : `<em>${m.rymmer}</em>`} ${L('kort', 'cards')}</p>
  ${m.over ? `<div class="varnar" role="status"><span><b>${L(`${m.forMycket} kort får inte plats.`, `${m.forMycket} cards do not fit.`)}</b> ${L(`Leken är ${tal(m.lek)} mm, och det låsta djupet rymmer ${tal(d.D - DJUPLUFT)}.`, `The deck is ${tal(m.lek)} mm, and the locked depth holds ${tal(d.D - DJUPLUFT)}.`)}</span>${interaktiv ? `<button data-do="folj">${L('Följ leken igen', 'Follow the deck again')}</button>` : ''}</div>` : `<p class="hint">${L('Måtten följer leken. Lås ett mått när lådan ska hålla det, till exempel för en färdig insats.', 'The sizes follow the deck. Lock one when the box has to keep it, say for a finished insert.')}</p>`}`
}

// B: måtten står på lådan; leken går att se inuti.
function etiketterB(m) {
  const { d, r } = m
  const e = (k) => `<button data-las="${k}" aria-pressed="${st.las[k]}" ${k === 'D' && m.over ? 'data-over' : ''} title="${st.las[k] ? L('Låst', 'Locked') : L('Följer leken', 'Follows the deck')}">${tal(d[k])} mm ${g(st.las[k] ? 'lasT' : 'lasO')}</button>`
  return { W: e('W'), H: e('H'), D: e('D') }
}
function fyllB(m) {
  const pct = Math.min(100, (m.lek / (m.d.D - DJUPLUFT)) * 100)
  return `<div class="fyllning"><span>${L('Leken fyller', 'The deck fills')} ${tal(m.lek)} ${L('av', 'of')} ${tal(m.d.D - DJUPLUFT)} mm${m.over ? ` · <b style="color:#ffb4b4">${L(`${m.forMycket} kort för mycket`, `${m.forMycket} cards too many`)}</b>` : ''}</span><div><i ${m.over ? 'data-over' : ''} style="width:${pct}%"></i></div></div>`
}

// C: ett val som kortets format: «Följer leken» eller «Fast mått».
function mattC(m, interaktiv = true) {
  const { d, r } = m
  return `<label>${L('Storlek', 'Size')}<select data-do="storlek" ${interaktiv ? '' : 'disabled'}><option value="folj" ${st.fast ? '' : 'selected'}>${L('Följer leken', 'Follows the deck')}</option><option value="fast" ${st.fast ? 'selected' : ''}>${L('Fast mått', 'Fixed size')}</option></select></label>
    ${st.fast ? `<div class="m-rader"><label>${L('Bredd', 'Width')}<input value="${tal(d.W)}"></label><label>${L('Höjd', 'Height')}<input value="${tal(d.H)}"></label><label>${L('Djup', 'Depth')}<input value="${tal(d.D)}" ${m.over ? 'aria-invalid="true" style="border-color:#f0b64a;color:#ffd98a"' : ''}></label></div>`
      : `<p class="hint" style="font-size:12px;color:#dce3f2"><b style="font-variant-numeric:tabular-nums">${tal(d.W)} × ${tal(d.H)} × ${tal(d.D)} mm</b></p><p class="hint">${L(`Kortet ${KORT.w} × ${KORT.h} mm och ${n} kort på ${tal(m.lek)} mm, med luft runt om.`, `The ${KORT.w} × ${KORT.h} mm card and ${n} cards at ${tal(m.lek)} mm, with clearance around.`)}</p>`}
    ${m.over ? `<div class="varnar" role="status"><span><b>${L(`${m.forMycket} kort får inte plats.`, `${m.forMycket} cards do not fit.`)}</b> ${L(`Lådan rymmer ${m.rymmer} kort. Det står också i Fysisk kontroll.`, `The box holds ${m.rymmer} cards. Physical check says so too.`)}</span></div>` : ''}`
}

// ── Editorn, variant för variant ─────────────────────────────────────────────────────────────────
function ytLista(d) {
  return YTOR.map(([k]) => {
    const [w, h] = ytMatt(k, d)
    return `<div class="yta-rad" role="option" data-valj="${k}" aria-selected="${st.yta === k}"><span class="tum">${ytaSVG(k, d, 28 / Math.max(w, h))}</span><span>${ytNamn(k)}</span><small>${tal(w)} × ${tal(h)}</small></div>`
  }).join('') + `<div class="yta-rad" data-tom><span class="tum">${g('form')}</span><span>${L('Flikar', 'Flaps')}</span><small>${L('trycks inte', 'not printed')}</small></div>`
}
function lagerLista() {
  const lager = st.yta === 'fram' ? [['text', 'Titel', 'Skogens råd'], ['text', 'Undertitel', 'Ett kortspel för…'], ['text', 'Fakta', '2–4 · 30 min · 10+'], ['bild', 'Skogen', 'skog.svg'], ['form', 'Bakgrund', '']]
    : st.yta === 'bak' ? [['text', 'Titel', 'Skogens råd'], ['text', 'Berättelse', 'Rådet samlas…'], ['bild', 'Tre kort', ''], ['text', 'Innehåll', '108 kort…'], ['form', 'Bakgrund', '']]
      : [['text', 'Titel', 'Skogens råd'], ['form', 'Bakgrund', '']]
  return lager.map(([ik, namn, kalla], i) => `<div class="m-rad" ${i === 0 ? 'aria-selected="true"' : ''}><span class="las">${g('lasO')}</span><span class="namn">${g(ik)}<span>${namn}</span><i>${kalla}</i></span><span class="grepp">⋮⋮</span></div>`).join('')
}
function textProps() {
  return `<section class="m-sek"><h3>${L('Text', 'Text')} · ${L('Titel', 'Title')}</h3><div class="m-rader">
    <label>${L('Typsnitt', 'Typeface')}<select><option>Georgia</option></select></label><label>${L('Storlek', 'Size')}<input value="28 pt"></label>
    <label>X<input value="6 mm"></label><label>Y<input value="12 mm"></label></div></section>`
}
function verktyg() { return `<div class="m-verktyg"><button>${g('text')}<span>Text</span></button><button>${g('bild')}<span>${L('Bild', 'Image')}</span></button><button>${g('form')}<span>${L('Form', 'Shape')}</span></button></div>` }


function neutralSVG(k, d, titel = 'Skogens råd', farg = '#25583b') {
  const [w, h] = ytMatt(k, d)
  const sida = k === 'vanster' || k === 'hoger'
  const namn = k === 'fram' || k === 'lock' || sida
  const text = !namn ? '' : sida
    ? `<text transform="translate(${w / 2 + 1.8} ${h / 2}) rotate(-90)" text-anchor="middle" font-family="system-ui" font-weight="700" font-size="${Math.min(5, w * .16)}" fill="#f3ecdc">${titel}</text>`
    : `<text x="${w / 2}" y="${k === 'fram' ? h * .5 : h / 2 + 1.8}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="${k === 'fram' ? w * .11 : Math.min(5, h * .16)}" fill="#f3ecdc">${titel}</text>`
  return `<svg viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${farg}"/><rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="#f3ecdc" stroke-opacity=".35" stroke-width=".4"/>${text}</svg>`
}
