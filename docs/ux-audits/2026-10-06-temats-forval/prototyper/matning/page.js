// Injiceras i det BYGGDA appens /new (#687). Varje variant är en ändring av vad sidan säger och
// när den frågar katalogen — inget i appen ändras. Där varianten vill att temat hämtas utan ett
// tryck på en bricka trycker skriptet på den redan valda brickan åt formgivaren, vilket i appen
// är exakt `pickTheme(samma id)`: frågan till katalogen och ingenting annat.
//
// window.__p687.install(variant, { box, loggedIn }) och window.__p687.state().
;(() => {
  const CSS = `
  /* B och D: förvalet är inte ett val. */
  .byd-wizard[data-p687-unchosen] .byd-theme-tile[aria-pressed] { border-color: #cbcabe; box-shadow: none; }
  .byd-wizard[data-p687-unchosen] .byd-theme-tile.p687-forval { border-style: dashed; border-color: var(--accent); box-shadow: none; position: relative; }
  .p687-chip { justify-self: start; margin-top: 2px; border-radius: 999px; padding: 2px 8px; background: #f3e3d6; color: #7a3410; font-size: 11px; font-weight: 700; letter-spacing: .02em; }
  .byd-wizard[data-p687-unchosen] .byd-wizard-preview > div[role='img'] { filter: grayscale(1); opacity: .38; }
  .p687-pick { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); z-index: 2; max-width: 80%; min-height: 44px; padding: 8px 14px; border: 1px solid #1c1f1b; border-radius: 10px; background: #fff; color: #1c1f1b; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.18); }
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
  const tileOf = (name) => tiles().find((b) => (b.getAttribute('aria-label') ?? '').includes(name))
  const pressed = () => tiles().find((b) => b.getAttribute('aria-pressed') === 'true')
  const nameOf = (tile) => (tile?.getAttribute('aria-label') ?? '').replace('Välj temat ', '')
  const said = () => document.querySelector('.byd-wizard-preview-font')
  let variant = 'nu'
  let fetchedOnce = false
  // The press the page makes for the designer: on the tile already chosen, so nothing but the
  // fetch happens.
  const fetchChosen = () => {
    const t = pressed() ?? tileOf(window.__p687.chosenName)
    if (!t || fetchedOnce) return
    fetchedOnce = true
    t.click()
  }
  const SAYS = {
    a: (n) => `Hämtar ${n}s typsnitt …`,
    b: () => 'Tryck på ett tema för att se kortet i dess typsnitt.',
    c: (n) => `${n} är valt. Kortet sätts i dess typsnitt när du pekar på kortet eller temana.`,
  }
  const rewrite = () => {
    const s = said()
    if (!s) return
    const n = nameOf(pressed()) || window.__p687.chosenName
    const unchosen = wizard()?.hasAttribute('data-p687-unchosen')
    const want = variant === 'nu' ? undefined : unchosen ? (variant === 'b' ? SAYS.b() : '') : variant === 'c' ? SAYS.c(n) : SAYS.a(n)
    if (want === undefined) return
    s.style.display = ''
    if (want === '') { s.style.display = 'none'; return }
    if (s.textContent !== want) s.textContent = want
  }
  const unchoose = () => {
    const w = wizard()
    w.setAttribute('data-p687-unchosen', '')
    const t = pressed()
    window.__p687.chosenName = nameOf(t)
    if (t) t.setAttribute('aria-pressed', 'false')
    return t
  }
  const choose = (tile) => {
    wizard().removeAttribute('data-p687-unchosen')
    document.querySelectorAll('.p687-chip, .p687-pick, .p687-says').forEach((e) => e.remove())
    tiles().forEach((t) => t.classList.remove('p687-forval'))
    // React only writes aria-pressed when its own value changes, so the tile pressed again is put
    // back here; a different tile is React's to write.
    if (tile && nameOf(tile) === window.__p687.chosenName) tile.setAttribute('aria-pressed', 'true')
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
    chosenName: '',
    install(v, { box: b = 'nu', loggedIn = true, resumed = false } = {}) {
      variant = v
      // B: a draft's theme was pressed by the designer on an earlier visit — that is the handling,
      // so it stands chosen and is fetched, as A fetches every opening.
      if (v === 'b' && resumed) v = 'a'
      const st = document.createElement('style')
      st.textContent = CSS
      document.head.append(st)
      box(b, loggedIn)
      window.__p687.chosenName = nameOf(pressed())
      if (v === 'a') fetchChosen()
      if (v === 'b' || v === 'd') {
        const t = unchoose()
        if (v === 'd' && t) {
          t.classList.add('p687-forval')
          const chip = document.createElement('span')
          chip.className = 'p687-chip'
          chip.textContent = resumed ? 'Valt förut' : 'Förval'
          t.querySelector('b')?.after(chip)
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'p687-pick'
          btn.textContent = `Visa kortet i ${window.__p687.chosenName}`
          btn.onclick = () => { const tile = tileOf(window.__p687.chosenName); choose(tile); fetchedOnce = false; fetchChosen() }
          document.querySelector('.byd-wizard-preview')?.append(btn)
        }
        tiles().forEach((t) => t.addEventListener('click', (e) => { if (e.isTrusted) choose(t) }, true))
        if (v === 'b') {
          const create = document.querySelector('.byd-wizard-main .byd-wizard-primary') ?? document.querySelector('footer .byd-wizard-primary')
          create?.addEventListener('click', (e) => {
            if (!wizard().hasAttribute('data-p687-unchosen')) return
            e.stopImmediatePropagation()
            e.preventDefault()
            if (!document.querySelector('.p687-says')) {
              const p = document.createElement('p')
              p.className = 'p687-says'
              p.setAttribute('role', 'alert')
              p.textContent = 'Välj ett tema först — spelet sätts i dess typsnitt.'
              document.querySelector('.byd-wizard-themes')?.after(p)
            }
            document.querySelector('.byd-wizard-themes .byd-theme-tile')?.focus()
            document.querySelector('.byd-wizard-themes')?.scrollIntoView({ block: 'center' })
          }, true)
        }
      }
      if (v === 'c') {
        const arm = (sel) => document.querySelector(sel)?.addEventListener('pointerenter', fetchChosen)
        arm('.byd-wizard-preview'); arm('.byd-wizard-look')
        document.querySelector('.byd-wizard-look')?.addEventListener('focusin', fetchChosen)
        document.querySelector('.byd-wizard-preview')?.addEventListener('focusin', fetchChosen)
      }
      new MutationObserver(rewrite).observe(document.body, { subtree: true, childList: true, characterData: true })
      rewrite()
    },
    state() {
      const p = pressed()
      const w = wizard()
      return {
        pressed: w?.hasAttribute('data-p687-unchosen') ? null : nameOf(p) || null,
        forval: document.querySelector('.p687-forval') ? window.__p687.chosenName : null,
        says: said() && said().style.display !== 'none' ? said().textContent : null,
        refusal: document.querySelector('.p687-says')?.textContent ?? null,
      }
    },
  }
})()
