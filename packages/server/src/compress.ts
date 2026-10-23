import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, constants, gzip } from 'node:zlib'

/**
 * The box compresses what it serves (DRIFT §13, #372).
 *
 * The blocking stylesheet served without `Content-Encoding` costs +2 692 ms of first paint on
 * Slow 4G with a fourfold CPU — thirty-five times what doubling the whole CSS budget would cost
 * (`docs/ux-audits/2026-09-21/366-css-budget-matning.md`). Until now nothing in the repo set the
 * header: it held entirely on Cloudflare compressing at the edge, which means it did not hold for
 * a local run, a directly exposed port, or an edge setting somebody changed. The edge may go on
 * compressing on top of this; what changes is that the product no longer rests on it.
 *
 * Two things decide the shape of what is below, and both come from the box being a shared machine
 * with four cores, 8 GB of memory it does not own, and a 512 MB cap on this container (DRIFT §1).
 *
 * **Compressed by the build, not by the box.** The built web app is immutable for the life of the
 * image, so the answer for a given file never changes, and `precompress` writes it beside the file
 * when the app is built: `app.css.br` and `app.css.gz`. The box streams that copy from disk, so it
 * spends no CPU and holds nothing in memory for it. Until #1087 the box made the copy itself the
 * first time a file was asked for and kept it, which was affordable while the app was well under a
 * megabyte of text; the game-icons chunk is 6.4 MB, brotli's best over it is 14 s on an idle Mac
 * and 72 s on a busy one, and the first designer after a deploy waited that long with the icon
 * sheet open.
 *
 * What the build did not compress — a file written under a running server, a page the server
 * writes itself (#1084), a run without a build — is still compressed here once and kept, in libuv's
 * pool rather than on the loop, so the one request that pays for it does not hold up a table's
 * patches.
 *
 * **Brotli where the browser takes it, gzip otherwise.** Every browser that reaches a felt speaks
 * brotli, and on this sheet it is 100 916 bytes against gzip's 105 189 — four per cent, which is
 * not much, but it costs nothing per request once the answer is kept. Brotli's quality 11 is the
 * setting nobody runs per request and everybody runs on a build artefact; this is a build
 * artefact. gzip stays for whatever does not offer brotli, and identity for whatever offers
 * neither.
 *
 * What is *not* compressed is as deliberate. Already-compressed bytes — the textures, the icon,
 * a woff2 that ever appears beside the app — spend CPU to grow, so only the text types are
 * eligible. Very small files are left alone because the header costs more than the saving. And
 * dynamic answers are not touched here at all: they are kilobytes of JSON, they differ per
 * request, and compressing them would be exactly the per-request CPU on a shared box that the
 * cache above exists to avoid.
 */

/** The types the box serves, by the file's ending. */
export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

export const typeOf = (file: string): string => MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'

const gzipAsync = promisify(gzip)
const brotliAsync = promisify(brotliCompress)

/** The encodings the box speaks, best first. */
export type Encoding = 'br' | 'gzip'

/**
 * What compresses and what does not. Read off the content type rather than the extension, so a
 * new file type is eligible the moment it is served as text.
 *
 * `image/svg+xml` is here because it is text wearing an image's type; `image/png` and `font/woff2`
 * are the ones this has to keep out, and they are already compressed to within a per cent of
 * themselves.
 */
export const compressible = (type: string): boolean =>
  /^text\//.test(type) || /^(application\/(json|xml|javascript)|image\/svg\+xml)\b/.test(type)

/**
 * Below this a compressed answer is not worth the header it travels with — and often is not
 * smaller at all. One MSS of payload is the usual line and the usual line is right here.
 */
const FLOOR_BYTES = 1024

/**
 * Two caps, both about a box that is not ours alone.
 *
 * A file larger than the first is streamed as it is: the web app has nothing of the sort, and a
 * day it does, holding two compressed copies of it in a 512 MB container is worse than the bytes
 * on the wire. The second is the whole cache — the built app is well under a megabyte of text, so
 * this is headroom rather than a limit, and the point of having it is that an unexpected tree of
 * files degrades to identity instead of to an out-of-memory.
 */
const FILE_MAX_BYTES = 8 * 1024 * 1024
const CACHE_MAX_BYTES = 32 * 1024 * 1024

/**
 * The best encoding this client takes, or null for identity.
 *
 * `q=0` is a refusal and is honoured — it is how a client says "anything but that" — and a bare
 * `*` stands for whatever the box prefers.
 */
export const negotiate = (accept: string | undefined): Encoding | null => {
  if (!accept) return null
  const offered = new Map<string, number>()
  for (const part of accept.split(',')) {
    const [name, ...params] = part.trim().split(';')
    if (!name) continue
    const q = params.map((p) => /^\s*q=([0-9.]+)\s*$/.exec(p)).find(Boolean)
    offered.set(name.trim().toLowerCase(), q ? Number(q[1]) : 1)
  }
  const takes = (name: Encoding): boolean => (offered.get(name) ?? offered.get('*') ?? 0) > 0
  if (takes('br')) return 'br'
  if (takes('gzip')) return 'gzip'
  return null
}

