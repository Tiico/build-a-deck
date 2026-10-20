// PROTOTYP — kastas (#1061). Galleriets logik: växlarna, bilden, talen och matrisen, allt läst ur
// data.js, som matning/mk-data.mjs skrev av matning/shoot.mjs mätningar på den byggda appen.
const VARIANTER = [
  {
    id: 'nu',
    namn: 'Nu',
    regel: 'Frågan står i flikens fot efter räkningen (#858), och dörren hänger från huvudets sista ruta till 24 px ovanför fönstrets nederkant (L55, #46). Dörren är 366 px bred längst till höger, så fotens högra tredjedel ligger under den: frågans svar, och fotens tysta rad om sorteringen.',
    pris: '10 av 36 ytor har ett svar under dörren, 4 av dem båda. Vid 1024 i den täta leken når pekaren varken «Ja, ta bort» eller «Avbryt» när frågan gäller body — en kolumn mallen ritar, så frågan får en mening till — också på Macen. Vid 1280 ligger «Avbryt» under dörren i det breda typsnittet och på engelska; vid 1440 på engelska i brett typsnitt är det 3 px kvar. I provleken är dörren kort och når inte foten. Fotens tysta rad ligger under dörren på 16 ytor. Ögat går 433 px (median) från ×:et till frågan. Och när frågan öppnas glider raden man just tryckte 53–76 px under handen på 12 ytor: formuläret under listan göms och listans rullning kläms, så att ett annat × hamnar under pekaren.',
  },
  {
    id: 'a',
    namn: 'A · Dörren slutar ovanför foten',
    regel: 'Dörrens rum mäts mot flikens fot och inte mot fönstrets: dess nederkant står 8 px ovanför fotens linje så länge dörren står, frågad eller inte. Frågan står kvar i foten precis som #858 lade den. I bygget får placement.ts en golvlinje (fotens överkant) i stället för fönstrets höjd; inget annat ändras.',
    pris: 'Alla 36 ytor nås. Dörren förlorar en rad av listan vid varje bredd (7→6, 8→7 och 10→9 i den täta leken), och när frågan gör foten 31 px högre krymper dörren med den medan frågan står. Ögat och handen går lika långt som i dag (433 · 483 px), och raden glider fortfarande 76 px på 12 ytor. Ändrar L55:s regel att dörren tar resten av fönstret; #858 står kvar.',
  },
  {
    id: 'b',
    namn: 'B · Frågan står i dörren',
    rek: true,
    regel: 'Frågan står i dörren, i det ställe formuläret «Ny kolumn» lämnar medan en kolumn frågas om (det göms redan, #858), och raden vars × frågade står markerad i frågans färg. Övriga rader är släckta och inerta medan frågan står (L58: inget kan tryckas av misstag bakom den). Foten säger ingenting; den tysta raden och meningen om kolumnerna utanför står kvar. Samma Question-komponent, samma ord, samma fokus på «Avbryt».',
    pris: 'Alla 36 ytor nås. Ögat går 87 px (median, värst 322) och handen 227 (värst 423), mot 433 och 483 i dag. Foten växer inte (0 px mot 31), och dess tysta rad och meningen om kolumnerna utanför står kvar. Raden står still utom vid 1440 med den korta frågan (12–30 px), där listan kläms när formuläret går — i bygget tas raden in i bild i samma ögonblick. Frågan bryter på upp till tre rader i dörrens 340 px. Priset: #858:s tillägg i L58, «kolumndörrens × frågar också där», skrivs om — frågan står där handlingen gjordes, som Question själv säger att den ska, men inte i foten där radens och markeringens frågor står. Fokusfällan kan stå kvar medan frågan står, eftersom frågan är i dörren.',
  },
  {
    id: 'c',
    namn: 'C · Dörren går undan medan frågan står',
    regel: 'Frågan står i foten som i dag, och dörren göms medan den står: handtaget blir ＋ igen och säger aria-expanded="false". Svaret öppnar dörren där den var (samma rullning), och «Avbryt» lämnar fokus på ×:et i den, som i dag.',
    pris: 'Alla 36 ytor nås. Men dörren och dess lista försvinner i samma ögonblick som ×:et trycks — det man just pekade på är borta — och ögat måste hitta frågan 433 px bort (median). Svaret öppnar dörren igen, ett hopp till. Handtaget säger «stängd» fast ingen stängde den, och foten växer 31 px som i dag.',
  },
  {
    id: 'd',
    namn: 'D · Foten håller sig undan dörren',
    regel: 'Medan dörren står slutar fotens innehåll 12 px före dörrens vänsterkant. Frågan får bryta sin mening på flera rader i stället för att gå in under dörren, och den tysta raden (sorteringen) viker för frågan som meningen om kolumnerna utanför redan gör (#695).',
    pris: 'Alla 36 ytor nås, men foten blir upp till 32 px högre än utan fråga: vid 1024 bryter frågan på tre rader i det rum som blir kvar till vänster om dörren, och den tysta raden måste vika på alla ytor. Ögat går längst av alla (439 px), eftersom frågan krymper åt vänster bort från dörren. Raden glider som i dag.',
  },
]
const BREDDER = [
  { id: '1024', namn: '1024 × 768' },
  { id: '1280', namn: '1280 × 800' },
  { id: '1440', namn: '1440 × 900' },
]
const SPRAK = [{ id: 'sv', namn: 'Svenska' }, { id: 'en', namn: 'English' }]
const TYPSNITT = [{ id: 'mac', namn: 'Macens' }, { id: 'bred', namn: 'Brett (DejaVu)' }]
const LEKAR = [
  { id: 'tat-stamning', namn: 'Tät · stämning (kort fråga)' },
  { id: 'tat-body', namn: 'Tät · body (lång fråga)' },
  { id: 'prov-body', namn: 'Provleken · body' },
]
const q = new URLSearchParams(location.search)
let v = q.get('v') ?? 'b'
let [b, l, f, d] = (() => {
  const p = (q.get('yta') ?? '1024-sv-bred-tat-stamning').split('-')
  return [p[0], p[1], p[2], `${p[3]}-${p[4]}`]
})()
const yta = () => `${b}-${l}-${f}-${d}`
const ALLA = window.MATT
const cell = (vv, yy) => ALLA.find((m) => m.v === vv && m.s === yy)
const cells = (vv, pred = () => true) => ALLA.filter((m) => m.v === vv && pred(m))
const kort = (s) => s.replace('-tat-', ' tät ').replace('-prov-', ' prov ').replace('stamning', 'stämning').replace(/-/g, ' ')
const knappar = (rot, lista, nu, val) => {
  rot.querySelectorAll('button').forEach((x) => x.remove())
  for (const x of lista) {
    const k = document.createElement('button')
    k.textContent = x.namn
    if (x.rek) k.classList.add('rek')
    k.setAttribute('aria-pressed', String(x.id === nu))
    k.onclick = () => val(x.id)
    rot.append(k)
  }
}
const spann = (xs) => {
  const lo = Math.min(...xs), hi = Math.max(...xs)
  return lo === hi ? `${lo}` : `${lo}–${hi}`
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
function rows() {
  const r = []
  const per = (fn) => VARIANTER.map((x) => fn(x.id))
  const n = cells('nu').length
  r.push([`«Ja, ta bort» och «Avbryt» nås med pekaren (elementFromPoint i knappens mitt, ${n} ytor)`, per((id) => {
    const xs = cells(id)
    const fel = xs.filter((m) => !m.jaOk || !m.avbrytOk)
    const ingen = xs.filter((m) => !m.jaOk && !m.avbrytOk)
    if (!fel.length) return { t: `ja, alla ${xs.length}`, c: 'ok' }
    return { t: `${fel.length} av ${xs.length} har ett svar under dörren${ingen.length ? `, ${ingen.length} båda` : ''} — t.ex. ${fel.slice(0, 3).map((m) => kort(m.s)).join('; ')}`, c: 'nej' }
  })])
  r.push(['Fokus när frågan öppnas · efter «Avbryt»', per((id) => {
    const xs = cells(id)
    const a = [...new Set(xs.map((m) => m.focus.replace(/^.*\((.*)\)$/, 'Avbryt, i $1')))]
    const z = [...new Set(xs.map((m) => `${/^(Ta bort fältet|Remove the field) /.test(m.after.focus) ? 'kolumnens ×' : m.after.focus} i ${m.after.doorOpen ? 'öppen dörr' : 'stängd dörr'}`))]
    return { t: `${a.join(' / ')} · ${z.join(' / ')}`, c: 'ok' }
  })])
  r.push(['Skärmläsaren hör, och var', per((id) => {
    const m = cell(id, '1024-sv-mac-tat-stamning')
    const where = id === 'b' ? 'i gruppen «Kolumner», efter raden den gäller' : 'i fliken, efter «308 av 308 kort»'
    return { t: `${m.said.replace(/:\n[\s\S]*$/, '').replace(/^alertdialog /, 'alertdialog ')} — ${where}`, c: 'ok' }
  })])
  r.push(['Ögat: från ×:et till frågan (median · värst)', per((id) => {
    const xs = cells(id).map((m) => m.eye)
    const md = median(xs)
    return { t: `${md} px · ${Math.max(...xs)} px`, c: md < 120 ? 'ok' : md < 250 ? 'mitt' : 'nej' }
  })])
  r.push(['Handen: från ×:et till «Avbryt» (median · värst)', per((id) => {
    const xs = cells(id).map((m) => m.hand)
    const md = median(xs)
    return { t: `${md} px · ${Math.max(...xs)} px`, c: md < 250 ? 'ok' : md < 400 ? 'mitt' : 'nej' }
  })])
  r.push(['Raden glider under handen när frågan öppnas (värst)', per((id) => {
    const xs = cells(id).filter((m) => m.drift !== null)
    if (!xs.length) return { t: 'dörren går undan: raden syns inte alls medan frågan står', c: 'mitt' }
    const w = xs.reduce((a, m) => (Math.abs(m.drift) > Math.abs(a.drift) ? m : a))
    const k = xs.filter((m) => m.drift !== 0).length
    return { t: w.drift === 0 ? 'nej, 0 px på alla' : `${w.drift} px (${kort(w.s)}); på ${k} av ${xs.length} ytor`, c: w.drift === 0 ? 'ok' : 'nej' }
  })])
  r.push(['Rader i dörrens lista som syns, tät lek (1024 · 1280 · 1440, före → under frågan)', per((id) => {
    const t = ['1024', '1280', '1440'].map((w) => { const m = cell(id, `${w}-sv-mac-tat-stamning`); return `${m.seenBefore}→${m.seen}` })
    const nu = ['1024', '1280', '1440'].map((w) => cell('nu', `${w}-sv-mac-tat-stamning`).seenBefore)
    const a = ['1024', '1280', '1440'].map((w) => cell(id, `${w}-sv-mac-tat-stamning`).seenBefore)
    return { t: t.join(' · '), c: a.some((x, i) => x < nu[i]) ? 'mitt' : 'ok' }
  })])
  r.push(['Foten växer när frågan öppnas (värst) · fotens tysta rad syns', per((id) => {
    const xs = cells(id)
    const w = Math.max(...xs.map((m) => m.footGrew))
    const q = xs.filter((m) => m.quiet !== 'ok')
    const qt = id === 'd' ? 'viker för frågan' : q.length ? `under dörren på ${q.length} av ${xs.length}` : 'ja, på alla'
    return { t: `${w} px · ${qt}`, c: w > 0 || q.length ? (w > 40 || q.length ? 'nej' : 'mitt') : 'ok' }
  })])
  r.push(['Frågans meningsrader (värst)', per((id) => {
    const xs = cells(id)
    const w = xs.reduce((a, m) => (m.qLines > a.qLines ? m : a))
    return { t: `${w.qLines} (${kort(w.s)})`, c: w.qLines <= 2 ? 'ok' : 'mitt' }
  })])
  r.push(['Tabellens första rad flyttar sig (#858:s krav)', per((id) => {
    const xs = cells(id).filter((m) => m.tableMoved !== 0)
    return xs.length ? { t: `ja, på ${xs.length}`, c: 'nej' } : { t: 'nej, 0 px på alla', c: 'ok' }
  })])
  return r
}
const visa = () => {
  history.replaceState(null, '', `?v=${v}&yta=${yta()}`)
  knappar(document.querySelector('#varianter'), VARIANTER, v, (x) => { v = x; visa() })
  knappar(document.querySelector('#bredder'), BREDDER, b, (x) => { b = x; visa() })
  knappar(document.querySelector('#sprak'), SPRAK, l, (x) => { l = x; visa() })
  knappar(document.querySelector('#typsnitt'), TYPSNITT, f, (x) => { f = x; visa() })
  knappar(document.querySelector('#lekar'), LEKAR, d, (x) => { d = x; visa() })
  const V = VARIANTER.find((x) => x.id === v)
  document.querySelector('#vnamn').textContent = V.namn + (V.rek ? ' — rekommendationen' : '')
  document.querySelector('#vregel').textContent = V.regel
  document.querySelector('#vpris').textContent = V.pris
  const m = cell(v, yta())
  const namn = `${V.namn} · ${BREDDER.find((x) => x.id === b).namn} · ${l} · ${TYPSNITT.find((x) => x.id === f).namn.toLowerCase()} typsnitt · ${LEKAR.find((x) => x.id === d).namn.toLowerCase()}`
  const img = document.querySelector('#bild'), lupp = document.querySelector('#lupp')
  if (m?.f) {
    img.src = 'img/' + m.f; img.alt = namn; img.hidden = false; document.querySelector('#bildlank').href = 'img/' + m.f
    lupp.src = 'img/' + m.lupp; lupp.alt = 'Frågan förstorad: ' + namn; lupp.hidden = false
    document.querySelector('#lupptext').textContent = '×:ets rad, frågan och foten, i 2×.'
  } else {
    img.hidden = true; lupp.hidden = true
    document.querySelector('#lupptext').textContent = ''
  }
  document.querySelector('#bildtext').textContent = m?.f ? `${namn}. Fönstret i 1×; klicka för full storlek.` : `${namn}: mätt men inte fotograferad — bilder finns för svenska i den täta leken i båda typsnitten vid alla tre bredderna, och för engelska vid 1024 i det breda typsnittet med den långa frågan. Talen står till höger.`
  const t = []
  if (m) {
    t.push(['Frågan', `«${m.qText}»`])
    t.push(['Frågans rader', m.qLines])
    for (const a of m.answers) t.push([`«${a.t}» med pekaren`, a.hit === 'ok' ? 'nås' : a.hit])
    t.push(['Svarat med', m.svar])
    t.push(['Fokus när frågan öppnas', m.focus])
    t.push(['Fokus efter «Avbryt»', `${m.after.focus}, dörren ${m.after.doorOpen ? 'öppen' : 'stängd'}`])
    t.push(['Skärmläsaren', m.said.split('\n')[0].replace(/:$/, '')])
    t.push(['Ögat: × → frågan', `${m.eye} px`], ['Handen: × → «Avbryt»', `${m.hand} px`])
    t.push(['Raden glider', m.drift === null ? '— (dörren dold)' : `${m.drift} px`])
    t.push(['Rader i dörren (före → under)', `${m.seenBefore} → ${m.seen} av ${m.total}`])
    t.push(['Dörren', m.door ? `${m.door.w} × ${m.door.h} px, nederkant ${m.door.y + m.door.h}` : 'dold'])
    t.push(['Foten', `${m.foot.h} px hög (${m.footGrew >= 0 ? '+' : ''}${m.footGrew} px av frågan), överkant ${m.foot.y}`])
    t.push(['Fotens tysta rad', m.quiet === 'ok' ? `syns, ${m.quietLines} rad${m.quietLines === 1 ? '' : 'er'}` : m.quiet === 'osynlig' ? 'viker' : m.quiet])
    t.push(['Tabellens första rad', m.tableMoved === 0 ? 'står still' : `${m.tableMoved} px`])
  }
  document.querySelector('#tal').innerHTML = t.map(([k, n]) => `<span>${k}</span><b>${String(n).replace(/</g, '&lt;')}</b>`).join('')
  document.querySelector('#matrisforkl').textContent = `Grönt håller, rött håller inte, gult är ett pris. ${cells('nu').length} ytor per variant: 1024 × 768, 1280 × 800 och 1440 × 900; svenska och engelska; Macens typsnitt och ett brett (Verdana, DejaVus bredd, satt innan tabellen mäter sig); den täta leken (308 kort, elva fält) med frågan om stämning — som mallen inte ritar — och om body, som mallen ritar och som därför får en mening till, och provleken med frågan om body. Dörren öppnas med pekaren, raden rullas in i dörrens lista, ×:et trycks med pekaren och «Avbryt» trycks med pekaren när den går att nå (annars från tangentbordet). Ögat mäts från ×:ets mitt till frågans närmaste kant, handen till «Avbryt»:s mitt. Tre mätningar gick parallellt på samma lek, så huvudet säger «3 inne» i bilderna; vid 1280 i det breda typsnittet gör det att sidan rullar 10–42 px i sidled i alla varianter, vilket alltså är riggens och inte frågans. Klicka en kolumnrubrik för att visa varianten.`
  const tab = document.querySelector('#matris')
  const head = '<thead><tr><th>Fråga</th>' + VARIANTER.map((x) => `<th class="${x.id === v ? 'valt' : ''}"><a href="?v=${x.id}&yta=${yta()}" data-v="${x.id}" style="color:inherit">${x.namn}</a></th>`).join('') + '</tr></thead>'
  tab.innerHTML = head + '<tbody>' + rows().map(([fr, cs]) => `<tr><td>${fr}</td>${cs.map((c, i) => `<td class="${c.c}${VARIANTER[i].id === v ? ' valt' : ''}">${c.t}</td>`).join('')}</tr>`).join('') + '</tbody>'
  tab.querySelectorAll('a[data-v]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); v = a.dataset.v; visa(); scrollTo(0, 0) }))
}
addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const i = VARIANTER.findIndex((x) => x.id === v)
  v = VARIANTER[(i + (e.key === 'ArrowRight' ? 1 : VARIANTER.length - 1)) % VARIANTER.length].id
  visa()
})
visa()
