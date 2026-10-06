// Injiceras i det BYGGDA appens /new (#687). Varje variant är en ändring av vad sidan säger och
// när den frågar katalogen — inget i appen ändras. Där varianten vill att temat hämtas utan ett
// tryck på en bricka trycker skriptet på den redan valda brickan åt formgivaren, vilket i appen
// är exakt `pickTheme(samma id)`: frågan till katalogen och ingenting annat. Under skrivbords-
// bredd står brickorna i steg 2 och finns inte i sidan förrän steget öppnas, så där går skriptet
// till steg 2, trycker och går tillbaka; i appen vore det samma anrop vid montering.
//
// window.__p687.install(variant, { box, loggedIn, resumed }) och window.__p687.state().
;(() => {
  const CSS = `
  /* B och D: förvalet är inte ett val. */
  .byd-wizard[data-p687-unchosen] .byd-theme-tile[aria-pressed] { border-color: #cbcabe; box-shadow: none; }
  .byd-wizard[data-p687-unchosen] .byd-theme-tile.p687-forval { border-style: dashed; border-color: var(--accent); box-shadow: none; }
  .p687-chip { justify-self: start; margin-top: 2px; border-radius: 999px; padding: 2px 8px; background: #f3e3d6; color: #7a3410; font-size: 11px; font-weight: 700; letter-spacing: .02em; }
  .byd-wizard[data-p687-unchosen] .byd-wizard-preview > div[role='img'] { filter: grayscale(1); opacity: .38; }
  .p687-pick { position: absolute; left: 50%; top: 24%; transform: translate(-50%, -50%); z-index: 2; white-space: nowrap; min-height: 44px; padding: 8px 14px; border: 1px solid #1c1f1b; border-radius: 10px; background: #fff; color: #1c1f1b; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.18); }
  .byd-wizard-preview { position: relative; }
  .p687-says { margin: 4px 0 0; color: #a32d16; font-size: 13px; font-weight: 600; }
  /* Rutans öden. */
  .byd-wizard-handoff.p687-mening strong, .byd-wizard-handoff.p687-konto strong { display: none; }
  .byd-wizard-handoff.p687-mening p, .byd-wizard-handoff.p687-konto p { margin: 0; font-size: 13px; line-height: 1.45; color: #5a4622; }
  .byd-wizard-handoff.p687-mening { background: transparent; border-color: var(--line); padding: 12px 14px; }
  .byd-wizard-handoff.p687-mening p { color: #454c44; }
  .byd-wizard-handoff.p687-konto b { color: #3d2a0a; }
  `
  const wizard = () => document.querySelector('.byd-wizard')
  const tiles = () => [...document.querySelectorAll('.byd-wizard .byd-theme-tile')]
  const tileOf = (name) => tiles().find((b) => (b.getAttribute('aria-label') ?? '') === `Välj temat ${name}`)
  const pressed = () => tiles().find((b) => b.getAttribute('aria-pressed') === 'true')
  const nameOf = (tile) => (tile?.getAttribute('aria-label') ?? '').replace('Välj temat ', '')
  const said = () => document.querySelector('.byd-wizard-preview-font')
  const unchosen = () => wizard()?.hasAttribute('data-p687-unchosen')
  const P = { variant: 'nu', fetch: 'nu', chosen: '', resumed: false, fetched: false }

  const tab = (label) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes(label))
  // The press on the chosen tile, made for the designer: the fetch and nothing else.
  const fetchChosen = () => {
    if (P.fetched) return
    P.fetched = true
    const here = tileOf(P.chosen)
    if (here) { here.click(); return }
    const back = [...document.querySelectorAll('[role="tab"]')].find((b) => b.getAttribute('aria-selected') === 'true')
    tab('Fälten')?.click()
    queueMicrotask(() => setTimeout(() => { tileOf(P.chosen)?.click(); back?.click() }, 0))
  }
  const SAYS = {
    a: (n) => `Hämtar ${n}s typsnitt …`,
    b: () => 'Tryck på ett tema för att se kortet i dess typsnitt.',
    c: (n) => `${n} är valt. Kortet sätts i dess typsnitt när du pekar på kortet eller temana.`,
  }
  const choose = (tile) => {
    wizard().removeAttribute('data-p687-unchosen')
    document.querySelectorAll('.p687-chip, .p687-pick, .p687-says').forEach((e) => e.remove())
    tiles().forEach((t) => t.classList.remove('p687-forval'))
    // React only writes aria-pressed when its own value changes, so the tile pressed again is put
    // back here; a different tile is React's to write.
    if (tile && nameOf(tile) === P.chosen) tile.setAttribute('aria-pressed', 'true')
  }
  // Idempotent: run on every change, since the steps below the desk mount and unmount the tiles
  // and the card.
  const apply = () => {
    const v = P.variant
    if (unchosen()) {
      const t = tileOf(P.chosen)
      if (t && t.getAttribute('aria-pressed') !== 'false') t.setAttribute('aria-pressed', 'false')
      if (v === 'd' && t && !t.classList.contains('p687-forval')) {
        t.classList.add('p687-forval')
        const chip = document.createElement('span')
        chip.className = 'p687-chip'
        chip.textContent = P.resumed ? 'Valt förut' : 'Förval'
        t.querySelector('b')?.after(chip)
      }
      const pv = document.querySelector('.byd-wizard-preview')
      if (v === 'd' && pv && !pv.querySelector('.p687-pick')) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'p687-pick'
        btn.textContent = `Visa kortet i ${P.chosen}`
        btn.onclick = () => { choose(tileOf(P.chosen)); fetchChosen() }
        pv.append(btn)
      }
    }
    for (const t of tiles()) if (!t.dataset.p687) {
      t.dataset.p687 = '1'
      t.addEventListener('click', (e) => { if (e.isTrusted && unchosen()) { choose(t); P.chosen = nameOf(t) } }, true)
    }
    if (v === 'b') {
      const create = document.querySelector('.byd-wizard-block footer .byd-wizard-primary')
      if (create && !create.dataset.p687) {
        create.dataset.p687 = '1'
        create.addEventListener('click', (e) => {
          if (!unchosen()) return
          e.stopImmediatePropagation()
          e.preventDefault()
          if (!document.querySelector('.p687-says')) {
            const p = document.createElement('p')
            p.className = 'p687-says'
            p.setAttribute('role', 'alert')
            p.textContent = 'Välj ett tema först — spelet sätts i dess typsnitt.'
            document.querySelector('.byd-wizard-themes')?.after(p)
          }
          document.querySelector('.byd-wizard-themes')?.scrollIntoView({ block: 'center' })
          document.querySelector('.byd-wizard-themes .byd-theme-tile')?.focus()
        }, true)
      }
    }
    if (P.fetch === 'c') for (const sel of ['.byd-wizard-preview', '.byd-wizard-look']) {
      const el = document.querySelector(sel)
      if (el && !el.dataset.p687) {
        el.dataset.p687 = '1'
        for (const ev of ['pointerenter', 'pointerdown', 'focusin']) el.addEventListener(ev, fetchChosen)
      }
    }
    // What the preview says under the card.
    const s = said()
    if (s && v !== 'nu') {
      const want = unchosen() ? (v === 'b' ? SAYS.b() : '') : P.fetch === 'c' ? SAYS.c(P.chosen) : SAYS.a(P.chosen)
      s.style.display = want === '' ? 'none' : ''
      if (want !== '' && s.textContent !== want) s.textContent = want
    }
  }
  const box = (kind, loggedIn) => {
    const h = document.querySelector('.byd-wizard-handoff')
    if (!h || kind === 'nu') return
    if (kind === 'bort' || (kind === 'konto' && loggedIn)) { h.remove(); return }
    h.classList.add(`p687-${kind}`)
    const p = document.createElement('p')
    if (kind === 'mening') p.textContent = 'Här gör du spelets första kort. Mallen, hela leken och CSV väntar i editorn.'
    else p.innerHTML = '<b>Spelet sparas på ett konto.</b> Du loggar in med e-post när du skapar det, och det du skrivit här följer med.'
    h.append(p)
  }
  window.__p687 = {
    install(v, { box: b = 'nu', loggedIn = true, resumed = false } = {}) {
      P.variant = v
      P.resumed = resumed
      // B: a draft's theme was pressed by the designer on an earlier visit — that is the handling,
      // so it stands chosen and is fetched, as A fetches every opening.
      P.fetch = v === 'b' && resumed ? 'a' : v
      // The chosen theme is in the draft when the tiles are not in the page yet.
      let draftTheme = null
      try { draftTheme = JSON.parse(sessionStorage.getItem('byd.pending-wizard') ?? 'null')?.state?.theme ?? null } catch {}
      P.chosen = nameOf(pressed()) || ({ skogssaga: 'Skogssaga', ren: 'Ren', retro: 'Retro', 'krönika': 'Krönika' })[draftTheme ?? 'skogssaga']
      const st = document.createElement('style')
      st.textContent = CSS
      document.head.append(st)
      box(b, loggedIn)
      if ((v === 'b' && !resumed) || v === 'd') wizard().setAttribute('data-p687-unchosen', '')
      if (P.fetch === 'a') fetchChosen()
      new MutationObserver(apply).observe(document.body, { subtree: true, childList: true, characterData: true })
      apply()
    },
    state() {
      return {
        pressed: unchosen() ? null : nameOf(pressed()) || (tiles().length ? null : P.chosen + ' (steg 2)'),
        forval: unchosen() && P.variant === 'd' ? P.chosen : null,
        says: said() && said().style.display !== 'none' ? said().textContent : null,
        refusal: document.querySelector('.p687-says')?.textContent ?? null,
      }
    },
  }
})()
