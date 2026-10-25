import { readFileSync } from 'node:fs'
import { request as playwrightRequest, type APIRequestContext, type APIResponse } from '@playwright/test'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { gameDoc, type Game } from './game.js'

export type { Game }

/** A table that exists on the server, and every address a client reaches it by. */
export type Table = {
  session: string
  /** What the television shows and a telephone is given (DRIFT §9). */
  code: string
  /** What opens the table's own screen. A seatless connection without it is refused. */
  hostKey: string
  /** The big screen, in the mode a group in one room uses. */
  tableUrl: string
  /** The big screen in television mode, which is the one that shows the code and the QR. */
  tvUrl: string
  seats: string[]
}

/** Admission bought with a code: a seat, or a chair by the wall. */
export type Admission = {
  session: string
  token: string
  name: string
  seat: string | null
  /** The telephone's hand. */
  playUrl: string
  /** The same seat in a window of its own, from somewhere else. */
  onlineUrl: string
  /** What someone who only watches is given (C8). */
  observeUrl: string
}

/**
 * A table, made the way the editor makes one: a project document, turned into a setup and a deck
 * by the very functions the server uses, and posted to `/sessions` by an account (`asBearer`).
 *
 * It is made over HTTP rather than by reaching into the server's own objects, because the server
 * is a process here and not a module — and because the response is what carries the host key and
 * the room code, which are the two things every journey below starts from.
 */
export async function makeTable(request: APIRequestContext, game: Game = {}): Promise<Table> {
  const doc = gameDoc(game)
  return tableOf(request, setupFromProject(doc), deckFromProject(doc))
}

/**
 * A table from a setup written out by hand, for the few facts that are about the *shape* of a
 * table rather than about a game: a floor too big for any window to show at life size, a seat on
 * an edge nothing else puts one on. `gameDoc` is the recipe and this is the exception to it.
 */
export async function tableOf(request: APIRequestContext, setup: unknown, deck?: unknown): Promise<Table> {
  const res = await asBearer(request, (bearer) => bearer.post('/sessions', { data: { version: 'e2e', setup, ...(deck ? { deck } : {}) } }))
  if (res.status !== 201) throw new Error(`the table was not created: ${res.status} ${res.text}`)
  const { id, code, hostKey } = JSON.parse(res.text) as { id: string; code: string; hostKey: string }
  const seats = (setup as { seats?: string[] }).seats ?? []
  const host = encodeURIComponent(hostKey)
  return {
    session: id,
    code,
    hostKey,
    seats,
    tableUrl: `/table?session=${encodeURIComponent(id)}&host=${host}&mode=table`,
    tvUrl: `/table?session=${encodeURIComponent(id)}&host=${host}&mode=tv`,
  }
}

/**
 * A request sent by the table's bearer (#1194).
 *
 * A table is always borne by an account, and the raw door opens nothing for nobody. A context that
 * is logged in already bears the table itself, as it would in the product. One that is not is
 * never logged in by this: the table is posted by an account of its own instead, logged in with
 * `AUTH_BYPASS` like every other login in the suite, in an API context of its own that is thrown
 * away afterwards — so a spec that made a table and then asks something as a stranger is still a
 * stranger.
 *
 * That context is made from the stack's origin, which `request` does not say; it is the origin
 * every context in the suite is pointed at (`playwright.config.ts`).
 */
async function asBearer(request: APIRequestContext, send: (bearer: APIRequestContext) => Promise<APIResponse>): Promise<{ status: number; text: string }> {
  const me = (await (await request.get('/auth/me')).json()) as { email: string | null }
  if (me.email !== null) {
    const res = await send(request)
    return { status: res.status(), text: await res.text() }
  }
  const origin = process.env['BYD_E2E_ORIGIN']
  if (!origin) throw new Error('the stack did not say where it is; BYD_E2E_ORIGIN is unset')
  const bearer = await playwrightRequest.newContext({ baseURL: origin })
  try {
    await logIn(bearer)
    const res = await send(bearer)
    return { status: res.status(), text: await res.text() }
  } finally {
    await bearer.dispose()
  }
}

