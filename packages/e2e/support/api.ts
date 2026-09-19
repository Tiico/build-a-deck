import type { APIRequestContext } from '@playwright/test'
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
 * by the very functions the server uses, and posted to `/sessions`.
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
  const res = await request.post('/sessions', { data: { version: 'e2e', setup, ...(deck ? { deck } : {}) } })
  if (res.status() !== 201) throw new Error(`the table was not created: ${res.status()} ${await res.text()}`)
  const { id, code, hostKey } = (await res.json()) as { id: string; code: string; hostKey: string }
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
  const q = (extra: Record<string, string>) =>
    new URLSearchParams({ session, name: who.name, token, ...extra }).toString()
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
export async function logIn(request: APIRequestContext, email = `e2e-${crypto.randomUUID()}@example.com`): Promise<string> {
  const res = await request.post('/auth/login', { data: { email } })
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()} ${await res.text()}`)
  const body = (await res.json()) as { loggedIn?: boolean }
  if (!body.loggedIn) throw new Error('the server is not running with AUTH_BYPASS; the suite cannot log anyone in')
  return email
}

/**
 * A table started from a project, the way the editor's own button starts one. Some surfaces are
 * only worth measuring in the state a running table puts them in — the Bord tab's third column is
 * a list of tables, and an empty list is not what makes it tall.
 */
export async function startTable(request: APIRequestContext, projectId: string): Promise<void> {
  const res = await request.post(`/projects/${encodeURIComponent(projectId)}/sessions`)
  if (!res.ok()) throw new Error(`could not start a table on ${projectId}: ${res.status()} ${await res.text()}`)
}

/** A project of one's own, owned by whoever this context is logged in as. */
export async function makeProject(request: APIRequestContext, game: Game = {}): Promise<{ id: string; editorUrl: string }> {
  const res = await request.post('/projects', { data: gameDoc(game) })
  if (res.status() !== 201) throw new Error(`the project was not created: ${res.status()} ${await res.text()}`)
  const { id } = (await res.json()) as { id: string }
  return { id, editorUrl: `/editor?project=${encodeURIComponent(id)}` }
}
