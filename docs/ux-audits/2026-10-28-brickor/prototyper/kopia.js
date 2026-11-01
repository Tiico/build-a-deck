// PROTOTYP (#1474). Den fysiska kopian (#1406): stansarket som produkt, en påkostad 3D-bild i ljus
// och glans som går att vrida. Arket och brickorna ritas med samma mall som på filten och i editorn.
// Stansformen själv är partnerns och väntar (F1, F2); det här är bilden av den.
window.Kopia = (() => {
  const names = { A: 'Stansarket som produkt' }
  const notes = {
    A: `<b>Stansarket som produkt.</b> Brickleken visas som det den blir: ett stansat kartongark med landskapen tryckta i formen, tre brickor redan utpetade och liggande bredvid, och guldmynten i en liten stapel. Dra för att vrida, ljuset och glansen följer. Samma mall som på filten och i editorn; arket fylls i lekens ordning med 3 mm mellan brickorna. Den här bilden hör hemma i tryckpaketet och i «Visa upp» (L91), inte i editorns arbetsytor.
    <br><span class="plus">+ Visar att brickorna är en riktig sak man får hem, och vad 18 unika brickor betyder i papp.</span> <span class="minus">− Arkets mått och stansens bryggor är en gissning tills en partner finns; bilden får inte lova ett format partnern inte har.</span>`,
  }
  let root, rz = -28, rx = 58, raf = 0, idle = true
  const PX = 2.4
  const SHEET = { w: 300, h: 214, t: 2.2 }
  function sheetSvg() {
    const { w, h } = MM.hex
    let tiles = '', holes = ''
    const gap = 3, cols = 5, rows = 4
    const x0 = (SHEET.w - (cols * (w + gap) + (w + gap) / 2)) / 2 + gap / 2, y0 = (SHEET.h - (h + (rows - 1) * (h * 0.75 + gap * 0.87))) / 2
    let i = 0
    const out = new Set([2, 8, 13])
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = x0 + c * (w + gap) + (r % 2 ? (w + gap) / 2 : 0), y = y0 + r * (h * 0.75 + gap * 0.87)
      const t = TILES[i % TILES.length]; const n = i++
      if (out.has(n)) { holes += `<g transform="translate(${x} ${y})"><polygon points="${hexPoints(w, h)}" fill="#120d09"/><polygon points="${hexPoints(w, h)}" fill="url(#hal)"/></g>`; continue }
      const cl = nid('s')
      tiles += `<g transform="translate(${x} ${y})"><defs><clipPath id="${cl}"><polygon points="${hexPoints(w, h)}"/></clipPath></defs><g clip-path="url(#${cl})">${tileFace(t, 'hex', w, h)}</g><polygon points="${hexPoints(w, h)}" fill="none" stroke="#1a120c" stroke-width=".55"/><polygon points="${hexPoints(w, h)}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width=".3" transform="translate(.35 .35)"/></g>`
    }
    return `<svg width="${SHEET.w * PX}" height="${SHEET.h * PX}" viewBox="0 0 ${SHEET.w} ${SHEET.h}" aria-hidden="true">
      <defs><radialGradient id="hal" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
      <pattern id="papp" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#4a3424"/><path d="M0 6 L6 0" stroke="#55402e" stroke-width=".8"/></pattern></defs>
      <rect width="${SHEET.w}" height="${SHEET.h}" fill="url(#papp)"/>
      ${holes}${tiles}
      <text x="8" y="${SHEET.h - 5}" font-size="5" fill="#c7a46a" font-family="system-ui" font-weight="700" letter-spacing=".6">SKOGENS RÅD · LANDSKAP · ARK 1 AV 1 · 17 + 3 BRICKOR</text>
    </svg>`
  }
  // En utpetad bricka: lager av papp för tjockleken, och tryckytan överst.
  function loose(t, x, y, rot, up) {
    const { w, h } = MM.hex
    let layers = ''
    for (let i = 0; i < 6; i++) layers += `<div class="lager" style="transform:translateZ(${i * 0.9}px)"><svg width="${w * PX}" height="${h * PX}" viewBox="0 0 ${w} ${h}"><polygon points="${hexPoints(w, h)}" fill="${i < 5 ? '#5a4330' : '#3a2a1e'}"/></svg></div>`
    const face = up ? tileFace(t, 'hex', w, h) : tileBack('hex', w, h)
    const cl = nid('l')
    return `<div class="los" style="left:${x * PX}px;top:${y * PX}px;transform:rotateZ(${rot}deg)">${layers}<div class="lager topp" style="transform:translateZ(5.6px)"><svg width="${w * PX}" height="${h * PX}" viewBox="0 0 ${w} ${h}"><defs><clipPath id="${cl}"><polygon points="${hexPoints(w, h)}"/></clipPath></defs><g clip-path="url(#${cl})">${face}</g></svg><i class="glans"></i></div><div class="skugga"></div></div>`
  }
  function coins(x, y, n) {
    let s = ''
    for (let i = 0; i < n; i++) s += `<div class="lager" style="transform:translateZ(${i * 2.6}px) translate(${(i % 3) * 0.8}px, ${(i % 2) * -0.6}px)"><svg width="${25 * PX}" height="${25 * PX}" viewBox="0 0 25 25"><defs><clipPath id="m${i}"><circle cx="12.5" cy="12.5" r="12.5"/></clipPath></defs><g clip-path="url(#m${i})">${i === n - 1 ? coinFace('front', 25, 25) : '<rect width="25" height="25" fill="#9a6d1c"/>'}</g></svg></div>`
    return `<div class="los" style="left:${x * PX}px;top:${y * PX}px">${s}<div class="skugga rund"></div></div>`
  }
  const css = `
  .kopia { min-height: 100%; display: grid; place-items: center; background: radial-gradient(ellipse at 50% 35%, #3a3326 0%, #17140f 55%, #0b0a08 100%); overflow: hidden; cursor: grab; touch-action: none; user-select: none; position: relative; }
  .kopia.dras { cursor: grabbing; }
  .kopia .vy { perspective: 1800px; perspective-origin: 50% 30%; padding: 40px 0 80px; }
  .kopia .bord3 { position: relative; width: ${SHEET.w * PX}px; height: ${SHEET.h * PX}px; transform-style: preserve-3d; transform: rotateX(var(--rx)) rotateZ(var(--rz)); }
  .kopia .ark { position: absolute; inset: 0; transform-style: preserve-3d; }
  .kopia .ark .yta { position: absolute; inset: 0; transform: translateZ(${SHEET.t * PX}px); box-shadow: inset 0 0 0 1px #0006; overflow: hidden; }
  .kopia .ark .yta svg { display: block; }
  .kopia .ark .kant { position: absolute; background: linear-gradient(#5f4a36, #3a2a1e); }
  .kopia .ark .kant.s { left: 0; bottom: 0; width: 100%; height: ${SHEET.t * PX}px; transform-origin: bottom; transform: rotateX(-90deg); }
  .kopia .ark .kant.n { left: 0; top: 0; width: 100%; height: ${SHEET.t * PX}px; transform-origin: top; transform: rotateX(90deg); }
  .kopia .ark .kant.e { right: 0; top: 0; width: ${SHEET.t * PX}px; height: 100%; transform-origin: right; transform: rotateY(90deg); }
  .kopia .ark .kant.w { left: 0; top: 0; width: ${SHEET.t * PX}px; height: 100%; transform-origin: left; transform: rotateY(-90deg); }
  .kopia .golvskugga { position: absolute; inset: -6% -4%; background: radial-gradient(closest-side, #000c, #0000); transform: translateZ(-1px); filter: blur(10px); }
  .kopia .glans { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(calc(110deg + var(--rzn) * 1deg), #fff0 30%, #ffffff38 46%, #fff0 60%); mix-blend-mode: screen; }
  .kopia .ljus { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at calc(30% + var(--rzn) * .3%) 20%, #fff2, #0000 60%); }
  .kopia .los { position: absolute; transform-style: preserve-3d; }
  .kopia .los .lager { position: absolute; left: 0; top: 0; }
  .kopia .los .lager svg { display: block; }
  .kopia .los .topp { overflow: hidden; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
  .kopia .los .skugga { position: absolute; left: 4px; top: 6px; width: ${MM.hex.w * PX}px; height: ${MM.hex.h * PX}px; background: #000a; filter: blur(6px); transform: translateZ(-.5px); clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
  .kopia .los .skugga.rund { width: ${25 * PX}px; height: ${25 * PX}px; clip-path: circle(50%); }
  .kopia .bildtext { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); color: #e9d7a8; font: 13px system-ui; text-align: center; opacity: .85; }
  .kopia .bildtext b { color: #fff; font-size: 15px; display: block; }
  @media (prefers-reduced-motion: reduce) { .kopia .glans { display: none; } }
  `
  function apply() {
    const b = root.querySelector('.bord3'); if (!b) return
    b.style.setProperty('--rx', rx + 'deg'); b.style.setProperty('--rz', rz + 'deg')
    root.querySelector('.kopia').style.setProperty('--rzn', rz)
  }
  function fitScale() {
    const vy = root.querySelector('.vy'); if (!vy) return
    const r = root.getBoundingClientRect()
    const k = Math.min(1.25, (r.width - 32) / (SHEET.w * PX * 1.5), (r.height - 60) / (SHEET.h * PX * 1.25))
    vy.style.transform = `scale(${Math.max(0.3, k)})`
  }
  function render(scen) {
    root = scen
    cancelAnimationFrame(raf)
    scen.innerHTML = `<style>${css}</style><div class="kopia" role="img" aria-label="Stansarket med 17 landskapsbrickor, tre utpetade brickor och en stapel guldmynt. Dra för att vrida."><div class="vy"><div class="bord3">
      <div class="golvskugga"></div>
      <div class="ark"><div class="kant s"></div><div class="kant n"></div><div class="kant e"></div><div class="kant w"></div><div class="yta">${sheetSvg()}<i class="glans"></i><i class="ljus"></i></div></div>
      ${loose(TILES[2], SHEET.w + 14, 18, 14, true)}${loose(TILES[8], SHEET.w + 30, 84, -22, true)}${loose(TILES[13], SHEET.w + 8, 146, 40, false)}
      ${coins(-46, 40, 7)}${coins(-40, 92, 3)}
    </div></div><div class="bildtext"><b>Skogens råd · Landskap</b>Stansark 300 × 214 mm, 2 mm kartong · 18 brickor · 20 guldmynt</div></div>`
    apply(); fitScale()
    const k = scen.querySelector('.kopia')
    let start = null
    k.onpointerdown = (e) => { start = { x: e.clientX, y: e.clientY, rz, rx }; idle = false; k.classList.add('dras'); k.setPointerCapture(e.pointerId) }
    k.onpointermove = (e) => { if (!start) return; rz = start.rz + (e.clientX - start.x) * 0.3; rx = Math.max(25, Math.min(72, start.rx - (e.clientY - start.y) * 0.2)); apply() }
    k.onpointerup = () => { start = null; k.classList.remove('dras') }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let t0 = performance.now()
    const tick = (t) => { if (idle && !still && root.querySelector('.kopia')) { rz = -28 + Math.sin((t - t0) / 4000) * 16; apply(); raf = requestAnimationFrame(tick) } }
    if (!still) raf = requestAnimationFrame(tick)
  }
  return { names, notes, render(scen) { idle = true; render(scen) }, resize: () => fitScale() }
})()
