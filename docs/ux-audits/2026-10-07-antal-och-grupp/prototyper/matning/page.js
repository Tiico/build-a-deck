// PROTOTYP — kastas (#695). Körs i den byggda editorns Tabell-flik av shoot.mjs, efter att
// tabellen mätt sig själv. Lägger varje variant ovanpå den riktiga tabellen (samma celler, samma
// stilmall, samma mätta bredder) och mäter sedan vad som syns utan sidrullning.
//
//   window.__p695.linux()            text 15 % bredare, som DejaVu på Linux (före mätningen)
//   window.__p695.place('a'|'b'|'c'|'d'|'nu')
//   window.__p695.measure()
//   window.__p695.help()             öppnar variantens förklaring av grupp
;(() => {
  const box = () => document.querySelector('.byd-data-scroll')
  const table = () => box().querySelector('table.byd-data')
  const heads = () => [...table().querySelectorAll('thead > tr > th')]
  const index = (col) => heads().findIndex((th) => th.getAttribute('data-col') === col)
  const GROUP = () => heads().find((th) => th.getAttribute('data-col') && th.textContent.trim() === 'grupp')?.getAttribute('data-col')
  // Every cell of one column, the head's and every row's, by position: the rows of a card that is
  // gone carry an empty cell where the group stands, so position is the one thing they share.
  const column = (i) => [...table().querySelectorAll('tr')].map((tr) => tr.children[i]).filter(Boolean)
  const colEl = (i) => table().querySelectorAll('colgroup > col')[i]
  const px = (n) => `${Math.round(n)}px`
  const style = (css) => {
    const s = document.createElement('style')
    s.setAttribute('data-p695', '')
    s.textContent = css
    document.head.append(s)
  }
  let variant = 'nu'
  let lastExtra = null
  let groupCol = null

  // The fact a grupp cell says, taken from the cell itself: «typ = Playcard» or «Bas».
  const bare = () => {
    for (const td of column(index(groupCol)).slice(1)) {
      if (!td.classList.contains('byd-data-group')) continue
      const m = /^(.+?) = (.+)$/.exec(td.textContent)
      if (m) td.textContent = m[2]
    }
  }

  // The L32 question mark as the editor draws it (help.css is already on the page).
  const ask = (topic) => {
    const span = document.createElement('span')
    span.className = 'byd-help p695-ask'
    span.innerHTML = `<button type="button" class="byd-help-ask" aria-label="Hjälp om ${topic}" aria-expanded="false"><span aria-hidden="true">?</span></button>`
    return span
  }
  let helpFor = null

  // A column's width after the variant: the measured width stays, and a measured column wider than
  // the room it can now show its right edge in is held to that room — the same ceiling L46 sets,
  // counted against everything the variant pins and not only against the left list.
  const reclamp = (extraPinned) => {
    const cols = [...table().querySelectorAll('colgroup > col')]
    const room = box().clientWidth
    const tap = 44
    // What is pinned on the left, read off the columns' own widths: the cells' rectangles are
    // stale until the table's width is said again below.
    let pinned = 0
    heads().forEach((th, i) => {
      const how = getComputedStyle(th)
      if (how.position === 'sticky' && how.left !== 'auto') pinned += parseFloat(colEl(i).style.width) || th.getBoundingClientRect().width
    })
    lastExtra = extraPinned
    const ceiling = room - pinned - tap - extraPinned
    let total = 0
    for (const col of cols) {
      let w = parseFloat(col.style.width)
      if (col.getAttribute('data-kind') !== 'tap' && col.getAttribute('data-kind') !== 'key' && !col.hasAttribute('data-width') && w > ceiling) {
        w = ceiling
        col.style.width = px(w)
      }
      total += w
    }
    table().style.width = px(total)
    table().style.setProperty('--byd-data-lane', px(pinned))
    return ceiling
  }

  const moveAfterId = (cols) => {
    const at = index('id')
    // Moved in reverse so they land in the order given, right after id.
    for (const c of [...cols].reverse()) {
      const i = index(c)
      const cells = column(i)
      const colgroup = table().querySelector('colgroup')
      const col = colEl(i)
      colgroup.insertBefore(col, colgroup.children[at + 1])
      for (const cell of cells) {
        const tr = cell.parentElement
        tr.insertBefore(cell, tr.children[at + 1])
      }
    }
  }

  const VARIANTS = {
    nu() {},

    // A — the foot says which columns stand outside, and the sentence is a button (L4, variant C of
    // 2026-09-15, which #170 took out with the chip on the left). grupp keeps its place and gets
    // L32's question mark.
    a() {
      const count = document.querySelector('.byd-crown-foot .byd-data-count')
      const left = document.createElement('button')
      const right = document.createElement('button')
      left.type = right.type = 'button'
      left.className = right.className = 'p695-out'
      left.dataset.dir = 'left'
      right.dataset.dir = 'right'
      // Its own element after the count, so the marking's «· 2 markerade kort» stays with the count.
      const out = document.createElement('span')
      out.className = 'p695-outs'
      out.append(left, right)
      count.after(out)
      // A column is outside when its head does not overlap the readable room at all (L4, C);
      // partly covered is the cut the fade is already there for.
      const outside = () => {
        const lane = laneOf()
        const out = { left: [], right: [] }
        for (const th of heads()) {
          const name = th.getAttribute('data-col')
          if (!name || name === 'id' || th.classList.contains('p695-pin')) continue
          const r = th.getBoundingClientRect()
          const word = (name === groupCol ? 'grupp' : th.querySelector('button')?.textContent || name).replace(/[↕↑↓▾¶?]/g, '').trim()
          if (r.right <= lane.left + 0.5) out.left.push(word)
          else if (r.left >= lane.right - 0.5) out.right.push(word)
        }
        return out
      }
      // The names are said as long as the foot keeps its height; when they would make it a line
      // taller (a narrow window, a marking's toolbar, a confirmation) the last names go first,
      // then all of them, and the number stays. The whole sentence is the button's name either way.
      const foot = document.querySelector('.byd-crown-foot')
      const say = () => {
        const o = outside()
        const n = (k) => `${k} kolumn${k === 1 ? '' : 'er'}`
        out.hidden = true
        const h0 = foot.getBoundingClientRect().height
        out.hidden = false
        left.hidden = o.left.length === 0
        right.hidden = o.right.length === 0
        const words = (list, k) => (k === 0 ? '' : `: ${list.slice(0, k).join(', ')}${k < list.length ? ' …' : ''}`)
        for (let k = Math.max(o.left.length, o.right.length); k >= 0; k--) {
          left.innerHTML = `<span aria-hidden="true">‹ </span>${n(o.left.length)} till vänster${words(o.left, Math.min(k, o.left.length))}`
          right.innerHTML = `${n(o.right.length)} till höger${words(o.right, Math.min(k, o.right.length))}<span aria-hidden="true"> ›</span>`
          if (foot.getBoundingClientRect().height <= h0 + 0.5) break
        }
        left.setAttribute('aria-label', `${n(o.left.length)} till vänster: ${o.left.join(', ')}`)
        right.setAttribute('aria-label', `${n(o.right.length)} till höger: ${o.right.join(', ')}`)
      }
      new MutationObserver((recs) => { if (recs.some((r) => !out.contains(r.target) && r.target !== out)) requestAnimationFrame(say) }).observe(foot, { childList: true, subtree: true, characterData: true })
      const step = (dir) => {
        const b = box()
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
        b.scrollBy({ left: dir * b.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' })
      }
      left.onclick = () => step(-1)
      right.onclick = () => step(1)
      style(`
        .p695-outs .p695-out { position: relative; margin: -14px 0 -15px; min-height: 44px; padding: 0 2px; border: 0; background: transparent; color: var(--byd-editor-count-ink); font: inherit; cursor: pointer; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 45%, transparent); text-underline-offset: 3px; white-space: nowrap; }
        .p695-outs .p695-out:hover { color: #e6ecfa; text-decoration-color: currentColor; }
        .p695-outs .p695-out[hidden] { display: none; }
        .p695-outs { display: inline-flex; gap: var(--byd-s3); }
        .p695-outs[hidden] { display: none; }
        .p695-outs .p695-out:focus-visible { outline: 2px solid var(--byd-editor-primary-mark, #6ea8ff); outline-offset: -8px; border-radius: 8px; }
      `)
      box().addEventListener('scroll', () => requestAnimationFrame(say))
      say()
      if (variant !== 'a') return
      const g = heads()[index(groupCol)]
      g.append(ask('grupp'))
      helpFor = { topic: 'grupp', anchor: g, lines: ['Vilket utseende kortet får. Mallen grupperas av kolumnen typ: kort med samma typ delar utseende, och Bas är mallens eget.', 'Gruppen byts genom att ändra kortets typ. Hur en grupp ser ut ändras i Mall, under Kortgrupper.'] }
    },

    // B — antal and grupp stand on a list at the right, beside the × (L55's list, mirrored).
    b() {
      const ai = index('antal')
      const gi = index(groupCol)
      bare()
      const g = heads()[gi]
      g.textContent = ''
      g.append(document.createTextNode('kortgrupp'))
      g.append(ask('kortgrupp'))
      helpFor = { topic: 'kortgrupp', anchor: g, lines: ['Vilket utseende kortet får. Mallen grupperas av kolumnen typ: kort med samma typ delar utseende, och Bas är mallens eget.', 'Gruppen byts genom att ändra kortets typ. Hur en grupp ser ut ändras i Mall, under Kortgrupper.'] }
      // The group's width as its longest label now needs, measured the way fitColumns measures a
      // key: the widest cell's own content plus its padding.
      const need = Math.max(...column(gi).map((c) => c.scrollWidth)) + 2
      colEl(gi).style.width = px(Math.max(need, 96))
      colEl(gi).style.width = px(Math.max(parseFloat(colEl(gi).style.width), Math.ceil(g.scrollWidth) + 8))
      const gw = parseFloat(colEl(gi).style.width)
      const aw = parseFloat(colEl(ai).style.width)
      for (const c of column(gi)) c.classList.add('p695-pin', 'p695-pin-g')
      for (const c of column(ai)) c.classList.add('p695-pin', 'p695-pin-a')
      style(`
        .byd-data .p695-pin { position: sticky; z-index: 4; background: inherit; background-image: linear-gradient(var(--byd-editor-data-rail), var(--byd-editor-data-rail)), linear-gradient(var(--byd-data-tint, transparent), var(--byd-data-tint, transparent)); }
        .byd-data thead .p695-pin { z-index: 5; background: #20232d; background-image: linear-gradient(var(--byd-editor-data-rail), var(--byd-editor-data-rail)); }
        .byd-data .p695-pin-g { right: var(--byd-tap); }
        .byd-data .p695-pin-a { right: calc(var(--byd-tap) + ${gw}px); box-shadow: inset 2px 0 0 var(--byd-editor-data-rail-edge), -8px 0 12px -8px rgb(0 0 0 / 80%); }
        .byd-data .byd-data-remove { box-shadow: none; }
        .byd-data thead th.p695-pin > button { position: static; }
        .byd-data tbody .p695-pin-a input { color: var(--byd-editor-data-rail-ink); }
        .byd-data-scroll[data-beyond='true'] { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--byd-tap) - ${aw + gw}px - var(--byd-data-cut)), rgb(0 0 0 / 0%) calc(100% - var(--byd-tap) - ${aw + gw}px), #000 calc(100% - var(--byd-tap) - ${aw + gw}px), #000 100%); mask-image: linear-gradient(to right, #000 calc(100% - var(--byd-tap) - ${aw + gw}px - var(--byd-data-cut)), rgb(0 0 0 / 0%) calc(100% - var(--byd-tap) - ${aw + gw}px), #000 calc(100% - var(--byd-tap) - ${aw + gw}px), #000 100%); }
        .byd-data tbody .byd-data-remove::before { display: none; }
      `)
      reclamp(aw + gw)
    },

    // C — another order: antal and grupp first, right after id, and nothing more is pinned.
    c() {
      bare()
      moveAfterId(['antal', groupCol])
      const g = heads()[index(groupCol)]
      g.textContent = ''
      g.innerHTML = '<span class="p695-two"><span>kortgrupp</span><small>följer typ · Mall</small></span>'
      g.querySelector('.p695-two').append(ask('kortgrupp'))
      helpFor = { topic: 'kortgrupp', anchor: g, lines: ['Vilket utseende kortet får. Mallen grupperas av kolumnen typ: kort med samma typ delar utseende, och Bas är mallens eget.', 'Gruppen byts genom att ändra kortets typ. Hur en grupp ser ut ändras i Mall, under Kortgrupper.'] }
      const gi = index(groupCol)
      const need = Math.max(...column(gi).map((c) => c.scrollWidth)) + 2
      colEl(gi).style.width = px(Math.max(need, parseFloat(colEl(gi).style.width)))
      style(`
        .byd-data thead .p695-two { display: inline-grid; grid-template-columns: auto auto; align-items: center; column-gap: 0; line-height: 1.2; }
        .byd-data thead .p695-two > small { grid-column: 1; color: var(--byd-editor-count-ink); font-size: 11px; font-weight: 400; white-space: nowrap; }
        .byd-data thead .p695-two > .p695-ask { grid-column: 2; grid-row: 1 / span 2; }
      `)
      reclamp(0)
    },

    // D — antal joins id on the left list, and grupp is not a column at all: it is typ, which is
    // what decides it, and typ's head says so.
    d() {
      const gi = index(groupCol)
      for (const c of column(gi)) c.remove()
      colEl(gi).remove()
      moveAfterId(['antal'])
      const ai = index('antal')
      const idW = parseFloat(colEl(index('id')).style.width)
      for (const c of column(ai)) c.classList.add('p695-pin', 'p695-pin-a')
      const t = heads()[index('typ')]
      const tag = document.createElement('span')
      tag.className = 'p695-tag'
      tag.innerHTML = '<span>kortgrupp</span>'
      tag.append(ask('typ som kortgrupp'))
      t.append(tag)
      helpFor = { topic: 'typ styr kortgruppen', anchor: t, lines: ['Mallen grupperas av den här kolumnen: kort med samma typ får samma utseende, och ett kort utan typ får Bas.', 'Hur en grupp ser ut ändras i Mall, under Kortgrupper.'] }
      style(`
        .byd-data .p695-pin { position: sticky; left: calc(var(--byd-tap) + ${idW}px); z-index: 4; background: inherit; background-image: linear-gradient(var(--byd-editor-data-rail), var(--byd-editor-data-rail)), linear-gradient(var(--byd-data-tint, transparent), var(--byd-data-tint, transparent)); box-shadow: inset -2px 0 0 var(--byd-editor-data-rail-edge); }
        .byd-data thead .p695-pin { z-index: 5; background: #20232d; background-image: linear-gradient(var(--byd-editor-data-rail), var(--byd-editor-data-rail)); }
        .byd-data thead th.p695-pin > button { position: static; }
        .byd-data tbody .byd-data-id, .byd-data thead th[data-col='id'] { box-shadow: none !important; }
        .byd-data-scroll[data-under] .byd-data .p695-pin { box-shadow: inset -2px 0 0 var(--byd-editor-data-rail-edge), 8px 0 12px -8px rgb(0 0 0 / 80%); }
        .byd-data tbody .p695-pin-a input { color: var(--byd-editor-data-rail-ink); }
        .byd-data thead th[data-col='typ'] { white-space: nowrap; }
        .byd-data thead .p695-tag { display: flex; align-items: center; gap: 0; margin-top: -6px; color: var(--byd-editor-count-ink); font-size: 11px; font-weight: 400; }
        .byd-data thead .p695-tag > span:first-child { padding: 0 4px; border: 1px solid #3b4358; border-radius: 4px; line-height: 16px; }
      `)
      // typ's head is two lines now; the column takes what the tag needs.
      const ti = index('typ')
      const need = Math.ceil(tag.getBoundingClientRect().width) + 24
      if (parseFloat(colEl(ti).style.width) < need) colEl(ti).style.width = px(need)
      reclamp(0)
    },
  }

  // D and A together: antal on the left list, grupp in typ, and the foot says what is still
  // outside — which in a dense deck is most of it.
  VARIANTS.da = () => {
    VARIANTS.d()
    const keep = helpFor
    VARIANTS.a()
    helpFor = keep
  }

  // The room that can be read: between what is pinned on the left and what is pinned on the right.
  function laneOf() {
    const b = box().getBoundingClientRect()
    let left = b.left
    let right = b.left + box().clientWidth
    const leftPins = variant === 'd' || variant === 'da' ? '.byd-data-check, [data-col="id"], .p695-pin' : '.byd-data-check, [data-col="id"]'
    const rightPins = variant === 'b' ? '.byd-data-remove, .p695-pin' : '.byd-data-remove'
    for (const th of heads()) {
      const r = th.getBoundingClientRect()
      if (th.matches(leftPins)) left = Math.max(left, r.right)
      if (th.matches(rightPins)) right = Math.min(right, r.left)
    }
    return { left, right }
  }

  window.__p695 = {
    linux() {
      // DejaVu Sans, which Linux falls back to for Arial without fonts-liberation, draws this text
      // about 13 % wider than the Mac's Arial; the gate's allowance is 15 %.
      style(`.byd-data :is(input:not([type=checkbox]), textarea, td, th > button, .byd-data-id) { font-size: 13.8px !important; }`)
    },
    place(v) {
      variant = v
      groupCol = GROUP()
      style(`.byd-data thead .p695-ask .byd-help-ask { margin-left: -5px; }`)
      VARIANTS[v]()
      return { groupCol }
    },
    measure() {
      const b = box()
      const lane = laneOf()
      const cols = []
      for (const th of heads()) {
        const name = th.getAttribute('data-col')
        if (!name) continue
        const r = th.getBoundingClientRect()
        const pinned = th.classList.contains('p695-pin') || name === 'id'
        const seen = pinned ? r.width : Math.max(0, Math.min(r.right, lane.right) - Math.max(r.left, lane.left))
        const state = pinned ? 'fast' : seen >= r.width - 0.5 ? 'hel' : seen > 0.5 ? 'delvis' : 'utanför'
        cols.push({ name: name === groupCol ? 'grupp' : name, w: Math.round(r.width), state })
      }
      const of = (n) => cols.find((c) => c.name === n)
      const rows = [...b.querySelectorAll('tbody tr')].slice(0, 40).map((tr) => tr.getBoundingClientRect().height).sort((x, y) => x - y)
      const foot = document.querySelector('.byd-crown-foot')
      const said = [...document.querySelectorAll('.p695-out')].filter((x) => !x.hidden).map((x) => x.textContent.replace(/[‹›]/g, '').trim())
      const pinnedLeft = Math.round(lane.left - b.getBoundingClientRect().left)
      const pinnedRight = Math.round(b.getBoundingClientRect().left + b.clientWidth - lane.right)
      return {
        antal: of('antal')?.state ?? '—',
        grupp: of('grupp')?.state ?? (variant === 'd' || variant === 'da' ? `i typ (${of('typ')?.state})` : '—'),
        others: cols.filter((c) => c.name !== 'antal' && c.name !== 'grupp' && c.name !== 'id'),
        outside: cols.filter((c) => c.name !== 'antal' && c.name !== 'grupp' && c.state === 'utanför').length,
        partial: cols.filter((c) => c.name !== 'antal' && c.name !== 'grupp' && c.state === 'delvis').length,
        said,
        lane: Math.round(lane.right - lane.left),
        pinnedLeft,
        pinnedRight,
        bodyW: of('body')?.w ?? null,
        tableW: Math.round(table().getBoundingClientRect().width),
        scrollW: b.scrollWidth,
        clientW: b.clientWidth,
        headH: Math.round(table().querySelector('thead').getBoundingClientRect().height),
        rowMedian: rows[Math.floor(rows.length / 2)],
        rowMin: rows[0],
        footH: Math.round(foot.getBoundingClientRect().height),
        footOverflow: foot.scrollWidth > foot.clientWidth + 1,
        footRight: Math.round(Math.max(...[...foot.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right))),
        winW: innerWidth,
      }
    },
    help() {
      if (!helpFor) return null
      // A question mark outside the box is first scrolled to, as a hand would have to.
      const a0 = helpFor.anchor.getBoundingClientRect(), b0 = laneOf()
      if (!helpFor.anchor.classList.contains("p695-pin") && (a0.right > b0.right || a0.left < b0.left)) box().scrollLeft = box().scrollWidth
      const btn = helpFor.anchor.querySelector('.byd-help-ask')
      btn.setAttribute('aria-expanded', 'true')
      const a = btn.getBoundingClientRect()
      const d = document.createElement('div')
      d.className = 'p695-box'
      d.setAttribute('role', 'dialog')
      d.innerHTML = `<b>${helpFor.topic[0].toUpperCase() + helpFor.topic.slice(1)}</b>${helpFor.lines.map((l) => `<p>${l}</p>`).join('')}<button type="button" aria-label="Stäng">×</button>`
      const left = Math.min(Math.max(8, a.left - 120), innerWidth - 268)
      d.style.cssText = `left:${left}px; top:${a.bottom + 6}px`
      document.body.append(d)
      style(`
        .p695-box { position: fixed; z-index: 30; box-sizing: border-box; width: 260px; padding: 8px 44px 8px 12px; border-radius: 10px; background: #12141a; border: 1px solid var(--byd-secondary-line, #4a5266); box-shadow: 0 16px 40px rgba(0,0,0,.6); color: #c7cede; font: 12px/1.55 system-ui, sans-serif; }
        .p695-box b { display: block; margin: 0 0 4px; color: #e6ecfa; }
        .p695-box p { margin: 0 0 4px; }
        .p695-box button { position: absolute; top: 0; right: 0; width: 44px; height: 44px; border: 0; background: transparent; color: inherit; font-size: 16px; }
      `)
      return { w: 260, h: Math.round(d.getBoundingClientRect().height) }
    },
    // The table measures itself again when a row is marked; the variant's ceiling is said again.
    refit() {
      if (lastExtra !== null) reclamp(lastExtra)
    },
    // Presses the foot's «till höger» once, as a hand would (variant A).
    stepRight() {
      document.querySelector('.p695-out[data-dir="right"]')?.click()
    },
  }
})()
