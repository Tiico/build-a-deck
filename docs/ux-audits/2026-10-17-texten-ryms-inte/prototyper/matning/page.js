// Injected into the real built app by shoot.mjs, once per variant and surface (#808). Nothing here
// is the product, and nothing here draws a card: the card is the compiler's and `fitInDocument`'s,
// as it always is (E2). A variant reads where the text box is and how much of its text the box
// cuts off — out of the DOM the app already drew — and draws its mark *over* the card, in a layer of
// its own, or puts a sentence beside it. React's own nodes are never removed.
;(() => {
  // What the box is called where the designer meets it: the column the guide calls «Regeltext».
  const LABEL = { body: 'Regeltext', title: 'Titel' }
  const WARN = '#f0b64a'
  const DARK = '#1b1d23'
  const CHROME = '#23262e'
  const INK = '#e6ecfa'
  const surface = () => (document.querySelector('#wizard-live') ? 'guide' : document.querySelector('#canvas') ? 'mall' : 'vagg')

  // The line boxes of an element's text, in viewport pixels. A clipped line is still laid out, so
  // the lines the box cuts off are here too.
  function rows(el) {
    const range = document.createRange()
    range.selectNodeContents(el)
    const out = []
    for (const r of range.getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue
      const row = out.find((x) => Math.abs(x.top - r.top) < 1.5)
      if (row) {
        row.bottom = Math.max(row.bottom, r.bottom)
        row.left = Math.min(row.left, r.left)
        row.right = Math.max(row.right, r.right)
      } else out.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })
    }
    return out.sort((a, b) => a.top - b.top)
  }
  const rect = (r) => ({ x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top })

  // Every text box on every card on the page that the fitting left too small: E6 shrank it to its
  // floor and it still does not hold.
  function cut() {
    const out = []
    for (const root of document.querySelectorAll('.byd-preview')) {
      if (!root.id || root.id.startsWith('byd-back-')) continue
      for (const el of root.querySelectorAll('[data-element][data-fit]')) {
        if (!(el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5)) continue
        const box = el.getBoundingClientRect()
        const lines = rows(el)
        const whole = lines.filter((l) => l.bottom <= box.bottom + 0.5)
        const hidden = lines.length - whole.length
        const lineH = lines.length > 1 ? (lines[lines.length - 1].top - lines[0].top) / (lines.length - 1) : box.height
        out.push({ root, el, element: el.dataset.element, label: LABEL[el.dataset.element] ?? el.dataset.element, minPt: Number(el.dataset.minPt), box, lines, whole, hidden, lineH })
      }
    }
    return out
  }
  // Every whole, visible line of every text on the cards the marks stand on: what a mark must never
  // cover.
  function readable(roots) {
    const out = []
    for (const root of roots)
      for (const el of root.querySelectorAll('[data-element][data-fit]')) {
        const box = el.getBoundingClientRect()
        for (const l of rows(el)) if (l.bottom <= box.bottom + 0.5 && l.top >= box.top - 0.5) out.push(rect(l))
      }
    return out
  }
  const words = (c, long) => {
    const n = c.hidden
    const rader = `${n} ${n === 1 ? 'rad' : 'rader'}`
    const pt = String(c.minPt).replace('.', ',')
    return {
      long: `«${c.label}» ryms inte ens i ${pt} pt: ${rader} syns inte på kortet.`,
      tagLong: `Ryms inte · ${rader} till`,
      tagShort: `+${rader}`,
      guide: `«${c.label}» ryms inte ens i ${pt} pt, så ${rader} syns inte på kortet. Korta texten, eller gör rutan större i editorn.`,
      wall: `«${c.label}» ryms inte`,
      foot: `▲ «${c.label}» ryms inte ens i ${pt} pt · ${rader} syns inte`,
      long2: long,
    }
  }

  const STYLE = `
    .p808-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; }
    /* On the wall the marks stand in the card's tile, under the tile's own badges. */
    .p808-layer[data-inside] { position: absolute; z-index: 1; }
    .byd-wall-card:has(> .p808-layer) > :is(.byd-wall-copies, .byd-wall-warnings) { z-index: 2; }
    .p808-layer > * { position: absolute; box-sizing: border-box; }
    /* A — the edge and the tag: the box framed in two bands, amber over a dark ring so it reads on a
       light card as on a dark one, and a dark tag hanging under its bottom edge. */
    .p808-a-frame { border: 2px dashed ${WARN}; box-shadow: 0 0 0 1px ${DARK}, inset 0 0 0 1px ${DARK}; border-radius: 2px; }
    .p808-tag { display: flex; align-items: center; gap: 4px; padding: 0 7px; height: 18px; border-radius: 999px; background: ${CHROME}; border: 1px solid ${WARN}; color: ${INK}; font: 600 11px/16px system-ui, sans-serif; white-space: nowrap; }
    .p808-tag > i { font-style: normal; color: ${WARN}; font-size: 9px; }
    /* B — the fade at the bottom: the last line runs out into amber, the cut edge is a double rule,
       and the count stands under the rule's right end. */
    .p808-b-veil { background: linear-gradient(to bottom, rgba(240, 182, 74, 0) 0%, rgba(240, 182, 74, 0.5) 70%, rgba(240, 182, 74, 0.7) 100%); }
    .p808-b-rule { height: 3px; background: linear-gradient(to bottom, ${WARN} 0 2px, ${DARK} 2px 3px); }
    /* D — the port: InDesign's overset mark, a small square with a plus at the box's lower right
       corner, and nothing else on the card. */
    .p808-d-port { display: grid; place-items: center; border-radius: 2px; background: ${DARK}; border: 1.5px solid ${WARN}; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7); color: ${WARN}; font: 800 12px/1 system-ui, sans-serif; }
    /* C — a sentence beside the card, and nothing on it. */
    .byd-wizard .p808-c-guide { margin: 10px 4px 0 !important; max-width: 300px; color: #6b3d00 !important; font: 600 12px/1.45 system-ui, sans-serif !important; text-align: left; letter-spacing: 0 !important; text-transform: none !important; }
    .byd-wizard .p808-c-guide::before { content: '▲ '; color: #b0570a; }
    .p808-c-wall { margin: 8px 0 0; max-width: var(--byd-wall-card, 150px); color: ${WARN}; font: 600 12px/1.35 system-ui, sans-serif; }
    .p808-c-wall::before { content: '▲ '; }
    .p808-c-strip { margin: 0; padding: 8px 12px; border-top: 1px solid #6b5a2c; background: #2a2419; color: ${WARN}; font: 600 12px/1.35 system-ui, sans-serif; }
  `

  let placed = null
  function clear() {
    document.querySelectorAll('.p808-layer').forEach((n) => n.remove())
    document.querySelectorAll('[data-p808]').forEach((n) => n.remove())
    document.querySelectorAll('[data-p808-held]').forEach((n) => {
      n.style.bottom = ''
      n.style.top = ''
      delete n.dataset.p808Held
    })
    document.querySelectorAll('[data-p808-label]').forEach((n) => {
      n.setAttribute('aria-label', n.dataset.p808Label)
      delete n.dataset.p808Label
    })
    placed = null
  }

  function place(v) {
    clear()
    if (!document.getElementById('p808-style')) {
      const s = document.createElement('style')
      s.id = 'p808-style'
      s.textContent = STYLE
      document.head.append(s)
    }
    const found = cut()
    const page = document.createElement('div')
    page.className = 'p808-layer'
    document.body.append(page)
    let layer = page
    let ox = 0
    let oy = 0
    const marks = []
    const add = (cls, r, text, said) => {
      const d = document.createElement('div')
      d.className = cls
      Object.assign(d.style, { left: `${r.x - ox}px`, top: `${r.y - oy}px`, ...(r.w !== undefined ? { width: `${r.w}px` } : {}), ...(r.h !== undefined ? { height: `${r.h}px` } : {}) })
      if (text) d.innerHTML = text
      if (said) {
        d.setAttribute('role', 'img')
        d.setAttribute('aria-label', said)
        d.title = said
      }
      layer.append(d)
      marks.push(d)
      return d
    }
    const s = surface()
    for (const c of found) {
      const b = c.box
      const w = words(c)
      const small = b.width < 160
      const tile = c.root.closest('.byd-wall-card')
      if (tile) {
        layer = document.createElement('div')
        layer.className = 'p808-layer'
        layer.dataset.inside = ''
        tile.querySelector('.byd-wall-face').after(layer)
        const t = tile.getBoundingClientRect()
        ox = t.left
        oy = t.top
      } else {
        layer = page
        ox = 0
        oy = 0
      }
      const left = (el, x) => (el.style.left = `${x - ox}px`)
      // The card's own accessible name says it too, in every variant: the mark is for the eye.
      const named = c.root.closest('[role="img"], [role="option"]')
      if (v !== 'nu' && named && !named.dataset.p808Label) {
        named.dataset.p808Label = named.getAttribute('aria-label') ?? ''
        named.setAttribute('aria-label', `${named.dataset.p808Label ? named.dataset.p808Label + '. ' : ''}${w.long}`)
      }
      if (v === 'a') {
        add('p808-a-frame', { x: b.left - 4, y: b.top - 4, w: b.width + 8, h: b.height + 8 })
        const text = `<i>▲</i>${small ? w.tagShort : w.tagLong}`
        const tag = add('p808-tag', { x: 0, y: b.bottom + 5, w: undefined }, text, w.long)
        tag.style.width = 'max-content'
        const tw = tag.getBoundingClientRect().width
        left(tag, b.left + b.width / 2 - tw / 2)
      }
      if (v === 'b') {
        const last = c.whole[c.whole.length - 1]
        const sliver = last ? b.bottom - last.bottom : b.height
        const h = Math.max(sliver, 0.6 * c.lineH)
        add('p808-b-veil', { x: b.left, y: b.bottom - h, w: b.width, h })
        add('p808-b-rule', { x: b.left - 2, y: b.bottom - 1, w: b.width + 4, h: 3 })
        const tag = add('p808-tag', { x: 0, y: b.bottom + 3, w: undefined }, `<i>▼</i>${w.tagShort}`, w.long)
        tag.style.width = 'max-content'
        const tw = tag.getBoundingClientRect().width
        // At the rule's left end: the right-hand corner under a card on the wall is the copies badge's.
        left(tag, b.left - 2)
      }
      if (v === 'd') {
        const size = small ? 12 : 14
        const port = add('p808-d-port', { x: b.right - 2, y: b.bottom - 2, w: size, h: size }, '+', w.long)
        // Where the corner is the copies badge's (a card on the wall with ×2), the port steps inside
        // the box's corner rather than under the badge.
        const badge = tile?.querySelector('.byd-wall-copies')?.getBoundingClientRect()
        const k = port.getBoundingClientRect()
        if (badge && k.left < badge.right && k.right > badge.left && k.top < badge.bottom && k.bottom > badge.top) {
          left(port, b.right - size)
          port.style.top = `${b.bottom - size + 1 - oy}px`
        }
      }
      if (v === 'c') {
        const p = document.createElement('p')
        p.dataset.p808 = ''
        if (s === 'guide') {
          p.className = 'p808-c-guide'
          p.textContent = w.guide
          c.root.closest('[role="img"]').after(p)
        } else if (s === 'vagg') {
          p.className = 'p808-c-wall'
          p.textContent = w.wall
          p.title = w.long
          const face = c.root.closest('.byd-wall-face')
          face.after(p)
          // The copies badge hangs off the tile's lower corner, and the tile now ends under the
          // sentence: it is held at the card's corner, where it was.
          const copies = face.parentElement.querySelector('.byd-wall-copies')
          if (copies) {
            copies.dataset.p808Held = ''
            copies.style.bottom = 'auto'
            copies.style.top = `${face.offsetHeight - 10}px`
          }
        } else {
          // A row of its own under the stage, where the canvas already says why a locked layer did
          // not move (L15) — in flow and not over the foot, because it stands for as long as the
          // text is too long rather than for a moment.
          p.className = 'p808-c-strip'
          p.textContent = w.foot
          p.title = w.long
          document.querySelector('.byd-canvas-room').after(p)
        }
        marks.push(p)
      }
    }
    placed = { v, s, found, marks }
    return found.length
  }

  function measure() {
    if (!placed) return null
    const { found, marks } = placed
    const roots = [...new Set(found.map((c) => c.root))]
    return {
      surface: placed.s,
      v: placed.v,
      cut: found.map((c) => ({ element: c.element, label: c.label, minPt: c.minPt, sizePx: Number.parseFloat(getComputedStyle(c.el).fontSize), box: rect(c.box), lines: c.lines.length, whole: c.whole.length, hidden: c.hidden, lineH: c.lineH, card: rect(c.root.getBoundingClientRect()) })),
      marks: marks.map((m) => {
        const r = m.getBoundingClientRect()
        const cs = getComputedStyle(m)
        return { cls: m.className, rect: rect(r), text: m.textContent, color: cs.color, clipped: m.scrollWidth > m.clientWidth + 0.5, inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, said: m.getAttribute('aria-label') ?? m.title ?? '' }
      }),
      readable: readable(roots),
      // The app's own marks a variant's mark must not land on: the wall's badges, the canvas' tags.
      collide: [...document.querySelectorAll('.byd-wall-copies, .byd-wall-warnings, .byd-placeholder-tag, .byd-condition-tab, .byd-wizard-preview > span')].flatMap((o) => {
        const r = o.getBoundingClientRect()
        return marks.filter((m) => { const k = m.getBoundingClientRect(); return k.left < r.right && k.right > r.left && k.top < r.bottom && k.bottom > r.top }).map(() => o.className || o.tagName)
      }),
      named: roots.map((r) => r.closest('[role="img"], [role="option"]')?.getAttribute('aria-label') ?? ''),
      viewport: { w: innerWidth, h: innerHeight },
    }
  }
  const layer = (on) => {
    document.querySelectorAll('.p808-layer').forEach((l) => (l.style.display = on ? '' : 'none'))
  }
  window.__p808 = { place, measure, clear, layer, cut: () => cut().map((c) => ({ element: c.element, hidden: c.hidden })) }
})()
