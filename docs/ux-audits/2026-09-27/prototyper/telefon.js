// Telefonramarna och växlaren för prototyperna 30–33 (#483). Ingenting här importeras av appen.
//
// En ram är en telefon i verklig storlek (390 × 844 eller 320 × 568) som skalas ner när skärmen
// är mindre. Allt som ligger över appen — ark, uppburna kort, regelboken — läggs i `skarm` med
// `position: absolute`, så att det stannar i sin telefon och inte rullar med sidan i den.
window.Telefon = (() => {
  // Samma färg per kort som `packages/web/src/table/hue.ts`.
  const hue = (ref) => { let h = 0; for (const ch of ref) h = (h * 31 + ch.charCodeAt(0)) % 360; return h }

  const ramar = []
  function ram(behallare, w, h, etikett) {
    const r = document.createElement('div')
    r.className = 'tel-ram'
    r.innerHTML = `<span class="etikett">${etikett ?? `${w} × ${h}`}</span><div class="tel-skarm"><div class="tel-vy"></div></div>`
    const skarm = r.querySelector('.tel-skarm')
    Object.assign(skarm.style, { width: `${w}px`, height: `${h}px` })
    behallare.append(r)
    const f = { r, skarm, vy: r.querySelector('.tel-vy'), w, h }
    ramar.push(f)
    return f
  }
  // Varje behållare skalas för sig; en dold behållare (en annan del på sidan) lämnas som den är.
  function skala() {
    for (const b of new Set(ramar.map((f) => f.r.parentElement))) {
      if (b.clientHeight === 0) continue
      const grupp = ramar.filter((f) => f.r.parentElement === b)
      skalaGrupp(b, grupp)
    }
  }
  function skalaGrupp(b, grupp) {
    const hojd = b.clientHeight - 30
    const bredd = b.clientWidth - 24 * (grupp.length - 1) - 8
    const summa = grupp.reduce((s, f) => s + f.w, 0)
    const k = Math.min(1, hojd / Math.max(...grupp.map((f) => f.h)), bredd / summa)
    for (const f of grupp) {
      f.skarm.style.transform = `scale(${k})`
      Object.assign(f.r.style, { width: `${f.w * k}px`, height: `${f.h * k}px` })
    }
  }
  addEventListener('resize', skala)

  // Växlaren. `delar` är { namn: ['nu', 'a', …] }; en sida med ett beslut har en del. Pilarna
  // ← → byter i den del som senast användes, utom när ett fält har fokus.
  function vaxlare(delar, rita) {
    const lage = {}
    const q = new URLSearchParams(location.search)
    for (const [del, alla] of Object.entries(delar)) lage[del] = alla.includes(q.get(del)) ? q.get(del) : alla[0]
    // Den del adressen nämner sist är den som visas och som pilarna byter i.
    let senast = Object.keys(delar).filter((d) => q.has(d)).at(-1) ?? Object.keys(delar)[0]
    const satt = (del, v) => {
      lage[del] = v; senast = del
      const u = new URL(location.href); u.searchParams.set(del, v); history.replaceState(null, '', u)
      markera(); rita(lage, true, senast)
    }
    const markera = () => {
      for (const b of document.querySelectorAll('.vaxlare [data-v]')) {
        const del = b.closest('[data-del]')?.dataset.del ?? Object.keys(delar)[0]
        b.setAttribute('aria-pressed', String(lage[del] === b.dataset.v))
      }
    }
    document.body.addEventListener('click', (e) => {
      const b = e.target.closest('.vaxlare [data-v]'); if (!b) return
      satt(b.closest('[data-del]')?.dataset.del ?? Object.keys(delar)[0], b.dataset.v)
    })
    addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select, [data-egen-pil]')) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const alla = delar[senast]
      satt(senast, alla[(alla.indexOf(lage[senast]) + (e.key === 'ArrowRight' ? 1 : alla.length - 1)) % alla.length])
    })
    markera(); rita(lage, false, senast)
    return lage
  }

  return { hue, ram, skala, vaxlare }
})()
