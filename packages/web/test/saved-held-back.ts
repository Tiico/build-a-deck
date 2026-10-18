import type { EditSocketCtor, WebSocketLike } from '../src/editor/ProjectClient.js'
import { EditSocket } from './setup.js'

// The editor's line with the actor's «saved» held back on its way in until `release` lets it
// through (#988). Nothing is invented: every frame is the actor's own and arrives in the order it
// was sent — only late. That is the order a busy machine falls into by accident, where the version
// is made and in the store and the word that says so is still on the line when the next save is
// asked for; here it is made certain rather than hoped for.
//
// The editor's own requests can be held the same way on their way out (#991): an edit that leaves
// late reaches the actor after a colleague's edit it never heard of, which is how an edit comes to
// be refused while a save of the same editor's is in the air.
export class SavedHeldBack {
  private readonly held: { line: WebSocketLike; event: { data: unknown } }[] = []
  private holding = true
  private readonly asked: { line: WebSocketLike; data: string }[] = []
  private holdingAsked = false
  // What the actor has said on this line and the editor has been let hear, by kind, in order.
  readonly heard: string[] = []

  // `unaddressed`: the line of a server from before #991, whose refusals do not say which request
  // they answer. The field is taken off on the way in and nothing else is touched.
  // `unnumbered`: the line of a server from before #993, whose echoes and refusals do not carry the
  // number the editor gave its edit. The number is taken off on the way in, and nothing else.
  constructor(private readonly opts: { unaddressed?: boolean; unnumbered?: boolean } = {}) {}

  /** How many «saved» are waiting. */
  get waiting(): number {
    return this.held.length
  }

  /** Lets every held «saved» through, in the order it came, and holds nothing after. */
  release(): void {
    this.holding = false
    for (const { line, event } of this.held.splice(0)) this.hear(line, event)
  }

  private hear(line: WebSocketLike, event: { data: unknown }): void {
    let frame = JSON.parse(String(event.data)) as { v: string; to?: string; ask?: number; edits?: { ask?: number }[] }
    this.heard.push(frame.v)
    if (this.opts.unnumbered) {
      const { ask: _ask, ...before993 } = frame
      frame = { ...before993, ...(frame.edits ? { edits: frame.edits.map(({ ask: _one, ...edit }) => edit) } : {}) }
    }
    if (this.opts.unaddressed && frame.v === 'refused' && 'to' in frame) {
      const { to: _to, ...before991 } = frame
      frame = before991
    }
    line.onmessage?.(this.opts.unnumbered || this.opts.unaddressed ? { data: JSON.stringify(frame) } : event)
  }

  /** Holds what the editor sends from now on, until `letOut`. */
  holdRequests(): void {
    this.holdingAsked = true
  }

  /** Sends every held request, in the order it was written, and holds none after. */
  letOut(): void {
    this.holdingAsked = false
    for (const { line, data } of this.asked.splice(0)) line.send(data)
  }

  readonly Line: EditSocketCtor = ((gate: SavedHeldBack) =>
    class implements WebSocketLike {
      private readonly line: WebSocketLike
      onopen: (() => void) | null = null
      onmessage: ((event: { data: unknown }) => void) | null = null
      onclose: ((event?: { code?: number }) => void) | null = null
      onerror: (() => void) | null = null
      constructor(url: string) {
        this.line = new EditSocket(url) as unknown as WebSocketLike
        this.line.onopen = () => this.onopen?.()
        this.line.onclose = (event) => this.onclose?.(event)
        this.line.onerror = () => this.onerror?.()
        this.line.onmessage = (event) => {
          const said = (JSON.parse(String(event.data)) as { v: string }).v
          if (gate.holding && said === 'saved') gate.held.push({ line: this, event })
          else gate.hear(this, event)
        }
      }
      get readyState(): number {
        return this.line.readyState
      }
      send(data: string): void {
        if (gate.holdingAsked) gate.asked.push({ line: this.line, data })
        else this.line.send(data)
      }
      close(): void {
        this.line.close()
      }
    })(this) as unknown as EditSocketCtor
}
