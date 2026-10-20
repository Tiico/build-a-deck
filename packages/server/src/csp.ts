import { createHash, randomBytes } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

// The page's Content-Security-Policy (#1008, DRIFT §14). Written here, sent by this server with
// the built app, so it goes wherever the app goes — the box behind its proxy, the E2E stack, a
// port opened straight to the world — and nothing in front of the box has to remember it.
//
// Each source is here because something the product does needs it; DRIFT §14 says what. What is
// not here is closed: a script from anywhere but this origin, an inline script the build did not
// write, an `onerror=` in a card's text, a frame of the app inside someone else's page.

// The catalogue the editor's font picker draws from (L27, DRIFT §12): the `css2` sheet as a
// stylesheet and as a fetch, the files it names as faces and as a fetch when a family is chosen.
const GOOGLE_CSS = 'https://fonts.googleapis.com'
const GOOGLE_FILES = 'https://fonts.gstatic.com'

export type PolicyInputs = {
  // The hashes of the inline scripts in the page this policy goes with, as CSP writes them.
  scriptHashes: readonly string[]
  // This response's nonce (`pageNonce`), for the inline script the edge in front of the box writes
  // into the page (#1043, DRIFT §14). None of the page's own scripts carries it.
  nonce: string
  // The table's socket on this origin: `ws://host` or `wss://host`, when the host is one we can name.
  socket: string | null
  // The object store the redirects of `/faces` and `/assets` point at (DRIFT §4), when there is one.
  objects: string | null
}

export function pagePolicy({ scriptHashes, nonce, socket, objects }: PolicyInputs): string {
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...scriptHashes, `'nonce-${nonce}'`]],
    // `'unsafe-inline'`, and why it is the one place it stands: React writes `style=` attributes,
    // the card preview sets the compiled card's own sheet as a `<style>` in its shadow root, and
    // the compiled card's markup carries its own `style=` too — none of it written at build time,
    // so there is nothing to hash. A style cannot run code; what it can do is draw, and only where
    // a script has already been let in, which is what `script-src` above is for.
    ['style-src', ["'self'", "'unsafe-inline'", GOOGLE_CSS]],
    // The felt's face travels inside the stylesheet as a data: URL (#95).
    ['font-src', ["'self'", 'data:', GOOGLE_FILES]],
    // data: for the QR code, the symbols, the theme tiles and a picture shown before it is uploaded.
    ['img-src', ["'self'", 'data:', ...(objects ? [objects] : [])]],
    ['connect-src', ["'self'", ...(socket ? [socket] : []), GOOGLE_CSS, GOOGLE_FILES, ...(objects ? [objects] : [])]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ]
  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}

// Cloudflare's JavaScript Detections (#1043): the edge writes an inline script into every page it
// passes on, its bytes different on every request, so no hash of ours can name it. It reads the
// nonce off this header instead and puts it on that script. A nonce is a secret for the length of
// one response: 128 random bits, never reused, and written nowhere in the page itself.
export function pageNonce(): string {
  return randomBytes(16).toString('base64')
}

// For the bytes a creator uploaded, served from this origin when there is no object store
// (DRIFT §4): an SVG opened on its own address is a document, and nothing in it may run here.
export const UPLOAD_POLICY = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"

// The scripts a page carries inline, hashed as CSP hashes them: the bytes between the tags.
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = []
  for (const [, attrs = '', body = ''] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(attrs)) continue
    out.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
  }
  return out
}

// Read off the very file that is served, and not written down at build time: the hashes cannot
// drift from the page, whatever the build puts in it next. A page is read once per change on disk.
const known = new Map<string, { mtimeMs: number; size: number; hashes: string[] }>()
export async function scriptHashesOf(file: string): Promise<string[]> {
  const s = await stat(file)
  const kept = known.get(file)
  if (kept && kept.mtimeMs === s.mtimeMs && kept.size === s.size) return kept.hashes
  const hashes = inlineScriptHashes(await readFile(file, 'utf8'))
  known.set(file, { mtimeMs: s.mtimeMs, size: s.size, hashes })
  return hashes
}

// The socket's origin as the page reached us: the host it asked for, with the scheme the proxy
// says it came by. A Host that is not a host name is left out rather than written into a header
// that other sources share — a `;` there would be a directive of its own.
export function socketOrigin(host: string | undefined, https: boolean): string | null {
  if (!host || !/^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/.test(host)) return null
  return `${https ? 'wss' : 'ws'}://${host}`
}
