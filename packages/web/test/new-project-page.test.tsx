// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

function open(onNavigate: (url: string) => void) {
  history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
  render(<NewProjectPage onNavigate={onNavigate} />)
}

describe('NewProjectPage (L6, approved prototype A)', () => {
  it('builds starter cards graphically and shows a newly added field on every card', () => {
    open(() => undefined)

    expect(screen.queryByLabelText('Kort som CSV')).toBeNull()
    expect(screen.getByLabelText('kort 1 Titel')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Textfält' }))
    expect(screen.getByLabelText('kort 1 Nytt textfält')).toBeTruthy()
    expect(screen.getByText('Placeras på mallen i editorn')).toBeTruthy()
  })

  it('lets the designer choose an image for an image field and previews it', async () => {
    open(() => undefined)
    const input = screen.getByLabelText('kort 1 Illustration') as HTMLInputElement
    expect(input.type).toBe('file')

    const file = new File(['bilddata'], 'drake.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByRole('img', { name: 'Förhandsvisning av Illustration' })).toBeTruthy()
  })

  it('builds a project from the form with a live card, and hands off to the editor', async () => {
    const gone: string[] = []
    open((url) => gone.push(url))
    const live = () => within(document.querySelector('.byd-wizard-preview') as HTMLElement)
    expect(live().getByText('Kort 1')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'Skogens herrar' } })
    fireEvent.click(screen.getByRole('button', { name: /^3$/ }))
    fireEvent.change(screen.getByLabelText('kort 1 Titel'), { target: { value: 'Drake' } })
    const file = new File(['bilddata'], 'drake.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('kort 1 Illustration'), { target: { files: [file] } })
    await screen.findByRole('img', { name: 'Förhandsvisning av Illustration' })
    fireEvent.click(screen.getByRole('button', { name: '+ Nytt kort' }))
    fireEvent.change(screen.getByLabelText('kort 2 Titel'), { target: { value: 'Riddare' } })

    fireEvent.click(screen.getByRole('button', { name: /skapa spelet och fortsätt i editorn/i }))
    await waitFor(() => expect(gone).toHaveLength(1))
    const url = new URL(gone[0]!, 'http://x')
    expect(url.pathname).toBe('/editor')
    const id = url.searchParams.get('project')!
    expect(url.searchParams.get('server')).toBe(run.http)
    const stored = await run.projects.load(id)
    expect(stored?.name).toBe('Skogens herrar')
    expect(stored?.rows.map((r) => r.id)).toEqual(['drake', 'riddare'])
    expect(stored?.rows[0]?.fields['art']).toMatch(/^data:image\/png;base64,/)
    expect(stored?.setup.seats).toEqual(['A', 'B', 'C'])
    expect(stored?.template.faces['front']?.base.map((e) => e.id)).toContain('art')
  })

  it('makes the editor the clear next step instead of offering a direct table', () => {
    open(() => undefined)
    expect(screen.getByText('Wizarden är startpunkten')).toBeTruthy()
    expect(screen.getByText(/csv-verktyg väntar i editorn/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /öppna bordet/i })).toBeNull()
  })

  it('cannot proceed without a name', () => {
    open(() => undefined)
    const next = screen.getByRole('button', { name: /fortsätt i editorn/i }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'X' } })
    expect(next.disabled).toBe(false)
  })
})
