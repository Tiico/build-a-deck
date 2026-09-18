import type { Intent } from '@byd/protocol'
import { applyPatch } from '@byd/engine'
import type { Table } from './api.js'

/**
 * The table's own screen, driven from the test rather than from a browser.
 *
 * This is for *arranging* a table — dealing a hand, turning a card over, putting the game in the
 * state a journey starts from. It is the host connection the big screen itself uses, carrying the
 * host key, sending the same envelopes and getting the same acks, so nothing here is a back door
 * into the server: it is the front door, opened by a program instead of by a finger.
 *
 * It is deliberately not used to make the assertions. A spec that both acts and checks through
 * this would never touch the product's screens at all, and that suite already exists — it is
 * `packages/server/test/wire.test.ts`. What belongs here is the given, so the when and the then
 * can be about what a person sees and what a wire carries.
 */
export type Seen = {
  zones: { id: string; order?: string[] }[]
  components: { id: string; zone: string; cardRef?: string | null }[]
}

export class Host {
  private latest: Seen | null = null

  private constructor(
    private readonly ws: WebSocket,
    private n = 0,
  ) {
    // The table is followed from the moment the socket opens, because the snapshot arrives
    // unasked and once: a `view()` that waited for the next one would wait for a message the
    // server has no reason to send again. Patches are applied on top, which is the same way
    // every client in this product keeps up (`project` is the one road from state to thread).
    this.ws.addEventListener('message', (ev: MessageEvent) => {
      const m = JSON.parse(String(ev.data)) as { t: string; snapshot?: Seen; patch?: unknown }
      if (m.t === 'snapshot' && m.snapshot) this.latest = m.snapshot
      else if (m.t === 'patch' && this.latest) this.latest = applyPatch(this.latest as never, m.patch as never) as unknown as Seen
    })
  }

  static async open(origin: string, table: Table): Promise<Host> {
    const url = `${origin.replace(/^http/, 'ws')}/sessions/${encodeURIComponent(table.session)}?host=${encodeURIComponent(table.hostKey)}`
    const ws = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true })
      ws.addEventListener('error', () => reject(new Error(`the host could not open ${url}`)), { once: true })
    })
    return new Host(ws)
  }

  /**
   * Sends intents and waits for the table to accept them.
   *
   * A refusal carries no envelope id, so a wait that only ever matched an ack would wait for
   * ever on the one case worth knowing about. It is listened for by name and turned into a
   * failure that says what the table objected to.
   */
  send(intents: Intent[]): Promise<void> {
    const id = `e2e${this.n++}`
    return new Promise((resolve, reject) => {
      const onMessage = (ev: MessageEvent) => {
        const m = JSON.parse(String(ev.data)) as { t: string; id?: string; reason?: string; message?: string }
        if (m.t === 'refused') {
          this.ws.removeEventListener('message', onMessage)
          return reject(new Error(`the table refused: ${m.reason ?? m.message ?? 'no reason given'}`))
        }
        if (m.id !== id) return
        this.ws.removeEventListener('message', onMessage)
        if (m.t === 'ack') resolve()
        else reject(new Error(`${m.t}: ${m.reason ?? m.message ?? ''}`))
      }
      this.ws.addEventListener('message', onMessage)
      this.ws.send(JSON.stringify({ t: 'envelope', envelope: { id, seat: null, intents } }))
    })
  }

  /** The table as this connection sees it, which is everything: the host screen hides nothing. */
  async view(): Promise<Seen> {
    const deadline = Date.now() + 10_000
    while (this.latest === null) {
      if (Date.now() > deadline) throw new Error('no snapshot arrived within ten seconds')
      await new Promise((r) => setTimeout(r, 20))
    }
    return this.latest
  }

  close(): void {
    this.ws.close()
  }
}
