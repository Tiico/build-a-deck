// Injected into the real built editor by shoot.mjs, once per variant and surface (#699). Nothing
// here is the product. React's own nodes are never removed: what a variant replaces is hidden by
// a rule under `html[data-p699]`, and the variant's row is appended beside it, so a re-render that
// moves the focus or the tab stop leaves both alone. The canvas tab and the properties heading
// get their words through `content: attr(...)`, for the same reason.
;(() => {
  const sv = document.documentElement.lang !== 'en' && !/^en/.test(localStorage.getItem('byd.lang') ?? '')
  const W = sv
    ? { om: 'om', filled: 'finns', card: 'kort', cards: 'kort', props: 'Egenskaper', own: 'gruppens', base: 'från basen', cond: 'villkor', back: 'baksidan', front: 'framsidan', changes: 'ändrar', and: 'och', conds: (n) => `${n} villkor`, inherits: 'ärver allt från basen' }
    : { om: 'if', filled: 'is filled', card: 'card', cards: 'cards', props: 'Properties', own: "group's", base: 'from the base', cond: 'condition', back: 'the back', front: 'the front', changes: 'changes', and: 'and', conds: (n) => `${n} condition${n === 1 ? '' : 's'}`, inherits: 'inherits everything from the base' }
  const style = (id, text) => {
    document.getElementById(id)?.remove()
    const s = document.createElement('style')
    s.id = id
    s.textContent = text
    document.head.append(s)
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const countWords = (n) => `${n} ${n === 1 ? W.card : W.cards}`

  // What a condition row is about, read back out of the row the app drew: the whole name stands in
  // the name's `title` — «om raritet = Karaktär · 10 kort» — and nothing else in the row has it.
  function conditionOf(row) {
    const title = row.querySelector('.byd-layer-name')?.getAttribute('title') ?? ''
    const m = title.match(/^(?:om|if) (.+?) = (.+) · (\d+) (?:kort|cards?)$/)
    if (m) return { id: row.dataset.layer, field: m[1], value: m[2], n: Number(m[3]), full: `${W.om} ${m[1]} = ${m[2]}`, title }
    const f = title.match(/^(?:om|if) (.+?) (?:finns|is filled) · (\d+) (?:kort|cards?)$/)
    if (f) return { id: row.dataset.layer, field: f[1], value: null, n: Number(f[2]), full: `${W.om} ${f[1]} ${W.filled}`, title }
    return null
  }
  const rows = () => [...document.querySelectorAll('.byd-layers [role="row"]')]
  const condRows = () => rows().map((r) => ({ row: r, c: conditionOf(r) })).filter((x) => x.c)

  // ── The variants ────────────────────────────────────────────────────────────────────────────
  // Every variant's name for a condition layer nobody has named. A: the value. B, C, D: the
  // condition as the canvas already writes it. One name, written the same in all three places.
  const NAME = {
    nu: null,
    a: (c) => (c.value === null ? `${c.field} ${W.filled}` : c.value),
    b: (c) => c.full,
    c: (c) => c.full,
    d: (c) => c.full,
  }
  // What a screen reader hears on the row's button.
  const SAID = {
    a: (c, mark) => [NAME.a(c), c.value === null ? null : `${W.om} ${c.field}`, countWords(c.n), mark].filter(Boolean).join(', '),
    b: (c, mark) => [c.full, countWords(c.n), mark].filter(Boolean).join(', '),
    c: (c, mark) => [c.full, countWords(c.n), mark].filter(Boolean).join(', '),
    d: (c, mark) => [c.full, countWords(c.n), mark].filter(Boolean).join(', '),
  }

  const COMMON = `
    html[data-p699] .byd-layer-pick[data-p699-row] > .byd-layer-name,
    html[data-p699] .byd-layer-pick[data-p699-row] > .byd-layer-shows,
    html[data-p699] .byd-layer-pick[data-p699-row] > .byd-layer-source { display: none; }
    html[data-p699] .p699-row { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; }
    html[data-p699] .p699-val { flex: 0 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #e6ecfa; }
    html[data-p699] .p699-n { flex: none; margin-left: auto; min-width: 2ch; padding-right: 2px; font-size: 11px; font-variant-numeric: tabular-nums; text-align: right; color: var(--byd-editor-source-ink, #9aa3b8); }
    /* The group's own mark: only on what the group changes; a base layer says nothing (#699). */
    html[data-p699] .p699-own { flex: none; padding: 1px 5px; border-radius: 4px; background: #3a2f55; color: #d9c8ff; font-size: 10px; line-height: 1.3; }
    /* The canvas tab and the properties heading say the layer's one name. */
    html[data-p699] .byd-condition-tab[data-p699-name] { font-size: 0; }
    html[data-p699] .byd-condition-tab[data-p699-name]::after { content: attr(data-p699-name); font-size: 11px; }
    html[data-p699] .byd-canvas-props > h2[data-p699-name] { font-size: 0; }
    html[data-p699] .byd-canvas-props > h2[data-p699-name]::before { content: attr(data-p699-head) ' · '; font-size: 11px; }
    html[data-p699] .byd-canvas-props > h2[data-p699-name]::after { content: attr(data-p699-name); font-size: 12px; text-transform: none; letter-spacing: 0; color: #e6ecfa; }
    /* The group list in words. */
    html[data-p699] .byd-canvas-rules li[data-p699-words] { font-size: 0; }
    html[data-p699] .byd-canvas-rules li[data-p699-words]::after { content: attr(data-p699-words); font-size: 11px; }
  `
  const CSS = {
    a: `
      /* The folder's arrow already says what the layer is; its glyph gives its 24 px to the value. */
      html[data-p699=a] [role='row'][data-p699-cond] .byd-layer-kind { display: none; }
    `,
    b: `
      html[data-p699=b] [role='row'][data-p699-cond] .byd-layer-kind { display: none; }
      html[data-p699=b] .p699-two { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; line-height: 1.2; }
      html[data-p699=b] .p699-two > .p699-val { display: block; }
      html[data-p699=b] .p699-sub { display: flex; gap: 4px; min-width: 0; font-size: 11px; color: var(--byd-editor-source-ink, #9aa3b8); }
      html[data-p699=b] .p699-sub > .p699-f { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      html[data-p699=b] .p699-sub > .p699-nn { flex: none; font-variant-numeric: tabular-nums; }
    `,
    c: `
      html[data-p699=c] .p699-head { grid-column: 1 / -1; padding: 6px 0 0 44px; font-size: 11px; line-height: 16px; color: var(--byd-editor-source-ink, #9aa3b8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      html[data-p699=c] .p699-head + [role='row'] { margin-top: 0; }
      html[data-p699=c] [role='row'][data-p699-run] .byd-layer-kind { display: none; }
    `,
    d: `
      html[data-p699=d] [role='row'][data-p699-cond] .byd-layer-fold { display: none; }
      html[data-p699=d] [role='row'][data-p699-cond] .byd-layer-pick { padding: 4px 0; }
      html[data-p699=d] .p699-wrap { flex: 1 1 auto; min-width: 0; line-height: 1.25; overflow-wrap: anywhere; color: #e6ecfa; }
      /* The column's name is hyphenated where it has to break; the value breaks only between words. */
      html[data-p699=d] .p699-wrap > .p699-fd { hyphens: auto; }
      html[data-p699=d] .p699-wrap > .p699-nw { white-space: nowrap; font-size: 11px; color: var(--byd-editor-source-ink, #9aa3b8); }
      /* The folder's arrow, drawn where the grip is, and only a sign: choosing the layer opens it. */
      html[data-p699=d] [role='row'][data-p699-cond] .byd-layer-grip { font-size: 0; }
      html[data-p699=d] [role='row'][data-p699-cond] .byd-layer-grip::after { content: ''; display: inline-block; width: 5px; height: 5px; border-right: 1.5px solid #9aa3b8; border-bottom: 1.5px solid #9aa3b8; transform: rotate(-45deg); }
      html[data-p699=d] [role='row'][data-p699-cond][aria-selected='true'] .byd-layer-grip::after { transform: rotate(45deg); }
    `,
  }

  // Cut a string in its middle so that both its ends show, measured in the element's own font.
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre'
  document.body.append(probe)
  function widthOf(text, el, wide = 1) {
    const cs = getComputedStyle(el)
    probe.style.font = cs.font
    probe.style.letterSpacing = cs.letterSpacing
    probe.textContent = text
    return probe.getBoundingClientRect().width * wide
  }
  function middleCut(text, el, avail, wide = 1) {
    if (widthOf(text, el, wide) <= avail) return text
    let lo = 0, hi = text.length
    // The largest number of characters kept, half from each end, that still fits with the «…».
    while (lo < hi) {
      const k = Math.ceil((lo + hi) / 2)
      const s = text.slice(0, Math.ceil(k / 2)).trimEnd() + '…' + text.slice(text.length - Math.floor(k / 2)).trimStart()
      if (widthOf(s, el, wide) <= avail) lo = k
      else hi = k - 1
    }
    return text.slice(0, Math.ceil(lo / 2)).trimEnd() + '…' + text.slice(text.length - Math.floor(lo / 2)).trimStart()
  }

  function place(v, opts = {}) {
    document.documentElement.dataset.p699 = v
    if (v === 'nu') return { v }
    style('p699-common', COMMON)
    style('p699-v', CSS[v] ?? '')
    const conds = condRows()
    const markOf = (row) => row.querySelector('.byd-layer-source')?.textContent?.replace(/^·\s*/, '') ?? null
    const base = sv ? 'bas' : 'base'
    // The row of every condition layer.
    let prevField = null
    const runs = []
    for (const { row, c } of conds) {
      row.dataset.p699Cond = ''
      const pick = row.querySelector('.byd-layer-pick')
      if (!pick) continue
      pick.querySelector('.p699-row')?.remove()
      pick.dataset.p699Row = ''
      const mark = markOf(row)
      const own = mark && mark !== base
      const ownChip = own ? `<span class="p699-own" title="${esc(mark)}">${W.own}</span>` : ''
      const span = document.createElement('span')
      span.className = 'p699-row'
      if (v === 'a') span.innerHTML = `<span class="p699-val">${esc(NAME.a(c))}</span>${ownChip}<span class="p699-n">${c.n}</span>`
      if (v === 'b') span.innerHTML = `<span class="p699-two"><span class="p699-val" data-full="${esc(c.value ?? `${c.field} ${W.filled}`)}"></span><span class="p699-sub"><span class="p699-nn">${esc(countWords(c.n))} ·</span><span class="p699-f">${esc(c.value === null ? W.cond : `${W.om} ${c.field}`)}</span></span></span>${ownChip}`
      if (v === 'c') span.innerHTML = `<span class="p699-val">${esc(c.value === null ? c.full : c.value)}</span>${ownChip}<span class="p699-n">${c.n}</span>`
      if (v === 'd') span.innerHTML = `<span class="p699-wrap"><span class="p699-fd">${esc(c.value === null ? c.full : `${W.om} ${c.field} =`)}</span>${c.value === null ? '' : ` ${esc(c.value)}`} <span class="p699-nw">· ${esc(countWords(c.n))}</span></span>${ownChip}`
      pick.append(span)
      pick.setAttribute('aria-label', SAID[v](c, mark && !own ? null : own ? `${W.own}: ${mark}` : null))
      // Runs of conditions on the same column, next to each other, for C's heading.
      const field = c.value === null ? null : c.field
      if (field && field === prevField && runs.at(-1)?.field === field && runs.at(-1).last === row.previousElementSibling) {
        runs.at(-1).rows.push(row)
        runs.at(-1).last = row
      } else runs.push({ field, rows: [row], last: row })
      prevField = field
    }
    // Every other layer: the base mark goes from sight in a group (aria keeps it), the group's own gets the chip.
    for (const row of rows()) {
      if (row.dataset.p699Cond !== undefined) continue
      const pick = row.querySelector('.byd-layer-pick')
      const mark = markOf(row)
      if (!pick || !mark) continue
      pick.querySelector('.p699-row')?.remove()
      pick.dataset.p699Row = ''
      const own = mark !== base
      const name = row.querySelector('.byd-layer-name')?.textContent ?? ''
      const shows = row.querySelector('.byd-layer-shows')?.textContent ?? ''
      const span = document.createElement('span')
      span.className = 'p699-row'
      span.innerHTML = `<span class="p699-val">${esc(name)}</span>${shows ? `<i class="byd-layer-shows" style="display:inline">${esc(shows)}</i>` : ''}${own ? `<span class="p699-own" title="${esc(mark)}">${W.own}</span>` : ''}`
      pick.append(span)
      pick.setAttribute('aria-label', [name, shows, own ? `${W.own}: ${mark}` : W.base].filter(Boolean).join(', '))
    }
    document.querySelectorAll('.p699-head').forEach((h) => h.remove())
    document.querySelectorAll('[data-p699-run]').forEach((r) => delete r.dataset.p699Run)
    if (v === 'c') {
      for (const run of runs) {
        if (!run.field || run.rows.length < 2) continue
        const head = document.createElement('div')
        head.className = 'p699-head'
        head.setAttribute('aria-hidden', 'true')
        head.textContent = `${W.om} ${run.field} =`
        run.rows[0].before(head)
        for (const r of run.rows) r.dataset.p699Run = ''
        // What the run's values share is said once too: each row keeps the words that tell it
        // from its neighbours, and «…» stands where the shared words were.
        const vals = run.rows.map((r) => conditionOf(r)?.value ?? '')
        run.rows.forEach((r, i) => {
          const w = vals[i].split(' ')
          let pre = 0, suf = 0
          vals.forEach((o, j) => {
            if (j === i) return
            const x = o.split(' ')
            let p = 0
            while (p < w.length - 1 && p < x.length && w[p] === x[p]) p++
            let q = 0
            while (q < w.length - 1 - p && q < x.length && w[w.length - 1 - q] === x[x.length - 1 - q]) q++
            pre = Math.max(pre, p)
            suf = Math.max(suf, q)
          })
          const keep = w.slice(pre, w.length - suf).join(' ')
          const said = `${pre ? '… ' : ''}${keep}${suf ? ' …' : ''}`
          const val = r.querySelector('.p699-val')
          if (val && said !== vals[i]) { val.textContent = said; val.dataset.full = vals[i]; val.title = vals[i] }
        })
      }
      // A condition alone on its column keeps its whole name.
      for (const run of runs) if (run.rows.length === 1) {
        const c = conditionOf(run.rows[0])
        const val = run.rows[0].querySelector('.p699-val')
        if (c && val) val.textContent = c.full
      }
    }
    fitB()
    // The canvas tab and the properties heading.
    for (const { c } of conds) {
      const tab = document.querySelector(`.byd-condition[data-condition="${CSS_ESC(c.id)}"] > .byd-condition-tab`)
      if (tab) tab.dataset.p699Name = NAME[v](c)
    }
    const h2 = document.querySelector('.byd-canvas-props > h2')
    const sel = document.querySelector('.byd-layers [role="row"][aria-selected="true"]')
    if (h2 && sel) {
      const c = conditionOf(sel)
      const name = c ? NAME[v](c) : (sel.querySelector('.byd-layer-name')?.textContent ?? '')
      h2.dataset.p699Head = W.props
      h2.dataset.p699Name = name
      h2.setAttribute('aria-label', `${W.props} · ${name}`)
    }
    // The groups list, in words (every variant but Nu).
    for (const li of document.querySelectorAll('.byd-canvas-rules li')) {
      const text = li.textContent ?? ''
      const parts = text.split(' · ')
      const head = parts.slice(0, 2).join(' · ')
      const rest = parts.slice(2)
      const said = []
      for (const part of rest) {
        const m = part.match(/^(baksida|framsida|back|front): (.+)$/i)
        if (!m) { said.push(part); continue }
        const ids = m[2].split(', ')
        const cond = ids.filter((id) => id.startsWith('if-')).length
        const named = ids.filter((id) => !id.startsWith('if-'))
        const list = [...named, ...(cond ? [W.conds(cond)] : [])]
        const words = list.length > 1 ? `${list.slice(0, -1).join(', ')} ${W.and} ${list.at(-1)}` : list[0]
        said.push(`${/^(baksida|back)$/i.test(m[1]) ? W.back : W.front} ${W.changes} ${words}`)
      }
      li.dataset.p699Words = [head.replace(/^typ = |^type = /, ''), ...said].join(' · ')
    }
    return { v, conds: conds.length }
  }
  const CSS_ESC = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s)

  // B's first line is the value cut in its middle, to the width the row gives it.
  function fitB(wide = 1) {
    if (document.documentElement.dataset.p699 !== 'b') return
    for (const val of document.querySelectorAll('.p699-two > .p699-val')) {
      const full = val.dataset.full ?? ''
      val.textContent = full
      const avail = val.getBoundingClientRect().width
      val.textContent = middleCut(full, val, avail, wide)
      val.setAttribute('title', full)
    }
  }

  // ── Measuring ───────────────────────────────────────────────────────────────────────────────
  // What of a one-line box the eye actually gets: the whole text, or the part the ellipsis leaves.
  function seen(el, wide = 1) {
    const cs = getComputedStyle(el)
    const text = el.textContent ?? ''
    if (cs.display === 'none' || el.getClientRects().length === 0) return { text: '', cut: 'none' }
    // What the box could take: its own width and whatever its flex row has left over, less what
    // its neighbours grow by when they too are written wider.
    let avail = el.clientWidth
    const parent = el.parentElement
    if (parent && getComputedStyle(parent).display.includes('flex') && getComputedStyle(parent).flexDirection === 'row') {
      const kids = [...parent.children].filter((k) => getComputedStyle(k).display !== 'none' && k.getClientRects().length)
      const gap = parseFloat(getComputedStyle(parent).columnGap) || 0
      const slack = parent.clientWidth - parseFloat(getComputedStyle(parent).paddingLeft) - parseFloat(getComputedStyle(parent).paddingRight) - kids.reduce((a, k) => a + k.getBoundingClientRect().width, 0) - gap * (kids.length - 1)
      const grow = kids.filter((k) => k !== el && (k.textContent ?? '').trim()).reduce((a, k) => a + widthOf(k.textContent ?? '', k) * (wide - 1), 0)
      if (getComputedStyle(el).flexGrow !== '0' || getComputedStyle(el).flexShrink !== '0') avail = el.clientWidth + Math.max(0, slack) - grow
    }
    const nowrap = cs.whiteSpace === 'nowrap' || cs.whiteSpace === 'pre'
    if (!nowrap) {
      // A box that wraps shows everything, unless a clamp cuts it; none of the variants clamps.
      return { text, cut: text.includes('…') ? 'mitten' : 'ingen' }
    }
    if (widthOf(text, el, wide) <= avail + 0.5) return { text, cut: text.includes('…') ? 'mitten' : 'ingen' }
    const start = el.dataset.cut === 'start' || cs.direction === 'rtl'
    let k = 0
    if (start) {
      while (k < text.length && widthOf('…' + text.slice(text.length - (k + 1)), el, wide) <= avail) k++
      return { text: '…' + text.slice(text.length - k), cut: 'början' }
    }
    while (k < text.length && widthOf(text.slice(0, k + 1) + '…', el, wide) <= avail) k++
    return { text: text.slice(0, k) + '…', cut: 'slutet' }
  }
  const words = (s) => (s ?? '').toLowerCase().replace(/\b\d+\s*(kort|cards?)\b/g, ' ').replace(/^\s*\d+\s*$|\s\d+$/g, ' ').split(/[^\p{L}\p{N}()]+/u).filter((w) => w && w !== '…')
  const sameWords = (a, b) => { const x = words(a).sort().join(' '), y = words(b).sort().join(' '); return x === y }

  function measure(wide = 1) {
    const v = document.documentElement.dataset.p699 ?? 'nu'
    if (wide !== 1) fitB(wide)
    // +15 % for real where a row wraps: the words spaced out until they are that much wider, for
    // the whole list at once so that its height is measured too, and put back afterwards.
    const wraps = [...document.querySelectorAll('.p699-wrap')]
    if (wide !== 1) for (const wrap of wraps) wrap.style.letterSpacing = `${((wide - 1) * widthOf(wrap.textContent ?? '', wrap)) / Math.max(1, (wrap.textContent ?? '').length)}px`
    const out = []
    for (const { row, c } of condRows()) {
      const pick = row.querySelector('.byd-layer-pick')
      const boxes = v === 'nu'
        ? [row.querySelector('.byd-layer-name'), row.querySelector('.byd-layer-shows'), row.querySelector('.byd-layer-source')]
        : [...row.querySelectorAll('.p699-val, .p699-f, .p699-nn, .p699-n, .p699-wrap, .p699-own')]
      const parts = boxes.filter(Boolean).map((b) => seen(b, wide))
      let head = ''
      if (v === 'c' && row.dataset.p699Run !== undefined) {
        let h = row.previousElementSibling
        while (h && !h.classList.contains('p699-head')) h = h.previousElementSibling
        head = h?.textContent ?? ''
      }
      const visible = parts.map((p) => p.text).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
      const cut = parts.find((p) => p.cut !== 'ingen' && p.cut !== 'none')?.cut ?? 'ingen'
      // D wraps: how many lines its words take at this width.
      let lines = 1
      let hWide = null
      const wrap = row.querySelector('.p699-wrap')
      if (wrap) {
        // +15 % for real: the words spaced out until they are that much wider, then put back.
        lines = Math.round(wrap.getBoundingClientRect().height / parseFloat(getComputedStyle(wrap).lineHeight))
        hWide = Math.round(row.getBoundingClientRect().height)
      }
      const folded = row.querySelector('.byd-layer-inside') === null
      const valueSeen = c.value === null ? visible.toLowerCase().includes(c.field.toLowerCase()) : visible.includes(c.value)
      out.push({
        id: c.id, value: c.value, field: c.field, n: c.n, visible, head, cut, lines,
        valueSeen, h: hWide ?? Math.round(row.getBoundingClientRect().height), folded,
        said: pick?.getAttribute('aria-label') ?? (pick?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      })
    }
    const keys = out.map((r) => `${r.head}|${r.visible}`)
    const distinct = new Set(keys).size
    const list = document.querySelector('.byd-layers')
    const rules = document.querySelector('.byd-canvas-rules')
    const scroll = document.querySelector('.byd-canvas-scroll')
    // The one name: the selected layer as the row, the canvas tab and the properties heading say it.
    const sel = document.querySelector('.byd-layers [role="row"][aria-selected="true"]')
    let names = null
    if (sel) {
      const c = conditionOf(sel)
      const r = out.find((x) => x.id === sel.dataset.layer)
      const tab = document.querySelector(`.byd-condition[data-condition="${CSS_ESC(sel.dataset.layer)}"] > .byd-condition-tab`)
      const tabName = tab ? (tab.dataset.p699Name ?? tab.textContent ?? '') : null
      const h2 = document.querySelector('.byd-canvas-props > h2')
      const propsName = h2 ? (h2.dataset.p699Name ?? (h2.textContent ?? '').replace(/^[^·]*·\s*/, '')) : null
      const propsShown = h2 ? (h2.dataset.p699Name ? `${h2.dataset.p699Head} · ${h2.dataset.p699Name}` : getComputedStyle(h2).textTransform === 'uppercase' ? (h2.textContent ?? '').toUpperCase() : h2.textContent) : null
      const rowSeen = r ? `${r.head} ${r.visible}` : ''
      // The row as written, before any cut: the app's own title in Nu, the variant's words otherwise.
      const vrow = sel.querySelector('.p699-row')
      const rowWritten = vrow ? `${r?.head ?? ''} ${[...vrow.querySelectorAll('.p699-val, .p699-f, .p699-wrap')].map((e) => e.dataset.full ?? e.textContent).join(' ')}` : (c?.title ?? '')
      const count = (forms) => {
        const d = []
        for (const f of forms.filter((x) => x !== null)) if (!d.some((g) => sameWords(f, g))) d.push(f)
        return d.length
      }
      names = { id: sel.dataset.layer, row: rowSeen.trim(), rowWritten: rowWritten.trim(), tab: tabName, props: propsShown, count: count([rowSeen, tabName, propsName]), written: count([rowWritten, tabName, propsName]), title: c?.title ?? null }
    }
    const listH = list ? Math.round(list.getBoundingClientRect().height) : null
    for (const wrap of wraps) wrap.style.letterSpacing = ''
    return {
      rows: out,
      distinct, conds: out.length,
      valuesSeen: out.filter((r) => r.valueSeen).length,
      rowH: Math.max(0, ...out.filter((r) => r.folded).map((r) => r.h)),
      rowHmin: Math.min(...out.filter((r) => r.folded).map((r) => r.h)),
      listH,
      rulesH: rules ? Math.round(rules.getBoundingClientRect().height) : null,
      rules: rules ? [...rules.querySelectorAll('li')].map((li) => li.dataset.p699Words ?? li.textContent) : [],
      scrollOver: scroll ? scroll.scrollHeight - scroll.clientHeight : null,
      names,
    }
  }

  window.__p699 = { place, measure, fitB }
})()
