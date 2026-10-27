import { randomUUID } from 'node:crypto'
import { tableProtocols, type Intent, type Snapshot } from '@byd/protocol'
import { applyPatch } from '@byd/engine'

/** A running table and the two things that open it: the code guests join by, and the host key. */
export type TableAddress = { session: string; code: string; hostKey: string }

export type Played = {
  /** Envelopes the table committed. */
  acked: number
  /** What the table said no to, word for word. A load run with any of these was not a playtest. */
  refused: string[]
  shuffles: number
  rewinds: number
  /** Textures fetched by the screens, each screen fetching each picture it is shown once. */
  faces: number
}

/**
 * One playtest at one table (#1012): eight phones, the television and an observer, each on its own
 * WebSocket the way the product opens them, playing `intents` envelopes in turn.
 *
 * The play is what a group does with a deck: draw, put a card in front of you or on the discard,
 * and now and then shuffle the draw pile or talk the table back a few moves — a rewind proposed by
 * one seat and confirmed by the next, which makes the actor restore an earlier table. Every screen
 * fetches the texture of every card it is shown, once, as a browser with a cache does; that is the
 * traffic `GET /faces` answers on the box.
 */
export async function playTable(origin: string, table: TableAddress, o: { intents: number; pauseMs: number }): Promise<Played> {
  const ws = origin.replace(/^http/, 'ws')
  // Each screen fetches on its own, as each browser does.
  const faces = () => new Faces(origin)
  const at = (q: Record<string, string>) => `${ws}/sessions/${encodeURIComponent(table.session)}?${new URLSearchParams(q).toString()}`
  // The host key in the protocol header (#1306); the door refuses it in the address (#1341).
  const tv = await Screen.open(at({}), faces(), tableProtocols({ host: table.hostKey }))
  const seats = (await tv.view()).seats.map((s) => s.id)
  const phones: Screen[] = []
  for (const seat of seats) {
    const name = `Spelare ${seat}`
    const token = await admit(origin, table.code, { name, seat })
    phones.push(await Screen.open(at({ seat, name, token }), faces()))
  }
  const watcher = await Screen.open(at({ role: 'observer', name: 'Observatör', token: await admit(origin, table.code, { name: 'Observatör' }) }), faces())

  const played: Played = { acked: 0, refused: [], shuffles: 0, rewinds: 0, faces: 0 }
  // The newest line the table has committed. A phone acts on what it sees, and it has not seen
  // the move the seat before it just made until that patch has reached it too — so each turn
  // waits for its own screen to catch up first, as a player waits to see the card land.
  let committed = 0
  const send = async (phone: Screen, seat: string, intents: Intent[]): Promise<boolean> => {
    await phone.until((v) => v.seq >= committed)
    const answer = await phone.send(seat, intents)
    if (typeof answer === 'string') played.refused.push(`${intents.map((i) => i.v).join('+')}: ${answer}`)
    else {
      played.acked++
      committed = Math.max(committed, ...answer)
    }
    return typeof answer !== 'string'
  }
  let turn = 0
  for (let sent = 0; sent < o.intents; turn++) {
    const i = turn % seats.length
    const seat = seats[i] ?? 'A'
    const phone = phones[i]
    const next = phones[(i + 1) % phones.length]
    if (!phone || !next) throw new Error('a seat without a phone')
    if (turn % 20 === 19) {
      await send(phone, seat, [{ v: 'shuffle', pile: 'draw' }])
      played.shuffles++
      sent++
    } else if (turn % 30 === 29 && sent + 2 <= o.intents) {
      const view = await phone.until((v) => v.seq >= committed)
      sent += 2
      if (!(await send(phone, seat, [{ v: 'rewind.propose', toSeq: Math.max(0, view.seq - 4) }]))) continue
      const proposal = await next.until((v) => v.rewind !== null)
      if (await send(next, seats[(i + 1) % seats.length] ?? 'A', [{ v: 'rewind.confirm', proposal: proposal.rewind?.id ?? '' }])) played.rewinds++
    } else {
      await send(phone, seat, [play(await phone.until((v) => v.seq >= committed), seat, turn)])
      sent++
    }
    if (o.pauseMs > 0) await new Promise((r) => setTimeout(r, o.pauseMs))
  }
  const screens = [tv, ...phones, watcher]
  for (const screen of screens) played.faces += await screen.faces.drained()
  for (const screen of screens) screen.close()
  return played
}

/**
 * One ordinary move for a seat: keep two cards in hand and put the third down — in front of you
 * or on the discard, turn about — and draw otherwise. A draw pile that has run out is played on
 * from the discard, and a seat with nothing left to draw clears what is in front of it.
 */
