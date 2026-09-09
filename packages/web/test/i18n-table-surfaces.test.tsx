// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { Activity, Snapshot } from '@byd/protocol'
import { projectActivity } from '@byd/engine'
import { Language, translate, type T } from '../src/i18n/index.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { useActivityLive } from '../src/table/useActivityLive.js'
import { ActionPanel } from '../src/table/ActionPanel.js'
import { feltLabels, handLabel, thingsOn } from '../src/table/keyboard.js'
import { buildScene } from './scene.js'

const english: T = (key, params) => translate('en', key, params)

const live = (which: 'polite' | 'assertive') => document.querySelector(`[data-status-live="${which}"]`)!.textContent

function Heard({ activity, view }: { activity: readonly Activity[]; view: Snapshot }) {
  useActivityLive(activity, view, 'A')
  return null
}

// What the table says out loud, in the reader's own language (A4, #27). The sentences for each
// line have gone through the catalogue since A4; the summary that gathers several of them up
// had not, so a reader in English was told "3 drag av de andra".
describe('the table\'s live region in the reader\'s own language', () => {
  it('counts what the others did in English, and says a lone move as the sentence it is', async () => {
    const { view, log } = buildScene()
    const lines = log.map(projectActivity)
    const at = (n: number) => lines.slice(0, n)
    const { rerender } = render(
      <Language lang="en">
        <StatusLive>
          <Heard activity={at(2)} view={view(null)} />
        </StatusLive>
      </Language>,
    )
    // Arriving at a table that is already being played is not news; the first list is only read.
    expect(live('polite')).toBe('')
    rerender(
      <Language lang="en">
        <StatusLive>
          <Heard activity={at(5)} view={view(null)} />
        </StatusLive>
      </Language>,
    )
    await waitFor(() => expect(live('polite')).toMatch(/^3 moves by the others, latest: /), { timeout: 3000 })
    expect(live('polite')).not.toMatch(/drag av de andra/)
  })
})

// Playing with a keyboard (#1, #2, variant C): every node on the felt is a control with a name,
// and Enter opens a panel of verbs and places. All of that is the tool's own words — the zone
// names and the card names inside them are the designer's and are never touched (B5).
describe('the keyboard on the felt in the reader\'s own language', () => {
  const panelOn = (kind: 'pile' | 'card') => {
    const { view } = buildScene()
    const v = view(null)
    const thing = thingsOn(v).find((t) => t.kind === kind)!
    render(
      <Language lang="en">
        <ActionPanel
          view={v}
          thing={thing}
          cards={[]}
          onClose={() => undefined}
          onRun={() => undefined}
          onLook={() => undefined}
          intentsFor={() => []}
          landedKey={() => ''}
        />
      </Language>,
    )
    return { view: v, thing }
  }

  it('opens the panel on a pile in English, keeping the names the designer gave the table', () => {
    panelOn('pile')
    // The pile is called what the designer called it, inside a sentence that is the tool's.
    expect(screen.getByRole('dialog', { name: 'Actions for Draghög' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Do', level: 3 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Move to', level: 3 })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Shuffle/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Split in half/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Free placement/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    // The one address a keyboard cannot say is still a row, and it says why in English too.
    expect(screen.getByRole('button', { name: /needs a pointer/ })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Blanda|Flytta till|Stäng|pekdon/)
  })

  it('says what a node on the felt is, and what a card in the hand is, in English', () => {
    const { view } = buildScene()
    const v = view(null)
    const said = [...feltLabels(v, english).values()]
    expect(said.every((s) => s.endsWith('. Enter opens actions.'))).toBe(true)
    expect(said).toContainEqual(expect.stringMatching(/^Top card in Draghög: Hidden card\./))
    expect(said.some((s) => /[åäö]/i.test(s.replace(/Draghög|Kasthög|Spelyta/g, '')))).toBe(false)

    const card = v.components.find((c) => c.cardRef !== null)!
    expect(handLabel(card, true, english)).toBe(`${card.cardRef!}, in my hand, marked. Enter opens actions.`)
    expect(handLabel(card, false)).toBe(`${card.cardRef!}, i min hand. Enter öppnar handlingar.`)
  })
})
