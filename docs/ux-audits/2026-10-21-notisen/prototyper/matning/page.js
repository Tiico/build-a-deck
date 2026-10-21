// PROTOTYP — kastas (#1073). Läggs i den byggda editorn av shoot.mjs, efter att en riktig notis
// (`.byd-editor-notice`) har kommit upp. Varianterna ritas ovanpå den riktiga sidan: den riktiga
// notisen göms och en kopia med samma text står där varianten säger. Inget annat i sidan rörs.
//
//   window.__p1073.show(variant, text)   nu · a · b · c
//   window.__p1073.measure()             notisens rader och ruta, huvudet, arbetet, vad den täcker
window.__p1073 = (() => {
  const CSS = `
  .p1073-hid { display: none !important; }
  /* A · en egen rad i huvudet: under huvudets kontroller, på huvudets egen mark, i notisens färg. */
  .byd-editor > header.p1073-a-head { border-bottom: 0; }
  .p1073-a { flex: none; margin: 0; padding: 0 16px 8px; background: #23262e; border-bottom: 1px solid #2f333d; color: #f0b64a; font-size: 13px; line-height: 1.45; text-wrap: pretty; }
  /* B · ett band under huvudet, som läsbandet (D3) och bordets röda rad: en remsa per sak som ska
     sägas, med mark, tecken och kant. */
  .p1073-b { flex: none; display: flex; align-items: flex-start; gap: 12px; margin: 0; padding: 8px 16px; background: #2a2418; border-bottom: 1px solid #4a4230; color: #ffe4b0; font-size: 13px; line-height: 1.45; text-wrap: pretty; }
  .p1073-b > svg { flex: none; width: 18px; height: 18px; margin-top: 1px; color: #ffd98a; }
  /* C · en lapp som hänger under huvudets högra hörn, över arbetet, med ett × som tar bort den. */
  .p1073-c { position: fixed; z-index: 30; right: 16px; width: min(400px, calc(100vw - 32px)); box-sizing: border-box; display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 12px 8px 12px 16px; border: 1px solid #4a4230; border-left: 4px solid #f0b64a; border-radius: 10px; background: #2a2418; color: #ffe4b0; font-size: 13px; line-height: 1.45; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5); text-wrap: pretty; }
  .p1073-c > span { flex: 1; padding-top: 2px; }
  .p1073-c > button { flex: none; width: 44px; height: 44px; margin: -12px -8px -12px 0; border: 0; border-radius: 8px; background: transparent; color: #ffd98a; font-size: 18px; cursor: pointer; }
  `
  const WARN = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5"/><path d="M12 18h.01"/></svg>'
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)
  let shown = null
  const header = () => document.querySelector('.byd-editor > header')
  const real = () => document.querySelector('.byd-editor-notice')
  const reset = () => {
    document.querySelectorAll('[data-p1073]').forEach((el) => el.remove())
    real()?.classList.remove('p1073-hid')
    header().classList.remove('p1073-a-head')
  }
  return {
    show(v, text) {
      reset()
      shown = v
      const n = real()
      n.textContent = text
      if (v === 'nu') return
      n.classList.add('p1073-hid')
      const el = document.createElement(v === 'a' ? 'p' : 'div')
      el.dataset.p1073 = v
      el.setAttribute('role', 'alert')
      el.className = `p1073-${v}`
      if (v === 'a') {
        el.textContent = text
        header().classList.add('p1073-a-head')
      }
      if (v === 'b') el.innerHTML = `${WARN}<span></span>`
      if (v === 'c') el.innerHTML = `<span></span><button type="button" aria-label="Stäng">×</button>`
      if (v !== 'a') el.querySelector('span').textContent = text
      if (v === 'c') {
        el.style.top = `${header().getBoundingClientRect().bottom + 8}px`
        document.querySelector('.byd-editor').append(el)
      } else header().after(el)
    },
    measure() {
      const n = shown === 'nu' ? real() : document.querySelector('[data-p1073]')
      const words = shown === 'nu' || shown === 'a' ? n : n.querySelector('span')
      const range = document.createRange()
      range.selectNodeContents(words)
      const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)))
      const b = n.getBoundingClientRect()
      const box = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
      // What a hand could press that the notice lies over: every visible control outside the notice
      // whose box meets it, and which the browser would hand the press to the notice instead.
      const covers = []
      if (shown === 'c') {
        for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="tab"], [tabindex="0"]')) {
          if (n.contains(el) || el.getClientRects().length === 0) continue
          const r = el.getBoundingClientRect()
          const ax = Math.min(r.right, b.right) - Math.max(r.left, b.left)
          const ay = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)
          if (ax <= 0.5 || ay <= 0.5) continue
          const cx = Math.max(r.left, b.left) + ax / 2
          const cy = Math.max(r.top, b.top) + ay / 2
          if (n.contains(document.elementFromPoint(cx, cy))) covers.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30))
        }
      }
      // The words' own box, for the contrast: a short sentence on a wide band is under 1 % of it.
      const t = range.getBoundingClientRect()
      const text = { x: Math.floor(t.x), y: Math.floor(t.y), w: Math.ceil(t.width), h: Math.ceil(t.height) }
      return { lines: tops.size, box, text, covers, ink: getComputedStyle(words).color }
    },
  }
})()
