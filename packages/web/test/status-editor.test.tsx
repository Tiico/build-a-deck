// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DocumentTitle } from '../src/status/DocumentTitle.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { requestLink } from '../src/account/api.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

function open(query: string) {
  history.replaceState(null, '', `/editor?${query}`)
  render(
    <DocumentTitle route="editor">
      <StatusLive>
        <EditorPage />
      </StatusLive>
    </DocumentTitle>,
  )
}

const notice = () => document.querySelector('[data-status-notice]')
const noticeState = () => notice()?.getAttribute('data-status-notice') ?? null

// UX-07: an invalid project could give a blank page with a raw English sentence on it, no way
// back and nothing to try again.
describe('a project that does not exist', () => {
  it('says so in Swedish and never in the server s own words', async () => {
    open(`project=nope&server=${encodeURIComponent(run.http)}`)
    await waitFor(() => expect(noticeState()).toBe('missing'))
    const said = notice()!.textContent ?? ''
    expect(said).toMatch(/hittar inte spelet/i)
    expect(said).not.toMatch(/unknown project|could not load|Error/)
  })

  it('offers a way back to the games, as a link and not a reload', async () => {
    open(`project=nope&server=${encodeURIComponent(run.http)}`)
    await waitFor(() => expect(noticeState()).toBe('missing'))
    expect(within(notice() as HTMLElement).getByRole('link', { name: /mina spel/i }).getAttribute('href')).toMatch(/^\/(\?|$)/)
  })

  it('names the missing game in the tab', async () => {
    open(`project=nope&server=${encodeURIComponent(run.http)}`)
    await waitFor(() => expect(document.title).toBe('Spelet finns inte · build-your-deck'))
  })
})

describe('a project that belongs to someone else', () => {
  it('says it is shut rather than broken, and offers both a login and a way home', async () => {
    const owned = await startServer({ auth: true, authBypass: true })
    try {
      await owned.projects.create('p1', projectDoc(), 'någon-annan')
      // Logged in, but as someone the project does not belong to: shut, not broken.
      await requestLink(owned.http, 'ada@example.test', '/')
      open(`project=p1&server=${encodeURIComponent(owned.http)}`)
      await waitFor(() => expect(noticeState()).toBe('forbidden'))
      const panel = notice() as HTMLElement
      expect(panel.textContent).toMatch(/någon annan|inte tillgång/i)
      expect(within(panel).getByRole('link', { name: /logga in/i })).toBeTruthy()
      expect(within(panel).getByRole('link', { name: /mina spel/i })).toBeTruthy()
      await waitFor(() => expect(document.title).toBe('Ingen tillgång · build-your-deck'))
    } finally {
      await owned.stop()
    }
  })
})

describe('a server the editor cannot reach', () => {
  it('says there is no contact, keeps the work safe in the sentence, and offers a retry', async () => {
    open(`project=p1&server=${encodeURIComponent('http://127.0.0.1:1')}`)
    await waitFor(() => expect(noticeState()).toBe('offline'), { timeout: 4000 })
    const panel = notice() as HTMLElement
    expect(panel.textContent).toMatch(/når inte servern/i)
    expect(within(panel).getByRole('button', { name: /försök igen/i })).toBeTruthy()
    await waitFor(() => expect(document.title).toBe('Ingen kontakt · build-your-deck'))
  })

  it('asks the server again in place when a person presses, and opens the game when it answers', async () => {
    await run.projects.create('p1', projectDoc())
    // The server is down when the editor opens and up again when the button is pressed. Nothing
    // is reloaded: the same request is made a second time, on the same page.
    await run.stop()
    open(`project=p1&server=${encodeURIComponent(run.http)}`)
    await waitFor(() => expect(noticeState()).toBe('offline'), { timeout: 4000 })
    await run.restart()
    await userEvent.click(screen.getByRole('button', { name: /försök igen/i }))
    expect(await screen.findByText('Skogens herrar')).toBeTruthy()
  })
})

describe('a project on its way in', () => {
  it('says it is loading, in the editor s own words', async () => {
    await run.projects.create('p1', projectDoc())
    open(`project=p1&server=${encodeURIComponent(run.http)}`)
    expect(noticeState()).toBe('loading')
    expect(notice()!.textContent).toMatch(/öppnar spelet/i)
    await screen.findByText('Skogens herrar')
  })

  it('names the game in the tab once it is open', async () => {
    await run.projects.create('p1', projectDoc())
    open(`project=p1&server=${encodeURIComponent(run.http)}`)
    await screen.findByText('Skogens herrar')
    await waitFor(() => expect(document.title).toBe('Skogens herrar · Editor · build-your-deck'))
  })
})

describe('a link with no project in it', () => {
  it('is a link to a game that does not exist, and says so', async () => {
    open('')
    await waitFor(() => expect(noticeState()).toBe('missing'))
  })
})