/**
 * A code and a name, exchanged for a token — which is the whole of what a telephone does before
 * it can play (DRIFT §9). Pass a seat to sit down, or none to watch.
 *
 * A token is worth saying out loud: it is a bearer secret with a seat's authority, and it is what
 * a kick revokes. A spec that skips this and builds a `/play` address by hand is not testing the
 * product; it is testing a URL it wrote itself.
 */
export async function join(request: APIRequestContext, table: Table, who: { name: string; seat?: string }): Promise<Admission> {
  const res = await request.post(`/rooms/${encodeURIComponent(table.code)}/join`, {
    data: { name: who.name, ...(who.seat !== undefined ? { seat: who.seat } : {}) },
  })
  if (res.status() !== 201) throw new Error(`${who.name} was not let in: ${res.status()} ${await res.text()}`)
  const { session, token } = (await res.json()) as { session: string; token: string }
  // The address the picker sends a phone to (#1278): the table and the seat in the query, the
  // token in the fragment, which the browser sends nowhere, and her name in no address at all.
  const q = (extra: Record<string, string>) =>
    `${new URLSearchParams({ session, ...extra }).toString()}#${new URLSearchParams({ token }).toString()}`
  return {
    session,
    token,
    name: who.name,
    seat: who.seat ?? null,
    playUrl: `/play?${q(who.seat !== undefined ? { seat: who.seat } : {})}`,
    onlineUrl: `/online?${q(who.seat !== undefined ? { seat: who.seat } : {})}`,
    observeUrl: `/observe?${q({})}`,
  }
}

/**
 * An address with more in its query — a language, a code — kept ahead of its fragment, where a
 * guest's token is (#1278). Appending `&lang=sv` to a guest's address would put it in the token's
 * fragment, and the page would never read it.
 */
export function withQuery(url: string, extra: string): string {
  const at = url.indexOf('#')
  const [path, fragment] = at < 0 ? [url, ''] : [url.slice(0, at), url.slice(at)]
  return `${path}${path.includes('?') ? '&' : '?'}${extra}${fragment}`
}

/**
 * Logged in, in this browser context.
 *
 * The server is started with `AUTH_BYPASS`, so the address is enough and no mail is involved.
 * `page.request` shares the context's cookie jar, which is why logging in through it leaves the
 * page logged in — no token is ever handled by hand.
 *
 * The address must differ per test and does so by default. Logins are rate-limited per address
 * (`LoginLimiter`), so a suite that logged everyone in as `test@example.com` would start handing
 * out 429s once it got wide enough, in whichever test happened to be last.
 */
