// PROTOTYP (#1474). Editorn: var de unika brickornas mall och tabell bor när spelet bär mer än en
// lek (beslut 8), och raden «Bricka» i fliken Bords ＋-meny (L89), med markören och brickleken
// sida vid sida. Skrivbordet ritas i verklig storlek 1280 × 800 och skalas ner (L12).
window.Editor = (() => {
  const names = { A: 'En flik per lek', B: 'Växel i huvudet', C: 'Kortgrupp med egen form' }
  const notes = {
    A: `<b>A · En flik per lek (rekommenderas).</b> Huvudet är oförändrat. Kortväggen visar varje lek som ett eget avsnitt med sin form och sitt antal. Mall och Tabell får en rad med en flik per lek överst, «Kort» och «Landskap ⬡», och «＋ Lek» bredvid. Brickans form, mått och steg står i Malls egenskaper, under «Brickan». I Bord väljer ＋-menyns «Bricka» mellan en markör (en bild, ritas på raden) och en hög ur en lek.
    <br><span class="plus">+ Växer till tre och fyra lekar utan att huvudet ändras. Tabellen behåller sina kolumner per lek. Den som bara har kort ser ingenting nytt förrän en andra lek finns.</span> <span class="minus">− En flikrad till i Mall och Tabell, och lekfliken måste minnas när man byter mellan dem.</span>`,
    B: `<b>B · Växel i huvudet.</b> En växel «Kort · Landskap» står i huvudet före flikarna och byter hela editorn: Kortväggen, Mall och Tabell visar bara den valda leken. Speltema, Media, Regler, Bord och Låda är spelets och tonas ner i växeln när de är öppna.
    <br><span class="plus">+ Tydligast vilken lek man arbetar i, överallt. Flikarna inuti är exakt som i dag.</span> <span class="minus">− Huvudet är redan fullt vid 1280 (flikarna når till Spara). Två växlar på olika nivåer, och en som ibland inte gäller. En tredje lek gör växeln till en meny.</span>`,
    C: `<b>C · Kortgrupp med egen form.</b> Brickorna är en grupp i den enda leken, med egen form och egen mall. Kortväggen har gruppen som avsnitt, Mall väljer mall i en meny, och Tabell är en enda tabell med en kolumn «Grupp»; kolumner som en grupp inte använder är tomma för den.
    <br><span class="plus">+ Minst ny editor: inget nytt begrepp «lek», bara en grupp och en mall till.</span> <span class="minus">− Ljuger om det fysiska: brickorna blandas inte med korten och delas inte ut från samma hög, men står i samma tabell. Tabellen blir bred av kolumner som är tomma för halva raderna, och «leken» i Bord måste då peka på en grupp.</span>`,
  }
  let V, root, tab = 'wall', deck = 'land', menu = true, brickChoice = 'båda', shape = 'hex'
  const css = `
  .ed-scen { height: 100%; display: flex; flex-direction: column; }
  .ed-scen .m-scen { padding: 28px 12px 12px; }
  .m-skarm { width: 1280px; height: 800px; background: var(--chrome); }
  .lekar { display: flex; gap: 4px; align-items: center; }
  .lekar button { min-height: 44px; border: 1px solid var(--line); border-radius: 8px; padding: 0 12px; background: transparent; color: #dce3f2; font: inherit; font-weight: 700; cursor: pointer; display: flex; gap: 6px; align-items: center; }
  .lekar button[aria-pressed='true'] { background: #2f3a55; border-color: var(--primary-mark); color: #fff; }
  .lekar button small { font-weight: 400; color: var(--quiet-2); }
  .lekar button:focus-visible { outline: 2px solid var(--primary-mark); outline-offset: 2px; }
  .lekar .ny { border-style: dashed; color: var(--quiet-2); font-weight: 600; }
  .vaxel { display: flex; background: var(--sunk); border-radius: 8px; padding: 3px; border: 1px solid var(--line); }
  .vaxel button { min-height: 38px; border: 0; border-radius: 6px; padding: 0 10px; background: transparent; color: var(--quiet-2); font: inherit; font-weight: 700; cursor: pointer; }
  .vaxel button[aria-pressed='true'] { background: #2f3a55; color: #fff; }
  .vaxel.av { opacity: .45; }
  .vagg { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px 20px; }
  .vagg section + section { margin-top: 18px; }
  .vagg h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; font-size: 15px; color: #fff; }
  .vagg h2 small { color: var(--quiet-2); font-weight: 400; font-size: 13px; }
  .vagg h2 .m-knapp { margin-left: auto; min-height: 36px; }
  .rutor { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .rutor > button { padding: 0; border: 0; background: none; cursor: pointer; border-radius: 6px; }
  .rutor > button:focus-visible { outline: 2px solid var(--primary-mark); outline-offset: 3px; }
  .grupp-chips { display: flex; gap: 6px; margin-bottom: 12px; }
  .nylek { margin-top: 18px; display: flex; gap: 8px; align-items: center; color: var(--quiet-2); }
  .duk-yta { display: grid; place-items: center; height: 100%; position: relative; }
  .duk-yta .mallbit { position: relative; }
  .duk-yta .ram-val { position: absolute; border: 2px solid var(--primary-mark); pointer-events: none; }
  .duk-yta .ram-val i { position: absolute; width: 10px; height: 10px; background: #fff; border: 2px solid var(--primary-mark); transform: translate(-50%, -50%); }
  .formval { display: flex; gap: 4px; }
  .formval button { flex: 1; min-height: 44px; border: 1px solid var(--field-line); border-radius: 6px; background: var(--field-bg); color: #dce3f2; font: inherit; font-size: 13px; cursor: pointer; }
  .formval button[aria-pressed='true'] { border-color: var(--primary-mark); background: #2f3a55; color: #fff; }
  .t-data td.tom { color: #4b5263; text-align: center; background: #181a20; }
  .t-data td.grp { padding: 0 10px; }
  .t-data td.grp span { padding: 2px 8px; border-radius: 999px; background: #2a2f3c; font-size: 11px; }
  .t-data td .mini { display: block; margin: 0 auto; }
  .bord { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 380px minmax(0, 1fr); }
  .kol { border-right: 1px solid var(--line); overflow: auto; padding: 12px; display: grid; align-content: start; gap: 6px; }
  .remsa-spel { padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--sunk); color: #dce3f2; font-weight: 600; }
  .trad h3 { margin: 10px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--hint-ink); display: flex; align-items: center; gap: 8px; }
  .trad h3 button { margin-left: auto; width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: #fff; font-size: 18px; cursor: pointer; }
  .trad h3 button[aria-expanded='true'] { border-color: var(--primary-mark); }
  .trad .r { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 8px 0 18px; border-radius: 6px; color: #dce3f2; }
  .trad .r:hover { background: #262a35; }
  .trad .r small { margin-left: auto; color: var(--quiet-2); font-size: 11px; white-space: nowrap; }
  .trad .r .ik { width: 22px; display: grid; place-items: center; flex: none; }
  .trad .r.ny { background: rgb(125 211 160 / 8%); }
  .meny { margin: 2px 0 6px 18px; border: 1px solid #3b4358; border-radius: 10px; background: #171a23; padding: 6px; display: grid; gap: 2px; }
  .meny > button { display: flex; align-items: center; gap: 10px; min-height: 44px; border: 0; border-radius: 6px; background: transparent; color: #dce3f2; font: inherit; text-align: left; padding: 0 10px; cursor: pointer; }
  .meny > button:hover, .meny > button[aria-expanded='true'] { background: #262a35; }
  .meny > button small { margin-left: auto; color: var(--quiet-2); font-size: 11px; }
  .val2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 4px; }
  .val2 > button { display: grid; gap: 6px; align-content: start; justify-items: start; min-height: 44px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--sunk); color: #dce3f2; font: inherit; text-align: left; cursor: pointer; }
  .val2 > button:hover { border-color: var(--primary-mark); }
  .val2 b { color: #fff; }
  .val2 span { color: var(--quiet-2); font-size: 11px; line-height: 1.4; }
  .val2 em { font-style: normal; font-size: 11px; color: #ffd98a; }
  .forhand { position: relative; background: #15171c; display: grid; place-items: center; padding: 20px; }
  .forhand .filt-mini { position: relative; background: var(--plate); border: 1px solid #22262f; border-radius: 12px; }
  .forhand .filt-mini > * { position: absolute; transform: translate(-50%, -50%); }
  .forhand .lbl { position: absolute; transform: translate(-50%, 0); color: var(--chalk-off); font: 700 11px var(--felt-font); white-space: nowrap; }
  .ej { flex: 1; display: grid; place-items: center; color: var(--quiet-2); }
  `

  const tileOf = (t, px, extra = {}) => pieceSvg({ kind: 'tile', shape, mm: shape === 'round' ? { w: 44, h: 44 } : MM[shape], tile: t, up: true, ...extra }, px, { edge: false })
  const cardOf = (c, px) => pieceSvg({ kind: 'card', card: c, up: true }, px, { edge: false })
  const dmm = () => shape === 'round' ? { w: 44, h: 44 } : MM[shape]
  const deckName = () => deck === 'land' ? 'Landskap' : 'Kort'

  function header() {
    const tabs = [['wall', 'Kortvägg'], ['template', 'Mall'], ['table', 'Tabell'], ['theme', 'Speltema'], ['media', 'Media'], ['rules', 'Regler'], ['tables', 'Bord'], ['box', 'Låda']]
    const perDeck = ['wall', 'template', 'table'].includes(tab)
    const sw = V === 'B' ? `<div class="vaxel${perDeck ? '' : ' av'}" role="group" aria-label="Lek"><button data-lek="kort" aria-pressed="${deck === 'kort'}">Kort</button><button data-lek="land" aria-pressed="${deck === 'land'}">Landskap ⬡</button><button aria-label="Ny lek">＋</button></div>` : ''
    return `<header class="ed-huvud"><span class="hem">Mina spel</span><strong>Skogens råd</strong><span class="rev">v3</span>${sw}
      <nav class="ed-flikar" role="tablist" aria-label="Editorlägen">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${V === 'C' && k === 'wall' ? 'Kortvägg' : l}</button>`).join('')}</nav>
      <span class="spacer"></span><span class="sparat">Sparat</span><button class="ed-knapp primar">Starta bord</button><span class="who">NO</span></header>`
  }
  function deckTabs() {
    if (V !== 'A') return ''
    return `<div class="lekar" role="group" aria-label="Lek"><button data-lek="kort" aria-pressed="${deck === 'kort'}">Kort <small>${CARDS.length}</small></button><button data-lek="land" aria-pressed="${deck === 'land'}">Landskap ⬡ <small>${TILES.length}</small></button><button class="ny">＋ Lek</button></div>`
  }

  function wall() {
    const cards = `<section><h2>Kort <small>${CARDS.length} kort · 63 × 88 mm${V === 'C' ? ' · grupp' : ''}</small>${V === 'A' ? '<button class="m-knapp" data-go="template:kort">Mall ›</button><button class="m-knapp" data-go="table:kort">Tabell ›</button>' : ''}</h2><div class="rutor">${CARDS.map((c) => `<button aria-label="${c.namn}">${cardOf(c, 1.55)}</button>`).join('')}</div></section>`
    const land = `<section><h2>Landskap <small>${TILES.length} brickor · ${SHAPE_NAME[shape]} ${Math.round(dmm().w)} mm · vrids ${STEP[shape]}°${V === 'C' ? ' · grupp med egen form' : ''}</small>${V === 'A' ? '<button class="m-knapp" data-go="template:land">Mall ›</button><button class="m-knapp" data-go="table:land">Tabell ›</button>' : ''}</h2><div class="rutor">${TILES.map((t) => `<button aria-label="${t.namn}">${tileOf(t, 1.65)}</button>`).join('')}</div></section>`
    if (V === 'B') return `<div class="vagg">${deck === 'kort' ? cards : land}</div>`
    if (V === 'C') return `<div class="vagg"><div class="grupp-chips lekar"><button aria-pressed="true">Alla <small>24</small></button><button>Kort <small>6</small></button><button>Landskap ⬡ <small>18</small></button><button class="ny">＋ Grupp</button></div>${cards}${land}</div>`
    return `<div class="vagg">${cards}${land}<div class="nylek"><button class="m-knapp">＋ Ny lek</button><span>Kort, eller brickor i en egen form. Varje lek får sin mall och sin tabell.</span></div></div>`
  }

  function template() {
    const isLand = deck === 'land'
    const krona = `<div class="m-krona">${V === 'A' ? deckTabs() : ''}${V === 'C' ? `<label>Mall<select class="meny" data-mallval><option value="kort"${deck === 'kort' ? ' selected' : ''}>Kort (grupp Kort)</option><option value="land"${isLand ? ' selected' : ''}>Landskap ⬡ (grupp Landskap)</option></select></label>` : ''}
      <span class="sidor"><button aria-pressed="true">Framsida</button><button aria-pressed="false">Baksida</button></span><span class="spacer"></span><label>Förhandsvisa<select class="meny"><option>${isLand ? 'Granskog' : 'Rådslag'}</option></select></label></div>`
    const px = isLand ? 360 / dmm().h : 4.6
    const piece = isLand ? tileOf(TILES[0], px) : cardOf(CARDS[0], px)
    const w = isLand ? dmm().w * px : 63 * px, h = isLand ? dmm().h * px : 88 * px
    const sel = isLand ? { x: 0, y: 0.62 * h, w, h: Math.min(11, dmm().h * 0.2) * px } : { x: 5, y: h * 0.45 + 6 * px, w: w - 10, h: 10 * px }
    const layers = isLand ? [['Namn', 'kolumnen Namn', true], ['Namnband', ''], ['Värde', 'kolumnen Värde'], ['Värdets ring', ''], ['Landskapets bild', 'väljs av kolumnen Landskap (L3)']] : [['Text', 'kolumnen Text'], ['Namn', 'kolumnen Namn', true], ['Bild', 'skog']]
    const props = isLand ? `<div class="m-sek"><h3>Brickan</h3>
        <label>Form</label><div class="formval" role="group" aria-label="Form">${[['hex', '⬡ Sexhörning'], ['square', '◻ Kvadrat'], ['round', '○ Rund']].map(([k, l]) => `<button data-form="${k}" aria-pressed="${shape === k}">${l}</button>`).join('')}</div>
        <div class="m-rader"><label>${shape === 'hex' ? 'Mellan sidorna' : shape === 'round' ? 'Diameter' : 'Sida'}<input value="${Math.round(dmm().w)} mm"></label><label>Kartong<input value="2 mm"></label></div>
        <label>Vrids i steg<select><option>${STEP[shape]}° (formens)</option><option>Fritt</option></select></label>
        <label class="vaxel"><input type="checkbox" checked> Får hållas på handen, dold som ett kort</label>
        <p class="hint">Baksidan är en för hela leken. Stansarket ritas när en partner finns (F1).</p></div>
        <div class="m-sek"><h3>Lager · Namn</h3><div class="m-rader"><label>Text<input value="{Namn}"></label><label>Storlek<input value="5,6 mm"></label></div></div>`
      : `<div class="m-sek"><h3>Kortet</h3><div class="m-rader"><label>Format<input value="63 × 88 mm"></label><label>Hörn<input value="3 mm"></label></div></div><div class="m-sek"><h3>Lager · Namn</h3><div class="m-rader"><label>Text<input value="{Namn}"></label><label>Storlek<input value="7 pt"></label></div></div>`
    return `${krona}<div class="m-duk"><div class="m-verktyg"><button><b>▭</b>Ruta</button><button><b>T</b>Text</button><button><b>▣</b>Bild</button><button><b>◯</b>Form</button></div>
      <div class="m-lager"><div class="krona"><h2>Lager</h2><p>${isLand ? `Landskap · ${SHAPE_NAME[shape]}` : 'Kort'}</p></div><div class="m-lista">${layers.map(([n, src, s]) => `<div class="m-rad" tabindex="0" aria-selected="${!!s}"><span class="las"></span><span class="namn"><span>${n}</span>${src ? `<i>${src}</i>` : ''}</span><span class="grepp">⋮</span></div>`).join('')}</div><div class="fot"><b>?</b>Formen klipper varje lager</div></div>
      <div class="m-rum"><div class="m-sceneyta"><div class="duk-yta"><div class="mallbit">${piece}<div class="ram-val" style="left:${sel.x}px;top:${sel.y}px;width:${sel.w}px;height:${sel.h}px"><i style="left:0;top:0"></i><i style="left:100%;top:0"></i><i style="left:0;top:100%"></i><i style="left:100%;top:100%"></i></div></div></div></div></div>
      <div class="m-props">${props}</div></div>`
  }

  function table() {
    const krona = `<div class="t-krona">${V === 'A' ? deckTabs() : ''}<input class="t-sok" placeholder="Sök i ${V === 'C' ? 'leken' : deckName().toLowerCase()}"><div class="t-chips">${V === 'C' ? '<button class="t-chip">Grupp: alla ▾</button>' : ''}<button class="t-chip">Landskap ▾</button></div><button class="t-box">Importera ▾</button></div>`
    let head, rows
    if (V === 'C') {
      head = ['', 'Grupp', 'Id', 'Namn', 'Text', 'Landskap', 'Värde', 'Bild']
      const all = [...CARDS.map((c) => ({ g: 'Kort', id: c.id, namn: c.namn, text: c.text })), ...TILES.slice(0, 9).map((t) => ({ g: 'Landskap', id: t.id, namn: t.namn, land: t.land, varde: t.varde, t }))]
      rows = all.map((r) => `<tr><td class="bock"><input type="checkbox" aria-label="Välj ${r.namn}"></td><td class="grp"><span>${r.g}</span></td><td class="id">${r.id}</td><td><input value="${r.namn}"></td>${r.text ? `<td><input value="${r.text}"></td><td class="tom">—</td><td class="tom">—</td>` : `<td class="tom">—</td><td><input value="${LAND[r.land].namn}"></td><td><input data-tal value="${r.varde}"></td>`}<td>${r.t ? tileOf(r.t, 0.62).replace('class="bit ', 'class="bit mini ') : cardOf(CARDS.find((c) => c.id === r.id), 0.42)}</td><td class="spar"><button>×</button></td></tr>`).join('')
    } else if (deck === 'land') {
      head = ['', 'Id', 'Namn', 'Landskap', 'Värde', 'Brickan']
      rows = TILES.map((t) => `<tr><td class="bock"><input type="checkbox" aria-label="Välj ${t.namn}"></td><td class="id">${t.id}</td><td><input value="${t.namn}"></td><td><input value="${LAND[t.land].namn}"></td><td><input data-tal value="${t.varde}"></td><td>${tileOf(t, 0.66)}</td><td class="spar"><button>×</button></td></tr>`).join('')
    } else {
      head = ['', 'Id', 'Namn', 'Text', 'Kortet']
      rows = CARDS.map((c) => `<tr><td class="bock"><input type="checkbox" aria-label="Välj ${c.namn}"></td><td class="id">${c.id}</td><td><input value="${c.namn}"></td><td><input value="${c.text}"></td><td>${cardOf(c, 0.42)}</td><td class="spar"><button>×</button></td></tr>`).join('')
    }
    const widths = V === 'C' ? ['44px', '110px', '70px', '170px', '1fr', '120px', '80px', '90px'] : deck === 'land' ? ['44px', '80px', '220px', '180px', '100px', '1fr'] : ['44px', '80px', '220px', '1fr', '90px']
    const n = V === 'C' ? CARDS.length + TILES.length : deck === 'land' ? TILES.length : CARDS.length
    return `${krona}<div class="t-vy"><div class="t-rulla"><table class="t-data"><colgroup>${widths.map((w) => `<col style="width:${w === '1fr' ? 'auto' : w}">`).join('')}<col style="width:44px"></colgroup><thead><tr>${head.map((h, i) => `<th class="${i === 0 ? 'bock' : ''}">${i ? `<button class="sort"><span>${h}</span></button>` : '<input type="checkbox" aria-label="Välj alla">'}</th>`).join('')}<th class="spar"><button aria-label="Kolumner">+</button></th></tr></thead><tbody>${rows}</tbody></table></div><button class="t-ny">＋ Ny rad</button><p class="t-fot">${n} rader${V === 'C' ? '<span>två mallar, en tabell</span>' : `<span>leken ${deckName()}</span>`}</p></div>`
  }

  function tables() {
    const newDeck = V === 'A' ? 'Den blir en flik i Mall och Tabell.' : V === 'B' ? 'Den kommer i huvudets växel.' : 'Den blir en grupp med egen form.'
    const choice = menu ? `<div class="meny" role="menu" aria-label="Lägg till i Spelyta"><button role="menuitem">▭ Yta</button><button role="menuitem">▯ Hög</button><button role="menuitem">⚂ Tärning</button><button role="menuitem" aria-expanded="true">⬡ Bricka <small>två sorter</small></button>
      <div class="val2"><button data-lagg="markor"><b>Markör</b>${pieceSvg({ kind: 'coin', shape: 'round', up: true }, 1.2, { edge: false })}<span>En bild i n exemplar: mynt, skada, ett märke. Ytorna ritas på raden, som lådans.</span><em>Kostar: en rad i Bord</em></button>
      <button data-lagg="lek"><b>Hög ur en lek</b>${tileOf(TILES[0], 0.8)}<span>En bild per rad i en egen tabell. Välj leken, eller gör en ny. ${newDeck}</span><em>Kostar: en lek med mall och tabell</em></button></div></div>` : ''
    return `<div class="bord"><div class="kol"><div class="remsa-spel">4 spelare · medurs · leken i Draghög</div><div class="trad">
      <h3>Spelyta <button aria-label="Lägg till i Spelyta" aria-expanded="${menu}" data-meny>＋</button></h3>${choice}
      <div class="r"><span class="ik">▯</span>Draghög<small>leken Kort · 34</small></div>
      <div class="r"><span class="ik">▯</span>Slänghög<small>öppen</small></div>
      <div class="r ny"><span class="ik">${tileOf(TILES[2], 0.32)}</span>Landskap<small>dold hög · leken Landskap · 18</small></div>
      <div class="r ny"><span class="ik">${pieceSvg({ kind: 'coin', shape: 'round', up: true }, 0.7, { edge: false })}</span>Guld<small>markör · rund 25 mm · 20 st</small></div>
      <h3>Varje plats <button aria-label="Lägg till vid varje plats">＋</button></h3>
      <div class="r"><span class="ik">▭</span>Framför mig<small>alla ser</small></div>
      <div class="r"><span class="ik">✋</span>Handen<small>kort och brickor, dold</small></div>
      </div></div>
      <div class="forhand">${feltMini()}</div></div>`
  }
  function feltMini() {
    const s = 0.62, W = 1200 * s, H = 800 * s
    const at = (x, y) => `left:${(x + 600) * s}px;top:${(y + 400) * s}px`
    return `<div class="filt-mini" style="width:${W}px;height:${H}px">
      <div style="${at(-140, 0)}">${pieceSvg({ kind: 'card', up: false }, s, { layers: 6 })}</div><div style="${at(140, 0)}">${pieceSvg({ kind: 'card', card: CARDS[1], up: true }, s)}</div>
      <div style="${at(-310, 0)}">${pieceSvg({ kind: 'tile', shape, mm: dmm(), up: false }, s, { layers: 18 })}</div>
      <div style="${at(320, 0)}">${pieceSvg({ kind: 'coin', shape: 'round', up: true }, s, { layers: 20 })}</div>
      <span class="lbl" style="${at(-310, 42)}">Landskap · 18</span><span class="lbl" style="${at(320, 22)}">Guld · 20</span><span class="lbl" style="${at(-140, 52)}">Draghög</span><span class="lbl" style="${at(140, 52)}">Slänghög</span>
      ${[[0, 370, 500, 60], [0, -370, 500, 60], [570, 0, 60, 500], [-570, 0, 60, 500]].map(([x, y, w, h]) => `<div style="${at(x, y)};width:${w * s}px;height:${h * s}px;border:1px dashed #2f3440;border-radius:6px"></div>`).join('')}
    </div>`
  }

  function body() {
    if (tab === 'wall') return wall()
    if (tab === 'template') return template()
    if (tab === 'table') return table()
    if (tab === 'tables') return tables()
    return `<div class="ej">Inte prototypat: fliken är spelets och oförändrad.</div>`
  }

  function fit() {
    const sc = root.querySelector('.m-scen'), ram = root.querySelector('.m-ram'), sk = root.querySelector('.m-skarm')
    if (!sc) return
    const r = sc.getBoundingClientRect()
    const k = Math.min(1, (r.width - 24) / 1280, (r.height - 40) / 800)
    sk.style.transform = `scale(${k})`; ram.style.width = 1280 * k + 'px'; ram.style.height = 800 * k + 'px'
    ram.querySelector('.etikett').textContent = `Skrivbordet 1280 × 800${k < 1 ? `, visat i ${Math.round(k * 100)} %` : ''}`
  }
  function render() {
    root.innerHTML = `<style>${css}</style><div class="ed-scen"><div class="m-scen"><div class="m-ram"><span class="etikett"></span><div class="m-skarm byd-editor">${header()}${body()}</div></div></div></div>`
    fit()
    const q = (s) => root.querySelectorAll(s)
    q('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; render(); syncExtra() })
    q('[data-lek]').forEach((b) => b.onclick = () => { deck = b.dataset.lek; render() })
    q('[data-go]').forEach((b) => b.onclick = () => { const [t, d] = b.dataset.go.split(':'); tab = t; deck = d; render(); syncExtra() })
    q('[data-form]').forEach((b) => b.onclick = () => { shape = b.dataset.form; render() })
    q('[data-mallval]').forEach((s) => s.onchange = () => { deck = s.value; render() })
    q('[data-meny]').forEach((b) => b.onclick = () => { menu = !menu; render() })
  }
  let ex
  function syncExtra() {
    ex.innerHTML = `<span>Flik:</span>${[['wall', 'Kortvägg'], ['template', 'Mall'], ['table', 'Tabell'], ['tables', 'Bord']].map(([k, l]) => `<button data-xt="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}`
    ex.querySelectorAll('[data-xt]').forEach((b) => b.onclick = () => { tab = b.dataset.xt; render(); syncExtra() })
  }
  return {
    names, notes,
    render(scen, v, e) {
      V = v; root = scen; ex = e
      const qq = new URLSearchParams(location.search)
      if (qq.get('flik')) tab = qq.get('flik')
      if (qq.get('lek')) deck = qq.get('lek')
      syncExtra(); render()
    },
    resize() { if (root?.querySelector('.m-skarm')) fit() },
  }
})()
