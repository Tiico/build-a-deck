// PROTOTYP (#1474). Telefonen: brickan på handen (beslut 10: den får hållas dold, som ett kort),
// i «Framför mig» och i «Bordet» (C2: telefonen når zoner, inte punkter), och distansvyns
// solfjäder på TV:n, som är ritad för kort och är ~41 px djup vid åtta platser.
window.Telefon = (() => {
  const names = { A: 'Samma rad, egen form', B: 'Två hyllor', C: 'Allt i kortets ram' }
  const notes = {
    A: `<b>A · Samma rad, egen form (rekommenderas).</b> Brickorna ligger i handens rad efter korten, i sin egen form och i sin verkliga storlek mot kortet (en sexhörning på 52 mm är 83 % av kortets bredd). Ett tryck lyfter den, och raden under säger vad som går: «Framför mig», «Till Spelytan». På TV:n ligger brickans baksida i samma solfjäder, i sin form, och antalet är handens.
    <br><span class="plus">+ Handen ser ut som den gör i verkligheten, och ingenting nytt behöver förklaras. Samma rad, samma tryck, samma lyft.</span> <span class="minus">− Brickan är mindre än kortet och dess namn blir litet; formen syns för alla på TV:n, vilket den gör på en riktig hand också.</span>`,
    B: `<b>B · Två hyllor.</b> Fliken Handen delas i «Kort · 4» och «Brickor · 2», och brickorna får fylla sin hylla. På TV:n blir solfjädern två: korten, och brickornas baksidor i en egen liten bunt bredvid.
    <br><span class="plus">+ Brickorna blir stora och lätta att läsa, och man ser direkt hur många man har av varje.</span> <span class="minus">− En hylla per sort växer med varje ny lek. På TV:n kostar en andra bunt bredd i en remsa som redan är full (inget utrymme för en etikett), och handen ser ut som två händer.</span>`,
    C: `<b>C · Allt i kortets ram.</b> Varje sak på handen får kortets ram, och brickan ligger centrerad i den med namnet under. På TV:n är allt kortformade baksidor, och brickans baksida bär en sexhörning.
    <br><span class="plus">+ Billigast: handen och solfjädern är oförändrade, och raden går att bläddra som förut.</span> <span class="minus">− Brickan ser ut som ett kort med en bild av en bricka; det fysiska går förlorat, och på TV:n syns inte att någon håller en bricka utan att man tittar noga.</span>`,
  }
  let V, root, tab = 'hand', sel = null, shape = 'hex'
  const hand = () => [
    ...CARDS.slice(0, 4).map((c) => ({ k: c.id, kind: 'card', card: c, up: true })),
    { k: 'L07', kind: 'tile', tile: TILES[6], up: true }, { k: 'L11', kind: 'tile', tile: TILES[10], up: true },
  ]
  let H, mine, table
  function reset() {
    H = hand()
    mine = [{ k: 'L12', tile: TILES[11], rot: 0, up: true }]
    table = [TILES[0], TILES[2], TILES[4], TILES[3], TILES[1], TILES[7], TILES[5]].map((t, i) => ({ k: t.id, tile: t, rot: [0, 60, 0, 120, 0, 240, 60][i], up: true }))
  }
  const dm = () => shape === 'round' ? { w: 44, h: 44 } : MM[shape]

  const css = `
  .tel-scen { min-height: 100%; display: flex; gap: 32px; align-items: flex-start; justify-content: center; flex-wrap: wrap; padding: 20px 16px 32px; background: #0b0c10; color: var(--chalk); font-family: var(--felt-font); }
  .tel { width: 390px; max-width: 100%; height: clamp(560px, calc(100dvh - 300px), 780px); border-radius: 36px; background: #000; padding: 10px; box-shadow: 0 0 0 1px #2a2d36, 0 20px 60px #000; flex: none; }
  .tel-skarm { position: relative; height: 100%; border-radius: 28px; overflow: hidden; background: #14161c; display: flex; flex-direction: column; }
  .tel-topp { flex: none; display: flex; align-items: center; gap: 8px; padding: 14px 16px 10px; font-weight: 700; font-size: 16px; }
  .tel-topp i { width: 28px; height: 28px; border-radius: 50%; background: #e05a4f; display: grid; place-items: center; font-style: normal; color: #fff; }
  .tel-topp span { margin-left: auto; color: var(--chalk-off); font-weight: 400; font-size: 14px; }
  .tel-inne { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 0 12px; }
  .tel-rub { margin: 10px 16px 6px; color: var(--chalk-off); font-weight: 700; font-size: 14px; letter-spacing: .02em; display: flex; justify-content: space-between; }
  .rad { display: flex; flex-wrap: wrap; gap: 18px 10px; align-items: center; padding: 14px 16px 14px; }
  .rad > button { flex: none; position: relative; padding: 0; border: 0; background: none; cursor: pointer; scroll-snap-align: start; transition: transform .18s; border-radius: 8px; }
  .rad > button[aria-pressed='true'] { transform: translateY(-12px); }
  .rad > button[aria-pressed='true']::after { content: ''; position: absolute; left: 10%; right: 10%; bottom: -10px; height: 3px; border-radius: 2px; background: var(--accent); }
  .rad > button:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
  .ram { width: 104px; height: 145px; border-radius: 8px; background: #232733; display: grid; place-items: center; align-content: center; gap: 6px; color: var(--chalk); font-size: 12px; font-weight: 700; }
  .tel-handling { flex: none; display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid #22262f; background: #171a23; min-height: 68px; align-items: center; }
  .tel-handling p { margin: 0; color: var(--chalk-off); font-size: 14px; }
  .knapp { min-height: 48px; border: 0; border-radius: 12px; font: 700 16px var(--felt-font); cursor: pointer; padding: 0 16px; }
  .knapp.prim { background: var(--accent); color: var(--on-accent); }
  .knapp.sek { background: transparent; color: var(--chalk); border: 1px solid #4a4f5c; }
  .knapp:focus-visible { outline: 3px solid var(--chalk); outline-offset: 2px; }
  .tel-flikar { flex: none; display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid #22262f; background: #101219; }
  .tel-flikar button { min-height: 56px; border: 0; background: none; color: var(--chalk-off); font: 700 14px var(--felt-font); cursor: pointer; }
  .tel-flikar button[aria-selected='true'] { color: var(--chalk); box-shadow: inset 0 3px 0 var(--accent); }
  .tel-flikar button:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }
  .zrad { margin: 0 12px 10px; padding: 10px 12px; border-radius: 12px; background: #1b1e27; }
  .zrad h4 { margin: 0 0 8px; display: flex; align-items: center; gap: 8px; font-size: 15px; }
  .zrad h4 small { color: var(--chalk-off); font-weight: 400; font-size: 13px; }
  .zrad h4 .knapp { margin-left: auto; min-height: 44px; font-size: 15px; }
  .zrad .bitar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .lagd-t { display: grid; justify-items: center; gap: 4px; }
  .lagd-t > button.bild { padding: 0; border: 0; background: none; cursor: pointer; border-radius: 8px; }
  .lagd-t > button.bild:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  .vrid { display: flex; gap: 6px; }
  .vrid button { min-width: 48px; min-height: 44px; border-radius: 10px; border: 1px solid #4a4f5c; background: transparent; color: var(--chalk); font: 700 15px var(--felt-font); cursor: pointer; }
  .vrid button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .sido { width: 560px; max-width: 100%; display: grid; gap: 18px; }
  .sido h3 { margin: 0 0 6px; font-size: 12px; letter-spacing: .12em; color: var(--chalk-off); }
  .sido p { margin: 0; color: #c9cfdc; font: 13px/1.5 system-ui; }
  .remsa { position: relative; background: var(--plate); border: 1px dashed #2f3440; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .remsa .fjader { display: flex; align-items: center; }
  .remsa .fjader > * { flex: none; }
  .remsa .grupp + .grupp { margin-left: 14px; }
  .remsa .platsnamn { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); display: flex; gap: 6px; align-items: center; padding: 2px 8px 2px 2px; border-radius: 6px; background: #12141b; border-left: 3px solid #e05a4f; font-weight: 700; font-size: 13px; }
  .remsa .platsnamn i { width: 20px; height: 20px; border-radius: 50%; background: #e05a4f; display: grid; place-items: center; font-style: normal; color: #fff; font-size: 11px; }
  .tradet { width: 100%; border-collapse: collapse; font: 12px system-ui; color: #c9cfdc; }
  .tradet td, .tradet th { padding: 4px 6px; border-bottom: 1px solid #1e2129; text-align: left; vertical-align: top; }
  .tradet code { color: #ffd98a; }
  @media (max-width: 500px) { .tel-scen { padding: 0; } .tel { width: 100%; height: calc(100dvh - 0px); border-radius: 0; padding: 0; box-shadow: none; } .tel-skarm { border-radius: 0; } }
  `

  function svgOf(item, px, opts) { return pieceSvg(item.kind === 'card' ? item : { kind: 'tile', shape, mm: dm(), tile: item.tile, up: item.up !== false, rot: item.rot || 0 }, px, opts) }

  function handTab() {
    const cardPx = 104 / 63
    const btn = (it, inner) => `<button aria-pressed="${sel === it.k}" data-sel="${it.k}" aria-label="${it.kind === 'card' ? it.card.namn + ', kort' : it.tile.namn + ', landskapsbricka, ' + SHAPE_NAME[shape]}">${inner}</button>`
    if (V === 'A') return `<div class="tel-rub"><span>Handen · ${H.length}</span><span>dold för andra</span></div><div class="rad" style="">${H.map((it) => btn(it, svgOf(it, cardPx, { edge: it.kind !== 'card' }))).join('')}</div>`
    if (V === 'B') {
      const c = H.filter((x) => x.kind === 'card'), t = H.filter((x) => x.kind !== 'card')
      return `<div class="tel-rub"><span>Kort · ${c.length}</span></div><div class="rad">${c.map((it) => btn(it, svgOf(it, 104 / 63, { edge: false }))).join('')}</div>
        <div class="tel-rub"><span>Brickor · ${t.length}</span><span>dolda för andra</span></div><div class="rad">${t.map((it) => btn(it, svgOf(it, 124 / dm().w))).join('')}</div>`
    }
    return `<div class="tel-rub"><span>Handen · ${H.length}</span><span>dold för andra</span></div><div class="rad" style="">${H.map((it) => btn(it, it.kind === 'card' ? svgOf(it, cardPx, { edge: false }) : `<span class="ram">${svgOf(it, 78 / dm().w, { edge: false })}<span>${it.tile.namn}</span></span>`)).join('')}</div>`
  }
  function turnable(p, px, where) {
    const st = STEP[shape]
    return `<div class="lagd-t"><button class="bild" data-vrid="${where}:${p.k}:1" aria-label="${p.tile.namn}, vriden ${((p.rot % 360) + 360) % 360}°. Tryck vrider ${st}°.">${svgOf(p, px)}</button>
      ${where === 'mine' ? `<div class="vrid"><button data-vrid="${where}:${p.k}:-1" aria-label="Vrid ${p.tile.namn} ${st}° moturs">↺ ${st}°</button><button data-vrid="${where}:${p.k}:1" aria-label="Vrid ${p.tile.namn} ${st}° medurs">↻ ${st}°</button></div>` : ''}</div>`
  }
  function mineTab() {
    return `<div class="tel-rub"><span>Framför mig</span><span>alla ser</span></div>
      <div class="zrad"><h4>Landskap <small>${mine.length} bricka</small></h4><div class="bitar">${mine.map((p) => turnable(p, 1.9, 'mine')).join('')}</div></div>
      <div class="zrad"><h4>Guld <small>3 mynt</small><button class="knapp sek">Lägg 1 på Spelytan</button></h4><div class="bitar">${[1, 2, 3].map(() => pieceSvg({ kind: 'coin', shape: 'round', up: true }, 1.6)).join('')}</div></div>`
  }
  function tableTab() {
    return `<div class="tel-rub"><span>Bordet</span><span>zoner, inte punkter (C2)</span></div>
      <div class="zrad"><h4>Spelyta <small>${table.length} brickor · tryck vrider ${STEP[shape]}°</small></h4><div class="bitar">${table.map((p) => turnable(p, 0.95, 'table')).join('')}</div></div>
      <div class="zrad"><h4>Landskap <small>dold hög · 11</small><button class="knapp prim" data-dra>Dra 1</button></h4><div class="bitar">${pieceSvg({ kind: 'tile', shape, mm: dm(), up: false }, 0.9, { layers: 11 })}</div></div>
      <div class="zrad"><h4>Guld <small>17</small><button class="knapp sek">Ta 1</button></h4></div>
      <div class="zrad"><h4>Draghög <small>34 kort</small><button class="knapp sek">Dra 1</button></h4></div>`
  }
  function actionBar() {
    if (tab !== 'hand') return `<div class="tel-handling"><p>Brickan läggs i en zon; var på brickan den hamnar avgör bordet.</p></div>`
    const it = H.find((x) => x.k === sel)
    if (!it) return `<div class="tel-handling"><p>Tryck på ett kort eller en bricka.</p></div>`
    return `<div class="tel-handling"><button class="knapp prim" data-play="mine">Framför mig</button><button class="knapp sek" data-play="table">Till Spelytan</button></div>`
  }

  // TV:ns solfjäder för Nicklas hand, i remsans riktiga djup.
  function fan(depthPx) {
    const s = depthPx * 0.86 / 88
    const back = (it) => it.kind === 'card' ? pieceSvg({ kind: 'card', up: false }, s, { edge: false })
      : V === 'C' ? `<svg width="${63 * s}" height="${88 * s}" viewBox="0 0 63 88"><rect width="63" height="88" rx="3" fill="#4a3424"/><polygon points="${hexPoints(30, 34, 16.5, 27)}" fill="none" stroke="#c7a46a" stroke-width="3"/></svg>`
      : pieceSvg({ kind: 'tile', shape, mm: dm(), up: false }, s, { edge: false })
    const lap = (arr) => arr.map((it, i) => `<span style="margin-left:${i ? -63 * s * 0.45 : 0}px;display:block">${back(it)}</span>`).join('')
    const c = H.filter((x) => x.kind === 'card'), t = H.filter((x) => x.kind !== 'card')
    const inner = V === 'B' ? `<span class="fjader grupp">${lap(c)}</span><span class="fjader grupp">${lap(t)}</span>` : `<span class="fjader">${lap(H)}</span>`
    return inner
  }
  function side() {
    return `<div><h3>DISTANSVYN PÅ TV:N · NICKLAS HAND</h3>
      <p style="margin-bottom:8px">Remsan i sitt riktiga djup: 60 mm hand gånger skalan. Ingen etikett ryms; antalet står i platsens namn.</p>
      <p style="margin:6px 0 4px;color:#9b968e">Åtta platser vid 1920 × 1080 · 0,71 px/mm · 43 px djup</p>
      <div class="remsa" style="width:${500 * 0.71}px;height:${60 * 0.71}px">${fan(60 * 0.71)}</div>
      <p style="margin:10px 0 4px;color:#9b968e">Fyra platser vid 1920 × 1080 · 1,24 px/mm · 74 px djup</p>
      <div class="remsa" style="width:${500 * 1.24}px;max-width:100%;height:${60 * 1.24}px"><span class="platsnamn"><i>A</i>Nicklas · ${H.length}</span>${fan(60 * 1.24)}</div></div>
      <div><h3>DET DOLDA, PÅ TRÅDEN</h3><table class="tradet"><tr><th>Vem</th><th>Får om Nicklas brickor</th></tr>
      <tr><td>Nicklas telefon</td><td>id, namn, bild, form (som ett kort på handen)</td></tr>
      <tr><td>Alla andra, TV:n</td><td>antal och ${V === 'C' ? 'att det är en bricka' : 'formen'}; aldrig id eller bild. Bevisas på råa frames som korten (B6, <code>wire.test.ts</code>).</td></tr></table>
      <p style="margin-top:6px">Formen är fysisk och syns på en riktig hand också. ${V === 'C' ? 'C döljer den för att handen ska se likadan ut, men då ljuger TV:n om vad som finns.' : 'Vill ett spel dölja den, får alla brickor samma baksida och form.'}</p></div>`
  }

  function render() {
    const inner = tab === 'hand' ? handTab() : tab === 'mine' ? mineTab() : tab === 'table' ? tableTab() : `<div class="tel-rub">Mer</div><p style="padding:0 16px;color:#9b968e">Inte prototypat.</p>`
    root.innerHTML = `<style>${css}</style><div class="tel-scen"><div class="tel" aria-label="Telefonen, plats A"><div class="tel-skarm">
      <div class="tel-topp"><i>A</i>Nicklas<span>Skogens råd · KX4M</span></div>
      <div class="tel-inne">${inner}</div>${actionBar()}
      <div class="tel-flikar" role="tablist">${[['hand', 'Handen'], ['mine', 'Framför mig'], ['table', 'Bordet'], ['more', 'Mer']].map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join('')}</div>
    </div></div><div class="sido">${side()}</div></div>`
    root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; render() })
    root.querySelectorAll('[data-sel]').forEach((b) => b.onclick = () => { sel = sel === b.dataset.sel ? null : b.dataset.sel; render(); root.querySelector(`[data-sel="${b.dataset.sel}"]`)?.focus() })
    root.querySelectorAll('[data-play]').forEach((b) => b.onclick = () => {
      const it = H.find((x) => x.k === sel); H = H.filter((x) => x !== it); sel = null
      if (it.kind !== 'card') (b.dataset.play === 'mine' ? mine : table).push({ k: it.k, tile: it.tile, rot: 0, up: true })
      render()
    })
    root.querySelectorAll('[data-vrid]').forEach((b) => b.onclick = () => {
      const [where, k, d] = b.dataset.vrid.split(':')
      const p = (where === 'mine' ? mine : table).find((x) => x.k === k); p.rot += STEP[shape] * Number(d)
      render(); root.querySelector(`[data-vrid="${b.dataset.vrid}"]`)?.focus()
    })
    root.querySelector('[data-dra]')?.addEventListener('click', () => { H.push({ k: 'L' + Date.now(), kind: 'tile', tile: TILES[12 + (H.length % 5)], up: true }); tab = 'hand'; render() })
  }
  function extras(ex) {
    const b = (lab, on) => `<button data-form="${on}" aria-pressed="${shape === on}">${lab}</button>`
    ex.innerHTML = `<span>Form:</span>${b('⬡ Sexhörning', 'hex')}${b('◻ Kvadrat', 'square')}${b('○ Rund', 'round')}<span style="margin-left:8px">Flik:</span>${[['hand', 'Handen'], ['mine', 'Framför mig'], ['table', 'Bordet']].map(([k, l]) => `<button data-flik="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}<button data-nolla>Börja om</button>`
    ex.querySelectorAll('[data-form]').forEach((el) => el.onclick = () => { shape = el.dataset.form; extras(ex); render() })
    ex.querySelectorAll('[data-flik]').forEach((el) => el.onclick = () => { tab = el.dataset.flik; extras(ex); render() })
    ex.querySelector('[data-nolla]').onclick = () => { reset(); sel = null; render() }
  }
  return {
    names, notes,
    render(scen, v, ex) {
      V = v; root = scen; if (!H) reset()
      const q = new URLSearchParams(location.search)
      if (q.get('flik')) tab = q.get('flik')
      if (q.get('vald')) sel = q.get('vald')
      extras(ex); render()
    },
  }
})()
