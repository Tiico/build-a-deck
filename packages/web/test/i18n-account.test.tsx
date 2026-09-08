// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Language } from '../src/i18n/index.js'
import { LoginCard } from '../src/account/LoginCard.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { buildProject } from '../src/wizard/build.js'
import { defaultFields } from '../src/wizard/frames.js'
import { translate } from '../src/i18n/index.js'

// The account and the guided start in the reader's own language (A4). Neither surface talks to a
// server before it is touched, so the language is all these tests are about.
beforeEach(() => {
  history.replaceState(null, '', '/')
  sessionStorage.clear()
})

describe('the login card (G1) in the reader\'s own language', () => {
  it('says everything in English under an English page, and offers the switch', () => {
    render(
      <Language lang="en">
        <LoginCard http="http://server.local" next="/" onNavigate={() => undefined} />
      </Language>,
    )
    expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByText(/Log in to get to your games/)).toBeTruthy()
    expect(screen.getByText(/no account needed/)).toBeTruthy()
    // The reader can put the page back into Swedish from where they are standing.
    expect(screen.getByRole('combobox', { name: /språk|language/i })).toBeTruthy()
    expect(screen.queryByText(/Skicka inloggningslänk/)).toBeNull()
  })

  it('stays Swedish when no language is given, because Swedish is the catalogue', () => {
    render(<LoginCard http="http://server.local" next="/" onNavigate={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Skicka inloggningslänk' })).toBeTruthy()
    expect(screen.getByLabelText('E-post')).toBeTruthy()
  })
})

describe('the guided start (L6) in the reader\'s own language', () => {
  it('lays the new game\'s table out in the designer\'s own language (B5, A4)', () => {
    // A zone the recipe makes is the designer's document from the moment it exists, so it must
    // not arrive in the tool's home language and wait to be renamed.
    const state = { name: 'Lords', players: 2, fields: defaultFields((key, params) => translate('en', key, params)), frame: 'classic', rows: [] }
    const english = buildProject(state, (key, params) => translate('en', key, params))
    expect(english.setup.zones.map((z) => z.name)).toContain('Draw pile')
    expect(english.setup.zones.map((z) => z.name)).toContain('In front of A')
    const swedish = buildProject(state)
    expect(swedish.setup.zones.map((z) => z.name)).toContain('Draghög')
  })

  it('speaks English about itself while leaving what the designer will write alone', () => {
    render(
      <Language lang="en">
        <NewProjectPage onNavigate={() => undefined} />
      </Language>,
    )
    expect(screen.getByText('Guided start')).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Text field' })).toBeTruthy()
    expect(screen.getByText('Starter frame')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Create the game and continue in the editor/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Classic' })).toBeTruthy()
    // The example card the wizard seeds is a word the designer reads and writes over, like the
    // field names it suggests, so it starts in the language they are building the game in.
    expect(screen.getByRole('button', { name: /Card 1/ })).toBeTruthy()
    cleanup()

    render(<NewProjectPage onNavigate={() => undefined} />)
    expect(screen.getByText('Guidad start')).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Textfält' })).toBeTruthy()
  })
})
