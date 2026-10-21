// PROTOTYP — kastas (#1073). Galleriets logik: växlarna, bilden, talen och matrisen, allt läst ur
// data.js, som matning/mk-data.mjs skrev av matning/shoot.mjs mätningar på den byggda appen.
const VARIANTER = [
  {
    id: 'nu',
    namn: 'Nu',
    regel: 'Notisen står i huvudets rad, efter mellanrummet och före «Spara» (#993:s yta, `.byd-editor-notice`, min-width: 0). Raden har inget rum över under 1440 — sedan #477, #566 och #668 är det uppmätt till 0–4 px — så notisen tar sitt rum från spelets namn, som har min-width 3ch, och bryts i den bredd som blir kvar.',
    pris: 'Ingen yta ger notisen mer än 187 px, och vid 1024 och 1280 aldrig mer än 128. Ångrans mening bryts på 4–10 rader i Macens typsnitt och 10–20 i det breda, där notisen blir 13–83 px bred; huvudet växer till upp till 353 px och arbetet flyttas ned lika mycket. Spelets namn klipps till «S…» (31–32 px) på varje yta där det annars läses helt, också av den korta meningen om bordet, och flikarna, ångra och «Spara» flyttar i sidled. Kontrasten är god (8,28:1), men det är det enda som håller.',
  },
  {
    id: 'a',
    namn: 'A · En egen rad i huvudet',
    regel: 'Notisen står i huvudet men på en rad av sin egen, under kontrollerna, på huvudets egen mark och i samma amber som i dag. Huvudets linje går under raden, så den läses som huvudets. Ingenting i kontrollraden rör sig när den kommer eller går. Det är vad kommentaren i editor.css sedan 2026-09-08 säger att skrivbordet ska ge den: «a whole row of its own».',
    pris: 'En rad på alla ytor, med varje mening, i båda typsnitten. Arbetet flyttas ned 27 px medan notisen står, och upp igen när den tas bort. Inget tecken och ingen egen mark: på huvudets mörka grund är det färgen ensam som säger att något gick fel, och raden ser ut som en del av huvudet snarare än något som väntar på svar.',
  },
  {
    id: 'b',
    namn: 'B · Ett band under huvudet',
    rek: true,
    regel: 'Notisen är en remsa av sin egen mellan huvudet och resten, som läsbandet (D3) och bordets röda rad när en rendering fallerat: «en remsa per sak som ska sägas» (editor-chrome-order). Amber mark (#2a2418), ett varningstecken och ljus text, och den står först, direkt under huvudet, så att den alltid står på samma ställe. Den står kvar tills den inte längre är sann, som i dag.',
    pris: 'En rad på alla ytor, med varje mening, i båda typsnitten. Arbetet flyttas ned 36 px medan bandet står — som det flyttas när bordets remsa kommer eller nätet går. Kontrasten är 12,45:1. Huvudet är orört. Det kostar en ny remsa i kromet (och en rad i editor-chrome-order.spec.ts).',
  },
  {
    id: 'c',
    namn: 'C · En lapp under huvudets högra hörn',
    regel: 'Notisen hänger i en lapp på 400 px under huvudets högra ände, över arbetet, med ett × som tar bort den. Ingenting flyttas: varken huvudet eller arbetet.',
    pris: 'Lappen bryts på 1–3 rader och ligger över en kontroll i arbetet på 306 av 336 mätningar: Kortväggens «Kontroll (1)» och «Som du ser det», AI-panelens stängning och nyckelrad. Det är den flytande remsa L58 och L67 valde bort, och den behöver ett × som notisen i dag inte har: en notis som står tills den inte längre är sann blir något man kan stänga utan att det blivit sant.',
  },
]
const BREDDER = [{ id: '1024', namn: '1024 × 768' }, { id: '1280', namn: '1280 × 800' }, { id: '1440', namn: '1440 × 900' }]
const SPRAK = [{ id: 'sv', namn: 'Svenska' }, { id: 'en', namn: 'English' }]
const TYPSNITT = [{ id: 'mac', namn: 'Macens' }, { id: 'bred', namn: 'Brett (DejaVu)' }]
const LAGEN = [{ id: 'bord', namn: 'Bord igång' }, { id: 'utan', namn: 'Inget bord' }]
const AI = [{ id: 'plain', namn: 'Utan AI-panel' }, { id: 'ai', namn: 'AI-panelen öppen' }]
const MENINGAR = [
  { id: 'undo-kortleken', namn: 'Ångra vägrades (#1056)' },
  { id: 'undo-typsnitt', namn: 'Gör om vägrades, längsta «vad»' },
  { id: 'kolumnen-1072', namn: 'Kolumnen borta (#1072, utkast)' },
  { id: 'sparning', namn: 'Sparningen gick inte igenom' },
  { id: 'avvisad-993', namn: 'En ändring avvisades (#993)' },
  { id: 'ikon', namn: 'Ikonen kunde inte läggas' },
  { id: 'bordet', namn: 'Bordet kunde inte uppdateras' },
]
const q = new URLSearchParams(location.search)
let v = q.get('v') ?? 'b'
let [b, l, f, z, a] = (q.get('yta') ?? '1024-sv-mac-bord-plain').split('-')
let k = q.get('mening') ?? 'undo-kortleken'
const yta = () => `${b}-${l}-${f}-${z}-${a}`
const ALLA = window.MATT
const cell = (vv, yy, kk) => ALLA.find((m) => m.v === vv && m.s === yy && m.key === kk)
const cells = (vv, pred = () => true) => ALLA.filter((m) => m.v === vv && pred(m))
const kort = (m) => `${m.s.replace(/-/g, ' ')} · ${m.key}`
const knappar = (rot, lista, nu, val) => {
  rot.querySelectorAll('button').forEach((x) => x.remove())
  for (const x of lista) {
    const btn = document.createElement('button')
    btn.textContent = x.namn
    if (x.rek) btn.classList.add('rek')
    btn.setAttribute('aria-pressed', String(x.id === nu))
    btn.onclick = () => val(x.id)
    rot.append(btn)
  }
}
const median = (xs) => {
  const s = [...xs].sort((p, r) => p - r)
  return s[Math.floor(s.length / 2)]
}
const spann = (xs) => {
  const lo = Math.min(...xs), hi = Math.max(...xs)
  return lo === hi ? `${lo}` : `${lo}–${hi}`
}
function rows() {
  const r = []
  const per = (fn) => VARIANTER.map((x) => fn(x.id))
  r.push(['Notisens rader: Macens typsnitt · brett (alla meningar)', per((id) => {
    const mac = cells(id, (m) => m.font === 'mac').map((m) => m.lines)
    const bred = cells(id, (m) => m.font === 'bred').map((m) => m.lines)
    const w = Math.max(...mac, ...bred)
    return { t: `${spann(mac)} · ${spann(bred)}`, c: w <= 1 ? 'ok' : w <= 3 ? 'mitt' : 'nej' }
  })])
  r.push(['Ångrans mening (#1056): rader, Macens · brett', per((id) => {
    const mac = cells(id, (m) => m.font === 'mac' && m.key === 'undo-kortleken').map((m) => m.lines)
    const bred = cells(id, (m) => m.font === 'bred' && m.key === 'undo-kortleken').map((m) => m.lines)
    const w = Math.max(...mac, ...bred)
    return { t: `${spann(mac)} · ${spann(bred)}`, c: w <= 1 ? 'ok' : w <= 3 ? 'mitt' : 'nej' }
  })])
  r.push(['Notisens bredd (värst)', per((id) => {
    const w = Math.min(...cells(id).map((m) => m.box.w))
    return { t: `${w} px`, c: w >= 300 ? 'ok' : 'nej' }
  })])
  r.push(['Huvudets höjd (57 px utan notis), värst', per((id) => {
    const h = Math.max(...cells(id).map((m) => m.headerAfter))
    return { t: `${h} px`, c: h <= 57 ? 'ok' : 'nej' }
  })])
  r.push(['Arbetet flyttas ned medan notisen står (median · värst)', per((id) => {
    const xs = cells(id).map((m) => m.workDown)
    const w = Math.max(...xs)
    return { t: `${median(xs)} · ${w} px`, c: w === 0 ? 'ok' : w <= 40 ? 'mitt' : 'nej' }
  })])
  r.push(['Spelets namn klipps av notisen (var helt innan)', per((id) => {
    const xs = cells(id, (m) => m.nameBefore.full)
    const cut = xs.filter((m) => !m.nameAfter.full)
    return cut.length ? { t: `${cut.length} av ${xs.length}, ned till ${Math.min(...cut.map((m) => m.nameAfter.w))} px («S…»)`, c: 'nej' } : { t: `nej, 0 av ${xs.length}`, c: 'ok' }
  })])
  r.push(['Något i huvudets rad flyttar eller ändrar bredd', per((id) => {
    const xs = cells(id).filter((m) => m.moved.length)
    return xs.length ? { t: `${xs.length} av ${cells(id).length} — t.ex. ${xs[0].moved.slice(0, 3).join('; ')}`, c: 'nej' } : { t: 'nej, på ingen', c: 'ok' }
  })])
  r.push(['Ligger över en kontroll i arbetet', per((id) => {
    const xs = cells(id).filter((m) => m.covers.length)
    const namn = [...new Set(xs.flatMap((m) => m.covers))].slice(0, 4)
    return xs.length ? { t: `${xs.length} av ${cells(id).length}: ${namn.join(', ')}`, c: 'nej' } : { t: 'nej', c: 'ok' }
  })])
  r.push(['Kontrast, målade pixlar (bläck mot mark)', per((id) => {
    const xs = cells(id).map((m) => m.contrast.ratio)
    const m0 = cells(id)[0].contrast
    return { t: `${spann(xs)}:1 (${m0.ink} på ${m0.ground})`, c: Math.min(...xs) >= 4.5 ? 'ok' : 'nej' }
  })])
  r.push(['AI-panelen öppen ändrar något', per((id) => {
    let d = 0
    for (const m of cells(id, (x) => x.who === 'ai')) {
      const p = cell(id, m.s.replace('-ai', '-plain'), m.key)
      if (p && (p.lines !== m.lines || p.box.w !== m.box.w || p.covers.length !== m.covers.length)) d++
    }
    return { t: d ? `ja, på ${d}` : 'nej (panelen står under huvudet)', c: d ? 'mitt' : 'ok' }
  })])
  return r
}
const visa = () => {
  history.replaceState(null, '', `?v=${v}&yta=${yta()}&mening=${k}`)
  knappar(document.querySelector('#varianter'), VARIANTER, v, (x) => { v = x; visa() })
  knappar(document.querySelector('#bredder'), BREDDER, b, (x) => { b = x; visa() })
  knappar(document.querySelector('#sprak'), SPRAK, l, (x) => { l = x; visa() })
  knappar(document.querySelector('#typsnitt'), TYPSNITT, f, (x) => { f = x; visa() })
  knappar(document.querySelector('#lagen'), LAGEN, z, (x) => { z = x; visa() })
  knappar(document.querySelector('#ai'), AI, a, (x) => { a = x; visa() })
  knappar(document.querySelector('#meningar'), MENINGAR, k, (x) => { k = x; visa() })
  const V = VARIANTER.find((x) => x.id === v)
  document.querySelector('#vnamn').textContent = V.namn + (V.rek ? ' — rekommendationen' : '')
  document.querySelector('#vregel').textContent = V.regel
  document.querySelector('#vpris').textContent = V.pris
  const m = cell(v, yta(), k)
  // Bilderna är av ångrans mening utan AI-panel; övriga ytor och meningar står i talen.
  const bild = cell(v, `${b}-${l}-${f}-${z}-plain`, 'undo-kortleken')
  const namn = `${V.namn} · ${b} · ${l} · ${TYPSNITT.find((x) => x.id === f).namn.toLowerCase()} typsnitt · ${LAGEN.find((x) => x.id === z).namn.toLowerCase()}`
  const img = document.querySelector('#bild'), lupp = document.querySelector('#lupp')
  if (bild?.f) {
    img.src = 'img/' + bild.f; img.alt = namn; img.hidden = false; document.querySelector('#bildlank').href = 'img/' + bild.f
    lupp.src = 'img/' + bild.lupp; lupp.alt = 'Huvudet och notisen förstorade: ' + namn; lupp.hidden = false
  } else { img.hidden = true; lupp.hidden = true }
  document.querySelector('#bildtext').textContent = `${namn}, med ångrans mening, utan AI-panel (den ändrar inget i huvudet). Fönstret i 1×; klicka för full storlek.`
  const t = []
  if (m) {
    t.push(['Meningen', `«${m.text}»`])
    t.push(['Rader', m.lines], ['Notisens ruta', `${m.box.w} × ${m.box.h} px vid (${m.box.x}, ${m.box.y})`])
    t.push(['Huvudet', `${m.headerBefore} → ${m.headerAfter} px`], ['Arbetet flyttas ned', `${m.workDown} px`])
    t.push(['Spelets namn', `${m.nameBefore.w} → ${m.nameAfter.w} px${m.nameAfter.full ? ', helt' : ', klippt'}${m.nameBefore.full ? '' : ' (klippt redan utan notis)'}`])
    t.push(['Flyttat i huvudet', m.moved.length ? m.moved.join('; ') : 'inget'])
    t.push(['Över kontroller', m.covers.length ? m.covers.join(', ') : 'inga'])
    t.push(['Kontrast', `${m.contrast.ratio}:1 (${m.contrast.ink} på ${m.contrast.ground})`])
    t.push(['Notisen som utlöstes', `«${m.real}»`])
  }
  document.querySelector('#tal').innerHTML = t.map(([n, x]) => `<span>${n}</span><b>${String(x).replace(/</g, '&lt;')}</b>`).join('')
  document.querySelector('#matrisforkl').textContent = `Grönt håller, rött håller inte, gult är ett pris. ${cells('nu').length} mätningar per variant: 1024 × 768, 1280 × 800 och 1440 × 900; svenska och engelska; Macens typsnitt och ett brett (Verdana, DejaVus bredd, som på CI:s Linux); Sal's Saloon med ett bord igång och utan; utan och med AI-panelen öppen; och sju meningar som står på samma yta. En riktig notis utlöstes i varje sida (bordets begäran fick falla), och meningen byttes sedan i samma element; varianterna är lagda ovanpå den riktiga sidan av matning/page.js. Kontrasten är läst ur fotograferade pixlar i meningens egen ruta. Spelets namn räknas bara där det läses helt utan notis: med Verdana är «Sal\'s Saloon» redan klippt på 16 av 48 ytor, eftersom Verdana är något bredare än DejaVu; det är riggens och inte notisens. Klicka en kolumnrubrik för att visa varianten.`
  const tab = document.querySelector('#matris')
  const head = '<thead><tr><th>Fråga</th>' + VARIANTER.map((x) => `<th class="${x.id === v ? 'valt' : ''}"><a href="?v=${x.id}&yta=${yta()}&mening=${k}" data-v="${x.id}" style="color:inherit">${x.namn}</a></th>`).join('') + '</tr></thead>'
  tab.innerHTML = head + '<tbody>' + rows().map(([fr, cs]) => `<tr><td>${fr}</td>${cs.map((c, i) => `<td class="${c.c}${VARIANTER[i].id === v ? ' valt' : ''}">${c.t}</td>`).join('')}</tr>`).join('') + '</tbody>'
  tab.querySelectorAll('a[data-v]').forEach((x) => (x.onclick = (e) => { e.preventDefault(); v = x.dataset.v; visa(); scrollTo(0, 0) }))
}
addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const i = VARIANTER.findIndex((x) => x.id === v)
  v = VARIANTER[(i + (e.key === 'ArrowRight' ? 1 : VARIANTER.length - 1)) % VARIANTER.length].id
  visa()
})
visa()
