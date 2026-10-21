// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { layerPick } from './layers.js'

// «Ikon och färg» on an icon layer (#1087, L71, beslut A): an icon per card type is a table to fill
// in, a row per value of the column with the icon and its colour side by side, and the libraries'
// sheet opens under the card for the row that was pressed. Driven through the whole editor against
// a real service, because what has to be true afterwards is the card and the game's set, not a
// component's state.
let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

function typedDeck() {
  const doc = projectDoc()
  const types = ['Anfall', 'Försvar', 'Magi']
  return {
    ...doc,
    rows: doc.rows.map((r, i) => ({ ...r, fields: { ...r.fields, typ: types[i] ?? '' } })),
    template: {
      ...doc.template,
      faces: {
        ...doc.template.faces,
        front: { ...doc.template.faces['front']!, base: [...doc.template.faces['front']!.base, { kind: 'icons' as const, id: 'typikon', x: 50, y: 18, w: 8, h: 8, bind: { literal: '' }, iconMm: 8 }] },
      },
    },
  }
}

async function openLayer() {
  await run.projects.create(run.projectId, typedDeck())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
  await waitFor(() => layerPick('typikon'))
  fireEvent.click(layerPick('typikon'))
  return screen.getByRole('region', { name: 'Ikon och färg' })
}

describe('an icon per card type, and its colour (#1087)', () => {
  it('fills the table from the libraries, and the card wears the type’s icon in the type’s colour', async () => {
    const look = await openLayer()
    fireEvent.change(within(look).getByLabelText('Visar'), { target: { value: 'pick' } })
    fireEvent.change(within(look).getByLabelText('Kolumn'), { target: { value: 'typ' } })

    // The row for «Anfall» opens the sheet under the card, for that value and no other.
    fireEvent.click(within(look).getByRole('button', { name: 'Välj ikon för Anfall' }))
    const sheet = await screen.findByRole('dialog', { name: 'Sök i ikonbiblioteken' })
    expect(within(sheet).getByText('för typ = Anfall')).toBeTruthy()
    fireEvent.change(within(sheet).getByRole('searchbox'), { target: { value: 'svärd' } })
    fireEvent.click(await within(sheet).findByRole('button', { name: /^crossed-swords · Game Icons/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sök i ikonbiblioteken' })).toBeNull())

    // Coloured, and the colour is the row's.
    fireEvent.click(within(look).getByLabelText('Färga ikonerna'))
    fireEvent.change(within(look).getByLabelText('Färg för Anfall'), { target: { value: '#a8322d' } })

    // The first card is an «Anfall»: the canvas draws it through the one renderer (E2).
    await waitFor(() => expect(document.querySelector('.byd-ink[aria-label="crossed-swords"]')?.getAttribute('style')).toContain('background:#a8322d'))
    expect(within(look).getByText('crossed-swords')).toBeTruthy()
  })

  it('keeps one icon for every card a choice of its own, coloured or not', async () => {
    const look = await openLayer()
    fireEvent.click(within(look).getByRole('button', { name: 'Välj ikon för alla kort' }))
    const sheet = await screen.findByRole('dialog', { name: 'Sök i ikonbiblioteken' })
    fireEvent.change(within(sheet).getByRole('searchbox'), { target: { value: 'heart' } })
    fireEvent.click(within(sheet).getByRole('button', { name: /^Lucide/ }))
    fireEvent.click(await within(sheet).findByRole('button', { name: /^heart · Lucide · ISC/ }))

    // Without a colour the icon is the file it is, a picture; with one it is a painted shape.
    await waitFor(() => expect(document.querySelector('img.byd-icon[alt="heart"]')).toBeTruthy())
    fireEvent.click(within(look).getByLabelText('Färga ikonerna'))
    await waitFor(() => expect(document.querySelector('.byd-ink[aria-label="heart"]')).toBeTruthy())
  })

  // A drawing of the designer's own goes the whole way (#1087, beslut 4): cleaned before its hash is
  // taken, stored by the service — which would refuse it uncleaned — and drawn on the card in the
  // layer's colour, under the name the designer gave it.
  it('takes a drawing of the designer’s own onto the card, cleaned, in the layer’s colour', async () => {
    const look = await openLayer()
    fireEvent.click(within(look).getByLabelText('Färga ikonerna'))
    fireEvent.click(within(look).getByRole('button', { name: 'Välj ikon för alla kort' }))
    const sheet = await screen.findByRole('dialog', { name: 'Sök i ikonbiblioteken' })
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><path d="M0 0h10v10z"/></svg>'], 'stämpel.svg', { type: 'image/svg+xml' })
    fireEvent.change(within(sheet).getByLabelText('Ladda upp SVG …'), { target: { files: [file] } })
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Lägg till i spelet' }))

    // Drawn from the service once its bytes have landed (#959): the mask names the asset by hash.
    const hash = await waitFor(() => {
      const found = document.querySelector('.byd-ink[aria-label="stämpel"]')?.getAttribute('style')?.match(/\/assets\/([0-9a-f]{64})/)?.[1]
      if (!found) throw new Error('not drawn from the service yet')
      return found
    })
    expect(await (await fetch(`${run.http}/assets/${hash}`)).text()).not.toContain('onload')
  })
})

