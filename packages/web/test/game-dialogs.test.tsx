// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readExport } from '../src/account/api.js'
import { ExportDialog, ImportDialog } from '../src/account/GameDialogs.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The export and import windows (G5, #529) and what the follow-up asked of them (#542): the zip is
// saved under the name the server gives it, and what goes wrong is said in words — never an HTTP
// status, never silence.
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body instanceof Blob ? body : JSON.stringify(body), { status, headers: { 'content-type': body instanceof Blob ? 'application/zip' : 'application/json', ...headers } })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the zip’s name is the server’s (#542)', () => {
  it('reads the name the server gives the file, which says the version it holds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, new Blob(['PK']), { 'content-disposition': `attachment; filename="Skogens h_rskare rev-3.zip"; filename*=UTF-8''${encodeURIComponent('Skogens härskare rev-3.zip')}` })))
    expect(await readExport('http://api', 'p1')).toMatchObject({ state: 'ready', name: 'Skogens härskare rev-3.zip' })
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, new Blob(['PK']), { 'content-disposition': 'attachment; filename="Skogens herrar rev-2.zip"' })))
    expect(await readExport('http://api', 'p1')).toMatchObject({ state: 'ready', name: 'Skogens herrar rev-2.zip' })
  })
})

describe('the export window says what went wrong in words (#542)', () => {
  const saved: string[] = []
  beforeEach(() => {
    saved.length = 0
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download)
    })
  })
  const open = () => {
    render(
      <div className="byd-account">
        <ExportDialog http="http://api" game={{ id: 'p1', name: 'Skogens herrar', rev: 1 }} onClose={() => undefined} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Förbered export' }))
  }

  it('saves the zip under the name the server gave it, not the version the list had', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => (init?.method === 'POST' ? reply(202, { total: 3, done: 3 }) : reply(200, new Blob(['PK']), { 'content-disposition': 'attachment; filename="Skogens herrar rev-2.zip"' }))),
    )
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Ladda ner' }, { timeout: 5000 }))
    expect(saved).toEqual(['Skogens herrar rev-2.zip'])
  })

  for (const [status, words] of [
    [401, /logga in igen/i],
    [403, /bara ägaren och de som får redigera/i],
    [503, /tryckfilerna kan inte ritas just nu/i],
  ] as const) {
    it(`says what ${status} means rather than the number`, async () => {
      vi.stubGlobal('fetch', vi.fn(async () => reply(status, { error: 'x' })))
      open()
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toMatch(words)
      expect(alert.textContent).not.toContain(String(status))
    })
  }

  it('says so when the server cannot be reached, and lets the export be asked for again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    open()
    expect((await screen.findByRole('alert')).textContent).toMatch(/nå servern/)
    expect((screen.getByRole('button', { name: 'Förbered export' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('the import window never stands waiting on something that already happened (#542)', () => {
  const zip = new File(['PK'], 'Skogens herrar rev-1.zip', { type: 'application/zip' })
  const choose = (dialog: HTMLElement) => fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [zip] } })

  it('says the game was made even when the list could not be read again afterwards', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(201, { id: 'new-1', rev: 1 })))
    render(<ImportDialog http="http://api" onClose={() => undefined} onImported={() => Promise.reject(new Error('offline'))} onOpen={() => undefined} nameOf={() => undefined} />)
    choose(screen.getByRole('dialog'))
    expect(await within(screen.getByRole('dialog')).findByText(/är importerat/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Öppna spelet' })).toBeTruthy()
  })

  it('says so when the server cannot be reached, and nothing was made', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const onImported = vi.fn(async () => undefined)
    render(<ImportDialog http="http://api" onClose={() => undefined} onImported={onImported} onOpen={() => undefined} nameOf={() => undefined} />)
    choose(screen.getByRole('dialog'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/nå servern/)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Välj fil…' }) as HTMLButtonElement).disabled).toBe(false))
    expect(onImported).not.toHaveBeenCalled()
  })
})
