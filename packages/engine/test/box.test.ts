import { describe, expect, it } from 'vitest'
import { BOX_TYPES, BoxTypeDef, CARD_STANDARD_63x88, STANDARD_TYPES, TUCKBOX, TypeRegistry, boxFit, boxMeasure } from '../src/index.js'

// Spelets låda, steg 1 (#1412, #1406): tuckboxen är en typ i registret (B1, B2), och måtten räknas
// fram ur leken. Exemplen är prototypens: 108 kort på 63 × 88 × 0,3 mm ger 65 × 90 × 34,5 mm.
const card = CARD_STANDARD_63x88.physical

describe('tuckboxen som typ (B2, B3)', () => {
  it('är data som håller sitt eget schema, med sex ytor och framsidan som omslag', () => {
    expect(BoxTypeDef.parse(TUCKBOX)).toEqual(TUCKBOX)
    expect(TUCKBOX).toMatchObject({ kind: 'box', id: 'box.tuck', version: 1 })
    expect(TUCKBOX.faces).toEqual(['front', 'back', 'left', 'right', 'lid', 'bottom'])
    expect(TUCKBOX.contentFace).toBe('front')
    expect(TUCKBOX.holds).toEqual({ clearanceMm: { around: 1, depth: 2 }, stepMm: 0.5 })
    expect(BOX_TYPES).toEqual([TUCKBOX])
  })

  it('registreras bredvid korten, oföränderlig och slagen upp på id och version', () => {
    const registry = new TypeRegistry([...STANDARD_TYPES, ...BOX_TYPES])
    expect(registry.box({ id: 'box.tuck', version: 1 })).toEqual(TUCKBOX)
    expect(registry.hasBox({ id: 'box.tuck', version: 1 })).toBe(true)
    expect(() => registry.register(TUCKBOX)).toThrow(/immutable/)
    // En låda är ingen komponent på bordet, och ett kort är ingen låda.
    expect(registry.has({ id: 'box.tuck', version: 1 })).toBe(false)
    expect(() => registry.get({ id: 'box.tuck', version: 1 })).toThrow(/box\.tuck@1/)
    expect(() => registry.box({ id: CARD_STANDARD_63x88.id, version: 1 })).toThrow(/card\.standard\.63x88@1/)
  })

  it('stannar utanför det varje bord känner, så att ingen tryckare säger ja till den i steg 1', () => {
    expect(STANDARD_TYPES.map((t) => t.id)).not.toContain('box.tuck')
  })

  it('vägrar en definition utan luft eller med ett steg som inte är positivt', () => {
    expect(() => BoxTypeDef.parse({ ...TUCKBOX, holds: { clearanceMm: { around: -1, depth: 2 }, stepMm: 0.5 } })).toThrow()
    expect(() => BoxTypeDef.parse({ ...TUCKBOX, holds: { clearanceMm: { around: 1, depth: 2 }, stepMm: 0 } })).toThrow()
  })
})

describe('måtten ur leken (#1412)', () => {
  it('ger 65 × 90 × 34,5 mm för 108 kort och 38 mm djup för 120', () => {
    expect(boxMeasure(TUCKBOX, card, 108)).toEqual({ width: 65, height: 90, depth: 34.5 })
    expect(boxMeasure(TUCKBOX, card, 120)).toEqual({ width: 65, height: 90, depth: 38 })
  })

  it('avrundar djupet uppåt till en halv millimeter, och aldrig ett steg för långt', () => {
    // 100 × 0,3 + 2 = 32 står redan på steget; 101 kort är 32,3 och blir 32,5; 102 är 32,6 och blir 33.
    expect(boxMeasure(TUCKBOX, card, 100).depth).toBe(32)
    expect(boxMeasure(TUCKBOX, card, 101).depth).toBe(32.5)
    expect(boxMeasure(TUCKBOX, card, 102).depth).toBe(33)
    // Flyttal får inte skjuta ett jämnt mått ett steg upp: 0,3 × 10 är 3,0000000000000004.
    expect(boxMeasure(TUCKBOX, card, 10).depth).toBe(5)
  })

  it('följer ändrad luft, runt kortet och i djupet var för sig', () => {
    expect(boxMeasure(TUCKBOX, card, 108, { around: 2 })).toEqual({ width: 67, height: 92, depth: 34.5 })
    expect(boxMeasure(TUCKBOX, card, 108, { depth: 3 })).toEqual({ width: 65, height: 90, depth: 35.5 })
    expect(boxMeasure(TUCKBOX, card, 108, { around: 0, depth: 0 })).toEqual({ width: 63, height: 88, depth: 32.5 })
  })

  it('ger en tom lek en låda med bara luften', () => {
    expect(boxMeasure(TUCKBOX, card, 0)).toEqual({ width: 65, height: 90, depth: 2 })
  })
})

