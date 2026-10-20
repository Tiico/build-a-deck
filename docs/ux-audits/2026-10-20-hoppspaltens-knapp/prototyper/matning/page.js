// PROTOTYP — kastas (#1019). Körs i den byggda editorns Kortvägg av shoot.mjs. Lägger varje variant
// ovanpå den riktiga kronan (samma knapp, samma stilmall, samma container-regel vid 1248 px) och
// mäter sedan raden och kontrollen.
//
//   window.__p1019.wide()               kronans text i Verdana (DejaVus bredd), som på CI:s Linux
//   window.__p1019.place('nu'|'a'|'b'|'c'|'d', 'sv'|'en')
//   window.__p1019.measure()
;(() => {
  const fold = () => document.querySelector('.byd-wall-view .byd-crown-fold')
  const crown = () => document.querySelector('.byd-wall-view .byd-crown')
  const style = (css) => {
    const s = document.createElement('style')
    s.setAttribute('data-p1019', '')
    s.textContent = css
    document.head.append(s)
  }
  // The crown's narrow rule, said once: the same container query the app's own short boxes answer.
  const narrow = (css) => style(`@media (min-width: 1024px) { @container byd-wall-crown (width < 1248px) { ${css} } }`)
  const WORDS = {
    sv: { in: 'Fäll ihop', out: 'Fäll ut', foldIn: 'Fäll ihop hoppspalten', foldOut: 'Fäll ut hoppspalten' },
    en: { in: 'Fold', out: 'Unfold', foldIn: 'Fold the jump column', foldOut: 'Unfold the jump column' },
  }
  // B's icon, in the editor's own glyph language (glyphs.tsx: a 16 px box, 1.6 stroke, round caps
  // and joins, drawn at 20 px in the ink of the box): a panel with its column, and the chevron
  // pointing the way the column will go.
  const icon = (open) => `<svg class="p1019-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.75" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 3.5h3v9h-3z" fill="currentColor" opacity="0.45"/><path d="M5.5 2.75v10.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="${open ? 'M11 5.75 8.75 8 11 10.25' : 'M8.75 5.75 11 8l-2.25 2.25'}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  let variant = 'nu'
  let lang = 'sv'
  const open = () => fold()?.getAttribute('aria-expanded') === 'true'

  // C's two buttons: the column's own fold, in its head and at the top of its strip, drawn as the AI
  // panel's own ⟩ is drawn (.byd-ai-close) — the same control, mirrored, on the other side of the
  // wall. They press the real crown button, which is hidden, so the state stays the app's.
  const placeC = () => {
    const w = WORDS[lang]
    const jump = document.querySelector('.byd-wall-jump')
    const rail = document.querySelector('.byd-wall-rail')
    document.querySelectorAll('.p1019-colfold').forEach((el) => el.remove())
    const make = (isOpen) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'p1019-colfold'
      b.setAttribute('aria-label', isOpen ? w.foldIn : w.foldOut)
      b.setAttribute('title', isOpen ? w.foldIn : w.foldOut)
      b.setAttribute('aria-expanded', String(isOpen))
      b.setAttribute('aria-controls', (jump ?? rail)?.id ?? '')
      b.innerHTML = `<span aria-hidden="true">${isOpen ? '⟨' : '⟩'}</span>`
      b.onclick = () => { fold().click(); setTimeout(placeC, 50) }
      return b
    }
    if (jump) jump.querySelector('h2').append(make(true))
    if (rail) rail.prepend(make(false))
  }

  window.__p1019 = {
    wide() {
      style(".byd-wall-crown * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }")
    },
    place(v, l) {
      variant = v
      lang = l
      const f = fold()
      const w = WORDS[lang]
      if (v === 'a') {
        // A: a word stays, as every other box keeps one, and the button is drawn as the boxes are.
        const s = document.createElement('span')
        s.className = 'p1019-short'
        s.textContent = open() ? w.in : w.out
        f.append(s)
        style(`html .byd-crown-fold { font-weight: 700; } html .byd-crown-fold > span[aria-hidden='true'] { color: #dce3f2; } html .byd-crown-fold > .p1019-short { display: none; }`)
        narrow(`html .byd-crown-fold > .p1019-short { display: inline; }`)
      }
      if (v === 'b') {
        f.querySelector("span[aria-hidden='true']").outerHTML = icon(open())
        style(`html .byd-crown-fold { font-weight: 700; } html .byd-crown-fold > .p1019-icon { flex: none; width: 20px; height: 20px; color: #dce3f2; }`)
        narrow(`html .byd-crown-fold { justify-content: center; box-sizing: border-box; min-width: var(--byd-tap); padding: 0; }`)
      }
      if (v === 'c') {
        style(`html .byd-wall-view .byd-crown-fold { display: none; }
          html .byd-wall-jump h2 { display: flex; align-items: center; justify-content: space-between; padding: var(--byd-s1) var(--byd-s1) 0 var(--byd-s3); }
          html .byd-wall-view button.p1019-colfold { flex: none; display: inline-grid; place-items: center; width: var(--byd-tap); height: var(--byd-tap); padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--byd-editor-home-ink); font: inherit; font-size: 18px; letter-spacing: 0; text-transform: none; cursor: pointer; }
          html .byd-wall-view button.p1019-colfold:hover { background: #1b1d23; color: #fff; }
          html .byd-wall-view .byd-wall-rail > button.p1019-colfold { flex: none; min-height: var(--byd-tap); align-self: center; margin: 0 0 var(--byd-s1); font-weight: 400; }`)
        placeC()
      }
      if (v === 'd') {
        // D: the same glyph, made visible — full ink, 18 px like the AI panel's ⟩, and the line the
        // secondary role uses, which is held to 3:1 against the crown.
        style(`html .byd-crown-fold { border-color: var(--byd-secondary-line); } html .byd-crown-fold > span[aria-hidden='true'] { color: #dce3f2; font-size: 18px; font-weight: 400; line-height: 1; }`)
        narrow(`html .byd-crown-fold { justify-content: center; box-sizing: border-box; min-width: var(--byd-tap); padding: 0; }`)
      }
    },
    // After a press: the variant's own drawing follows the state, as the component would.
    sync() {
      const w = WORDS[lang]
      const f = fold()
      if (variant === 'a') { const s = f.querySelector('.p1019-short'); if (s) s.textContent = open() ? w.in : w.out; else this.place('a', lang) }
      if (variant === 'b') { const g = f.querySelector("span[aria-hidden='true'], .p1019-icon"); g.outerHTML = icon(open()) }
      if (variant === 'c') placeC()
    },
    // The control that folds the column in this variant, as a selector the shooter can screenshot.
    control() {
      if (variant !== 'c') return '.byd-wall-view .byd-crown-fold'
      return open() ? '.byd-wall-jump .p1019-colfold' : '.byd-wall-rail .p1019-colfold'
    },
    measure() {
      const c = crown()
      const kids = [...c.children].filter((el) => getComputedStyle(el).display !== 'none')
      const gap = parseFloat(getComputedStyle(c).columnGap) || 0
      const search = c.querySelector('.byd-crown-search')
      const sum = kids.reduce((n, el) => n + el.getBoundingClientRect().width, 0) + gap * (kids.length - 1)
      // What the row would still have to spare with the field at its 180 px floor (#477 fynd 12).
      const headroom = Math.round(c.clientWidth - (sum - search.getBoundingClientRect().width + 180))
      const rows = new Set(kids.map((el) => Math.round(el.getBoundingClientRect().top))).size
      const sel = this.control()
      const ctl = document.querySelector(sel)
      const r = ctl.getBoundingClientRect()
      const narrowNow = c.clientWidth < 1248 && innerWidth >= 1024
      const jump = document.querySelector('.byd-wall-jump')
      const rail = document.querySelector('.byd-wall-rail')
      const tiles = rail ? [...rail.querySelectorAll('button[data-tile]')].map((b) => b.getBoundingClientRect().height) : []
      const firstGroup = jump?.querySelector('.byd-wall-jump-scroll button')
      return {
        room: Math.round(c.clientWidth),
        narrow: narrowNow,
        rows,
        headroom,
        tools: kids.length,
        foldW: Math.round(r.width),
        foldH: Math.round(r.height),
        foldText: (ctl.innerText || '').replace(/\s+/g, ' ').trim(),
        title: ctl.getAttribute('title'),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        crownRect: (() => { const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } })(),
        // What C costs the column: where its first group starts, and the strip's smallest tile.
        firstGroupTop: firstGroup ? Math.round(firstGroup.getBoundingClientRect().top - jump.getBoundingClientRect().top) : null,
        tileMin: tiles.length ? Math.round(Math.min(...tiles)) : null,
        railScrolls: rail ? rail.scrollHeight > rail.clientHeight + 1 : null,
        wallCols: (() => {
          const cards = [...document.querySelectorAll('.byd-wall-card')].slice(0, 30)
          const top = cards[0]?.getBoundingClientRect().top
          return cards.filter((el) => Math.abs(el.getBoundingClientRect().top - top) < 2).length
        })(),
      }
    },
  }
})()
