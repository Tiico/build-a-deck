// Injected into the real built editor by shoot.mjs, once per variant and state (#1010). Nothing
// here is the product. Every answer and every flag on the screen is read here, in the page, from
// the server the editor itself talks to — `/projects/:id/sessions`, `/projects/:id/versions`,
// `/sessions/:id/surveys` and `/sessions/:id/export` with the designer's own cookie — so a variant
// shows what the server would hand the real build, and what it cannot be handed is visible too.
// React's own nodes are never removed: a variant adds its nodes beside them, and `clear()` takes
// them away again.
;(() => {
  const QUESTIONS = [
    { k: 'fun', name: 'Kul', q: 'Hur kul var det?', low: 'segt', high: 'jättekul' },
    { k: 'clarity', name: 'Tydlighet', q: 'Hur tydliga var reglerna?', low: 'förvirrande', high: 'glasklara' },
    { k: 'balance', name: 'Balans', q: 'Hur balanserat kändes det?', low: 'någon körde över', high: 'jämnt' },
  ]
  // What is not a move in the game: who sits where, what is said about the game, and the ending.
  const NOT_PLAY = new Set(['seat.claim', 'seat.release', 'flag', 'session.end', 'rewind.propose', 'rewind.reject', 'rewind.confirm', 'undo.self', 'version.change', 'setup.reset'])
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const dec = (x) => (x === null || Number.isNaN(x) ? '–' : x.toFixed(1).replace('.', ','))
  const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(1).replace('.', ',')
  const clock = (iso) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const get = async (path) => {
    const res = await fetch(path, { credentials: 'include' })
    if (!res.ok) throw new Error(`${path}: ${res.status}`)
    return res.json()
  }
  // The room code an ended table is called by (#706). The list leaves it out once the table no
  // longer admits; the table's own owner connection still says it, which is how the row gets it.
  const roomCode = (id) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sessions/${encodeURIComponent(id)}?owner=1`)
      const done = (code) => {
        try {
          ws.close()
        } catch {}
        resolve(code)
      }
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data))
        if (m.t === 'room') done(m.code)
      }
      setTimeout(() => done(null), 3000)
    })

  // ── The model ─────────────────────────────────────────────────────────────────────────────
  let M = null
  async function load() {
    const project = new URLSearchParams(location.search).get('project')
    const [list, versions] = await Promise.all([get(`/projects/${encodeURIComponent(project)}/sessions`), get(`/projects/${encodeURIComponent(project)}/versions`)])
    const tables = await Promise.all(
      list.map(async (t) => {
        const [surveys, exp, code] = await Promise.all([t.ended ? get(`/sessions/${encodeURIComponent(t.id)}/surveys`) : [], get(`/sessions/${encodeURIComponent(t.id)}/export`), roomCode(t.id)])
        return { ...t, code: t.code ?? code, rev: Number(t.version.replace('rev-', '')), surveys, ...readLog(exp.log, surveys) }
      }),
    )
    M = { project, versions, tables, latest: Math.max(...versions.map((v) => v.rev)), diffs: {} }
    // What changed between a tested version and the one tested before it, in card names: the
    // same difference the history's «Jämför» reads (`/versions/:rev/diff?from=`).
    const doc = await get(`/projects/${encodeURIComponent(project)}`)
    const titles = Object.fromEntries((doc.rows ?? []).map((r) => [r.id, r.fields?.title ?? r.id]))
    for (const rev of new Set(tables.map((t) => t.rev))) {
      const prev = previousWith(rev)
      const d = await get(`/projects/${encodeURIComponent(project)}/versions/${rev}/diff${prev ? `?from=${prev}` : ''}`).catch(() => null)
      if (!d) continue
      const n = (k) => d.rows.filter((r) => r.kind === k)
      const parts = []
      if (n('changed').length) { const ns = n('changed').map((r) => titles[r.cardRef] ?? r.cardRef); parts.push(`${ns.length > 1 ? ns.slice(0, -1).join(', ') + ' och ' + ns.at(-1) : ns[0]} ${ns.length > 1 ? 'ändrade' : 'ändrat'}`) }
      if (n('added').length) parts.push(`${n('added').length} kort tillagda`)
      if (n('removed').length) parts.push(`${n('removed').length} kort borttagna`)
      if (d.setup) parts.push('uppställningen ändrad')
      if (d.template) parts.push('mallen ändrad')
      if (d.rules) parts.push('reglerna ändrade')
      if (d.icons) parts.push('symbolerna ändrade')
      M.diffs[rev] = { from: prev, words: parts.join(' · ') || 'inget ändrat' }
    }
    return { tables: tables.map((t) => ({ code: t.code, rev: t.rev, ended: t.ended, answers: t.surveys.length, flags: t.flags.length, people: t.people.length, moves: t.moves })), versions: versions.length }
  }
  // Who sat where, what was a move, and every flag with who raised it and when in the game. The
  // log carries seats and not names, so a seat's name is the last `seat.claim` before the line.
  function readLog(log, surveys) {
    const names = {}
    const people = []
    const meet = (name, seat, observer) => {
      if (!people.some((p) => p.name === name && p.observer === observer)) people.push({ name, seat, observer })
    }
    let moves = 0
    let last = null
    const flags = []
    const said = (l) => {
      const who = l.by ? names[l.by] ?? `plats ${l.by}` : 'bordet'
      const it = l.intent
      if (it.v === 'draw') return `${who} drog ${it.count === 1 ? 'ett kort' : `${it.count} kort`}`
      if (it.v === 'move') return it.to === 'discard' ? `${who} kastade ett kort` : it.to.startsWith('mine:') ? `${who} lade ett kort framför sig` : `${who} flyttade ett kort`
      if (it.v === 'deal') return 'korten delades ut'
      if (it.v === 'shuffle') return 'draghögen blandades'
      return `${who}: ${it.v}`
    }
    for (const l of log) {
      const it = l.intent
      if (it.v === 'seat.claim') {
        names[it.seat] = it.name
        meet(it.name, it.seat, false)
      } else if (it.v === 'flag') {
        const observer = !l.by
        const who = observer ? it.observer ?? 'en observatör' : names[l.by] ?? `plats ${l.by}`
        if (observer && it.observer) meet(it.observer, null, true)
        flags.push({ seq: l.seq, at: l.at, who, observer, seat: l.by, note: it.note ?? '', move: moves, after: last ? said(last) : null })
      } else if (!NOT_PLAY.has(it.v)) {
        moves++
        last = l
      }
    }
    // An observer who only answered is known from the answer: the log has no line for watching.
    for (const s of surveys) if (s.observer) meet(s.who, null, true)
    return { people, moves, flags }
  }
  const versionOf = (rev) => M.versions.find((v) => v.rev === rev)
  const vname = (rev, long = false) => {
    const v = versionOf(rev)
    return v?.label ? (long ? `version ${rev} · ${v.label}` : v.label) : `version ${rev}`
  }
  const Vname = (rev) => {
    const s = vname(rev, true)
    return s[0].toUpperCase() + s.slice(1)
  }
  const mean = (answers, k) => (answers.length ? answers.reduce((s, a) => s + a.answers[k], 0) / answers.length : null)
  const dist = (answers, k) => [1, 2, 3, 4, 5].map((n) => answers.filter((a) => a.answers[k] === n).length)
  function sumOf(rev) {
    const ended = M.tables.filter((t) => t.rev === rev && t.ended)
    const running = M.tables.filter((t) => t.rev === rev && !t.ended)
    const answers = ended.flatMap((t) => t.surveys)
    return { rev, ended, running, answers, people: ended.reduce((s, t) => s + t.people.length, 0), observers: answers.filter((a) => a.observer).length, flags: ended.reduce((s, t) => s + t.flags.length, 0) }
  }
  const revsWithEnded = () => [...new Set(M.tables.filter((t) => t.ended).map((t) => t.rev))].sort((a, b) => b - a)
  const previousWith = (rev) => revsWithEnded().find((r) => r < rev && sumOf(r).answers.length > 0) ?? null
  const whoOf = (a) => (a.observer ? `${a.who} · observatör` : `${a.who} · plats ${a.seat}`)
  const silent = (t) => t.people.filter((p) => !t.surveys.some((s) => s.who === p.name && !!s.observer === p.observer))
  const ROW_NAME = (t) => t.code ?? vname(t.rev)

  // Small pieces every variant draws with.
  const scores = (a) => `<span class="p1010-scores">${QUESTIONS.map((q) => `<span><span class="p1010-q">${q.name.toLowerCase()}</span> <b>${a.answers[q.k]}</b></span>`).join('')}</span>`
  const means = (answers, short = false) => (answers.length ? QUESTIONS.map((q) => `<span>${short ? q.name.slice(0, 4).toLowerCase() + '.' : q.name.toLowerCase()} <b>${dec(mean(answers, q.k))}</b></span>`).join('') : '')
  // Five bars, one per step of the scale, tall by how many said it. Drawn for the eye only: the
  // same counts are said in words beside it.
  const spark = (answers, k, cls = '') => {
    const d = dist(answers, k)
    const top = Math.max(1, ...d)
    return `<span class="p1010-spark ${cls}" aria-hidden="true">${d.map((n) => `<i style="--h:${Math.round((n / top) * 100)}%" data-n="${n}"></i>`).join('')}</span>`
  }
  const distWords = (answers, k) => dist(answers, k).map((n, i) => (n ? `${n} × ${i + 1}` : null)).filter(Boolean).join(', ')
  const answerCard = (a, t, withTable) => `
    <li class="p1010-answer">
      <p class="p1010-answer-head"><b>${esc(a.who)}</b> <span>${a.observer ? '<em class="p1010-obs">observatör</em>' : `plats ${esc(a.seat)}`}${withTable ? ` · bord <span class="p1010-code">${esc(ROW_NAME(t))}</span>` : ''}</span></p>
      ${scores(a)}
      ${a.answers.change.trim() ? `<blockquote class="p1010-change"><span class="byd-offscreen">Vad skulle du ändra? </span>${esc(a.answers.change)}</blockquote>` : '<p class="p1010-nochange">Lämnade «Vad skulle du ändra?» tom.</p>'}
    </li>`
  const flagItem = (f, t, withTable) => `
    <li class="p1010-flag">
      <span class="p1010-when">drag ${f.move} av ${t.moves}<span class="p1010-clock"> · ${clock(f.at)}</span></span>
      <p><b>${esc(f.who)}</b>${f.observer ? ' <em class="p1010-obs">observatör</em>' : ''}${withTable ? ` · bord <span class="p1010-code">${esc(ROW_NAME(t))}</span>` : ''}${f.note ? `: «${esc(f.note)}»` : ' flaggade utan kommentar'}</p>
      ${f.after ? `<p class="p1010-after">strax efter att ${esc(f.after)}</p>` : ''}
    </li>`

  const STYLE = `
    .p1010-root { --p-bg: var(--byd-tables-bg, #1b1e27); --p-ink: var(--byd-tables-ink, #e6ecfa); --p-quiet: var(--byd-tables-quiet, #a9b3c9); --p-flag: var(--byd-editor-narrow-ink, #ffd98a); --p-mark: var(--byd-editor-primary-mark, #3c8ce7); --p-line: var(--byd-editor-line, #2f333d); --p-ghost: #5b6274; }
    .p1010-root, .p1010-root * { box-sizing: border-box; }
    .p1010-root [hidden] { display: none !important; }
    .p1010-root p, .p1010-root ul, .p1010-root ol, .p1010-root blockquote, .p1010-root h2, .p1010-root h3, .p1010-root h4 { margin: 0; }
    .p1010-root ul, .p1010-root ol { list-style: none; padding: 0; }
    .p1010-code { font-family: ui-monospace, Menlo, monospace; font-weight: 700; letter-spacing: 1px; color: var(--p-ink); }
    .p1010-obs { font-style: normal; font-size: 11px; padding: 0 6px; border-radius: 999px; border: 1px solid #4a5268; color: var(--byd-editor-part-many, #c3cbdd); white-space: nowrap; }
    .p1010-scores { display: flex; flex-wrap: wrap; gap: var(--byd-s1) var(--byd-s3); font-size: 12px; color: var(--p-quiet); }
    .p1010-scores b { color: var(--p-ink); font-variant-numeric: tabular-nums; }
    .p1010-answer { display: grid; gap: var(--byd-s1); padding: var(--byd-s2) 0; border-top: 1px solid var(--p-line); }
    .p1010-answer-head { display: flex; flex-wrap: wrap; gap: var(--byd-s2); align-items: baseline; color: var(--p-quiet); font-size: 12px; }
    .p1010-answer-head b { color: var(--p-ink); font-size: 13px; }
    .p1010-change { color: var(--p-ink); font-size: 13px; line-height: 1.5; padding-left: var(--byd-s2); border-left: 2px solid #4a5268; max-width: 70ch; }
    .p1010-nochange { color: var(--p-quiet); font-size: 12px; font-style: italic; }
    .p1010-flag { display: grid; gap: 2px; padding: var(--byd-s2) 0; border-top: 1px solid var(--p-line); font-size: 13px; color: var(--p-ink); line-height: 1.45; }
    .p1010-when { color: var(--p-flag); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .p1010-when::before { content: '⚑ '; }
    .p1010-clock { color: var(--p-quiet); font-weight: 400; }
    .p1010-after { color: var(--p-quiet); font-size: 12px; }
    .p1010-spark { display: inline-grid; grid-template-columns: repeat(5, 5px); gap: 1px; align-items: end; height: 14px; vertical-align: -2px; }
    .p1010-spark i { display: block; height: max(1px, var(--h)); background: var(--p-mark); border-radius: 1px; }
    .p1010-spark i[data-n='0'] { background: #3a4152; height: 1px; }
    .p1010-sub { color: var(--p-quiet); font-size: 12px; line-height: 1.5; }
    .p1010-h { color: var(--byd-editor-quiet, #868ea3); font-size: 11px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; }
    .p1010-toggle { min-height: var(--byd-tap, 44px); padding: 0 var(--byd-s3); border-radius: 10px; border: 1px solid #3b4358; background: var(--byd-tables-way-bg, #242938); color: var(--p-ink); font: inherit; font-size: 13px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: var(--byd-s2); }
    .p1010-toggle:focus-visible, .p1010-pick:focus-visible, .p1010-tab:focus-visible { outline: 2px solid var(--p-mark); outline-offset: 2px; }
    .p1010-toggle .p1010-caret { transition: transform 120ms ease; }
    .p1010-toggle[aria-expanded='true'] .p1010-caret { transform: rotate(90deg); }

    /* A — the result on the table's own row, and the version's sum over the group. */
    .p1010-a-row { grid-column: 1 / -1; display: grid; gap: var(--byd-s2); padding-top: var(--byd-s2); border-top: 1px solid var(--p-line); font-size: 12px; color: var(--p-quiet); }
    .p1010-a-line { display: flex; flex-wrap: wrap; gap: var(--byd-s1) var(--byd-s3); align-items: baseline; }
    .p1010-a-line > b { color: var(--p-ink); }
    .p1010-a-line .p1010-flags { color: var(--p-flag); font-weight: 600; }
    .p1010-a-means { display: flex; flex-wrap: wrap; gap: var(--byd-s1) var(--byd-s3); }
    .p1010-a-means b { color: var(--p-ink); }
    .p1010-a-detail { display: grid; gap: var(--byd-s2); }
    .p1010-a-sums { display: grid; gap: var(--byd-s1); padding: 0 var(--byd-s2) var(--byd-s1); }
    .p1010-a-sum { display: grid; gap: 2px; padding: var(--byd-s2); border-radius: 10px; background: #161922; border: 1px solid var(--p-line); font-size: 12px; color: var(--p-quiet); }
    .p1010-a-sum > b { color: var(--p-ink); font-size: 12px; }
    .p1010-a-sum .p1010-a-means > span { display: inline-flex; gap: var(--byd-s1); align-items: end; }
    .p1010-a-wait { grid-column: 1 / -1; font-size: 12px; color: var(--p-quiet); padding-top: var(--byd-s1); }

    /* B — a tab of its own: the version first, then everything it was told. */
    .p1010-tab[aria-selected='true'] { color: #fff !important; }
    .p1010-b { height: 100%; display: grid; grid-template-columns: 264px minmax(0, 1fr); min-height: 0; background: var(--byd-editor-bg, #14161c); }
    .p1010-b-side { display: grid; align-content: start; gap: var(--byd-s1); padding: var(--byd-s4) var(--byd-s3); border-right: 1px solid var(--p-line); overflow: auto; }
    .p1010-pick { display: grid; gap: 2px; width: 100%; min-height: var(--byd-tap, 44px); padding: var(--byd-s2) var(--byd-s3); border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--p-ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
    .p1010-pick small { color: var(--p-quiet); font-size: 12px; }
    .p1010-pick:hover { background: var(--p-bg); }
    .p1010-pick[aria-current='true'] { background: var(--p-bg); border-color: var(--p-mark); }
    .p1010-pick[data-none='true'] { color: var(--p-quiet); }
    .p1010-b-main { overflow: auto; padding: var(--byd-s4) var(--byd-s5) var(--byd-s5); display: grid; gap: var(--byd-s5); align-content: start; min-height: 0; }
    .p1010-b-main h2 { color: #fff; font-size: 18px; }
    .p1010-b-head { display: grid; gap: var(--byd-s1); }
    .p1010-b-sec { display: grid; gap: var(--byd-s2); max-width: 880px; }
    .p1010-b-sec h3 { color: var(--p-ink); font-size: 14px; }
    .p1010-filter { display: flex; flex-wrap: wrap; gap: var(--byd-s1); }
    .p1010-filter button { min-height: 36px; padding: 0 var(--byd-s3); border-radius: 999px; border: 1px solid #3b4358; background: transparent; color: var(--p-ink); font: inherit; font-size: 12px; cursor: pointer; }
    .p1010-filter button[aria-pressed='true'] { background: #24507f; border-color: var(--p-mark); }
    table.p1010-dist { border-collapse: collapse; font-size: 12px; color: var(--p-quiet); width: auto !important; table-layout: auto; justify-self: start; }
    table.p1010-dist td { min-width: 44px; }
    table.p1010-dist caption { text-align: left; color: var(--p-quiet); padding-bottom: var(--byd-s2); }
    table.p1010-dist th, table.p1010-dist td { padding: var(--byd-s1) var(--byd-s2); text-align: center; vertical-align: bottom; font-weight: 400; }
    table.p1010-dist th[scope='row'] { text-align: left; color: var(--p-ink); font-weight: 600; white-space: nowrap; }
    table.p1010-dist th[scope='row'] small { display: block; color: var(--p-quiet); font-weight: 400; }
    table.p1010-dist thead th { color: var(--p-quiet); font-size: 11px; }
    .p1010-cell { display: grid; grid-template-columns: 14px 6px; gap: 2px; align-items: end; justify-content: center; height: 46px; }
    .p1010-cell i { display: block; border-radius: 2px; }
    .p1010-cell .now { background: var(--p-mark); height: max(2px, var(--h)); }
    .p1010-cell .now[data-n='0'] { background: #3a4152; }
    .p1010-cell .was { border: 1px solid var(--p-ghost); height: max(2px, var(--w)); }
    .p1010-cell + span { display: block; font-variant-numeric: tabular-nums; color: var(--p-ink); }
    .p1010-cell + span small { color: var(--p-quiet); }
    td.p1010-mean { color: var(--p-ink); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; vertical-align: middle; }
    td.p1010-delta { font-variant-numeric: tabular-nums; vertical-align: middle; white-space: nowrap; }
    td.p1010-delta b { color: var(--byd-editor-confirm-ink, #7dd3a0); }
    td.p1010-delta b[data-down] { color: var(--p-flag); }
    .p1010-b-tables { display: grid; gap: 2px; }
    .p1010-b-tables li { display: flex; flex-wrap: wrap; gap: var(--byd-s1) var(--byd-s3); align-items: baseline; padding: var(--byd-s2) var(--byd-s3); background: var(--p-bg); border-radius: 10px; font-size: 12px; color: var(--p-quiet); }
    .p1010-b-tables li[data-chosen='true'] { outline: 1px solid var(--p-mark); }
    .p1010-b-tables .p1010-flags { color: var(--p-flag); font-weight: 600; }
    .p1010-b-empty { color: var(--p-quiet); font-size: 13px; line-height: 1.6; max-width: 62ch; }
    .p1010-b-empty b { color: var(--p-ink); }

    /* C — in the history: the counts on the version's row, the words beside its difference. */
    .p1010-c-line { display: flex; flex-wrap: wrap; gap: 2px var(--byd-s2); align-items: center; margin-top: 2px; font-size: 11px; color: var(--byd-editor-part-many, #c3cbdd); }
    .p1010-c-line i { font-style: normal; padding: 0 6px; border-radius: 6px; background: var(--byd-editor-part-bg, #1f2432); color: var(--byd-editor-part-many, #c3cbdd); }
    .p1010-c-line .p1010-flags { color: var(--p-flag); }
    .byd-history[data-p1010-wide] { width: min(860px, calc(100vw - 140px)); display: grid; grid-template-columns: 340px minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr); column-gap: var(--byd-s4); }
    .byd-history[data-p1010-wide] > header, .byd-history[data-p1010-wide] > [role='alert'] { grid-column: 1 / -1; }
    .byd-history[data-p1010-wide] > .byd-history-scroll { grid-column: 1; grid-row: 3; }
    .p1010-c-side { grid-column: 2; grid-row: 3; min-height: 0; overflow: auto; display: grid; gap: var(--byd-s3); align-content: start; padding: 0 var(--byd-s1) var(--byd-s2) var(--byd-s4); border-left: 1px solid var(--p-line); }
    .p1010-c-side h3 { color: #fff; font-size: 14px; }
    .byd-history .p1010-c-side ol, .byd-history .p1010-c-side ul { display: block; }
    .byd-history .p1010-c-side li { background: none; border: 0; border-top: 1px solid var(--p-line); border-radius: 0; overflow: visible; }
    .p1010-c-diff { padding: var(--byd-s2); border-radius: 10px; background: var(--byd-editor-part-bg, #1f2432); font-size: 12px; color: var(--p-ink); line-height: 1.5; }
    .p1010-c-diff b { color: var(--p-quiet); font-weight: 400; }
    .p1010-c-q { display: grid; grid-template-columns: 76px auto 34px minmax(0, 1fr); gap: var(--byd-s2); align-items: center; font-size: 12px; color: var(--p-quiet); }
    .p1010-c-q b { color: var(--p-ink); font-variant-numeric: tabular-nums; }
    .p1010-c-q .up { color: var(--byd-editor-confirm-ink, #7dd3a0); }
    .p1010-c-q .down { color: var(--p-flag); }
  `

  // ── Placing a variant ──────────────────────────────────────────────────────────────────────
  const added = []
  const restore = []
  const add = (node) => (added.push(node), node)
  const el = (html) => {
    const t = document.createElement('template')
    t.innerHTML = html.trim()
    return t.content.firstElementChild
  }
  function style() {
    if (!document.querySelector('#p1010-style')) document.head.append(Object.assign(document.createElement('style'), { id: 'p1010-style', textContent: STYLE }))
  }
  function clear() {
    added.splice(0).forEach((n) => n.remove())
    restore.splice(0).reverse().forEach((f) => f())
  }
  const setAttr = (node, name, value) => {
    const was = node.getAttribute(name)
    restore.push(() => (was === null ? node.removeAttribute(name) : node.setAttribute(name, was)))
    if (value === null) node.removeAttribute(name)
    else node.setAttribute(name, value)
  }
  const wire = (root) => {
    root.querySelectorAll('[data-p1010-toggle]').forEach((b) => {
      b.onclick = () => {
        const open = b.getAttribute('aria-expanded') !== 'true'
        b.setAttribute('aria-expanded', String(open))
        document.getElementById(b.getAttribute('aria-controls')).hidden = !open
      }
    })
  }

  // A — I bordets rad.
  function placeA(state) {
    const col = document.querySelector('.byd-tables')
    if (!col) throw new Error('no Bord column')
    col.classList.add('p1010-root')
    restore.push(() => col.classList.remove('p1010-root'))
    let focus = null
    for (const t of M.tables) {
      const row = col.querySelector(`li[data-table="${CSS.escape(t.id)}"]`)
      if (!row) continue
      if (!t.ended) {
        add(row.appendChild(el(`<p class="p1010-a-wait">Pågår · enkäten kommer när bordet avslutas${t.flags.length ? ` · <span class="p1010-when" style="font-weight:600">${plural(t.flags.length, 'flagga', 'flaggor')} hittills</span>` : ''}</p>`)))
        continue
      }
      const id = `p1010-a-${t.id}`
      const quiet = silent(t)
      const open = (state === 'manga' && t.surveys.length === 3) || (state === 'utan' && t.surveys.length === 0 && t.flags.length > 0)
      if (open) focus = row
      const line = t.surveys.length
        ? `<b>${t.surveys.length} av ${t.people.length} svarade</b>${t.flags.length ? `<span class="p1010-flags">${plural(t.flags.length, 'flagga', 'flaggor')}</span>` : '<span>inga flaggor</span>'}`
        : `<b>Ingen svarade</b><span>${t.people.length} vid bordet</span>${t.flags.length ? `<span class="p1010-flags">${plural(t.flags.length, 'flagga', 'flaggor')}</span>` : '<span>inga flaggor</span>'}`
      const block = el(`
        <div class="p1010-a-row">
          <p class="p1010-a-line">${line}</p>
          ${t.surveys.length ? `<p class="p1010-a-means">${means(t.surveys)}</p>` : ''}
          ${t.surveys.length || t.flags.length ? `<button type="button" class="p1010-toggle" data-p1010-toggle aria-expanded="${open}" aria-controls="${id}"><span class="p1010-caret" aria-hidden="true">▸</span>${t.surveys.length ? 'Svar och flaggor' : 'Flaggor'}<span class="byd-offscreen"> från ${esc(ROW_NAME(t))}</span></button>` : ''}
          <div id="${id}" class="p1010-a-detail" ${open ? '' : 'hidden'}>
            ${t.surveys.length ? `<h4 class="p1010-h">Enkäten</h4><ul>${t.surveys.map((a) => answerCard(a, t, false)).join('')}</ul>` : ''}
            ${quiet.length ? `<p class="p1010-sub">${t.surveys.length ? 'Svarade inte' : 'Ingen av dem svarade på enkäten'}: ${quiet.map((p) => esc(p.name) + (p.observer ? ' (observatör)' : '')).join(', ')}.</p>` : ''}
            ${t.flags.length ? `<h4 class="p1010-h">Flaggor i spelets ordning</h4><ol>${t.flags.map((f) => flagItem(f, t, false)).join('')}</ol>` : ''}
          </div>
        </div>`)
      add(row.appendChild(block))
      wire(block)
    }
    // The version's sum, over the group of ended tables.
    const group = col.querySelector('[data-group="ended"]')
    if (group) {
      const sums = el(`<div class="p1010-a-sums">${revsWithEnded()
        .map((rev) => {
          const s = sumOf(rev)
          return `<p class="p1010-a-sum"><b>${esc(Vname(rev))}</b><span>${plural(s.ended.length, 'bord', 'bord')} · ${s.answers.length} av ${s.people} svarade · ${plural(s.flags, 'flagga', 'flaggor')}</span>${s.answers.length ? `<span class="p1010-a-means">${QUESTIONS.map((q) => `<span>${q.name.toLowerCase()} ${spark(s.answers, q.k)} <b>${dec(mean(s.answers, q.k))}</b><span class="byd-offscreen"> (${distWords(s.answers, q.k)})</span></span>`).join('')}</span>` : ''}</p>`
        })
        .join('')}</div>`)
      const fold = group.querySelector('.byd-tables-fold')
      add(fold.after(sums) ?? sums)
      if (state === 'versioner') focus = group
    } else {
      add(col.appendChild(el(`<p class="byd-tables-empty p1010-a-none">Inga avslutade bord än. När ett bord avslutas står testarnas svar och flaggor på dess rad här, och versionens summa över gruppen.</p>`)))
    }
    if (focus) col.scrollTop += focus.getBoundingClientRect().top - col.getBoundingClientRect().top - 8
    return '.byd-tables'
  }

  // B — En egen flik «Resultat».
  function placeB(state) {
    const tabs = document.querySelector('nav[role="tablist"]')
    const bord = document.querySelector('#byd-editor-tab-tables')
    const tab = bord.cloneNode(true)
    tab.id = 'p1010-tab-results'
    tab.textContent = 'Resultat'
    tab.classList.add('p1010-tab')
    tab.setAttribute('aria-controls', 'p1010-panel-results')
    tab.setAttribute('aria-selected', 'true')
    tab.setAttribute('tabindex', '0')
    add(bord.after(tab) ?? tab)
    for (const other of tabs.querySelectorAll('[role="tab"]:not(#p1010-tab-results)')) {
      setAttr(other, 'aria-selected', 'false')
      setAttr(other, 'tabindex', '-1')
    }
    const open = document.querySelector('main > [role="tabpanel"]:not([hidden])')
    setAttr(open, 'hidden', '')
    const revs = revsWithEnded()
    const all = [...new Set([...M.versions.map((v) => v.rev)])].sort((a, b) => b - a)
    const chosen = state === 'versioner' ? revs[0] : state === 'tom' ? null : revs[revs.length - 1]
    const panel = el(`<div id="p1010-panel-results" role="tabpanel" aria-labelledby="p1010-tab-results" tabindex="0" class="p1010-root p1010-b"></div>`)
    panel.style.height = '100%'
    const side = `<nav class="p1010-b-side" aria-label="Versioner">
        <p class="p1010-h" style="padding: 0 var(--byd-s3) var(--byd-s1)">Versioner</p>
        ${all
          .map((rev) => {
            const s = sumOf(rev)
            const none = !s.ended.length
            return `<button type="button" class="p1010-pick" ${rev === chosen ? 'aria-current="true"' : ''} ${none ? 'data-none="true"' : ''}><span>${esc(Vname(rev))}${rev === M.latest ? ' <small>· öppen nu</small>' : ''}</span><small>${none ? (s.running.length ? `${plural(s.running.length, 'bord', 'bord')} pågår` : 'inga bord') : `${plural(s.ended.length, 'bord', 'bord')} · ${s.answers.length} svar · ${plural(s.flags, 'flagga', 'flaggor')}`}</small></button>`
          })
          .join('')}
      </nav>`
    let main
    if (chosen === null) {
      const running = M.tables.filter((t) => !t.ended)
      main = `<div class="p1010-b-main"><div class="p1010-b-head"><h2>Resultat</h2></div><p class="p1010-b-empty"><b>Inga avslutade bord än.</b> När ett bord avslutas (C9) svarar telefonerna på enkäten, och svaren och flaggorna samlas här per version.${running.length ? ` ${plural(running.length, 'bord', 'bord')} pågår: <span class="p1010-code">${running.map((t) => esc(ROW_NAME(t))).join(', ')}</span>.` : ''}</p></div>`
    } else {
      const s = sumOf(chosen)
      const prev = previousWith(chosen)
      const p = prev ? sumOf(prev) : null
      const only = state === 'utan' ? s.ended.find((t) => !t.surveys.length) : state === 'manga' ? s.ended.find((t) => t.surveys.length === 3) : null
      const shown = only ? [only] : s.ended
      const answers = shown.flatMap((t) => t.surveys.map((a) => ({ a, t })))
      const flags = shown.flatMap((t) => t.flags.map((f) => ({ f, t })))
      const rows = QUESTIONS.map((q) => {
        const d = dist(s.answers, q.k)
        const w = p ? dist(p.answers, q.k) : [0, 0, 0, 0, 0]
        const top = Math.max(1, ...d, ...w)
        const m = mean(s.answers, q.k)
        const pm = p ? mean(p.answers, q.k) : null
        return `<tr><th scope="row">${q.name}<small>${q.q}</small></th>${d
          .map((n, i) => `<td><span class="p1010-cell" aria-hidden="true"><i class="now" data-n="${n}" style="--h:${Math.round((n / top) * 100)}%"></i><i class="was" style="--w:${Math.round((w[i] / top) * 100)}%"></i></span><span>${n}${p ? `<small> / ${w[i]}</small>` : ''}</span></td>`)
          .join('')}<td class="p1010-mean">${dec(m)}</td>${p ? `<td class="p1010-delta">${dec(pm)} → ${dec(m)} <b ${m < pm ? 'data-down' : ''}>${signed(m - pm)}</b></td>` : ''}</tr>`
      }).join('')
      main = `<div class="p1010-b-main">
        <div class="p1010-b-head">
          <h2>${esc(Vname(chosen))}</h2>
          <p class="p1010-sub">${plural(s.ended.length, 'avslutat bord', 'avslutade bord')} · ${s.answers.length} av ${s.people} svarade${s.observers ? ` (varav ${s.observers} observatör)` : ''} · ${plural(s.flags, 'flagga', 'flaggor')}${s.running.length ? ` · ${plural(s.running.length, 'bord', 'bord')} pågår och räknas inte än` : ''}</p>
          ${p && M.diffs[chosen] ? `<p class="p1010-sub">Ändrat sedan ${esc(vname(prev, true))}: <span style="color:var(--p-ink)">${esc(M.diffs[chosen].words)}</span></p>` : ''}
        </div>
        ${s.answers.length ? `<section class="p1010-b-sec" aria-labelledby="p1010-b-dist"><h3 id="p1010-b-dist">Enkäten, ${s.answers.length} svar</h3>
          <p class="p1010-sub">Hur många som svarade 1–5 på varje fråga${p ? `. Konturen och talet efter snedstrecket är ${esc(vname(prev, true))}, förra versionen med svar` : ''}.</p>
          <table class="p1010-dist"><caption class="byd-offscreen">Fördelning per fråga för ${esc(vname(chosen, true))}${p ? `, mot ${esc(vname(prev, true))}` : ''}</caption>
          <thead><tr><th scope="col"><span class="byd-offscreen">Fråga</span></th>${[1, 2, 3, 4, 5].map((n) => `<th scope="col">${n}</th>`).join('')}<th scope="col">Snitt</th>${p ? `<th scope="col">Mot version ${prev}</th>` : ''}</tr></thead>
          <tbody>${rows}</tbody></table></section>` : `<p class="p1010-b-empty"><b>Ingen har svarat på enkäten för den här versionen.</b></p>`}
        <section class="p1010-b-sec" aria-labelledby="p1010-b-tables"><h3 id="p1010-b-tables">Borden</h3>
          <div class="p1010-filter" role="group" aria-label="Visa svar och flaggor från"><button type="button" aria-pressed="${!only}">Alla bord</button>${s.ended.map((t) => `<button type="button" aria-pressed="${only === t}"><span class="p1010-code">${esc(ROW_NAME(t))}</span></button>`).join('')}</div>
          <ul class="p1010-b-tables">${s.ended.map((t) => `<li ${only === t ? 'data-chosen="true"' : ''}><span class="p1010-code">${esc(ROW_NAME(t))}</span><span>avslutat ${clock(t.lastAt)}</span><b style="color:var(--p-ink)">${t.surveys.length ? `${t.surveys.length} av ${t.people.length} svarade` : `ingen av ${t.people.length} svarade`}</b>${t.flags.length ? `<span class="p1010-flags">${plural(t.flags.length, 'flagga', 'flaggor')}</span>` : '<span>inga flaggor</span>'}<span>${t.moves} drag</span></li>`).join('')}</ul>
        </section>
        <section class="p1010-b-sec" aria-labelledby="p1010-b-change"><h3 id="p1010-b-change">Vad skulle du ändra? <span class="p1010-sub">· ${answers.filter(({ a }) => a.answers.change.trim()).length} svar med text</span></h3>
          ${answers.length ? `<ul>${answers.map(({ a, t }) => answerCard(a, t, true)).join('')}</ul>` : `<p class="p1010-b-empty">${only ? `Ingen av de ${only.people.length} vid <span class="p1010-code">${esc(ROW_NAME(only))}</span> svarade på enkäten: ${only.people.map((x) => esc(x.name)).join(', ')}.` : 'Inga svar.'}</p>`}
          ${only && silent(only).length && answers.length ? `<p class="p1010-sub">Svarade inte: ${silent(only).map((x) => esc(x.name)).join(', ')}.</p>` : ''}
        </section>
        <section class="p1010-b-sec" aria-labelledby="p1010-b-flags"><h3 id="p1010-b-flags">Flaggor <span class="p1010-sub">· i spelets ordning, bord för bord</span></h3>
          ${flags.length ? `<ol>${flags.map(({ f, t }) => flagItem(f, t, true)).join('')}</ol>` : '<p class="p1010-b-empty">Ingen flaggade något.</p>'}
        </section>
      </div>`
    }
    panel.innerHTML = side + main
    add(document.querySelector('main').appendChild(panel))
    if (state === 'manga') {
      const m = panel.querySelector('.p1010-b-main')
      m.scrollTop = panel.querySelector('#p1010-b-change').getBoundingClientRect().top - m.getBoundingClientRect().top - 16
    }
    return '#p1010-panel-results'
  }

  // C — I historiken.
  function placeC(state) {
    const hist = document.querySelector('.byd-history')
    if (!hist) throw new Error('no history panel')
    hist.classList.add('p1010-root')
    restore.push(() => hist.classList.remove('p1010-root'))
    for (const li of hist.querySelectorAll('li[data-rev]')) {
      const rev = Number(li.dataset.rev)
      const s = sumOf(rev)
      const btn = li.querySelector(':scope > button')
      if (!s.ended.length && !s.running.length) continue
      const words = s.ended.length
        ? `${plural(s.ended.length, 'avslutat bord', 'avslutade bord')}, ${s.answers.length} svar${s.answers.length ? `, ${QUESTIONS.map((q) => `${q.name.toLowerCase()} ${dec(mean(s.answers, q.k))}`).join(', ')}` : ''}, ${plural(s.flags, 'flagga', 'flaggor')}`
        : `${plural(s.running.length, 'bord', 'bord')} pågår`
      const line = el(`<span class="p1010-c-line" aria-hidden="true"><i>playtest</i>${s.ended.length ? `<span>${plural(s.ended.length, 'bord', 'bord')} · ${s.answers.length} svar</span>${s.answers.length ? `<span>${QUESTIONS.map((q) => `${q.name.slice(0, 4).toLowerCase()}. <b>${dec(mean(s.answers, q.k))}</b>`).join(' ')}</span>` : ''}${s.flags ? `<span class="p1010-flags">⚑ ${s.flags}</span>` : ''}` : `<span>${plural(s.running.length, 'bord', 'bord')} pågår</span>`}</span>`)
      add(btn.querySelector('.byd-history-what').appendChild(line))
      setAttr(btn, 'aria-label', `${btn.getAttribute('aria-label')}. Playtest: ${words}.`)
    }
    const li = hist.querySelector('li[data-rev] > button[aria-expanded="true"]')?.parentElement
    if (!li) return '.byd-history'
    const rev = Number(li.dataset.rev)
    const s = sumOf(rev)
    const prev = previousWith(rev)
    const p = prev ? sumOf(prev) : null
    const dd = M.diffs[rev]
    setAttr(hist, 'data-p1010-wide', '')
    const qrows = QUESTIONS.map((q) => {
      const m = mean(s.answers, q.k)
      const pm = p ? mean(p.answers, q.k) : null
      return `<p class="p1010-c-q"><span>${q.name}</span>${spark(s.answers, q.k)}<b>${dec(m)}</b><span>${p ? `<span class="${m >= pm ? 'up' : 'down'}">${signed(m - pm)}</span> mot version ${prev}` : ''}<span class="byd-offscreen">; ${distWords(s.answers, q.k)}</span></span></p>`
    }).join('')
    const answers = s.ended.flatMap((t) => t.surveys.map((a) => ({ a, t })))
    const flags = s.ended.flatMap((t) => t.flags.map((f) => ({ f, t })))
    const side = el(`<section class="p1010-c-side" aria-labelledby="p1010-c-h">
        <h3 id="p1010-c-h">Vad testarna sa om ${esc(vname(rev, true))}</h3>
        ${dd ? `<p class="p1010-c-diff"><b>${dd.from ? `Ändrat sedan version ${dd.from}, som testades senast före:` : 'Ändrat i den här versionen:'}</b> ${esc(dd.words)}</p>` : ''}
        ${s.ended.length ? `<p class="p1010-sub">${s.ended.map((t) => `<span class="p1010-code">${esc(ROW_NAME(t))}</span> ${t.surveys.length ? `${t.surveys.length} av ${t.people.length} svarade` : `ingen av ${t.people.length} svarade`}${t.flags.length ? `, ${plural(t.flags.length, 'flagga', 'flaggor')}` : ''}`).join(' · ')}${s.running.length ? ` · ${plural(s.running.length, 'bord', 'bord')} pågår` : ''}</p>` : `<p class="p1010-b-empty"><b>Inget avslutat bord på den här versionen.</b>${s.running.length ? ` <span class="p1010-code">${s.running.map((t) => esc(ROW_NAME(t))).join(', ')}</span> pågår; enkäten kommer när det avslutas.` : ''}</p>`}
        ${s.answers.length ? `<div>${qrows}</div>` : ''}
        ${answers.length ? `<h4 class="p1010-h">Vad skulle du ändra?</h4><ul>${answers.map(({ a, t }) => answerCard(a, t, true)).join('')}</ul>` : ''}
        ${flags.length ? `<h4 class="p1010-h">Flaggor</h4><ol>${flags.map(({ f, t }) => flagItem(f, t, true)).join('')}</ol>` : ''}
      </section>`)
    add(hist.appendChild(side))
    if (state === 'manga') side.scrollTop = side.querySelector('ul')?.offsetTop - 8 || 0
    if (state === 'utan') side.scrollTop = (side.querySelector('ol')?.offsetTop ?? 0) - 8
    return '.byd-history'
  }

  function place(v, state) {
    style()
    clear()
    if (v === 'a') return placeA(state)
    if (v === 'b') return placeB(state)
    if (v === 'c') return placeC(state)
    return null
  }
  window.__p1010 = { load, place, clear, model: () => M, sumOf }
})()
