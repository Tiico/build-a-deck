import { describe, expect, it } from 'vitest'
import { FRAMES, defaultFields } from '../src/wizard/frames.js'
import { translate } from '../src/i18n/index.js'
import { DEFAULT_BODY_PT, SCREENS, bodyPtOf, cardPxForText, textPxOnCard } from './legibility.js'

// Måttstocken (K26, #506): vad korttext blir på skärm, och vad den ska vara per skärm.
//
// Talen i rapporten valdes aldrig på texten, bara på ramen — distansvyns 112 px, telefonens 154,
// TV:ns 177 — och räkningen som hade sagt vad texten blev gjordes inte förrän granskningen. Här står
// den en gång, så att sidorna 1–6:s mätande tester läser samma tal och ingen sida får ett eget.

describe('text on a card is its point size scaled by how wide the card is drawn (K26)', () => {
  // Rapportens tabell, rad för rad: 8,5 pt brödtext och 12 pt titel på ett 63 mm brett kort.
  it.each([
    [45, 2.1, 3.0],
    [85, 4.0, 5.7],
    [112, 5.3, 7.5],
    [154, 7.3, 10.3],
    [180, 8.6, 12.1],
    [252, 12.0, 16.9],
    [335, 15.9, 22.5],
  ])('draws 8.5 pt body and 12 pt title on a %i px card at %f and %f px', (cardPx, body, title) => {
    const drawn = { body: Number(textPxOnCard(8.5, cardPx).toFixed(1)), title: Number(textPxOnCard(12, cardPx).toFixed(1)) }
    expect({ cardPx, ...drawn }).toEqual({ cardPx, body, title })
  })

  it('reads the card as it is drawn, so a wider card with the same text is the same text', () => {
    expect(textPxOnCard(8.5, 252, 63)).toBeCloseTo(textPxOnCard(8.5, 504, 126), 10)
  })

  // Omvänt, som beslutet skriver det: 252, 294, 504 och 588 px för 12, 14, 24 och 28 px brödtext.
  it.each([
    [12, 252],
    [14, 294],
    [24, 504],
    [28, 588],
  ])('needs a card %i px of body text is drawn on at %i px wide', (textPx, cardPx) => {
    expect(cardPxForText(8.5, textPx)).toBe(cardPx)
  })
})

describe('the floor for text on a card is one number per screen (K26)', () => {
  it('holds the three screens the beställare decided on 2026-09-28', () => {
    expect(SCREENS).toEqual({
      phone: { floorPx: 12, bodyPx: { min: 14, max: 16 } },
      desk: { floorPx: 12, bodyPx: { min: 14, max: 16 } },
      tv: { floorPx: 24, bodyPx: { min: 28, max: 32 } },
    })
  })
})

// Mallens brödtext och golven ur samma modul (#506, beslutets fjärde punkt): golvet gäller mallens
// brödtext som den är, så det kort en ram behöver per skärm är ramens eget tal. Ändras endera —
// en ram som sänker sin brödtext eller ett golv som flyttas — är det här raden som säger det.
describe('each starter frame says how wide its card must be drawn to be read (K26, E5, L6)', () => {
  const fields = defaultFields((key, params) => translate('sv', key, params))
  const needs = Object.fromEntries(
    FRAMES.map((frame) => {
      const pt = bodyPtOf(frame.front(fields))
      const at = (screen: keyof typeof SCREENS) => ({ floor: cardPxForText(pt, SCREENS[screen].floorPx), body: cardPxForText(pt, SCREENS[screen].bodyPx.min) })
      return [frame.id, { pt, phone: at('phone'), desk: at('desk'), tv: at('tv') }]
    }),
  )

  it('measures the surfaces against the default frame’s body, which is 8.5 pt', () => {
    expect(DEFAULT_BODY_PT).toBe(8.5)
  })

  it('needs the card widths the frames’ body text gives', () => {
    expect(needs).toEqual({
      classic: { pt: 8.5, phone: { floor: 252, body: 294 }, desk: { floor: 252, body: 294 }, tv: { floor: 504, body: 588 } },
      minimal: { pt: 10, phone: { floor: 214, body: 250 }, desk: { floor: 214, body: 250 }, tv: { floor: 429, body: 500 } },
      dark: { pt: 8.5, phone: { floor: 252, body: 294 }, desk: { floor: 252, body: 294 }, tv: { floor: 504, body: 588 } },
    })
  })
})

// Where each surface holds a card up to read it (#507–#509), on the smallest screen it answers
// for, and so the smallest text that still reaches that screen's floor there (#512). The editor
// reads these to show the designer a card the way a surface reads it; each surface's own
// measuring test checks that it draws the width written here, so the two cannot drift apart.
describe('the reading views, and the smallest text each one carries (K26, #512)', () => {
  it('names the three views, their window and the width they hold a card up at', async () => {
    const { READING_VIEWS } = await import('../src/legibility.js')
    expect(READING_VIEWS.map((v) => ({ key: v.key, screen: v.screen, window: v.window, width: Math.round(v.width) }))).toEqual([
      { key: 'phone', screen: 'phone', window: { w: 320, h: 568 }, width: 294 },
      { key: 'desk', screen: 'desk', window: { w: 1024, h: 768 }, width: 341 },
      { key: 'tv', screen: 'tv', window: { w: 1920, h: 1080 }, width: 672 },
    ])
  })

  it('says below which point size text falls under the floor in each of them', async () => {
    const { READING_VIEWS, minPtIn } = await import('../src/legibility.js')
    expect(READING_VIEWS.map((v) => [v.key, Number(minPtIn(v).toFixed(1))])).toEqual([
      ['phone', 7.3],
      ['desk', 6.3],
      ['tv', 6.4],
    ])
  })
})
