(variant) => {
  const felt = document.querySelector('[data-table]')
  const frame = felt.closest('.byd-table-frame')
  const rot = Number(felt.dataset.rotate || 0)
  const W = felt.offsetWidth, H = felt.offsetHeight
  const a = (rot * Math.PI) / 180
  // Felt px → the reader's frame (felt px, turned as the reader sees it, about the felt's centre).
  const toR = (x, y) => {
    const dx = x - W / 2, dy = y - H / 2
    return { x: Math.round((dx * Math.cos(a) - dy * Math.sin(a)) * 100) / 100, y: Math.round((dx * Math.sin(a) + dy * Math.cos(a)) * 100) / 100 }
  }
  const boxR = (x, y, w, h) => {
    const ps = [toR(x, y), toR(x + w, y), toR(x, y + h), toR(x + w, y + h)]
    return { l: Math.min(...ps.map((p) => p.x)), t: Math.min(...ps.map((p) => p.y)), r: Math.max(...ps.map((p) => p.x)), b: Math.max(...ps.map((p) => p.y)) }
  }
  const seen = (el) => {
    if (!el) return null
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return null
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? r : null
  }
  const hits = (p, q) => p.left < q.right - 0.5 && q.left < p.right - 0.5 && p.top < q.bottom - 0.5 && q.top < p.bottom - 0.5
  const zones = [...felt.querySelectorAll(':scope > .byd-zone')]
  const labels = zones.map((z) => ({ z, el: z.querySelector(':scope > span') })).filter((l) => l.el && seen(l.el))
  const tight = frame?.hasAttribute('data-tight') ?? false

  // Undo whatever the last variant did.
  for (const { el } of labels) {
    if (el.dataset.protoStyle === undefined) el.dataset.protoStyle = el.getAttribute('style') ?? ''
    el.setAttribute('style', el.dataset.protoStyle)
    el.removeAttribute('data-proto')
  }
  document.querySelector('#proto-685-style')?.remove()

  // Where a label is, in the reader's frame, and how to put its top-left corner at `T`.
  const anchorOf = (l) => toR(l.z.offsetLeft + l.el.offsetLeft, l.z.offsetTop + l.el.offsetTop)
  const zoneR = (z) => boxR(z.offsetLeft, z.offsetTop, z.offsetWidth, z.offsetHeight)
  const nowAt = (l) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(l.el).transform === 'none' ? undefined : getComputedStyle(l.el).transform)
    const A = anchorOf(l)
    return { x: A.x + m.e, y: A.y + m.f }
  }
  const putAt = (l, T) => {
    const A = anchorOf(l)
    l.el.style.transform = `translate(${T.x - A.x}px, ${T.y - A.y}px)`
  }
  const others = (l) => zones.filter((z) => z !== l.z)
  const screenHitsZone = (l) => {
    const r = l.el.getBoundingClientRect()
    return others(l).some((z) => hits(r, z.getBoundingClientRect()))
  }
  const badgeSel = '.byd-pile-n, .byd-hand-count, .byd-area-count, .byd-token, .byd-pile-name, .byd-seat-name, .byd-hand-card, .byd-seat-plate, .byd-pile'
  const screenHitsAny = (l) => {
    const r = l.el.getBoundingClientRect()
    if (others(l).some((z) => hits(r, z.getBoundingClientRect()))) return true
    for (const el of document.querySelectorAll(badgeSel)) {
      const q = seen(el)
      if (q && hits(r, q)) return true
    }
    for (const o of labels) if (o !== l && hits(r, o.el.getBoundingClientRect())) return true
    const f = felt.getBoundingClientRect()
    return r.left < f.left - 1 || r.right > f.right + 1 || r.top < f.top - 1 || r.bottom > f.bottom + 1
  }

  const OFF = 6
  const place = () => {
    const V = globalThis.PROTO_685_VARIANTS?.[variant]
    if (V) V({ labels, tight, rot, zoneR, nowAt, putAt, screenHitsZone, screenHitsAny, OFF, frame, felt })
  }
  place()

  const read = () => {
    const inZone = [], pairs = [], badges = [], cut = [], outside = [], overPile = [], overHand = [], underCard = []
    let smallest = Infinity
    const f = felt.getBoundingClientRect()
    for (const l of labels) {
      const r = l.el.getBoundingClientRect()
      const text = (l.el.textContent || '').trim()
      smallest = Math.min(smallest, parseFloat(getComputedStyle(l.el).fontSize))
      if (l.el.scrollWidth > l.el.clientWidth + 1 || text.includes('…')) cut.push(text)
      for (const z of others(l)) if (hits(r, z.getBoundingClientRect())) inZone.push(`${text} i ${(z.querySelector(':scope > span')?.textContent || z.dataset.area || '').trim()}`)
      for (const o of labels) if (o !== l && o.z !== l.z && labels.indexOf(o) > labels.indexOf(l) && hits(r, o.el.getBoundingClientRect())) pairs.push(`${text} × ${(o.el.textContent || '').trim()}`)
      for (const el of document.querySelectorAll('.byd-pile-name, .byd-seat-name')) {
        const q = seen(el)
        if (q && hits(r, q)) pairs.push(`${text} × ${(el.textContent || '').trim()}`)
      }
      for (const el of document.querySelectorAll('.byd-pile-n, .byd-hand-count, .byd-area-count, .byd-token')) {
        const q = seen(el)
        if (q && hits(r, q)) badges.push(`${text} × ${el.className.split(' ')[0]}${(el.textContent || '').trim() ? ' ' + (el.textContent || '').trim() : ''}`)
      }
      for (const el of document.querySelectorAll('.byd-pile')) {
        const q = seen(el)
        if (q && hits(r, q)) overPile.push(`${text} × ${(el.getAttribute('aria-label') || el.dataset.pile || 'hög').slice(0, 24)}`)
      }
      for (const el of document.querySelectorAll('.byd-hand-card, .byd-seat-plate')) {
        const q = seen(el)
        if (q && hits(r, q)) { overHand.push(text); break }
      }
      for (const el of document.querySelectorAll('.byd-card')) {
        const q = seen(el)
        if (q && !el.closest('.byd-hand') && hits(r, q)) { underCard.push(text); break }
      }
      if (r.left < f.left - 1 || r.right > f.right + 1 || r.top < f.top - 1 || r.bottom > f.bottom + 1) outside.push(text)
    }
    return { inZone, pairs, badges, overPile, overHand, underCard, cut, outside, smallest: Number.isFinite(smallest) ? smallest : 0, names: labels.length }
  }
  const at = read()
  // The same reading with every name drawn 15 % wider (K20's margin), laid out again by the variant.
  const base = labels.map((l) => {
    const range = document.createRange()
    range.selectNodeContents(l.el)
    const ls = getComputedStyle(l.el).letterSpacing
    return { l, ls: ls === 'normal' ? 0 : parseFloat(ls) || 0, w: range.getBoundingClientRect().width / (l.el.getBoundingClientRect().width / l.el.offsetWidth || 1), n: Math.max(1, (l.el.textContent || '').trim().length) }
  })
  for (const b of base) b.l.el.style.letterSpacing = b.ls + (0.15 * b.w) / b.n + 'px'
  for (const { el } of labels) el.style.transform = ''
  for (const { el } of labels) { const keep = el.style.letterSpacing; el.setAttribute('style', el.dataset.protoStyle); el.style.letterSpacing = keep }
  place()
  const wide = read()
  for (const { el } of labels) { el.setAttribute('style', el.dataset.protoStyle) }
  place()
  const sides = {}
  for (const l of labels) {
    const r = l.el.getBoundingClientRect(), z = l.z.getBoundingClientRect()
    sides[(l.el.textContent || '').trim()] = r.bottom <= z.top + 1 ? 'över' : r.top >= z.bottom - 1 ? 'under' : r.right <= z.left + 1 ? 'vänster' : r.left >= z.right - 1 ? 'höger' : 'inuti'
  }
  return { ...at, sides, wide: { inZone: wide.inZone.length, pairs: wide.pairs.length, badges: wide.badges.length, cut: wide.cut.length, outside: wide.outside.length }, tight, rot, scale: (() => { const m = felt.querySelector(':scope > .byd-zone[data-area="market"]'); return m ? Math.round(Math.max(m.offsetWidth, m.offsetHeight) / 520 * 1000) / 1000 : 0 })() }
}