function play(view: Snapshot, seat: string, turn: number): Intent {
  const zone = (id: string) => view.zones.find((z) => z.id === id)
  const cards = (id: string): string[] => {
    const z = zone(id)
    return z?.mode === 'order' ? z.order : []
  }
  const count = (id: string): number => {
    const z = zone(id)
    return z?.mode === 'count' ? z.count : z?.mode === 'order' ? z.order.length : 0
  }
  const held = cards(`hand:${seat}`)
  const [card] = held
  if (held.length >= 3 && card) return { v: 'move', component: card, to: turn % 2 === 0 ? `mine:${seat}` : 'discard' }
  for (const pile of ['draw', 'discard']) if (count(pile) > 0) return { v: 'draw', from: pile, to: `hand:${seat}`, count: 1 }
  const [down] = card ? [card] : cards(`mine:${seat}`)
  if (!down) throw new Error(`seat ${seat} has no card to play anywhere`)
  return { v: 'move', component: down, to: 'discard' }
}

async function admit(origin: string, code: string, who: { name: string; seat?: string }): Promise<string> {
  const res = await fetch(`${origin}/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(who) })
  if (res.status !== 201) throw new Error(`${who.name} was not let in: ${res.status} ${await res.text()}`)
  return ((await res.json()) as { token: string }).token
}

/**
 * Every texture any screen at the table has been shown, fetched once per screen as a browser
 * would. On the box `/faces` answers with a redirect to R2 and the bytes never cross the app; on a
 * stack without an object store the app serves the bytes itself, which is the heavier of the two
 * and the one this follows to the end when it is what the server answers.
 */
class Faces {
  fetched = 0
  private queue: Promise<void> = Promise.resolve()
  constructor(private readonly origin: string) {}
  fetch(hash: string): void {
    this.queue = this.queue.then(async () => {
      const res = await fetch(`${this.origin}/faces/${hash}`, { redirect: 'manual' }).catch(() => null)
      await res?.arrayBuffer().catch(() => undefined)
      this.fetched++
    })
  }
  /** How many it fetched, once the last of them is in. */
  async drained(): Promise<number> {
    await this.queue
    return this.fetched
  }
}

/** One screen's socket, and the table as that screen sees it. */
class Screen {
  private latest: Snapshot | null = null
  private readonly seen = new Set<string>()
  private readonly listeners = new Set<() => void>()

  private constructor(
    private readonly ws: WebSocket,
    readonly faces: Faces,
  ) {
    ws.addEventListener('message', (ev: MessageEvent) => {
      const m = JSON.parse(String(ev.data)) as { t: string; snapshot?: Snapshot; patch?: unknown }
      if (m.t === 'snapshot' && m.snapshot) this.latest = m.snapshot
      else if (m.t === 'patch' && this.latest) this.latest = applyPatch(this.latest as never, m.patch as never) as unknown as Snapshot
      else return
      // Every face a screen is handed, not only the one turned up: a hand is held face down on the
      // table and read from the front on the phone, and the server only hands a face to a screen
      // that may see it.
      for (const c of this.latest.components)
        for (const hash of Object.values(c.faces ?? {}))
          if (!this.seen.has(hash)) {
            this.seen.add(hash)
            faces.fetch(hash)
          }
      for (const listener of [...this.listeners]) listener()
    })
  }

  static async open(url: string, faces: Faces, protocols?: string[]): Promise<Screen> {
    const ws = new WebSocket(url, protocols)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true })
      ws.addEventListener('error', () => reject(new Error(`could not open ${url}`)), { once: true })
    })
    return new Screen(ws, faces)
  }

  view(): Promise<Snapshot> {
    return this.until(() => true)
  }

  /** The view, once it satisfies `want`. */
  until(want: (view: Snapshot) => boolean, budgetMs = 30_000): Promise<Snapshot> {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.latest && want(this.latest)) {
          this.listeners.delete(check)
          clearTimeout(timer)
          resolve(this.latest)
        }
      }
      const timer = setTimeout(() => {
        this.listeners.delete(check)
        reject(new Error('the view never got there'))
      }, budgetMs)
      this.listeners.add(check)
      check()
    })
  }

  /** Sends one envelope: the seqs it was committed as, or what the table said instead. */
  send(seat: string, intents: Intent[]): Promise<number[] | string> {
    // An envelope id is the table's, not the socket's: two phones counting from zero collide.
    const id = randomUUID()
    return new Promise((resolve) => {
      const onMessage = (ev: MessageEvent) => {
        const m = JSON.parse(String(ev.data)) as { t: string; id?: string; seqs?: number[]; reason?: string; message?: string }
        if (m.t === 'refused') resolve(`refused: ${m.reason ?? ''}`)
        else if (m.id !== id) return
        else resolve(m.t === 'ack' ? (m.seqs ?? []) : `${m.t}: ${m.reason ?? m.message ?? ''}`)
        this.ws.removeEventListener('message', onMessage)
      }
      this.ws.addEventListener('message', onMessage)
      this.ws.send(JSON.stringify({ t: 'envelope', envelope: { id, seat, intents } }))
    })
  }

  close(): void {
    this.ws.close()
  }
}
