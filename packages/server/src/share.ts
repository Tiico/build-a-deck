import { readFile, stat } from 'node:fs/promises'

/**
 * A link shared in a chat shows Deckster's hand (#1084).
 *
 * A previewer — a chat app unfurling a login mail's link, an invitation or a room code — reads the
 * page's `og:image` and fetches the picture, and several of them (Facebook's, partly iMessage's)
 * skip one that is not an absolute address. The app knows its origin only from `PUBLIC_ORIGIN`
 * (A5, K12), and no domain may be written into the code, so the page names the picture by its path
 * and the server writes the origin in front of it as the page goes out.
 *
 * The origin is the deploy's, not the request's: a `Host` header is whatever the client said, and a
 * previewer keeps what it was told. Without a public origin the path is left as the build wrote it.
 *
 * The page is made once per file on disk and origin, not once per request, so it is still one set
 * of bytes per deploy and its compressed copy is made once (DRIFT §13). Only the pictures' meta
 * tags change; the inline scripts the policy hashes are untouched (DRIFT §14).
 */
const PICTURE = /(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")(\/[^"]*)(")/g
const ALT = /(<meta\s+property="og:image:alt"\s+content=")([^"]*)(")/g

export function withPublicOrigin(html: string, origin: string): string {
  return html.replace(PICTURE, (_, head: string, path: string, tail: string) => `${head}${origin}${path}${tail}`)
}

/**
 * The picture a room's or an invitation's link shows instead of the hand (#1417, L91): the game's
 * box as the renderer photographed it, by its path on this origin, and what it shows in words.
 */
export type LinkPicture = { path: string; alt: string }

export function withPicture(html: string, picture: LinkPicture): string {
  return html
    .replace(PICTURE, (_, head: string, _path: string, tail: string) => `${head}${picture.path}${tail}`)
    .replace(ALT, (_, head: string, _alt: string, tail: string) => `${head}${attribute(picture.alt)}${tail}`)
}
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const attribute = (text: string): string => text.replace(/[&<>"]/g, (c) => ENTITIES[c] ?? c)

export type SharedPage = { identity: string; bytes: Buffer }
const made = new Map<string, SharedPage>()
// One page per game whose still a link names, beside the plain one: a few dozen pages of a few
// kilobytes, and a page that falls out is made again from the file on disk.
const KEPT = 64

/** The page at `file` with the pictures at `origin`, and a name for exactly these bytes. */
export async function sharedPage(file: string, origin: string, picture: LinkPicture | null = null): Promise<SharedPage> {
  const s = await stat(file)
  const key = picture ? `${file} ${picture.path} ${picture.alt}` : file
  const identity = `${s.mtimeMs} ${s.size} ${origin} ${key}`
  const kept = made.get(key)
  if (kept?.identity === identity) return kept
  const html = await readFile(file, 'utf8')
  const page = { identity, bytes: Buffer.from(withPublicOrigin(picture ? withPicture(html, picture) : html, origin)) }
  if (made.size >= KEPT && !made.has(key)) made.delete(made.keys().next().value as string)
  made.set(key, page)
  return page
}
