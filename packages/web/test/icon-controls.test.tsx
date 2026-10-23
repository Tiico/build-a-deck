// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectActivity } from '@byd/engine'
import { SessionButtons } from '../src/player/SessionOverlays.js'
import { LastLine } from '../src/table/LastLine.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { throughTheDoor } from './wizard-door.js'
import { buildScene } from './scene.js'
import { atWidth } from './viewport.js'

// Secondary controls bear icons (L73, #1101, beställarens beslut C, led 3).
//
// A control whose verb is recognised without being read — undo, flag, leave, previous, next, the
// time of the last move — is drawn as its icon in the hand `glyphs.tsx` draws (#1083), and the
// word stays as the control's name and its tooltip: in the DOM for the reader who hears the page,
// and on the pointer for the one who hovers. The word is never only in an attribute, and the icon
// is never the only thing a screen reader gets.
//
// First actions (Spara, Starta bord, Spela…) and every menu keep their word; that is the
// difference between C and D, and D was turned down.
const noop = (): undefined => undefined
const idle = { send: async () => undefined, activity: [] } as unknown as Parameters<typeof SessionButtons>[0]['client']

// What an icon-only control is made of: the drawing, the word out of sight, and the word on hover.
function iconOnly(control: HTMLElement, word: string) {
  expect(control.querySelector('svg.byd-glyph'), `${word}: drawn`).not.toBeNull()
  const hidden = control.querySelector('.byd-offscreen')
  expect(hidden?.textContent, `${word}: the word stays in the DOM`).toBe(word)
  expect(control.getAttribute('title'), `${word}: the word on hover`).toBe(word)
  // Nothing but the drawing is seen: every text node outside the hidden span is blank.
  const seen = [...control.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent?.trim() ?? '').join('')
  expect(seen, `${word}: no visible word`).toBe('')
}

afterEach(cleanup)

describe('the phone’s row (L73, led 3)', () => {
  it('draws undo, flag and the way out as icons, each still named by its word', () => {
    const { view } = buildScene()
    render(<SessionButtons client={idle} view={view('A')} sheet={null} onSheet={noop} />)
    iconOnly(screen.getByRole('button', { name: 'Ångra' }), 'Ångra')
    iconOnly(screen.getByRole('button', { name: 'Flagga' }), 'Flagga')
    // The way out says where it leads (#48): the name is the whole sentence, the tooltip the word.
    iconOnly(screen.getByRole('button', { name: 'Lämna… eller avsluta bordet' }), 'Lämna…')
  })

  it('is icon-only at every width, not only under 375 px (L62 superseded)', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'player', 'player.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    // The rule that squares the three to a thumb stands outside any media query.
    const squared = /\.byd-player > header \.byd-undo[^{]*\{[^}]*width: 44px/.exec(css)
    expect(squared).not.toBeNull()
    const before = css.slice(0, squared!.index)
    const opened = (before.match(/@media/g) ?? []).length
    const closed = (before.match(/@media[^{]*\{[\s\S]*?\n\}/g) ?? []).length
    expect(opened, 'the icon rule is not inside a media query').toBe(closed)
    expect(css).toMatch(/\.byd-player > header \.byd-exit/)
  })
})

describe('the felt’s own corner (L73, led 3)', () => {
  it('draws the time of the last move with a clock, and keeps «Senast:» for the reader who hears it', async () => {
    const { view, log } = buildScene()
    render(<LastLine view={view(null)} activity={log.map(projectActivity)} />)
    // The corner is drawn once the felt's second sheet has arrived (`useAfterSheet`).
    await waitFor(() => expect(document.querySelector('[data-table-last]')).not.toBeNull())
    const line = document.querySelector('[data-table-last]') as HTMLElement
    expect(line.querySelector('svg.byd-glyph')).not.toBeNull()
    expect(line.querySelector('.byd-offscreen')?.textContent).toBe('Senast:')
    expect(line.querySelector('b')).toBeNull()
  })
})

describe('the guided start’s steps (L73, led 3)', () => {
  it('walks back and forward on arrows, each named by its word', () => {
    atWidth(390)
    history.replaceState(null, '', '/new')
    render(<NewProjectPage />)
    throughTheDoor()
    const nav = screen.getByRole('navigation', { name: 'Stegnavigering' })
    iconOnly(within(nav).getByRole('button', { name: 'Föregående' }), 'Föregående')
    iconOnly(within(nav).getByRole('button', { name: 'Nästa' }), 'Nästa')
  })
})