describe('ett lås per mått (#1412)', () => {
  it('låter ett låst mått stå kvar när leken växer, medan de olåsta följer leken', () => {
    const fit = boxFit({ type: TUCKBOX, card, cards: 120, locked: { depth: 34.5 } })
    expect(fit.size).toEqual({ width: 65, height: 90, depth: 34.5 })
    expect(fit.follows).toEqual({ width: 65, height: 90, depth: 38 })
    expect(fit.locked).toEqual({ width: false, height: false, depth: true })
  })

  it('låter bredden följa ny luft när djupet är låst, och tvärtom', () => {
    const fit = boxFit({ type: TUCKBOX, card, cards: 108, clearance: { around: 2 }, locked: { depth: 34.5, width: 65 } })
    expect(fit.size).toEqual({ width: 65, height: 92, depth: 34.5 })
    expect(fit.clearance).toEqual({ around: 2, depth: 2 })
  })
})

describe('när leken inte ryms (#1412)', () => {
  it('säger att 108 kort ryms i ett djup låst på 34,5 mm, och att 12 av 120 inte får plats', () => {
    const fits = boxFit({ type: TUCKBOX, card, cards: 108, locked: { depth: 34.5 } })
    expect(fits).toMatchObject({ holds: 108, over: 0, short: null, deckMm: 32.4, roomMm: 32.5 })
    const over = boxFit({ type: TUCKBOX, card, cards: 120, locked: { depth: 34.5 } })
    expect(over).toMatchObject({ holds: 108, over: 12, short: 'depth', deckMm: 36, roomMm: 32.5 })
  })

  it('räknar ett kort för mycket som ett', () => {
    expect(boxFit({ type: TUCKBOX, card, cards: 109, locked: { depth: 34.5 } })).toMatchObject({ holds: 108, over: 1, short: 'depth' })
  })

  it('rymmer leken i ett låst djup som inte står på halvmillimetern, så länge korten får plats', () => {
    // 108 kort och luften är 34,4 mm; ett djup låst på 34,45 rymmer dem fast leken själv skulle be om 34,5.
    expect(boxFit({ type: TUCKBOX, card, cards: 108, locked: { depth: 34.45 } })).toMatchObject({ holds: 108, over: 0, short: null })
  })

  it('rymmer inget kort alls när en låst bredd eller höjd är för smal för kortet och luften', () => {
    expect(boxFit({ type: TUCKBOX, card, cards: 108, locked: { width: 64 } })).toMatchObject({ holds: 0, over: 108, short: 'width' })
    expect(boxFit({ type: TUCKBOX, card, cards: 108, locked: { height: 89.5 } })).toMatchObject({ holds: 0, over: 108, short: 'height' })
    // Mer luft gör en låst bredd för smal, fast kortet är detsamma.
    expect(boxFit({ type: TUCKBOX, card, cards: 108, clearance: { around: 2 }, locked: { width: 65 } })).toMatchObject({ short: 'width', over: 108 })
  })

  it('säger aldrig att en låda som följer leken inte rymmer den', () => {
    for (const cards of [0, 1, 54, 108, 120, 333]) {
      for (const around of [0, 0.5, 1, 2.5]) {
        for (const depth of [0, 1, 2, 3.3]) {
          expect(boxFit({ type: TUCKBOX, card, cards, clearance: { around, depth } }), `${cards} ${around} ${depth}`).toMatchObject({ over: 0, short: null })
        }
      }
    }
  })
})
