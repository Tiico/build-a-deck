// Gör prototypens data genom serverns egna vägar (#1010), så att varje svar och varje flagga i
// bilderna kommer från servern och inte från en fil:
//
//   - ett spel skapas med POST /projects och sparas om några gånger med PUT, så att historiken har
//     versioner, två av dem namngivna;
//   - bord startas ur spelet med POST /projects/:id/sessions, som editorns knapp gör (L5);
//   - telefoner köper inträde med koden (POST /rooms/:code/join), öppnar sin WebSocket med sin
//     token, sätter sig (`seat.claim`), drar och kastar; en observatör kopplar upp som observatör;
//   - flaggor skickas som `flag` med `note`, från platser och från observatören, mitt i spelet;
//   - bordet avslutas med `session.end` över värdens anslutning (C9);
//   - enkätsvaren skickas med POST /sessions/:id/survey, som telefonen gör (G3).
//
//   ../../../../../packages/e2e/node_modules/.bin/tsx seed.mts   (läser links.json, skriver seed.json)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyPatch } from '@byd/engine'
const HERE = dirname(fileURLToPath(import.meta.url))
const W = join(HERE, '..', '..', '..', '..', '..', 'packages')
const { gameDoc } = await import(`${W}/e2e/support/game.ts`)
const L = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8')) as { origin: string; cookie: string }
const WS = L.origin.replace(/^http/, 'ws')
const H = { 'content-type': 'application/json', cookie: L.cookie }
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${L.origin}${path}`, { method, headers: H, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  return (res.status === 204 ? null : await res.json()) as T
}

// One connection to a table, the way the phone, the observer and the host screen each make one.
type View = { components: { id: string; zone: string }[] }
class Line {
  latest: View | null = null
  n = 0
  private constructor(readonly ws: WebSocket, readonly seat: string | null) {
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String(ev.data))
      if (m.t === 'snapshot') this.latest = m.snapshot
      else if (m.t === 'patch' && this.latest) this.latest = applyPatch(this.latest as never, m.patch) as never
    })
  }
  static async open(url: string, seat: string | null): Promise<Line> {
    const ws = new WebSocket(url)
    await new Promise<void>((ok, no) => {
      ws.addEventListener('open', () => ok(), { once: true })
      ws.addEventListener('error', () => no(new Error(`could not open ${url}`)), { once: true })
    })
    const line = new Line(ws, seat)
    const deadline = Date.now() + 10_000
    while (!line.latest) {
      if (Date.now() > deadline) throw new Error('no snapshot')
      await pause(20)
    }
    return line
  }
  send(intents: unknown[]): Promise<void> {
    const id = `seed${this.seat ?? 'h'}${this.n++}${Math.random().toString(36).slice(2, 6)}`
    return new Promise((ok, no) => {
      const on = (ev: MessageEvent) => {
        const m = JSON.parse(String(ev.data))
        if (m.t === 'refused') return no(new Error(`refused: ${m.reason}`))
        if (m.id !== id) return
        this.ws.removeEventListener('message', on)
        if (m.t === 'ack') ok()
        else no(new Error(`${m.t}: ${m.reason ?? m.message}`))
      }
      this.ws.addEventListener('message', on)
      this.ws.send(JSON.stringify({ t: 'envelope', envelope: { id, seat: this.seat, intents } }))
    })
  }
  hand(): string[] {
    return (this.latest?.components ?? []).filter((c) => c.zone === `hand:${this.seat}`).map((c) => c.id)
  }
  close() {
    this.ws.close()
  }
}

type Started = { id: string; code: string; hostKey: string; version: string }
type Survey = { fun: number; clarity: number; balance: number; change: string }
type Person = { name: string; seat?: string; survey?: Survey }
type Flag = { at: number; who: string; note: string }
type Plan = { players: Person[]; observer?: Person; rounds: number; flags: Flag[]; end: boolean }

async function play(projectId: string, plan: Plan): Promise<Started & { flags: number; answers: number }> {
  const t = await api<Started>('POST', `/projects/${encodeURIComponent(projectId)}/sessions`)
  const host = await Line.open(`${WS}/sessions/${encodeURIComponent(t.id)}?host=${encodeURIComponent(t.hostKey)}`, null)
  const phones = new Map<string, Line>()
  for (const p of plan.players) {
    const a = await api<{ token: string }>('POST', `/rooms/${encodeURIComponent(t.code)}/join`, { name: p.name, seat: p.seat })
    const line = await Line.open(`${WS}/sessions/${encodeURIComponent(t.id)}?seat=${p.seat}&token=${encodeURIComponent(a.token)}`, p.seat!)
    await line.send([{ v: 'seat.claim', seat: p.seat, name: p.name }])
    phones.set(p.name, line)
    await pause(120)
  }
  let watcher: Line | null = null
  if (plan.observer) {
    const a = await api<{ token: string }>('POST', `/rooms/${encodeURIComponent(t.code)}/join`, { name: plan.observer.name })
    watcher = await Line.open(`${WS}/sessions/${encodeURIComponent(t.id)}?role=observer&name=${encodeURIComponent(plan.observer.name)}&token=${encodeURIComponent(a.token)}`, null)
  }
  const seats = plan.players.map((p) => p.seat!)
  await host.send([{ v: 'shuffle', pile: 'draw' }])
  await host.send([{ v: 'deal', from: 'draw', to: seats.map((s) => `hand:${s}`), each: 3 }])
  // A turn is a draw and a card laid down: in front of oneself or on the discard pile. Each one is
  // a move in the log, so «när i spelet» can be counted in moves.
  let turn = 0
  for (let r = 0; r < plan.rounds; r++) {
    for (const p of plan.players) {
      turn++
      const line = phones.get(p.name)!
      await line.send([{ v: 'draw', from: 'draw', to: `hand:${p.seat}`, count: 1 }])
      await pause(60)
      const card = line.hand()[0]
      if (card) await line.send([r % 2 === 0 ? { v: 'move', component: card, to: `mine:${p.seat}`, x: 20 * r, y: 0 } : { v: 'move', component: card, to: 'discard' }])
      for (const f of plan.flags.filter((x) => x.at === turn)) {
        if (f.who === plan.observer?.name) await watcher!.send([{ v: 'flag', note: f.note }])
        else await phones.get(f.who)!.send([{ v: 'flag', note: f.note }])
      }
      await pause(90)
    }
  }
  let answers = 0
  if (plan.end) {
    await host.send([{ v: 'session.end' }])
    await pause(200)
    for (const p of [...plan.players, ...(plan.observer ? [{ ...plan.observer, observer: true }] : [])]) {
      if (!p.survey) continue
      await api('POST', `/sessions/${encodeURIComponent(t.id)}/survey`, { who: p.name, seat: p.seat ?? null, ...('observer' in p ? { observer: true } : {}), answers: p.survey })
      answers++
      await pause(80)
    }
  }
  for (const l of phones.values()) l.close()
  watcher?.close()
  host.close()
  return { ...t, flags: plan.flags.length, answers }
}

// ── Spelet och dess versioner ──────────────────────────────────────────────────────────────────
type Doc = ReturnType<typeof gameDoc>
const doc: Doc = gameDoc({ name: 'Skogens herrar', players: 4, cards: 16, copies: 2 })
const made = await api<{ id: string; rev: number }>('POST', '/projects', doc)
let rev = made.rev
const save = async (change: (d: Doc) => void) => {
  change(doc)
  rev = (await api<{ rev: number }>('PUT', `/projects/${encodeURIComponent(made.id)}`, { rev, ...doc })).rev
}
const body = (i: number, text: string) => (d: Doc) => {
  d.rows[i]!.fields['body'] = text
}
await save(body(2, 'Titta på det översta kortet i draghögen. Lägg det tillbaka eller under högen.'))
await save(body(12, 'Dra två kort. Om du drar en Räv får du spela igen.'))
await api('PUT', `/projects/${encodeURIComponent(made.id)}/versions/${rev}/label`, { label: 'Första playtestet' })
const first = rev

const A = (fun: number, clarity: number, balance: number, change: string): Survey => ({ fun, clarity, balance, change })
const t1 = await play(made.id, {
  players: [
    { name: 'Ada', seat: 'A', survey: A(4, 2, 3, 'Det var oklart när rundan tar slut. Vi läste regeln om draghögen tre gånger och var ändå inte överens om huruvida den som drar det sista kortet får spela en gång till. Räven kändes också för stark i första rundan: den som fick den tidigt ledde hela vägen. Gör gärna ett eget kort med turordningen, så att man slipper bläddra i häftet mitt i spelet.') },
    { name: 'Bertil', seat: 'B' },
    { name: 'Cecilia', seat: 'C', survey: A(5, 3, 2, 'Roligt! Men Korpen och Ugglan tillsammans blir nästan omöjliga att stoppa, och när någon väl har båda framför sig är spelet i praktiken avgjort. Kanske ska Ugglan bara få användas en gång per runda, eller kosta ett kort på handen. Jag skulle också vilja att kasthögen syntes bättre – vi tappade bort vilka kort som redan var spelade.') },
    { name: 'David', seat: 'D' },
  ],
  observer: { name: 'Elin', survey: A(3, 2, 3, 'Som observatör såg jag att alla väntade på David i nästan två minuter efter varje kast, eftersom ingen visste om turen gick vidare av sig själv. Det mesta av tiden gick åt till att fråga vems tur det var. Själva korten verkar fungera; det är rundans gång som behöver sägas tydligare, kanske med en markör som går runt bordet.') },
  rounds: 4,
  flags: [
    { at: 3, who: 'Bertil', note: 'Får man dra igen efter Korpen? Regeln säger inget.' },
    { at: 7, who: 'Ada', note: 'Räven är för stark i första rundan.' },
    { at: 11, who: 'Elin', note: 'Alla väntar på David – ingen vet vems tur det är.' },
  ],
  end: true,
})
const t2 = await play(made.id, {
  players: [{ name: 'Fredrik', seat: 'A' }, { name: 'Greta', seat: 'B' }, { name: 'Hassan', seat: 'C' }],
  rounds: 3,
  flags: [{ at: 8, who: 'Greta', note: 'Draghögen tog slut – vad händer då?' }],
  end: true,
})

await save((d) => {
  const liv = d.setup.counters?.[0] as { start?: number } | undefined
  if (liv && typeof liv.start === 'number') liv.start = 15
  d.rows[12]!.fields['body'] = 'Dra två kort.'
})
await save(body(13, 'Ugglan får användas en gång per runda.'))
await api('PUT', `/projects/${encodeURIComponent(made.id)}/versions/${rev}/label`, { label: 'Kortare runda' })
const second = rev

const t3 = await play(made.id, {
  players: [
    { name: 'Ida', seat: 'A', survey: A(4, 4, 4, 'Turkortet hjälpte mycket. Jag hade gärna sett att Ugglan syntes tydligare som "en gång per runda" på själva kortet.') },
    { name: 'Johan', seat: 'B', survey: A(5, 4, 3, 'Bra tempo nu. Korpen är fortfarande lite stark när man får den sent.') },
    { name: 'Klara', seat: 'C', survey: A(4, 5, 4, '') },
    { name: 'Ludvig', seat: 'D', survey: A(4, 3, 4, 'Oklart vad som händer när draghögen tar slut, men annars bra.') },
  ],
  rounds: 3,
  flags: [{ at: 6, who: 'Johan', note: 'Bra tempo i den här rundan!' }],
  end: true,
})
const t4 = await play(made.id, {
  players: [{ name: 'Maja', seat: 'A' }, { name: 'Nils', seat: 'B' }],
  observer: { name: 'Olle', survey: A(4, 3, 5, 'Två spelare fungerar, men det tar slut för fort: draghögen räcker bara till fyra varv.') },
  rounds: 3,
  flags: [],
  end: true,
})
const t5 = await play(made.id, {
  players: [{ name: 'Petra', seat: 'A' }, { name: 'Rasmus', seat: 'B' }],
  rounds: 2,
  flags: [{ at: 3, who: 'Petra', note: 'Vad betyder symbolen i hörnet?' }],
  end: false,
})
await save(body(5, 'Lägg ett kort framför dig. Det räknas som två i slutet.'))

// ── Ett andra spel, där inget bord har avslutats ──────────────────────────────────────────────
const other = await api<{ id: string; rev: number }>('POST', '/projects', gameDoc({ name: 'Fyra årstider', players: 2, cards: 8, copies: 2 }))
const t6 = await play(other.id, { players: [{ name: 'Sara', seat: 'A' }, { name: 'Tove', seat: 'B' }], rounds: 2, flags: [], end: false })

const out = { project: made.id, rev, first, second, tables: { t1, t2, t3, t4, t5 }, empty: { project: other.id, table: t6 } }
writeFileSync(join(HERE, 'seed.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
process.exit(0)
