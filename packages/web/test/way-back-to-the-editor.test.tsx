// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { TablePage } from '../src/table/TablePage.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { DocumentTitle } from '../src/status/DocumentTitle.js'
import { admit, createNamedSession, roomOf, startServer, type Running } from './fixture.js'
import { atWindow } from './felt-frame.js'

// Vägen tillbaka (#1217, L79, prototyp A): every screen the owner opens a table on leads back to
// the game's editor, by the editor's own tab, and no guest's screen does. Whether the tab is
// brought out rather than a new one opened is the browser's to prove, and `way-back-to-the-
// editor.spec.ts` in packages/e2e proves it; here is what each screen offers and where it leads.
let run: Running
beforeEach(async () => {
  run = await startServer()
  atWindow({ w: 1280, h: 800 })
})
afterEach(async () => {
  await run.stop()
})

// The editor as Mina spel opens it, with the fragment that makes the way a jump within the page.
const editorAt = () => `/editor?${new URLSearchParams({ project: 'p-s1', server: run.http }).toString()}#`
const way = () => screen.findByRole('link', { name: 'Tillbaka till Skogens herrar i editorn' })

describe('the way back to the editor (#1217)', () => {
  it('stands on the TV the editor started, on the brand’s line, and names the editor’s tab', async () => {
    const id = await createNamedSession(run, 'Skogens herrar')
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    const link = await way()
    expect(link.getAttribute('href')).toBe(editorAt())
    expect(link.getAttribute('target')).toBe('byd-editor-p-s1')
    expect(link.textContent).toBe('Skogens herrar')
    expect(link.closest('[data-brand]')).toBeTruthy()
  })

  it('stands on the table mode’s plate for the owner', async () => {
    const id = await createNamedSession(run, 'Skogens herrar')
    history.replaceState(null, '', `/table?session=${id}&owner=1&mode=table&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    expect((await way()).closest('.byd-table-plate')).toBeTruthy()
  })

  it('stands in the owner’s seat’s head, and giving the seat up leads to the editor rather than to Mina spel', async () => {
    const id = await createNamedSession(run, 'Skogens herrar')
    const left: string[] = []
    history.replaceState(null, '', `/online?session=${id}&seat=A&name=Vera&owner=1&server=${encodeURIComponent(run.url)}`)
    render(<OnlinePage onLeave={(url) => left.push(url)} />)
    const link = await way()
    expect(link.closest('header')).toBeTruthy()
    expect(link.getAttribute('target')).toBe('byd-editor-p-s1')

    screen.getByRole('button', { name: /^Lämna/ }).click()
    const sheet = await screen.findByRole('dialog', { name: 'Lämna bordet?' })
    // The third way, first in the sheet: to the editor with the seat kept.
    const stay = within(sheet).getByRole('link', { name: 'Till Skogens herrar, sitt kvar' })
    expect([stay.getAttribute('href'), stay.getAttribute('target')]).toEqual([editorAt(), 'byd-editor-p-s1'])
    within(sheet).getByRole('button', { name: 'Lämna bordet' }).click()
    await waitFor(() => expect(left).toEqual([editorAt().replace(/#$/, '')]))
  })

  it('stands above the owner’s note when she watches', async () => {
    const id = await createNamedSession(run, 'Skogens herrar')
    history.replaceState(null, '', `/observe?session=${id}&name=Vera&owner=1&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    expect((await way()).closest('aside')).toBeTruthy()
  })

  it('is not offered to a guest, though her screen has read the same record', async () => {
    const id = await createNamedSession(run, 'Skogens herrar')
    const token = await admit(run, id, 'A', 'Ada')
    const left: string[] = []
    // Without the room's code the screen reads the session record for its tab's title (#759): the
    // record that names the project, so only the owner's mark keeps the way from her.
    history.replaceState(null, '', `/online?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
    render(
      <DocumentTitle route="online">
        <OnlinePage onLeave={(url) => left.push(url)} />
      </DocumentTitle>,
    )
    await waitFor(() => expect(document.title).toMatch(/Skogens herrar/))
    expect(document.querySelector('[data-editor-way]')).toBeNull()
    screen.getByRole('button', { name: /^Lämna/ }).click()
    const sheet = await screen.findByRole('dialog', { name: 'Lämna bordet?' })
    expect(within(sheet).queryByRole('link')).toBeNull()
    within(sheet).getByRole('button', { name: 'Lämna bordet' }).click()
    await waitFor(() => expect(left).toHaveLength(1))
    expect(left[0]).not.toMatch(/editor/)
  })
})
