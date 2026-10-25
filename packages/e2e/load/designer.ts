import { loadGame, picture, type LoadAssets } from './deck.js'
import type { TableAddress } from './table.js'

/** What a designer's game is, apart from which version of it is being saved. */
export type Game = { name: string; cards: number; assets: LoadAssets }

/**
 * A designer on the box (#1012), doing over HTTP what the editor does: logging in by the link in
 * the mail, uploading pictures and typefaces, saving a game version after version, starting a
 * table, and later sending it a new version.
 *
 * Login goes through the mail, as on the box, because the box's stack does not take
 * `AUTH_BYPASS`. Without a mail service the app writes the mail to its log, which `mailbox` reads.
 */
export class Designer {
  private constructor(
    private readonly origin: string,
    private readonly cookie: string,
    readonly name: string,
  ) {}

  static async logIn(origin: string, email: string, mailbox: () => Promise<string>): Promise<Designer> {
    const asked = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    if (!asked.ok) throw new Error(`no login link for ${email}: ${asked.status} ${await asked.text()}`)
    const deadline = Date.now() + 15_000
    for (;;) {
      const token = linkTokenIn(await mailbox(), email)
      if (token) {
        const res = await fetch(`${origin}/auth/verify?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
        const cookie = res.headers.get('set-cookie')?.split(';')[0]
        if (!cookie) throw new Error(`the link for ${email} set no cookie: ${res.status}`)
        // The terms in force first (#1272): the box closes every way that writes until they are accepted.
        const { current } = (await (await fetch(`${origin}/terms`)).json()) as { current: { version: string } | null }
        if (current) await fetch(`${origin}/me/terms`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ version: current.version }) })
        return new Designer(origin, cookie, email)
      }
      if (Date.now() > deadline) throw new Error(`no mail to ${email} in the app's log`)
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  private async call(method: string, path: string, body?: unknown, type = 'application/json'): Promise<unknown> {
    const res = await fetch(`${this.origin}${path}`, {
      method,
      headers: { cookie: this.cookie, ...(body !== undefined ? { 'content-type': type } : {}) },
      ...(body !== undefined ? { body: body instanceof Uint8Array ? new Blob([new Uint8Array(body)]) : JSON.stringify(body) } : {}),
    })
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
    return res.json()
  }

  private async upload(bytes: Uint8Array, type: string): Promise<string> {
    return ((await this.call('POST', '/assets', bytes, type)) as { hash: string }).hash
  }

  /**
   * Everything the game draws with: `pictures` illustrations and one for the back, at a card
   * illustration's size and the asked weight, and two typefaces. `seed` keeps two designers'
   * pictures apart, as two designers' art is.
   */
  async uploadAssets(o: { pictures: number; pictureBytes: number; seed: number; fonts: { title: Uint8Array; body: Uint8Array } }): Promise<LoadAssets> {
    const pictures: string[] = []
    for (let i = 0; i < o.pictures; i++) pictures.push(await this.upload(picture(o.seed * 100_000 + i, { width: 900, height: 675, bytes: o.pictureBytes }), 'image/png'))
    const back = await this.upload(picture(o.seed * 100_000 + 99_999, { width: 750, height: 1050, bytes: o.pictureBytes }), 'image/png')
    return { pictures, back, fonts: { title: await this.upload(o.fonts.title, 'font/ttf'), body: await this.upload(o.fonts.body, 'font/ttf') } }
  }

  /** A game saved `versions` times over, each save one row of history, as an afternoon's editing is. */
  async saveGame(game: Game, versions: number): Promise<{ id: string; rev: number }> {
    let saved = (await this.call('POST', '/projects', loadGame({ ...game, generation: 1 }))) as { id: string; rev: number }
    for (let generation = 2; generation <= versions; generation++) saved = await this.saveVersion(saved, game, generation)
    return saved
  }

  async saveVersion(project: { id: string; rev: number }, game: Game, generation: number): Promise<{ id: string; rev: number }> {
    return (await this.call('PUT', `/projects/${encodeURIComponent(project.id)}`, { rev: project.rev, ...loadGame({ ...game, generation }) })) as { id: string; rev: number }
  }

  async startTable(projectId: string): Promise<TableAddress> {
    const started = (await this.call('POST', `/projects/${encodeURIComponent(projectId)}/sessions`)) as { id: string; code: string; hostKey: string }
    return { session: started.id, code: started.code, hostKey: started.hostKey }
  }

  /** Waits, as the television's start does (#765), until every texture of the table is drawn. */
  async texturesDone(session: string, budgetMs: number): Promise<{ total: number; seconds: number }> {
    return this.poll(() => this.call('GET', `/sessions/${encodeURIComponent(session)}/textures`), budgetMs)
  }

  /**
   * «Uppdatera bordet» (L5): the project's newest version is queued for drawing, waited for, and
   * then switched to at the table in one move — the full re-render a saved version means.
   */
  async refreshTable(session: string, budgetMs: number): Promise<{ total: number; seconds: number }> {
    const done = await this.poll(() => this.call('POST', `/sessions/${encodeURIComponent(session)}/prepare`), budgetMs)
    await this.call('POST', `/sessions/${encodeURIComponent(session)}/refresh`)
    return done
  }

  private async poll(ask: () => Promise<unknown>, budgetMs: number): Promise<{ total: number; seconds: number }> {
    const started = Date.now()
    for (;;) {
      const p = (await ask()) as { total: number; done: number; failed: string[] }
      if (p.failed.length > 0) throw new Error(`${p.failed.length} textures failed to render`)
      if (p.done >= p.total) return { total: p.total, seconds: Math.round((Date.now() - started) / 1000) }
      if (Date.now() - started > budgetMs) throw new Error(`textures still at ${p.done}/${p.total} after ${budgetMs / 1000} s`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

// The newest login link to an address, out of the app's log as `ConsoleMailer` writes it.
function linkTokenIn(log: string, email: string): string | null {
  let token: string | null = null
  for (const line of log.split('\n')) {
    if (!line.startsWith('{')) continue
    try {
      const entry = JSON.parse(line) as { msg?: string; to?: string; text?: string }
      const found = entry.msg === 'mail' && entry.to === email ? /token=([^&\s]+)/.exec(entry.text ?? '') : null
      if (found?.[1]) token = decodeURIComponent(found[1])
    } catch {
      // Not a line of ours.
    }
  }
  return token
}
