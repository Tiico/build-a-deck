// Injected into the real built app by shoot.mjs, once per variant and surface (#675). Nothing here
// is the product: each variant's surface is laid over what the app drew — the app's own classes
// where they exist (byd-primary, byd-secondary, byd-join, byd-login), new rules where they don't —
// and then measured. The address is the box's public one, «deck.ockelberg.com», never the stack's
// 127.0.0.1, because that is what a TV in a living room would say.
;(() => {
  const HOST = 'deck.ockelberg.com'
  const style = (text) => {
    const s = document.createElement('style')
    s.textContent = text
    document.head.append(s)
  }
  const html = (text) => {
    const t = document.createElement('template')
    t.innerHTML = text.trim()
    return t.content.firstElementChild
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  // Shared look of a code field: six characters, wide-set, upper case, read as a code.
  style(`
    .p675-code input { font: 700 24px/1 ui-monospace, 'SF Mono', Menlo, monospace; letter-spacing: 0.3em; text-transform: uppercase; text-align: center; min-height: 56px; }
    .p675-code input[aria-invalid='true'] { border-color: #e05a4f; }
    .p675-alert { margin: 0; color: #ffb3a8; font-size: 15px; line-height: 1.45; }
    .p675-lead { margin: 0; color: #9aa3b8; font-size: 15px; line-height: 1.5; }
    .p675-boxes { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
    .p675-boxes input { padding: 0 !important; min-width: 0; width: 100%; height: 56px; text-align: center; font: 700 24px/1 ui-monospace, 'SF Mono', Menlo, monospace; text-transform: uppercase; }
  `)

  // The form /join shows without a code, and with one the server does not know. The same form in
  // every variant that has it: what differs is where else it stands.
  function codeForm({ value = '', error = null, boxes = false, heading = 'Gå in vid ett bord', button = 'Fortsätt' } = {}) {
    const field = boxes
      ? `<div class="p675-boxes" role="group" aria-label="Rumskod">${[0, 1, 2, 3, 4, 5].map((i) => `<input data-m="field" aria-label="Tecken ${i + 1} av 6" maxlength="1" autocapitalize="characters" value="${esc(value[i] ?? '')}"${error ? ' aria-invalid="true"' : ''}>`).join('')}</div>`
      : `<input data-m="field" name="code" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" value="${esc(value)}"${error ? ' aria-invalid="true" aria-describedby="p675-err"' : ''}>`
    return `
      <main class="byd-join p675-nocode" data-page="join" data-p675>
        <header><h1>${heading}</h1></header>
        <form class="p675-code" onsubmit="event.preventDefault(); location.assign('/join?code=' + encodeURIComponent([...this.querySelectorAll('input')].map((i) => i.value).join('')))">
          <p class="p675-lead">Skriv rumskoden som står på bordets skärm.</p>
          <label class="byd-join-name"><span>Rumskod</span>${field}</label>
          ${error ? `<p class="p675-alert" id="p675-err" role="alert">${error}</p>` : ''}
          <button type="submit" class="byd-primary" data-m="go">${button}</button>
        </form>
      </main>`
  }
  const NOCODE_CSS = `
    .p675-nocode { grid-template-rows: auto auto; align-content: start; }
    .p675-nocode > header h1 { font-size: 26px; }
    .p675-nocode form { gap: 14px !important; }
    @media (min-width: 700px) { .p675-nocode { max-width: 520px; margin: 0 auto; padding-top: 18vh; } }
  `
  const replaceRoot = (markup) => {
    const root = document.querySelector('#root')
    for (const c of [...root.children]) if (!c.matches('.byd-status-live, .byd-texture-lost')) c.style.display = 'none'
    root.prepend(html(markup))
  }

  // ── /join with a live code ──────────────────────────────────────────────────────────────────
  // Every variant says the game's name: the session record carries it (GET /sessions/:id).
  function joinHead(game, code) {
    // The page's own dark behind a column narrower than the window.
    style(`html, body { background: #14161c; }`)
    const head = document.querySelector('.byd-join > header')
    const seat = head.querySelector('span:last-of-type')?.textContent ?? ''
    head.querySelector('h1').textContent = game
    head.querySelector('h1').dataset.m = 'game'
    head.querySelector('span').textContent = 'Du är på väg in i'
    head.querySelector('span:last-of-type').textContent = `Rum ${code} · ${seat}`
  }

  const V = {}

  // ── A · /join är dörren ──────────────────────────────────────────────────────────────────────
  V.a = {
    start() {
      style(`
        .byd-account { grid-auto-flow: row; align-content: center; gap: 16px; }
        .p675-playlink { width: min(420px, 100%); box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; padding: 12px 20px; border-radius: 14px; border: 1px solid #262a35; color: #cdd4e4; text-decoration: none; font: 600 16px system-ui, sans-serif; }
        .p675-playlink b { color: #fff; }
      `)
      document.querySelector('.byd-account').append(html(`<a class="p675-playlink" data-m="go" href="/join"><span>Ska du spela? <b>Skriv rumskoden</b></span><span aria-hidden="true">→</span></a>`))
    },
    nokod: () => { style(NOCODE_CSS); replaceRoot(codeForm()) },
    okand: () => { style(NOCODE_CSS); replaceRoot(codeForm({ value: 'ZZZZZZ', error: 'Det finns inget bord med koden <b>ZZZZZZ</b>. Jämför tecknen med bordets skärm.' })) },
    join(s, c) {
      joinHead(c.game, c.code)
      style(`@media (min-width: 700px) { .byd-join { max-width: 520px; margin: 0 auto; } }`)
    },
    tv() {
      style(`
        .p675-addr { flex: 1 0 100%; font-size: 24px; font-weight: 700; color: #e6ecfa; margin: -10px 0 0; overflow-wrap: anywhere; }
      `)
      const row = document.querySelector('.byd-tv-join')
      row.querySelector('span').textContent = 'anslut med telefonen på'
      row.querySelector('span').after(html(`<p class="p675-addr" data-m="address">${HOST}/join</p>`))
    },
    bord(s, c) {
      style(`
        .byd-table-plate { display: flex; gap: 18px; align-items: baseline; }
        .p675-plate-join { font-size: 18px; opacity: 1; color: #fff7e6; }
        .p675-plate-join b { font-family: ui-monospace, monospace; letter-spacing: 2px; }
        .byd-table-plate { opacity: 1 !important; }
        .byd-table-plate > span:first-child { opacity: 0.7; }
      `)
      const plate = document.querySelector('.byd-table-plate')
      plate.textContent = ''
      plate.append(html(`<span>${esc(c.game)} · rev-1</span>`))
      plate.append(html(`<span class="p675-plate-join" data-m="address">Anslut på ${HOST}/join med koden <b data-m="code">${c.code}</b></span>`))
    },
  }

  // ── B · Två dörrar på startsidan ─────────────────────────────────────────────────────────────
  const PLAY_CARD = (button = 'Gå in') => `
    <section class="byd-login p675-play" aria-labelledby="p675-play-h">
      <h2 id="p675-play-h">Spela vid ett bord</h2>
      <p class="byd-muted">Skriv rumskoden som står på bordets skärm. Inget konto behövs.</p>
      <form class="p675-code" onsubmit="event.preventDefault(); location.assign('/join?code=' + encodeURIComponent(this.querySelector('input').value))">
        <label class="byd-login-email"><span>Rumskod</span><input data-m="field" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false"></label>
        <button type="submit" class="byd-primary" data-m="go">${button}</button>
      </form>
    </section>`
  V.b = {
    start() {
      style(`
        .byd-account { grid-auto-flow: row; align-content: center; gap: 16px; }
        .p675-play h2 { margin: 0; font-size: 22px; }
        .p675-play .p675-code input { font-size: 22px; }
        @media (min-width: 900px) { .byd-account { grid-auto-flow: column; align-items: stretch; justify-content: center; } .byd-login { align-content: start; } }
      `)
      const acc = document.querySelector('.byd-account')
      // The guest's card first: on a phone that is who is holding it.
      acc.prepend(html(PLAY_CARD()))
      document.querySelector('.byd-login:not(.p675-play) h1').insertAdjacentHTML('afterend', '<h2 style="margin:0;font-size:18px">Gör ett eget spel</h2>')
    },
    nokod() {
      style(`.byd-account { align-content: center; } .p675-play h2 { margin: 0; font-size: 22px; } .p675-play .p675-code input { font-size: 22px; }`)
      replaceRoot(`<main class="byd-account" data-p675>${PLAY_CARD()}</main>`)
    },
    okand() {
      style(`.byd-account { align-content: center; } .p675-play h2 { margin: 0; font-size: 22px; } .p675-play .p675-code input { font-size: 22px; }`)
      replaceRoot(`<main class="byd-account" data-p675>${PLAY_CARD()}</main>`)
      const input = document.querySelector('.p675-play input')
      input.value = 'ZZZZZZ'
      input.setAttribute('aria-invalid', 'true')
      input.closest('label').after(html(`<p class="byd-login-error p675-alert" role="alert">Det finns inget bord med koden <b>ZZZZZZ</b>. Jämför tecknen med bordets skärm.</p>`))
    },
    join(s, c) {
      joinHead(c.game, c.code)
      // Two columns where there is room: the table on the left, who you are and the ways in on
      // the right — the form no longer 1 240 px wide, the picker no longer floating in a void.
      style(`
        @media (min-width: 900px) {
          .byd-join { max-width: 960px; margin: 0 auto; grid-template-columns: minmax(0, 1fr) 400px; grid-template-rows: auto auto; row-gap: 32px; column-gap: 48px; align-content: center; }
          .byd-join > header { grid-column: 1 / -1; }
          .byd-join-table { grid-column: 1; grid-row: 2; transform: scale(1.25); }
          .byd-join > form { grid-column: 2; grid-row: 2; align-self: center; }
        }
      `)
    },
    tv(s, c) {
      // The address is the start page itself — the shortest thing the room can be asked to type —
      // and the square grows to where a phone can read it from the sofa.
      style(`
        .p675-addr { flex: 1 0 100%; font-size: 28px; font-weight: 700; color: #e6ecfa; margin: -10px 0 0; }
        [data-tv] .byd-tv-join img.byd-qr { width: 128px !important; height: 128px !important; }
      `)
      const row = document.querySelector('.byd-tv-join')
      row.querySelector('span').textContent = 'anslut med telefonen på'
      row.querySelector('span').after(html(`<p class="p675-addr" data-m="address">${HOST}</p>`))
      const qr = row.querySelector('img.byd-qr')
      if (qr) { qr.dataset.m = 'qr'; qr.width = 128; qr.height = 128 }
    },
    bord(s, c) {
      // A corner of its own, opposite «Starta om»: the square (pressable — a laptop on a table is
      // pressed), the address and the code, on the wood and not on the felt.
      style(`
        .p675-corner { position: fixed; left: 12px; bottom: 12px; z-index: 4; display: grid; grid-template-columns: auto auto; gap: 2px 12px; align-items: center; padding: 10px 14px 10px 10px; border-radius: 14px; background: rgba(12, 14, 18, 0.88); border: 1px solid #3a3226; color: #f3e9d6; font-family: 'Roboto Condensed', system-ui, sans-serif; }
        .p675-corner button { grid-row: 1 / span 2; padding: 0; border: 0; background: #fff; border-radius: 6px; cursor: zoom-in; width: 72px; height: 72px; }
        .p675-corner button img { width: 72px; height: 72px; display: block; }
        .p675-corner .p675-a { font-size: 16px; }
        .p675-corner .p675-k { font: 700 22px ui-monospace, monospace; letter-spacing: 3px; }
      `)
      const src = qrSrc
      document.body.append(html(`<div class="p675-corner" data-m="chip"><button type="button" aria-label="Förstora QR-koden"><img alt="" src="${src}" data-m="qr"></button><span class="p675-a" data-m="address">${HOST}</span><span class="p675-k" data-m="code">${c.code}</span></div>`))
    },
  }

  // ── C · Koden är adressen ────────────────────────────────────────────────────────────────────
  V.c = {
    start() {
      style(`
        .byd-account { grid-auto-flow: row; align-content: center; gap: 14px; }
        .p675-inline { width: min(420px, 100%); box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 10px; padding: 0 4px; }
        .p675-inline > span { grid-column: 1 / -1; color: #cdd4e4; font: 700 13px system-ui, sans-serif; }
        .p675-inline input { min-width: 0; box-sizing: border-box; padding: 0 12px; height: 52px; border-radius: 12px; border: 1px solid var(--byd-secondary-line); background: var(--byd-account-field-bg); color: #fff; font: 700 20px ui-monospace, monospace; letter-spacing: 0.25em; text-transform: uppercase; }
        .p675-inline button { height: 52px; padding: 0 18px; border-radius: 12px; font: 700 16px system-ui, sans-serif; }
      `)
      document.querySelector('.byd-account').append(html(`<form class="p675-inline" onsubmit="event.preventDefault(); location.assign('/' + this.querySelector('input').value.toUpperCase())"><span>Ska du spela? Skriv rumskoden</span><input data-m="field" aria-label="Rumskod" maxlength="8" autocapitalize="characters" autocomplete="off"><button type="submit" class="byd-secondary" data-m="go">Gå in</button></form>`))
    },
    nokod: () => { style(NOCODE_CSS); replaceRoot(codeForm()) },
    okand: () => { style(NOCODE_CSS); replaceRoot(codeForm({ value: 'ZZZZZZ', error: 'Det finns inget bord med koden <b>ZZZZZZ</b>. Jämför tecknen med bordets skärm.' })) },
    join(s, c) {
      joinHead(c.game, c.code)
      // The page as a card on the dark, the same form as the login card it sits beside.
      style(`
        @media (min-width: 700px) {
          .byd-join { background: #0f1117; display: grid; place-items: center; }
          .byd-join > * { width: 520px; }
          .byd-join { grid-template-rows: auto auto auto; align-content: center; gap: 0; padding: 32px; }
          .byd-join > header, .byd-join > .byd-join-table, .byd-join > form { background: #171a23; border-inline: 1px solid #262a35; box-sizing: border-box; padding: 0 32px; }
          .byd-join > header { border-top: 1px solid #262a35; border-radius: 20px 20px 0 0; padding-top: 28px; text-align: center; }
          .byd-join > .byd-join-table { margin: 0 !important; width: 520px !important; border-radius: 0; box-shadow: none; background: #171a23; height: 240px; display: block; position: relative; }
          .byd-join > form { border-bottom: 1px solid #262a35; border-radius: 0 0 20px 20px; padding-bottom: 28px; }
        }
      `)
      // The felt itself is drawn by the table's own rules; the card only frames it, so it is moved
      // into a wrapper of its own here rather than restyled.
      const t = document.querySelector('.byd-join-table')
      if (innerWidth >= 700) {
        const wrap = html('<div class="byd-join-table-wrap"></div>')
        t.replaceWith(wrap)
        wrap.append(t)
        style(`.byd-join-table-wrap { width: 520px; box-sizing: border-box; background: #171a23; border-inline: 1px solid #262a35; padding: 46px 0; display: grid; place-items: center; }`)
      }
    },
    tv(s, c) {
      // One address, said as one: the host and the code on two lines that read as one string.
      style(`
        .p675-addr { flex: 1 0 100%; margin: -10px 0 0; font-size: 24px; font-weight: 700; color: #e6ecfa; }
        [data-tv] .byd-tv-join strong { font-size: 40px; letter-spacing: 8px; }
        .p675-addr-code::before { content: '/'; color: #7d8597; margin-right: 4px; letter-spacing: 0; }
      `)
      const row = document.querySelector('.byd-tv-join')
      row.querySelector('span').textContent = 'öppna på telefonen'
      row.querySelector('span').after(html(`<p class="p675-addr" data-m="address">${HOST}</p>`))
      const code = row.querySelector('strong')
      code.classList.add('p675-addr-code')
      code.dataset.m = 'code'
    },
    bord(s, c) {
      style(`
        .byd-table-plate { display: flex; gap: 18px; align-items: baseline; opacity: 1 !important; }
        .byd-table-plate > span:first-child { opacity: 0.7; }
        .p675-plate-join { font-size: 20px; color: #fff7e6; }
        .p675-plate-join b { font-family: ui-monospace, monospace; letter-spacing: 2px; }
      `)
      const plate = document.querySelector('.byd-table-plate')
      plate.textContent = ''
      plate.append(html(`<span>${esc(c.game)} · rev-1</span>`))
      plate.append(html(`<span class="p675-plate-join" data-m="address">${HOST}/<b data-m="code">${c.code}</b></span>`))
    },
  }

  // ── D · Inbjudan på filten ───────────────────────────────────────────────────────────────────
  // At rest, before anyone has touched a card, the table's screen is mostly an invitation: the
  // square big enough to read across the room, the address and the code. It folds away at the
  // first move (or when every seat is taken) into the column's row, as in A.
  const INVITE = (c, src, qr, tv) => `
    <div class="p675-invite${tv ? ' p675-invite-tv' : ''}" data-m="invite" role="region" aria-label="Anslut till bordet">
      <img alt="QR-kod till rummet ${c.code}" src="${src}" width="${qr}" height="${qr}" data-m="qr">
      <div>
        <p class="p675-i-lead">Anslut med telefonen</p>
        <p class="p675-i-addr" data-m="address">${HOST}/join</p>
        <p class="p675-i-code">kod <b data-m="code">${c.code}</b></p>
        <p class="p675-i-or">eller läs av rutan</p>
        ${tv ? '' : '<button type="button" class="p675-i-close">Stäng</button>'}
      </div>
    </div>`
  V.d = {
    start() {
      // One card, two tabs. The tab that is open first follows the screen: a phone is usually a
      // guest, a desk usually a designer (L12). Either is one press from the other.
      style(`
        .p675-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 14px; background: #0f1117; border: 1px solid #262a35; }
        .p675-tabs button { min-height: 44px; border-radius: 10px !important; border: 0; background: transparent; color: #9aa3b8; font: 700 15px system-ui, sans-serif; padding: 0 !important; }
        .p675-tabs button[aria-selected='true'] { background: #262b38; color: #fff; }
      `)
      const card = document.querySelector('.byd-login')
      const phone = innerWidth < 768
      card.querySelector('h1').after(html(`<div class="p675-tabs" role="tablist"><button role="tab" data-m="tab" aria-selected="${phone}">Spela</button><button role="tab" data-m="tab" aria-selected="${!phone}">Logga in</button></div>`))
      if (phone) {
        for (const el of card.querySelectorAll(':scope > p[data-pitch], :scope > .byd-help-row, :scope > form')) el.style.display = 'none'
        card.querySelector('.p675-tabs').after(html(`<form class="p675-code" style="display:grid;gap:10px" onsubmit="event.preventDefault(); location.assign('/join?code=' + encodeURIComponent(this.querySelector('input').value))"><p class="byd-muted">Skriv rumskoden som står på bordets skärm.</p><label class="byd-login-email"><span>Rumskod</span><input data-m="field" maxlength="8" autocapitalize="characters" autocomplete="off"></label><button type="submit" class="byd-primary" data-m="go">Gå in</button></form>`))
      }
    },
    nokod: () => { style(NOCODE_CSS); replaceRoot(codeForm({ boxes: true })) },
    okand: () => { style(NOCODE_CSS); replaceRoot(codeForm({ boxes: true, value: 'ZZZZZZ', error: 'Det finns inget bord med koden <b>ZZZZZZ</b>. Jämför tecknen med bordets skärm.' })) },
    join(s, c) {
      joinHead(c.game, c.code)
      style(`@media (min-width: 700px) { .byd-join { max-width: 520px; margin: 0 auto; } }`)
      // On a screen that can hold a table, playing here is the suggested way, and «Sätt dig» says
      // what it assumes: a TV in the room.
      if (innerWidth >= 1024) {
        const f = document.querySelector('.byd-join form')
        const sit = f.querySelector('button[type=submit]')
        const here = f.querySelector('.byd-join-online')
        sit.className = 'byd-secondary'
        sit.textContent = 'Sätt dig vid TV:n (handen på den här skärmen)'
        here.className = 'byd-join-online byd-primary'
        here.textContent = 'Spela på den här skärmen'
        here.dataset.m = 'go'
        f.insertBefore(here, sit)
        // The first way in in the size the first way in has, the second in the size a second has.
        style(`.byd-join form .byd-join-online { font-size: 18px !important; } .byd-join form button[type=submit] { font-size: 15px !important; }`)
      }
    },
    tv(s, c) {
      const src = document.querySelector('img.byd-qr')?.src ?? ''
      V.a.tv(s, c)
      style(`
        .p675-invite { position: absolute; z-index: 5; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; gap: 32px; align-items: center; padding: 28px 36px; border-radius: 24px; background: #0d0f14; border: 1px solid #2f3646; box-shadow: 0 24px 60px rgba(0,0,0,.55); color: #e6ecfa; white-space: nowrap; }
        .p675-invite img { background: #fff; border-radius: 12px; padding: 0; }
        .p675-invite p { margin: 0; }
        .p675-i-lead { font-size: 28px; color: #9aa3b8; }
        .p675-i-addr { font-size: 36px; font-weight: 800; margin-top: 6px !important; }
        .p675-i-code { font-size: 28px; color: #9aa3b8; margin-top: 10px !important; }
        .p675-i-code b { font: 800 56px ui-monospace, monospace; letter-spacing: 8px; color: #fff; margin-left: 10px; }
        .p675-i-or { font-size: 24px; color: #7d8597; margin-top: 10px !important; }
      `)
      const main = document.querySelector('[data-tv] > main')
      main.style.position = 'relative'
      main.append(html(INVITE(c, src, innerWidth >= 1600 ? 300 : 220, true)))
      if (innerWidth < 1600) style(`.p675-invite { gap: 24px; padding: 22px 26px; } .p675-i-addr { font-size: 28px; } .p675-i-code b { font-size: 44px; } .p675-i-lead, .p675-i-code { font-size: 24px; }`)
    },
    bord(s, c) {
      V.a.bord(s, c)
      const src = qrSrc
      style(`
        .p675-invite { position: fixed; z-index: 5; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; gap: 24px; align-items: center; padding: 22px 26px; border-radius: 20px; background: #0d0f14; border: 1px solid #3a3226; box-shadow: 0 24px 60px rgba(0,0,0,.55); color: #f3e9d6; white-space: nowrap; font-family: 'Roboto Condensed', system-ui, sans-serif; }
        .p675-invite img { background: #fff; border-radius: 10px; }
        .p675-invite p { margin: 0; }
        .p675-i-lead { font-size: 18px; opacity: .8; }
        .p675-i-addr { font-size: 26px; font-weight: 700; margin-top: 4px !important; }
        .p675-i-code { font-size: 18px; opacity: .8; margin-top: 8px !important; }
        .p675-i-code b { font: 800 36px ui-monospace, monospace; letter-spacing: 6px; margin-left: 8px; }
        .p675-i-or { font-size: 16px; opacity: .7; margin-top: 6px !important; }
        .p675-i-close { margin-top: 14px; min-height: 44px; padding: 0 18px; border-radius: 999px; border: 1px solid #c9b48f; background: transparent; color: #f3e9d6; font: 700 16px 'Roboto Condensed', system-ui, sans-serif; }
      `)
      document.body.append(html(INVITE(c, src, 200, false)))
    },
  }

  // Table mode draws no QR of its own, so the square is made here from the same address the TV's
  // would carry, with the qrcode library the app already ships — fetched from the bundle? No: the
  // driver passes it in as a data URL (shoot.mjs makes it with the same library).
  let qrSrc = ''

  window.__p675 = {
    place(v, s, c) {
      qrSrc = c.qr ?? ''
      if (v === 'nu') return {}
      const kind = s.split('-')[0]
      const f = V[v]?.[kind]
      if (f) f(s, c)
      return {}
    },
    measure(s) {
      const kind = s.split('-')[0]
      const r = (el) => el.getBoundingClientRect()
      const visible = (el) => { const b = r(el); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[style*="display: none"]') }
      const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null)
      const out = { s }
      const text = document.body.innerText
      // The room's code, wherever this surface says it.
      const addr = [...document.querySelectorAll('[data-m=address]')].find(visible)
      const code = [...document.querySelectorAll('[data-m=code], .byd-tv-join strong')].find(visible)
      const qr = [...document.querySelectorAll('[data-m=qr], .byd-tv-join img.byd-qr')].find(visible)
      out.address = addr ? addr.textContent.trim() : null
      out.addrPx = addr ? Math.round(px(addr.firstChild?.nodeType === 1 ? addr.firstChild : addr) * 10) / 10 : null
      if (addr) {
        // Does the address keep its line when the text is 15 % wider, as on Linux (DejaVu)?
        const range = document.createRange(); range.selectNodeContents(addr)
        const rects = [...range.getClientRects()]
        const wide = Math.max(...rects.map((x) => x.width)) * 1.15
        const host = addr.parentElement
        const cs = getComputedStyle(host)
        const room = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        const lines = rects.reduce((n, x, i) => n + (i > 0 && x.top - rects[i - 1].top > parseFloat(getComputedStyle(addr).fontSize) * 0.6 ? 1 : 0), 1)
        out.addrLines = lines
        out.addrW = Math.round(Math.max(...rects.map((x) => x.width)))
        const invite = addr.closest('[data-m=invite]')
        // In the invitation the box grows with its text, so the room is what the felt leaves it;
        // in table mode's top line it is the window to the right of where the address starts.
        out.addrRoom = Math.round(invite ? invite.parentElement.clientWidth - (r(invite).width - out.addrW) - 32 : kind === 'bord' ? innerWidth - r(addr).left - 12 : room)
        out.addrFits15 = lines === 1 && wide <= out.addrRoom
      }
      out.codePx = code ? Math.round(px(code)) : null
      out.qrPx = qr ? Math.round(r(qr).width) : null
      if (kind === 'tv') {
        const ins = document.querySelector('.byd-tv-inspect')
        out.inspectH = ins ? Math.round(r(ins).height) : null
        // The smallest text in the TV's column, against K26's 24 px floor.
        const aside = document.querySelector('[data-tv] > aside')
        const sizes = [...aside.querySelectorAll('*')].filter((e) => visible(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => ({ t: e.textContent.trim().slice(0, 24), p: px(e) }))
        const joinSizes = sizes.filter((x) => document.querySelector('.byd-tv-join')?.contains(aside.querySelector(':scope *')) || true)
        out.joinMinPx = Math.min(...[...document.querySelectorAll('.byd-tv-join *, [data-m=invite] *')].filter((e) => visible(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map(px))
      }
      if (kind === 'tv' || kind === 'bord') {
        // What the way in lies on: zones, cards, hands, the felt's own words.
        const over = []
        const mine = [...document.querySelectorAll('[data-m=chip], [data-m=invite], .byd-table-plate')].filter(visible)
        const things = [...document.querySelectorAll('.byd-zone, .byd-card, [data-hand], .byd-zone-name, .byd-pile-label')].filter(visible)
        for (const m of mine) {
          const a = r(m)
          for (const t of things) {
            const b = r(t)
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) over.push((t.getAttribute('aria-label') || t.dataset.zone || t.className || '').toString().slice(0, 40))
          }
        }
        out.over = over.length
        out.overWhat = [...new Set(over)].slice(0, 6)
      }
      if (kind === 'start' || kind === 'nokod' || kind === 'okand' || kind === 'join') {
        // Controls a thumb has to hit, against the 44 px floor; the help «?» is the help pattern's
        // own business (L32) and is reported apart.
        const controls = [...document.querySelectorAll('input, button, a, select, [role=tab]')].filter((e) => visible(e) && !e.closest('[hidden]'))
        const small = controls.filter((e) => !e.matches('.byd-help-ask') && Math.min(r(e).height, r(e).width) < 44)
        out.minTap = Math.round(Math.min(...controls.filter((e) => !e.matches('.byd-help-ask')).map((e) => Math.min(r(e).height, r(e).width))))
        out.under44 = small.map((e) => `${e.tagName.toLowerCase()}${e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label') + ']' : ''} ${Math.round(r(e).width)}×${Math.round(r(e).height)}`).slice(0, 8)
        const field = [...document.querySelectorAll('[data-m=field]')].find(visible)
        out.codeField = field ? { top: Math.round(r(field).top), h: Math.round(r(field).height), inView: r(field).bottom <= innerHeight } : null
        const go = [...document.querySelectorAll('[data-m=go]')].find(visible)
        out.goInView = go ? r(go).bottom <= innerHeight : null
        const email = document.querySelector('.byd-login input[type=email]')
        out.loginField = email && visible(email) ? { top: Math.round(r(email).top), inView: r(email).bottom <= innerHeight } : null
        out.scrollH = document.documentElement.scrollHeight
      }
      if (kind === 'join') {
        const form = document.querySelector('.byd-join form')
        const head = document.querySelector('.byd-join > header')
        const felt = document.querySelector('.byd-join-table')
        out.formW = form ? Math.round(r(form).width) : null
        out.headX = head ? Math.round(r(head.querySelector('h1')).left) : null
        out.feltCx = felt ? Math.round(r(felt).left + r(felt).width / 2) : null
        out.gameShown = text.includes("Sal's Saloon")
        const primary = document.querySelector('.byd-join form .byd-primary')
        out.primary = primary ? primary.textContent.trim() : null
        out.goBottom = form ? Math.round(r(form).bottom) : null
      }
      return out
    },
  }
})()
