// @vitest-environment jsdom
// A symbol and a typeface wait for their bytes before anything asks for them (#959).
//
// #907 made the pictures wait: a picture is in the document before its bytes are (#339), and a
// surface that asked for them early got a 404 and kept it. A symbol placed on the card and a font
// file taken into the game are put into the document the same way, and the client already says
// they are on their way (`assetsArriving`) — but the card drew the symbol from its URL at once and
// declared the face's `@font-face` at once, so both were fetched before the bytes were there and
// stayed broken until the page was loaded again. Held at the door here, so the order is certain.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const FAMILY = 'Kortets typsnitt'
const WOFF2 = readFileSync(join(import.meta.dirname, '..', 'src', 'fonts', 'roboto-condensed-latin-wght-normal.woff2'))

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
  vi.restoreAllMocks()
})

// Every POST to `/assets` waits at the door until the test lets it through.
function holdUploads(): () => void {
  had = everyAddress().map((url) => /\/assets\/.*$/.exec(url)![0])
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  const real = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method === 'POST' && String(input).endsWith('/assets')) await held
    return real(input, init)
  })
  return release
}

async function open(doc: ProjectDoc, tab: string): Promise<void> {
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: tab }))
}

// Everything on the page that would make the browser ask the service for an asset: a source, and
// a mask or a face in the cards' own style sheets. Less what the game already had before the test
// sent anything (the fixture's own typeface), which is there to be fetched.
let had: string[] = []
function asked(): string[] {
  return everyAddress().filter((url) => !had.some((old) => url.endsWith(old)))
}
function everyAddress(): string[] {
  const srcs = [...document.querySelectorAll('img')].flatMap((img) => img.getAttribute('src') ?? [])
  const styles = [...document.querySelectorAll('style, [style]')].map((el) => (el.tagName === 'STYLE' ? (el.textContent ?? '') : (el.getAttribute('style') ?? '')))
  return [...srcs, ...styles.flatMap((css) => css.match(/\/assets\/[0-9a-f]{64}(\/bytes)?/g) ?? [])].filter((url) => /\/assets\/[0-9a-f]{64}/.test(url))
}

describe('a symbol and a typeface wait for their bytes (#959)', () => {
  it('draws a symbol placed on the card only once its bytes have arrived', async () => {
    await open(projectDoc(), 'Mall')
    const tools = await screen.findByRole('toolbar', { name: 'Verktyg' })
    const release = holdUploads()

    fireEvent.click(within(tools).getByRole('combobox', { name: 'Ikon' }))
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Symboler' })).getByRole('option', { name: /svärd/ }))
    // The element is on the card at once (#310), and its symbol draws nothing yet.
    await waitFor(() => expect(document.querySelector('#canvas [data-element="icon-1"] .byd-icon')).toBeTruthy())
    expect(asked()).toEqual([])
    // Nor does the game's set of symbols ask for it, in Speltema.
    fireEvent.click(screen.getByRole('tab', { name: 'Speltema' }))
    const head = screen.getByRole('button', { name: /^Spelets ikoner/ })
    if (head.getAttribute('aria-expanded') === 'false') fireEvent.click(head)
    const listed = await waitFor(() => {
      const img = document.querySelector('[data-icon="svärd"] img')
      if (!img) throw new Error('not listed yet')
      return img
    })
    expect(asked()).toEqual([])

    release()
    await waitFor(() => expect(listed.getAttribute('src')).toMatch(new RegExp(`^${run.http}/assets/[0-9a-f]{64}$`)))
    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    await waitFor(() => expect(document.querySelector('#canvas [data-element="icon-1"] img.byd-icon')?.getAttribute('src')).toBe(listed.getAttribute('src')))
  })

  it('declares a typeface taken into the game only once its bytes have arrived', async () => {
    // The template already asks for the family by name, so the file is used the moment it is in.
    const doc = projectDoc()
    for (const el of doc.template.faces['front']!.base) if (el.kind === 'text') el.font.family = FAMILY
    await open(doc, 'Speltema')
    const fonts = screen.getByRole('button', { name: /^Typsnitt/ })
    if (fonts.getAttribute('aria-expanded') === 'false') fireEvent.click(fonts)
    const release = holdUploads()

    fireEvent.change(await screen.findByLabelText(/ladda upp typsnitt/i), { target: { files: [new File([WOFF2], `${FAMILY}.woff2`, { type: 'font/woff2' })] } })
    await waitFor(() => expect(document.querySelector(`[data-font="${FAMILY}"]`)).toBeTruthy())
    // The cards are drawn in the fallback meanwhile, wherever they are looked at.
    fireEvent.click(screen.getByRole('tab', { name: 'Kortvägg' }))
    await waitFor(() => expect(document.querySelectorAll('.byd-preview [data-element="title"]').length).toBeGreaterThan(0))
    expect(asked()).toEqual([])

    release()
    await waitFor(() => expect(asked().some((url) => url.endsWith('/bytes'))).toBe(true))
    const sheet = [...document.querySelectorAll('.byd-preview style')].map((s) => s.textContent ?? '').join('\n')
    expect(sheet).toMatch(new RegExp(`@font-face\\{font-family:"${FAMILY}";src:url\\("${run.http}/assets/[0-9a-f]{64}/bytes"\\)`))
  })
})
