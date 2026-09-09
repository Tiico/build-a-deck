// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Language } from '../src/i18n/index.js'
import { Question } from '../src/editor/Question.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'
import { useEditSocketImplementation, type EditSocketCtor } from '../src/editor/ProjectClient.js'
import { EditSocket } from './setup.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  useEditSocketImplementation(EditSocket as unknown as EditSocketCtor)
  await run.stop()
})

async function openEditor(width: number) {
  atWidth(width)
  await run.projects.create('p1', projectDoc())
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(
    <Language lang="en">
      <EditorPage />
    </Language>,
  )
  await screen.findByText('Skogens herrar')
}

// The surfaces that came in on the second trunk and never met the catalogue (#27, A4): the
// question asked before work is lost, the way home, the stage strip, and the phone's notice.
describe('the editor\'s newer surfaces in the reader\'s own language (A4)', () => {
  // Every question that does not name its own safe answer inherits this one, so a Swedish word
  // here is a Swedish word in every one of them.
  it('offers the safe answer in the reader\'s language without each question saying so', () => {
    const { unmount } = render(
      <Language lang="en">
        <Question label="Remove" className="x" confirm="Yes, remove" onConfirm={() => undefined} onCancel={() => undefined}>
          Remove the card?
        </Question>
      </Language>,
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Avbryt' })).toBeNull()
    unmount()
    render(
      <Language lang="sv">
        <Question label="Ta bort" className="x" confirm="Ja, ta bort" onConfirm={() => undefined} onCancel={() => undefined}>
          Ta bort kortet?
        </Question>
      </Language>,
    )
    expect(screen.getByRole('button', { name: 'Avbryt' })).toBeTruthy()
  })

  it('asks the question on the way out with unsaved work in English, and names the way home', async () => {
    const user = userEvent.setup()
    await openEditor(1280)
    const home = screen.getByRole('link', { name: 'My games' })
    // Something changed, so leaving is a question rather than a step.
    await user.click(screen.getByRole('tab', { name: 'Data' }))
    await user.click((await screen.findAllByRole('textbox'))[0]!)
    await user.keyboard('x')
    await user.click(home)

    const question = await screen.findByRole('alertdialog', { name: 'Unsaved changes' })
    expect(question.textContent).toContain('Unsaved changes in Skogens herrar.')
    expect(screen.getByRole('button', { name: 'Save and leave' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Leave without saving' })).toBeTruthy()
    // The game's own name is the designer's and stays as she wrote it (A4, B5).
    expect(document.body.textContent).toContain('Skogens herrar')
    expect(document.body.textContent).not.toMatch(/Osparade|lämna/)
  })

  it('says what a phone does not offer, and names the stages, in English', async () => {
    await openEditor(400)
    expect(screen.getByText(/The template is not drawn on a phone/)).toBeTruthy()
    const strip = screen.getByRole('tablist', { name: 'Editor stages' })
    expect([...strip.querySelectorAll('[role="tab"]')].map((b) => b.textContent)).toEqual(['Card wall', 'Data', 'Symbols', 'Rules', 'Tables'])
  })

  // D3, and the boundary in A4: a name belongs to whoever it names. An editor without an account
  // is shown to the others as somebody, and that word is written in the language the person
  // arriving is reading the tool in — then it is theirs, and travels with them unchanged. It
  // cannot follow each reader instead: it goes over the wire once and is read by everyone.
  it('lets an editor without an account arrive under the word in their own language', async () => {
    const seen: string[] = []
    useEditSocketImplementation(
      class extends EditSocket {
        constructor(url: string) {
          seen.push(url)
          super(url)
        }
      } as unknown as EditSocketCtor,
    )
    await openEditor(1280)
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(decodeURIComponent(seen[0]!)).toContain('name=Someone')
    expect(decodeURIComponent(seen[0]!)).not.toContain('Någon')
  })
})
