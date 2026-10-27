import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProjectDoc } from '../src/projects.js'
import { template } from './deck.js'
import { start, twoSeatSetup, type Running } from './fixture.js'

// Länkbilden (#1417, L91): rumskodens och inbjudans länk visar lådan när heron i Mina spel gör det,
// och annars Decksters hand (#1084). Bilden är «Visa upp» som stillbild, tagen av renderaren en gång
// per version och hämtad utan inloggning. En förhandsvisare kör ingen sida, så taggarna läses ur de
// bytes servern skickar, före och efter att lådan öppnats.

// The page as the build writes it: the pictures named by path, the origin written in as it goes out.
const PAGE = [
  '<!doctype html><html><head><title>Deckster</title>',
  '<meta property="og:image" content="/og-image.png" />',
  '<meta property="og:image:alt" content="Decksters hand: tre kort i bärnsten, grönt och papper, bredvid namnet Deckster." />',
  '<meta name="twitter:image" content="/og-image.png" />',
  '</head><body></body></html>',
].join('')
const HAND = 'http://test.local/og-image.png'

const doc = (name = 'Skogens råd'): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'r0', fields: { title: 'Ugglan', antal: 3 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

// The size a JPEG says it is, off its frame header.
function jpegSize(bytes: Uint8Array): { w: number; h: number } | null {
  for (let i = 2; i + 8 < bytes.length; ) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1]!
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!
    if (marker >= 0xc0 && marker <= 0xc2) return { h: (bytes[i + 5]! << 8) | bytes[i + 6]!, w: (bytes[i + 7]! << 8) | bytes[i + 8]! }
    i += 2 + length
  }
  return null
}

describe('länkbilden följer heron (#1417)', () => {
  let run: Running
  let cookie = ''
  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byd-still-'))
    await writeFile(join(dir, 'index.html'), PAGE)
    run = await start({ staticDir: dir })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  })
  afterEach(async () => {
    await run.stop()
  })
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
  // What a previewer reads: the page as it is sent to whoever asks for HTML, logged in or not.
  const tags = async (path: string) => {
    const html = await (await fetch(`${run.http}${path}`, { headers: { accept: 'text/html' } })).text()
    const meta = (key: string) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1]
    return { image: meta('og:image'), twitter: meta('twitter:image'), alt: meta('og:image:alt') }
  }
  const links = async () => {
    await send('POST', '/projects', { id: 'p1', ...doc() })
    const table = (await (await send('POST', '/projects/p1/sessions')).json()) as { code: string }
    await send('POST', '/projects/p1/invites', { email: 'bo@example.com', role: 'editor' })
    const token = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    expect(table.code).toMatch(/^[A-Z0-9]+$/)
    expect(token).not.toBe('')
    return [`/${table.code}`, `/invites/${token}`]
  }

  it("names Deckster's hand until the box is opened, and the still once it is and has been drawn", async () => {
    const paths = await links()
    for (const path of paths) expect({ path, ...(await tags(path)) }).toMatchObject({ path, image: HAND, twitter: HAND })

    expect((await send('POST', '/projects/p1/box/opened')).status).toBe(204)
    // Asked for by the first page that would name it, and named once it is there: a previewer
    // fetches the picture at once, and one that is still being drawn would be no picture at all.
    for (const path of paths) expect({ path, ...(await tags(path)) }).toMatchObject({ path, image: HAND })
    await run.renderAll()
    const still = await tags(paths[0]!)
    expect(still.image).toMatch(/^http:\/\/test\.local\/faces\/[0-9a-f]{64}$/)
    expect(still.twitter).toBe(still.image)
    expect(still.alt).toContain('Skogens råd')
    expect(await tags(paths[1]!)).toEqual(still)

    // Fetched without logging in, as a previewer does: a JPEG of 1200 × 630.
    const picture = await fetch(still.image!.replace('http://test.local', run.http))
    expect(picture.status).toBe(200)
    expect(picture.headers.get('content-type')).toBe('image/jpeg')
    expect(jpegSize(new Uint8Array(await picture.arrayBuffer()))).toEqual({ w: 1200, h: 630 })
  }, 120_000)

  it('keeps the hand on the landing page, whatever any game has', async () => {
    await links()
    await send('POST', '/projects/p1/box/opened')
    await run.renderAll()
    expect(await tags('/')).toMatchObject({ image: HAND, twitter: HAND })
  }, 120_000)

  // «Spara bilden» (#1417): the same rendering, asked for from «Visa upp» by whoever may read the game,
  // and handed over as a file to keep rather than a picture to show.
  it('orders the same still for «Spara bilden», and hands it over to be saved', async () => {
    const paths = await links()
    await send('POST', '/projects/p1/box/opened')
    const ordered = await send('POST', '/projects/p1/still')
    expect(ordered.status).toBe(202)
    const { hash } = (await ordered.json()) as { hash: string }
    await run.renderAll()
    expect((await tags(paths[0]!)).image).toBe(`http://test.local/faces/${hash}`)
    const saved = await fetch(`${run.http}/faces/${hash}?name=${encodeURIComponent('Skogens råd.jpg')}&download=1`)
    expect(saved.status).toBe(200)
    expect(saved.headers.get('content-disposition')).toMatch(/^attachment; filename="Skogens r.d\.jpg"; filename\*=UTF-8''Skogens%20r%C3%A5d\.jpg$/)
    expect((await fetch(`${run.http}/projects/p1/still`, { method: 'POST' })).status).toBe(401)
  }, 120_000)
})
