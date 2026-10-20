// PROTOTYP — kastas (#1061). Körs i den byggda editorns Tabell-flik av shoot.mjs. Lägger varje
// variant ovanpå den riktiga dörren och den riktiga foten (samma komponenter, samma stilmall, samma
// fråga — svaren i B och C är de riktiga knapparna, tryckta genom ombud) och mäter sedan.
//
//   window.__p1061.wide()            editorns text i Verdana (DejaVus bredd), som på CI:s Linux
//   window.__p1061.arm('nu'|'a'|'b'|'c'|'d')
//   window.__p1061.before(field)     läget innan ×:et trycks: radens y, ×:ets mitt, tabellens första rad
//   window.__p1061.measure()
;(() => {
  const style = (css) => {
    const s = document.createElement('style')
    s.setAttribute('data-p1061', '')
    s.textContent = css
    document.head.append(s)
  }
  const foot = () => document.querySelector('[role="tabpanel"]:not([hidden]) .byd-crown-foot')
  const door = () => document.querySelector('.byd-columns')
  const handle = () => document.querySelector('.byd-data thead .byd-data-remove > button')
  const realAsk = () => foot()?.querySelector('[role="alertdialog"]') ?? null
  const rect = (el) => {
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  let variant = 'nu'
  let asked = null
  // Which column's × was pressed: the question names it, but the variants need to know where it is.
  document.addEventListener('click', (event) => {
    const x = event.target.closest?.('.byd-columns .byd-data-dropfield')
    if (x) asked = x.closest('li')?.dataset.col ?? null
  }, true)

  // ── A · Dörren slutar ovanför foten ─────────────────────────────────────────────────────────
  // Rummet dörren mäter är inte fönstrets fot utan flikens: dess nederkant står 8 px (s2) ovanför
  // fotens linje så länge dörren står, frågad eller inte. I bygget är det placement.ts som får en
  // golvlinje (fotens topp) i stället för fönstrets höjd.
  const fitA = () => {
    const d = door()
    const f = foot()
    if (!d || !f) return
    const cs = getComputedStyle(d)
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
    const room = f.getBoundingClientRect().top - 8 - d.getBoundingClientRect().top - pad
    d.style.setProperty('max-height', `${Math.max(120, Math.floor(room))}px`, 'important')
  }

  // ── B · Frågan står i dörren ────────────────────────────────────────────────────────────────
  // Frågan står i dörren, i formulärets ställe längst ned (formuläret göms redan medan en kolumn
  // frågas om, #858), och raden vars × frågade står markerad i frågans färg; foten säger ingenting.
  // Övriga rader är släckta och inerta medan den står, som verktygsraden i foten (L58: inget kan tryckas av misstag
  // bakom frågan). Svaren är ombud för de riktiga knapparna, så att det som händer efteråt — vart
  // fokus går, vad som tas bort — är appens eget.
  let mine = null
  const dropB = () => {
    mine?.remove()
    mine = null
    door()?.removeAttribute('data-p1061-asking')
    document.querySelectorAll('[data-p1061-asked]').forEach((el) => el.removeAttribute('data-p1061-asked'))
    document.querySelectorAll('.byd-columns-list > li[inert]').forEach((el) => el.removeAttribute('inert'))
  }
  const askB = () => {
    const real = realAsk()
    const d = door()
    if (!real || !d || mine) return
    const row = d.querySelector(`.byd-columns-list > li[data-col="${CSS.escape(asked ?? '')}"]`)
    if (!row) return
    const [yes, no] = [...real.querySelectorAll('button')]
    const li = document.createElement('div')
    li.className = 'p1061-ask'
    const box = document.createElement('div')
    box.setAttribute('role', 'alertdialog')
    box.setAttribute('aria-label', real.getAttribute('aria-label'))
    const p = document.createElement('p')
    p.textContent = real.querySelector('p').textContent
    const answers = document.createElement('div')
    answers.className = 'p1061-answers'
    const proxy = (of, kind) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = of.textContent
      if (kind) b.dataset.kind = kind
      b.addEventListener('click', () => {
        dropB()
        of.click()
      })
      return b
    }
    const ja = proxy(yes, 'danger')
    const avbryt = proxy(no)
    answers.append(ja, avbryt)
    box.append(p, answers)
    box.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      dropB()
      no.click()
    })
    li.append(box)
    mine = li
    d.append(li)
    row.setAttribute('data-p1061-asked', '')
    d.setAttribute('data-p1061-asking', '')
    for (const other of d.querySelectorAll('.byd-columns-list > li')) if (other !== row && other !== li) other.setAttribute('inert', '')
    row.scrollIntoView({ block: 'nearest' })
    avbryt.focus({ preventScroll: true })
  }

  // ── C · Dörren stängs medan frågan står ────────────────────────────────────────────────────
  // Frågan står i foten som i dag, och dörren går undan medan den står: handtaget blir ＋ igen.
  // Svaret öppnar dörren igen där den var (samma rullning), och «Avbryt» lämnar fokus på ×:et.
  const hideC = (on) => {
    const d = door()
    const h = handle()
    if (!d || !h) return
    if (on) {
      d.style.setProperty('display', 'none', 'important')
      h.dataset.p1061 = h.textContent
      h.textContent = '+'
      h.setAttribute('aria-expanded', 'false')
    } else {
      d.style.removeProperty('display')
      if (h.dataset.p1061) h.textContent = h.dataset.p1061
      delete h.dataset.p1061
      h.setAttribute('aria-expanded', 'true')
    }
  }
  // Before React answers: the × the focus goes back to must be drawn when the answer lands.
  const reopenFirst = (event) => {
    if (variant !== 'c') return
    if (!event.target.closest?.('.byd-crown-foot [role="alertdialog"]')) return
    if (event.type === 'keydown' && event.key !== 'Escape' && event.key !== 'Enter' && event.key !== ' ') return
    hideC(false)
  }
  document.addEventListener('click', reopenFirst, true)
  document.addEventListener('keydown', reopenFirst, true)

  // ── D · Foten håller sig undan dörren ──────────────────────────────────────────────────────
  // Medan dörren står slutar fotens innehåll 12 px före dörrens vänsterkant, och frågan får bryta
  // sin mening på två rader i stället för att gå in under dörren. Den tysta raden (sorteringen)
  // viker för frågan, som meningen om kolumnerna utanför redan gör (#695).
  const padD = () => {
    const f = foot()
    const d = door()
    if (!f) return
    if (!d || getComputedStyle(d).display === 'none') return f.style.removeProperty('padding-right')
    const free = Math.ceil(f.getBoundingClientRect().right - d.getBoundingClientRect().left + 12)
    f.style.setProperty('padding-right', `${Math.max(0, free)}px`, 'important')
  }

  const tick = () => {
    if (variant === 'a') fitA()
    if (variant === 'b') {
      if (realAsk() && door()) askB()
      else if (mine && !realAsk()) dropB()
    }
    if (variant === 'c') {
      const asking = !!realAsk()
      const hidden = door()?.style.display === 'none'
      if (asking && door() && !hidden) hideC(true)
      if (!asking && hidden) hideC(false)
    }
    if (variant === 'd') padD()
  }
  // Once per task and never inside React's commit: what the variants do to the page is itself a
  // mutation, and answered as a microtask it would answer itself.
  let queued = false
  const later = () => {
    if (queued) return
    queued = true
    setTimeout(() => {
      queued = false
      tick()
    }, 0)
  }
  new MutationObserver(later).observe(document.body, { subtree: true, childList: true })
  window.addEventListener('resize', tick)

  window.__p1061 = {
    wide() {
      style(".byd-editor *, .byd-columns * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }")
    },
    arm(v) {
      variant = v
      if (v === 'b') {
        style(`
          html body .byd-crown-foot [role='alertdialog'] { display: none !important; }
          html body .byd-columns[data-p1061-asking] .byd-columns-list > li[inert] { opacity: 0.38; }
          html body .byd-columns-list > li[data-p1061-asked] { padding-left: 6px; border-radius: 8px; background: #3d2632; box-shadow: inset 0 0 0 1px #7a3243; }
          html body .byd-columns-list > li[data-p1061-asked] .byd-data-dropfield { color: #ff8fa3; }
          html body .byd-columns > .p1061-ask { flex: 0 0 auto; display: block; padding: 10px 12px 12px; border: 1px solid #7a3243; border-radius: 8px; background: #3d2632; color: #ffe4ea; }
          html body .p1061-ask p { margin: 0 0 8px; font-size: 12px; font-weight: 700; line-height: 1.4; }
          html body .p1061-answers { display: flex; gap: 8px; flex-wrap: wrap; }
          html body .p1061-answers button { min-height: var(--byd-tap, 44px); padding: 4px 12px; border: 1px solid #3b414e; border-radius: 8px; background: transparent; color: #e6ecfa; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
          html body .p1061-answers button[data-kind='danger'] { background: #7a3243; border-color: #7a3243; color: #ffe4ea; }
          html body .p1061-answers button:focus-visible { outline: 2px solid var(--byd-editor-primary-mark, #6ea8ff); outline-offset: 2px; }
        `)
      }
      if (v === 'd') {
        style(`
          html body .byd-crown-foot .byd-data-bulk[role='alertdialog'] { flex: 0 1 auto; min-width: 0; }
          html body .byd-crown-foot .byd-data-bulk[role='alertdialog'] p { min-width: 12ch; }
          html body .byd-crown-foot .byd-data-bulk[role='alertdialog'] button { flex: none; }
          html body .byd-crown-foot:has([role='alertdialog']) .byd-data-sort { display: none; }
        `)
      }
      tick()
    },
    before(field) {
      const row = door()?.querySelector(`.byd-columns-list > li[data-col="${CSS.escape(field)}"]`)
      row?.scrollIntoView({ block: 'nearest' })
      const x = row?.querySelector('.byd-data-dropfield')
      const first = document.querySelector('.byd-data tbody tr')
      const list = door()?.querySelector('.byd-columns-list')
      const lr = list?.getBoundingClientRect()
      const seen = list ? [...list.querySelectorAll(':scope > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.top >= lr.top - 0.5 && r.bottom <= lr.bottom + 0.5 }).length : 0
      return { footH: foot() ? Math.round(foot().getBoundingClientRect().height) : null, row: row ? rect(row) : null, x: x ? rect(x) : null, first: first ? rect(first).y : null, door: door() ? rect(door()) : null, seen, total: list?.children.length ?? 0 }
    },
    measure() {
      const q = [...document.querySelectorAll('[role="alertdialog"]')].find((el) => el.checkVisibility())
      const f = foot()
      const d = door()
      const doorShown = !!d && d.checkVisibility()
      const hit = (el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0) return 'osynlig'
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return 'utanför fönstret'
        const at = document.elementFromPoint(cx, cy)
        if (at === el || el.contains(at)) return 'ok'
        const over = at?.closest('.byd-columns') ? 'dörren' : at?.closest('.byd-crown-foot') ? 'foten' : (at?.className || at?.tagName || '?')
        return `täckt av ${over}${at?.textContent ? ` («${at.textContent.trim().slice(0, 24)}»)` : ''}`
      }
      const answers = q ? [...q.querySelectorAll('button')].map((b) => ({ t: b.textContent.trim(), r: rect(b), hit: hit(b) })) : []
      const lines = (el) => {
        if (!el) return 0
        const range = document.createRange()
        range.selectNodeContents(el)
        return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top + r.height / 2))).size
      }
      const parts = f ? [...f.querySelectorAll(':scope > *, :scope > .byd-foot-quiet > *')].filter((el) => !el.classList.contains('byd-foot-quiet') && el.checkVisibility() && el.getBoundingClientRect().width > 0) : []
      const footRows = new Set(parts.map((el) => { const r = el.getBoundingClientRect(); return Math.round((r.top + r.height / 2) / 4) })).size
      const quiet = f?.querySelector('.byd-data-sort')
      const count = f?.querySelector('.byd-data-count')
      const a = document.activeElement
      const where = a?.closest('.byd-columns') ? 'dörren' : a?.closest('.byd-crown-foot') ? 'foten' : a === document.body ? 'body' : 'annat'
      const list = d?.querySelector('.byd-columns-list')
      const lr = list?.getBoundingClientRect()
      const seen = doorShown && list ? [...list.querySelectorAll(':scope > li:not(.p1061-ask)')].filter((li) => { const r = li.getBoundingClientRect(); return r.top >= lr.top - 0.5 && r.bottom <= lr.bottom + 0.5 }).length : 0
      const row = asked && d ? d.querySelector(`.byd-columns-list > li[data-col="${CSS.escape(asked)}"]`) : null
      const x = row?.querySelector('.byd-data-dropfield')
      const first = document.querySelector('.byd-data tbody tr')
      const qp = q?.querySelector('p')
      return {
        asked,
        q: q ? rect(q) : null,
        qText: qp?.textContent ?? '',
        qLines: lines(qp),
        answers,
        focus: a ? `${a.textContent.trim().slice(0, 20) || a.getAttribute('aria-label') || a.tagName} (${where})` : null,
        door: doorShown ? rect(d) : null,
        foot: f ? rect(f) : null,
        footRows,
        quiet: quiet ? hit(quiet) : 'saknas',
        quietText: quiet?.textContent ?? '',
        quietLines: quiet && quiet.checkVisibility() ? lines(quiet) : 0,
        count: count ? hit(count) : 'saknas',
        seen,
        row: row && doorShown ? rect(row) : null,
        x: x && doorShown ? rect(x) : null,
        first: first ? rect(first).y : null,
        sidled: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    },
  }
})()