const ENDING: Record<Encoding, string> = { br: '.br', gzip: '.gz' }

/**
 * Every file under `dir` the box would compress, compressed beside itself in both encodings, by
 * the same rule and at the same settings as below. Run by the web app's build; a copy that would
 * not be smaller is not written, and the box then sends the file as it is.
 */
export async function precompress(dir: string): Promise<void> {
  const files = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name))
  await Promise.all(
    files
      .filter((file) => !file.endsWith(ENDING.br) && !file.endsWith(ENDING.gzip) && compressible(typeOf(file)))
      .map(async (file) => {
        const raw = await readFile(file)
        if (raw.length < FLOOR_BYTES) return
        await Promise.all(
          (['br', 'gzip'] as const).map(async (encoding) => {
            const made = await compress(raw, encoding)
            if (made) await writeFile(file + ENDING[encoding], made.bytes)
          }),
        )
      }),
  )
}

/**
 * The copy the build made of this file for this client, when there is one, and it was made from
 * the file as it is now: a copy older than its file is a copy of the file that was there before.
 */
export async function precompressed(file: string, type: string, accept: string | undefined): Promise<{ path: string; encoding: Encoding; size: number } | null> {
  const encoding = negotiate(accept)
  if (!encoding || !compressible(type)) return null
  const path = file + ENDING[encoding]
  try {
    const [copy, original] = await Promise.all([stat(path), stat(file)])
    return copy.isFile() && copy.mtimeMs >= original.mtimeMs ? { path, encoding, size: copy.size } : null
  } catch {
    return null
  }
}

type Cached = { encoding: Encoding; bytes: Buffer }

// Keyed by the file's identity *and* its state on disk, so a rebuilt app under a running server —
// which is what a development run does — is never answered from the previous build's bytes.
const cache = new Map<string, Promise<Cached | null>>()
let held = 0

/**
 * The file compressed, or null when it should go out as it is.
 *
 * Null is not a failure: it is the answer for a type that does not compress, a file under the
 * floor, a client that asked for identity, and a compression that did not pay for itself. The
 * caller sends the file unchanged in every one of those cases.
 */
export async function encodedCopy(file: string, type: string, accept: string | undefined): Promise<Cached | null> {
  const stats = await stat(file)
  return encoded(`${stats.mtimeMs} ${stats.size} ${file}`, stats.size, () => readFile(file), type, accept)
}

/**
 * The same for bytes the server made rather than found: a page with the public origin written into
 * it (#1084). `identity` says which bytes these are, and has to change whenever they do — the file
 * they were made from and what was written into it — because the answer is kept for as long as the
 * file is.
 */
export async function encodedBytes(identity: string, raw: Buffer, type: string, accept: string | undefined): Promise<Cached | null> {
  return encoded(identity, raw.length, async () => raw, type, accept)
}

async function encoded(identity: string, size: number, read: () => Promise<Buffer>, type: string, accept: string | undefined): Promise<Cached | null> {
  const encoding = negotiate(accept)
  if (!encoding || !compressible(type)) return null
  if (size < FLOOR_BYTES || size > FILE_MAX_BYTES) return null
  // Separated by a character no path, size or clock reading contains, and written as a printable
  // one: a NUL in a source file makes grep call the whole file binary and skip it (#111's cousin,
  // `packages/web/test/sources-are-greppable.test.ts`).
  const key = `${encoding} ${identity}`
  const known = cache.get(key)
  if (known) return known
  const making = read()
    .then((raw) => compress(raw, encoding))
    .catch(() => {
      // A compression that fails is a file that goes out as it is, not a request that fails. It is
      // also not remembered as a failure: the next request tries again.
      cache.delete(key)
      return null
    })
  cache.set(key, making)
  const made = await making
  // The accounting is done once the bytes exist, and the entry is dropped rather than the cache
  // emptied: what is already held is what is already being asked for.
  if (made) {
    if (held + made.bytes.length > CACHE_MAX_BYTES) cache.delete(key)
    else held += made.bytes.length
  }
  return made
}

async function compress(raw: Buffer, encoding: Encoding): Promise<Cached | null> {
  const bytes =
    encoding === 'br'
      ? await brotliAsync(raw, {
          params: {
            [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
            // Text mode, and the window told what it is looking at: both are free to set and both
            // are the difference between brotli and a slower gzip on a stylesheet.
            [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
            [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
          },
        })
      : await gzipAsync(raw, { level: constants.Z_BEST_COMPRESSION })
  // A file that does not shrink is sent as it is. It happens — an already-compressed payload
  // wearing a text type — and sending it compressed would cost the client a decode for nothing.
  return bytes.length < raw.length ? { encoding, bytes } : null
}
