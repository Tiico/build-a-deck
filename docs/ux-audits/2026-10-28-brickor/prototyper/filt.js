// PROTOTYP (#1474). Filten: brickorna i sin form, rotationen i formens steg, högen/påsen/sjön.
// Geometrin är receptets (packages/server/src/recipe.ts): filten 1200 × 800 mm för fyra platser,
// draghögen på (−140, 0), slänghögen på (140, 0), varje plats hand 500 × 60 mm vid kanten och ytan
// framför 170 mm in från kanten. Skalan på TV:n är uppmätt i Chromium (DESIGN-BESLUT K9-följderna):
// fyraplatsbordet vid 1920 × 1080 ger kortets kortsida 78 px (1,24 px/mm), åttaplatsbordet 45 px
// (0,71 px/mm), som är K9:s golv. Prototypens felt.js används inte, eftersom den lägger högarna fel.
window.Filt = (() => {
  const FELT = { w: 1200, h: 800 }
  const SEATS = [
    { id: 'A', name: 'Nicklas', c: '#e05a4f', edge: 'S' }, { id: 'B', name: 'Sara', c: '#3c8ce7', edge: 'N' },
    { id: 'C', name: 'Ali', c: '#4caf7d', edge: 'E' }, { id: 'D', name: 'Mira', c: '#b07be0', edge: 'W' },
  ]
  const SCALES = { fit: null, tv4: 1.24, tv8: 0.71 }
  const names = { A: 'Hög och ring', B: 'Påse och vred', C: 'Sjö, tryck och rutnät' }
  const notes = {
    A: `<b>A · Hög och ring (rekommenderas).</b> Brickan ritas i sin form med texturen klippt i formen och kartongens kant under (C1). Ett klick ger ringen (K14), där «Vrid» står två gånger med formens steg: <b>60°</b> för sexhörningen, <b>90°</b> för kvadraten och den runda. Tangentbordet: <kbd>R</kbd> och <kbd>Shift R</kbd> vrider ett steg, och stegen blinkar runt brickan. Påsen är en dold, blandad hög, ritad som en hög med tjocklek och antal, som korten.
    <br><span class="plus">+ Samma språk som korten: högen, ringen och tangenterna finns redan; bara steget är nytt, och det är typens. Inget nytt i motorn.</span> <span class="minus">− En påse ser inte ut som en påse. Två klick för att vrida med musen.</span>`,
    B: `<b>B · Påse och vred.</b> Den dolda högen ritas som ett tygknyte med antal, och «Dra ur påsen» är dess verb. En vald bricka får ett vred ovanför sig: dra runt det, så snäpper brickan i formens steg och visar vinkeln. Ringen har kvar «Vänd» och «Flytta…». Tangenterna som i A.
    <br><span class="plus">+ Påsen säger vad den är på avstånd. Vredet är direkt och visar steget medan man drar.</span> <span class="minus">− Påsen är en ny ritning för samma zon (en hög med synligheten «ingen»), och designern måste välja den. Vredet är en ny gest som bara brickan har, och på TV:n syns den inte för dem i soffan.</span>`,
    C: `<b>C · Sjö, tryck och rutnät.</b> De dolda brickorna ligger utspridda med baksidan upp i en «sjö», som i Kingdomino, och man tar vilken som helst. Ett tryck på en lagd bricka vrider den ett steg direkt; ringen nås med <kbd>Enter</kbd> eller högerklick. En släppt bricka lägger sig i ett sexhörnigt rutnät på Spelytan.
    <br><span class="plus">+ Snabbast att lägga en karta: ett tryck per steg, och brickorna hamnar kant i kant.</span> <span class="minus">− Sjön kräver att servern väljer identitet först när någon tar (annars går en dold bricka att följa), vilket är en ny sorts dold zon. Rutnätet är brädets och zonernas fråga (#1473), inte brickans. Ett tryck som vrider kan inte också välja.</span>`,
  }
  let S, root, scaleKey = 'fit', V

  const deckMm = (shape) => shape === 'round' ? { w: 44, h: 44 } : MM[shape]
  function reset() {
    uid = 0
    const shape = S?.shape || 'hex'
    S = { shape, sel: null, log: [], hands: { A: { cards: 4, tiles: 1 }, B: { cards: 5, tiles: 0 }, C: { cards: 3, tiles: 2 }, D: { cards: 4, tiles: 0 } }, coins: 17 }
    const placedIds = ['L01', 'L03', 'L05', 'L04', 'L02', 'L08', 'L06']
    S.placed = placedIds.map((id, i) => ({ k: 'p' + i, tile: TILES.find((t) => t.id === id), up: true, rot: [0, 60, 0, 120, 0, 240, 60][i] * (shape === 'hex' ? 1 : 0) + (shape !== 'hex' ? [0, 90, 0, 180, 270, 0, 90][i] : 0) }))
    layoutCluster()
    S.pile = TILES.filter((t) => !placedIds.includes(t.id)).map((t) => t.id)
    S.coinsOut = [{ k: 'g1', x: 160, y: 272 }, { k: 'g2', x: 192, y: 264 }, { k: 'g3', x: 178, y: 296 }]
    // Sjön (C): de dolda brickornas platser. Identiteten väljs först när någon tar en.
    S.pool = S.pile.map((_, i) => { const a = i * 2.4, r = 6 + 19 * Math.sqrt(i); return { k: "q" + i, x: -320 + r * Math.cos(a), y: 20 + r * Math.sin(a), rot: (i * 37) % 60 } })
  }
  function lattice(shape) {
    const { w, h } = deckMm(shape)
    return shape === 'hex' ? { dx: w, dy: h * 0.75, off: w / 2 } : { dx: w + 2, dy: h + 2, off: shape === 'square' ? 0 : (w + 2) / 2 }
  }
  function layoutCluster() {
    const L = lattice(S.shape)
    const cells = [[0, -1], [1, -1], [2, -1], [0, 0], [1, 0], [2, 0], [3, 0]]
    S.placed.forEach((p, i) => { const [c, r] = cells[i]; p.x = -L.dx * 1.5 + c * L.dx + (r === -1 ? L.off : 0); p.y = -105 + r * L.dy + L.dy / 2 })
  }
  function snap(p) {
    const L = lattice(S.shape)
    const x0 = -L.dx * 1.5, y0 = -105 - L.dy / 2
    const r = Math.round((p.y - y0) / L.dy)
    const off = ((r % 2) + 2) % 2 ? 0 : L.off
    const c = Math.round((p.x - x0 - off) / L.dx)
    return { x: x0 + c * L.dx + off, y: y0 + r * L.dy }
  }

  function pxPerMm() {
    if (SCALES[scaleKey]) return SCALES[scaleKey]
    const hus = root.querySelector('.filt-hus')
    const r = hus.getBoundingClientRect()
    return Math.max(0.3, Math.min((r.width - 24) / FELT.w, (r.height - 24) / FELT.h))
  }
  const X = (x) => (x + FELT.w / 2) * mm, Y = (y) => (y + FELT.h / 2) * mm
  let mm = 1

  function zonesHtml() {
    let h = ''
    const zone = (x, y, w, hh, cls, label, below = true) => `<div class="zon ${cls}" style="left:${X(x)}px;top:${Y(y)}px;width:${w * mm}px;height:${hh * mm}px">${label ? `<span class="zn" style="${below ? 'top:calc(100% + 3px)' : 'bottom:calc(100% + 3px)'}">${label}</span>` : ''}</div>`
    // Händer och ytor framför, per kant.
    h += zone(-250, 340, 500, 60, 'hand') + zone(-250, 230, 500, 100, '', '', false)
    h += zone(-250, -400, 500, 60, 'hand') + zone(-250, -330, 500, 100, '')
    h += zone(540, -250, 60, 500, 'hand') + zone(430, -250, 100, 500, '')
    h += zone(-600, -250, 60, 500, 'hand') + zone(-530, -250, 100, 500, '')
    // Kortens högar.
    h += `<div class="hog" style="left:${X(-140)}px;top:${Y(0)}px" aria-hidden="true">${pieceSvg({ kind: 'card', up: false }, mm, { layers: 6 })}<span class="zn">Draghög · 34</span></div>`
    h += `<div class="hog" style="left:${X(140)}px;top:${Y(0)}px" aria-hidden="true">${pieceSvg({ kind: 'card', card: CARDS[5], up: true }, mm, { layers: 2 })}<span class="zn">Slänghög · 3</span></div>`
    // Platsernas namn och händer (solfjädern, med brickans baksida bland korten).
    const pos = { S: [0, 370, 0], N: [0, -370, 180], E: [570, 0, -90], W: [-570, 0, 90] }
    for (const s of SEATS) {
      const [x, y, r] = pos[s.edge], hd = S.hands[s.id]
      const items = [...Array(hd.cards)].map(() => pieceSvg({ kind: 'card', up: false }, mm * 0.6, { edge: false })).concat([...Array(hd.tiles)].map(() => pieceSvg({ kind: 'tile', shape: S.shape, mm: deckMm(S.shape), up: false }, mm * 0.6, { edge: false })))
      h += `<div class="fan" style="left:${X(x)}px;top:${Y(y)}px;transform:translate(-50%,-50%) rotate(${r}deg)">${items.join('')}</div>`
      const np = { S: [0, 216], N: [0, -216], E: [480, -272], W: [-480, -272] }[s.edge]
      h += `<div class="platsnamn" style="--c:${s.c};left:${X(np[0])}px;top:${Y(np[1])}px"><i>${s.id}</i>${s.name} · ${hd.cards + hd.tiles}</div>`
    }
    return h
  }

  function tileLabel(p) { return `${p.tile.namn}, landskapsbricka, ${SHAPE_NAME[S.shape]}, vriden ${((p.rot % 360) + 360) % 360}°` }

  function render() {
    mm = pxPerMm()
    const f = root.querySelector('.filt')
    f.style.width = FELT.w * mm + 'px'; f.style.height = FELT.h * mm + 'px'; f.style.setProperty('--mm', mm)
    const shape = S.shape, dm = deckMm(shape)
    let h = zonesHtml()
    // Spelytan med kartan, och i C rutnätet under den.
    if (V === 'C') {
      const L = lattice(shape)
      let g = ''
      for (let r = -2; r <= 2; r++) for (let c = -1; c <= 5; c++) {
        const p = { x: -L.dx * 1.5 + c * L.dx + (((r % 2) + 2) % 2 ? 0 : L.off), y: -105 - L.dy / 2 + r * L.dy }
        if (Math.abs(p.y + 105) > L.dy * 1.8) continue
        g += `<div class="snapp" style="left:${X(p.x)}px;top:${Y(p.y)}px">${`<svg width="${dm.w * mm}" height="${dm.h * mm}" viewBox="0 0 ${dm.w} ${dm.h}">${shapeEl(shape, dm.w, dm.h, 'fill="none" stroke="#5a6070" stroke-width=".6" stroke-dasharray="2 2"')}</svg>`}</div>`
      }
      h += g
    }
    // Den dolda högen / påsen / sjön.
    const n = S.pile.length
    if (V === 'A') h += `<div class="hog" tabindex="0" role="button" data-hog aria-label="Landskap, dold hög, ${n} brickor. Enter öppnar handlingar." style="left:${X(-310)}px;top:${Y(0)}px">${n ? pieceSvg({ kind: 'tile', shape, mm: dm, up: false }, mm, { layers: n }) : `<div style="width:${dm.w * mm}px;height:${dm.h * mm}px;border:1px dashed #3a3f4b;border-radius:6px"></div>`}<span class="zn">Landskap · ${n}</span></div>`
    if (V === 'B') h += `<div class="hog" tabindex="0" role="button" data-hog aria-label="Landskap, påse, ${n} brickor. Enter öppnar handlingar." style="left:${X(-310)}px;top:${Y(0)}px">${bagSvg(mm, n)}<span class="zn">Påsen · ${n}</span></div>`
    if (V === 'C') {
      h += `<span class="zn" style="position:absolute;left:${X(-330)}px;top:${Y(-112)}px;transform:translateX(-50%)">Sjön · ${n}</span>`
      S.pool.slice(0, n).forEach((q) => { h += `<div class="lagd" tabindex="0" role="button" data-pool="${q.k}" aria-label="Dold landskapsbricka i Sjön. Enter öppnar handlingar." style="left:${X(q.x)}px;top:${Y(q.y)}px">${pieceSvg({ kind: 'tile', shape, mm: dm, up: false, rot: q.rot }, mm)}</div>` })
    }
    // Guldet: en öppen hög och tre mynt framför Nicklas.
    h += `<div class="hog" tabindex="0" role="button" data-coins aria-label="Guld, ${S.coins} mynt. Enter öppnar handlingar." style="left:${X(320)}px;top:${Y(0)}px">${pieceSvg({ kind: 'coin', shape: 'round', up: true }, mm, { layers: S.coins })}<span class="zn">Guld · ${S.coins}</span></div>`
    S.coinsOut.forEach((g) => { h += `<div class="lagd" data-coin="${g.k}" tabindex="0" role="button" aria-label="Guldmynt framför Nicklas" style="left:${X(g.x)}px;top:${Y(g.y)}px">${pieceSvg({ kind: 'coin', shape: 'round', up: true }, mm)}</div>` })
    // De lagda landskapen.
    S.placed.forEach((p) => {
      h += `<div class="lagd${S.sel === p.k ? ' vald' : ''}${p.ny ? ' ny' : ''}" tabindex="0" role="button" data-k="${p.k}" aria-label="${tileLabel(p)}. ${V === 'C' ? 'Tryck vrider ett steg, Enter öppnar handlingar' : 'Enter öppnar handlingar, R vrider'}." style="left:${X(p.x)}px;top:${Y(p.y)}px">${pieceSvg({ kind: 'tile', shape, mm: dm, tile: p.tile, up: p.up, rot: p.rot }, mm)}</div>`
      p.ny = false
    })
    f.innerHTML = h
    wire(f)
    renderSide()
  }

  function ringAt(x, y, buttons, radius, arc) {
    const f = root.querySelector('.filt')
    f.querySelector('.ring')?.remove()
    const ring = document.createElement('div')
    ring.className = 'ring'; ring.style.left = X(x) + 'px'; ring.style.top = Y(y) + 'px'
    const R = radius
    buttons.forEach((b, i) => {
      const a = (arc ? arc[0] + (arc[1] - arc[0]) * i / Math.max(1, buttons.length - 1) : -90 + (360 / buttons.length) * i) * Math.PI / 180
      const el = document.createElement('button')
      el.innerHTML = b.label; el.style.left = R * Math.cos(a) + 'px'; el.style.top = R * Math.sin(a) * 0.8 + 'px'
      el.onclick = (e) => { e.stopPropagation(); ring.remove(); b.go() }
      ring.appendChild(el)
    })
    f.appendChild(ring)
    ring.querySelector('button')?.focus()
    ring.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ring.remove(); S.sel = null; render() } })
  }

  function log(seat, text) {
    S.log.unshift({ seat, text, ny: true }); S.log = S.log.slice(0, 7)
  }
  function rotate(p, dir) {
    const step = STEP[S.shape] * dir
    p.rot += step
    log('A', `vred ${p.tile.namn} ${Math.abs(step)}°`)
    render()
    flashDetents(p)
    root.querySelector(`[data-k="${p.k}"]`)?.focus()
  }
  function flashDetents(p) {
    if (V === 'B') return
    const f = root.querySelector('.filt')
    const k = 360 / STEP[S.shape], R = (deckMm(S.shape).h / 2 + 7) * mm
    const cur = (((p.rot / STEP[S.shape]) % k) + k) % k
    let svg = `<svg width="${R * 2 + 12}" height="${R * 2 + 12}" viewBox="${-R - 6} ${-R - 6} ${R * 2 + 12} ${R * 2 + 12}">`
    for (let i = 0; i < k; i++) { const a = (-90 + i * STEP[S.shape]) * Math.PI / 180; svg += `<circle cx="${R * Math.cos(a)}" cy="${R * Math.sin(a)}" r="${i === cur ? 5 : 3}" fill="${i === cur ? '#f0b64a' : '#9b968e'}"/>` }
    svg += '</svg>'
    const d = document.createElement('div'); d.className = 'detent'; d.style.left = X(p.x) + 'px'; d.style.top = Y(p.y) + 'px'; d.innerHTML = svg
    f.appendChild(d)
    setTimeout(() => { d.style.opacity = 0 }, 700); setTimeout(() => d.remove(), 1400)
  }
  function tileRing(p) {
    const st = STEP[S.shape]
    const R = Math.max(96, deckMm(S.shape).h * mm / 2 + 62)
    const turn = [{ label: `↺ Vrid<small>${st}°</small>`, go: () => rotate(p, -1) }, { label: `↻ Vrid<small>${st}°</small>`, go: () => rotate(p, 1) }]
    const rest = [
      { label: 'Vänd', go: () => { p.up = !p.up; log('A', `vände ${p.up ? p.tile.namn : 'en bricka'}`); render() } },
      { label: 'Flytta…', go: () => { log('A', `flyttade ${p.tile.namn}`); render() } },
      { label: 'Till handen', go: () => { S.placed = S.placed.filter((x) => x !== p); S.hands.A.tiles++; S.sel = null; log('A', `tog ${p.tile.namn} till handen`); render() } },
    ]
    ringAt(p.x, p.y, V === 'B' ? rest : [...turn.slice(0, 1), ...rest.slice(0, 1), ...turn.slice(1), ...rest.slice(1)], R, V === "B" ? [160, 20] : undefined)
  }
  function drawToHand() {
    if (!S.pile.length) return
    S.pile.splice(Math.floor(Math.random() * S.pile.length), 1); S.hands.A.tiles++
    log('A', V === 'B' ? 'drog 1 ur påsen' : V === 'C' ? 'tog 1 ur sjön' : 'drog 1 ur Landskap'); render()
  }
  function layOut(at) {
    if (!S.pile.length) return
    const id = S.pile.splice(Math.floor(Math.random() * S.pile.length), 1)[0]
    const t = TILES.find((x) => x.id === id)
    const p = { k: 'p' + Date.now(), tile: t, up: true, rot: 0, x: at.x, y: at.y, ny: true }
    if (V === 'C') Object.assign(p, snap(p))
    S.placed.push(p); S.sel = null
    log('A', `${V === 'C' ? 'vände upp' : 'lade ut'} ${t.namn}`); render()
  }

  function wire(f) {
    f.querySelectorAll('[data-k]').forEach((el) => {
      const p = S.placed.find((x) => x.k === el.dataset.k)
      let start = null, moved = false
      el.addEventListener('pointerdown', (e) => {
        if (e.button === 2) return
        start = { x: e.clientX, y: e.clientY, px: p.x, py: p.y }; moved = false; el.setPointerCapture(e.pointerId)
      })
      el.addEventListener('pointermove', (e) => {
        if (!start) return
        const dx = (e.clientX - start.x) / mm, dy = (e.clientY - start.y) / mm
        if (!moved && Math.hypot(dx, dy) * mm < 5) return
        moved = true; el.classList.add('dras'); f.querySelector('.ring')?.remove()
        p.x = start.px + dx; p.y = start.py + dy
        el.style.left = X(p.x) + 'px'; el.style.top = Y(p.y) + 'px'
      })
      el.addEventListener('pointerup', () => {
        if (!start) return
        start = null
        if (moved) { if (V === 'C') Object.assign(p, snap(p)); log('A', `flyttade ${p.tile.namn}`); render(); return }
        if (V === 'C') { rotate(p, 1); return }
        S.sel = p.k; render(); if (V === 'A') tileRing(p); else { tileRing(p); knob(p) }
      })
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); S.sel = p.k; render(); tileRing(p) })
      el.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotate(p, e.shiftKey ? -1 : 1) }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.sel = p.k; render(); tileRing(p); if (V === 'B') knob(p) }
      })
    })
    f.querySelectorAll('[data-hog]').forEach((el) => {
      const open = () => {
        const R = 80
        const b = V === 'B'
          ? [{ label: 'Dra ur påsen', go: drawToHand }, { label: 'Lägg ut en', go: () => layOut({ x: -230, y: 60 }) }, { label: 'Blanda', go: () => { log('A', 'skakade påsen'); render() } }]
          : [{ label: 'Dra 1', go: drawToHand }, { label: 'Vänd översta', go: () => layOut({ x: -230, y: 60 }) }, { label: 'Blanda', go: () => { log('A', 'blandade Landskap'); render() } }]
        ringAt(-310, 0, b, R)
      }
      el.onclick = open
      el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }
    })
    f.querySelectorAll('[data-pool]').forEach((el) => {
      const q = S.pool.find((x) => x.k === el.dataset.pool)
      const open = () => ringAt(q.x, q.y, [{ label: 'Ta till handen', go: drawToHand }, { label: 'Vänd upp', go: () => layOut({ x: q.x + 110, y: q.y }) }], 70)
      el.onclick = open
      el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }
    })
    f.querySelectorAll('[data-coins]').forEach((el) => {
      const open = () => ringAt(320, 0, [{ label: 'Ta 1', go: () => { S.coins--; S.coinsOut.push({ k: 'g' + Date.now(), x: 140 + Math.random() * 90, y: 250 + Math.random() * 60 }); log('A', 'tog 1 guld'); render() } }, { label: 'Dela i två', go: () => {} }], 64)
      el.onclick = open
      el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }
    })
  }

  // B: vredet ovanför den valda brickan. Dra runt det; brickan snäpper i formens steg.
  function knob(p) {
    const f = root.querySelector('.filt')
    const R = deckMm(S.shape).h / 2 * mm + 44
    const place = (deg) => { const a = (deg - 90) * Math.PI / 180; return [X(p.x) + R * Math.cos(a), Y(p.y) + R * Math.sin(a)] }
    const k = document.createElement('div')
    k.className = 'vred'; k.tabIndex = 0; k.setAttribute('role', 'slider'); k.setAttribute('aria-label', `Vrid ${p.tile.namn}`)
    k.setAttribute('aria-valuemin', 0); k.setAttribute('aria-valuemax', 360 - STEP[S.shape]); k.textContent = '↻'
    const tag = document.createElement('div'); tag.className = 'vinkel'
    const set = () => {
      const deg = p.rot; const [x, y] = place(deg)
      k.style.left = x + 'px'; k.style.top = y + 'px'; k.setAttribute('aria-valuenow', ((deg % 360) + 360) % 360)
      tag.style.left = x + 'px'; tag.style.top = (y - 18) + 'px'; tag.textContent = `${((deg % 360) + 360) % 360}°`
    }
    set(); f.append(k, tag)
    let drag = false
    k.onpointerdown = (e) => { drag = true; k.setPointerCapture(e.pointerId); e.stopPropagation() }
    k.onpointermove = (e) => {
      if (!drag) return
      const fr = f.getBoundingClientRect()
      const a = Math.atan2(e.clientY - fr.top - Y(p.y), e.clientX - fr.left - X(p.x)) * 180 / Math.PI + 90
      const st = STEP[S.shape]
      let target = Math.round(a / st) * st
      const base = Math.round((p.rot - target) / 360) * 360
      target += base
      if (target !== p.rot) {
        p.rot = target
        const el = f.querySelector(`[data-k="${p.k}"]`)
        el.querySelectorAll('.dreh').forEach((g) => g.style.setProperty('--r', p.rot + 'deg'))
        set()
      }
    }
    k.onpointerup = () => { if (drag) { drag = false; log('A', `vred ${p.tile.namn} till ${((p.rot % 360) + 360) % 360}°`); renderSide() } }
    k.onkeydown = (e) => { if (['ArrowRight', 'ArrowUp', 'r', 'R'].includes(e.key)) { e.preventDefault(); rotate(p, e.key === 'R' ? -1 : 1); S.sel = p.k; render(); knob(p) } if (['ArrowLeft', 'ArrowDown'].includes(e.key)) { e.preventDefault(); rotate(p, -1); S.sel = p.k; render(); knob(p) } }
  }

  function renderSide() {
    const side = root.querySelector('.tv-sida')
    const seat = (id) => SEATS.find((s) => s.id === id)
    const row = (label, mmW, minPx) => {
      const cur = mmW * mm, a = mmW * 1.24, b = mmW * 0.71
      return `<tr><td>${label}</td><td>${Math.round(cur)}</td><td>${Math.round(a)}</td><td class="${b < minPx ? 'under' : ''}">${Math.round(b)}</td></tr>`
    }
    const dm = deckMm(S.shape)
    side.innerHTML = `<div><h3>SENAST</h3><ul class="senast">${S.log.map((l) => `<li class="${l.ny ? 'ny' : ''}"><b style="--c:${seat(l.seat).c}">${seat(l.seat).name}</b> ${l.text}</li>`).join('') || '<li style="color:#9b968e">Klicka på en bricka.</li>'}</ul></div>
      <div><h3>STORLEK I PIXLAR</h3><table class="matt-tab"><thead><tr><th>bredd</th><th>nu</th><th>TV 4</th><th>TV 8</th></tr></thead><tbody>
      ${row('Kort 63 mm', 63, 45)}${row(`${SHAPE_NAME[S.shape]} ${Math.round(dm.w)} mm`, dm.w, 32)}${row('Guld 25 mm', 25, 24)}</tbody></table>
      <p class="kbd" style="margin:6px 0 0">TV 4 = fyra platser vid 1920 × 1080 (1,24 px/mm), TV 8 = åtta (0,71 px/mm, kortet på K9:s golv). Ett mynt under 24 px får en träffyta som räknarbrickan, större än det ritade.</p></div>
      <div class="kbd"><h3>TANGENTBORDET</h3><kbd>Tab</kbd> till en bricka · <kbd>Enter</kbd> ringen · <kbd>R</kbd> vrid ${STEP[S.shape]}° · <kbd>Shift</kbd>+<kbd>R</kbd> tillbaka · <kbd>Esc</kbd> stäng</div>`
    S.log.forEach((l) => { l.ny = false })
  }

  function extras(ex) {
    const b = (key, lab, cur, on) => `<button data-${key}="${on}" aria-pressed="${cur === on}">${lab}</button>`
    ex.innerHTML = `<span>Form:</span>${b('form', '<i class="hexi" aria-hidden="true"></i> Sexhörning', S.shape, 'hex')}${b('form', '◻ Kvadrat', S.shape, 'square')}${b('form', '○ Rund', S.shape, 'round')}
      <span style="margin-left:8px">Skala:</span>${b('skala', 'Passa', scaleKey, 'fit')}${b('skala', 'TV 4 platser', scaleKey, 'tv4')}${b('skala', 'TV 8 platser', scaleKey, 'tv8')}
      <button data-nolla="1">Börja om</button>`
    ex.querySelectorAll('[data-form]').forEach((el) => el.onclick = () => { S.shape = el.dataset.form; reset(); extras(ex); render() })
    ex.querySelectorAll('[data-skala]').forEach((el) => el.onclick = () => { scaleKey = el.dataset.skala; extras(ex); render() })
    ex.querySelector('[data-nolla]').onclick = () => { reset(); render() }
  }

  return {
    names, notes,
    render(scen, v, ex) {
      V = v; root = scen
      if (!S) reset()
      S.sel = null
      scen.innerHTML = `<div class="tv"><div class="tv-huvud"><b>Skogens råd</b><span>v3</span><span style="color:var(--chalk-off)">4 vid bordet</span><span class="kod">KX4M</span></div>${innerWidth < 600 ? '<p style="grid-column:1/-1;margin:0;padding:8px 16px;background:#1f1b12;color:#e9d7a8;font:13px/1.45 system-ui">Vid 390 ritas ingen filt i appen: under K9:s 45 px får fönstret spelarytan (se Telefonen). Filten visas här bara förminskad.</p>' : ''}<div class="filt-hus"><div class="filt" role="application" aria-label="Filten"></div></div><aside class="tv-sida"></aside></div>`
      extras(ex)
      render()
      scen.querySelector('.filt').addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget) { S.sel = null; render() } })
    },
    resize() { if (root?.querySelector('.filt')) render() },
  }
})()
