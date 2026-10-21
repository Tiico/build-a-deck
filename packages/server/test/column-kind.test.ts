import { describe, expect, it } from 'vitest'
import { applyEdit } from '../src/edits.js'
import { ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// Vad en kolumn är — text, prosa eller bild — väljs där kolumnen görs och går att vända (#1085,
// beställarens beslut variant B). Mallen föreslår, designern avgör, som L43 redan sa för prosan:
// ett bildlager föreslår bild och en hög ruta prosa, men det designern har sagt står skrivet i
// dokumentet och väger över. Prosavalet ligger kvar i `prose` där det alltid legat; bildvalet står
// bredvid i `images`, och en enda redigering skriver båda, så att ett val är ett steg tillbaka.
const base = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: {
      faces: {
        front: {
          base: [
            { kind: 'image', id: 'konst', x: 5, y: 5, w: 53, h: 40, bind: { field: 'konst' } },
            { kind: 'text', id: 'smak', x: 5, y: 60, w: 53, h: 7, bind: { field: 'smak' }, font: { family: 'sans-serif', sizePt: 7.5 }, color: '#333' },
          ],
          variants: {},
        },
      },
    },
    rows: [
      { id: 'vaktare', fields: { konst: '', smak: 'Den stod där före stigen.', typ: 'Väktare', antal: 1 } },
      { id: 'halsning', fields: { konst: '', smak: 'Kort hälsning.', typ: 'Hälsning', antal: 1 } },
    ],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('kolumnens typ skrivs i dokumentet (#1085)', () => {
  it('gör en textkolumn till bild utan att röra mallen eller prosavalet', () => {
    const chosen = applyEdit({ ...base(), prose: { typ: true } }, { v: 'setColumnKind', field: 'typ', kind: 'image' })
    expect(chosen.images).toEqual({ typ: true })
    // Prosavalet står kvar: väljer hon Text igen är kolumnen vad den var.
    expect(chosen.prose).toEqual({ typ: true })
    expect(chosen.template).toEqual(base().template)
    // Och texten på korten står kvar, så att den kommer tillbaka med en kolumn som blir text igen.
    expect(chosen.rows.map((r) => r.fields['typ'])).toEqual(['Väktare', 'Hälsning'])
    expect(ProjectDoc.parse(chosen).images).toEqual({ typ: true })
  })

  it('skriver text och prosa som ett nej till bild och ett svar om prosan', () => {
    // `konst` ritas som bild av mallen; att välja Text måste väga över det förslaget.
    const text = applyEdit(base(), { v: 'setColumnKind', field: 'konst', kind: 'text' })
    expect(text.images).toEqual({ konst: false })
    expect(text.prose).toEqual({ konst: false })
    const prose = applyEdit(base(), { v: 'setColumnKind', field: 'smak', kind: 'prose' })
    expect(prose.images).toEqual({ smak: false })
    expect(prose.prose).toEqual({ smak: true })
  })

  it('lämnar tillbaka frågan till mallen genom att ta bort båda posterna, inte genom ett fjärde värde', () => {
    const chosen = applyEdit(base(), { v: 'setColumnKind', field: 'typ', kind: 'prose' })
    const back = applyEdit(chosen, { v: 'setColumnKind', field: 'typ', kind: null })
    expect(back.images).toBeUndefined()
    expect(back.prose).toBeUndefined()
  })

  it('vägrar verktygets egna kolumner och en kolumn som inte finns', () => {
    expect(() => applyEdit(base(), { v: 'setColumnKind', field: 'antal', kind: 'image' })).toThrow()
    expect(() => applyEdit(base(), { v: 'setColumnKind', field: 'id', kind: 'image' })).toThrow()
    expect(() => applyEdit(base(), { v: 'setColumnKind', field: 'finns-ej', kind: 'image' })).toThrow()
  })
})

describe('en ny kolumn får sin typ i samma redigering (#1085)', () => {
  it('gör en bildkolumn som ett enda steg: kolumnen på varje kort och valet', () => {
    const doc = applyEdit(base(), { v: 'addField', field: 'bild1', kind: 'image' })
    expect(doc.rows.map((r) => r.fields['bild1'])).toEqual(['', ''])
    expect(doc.images).toEqual({ bild1: true })
  })

  it('gör en prosakolumn med prosavalet skrivet', () => {
    const doc = applyEdit(base(), { v: 'addField', field: 'regel', kind: 'prose' })
    expect(doc.prose).toEqual({ regel: true })
    expect(doc.images).toEqual({ regel: false })
  })

  it('skriver ingenting om typen för en textkolumn, som en kolumn alltid har gjorts', () => {
    // Text är vad en kolumn som mallen inte ritar redan är; en post för det vore ett val ingen
    // gjorde, och den skulle hålla kolumnen borta från ett bildlager som binds till den senare.
    const doc = applyEdit(base(), { v: 'addField', field: 'fält1', kind: 'text' })
    expect(doc.images).toBeUndefined()
    expect(doc.prose).toBeUndefined()
  })
})

describe('bildvalet följer kolumnen (#1085)', () => {
  it('går med en kolumn som tas bort, så att nästa med samma namn inte ärver det', () => {
    const chosen = applyEdit(base(), { v: 'setColumnKind', field: 'typ', kind: 'image' })
    expect(applyEdit(chosen, { v: 'removeField', field: 'typ' }).images).toBeUndefined()
  })

  it('flyttar med vid namnbyte', () => {
    const chosen = applyEdit(base(), { v: 'setColumnKind', field: 'typ', kind: 'image' })
    expect(applyEdit(chosen, { v: 'renameField', from: 'typ', to: 'porträtt' }).images).toEqual({ porträtt: true })
  })
})
