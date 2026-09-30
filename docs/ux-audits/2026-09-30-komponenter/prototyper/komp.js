// Delad växlare för prototyperna 2026-09-30 (#617–#621). Varje sida sätter `window.PROTO` innan
// det här skriptet läses:
//   varianter  ['nu','a','b','c']
//   not        { nu: html, a: html, … }   anteckningen under växlaren
//   bredder    [1280, 1024]                skrivborden som ritas, i verklig storlek, skalade om skärmen är smalare
//   skarm(w)   html för ett skrivbord w px brett
//   matt(root, w, f)  strängar med mått lästa ur det ritade (f är skalan, för getBoundingClientRect)
//   act(namn, data, el)  klick på [data-act]; returnerar en väljare att fokusera efter omritningen, eller inget
//   input(namn, value, el)  inmatning i [data-in]
// Ingenting här importeras av appen.
const P = window.PROTO
const s = (P.s = P.s || {})
const alla = P.varianter || ['nu', 'a', 'b', 'c']
const q = new URLSearchParams(location.search).get('v')
s.v = alla.includes(q) ? q : s.v || alla[0]

P.box = (el, f) => {
  const r = el.getBoundingClientRect()
  return { x: r.x / f, y: r.y / f, w: r.width / f, h: r.height / f, r: r.right / f, b: r.bottom / f }
}
P.over = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y)) > 0

// Editorns huvud, som i skärmbilderna 2026-09-30 (#566: «Sparat» är en bock, primären «Uppdatera»).
P.huvud = (w, flik, extra = '') => {
  const flikar = ['Kortvägg', 'Mall', 'Tabell', 'Symboler', 'Media', 'Regler', 'Bord']
  return `<div class="ed-huvud"${w < 1280 ? ' data-smal' : ''}>
    <span class="hem">${w < 1280 ? '←' : 'Mina spel'}</span><strong>Sal's Saloon</strong><span class="ed-mer">···</span>
    <span class="rev">rev 1</span><span class="sparat">✓</span>
    <span class="ed-angra"><button type="button" class="ed-knapp" aria-label="Ångra">↶</button><button type="button" class="ed-knapp" aria-label="Gör om">↷</button></span>
    <div class="ed-flikar" role="tablist">${flikar.map((f) => `<button type="button" role="tab" aria-selected="${f === flik}">${f}</button>`).join('')}</div>
    <span class="who">P</span>${extra}<span class="spacer"></span>
    <button type="button" class="ed-knapp kantad">Spara</button><button type="button" class="ed-knapp primar">Uppdatera <span aria-hidden="true">▾</span></button>
  </div>`
}

export function rita(fokus) {
  for (const b of document.querySelectorAll('[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === s.v))
  const n = document.getElementById('anteckning')
  if (n) n.innerHTML = P.not[s.v] || ''
  const scen = document.getElementById('scen')
  scen.innerHTML = P.bredder
    .map((w) => `<div class="ram"><div class="etikett">${w} px</div><div class="skala" data-skala="${w}"><div class="yta byd-editor" style="width:${w}px">${P.skarm(w)}</div></div></div>`)
    .join('')
  const ut = []
  for (const sk of scen.querySelectorAll('[data-skala]')) {
    const w = Number(sk.dataset.skala)
    const f = Math.min(1, (scen.clientWidth - 32) / w)
    sk.style.transform = `scale(${f})`
    sk.parentElement.style.height = `${sk.firstElementChild.offsetHeight * f + 18}px`
    sk.parentElement.style.width = `${w * f}px`
    for (const m of P.matt(sk.firstElementChild, w, f)) ut.push(`<span><b>${w}:</b> ${m}</span>`)
  }
  document.getElementById('matt').innerHTML = ut.join('')
  if (fokus) document.querySelector(fokus)?.focus()
}
P.rita = rita

function byt(v) {
  s.v = v
  const u = new URL(location.href)
  u.searchParams.set('v', v)
  history.replaceState(null, '', u)
  P.act?.('byt', {})
  rita()
}
document.body.addEventListener('click', (e) => {
  const b = e.target.closest('button, a')
  if (!b) return
  if (b.dataset.v) return byt(b.dataset.v)
  if (b.dataset.act !== undefined) {
    e.preventDefault()
    rita(P.act?.(b.dataset.act, b.dataset, b))
  }
})
document.body.addEventListener('input', (e) => {
  const el = e.target.closest('[data-in]')
  if (!el) return
  const at = el.selectionStart
  const w = el.closest('[data-skala]')?.dataset.skala
  const namn = el.dataset.in
  P.input?.(namn, el.value, el)
  rita()
  const f = document.querySelector(`[data-skala="${w}"] [data-in="${namn}"]`)
  if (f) {
    f.focus()
    try { f.setSelectionRange(at, at) } catch {}
  }
})
document.body.addEventListener('keydown', (e) => {
  const el = e.target.closest('[data-in]')
  if (el && P.key) {
    const till = P.key(e.key, el.dataset.in, el)
    if (till !== undefined) { e.preventDefault(); rita(till) }
  }
})
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { const till = P.act?.('escape', {}); if (till !== undefined) rita(till); return }
  if (e.target.closest('input, select, textarea')) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  byt(alla[(alla.indexOf(s.v) + (e.key === 'ArrowRight' ? 1 : alla.length - 1)) % alla.length])
})
addEventListener('resize', () => rita())
rita()
