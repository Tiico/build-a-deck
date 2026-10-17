// PROTOTYP — kastas (#682). Läggs i det byggda bordsläget (`/table?mode=table`) av shoot.mjs, och
// ritar variantens rad och kontroller ovanpå den riktiga sidan. Raden skriver aldrig en egen mening:
// den läser appens egna live-regioner (`.byd-status-live`), där bordsläget redan säger både det
// avvisade släppet («Ingen sitter vid C än, så kortet går tillbaka.») och det som hände («Bordet
// blandade Kortlek»). Det prototypen visar är alltså *var* och *hur länge* den meningen står, och
// vägen till ångra och avsluta — inte vad den säger.
//
//   window.__p682.set({ v: 'nu|a|b|c|d', k: 'nu|a|b|c' })
//   window.__p682.open('meny' | 'fraga' | null)
//   window.__p682.measure() → mätningen för det som står nu
;(() => {
  if (window.__p682) return
  const P = (window.__p682 = { v: 'nu', k: 'nu', lines: [], timings: [], open: null, upAt: null, downAt: null, downEl: null })
  const HOLD_A = 4000 // a och d: så länge raden står innan den tonar bort
  const HOLD_D = 5000
  const REFUSED_MS = 6000 // b och c: så länge ett avvisat drag står i bärnsten innan raden visar det senaste som hände
  const FADE_MS = 600
  const css = `
  #p682 { position: fixed; inset: 0; z-index: 40; pointer-events: none; font-family: "Roboto Condensed", system-ui, sans-serif; }
  #p682 > * { pointer-events: auto; }
  #p682 .rad { position: fixed; display: flex; align-items: center; gap: 12px; box-sizing: border-box;
    padding: 8px 16px; border-radius: 14px; background: #171a23; color: #f3e9d6; border: 1px solid #9b968e;
    font: 400 24px/1.25 "Roboto Condensed", system-ui, sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.45);
    transition: opacity ${FADE_MS}ms ease, border-color .2s; }
  #p682 .rad[data-refusal] { border-color: #f0b64a; border-left: 6px solid #f0b64a; }
  #p682 .rad .senast { color: #9b968e; font-weight: 700; flex: none; }
  #p682 .rad .alder { color: #9b968e; flex: none; white-space: nowrap; }
  #p682 .rad .text { min-width: 0; }
  #p682 .rad[data-gone] { opacity: 0; }
  #p682 .rad[data-dim] .text { color: #d9d0bd; }
  #p682 .knapp { flex: none; min-height: 44px; padding: 0 16px; border: 1px solid #9b968e; border-radius: 999px; background: #171a23; color: #f3e9d6; font: 700 20px/1 "Roboto Condensed", system-ui, sans-serif; cursor: pointer; }
  #p682 .knapp:hover, #p682 .knapp:focus-visible { border-color: #f0b64a; color: #f0b64a; outline: none; }
  #p682 .horn { position: fixed; display: flex; gap: 14px; align-items: flex-end; }
  #p682 .horn .knapp { font-size: 14px; }
  #p682 .rund { width: 44px; padding: 0; font-size: 20px; }
  #p682 .hanvisa { position: fixed; color: #c9c0ad; font: 400 16px/1.3 "Roboto Condensed", system-ui, sans-serif; text-align: right; }
  #p682 .meny { position: fixed; display: grid; gap: 4px; padding: 8px; min-width: 300px; max-width: 420px; border-radius: 12px; background: #171a23; border: 1px solid #9b968e; box-shadow: 0 20px 40px rgba(0,0,0,.55); }
  #p682 .meny button { display: grid; gap: 2px; text-align: left; min-height: 44px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: #f3e9d6; font: 700 18px/1.25 "Roboto Condensed", system-ui, sans-serif; cursor: pointer; }
  #p682 .meny button small { font-weight: 400; font-size: 15px; color: #c9c0ad; }
  #p682 .meny button:hover, #p682 .meny button:focus-visible { background: #2d2f35; outline: none; }
  #p682 .meny button[aria-disabled='true'] { color: #9b968e; cursor: not-allowed; }
  #p682 .fraga { position: fixed; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;
    max-width: 420px; padding: 12px 16px; border-radius: 12px; background: #3d2632; color: #ffe4ea; border: 1px solid #7a3243;
    box-shadow: 0 20px 40px rgba(0,0,0,.55); font: 400 14px/1.45 system-ui, sans-serif; }
  #p682 .fraga h2 { margin: 0; flex: 1 0 100%; text-align: center; font-size: 16px; }
  #p682 .fraga p { margin: 0; flex: 1 0 100%; text-align: center; }
  #p682 .fraga button { min-height: 44px; padding: 0 16px; border-radius: 10px; cursor: pointer; border: 1px solid #7a3243; background: transparent; color: #ffe4ea; font: inherit; font-weight: 700; }
  #p682 .fraga button[data-kind='danger'] { background: #7a3243; }
  /* k=b och k=c flyttar bordets egna knappar in i variantens hörn, så att de står på en rad. */
  html[data-p682-horn] .byd-felt-corner { visibility: hidden; }
  `
  const style = document.createElement('style')
  style.id = 'p682-css'
  style.textContent = css
  document.head.append(style)
  const layer = document.createElement('div')
  layer.id = 'p682'
  document.body.append(layer)

  // Vad som hände och vad som avvisades, i appens egna ord.
  const REFUSAL = /^(Ingen sitter vid|Bordet har inte svarat)/
  const seen = new WeakMap()
  const hear = () => {
    for (const p of document.querySelectorAll('.byd-status-live')) {
      const text = p.textContent.trim()
      if (!text || seen.get(p) === text) continue
      seen.set(p, text)
      if (/^Bordet är på väg upp/.test(text)) continue
      const last = P.lines.at(-1)
      if (last && last.text === text && performance.now() - last.at < 1500) continue
      const refusal = REFUSAL.test(text)
      P.lines.push({ text, refusal, own: refusal || /^Bordet /.test(text), at: performance.now(), wall: Date.now(), anchor: refusal ? P.upAt : P.downEl ?? P.downAt, t0: P.upT })
      render()
      watch(P.lines.at(-1))
    }
  }
  new MutationObserver(hear).observe(document.body, { subtree: true, childList: true, characterData: true })
  addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('#p682')) return
    if (e.target.closest?.('.byd-ring, [role=menu], button')) return
    P.downAt = { x: e.clientX, y: e.clientY }
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.byd-pile, .byd-card')
    P.downEl = el ? rectOf(el) : null
  }, true)
  addEventListener('pointerup', (e) => { P.upAt = { x: e.clientX, y: e.clientY }; P.upT = performance.now() }, true)
  addEventListener('click', (e) => { if (e.target.closest?.('button') && !e.target.closest('#p682')) P.clickT = performance.now() }, true)

  // Hur fort meningen syns: från släppet (eller trycket på verbet) till första ramen då ett element
  // med texten står ogenomskinligt, inom fönstret och inte täckt av något annat.
  function watch(line) {
    if (P.v === 'nu') return
    const t0 = line.t0 ?? line.at
    const tick = () => {
      const el = [...layer.querySelectorAll('.rad')].find((r) => r.textContent.includes(line.text))
      if (el && visible(el)) {
        P.timings.push({ text: line.text, ms: Math.round(performance.now() - t0), heard: Math.round(line.at - t0) })
        return
      }
      if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
      else P.timings.push({ text: line.text, ms: null })
    }
    requestAnimationFrame(tick)
  }
  function visible(el) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false
    if (parseFloat(getComputedStyle(el).opacity) < 0.9) return false
    const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + 8)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)))
    return hit !== null && el.contains(hit)
  }
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
  const wood = () => rectOf(document.querySelector('.byd-table-wood'))
  const AIR = 16

  // Det på bordet som inte får täckas: kort, högarnas toppar och bildtexter, namn, brickor och
  // bordets egna knappar. En zons tomma ruta får man lägga text över; ett kort får man inte.
  const OBSTACLES = '.byd-card, .byd-pile-top, .byd-pile-caption, .byd-pile-name, .byd-seat-name, .byd-hand-count, .byd-token, .byd-zone > span, .byd-felt-corner > *, .byd-camera-controls, .byd-camera-step, .byd-table-plate > *, .byd-ring button'
  function obstacles(except) {
    const out = []
    for (const el of document.querySelectorAll(OBSTACLES)) {
      if (except && except.contains(el)) continue
      if (el.closest('#p682')) continue
      const r = rectOf(el)
      if (r.width < 1 || r.height < 1) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      out.push({ what: el.className.toString().split(' ')[0] || el.tagName.toLowerCase(), text: el.textContent.trim().slice(0, 24), r })
    }
    return out
  }
  const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

  function plate({ text, refusal, own, wall }, opts = {}) {
    const el = document.createElement('div')
    el.className = 'rad'
    el.setAttribute('aria-hidden', 'true') // live-regionen har redan sagt det (D5)
    if (refusal) el.dataset.refusal = ''
    if (opts.senast && !refusal) el.insertAdjacentHTML('beforeend', `<span class="senast">Senast:</span>`)
    const t = document.createElement('span')
    t.className = 'text'
    t.textContent = text
    el.append(t)
    if (opts.senast && !refusal) {
      const s = Math.round((Date.now() - wall) / 1000)
      el.insertAdjacentHTML('beforeend', `<span class="alder">· ${s < 10 ? 'nyss' : s < 60 ? `för ${s} s sedan` : `för ${Math.floor(s / 60)} min sedan`}</span>`)
    }
    if (P.k === 'b' && own && !refusal && opts.undo !== false) {
      const b = document.createElement('button')
      b.className = 'knapp'
      b.type = 'button'
      b.textContent = 'Ångra'
      b.title = 'Ångra bordets senaste drag'
      el.append(b)
    }
    if (opts.rotate) el.style.transform = 'rotate(180deg)'
    return el
  }

  let timers = []
  function render() {
    for (const t of timers) clearTimeout(t)
    timers = []
    layer.replaceChildren()
    document.documentElement.toggleAttribute('data-p682-horn', P.k === 'b' || P.k === 'c')
    const W = wood()
    const lines = P.lines
    const last = lines.at(-1)
    const lastEvent = lines.findLast((l) => !l.refusal)
    const fresh = (l, ms) => l && performance.now() - l.at < ms
    const add = (el) => (layer.append(el), el)
    if (P.v === 'a' && last && fresh(last, HOLD_A + FADE_MS)) {
      const el = add(plate(last))
      el.style.maxWidth = `${Math.min(420, W.width * 0.4)}px`
      placeBeside(el, last.anchor, W)
      fadeLater(el, last, HOLD_A)
    }
    if (P.v === 'b' || P.v === 'd') {
      const shown = P.v === 'b' ? (last?.refusal && fresh(last, REFUSED_MS) ? last : lastEvent) : last
      if (shown && (P.v === 'b' || fresh(shown, HOLD_D + FADE_MS))) {
        const seatA = [...document.querySelectorAll('.byd-seat-name')].map(rectOf).sort((p, q) => q.top - p.top)[0]
        const room = (seatA ? seatA.left : innerWidth / 2) - 2 * AIR
        const el = add(plate(shown, { senast: P.v === 'b' }))
        el.style.maxWidth = `${room}px`
        el.style.left = `${AIR}px`
        el.style.bottom = `${AIR}px`
        if (P.v === 'd') {
          const twin = add(plate(shown, { rotate: true, undo: false }))
          twin.style.maxWidth = `${room}px`
          twin.style.right = `${AIR}px`
          twin.style.top = `${AIR}px`
          fadeLater(twin, shown, HOLD_D)
          fadeLater(el, shown, HOLD_D)
        } else if (shown === last && last.refusal) timers.push(setTimeout(render, REFUSED_MS - (performance.now() - last.at)))
      }
    }
    if (P.v === 'c') {
      const shown = last?.refusal && fresh(last, REFUSED_MS) ? last : lastEvent
      if (shown) {
        const plateEl = document.querySelector('.byd-table-plate')
        const left = Math.max(innerWidth / 2 + 40, plateEl ? rectOf(plateEl.lastElementChild ?? plateEl).right + 24 : 0)
        const el = add(plate(shown, { senast: true }))
        el.style.right = `${AIR}px`
        el.style.maxWidth = `${innerWidth - AIR - left}px`
        el.style.top = '0px'
        // In i bandet ovanför träet: mitt i det, och aldrig ned över träets kant.
        const h = el.getBoundingClientRect().height
        el.style.top = `${Math.max(4, (W.top - h) / 2)}px`
        if (shown === last && last.refusal) timers.push(setTimeout(render, REFUSED_MS - (performance.now() - last.at)))
      }
    }
    if (P.v === 'b' || P.v === 'c') timers.push(setTimeout(render, 1000)) // åldern räknar
    controls(W, last)
  }
  function fadeLater(el, line, hold) {
    const left = hold - (performance.now() - line.at)
    if (left <= 0) el.dataset.gone = ''
    else timers.push(setTimeout(() => { el.dataset.gone = '' }, left))
  }
  // a: bredvid det som avvisades eller det som hände — under, över, höger eller vänster om det,
  // det första som inte täcker något, inom filten.
  function placeBeside(el, anchor, W) {
    const a = anchor && 'left' in anchor ? anchor : anchor ? { left: anchor.x - 1, right: anchor.x + 1, top: anchor.y - 1, bottom: anchor.y + 1 } : { left: W.left + W.width / 2, right: W.left + W.width / 2, top: W.top + W.height / 2, bottom: W.top + W.height / 2 }
    el.style.left = '0px'
    el.style.top = '0px'
    const r0 = el.getBoundingClientRect()
    void r0
    const cx = (a.left + a.right) / 2
    const cy = (a.top + a.bottom) / 2
    const G = 12
    const obs = obstacles()
    const inset = 36
    const full = parseFloat(el.style.maxWidth) || 420
    let best = null
    // Smalare och smalare: en rad som bryter till två och ryms är bättre än en som täcker ett kort.
    search: for (const mw of [full, 320, 260]) {
      el.style.maxWidth = `${mw}px`
      const { width: w, height: h } = el.getBoundingClientRect()
      const cand = [
        ['under', cx - w / 2, a.bottom + G],
        ['över', cx - w / 2, a.top - G - h],
        ['vänster', a.left - G - w, cy - h / 2],
        ['höger', a.right + G, cy - h / 2],
        ['under', a.right - w, a.bottom + G],
        ['under', a.left, a.bottom + G],
        ['över', a.right - w, a.top - G - h],
        ['över', a.left, a.top - G - h],
      ]
      for (const [side, x0, y0] of cand) {
        const x = Math.min(Math.max(x0, W.left + inset), W.right - inset - w)
        const y = Math.min(Math.max(y0, W.top + inset), W.bottom - inset - h)
        const r = { left: x, top: y, right: x + w, bottom: y + h }
        const hit = obs.reduce((s, o) => s + overlap(r, o.r), 0) + overlap(r, a) * 4
        if (!best || hit < best.hit) best = { side, x, y, hit, mw }
        if (hit === 0) break search
      }
    }
    el.style.maxWidth = `${best.mw}px`
    el.style.left = `${best.x}px`
    el.style.top = `${best.y}px`
    el.dataset.side = best.side
  }

  function controls(W, last) {
    const restart = document.querySelector('.byd-table-restart')
    const help = document.querySelector('.byd-shortcut-open')
    const horn = document.createElement('div')
    horn.className = 'horn'
    horn.style.right = `${AIR}px`
    horn.style.bottom = `${AIR}px`
    if (P.k === 'nu') return
    // Bordets egna två knappar, ritade om i samma hörn (de riktiga döljs men ligger kvar under).
    const clone = (el, cls) => {
      if (!el) return null
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `knapp ${cls}`
      b.textContent = el.textContent
      return b
    }
    if (P.k === 'a') {
      const say = document.createElement('p')
      say.className = 'hanvisa'
      say.textContent = 'Ångra och avsluta gör ni på en telefon vid bordet, eller i editorns Bord-flik.'
      layer.append(say)
      const r = restart ? rectOf(restart) : { left: innerWidth - 160, top: innerHeight - 60, height: 44 }
      say.style.margin = '0'
      say.style.right = `${innerWidth - r.left + 14}px`
      say.style.maxWidth = `${Math.min(360, r.left - innerWidth / 2 - 40)}px`
      say.style.bottom = `${AIR}px`
      const h = say.getBoundingClientRect().height
      say.style.bottom = `${AIR + Math.max(0, (44 - h) / 2)}px`
      return
    }
    if (P.k === 'b') {
      const end = document.createElement('button')
      end.type = 'button'
      end.className = 'knapp'
      end.textContent = 'Avsluta…'
      end.dataset.p682 = 'avsluta'
      end.onclick = () => P.openSheet('fraga')
      horn.append(...[end, clone(restart, ''), clone(help, 'rund')].filter(Boolean))
    }
    if (P.k === 'c') {
      const more = document.createElement('button')
      more.type = 'button'
      more.className = 'knapp rund'
      more.textContent = '⋯'
      more.setAttribute('aria-label', 'Mer för bordet')
      more.setAttribute('aria-expanded', String(P.open === 'meny'))
      more.dataset.p682 = 'mer'
      more.onclick = () => P.openSheet(P.open === 'meny' ? null : 'meny')
      horn.append(...[clone(restart, ''), more, clone(help, 'rund')].filter(Boolean))
    }
    layer.append(horn)
    if (P.open === 'meny' && P.k === 'c') {
      const m = document.createElement('div')
      m.className = 'meny'
      m.setAttribute('role', 'menu')
      const lastOwn = P.lines.findLast((l) => !l.refusal)
      const undo = document.createElement('button')
      undo.setAttribute('role', 'menuitem')
      if (lastOwn?.own) undo.innerHTML = `Ångra bordets senaste drag<small>${lastOwn.text}</small>`
      else {
        undo.setAttribute('aria-disabled', 'true')
        undo.innerHTML = `Ångra bordets senaste drag<small>${lastOwn ? 'Senaste draget gjordes på en telefon — ångra det där.' : 'Bordet har inte gjort något drag än.'}</small>`
      }
      const end = document.createElement('button')
      end.setAttribute('role', 'menuitem')
      end.innerHTML = 'Avsluta bordet…<small>Vi frågar en gång till.</small>'
      end.onclick = () => P.openSheet('fraga')
      m.append(undo, end)
      layer.append(m)
      const hr = horn.getBoundingClientRect()
      m.style.right = `${AIR}px`
      m.style.bottom = `${innerHeight - hr.top + 8}px`
    }
    if (P.open === 'fraga' && (P.k === 'b' || P.k === 'c')) {
      const q = document.createElement('div')
      q.className = 'fraga'
      q.setAttribute('role', 'alertdialog')
      q.setAttribute('aria-label', 'Avsluta bordet?')
      const version = (document.querySelector('.byd-table-plate h1')?.textContent ?? '').split(' · ').at(-1) || 'den här versionen'
      q.innerHTML = `<h2>Avsluta bordet?</h2><p>Bordet stannar på ${version} och kan inte spelas vidare, och alla får enkäten på sin telefon. Att bara lägga ifrån sig telefonen avslutar inget: bordet väntar.</p><button type="button" data-kind="danger">Avsluta för alla</button><button type="button" data-p682="inte">Inte än</button>`
      layer.append(q)
      const r = q.getBoundingClientRect()
      q.style.left = `${W.left + W.width / 2 - r.width / 2}px`
      q.style.top = `${W.top + W.height / 2 - r.height - 12}px`
      q.querySelector('[data-p682=inte]').onclick = () => P.openSheet(null)
    }
  }

  P.set = ({ v, k }) => {
    if (v) P.v = v
    if (k) P.k = k
    render()
  }
  P.openSheet = (what) => {
    P.open = what
    render()
  }
  P.measure = () => {
    const out = []
    const rows = [...layer.querySelectorAll('.rad, .hanvisa, .horn, .meny, .fraga')]
    for (const el of rows) {
      if (el.dataset.gone !== undefined) continue
      const r = rectOf(el)
      const hits = obstacles().filter((o) => overlap(r, o.r) > 0).map((o) => `${o.what}${o.text ? ` «${o.text}»` : ''}`)
      const self = rows.filter((x) => x !== el && !el.contains(x) && !x.contains(el) && x.dataset.gone === undefined && overlap(r, rectOf(x)) > 0).map((x) => x.className)
      const W = wood()
      const cs = getComputedStyle(el)
      const textEl = el.querySelector('.text') ?? el
      out.push({
        kind: el.className,
        side: el.dataset.side ?? null,
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        font: parseFloat(getComputedStyle(textEl).fontSize),
        lines: Math.round(textEl.getBoundingClientRect().height / parseFloat(getComputedStyle(textEl).lineHeight || '30')),
        color: getComputedStyle(textEl).color,
        bg: cs.backgroundColor,
        border: cs.borderTopColor,
        hits,
        self,
        inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        onFelt: r.left >= W.left && r.right <= W.right && r.top >= W.top && r.bottom <= W.bottom,
      })
    }
    return { v: P.v, k: P.k, open: P.open, items: out, timings: P.timings, said: P.lines.map((l) => l.text), wood: wood() }
  }
  render()
})()
