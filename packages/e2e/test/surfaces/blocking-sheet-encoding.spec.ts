import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { expect, test } from '@playwright/test'

// The sheet the first painting waits for travels compressed, and the box is what compresses it
// (#372, #366's measurement).
//
// The measurement behind this is `docs/ux-audits/2026-09-21/366-css-budget-matning.md`: the
// blocking sheet served without `Content-Encoding` costs **+2 692 ms** of first paint on Slow 4G
// with a fourfold CPU, against 2 104 ms as it is. That is thirty-five times what doubling the
// whole CSS budget would cost — the single largest item in the first painting's price, and until
// now the only one no gate could see, because nothing in the repo set the header at all. It held
// entirely on Cloudflare compressing at the edge.
//
// So the compression moved into the box (DRIFT §13). It travels with the build, and it holds
// without Cloudflare: a local run, a directly exposed port, an edge setting somebody changed. The
// edge may go on compressing on top; the point is that the product no longer *rests* on it.
//
// What this gate is careful about is its own emptiness. A gate that skips when something is
// missing is not a gate — `pnpm test` without `DATABASE_URL` drops fifteen Postgres tests and
// still says green, and this repo has paid for that. So every way this could fail to measure
// anything — no sheet in the document, no instance answering, a header that is not there — is
// written as a failure with a sentence saying which one it was, and never as a pass.
const OUT = process.env['BYD_E2E_WEB_DIST']
if (!OUT) throw new Error('the stack did not say where the built web app is (BYD_E2E_WEB_DIST); nothing here can be measured')

// Every `<link rel="stylesheet">` the head carries with nothing that would take it off the
// critical path: a `media` that does not apply, or a `rel` that only hints.
const blockingSheets = (html: string): string[] =>
  [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /rel="stylesheet"/.test(tag) && !/media="(print|[^"]*\bnot\b[^"]*)"/.test(tag))
    .map((tag) => /href="([^"]+)"/.exec(tag)?.[1] ?? '')
    .filter(Boolean)

/** The sheet the first painting blocks on, as a path on the origin, or a failure saying why not. */
const theBlockingSheet = (): string => {
  const index = readFileSync(join(OUT, 'index.html'), 'utf8')
  const sheets = blockingSheets(index)
  if (sheets.length !== 1) throw new Error(`the built document has ${sheets.length} blocking stylesheets, not one: ${JSON.stringify(sheets)}`)
  return sheets[0]!
}

test.describe('the blocking sheet travels compressed from the box (#372)', () => {
  test('is served with Content-Encoding to the browser that asked for it', async ({ page }) => {
    const href = theBlockingSheet()
    const seen: { encoding: string | null; asked: string | undefined }[] = []
    page.on('response', async (res) => {
      if (new URL(res.url()).pathname !== href) return
      // `allHeaders()` rather than `headers()`: what the browser actually put on the wire,
      // including the ones its own network stack adds — which is where `accept-encoding` is.
      seen.push({ encoding: await res.headerValue('content-encoding'), asked: (await res.request().allHeaders())['accept-encoding'] })
    })
    await page.goto('/', { waitUntil: 'load' })

    // Not vacuous: the page really did go to the network for the sheet, and it really did offer
    // to take it compressed. Either of those missing would make the reading below meaningless,
    // so they are failures of their own rather than a quiet zero.
    expect(seen.length, `the browser never fetched ${href}; nothing was measured`).toBe(1)
    const [got] = seen
    expect(got!.asked ?? '', 'the browser did not offer to take a compressed answer').toMatch(/\b(br|gzip)\b/)
    // And the answer came compressed. This is the line the whole issue is about.
    expect(got!.encoding ?? 'none', `${href} came back uncompressed`).toMatch(/^(br|gzip)$/)
  })

  // The same thing weighed rather than read. The browser hands back a decoded body and a header;
  // what the measurement in #366 is actually about is the count of bytes that crossed, so this one
  // opens the socket itself, offers one encoding at a time, and counts.
  test('weighs a fraction of itself on the wire, and decodes back to the file the box has', async () => {
    const href = theBlockingSheet()
    const onDisk = readFileSync(join(OUT, href.replace(/^\//, '')))
    // Not vacuous: there is a real sheet, of the size the budget is about, to compress.
    expect(onDisk.length, `${href} is too small for this measurement to mean anything`).toBeGreaterThan(50_000)

    for (const offer of ['br', 'gzip'] as const) {
      const answer = await ask(href, { 'accept-encoding': offer })
      expect(answer.status, `${href} did not answer with ${offer} offered`).toBe(200)
      expect(answer.headers['content-encoding'] ?? 'none', `${href} came back uncompressed with only ${offer} offered`).toBe(offer)
      // A shared cache in front of the box must not hand this answer to a client that asked for
      // something else.
      expect(answer.headers['vary'] ?? '', `${href} did not say what its answer varies on`).toMatch(/accept-encoding/i)
      // The bytes that crossed, against the bytes on disk. The measurement says this sheet is
      // 197 kB raw and about 101 kB compressed — half — and the floor below is deliberately far
      // from that, because what it is here to fell is an answer that is compressed in name only.
      expect(answer.bytes.length, `${offer} saved nothing on ${href}`).toBeLessThan(onDisk.length * 0.8)
      // And it is the same sheet: a header that says `br` over bytes that are not is worse than
      // no header, because every browser would then fail to paint at all.
      const decoded = offer === 'br' ? brotliDecompressSync(answer.bytes) : gunzipSync(answer.bytes)
      expect(decoded.equals(onDisk), `${offer} did not decode back to ${href}`).toBe(true)
    }

    // And a client that offers nothing gets the sheet as it is, not a body it cannot read.
    const plain = await ask(href, { 'accept-encoding': 'identity' })
    expect(plain.headers['content-encoding'] ?? 'none', `${href} was compressed for a client that refused compression`).toBe('none')
    expect(plain.bytes.equals(onDisk), `${href} did not come back whole for a client that refused compression`).toBe(true)
  })
})

/**
 * One request to the running box, with the bytes as they crossed.
 *
 * `node:http` rather than `fetch`, because every convenience in the way — undici, Playwright's
 * request context — decodes the answer and drops the header that this whole gate is about. A
 * measurement of what travels has to be made where the travelling happens.
 */
function ask(path: string, headers: Record<string, string>): Promise<{ status: number; headers: Record<string, string | undefined>; bytes: Buffer }> {
  const origin = process.env['BYD_E2E_ORIGIN']
  if (!origin) throw new Error('the stack did not say where it is listening (BYD_E2E_ORIGIN); nothing here can be measured')
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, origin), { headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string | undefined>, bytes: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.on('error', (cause) => reject(new Error(`the box did not answer ${path}: ${cause.message}`)))
    req.end()
  })
}