export async function logIn(request: APIRequestContext, email = `e2e-${crypto.randomUUID()}@example.com`, { terms = true }: { terms?: boolean } = {}): Promise<string> {
  const res = await request.post('/auth/login', { data: { email } })
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()} ${await res.text()}`)
  const body = (await res.json()) as { loggedIn?: boolean }
  if (!body.loggedIn) throw new Error('the server is not running with AUTH_BYPASS; the suite cannot log anyone in')
  if (terms) await acceptTerms(request)
  return email
}

/**
 * The terms in force accepted (#1272), as an account that has been through the step has them: the box
 * closes every way that writes until they are. `logIn` does it unless told not to, so a spec about
 * something else meets the product as a designer who has accepted does; a spec about the terms
 * themselves logs in with `{ terms: false }`.
 */
export async function acceptTerms(request: APIRequestContext, origin = ''): Promise<void> {
  const { current } = (await (await request.get(`${origin}/terms`)).json()) as { current: { version: string } | null }
  if (!current) return
  const res = await request.post(`${origin}/me/terms`, { data: { version: current.version } })
  if (res.status() !== 204) throw new Error(`the terms were not accepted: ${res.status()} ${await res.text()}`)
}

/**
 * A table started from a project, the way the editor's own button starts one. Some surfaces are
 * only worth measuring in the state a running table puts them in — the Bord tab's third column is
 * a list of tables, and an empty list is not what makes it tall.
 *
 * It answers with the table, so a spec can seat people at it through the host's own connection.
 * The seats are the project's and not the answer's, so a spec that needs them names them itself.
 */
// `seating` is the host's answer to «Hur sitter ni?» (#1286), which the table keeps.
export async function startTable(request: APIRequestContext, projectId: string, seating?: 'screen' | 'computer'): Promise<Omit<Table, 'seats'>> {
  const res = await request.post(`/projects/${encodeURIComponent(projectId)}/sessions`, seating ? { data: { seating } } : {})
  if (!res.ok()) throw new Error(`could not start a table on ${projectId}: ${res.status()} ${await res.text()}`)
  const started = (await res.json()) as { id: string; code: string; hostKey: string }
  const host = encodeURIComponent(started.hostKey)
  return {
    session: started.id,
    code: started.code,
    hostKey: started.hostKey,
    tableUrl: `/table?session=${encodeURIComponent(started.id)}&host=${host}&mode=table`,
    tvUrl: `/table?session=${encodeURIComponent(started.id)}&host=${host}&mode=tv`,
  }
}

/** A project of one's own, owned by whoever this context is logged in as. */
export async function makeProject(request: APIRequestContext, game: Game = {}): Promise<{ id: string; editorUrl: string }> {
  return makeProjectOf(request, gameDoc(game))
}

/**
 * A project from a document written out by hand, for a surface that only exists when the game
 * itself has a particular shape — a picture element bound to a column, a rulebook with a figure
 * in it. `gameDoc` is the recipe and this is the exception to it, as `tableOf` is to `makeTable`.
 */
export async function makeProjectOf(request: APIRequestContext, doc: unknown): Promise<{ id: string; editorUrl: string }> {
  const res = await request.post('/projects', { data: doc })
  if (res.status() !== 201) throw new Error(`the project was not created: ${res.status()} ${await res.text()}`)
  const { id } = (await res.json()) as { id: string }
  return { id, editorUrl: `/editor?project=${encodeURIComponent(id)}` }
}

/**
 * The last mail the server sent to an address, read out of its log the way `ConsoleMailer`
 * writes it (`support/stack.ts`). Waits for it, because the answer to the request that sent it
 * can arrive before the line has been flushed to the file.
 */
export async function mailTo(to: string): Promise<{ subject: string; text: string }> {
  const log = process.env['BYD_E2E_SERVER_LOG']
  if (!log) throw new Error('the stack did not say where the server writes its log')
  const deadline = Date.now() + 10_000
  for (;;) {
    const found = readFileSync(log, 'utf8')
      .split('\n')
      .flatMap((line) => {
        try {
          const entry = JSON.parse(line) as { msg?: string; to?: string; subject?: string; text?: string }
          return entry.msg === 'mail' && entry.to === to ? [{ subject: entry.subject ?? '', text: entry.text ?? '' }] : []
        } catch {
          return []
        }
      })
      .at(-1)
    if (found) return found
    if (Date.now() > deadline) throw new Error(`no mail to ${to} in the server's log`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

/**
 * A table with a rulebook (B7), started from a project the way the editor starts one. A table made
 * with `tableOf` has no project behind it and so no rules, and the phone draws no «Regler» at all.
 */
export async function tableWithRules(request: APIRequestContext, game: Game = {}): Promise<Table> {
  await logIn(request)
  const doc = gameDoc({ name: 'Skogens herrar', ...game }) as ReturnType<typeof gameDoc> & { rules?: unknown }
  doc.rules = { title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' }, { kind: 'text', id: 't1', text: 'Dra ett kort.' }, { kind: 'list', id: 'l1', ordered: true, items: ['Dra.', 'Lägg.'] }] }
  const project = await makeProjectOf(request, doc)
  const res = await request.post(`/projects/${encodeURIComponent(project.id)}/sessions`)
  if (!res.ok()) throw new Error(`could not start a table on ${project.id}: ${res.status()} ${await res.text()}`)
  const started = (await res.json()) as { id: string; code: string; hostKey: string }
  const host = encodeURIComponent(started.hostKey)
  return {
    session: started.id,
    code: started.code,
    hostKey: started.hostKey,
    seats: doc.setup.seats,
    tableUrl: `/table?session=${encodeURIComponent(started.id)}&host=${host}&mode=table`,
    tvUrl: `/table?session=${encodeURIComponent(started.id)}&host=${host}&mode=tv`,
  }
}
