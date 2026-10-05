// Page-side half of the #683 prototype: each variant's placement of the seat plates on the room's
// television, injected into the real built app, and the one measurement every variant is read by.
// Evaluated as a string in the page; defines window.__p683 = { place, measure }.
window.__p683 = (() => {
  const GAP = 8 // PLATE_AIR_PX in TableRenderer.tsx
  const WIDE = 0.15 // K20: every word must survive being drawn 15 % wider
  const R = (el) => el.getBoundingClientRect()
  const vis = (el) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden') return null
    const r = R(el)
    return r.width > 0 && r.height > 0 ? r : null
  }
  const all = (sel, root = document) => [...root.querySelectorAll(sel)].flatMap((el) => { const r = vis(el); return r ? [{ el, r }] : [] })
  const box = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h })
  const meet = (a, b, slack = 0) => a.left < b.right - slack && b.left < a.right - slack && a.top < b.bottom - slack && b.top < a.bottom - slack
  const felt = () => document.querySelector('[data-table]')
  const plates = () => [...document.querySelectorAll('[data-seat-plate]')]
  const seatZones = (seat) => all(`.byd-zone[data-area$=":${seat}"]`)
  const union = (rs) => ({ left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) })
  // A plate drawn 15 % wider grows away from where it is anchored: an east plate leftwards.
  const widen = (r, east) => { const g = r.width * WIDE; return east ? box(r.left - g, r.top, r.width + g, r.height) : box(r.left, r.top, r.width + g, r.height) }

  // Puts a plate's top-left at viewport (x, y): the plate lives in the felt's own pixels.
  const putAt = (p, x, y) => {
    const f = R(felt())
    const k = f.width / felt().offsetWidth
    p.style.left = `${(x - f.left) / k}px`
    p.style.top = `${(y - f.top) / k}px`
    p.style.transform = 'none'
  }

  const handSpan = (p) => [...p.querySelectorAll(':scope > span')].find((s) => /^\d+ kort( på hand)?$/.test(s.textContent))
  // C, the narrow form: the hand said as «5 kort» (the app already has the words,
  // `tv.seat.hand.short`), tighter padding, a side seat's lines still under its name.
  const narrow = (p) => {
    const hand = handSpan(p)
    if (hand) hand.textContent = hand.textContent.replace(' kort på hand', ' kort')
    p.dataset.form = 'narrow'
    p.style.gap = '0 10px'
    p.style.padding = '6px 12px 6px 6px'
    if (p.dataset.edge === 'E' || p.dataset.edge === 'W') {
      p.style.gap = '0'
      p.style.paddingBottom = '6px'
    }
  }
  // C2, the badge: the ball and the hand's count, «(D) 5».
  const badge = (p) => {
    const hand = handSpan(p)
    const name = p.querySelector(':scope > b')
    for (const n of [...name.childNodes]) if (n.nodeType === 3) n.remove()
    for (const s of [...p.querySelectorAll(':scope > span')]) if (s !== hand) s.remove()
    if (hand) { hand.textContent = hand.textContent.replace(/ kort( på hand)?$/, ''); hand.style.paddingLeft = '0'; hand.style.fontWeight = '700' }
    p.dataset.form = 'badge'
    p.style.flexDirection = 'row'
    p.style.alignItems = 'center'
    p.style.gap = '0 8px'
    p.style.padding = '4px 12px 4px 4px'
  }

  // K26's own place, as SeatPlate computes it, in viewport pixels.
  const home = (p) => {
    const z = union(seatZones(p.dataset.seatPlate).map((x) => x.r))
    const w = p.offsetWidth, h = p.offsetHeight
    const e = p.dataset.edge
    return e === 'N' ? { x: z.left, y: z.bottom + GAP } : e === 'S' ? { x: z.left, y: z.top - GAP - h } : e === 'W' ? { x: z.right + GAP, y: (z.top + z.bottom) / 2 - h / 2 } : { x: z.left - GAP - w, y: (z.top + z.bottom) / 2 - h / 2 }
  }

  // What a plate must stand clear of. `own` = the plate itself.
  const obstacles = (own) => {
    const seat = own.dataset.seatPlate
    const o = []
    for (const { el, r } of all('.byd-pile')) o.push({ k: 'hög', what: el.dataset.zone, r })
    for (const { el, r } of all('.byd-pile-n')) o.push({ k: 'bricka', what: el.textContent, r })
    for (const { el, r } of all('.byd-pile-name')) o.push({ k: 'högnamn', what: el.textContent, r })
    for (const { el, r } of all('.byd-pile-caption')) o.push({ k: 'bildtext', what: el.textContent, r })
    for (const { el, r } of all('.byd-zone')) o.push({ k: el.dataset.area.endsWith(`:${seat}`) ? 'egen zon' : 'zon', what: el.dataset.area, r })
    for (const { el, r } of all('.byd-zone > span')) o.push({ k: 'zonnamn', what: el.textContent, r })
    for (const { el, r } of all('[data-seat-plate]')) if (el !== own) o.push({ k: 'skylt', what: el.dataset.seatPlate, r })
    for (const { el, r } of all('.byd-hand-fan > i')) o.push({ k: 'hand', what: el.closest('.byd-hand').dataset.zone, r })
    for (const { el, r } of all('.byd-token')) o.push({ k: 'räknare', what: el.dataset.counterToken, r })
    for (const { el, r } of all('.byd-table-restart, .byd-shortcut-open, [data-tv] > aside')) o.push({ k: 'krom', what: el.className || el.tagName, r })
    return o
  }
  // Free of everything, on the felt, and still free when the plate is drawn 15 % wider.
  const clearAt = (p, r) => {
    const f = R(felt())
    const w = widen(r, p.dataset.edge === 'E')
    const onFelt = w.left >= f.left - 0.5 && w.right <= f.right + 0.5 && r.top >= f.top - 0.5 && r.bottom <= f.bottom + 0.5
    return onFelt && !obstacles(p).some((o) => meet(r, o.r, 0.5) || meet(w, o.r, 0.5))
  }

  // A: the plate obeys #685's order — own place, the zones' other end, a line further out, the
  // opposite side, the two ends — and the first place free of everything wins.
  const tryRule = (p) => {
    const z = union(seatZones(p.dataset.seatPlate).map((x) => x.r))
    const w = p.offsetWidth, h = p.offsetHeight, e = p.dataset.edge
    const line = 30
    const own = home(p)
    const c = [['egen plats', own]]
    if (e === 'N' || e === 'S') {
      const out = e === 'N' ? line : -line
      c.push(['andra änden', { x: z.right - w, y: own.y }])
      c.push(['en rad ut', { x: own.x, y: own.y + out }])
      c.push(['andra änden, en rad ut', { x: z.right - w, y: own.y + out }])
      c.push(['motsatt sida', { x: own.x, y: e === 'N' ? z.top - GAP - h : z.bottom + GAP }])
      // The two ends of the seat's row of zones, level with the row: rim side, middle, inner side.
      const ys = e === 'N' ? [z.top, (z.top + z.bottom) / 2 - h / 2, z.bottom - h] : [z.bottom - h, (z.top + z.bottom) / 2 - h / 2, z.top]
      for (const y of ys) c.push(['änden före', { x: z.left - GAP - w, y }])
      for (const y of ys) c.push(['änden efter', { x: z.right + GAP, y }])
    } else {
      const x = own.x
      c.push(['övre änden', { x, y: z.top }])
      c.push(['nedre änden', { x, y: z.bottom - h }])
      c.push(['en rad ut', { x: x + (e === 'W' ? line : -line), y: own.y }])
      c.push(['motsatt sida', { x: e === 'W' ? z.left - GAP - w : z.right + GAP, y: own.y }])
      c.push(['ovanför', { x: e === 'W' ? z.left : z.right - w, y: z.top - GAP - h }])
      c.push(['under', { x: e === 'W' ? z.left : z.right - w, y: z.bottom + GAP }])
    }
    for (const [tag, at] of c) if (clearAt(p, box(at.x, at.y, w, h))) { putAt(p, at.x, at.y); return tag }
    return null
  }

  // B: outside the felt, in the frame's band above or below it, one line. A seat at the top rim
  // stands in the band above, the bottom rim below, a side seat in the band nearest its own zones
  // (the other if that is full). Each plate takes the free x nearest its seat, in the row nearest
  // the felt that has one. Answers how deep each band must be; the driver then shrinks the felt.
  const need = { top: 0, bottom: 0 }
  const placeBand = (q) => {
    const f = R(felt())
    const fr = R(document.querySelector('.byd-table-frame'))
    const z = union(seatZones(q.dataset.seatPlate).map((x) => x.r))
    const w = q.offsetWidth, h = q.offsetHeight, e = q.dataset.edge
    const mid = (f.top + f.bottom) / 2
    const zc = (z.top + z.bottom) / 2
    const first = e === 'N' ? 'top' : e === 'S' ? 'bottom' : zc < mid - 1 || (Math.abs(zc - mid) <= 1 && e === 'W') ? 'top' : 'bottom'
    const bands = 'NS'.includes(e) ? [first] : [first, first === 'top' ? 'bottom' : 'top']
    const want = e === 'W' ? f.left : e === 'E' ? f.right - w : (z.left + z.right) / 2 - w / 2
    const xs = [want]
    for (let d = 4; d < fr.width; d += 4) xs.push(want - d, want + d)
    q.dataset.out = 'yes'
    const set = (x, y) => { q.style.left = `${x}px`; q.style.top = `${y}px`; q.style.transform = 'none' }
    for (let row = 0; row < 3; row++)
      for (const b of bands) {
        const y = b === 'top' ? f.top - 6 - h - row * (h + 6) : f.bottom + 6 + row * (h + 6)
        for (const x of xs) {
          if (x < fr.left + 4 || x + w * (1 + WIDE) > fr.right - 4) continue
          const r = box(x, y, w, h)
          const wr = widen(r, false)
          if (meet(r, f, 0.5)) continue
          if (obstacles(q).some((o) => o.k !== 'zon' && o.k !== 'egen zon' && (meet(r, o.r, 0.5) || meet(wr, o.r, 0.5)))) continue
          set(x, y)
          need[b] = Math.max(need[b], (row + 1) * (h + 6) + 6)
          return `band ${b === 'top' ? 'ovan' : 'nedan'}, rad ${row + 1}`
        }
      }
    set(want, f.bottom + 6)
    return null
  }
  const placeOutside = (ps, said) => {
    const layer = document.createElement('div')
    layer.id = 'p683-layer'
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50'
    document.body.append(layer)
    const order = [...ps].sort((a, b) => ('NS'.includes(a.dataset.edge) ? 0 : 1) - ('NS'.includes(b.dataset.edge) ? 0 : 1))
    for (const p of order) {
      const q = p.cloneNode(true)
      p.removeAttribute('data-seat-plate')
      p.style.display = 'none'
      q.style.cssText = p.style.cssText
      q.style.display = ''
      q.style.position = 'fixed'
      q.style.visibility = ''
      // Outside the felt every plate is one line.
      q.style.flexDirection = 'row'
      q.style.alignItems = 'center'
      q.style.gap = q.dataset.form === 'narrow' ? '0 10px' : '4px 12px'
      q.style.paddingBottom = '6px'
      q.querySelectorAll(':scope > span').forEach((s) => (s.style.paddingLeft = '0'))
      layer.append(q)
      said[q.dataset.seatPlate] = placeBand(q) ?? 'ingen fri plats i bandet'
    }
    const f = R(felt())
    const fr = R(document.querySelector('.byd-table-frame'))
    said._need = { top: Math.ceil(need.top), bottom: Math.ceil(need.bottom), haveTop: Math.floor(f.top - fr.top), haveBottom: Math.floor(fr.bottom - f.bottom) }
    return said
  }

  const place = (v) => {
    const said = {}
    const ps = plates()
    if (v === 'nu') return said
    if (v === 'c' || v === 'ac' || v === 'bc') ps.forEach(narrow)
    if (v === 'c2') ps.forEach(badge)
    if (v === 'c' || v === 'c2' || v === 'd') {
      for (const p of ps) { const at = home(p); putAt(p, at.x, at.y); said[p.dataset.seatPlate] = 'egen plats' }
      return said
    }
    if (v === 'a' || v === 'ac') {
      // Side seats first: they have the least room. Only the plates already placed count.
      const order = [...ps].sort((a, b) => ('EW'.includes(b.dataset.edge) ? 1 : 0) - ('EW'.includes(a.dataset.edge) ? 1 : 0))
      for (const p of ps) { const at = home(p); putAt(p, at.x, at.y); p.style.visibility = 'hidden' }
      for (const p of order) {
        p.style.visibility = ''
        let tag = tryRule(p)
        if (tag === null && v === 'ac') {
          // The last step before standing on something: the plate as its badge.
          badge(p)
          tag = tryRule(p)
          if (tag !== null) tag = `bricka, ${tag}`
        }
        if (tag === null) { const at = home(p); putAt(p, at.x, at.y); tag = 'ingen fri plats' }
        said[p.dataset.seatPlate] = tag
      }
      return said
    }
    if (v === 'b' || v === 'bc') return placeOutside(ps, said)
    return said
  }

  // The one reading, for every variant.
  const measure = () => {
    const out = { over: [], inZone: [], ownZone: [], onPlate: [], onZoneName: [], onHand: [], onChrome: [], offFrame: [], cut: [], wide: { over: 0, inZone: 0, onPlate: 0, onZoneName: 0 }, smallest: null, card: null, plates: [] }
    const fr = R(document.querySelector('.byd-table-frame'))
    let smallest = Infinity
    for (const p of document.querySelectorAll('[data-seat-plate]')) {
      const r = vis(p)
      if (!r) continue
      const seat = p.dataset.seatPlate
      out.plates.push({ seat, edge: p.dataset.edge, r: [r.left, r.top, r.right, r.bottom].map(Math.round), text: p.innerText.replace(/\n/g, ' / ') })
      const wide = widen(r, p.dataset.edge === 'E' && p.dataset.out !== 'yes')
      const seen = new Set()
      for (const o of obstacles(p)) {
        const hit = meet(r, o.r, 0.5)
        const hitW = meet(wide, o.r, 0.5)
        const key = `${seat} × ${o.k} ${o.what}`
        if (seen.has(key)) continue
        seen.add(key)
        if (['hög', 'bricka', 'högnamn', 'bildtext'].includes(o.k)) { if (hit) out.over.push(key); if (hitW) out.wide.over++ }
        else if (o.k === 'zon') { if (hit) out.inZone.push(key); if (hitW) out.wide.inZone++ }
        else if (o.k === 'egen zon') { if (hit) out.ownZone.push(key) }
        else if (o.k === 'skylt') { if (hit && seat < o.what) out.onPlate.push(key); if (hitW) out.wide.onPlate++ }
        else if (o.k === 'zonnamn') { if (hit) out.onZoneName.push(key); if (hitW) out.wide.onZoneName++ }
        else if (o.k === 'hand') { if (hit) out.onHand.push(key) }
        else if (o.k === 'krom') { if (hit) out.onChrome.push(key) }
      }
      if (r.left < fr.left - 0.5 || r.right > fr.right + 0.5 || r.top < 0 || r.bottom > innerHeight + 0.5) out.offFrame.push(seat)
      for (const el of [p, ...p.querySelectorAll('*')]) if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.cut.push(`${seat}: ${el.textContent}`)
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim()) smallest = Math.min(smallest, parseFloat(getComputedStyle(n.parentElement).fontSize))
    }
    out.smallest = smallest === Infinity ? null : smallest
    const card = document.querySelector('.byd-card[data-component]')
    if (card) { const c = R(card); out.card = Math.round(Math.min(c.width, c.height)) }
    const f = R(felt())
    out.scale = Math.round((f.width / felt().offsetWidth) * 1000) / 1000
    out.feltPx = [f.left, f.top, f.right, f.bottom].map(Math.round)
    return out
  }
  return { place, measure }
})()
