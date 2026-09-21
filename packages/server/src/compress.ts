import { readFile, stat } from 'node:fs/promises'
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
 * **Compressed once per deploy, not once per request.** The built web app is immutable for the
 * life of the image, so the answer for a given file never changes. Each file is compressed the
 * first time it is asked for and the bytes are kept; every later request is a buffer already in
 * hand. Steady-state CPU is therefore nil, which is the only reason the expensive setting below
 * is affordable at all. Compression runs in libuv's pool rather than on the loop, so the one
 * request that pays for it does not hold up a table's patches.
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
  const encoding = negotiate(accept)
  if (!encoding || !compressible(type)) return null
  const stats = await stat(file)
  if (stats.size < FLOOR_BYTES || stats.size > FILE_MAX_BYTES) return null
  // Separated by a character no path, size or clock reading contains, and written as a printable
  // one: a NUL in a source file makes grep call the whole file binary and skip it (#111's cousin,
  // `packages/web/test/sources-are-greppable.test.ts`).
  const key = `${encoding} ${stats.mtimeMs} ${stats.size} ${file}`
  const known = cache.get(key)
  if (known) return known
  const making = compress(file, encoding).catch(() => {
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

async function compress(file: string, encoding: Encoding): Promise<Cached | null> {
  const raw = await readFile(file)
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
