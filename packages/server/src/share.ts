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
const PICTURE = /(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")(\/[^"]*")/g

export function withPublicOrigin(html: string, origin: string): string {
  return html.replace(PICTURE, (_, head: string, path: string) => `${head}${origin}${path}`)
}

export type SharedPage = { identity: string; bytes: Buffer }
const made = new Map<string, SharedPage>()

/** The page at `file` with the pictures at `origin`, and a name for exactly these bytes. */
export async function sharedPage(file: string, origin: string): Promise<SharedPage> {
  const s = await stat(file)
  const identity = `${s.mtimeMs} ${s.size} ${origin} ${file}`
  const kept = made.get(file)
  if (kept?.identity === identity) return kept
  const page = { identity, bytes: Buffer.from(withPublicOrigin(await readFile(file, 'utf8'), origin)) }
  made.set(file, page)
  return page
}
