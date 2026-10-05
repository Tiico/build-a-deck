// Page-side half of the #789 prototype: the one reading every variant is measured by.
// Evaluated as a string in the page; defines window.__p789.measure().
//
// For every pile whose top card shows a name (the state's <b> on the card, or the caption under
// the pile), it reports the name's element, size, how much of the word is drawn, what else on
// the felt its box meets, and the declared colours it stands on.
window.__p789 = (() => {
  const R = (el) => el.getBoundingClientRect()
  const vis = (el) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return null
    const r = R(el)
    return r.width > 0 && r.height > 0 ? r : null
  }
  const all = (sel) => [...document.querySelectorAll(sel)].flatMap((el) => { const r = vis(el); return r ? [{ el, r }] : [] })
  const meet = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  const rect = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })
  const gap = (a, b) => Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right), Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))

  // How many characters of the word are drawn before the ellipsis, measured with the element's own
  // font in a canvas — the box is fixed, so this is what a reader actually sees.
  const canvas = document.createElement('canvas').getContext('2d')
  const drawn = (el, word) => {
    const s = getComputedStyle(el)
    canvas.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
    const room = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
    if (canvas.measureText(word).width <= room + 0.5) return { shown: word, whole: true, wordPx: Math.round(canvas.measureText(word).width), room: Math.round(room) }
    const dots = canvas.measureText('…').width
    let n = word.length
    while (n > 0 && canvas.measureText(word.slice(0, n)).width + dots > room) n--
    return { shown: word.slice(0, n).trimEnd() + '…', whole: false, wordPx: Math.round(canvas.measureText(word).width), room: Math.round(room) }
  }

  // Everything else the felt writes or lays down that a pile's name must not cover (K19's labels
  // and `freeSide.ts`'s WORDS, plus every card).
  const others = () => [
    ...all('.byd-zone > span').map((o) => ({ ...o, what: 'zonnamn ' + o.el.textContent })),
    ...all('.byd-seat-name, .byd-seat-plate').map((o) => ({ ...o, what: 'namnkort ' + o.el.textContent })),
    ...all('.byd-pile-count').map((o) => ({ ...o, what: 'handtag ' + o.el.closest('.byd-pile').dataset.zone })),
    ...all('.byd-hand-count, .byd-area-count').map((o) => ({ ...o, what: 'antal ' + o.el.textContent })),
    ...all('.byd-pile-top, .byd-pile-bottom').map((o) => ({ ...o, what: 'kort på hög ' + o.el.closest('.byd-pile').dataset.zone })),
    ...all('.byd-card').map((o) => ({ ...o, what: 'kort ' + (o.el.getAttribute('aria-label') ?? '') })),
    ...all('.byd-token').map((o) => ({ ...o, what: 'mark' })),
    ...all('.byd-pile-caption').map((o) => ({ ...o, what: 'bildtext ' + o.el.closest('.byd-pile').dataset.zone })),
  ]

  const measure = () => {
    const felt = document.querySelector('[data-table]')
    const frame = R(felt.closest('.byd-table-frame') ?? felt)
    const piles = [...document.querySelectorAll('.byd-pile')]
    const out = []
    const lab = others()
    for (const pile of piles) {
      const zone = pile.dataset.zone
      const onCard = pile.querySelector(':scope > .byd-pile-top > .byd-texture-state > b')
      const caption = pile.querySelector('.byd-pile-caption')
      const state = pile.querySelector(':scope > .byd-pile-top > .byd-texture-state')?.dataset.texture ?? (pile.querySelector(':scope > .byd-pile-top > img') ? 'ready' : null)
      const card = R(pile.querySelector(':scope > .byd-pile-top'))
      const el = [onCard, caption].find((e) => e && vis(e))
      const row = { zone, state, card: { w: Math.round(card.width), h: Math.round(card.height) }, where: null }
      if (el) {
        const r = vis(el)
        const word = caption?.textContent || onCard?.textContent || ''
        const s = getComputedStyle(el)
        const meets = lab.filter((o) => o.el !== el && !o.el.contains(el) && !el.contains(o.el) && meet(r, o.r))
          // The name on the card lies on its own card by definition; that is not a collision.
          .filter((o) => !(el === onCard && o.el === pile.querySelector(':scope > .byd-pile-top')))
          .map((o) => o.what)
        const nearest = lab.filter((o) => !o.el.contains(el) && o.el !== el && !(el === onCard && o.el.closest('.byd-pile') === pile))
          .map((o) => ({ what: o.what, px: Math.round(gap(r, o.r) * 10) / 10 }))
          .filter((o) => !(el === caption && o.what === 'handtag ' + zone))
          .sort((a, b) => a.px - b.px)[0]
        Object.assign(row, {
          where: el === onCard ? 'kort' : 'bildtext',
          word,
          px: parseFloat(s.fontSize),
          ink: s.color,
          ground: getComputedStyle(el === onCard ? el.parentElement : el).backgroundColor,
          box: rect(r),
          ...drawn(el, word),
          meets,
          nearest,
          onScreen: r.left >= frame.left - 0.5 && r.right <= frame.right + 0.5 && r.top >= frame.top - 0.5 && r.bottom <= frame.bottom + 0.5,
        })
      }
      out.push(row)
    }
    // A name of a card on the felt that is drawn anywhere at all — for the «gone once the picture
    // is there» reading.
    const anyName = all('.byd-pile-top > .byd-texture-state > b, .byd-pile-caption').map((o) => o.el.textContent)
    return { piles: out, anyName, viewport: [innerWidth, innerHeight] }
  }
  return { measure }
})()
