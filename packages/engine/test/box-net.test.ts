import { describe, expect, it } from 'vitest'
import { BoxTypeDef, TUCKBOX, boxFaceSize, boxFaceType, tuckNet, type BoxFace, type BoxMeasure } from '../src/index.js'

// Fliken «Låda» (#1413): nätet är tuckboxen utvikt i millimeter, med ytorna där de står på arket,
// flikarna, vik- och snittlinjerna och locket upp och ner. Måtten är lådans, ur `boxFit`, och nätet
// läser bara dem och typens flikar; det ritar ingenting.
const size: BoxMeasure = { width: 65, height: 90, depth: 34.5 }

describe('en yta på lådan (#1413)', () => {
  it('har måtten av sin sida: framsida och baksida B × H, sidorna D × H, lock och botten B × D', () => {
    const of = (face: BoxFace) => boxFaceSize(face, size)
    expect(of('front')).toEqual({ widthMm: 65, heightMm: 90 })
    expect(of('back')).toEqual({ widthMm: 65, heightMm: 90 })
    expect(of('left')).toEqual({ widthMm: 34.5, heightMm: 90 })
    expect(of('right')).toEqual({ widthMm: 34.5, heightMm: 90 })
    expect(of('lid')).toEqual({ widthMm: 65, heightMm: 34.5 })
    expect(of('bottom')).toEqual({ widthMm: 65, heightMm: 34.5 })
  })

  it('ritas av den enda renderaren som en rak yta i sitt mått, med lådans utfall och tryckprofil (E2)', () => {
    const type = boxFaceType(TUCKBOX, 'left', size)
    expect(type.physical).toMatchObject({ shape: 'rect', widthMm: 34.5, heightMm: 90, thicknessMm: TUCKBOX.physical.thicknessMm, material: TUCKBOX.physical.material })
    expect(type.physical).not.toHaveProperty('cornerRadiusMm')
    expect(type.print).toMatchObject({ bleedMm: TUCKBOX.print.bleedMm, safeMm: TUCKBOX.print.safeMm, dpi: TUCKBOX.print.dpi })
    expect(type.id).toBe('box.tuck.left')
    expect(type.faces).toEqual(['front'])
  })
})

describe('tuckboxens nät (#1413)', () => {
  const net = tuckNet(TUCKBOX, size)
  const flaps = TUCKBOX.physical.flaps
  const panel = (face: BoxFace) => net.panels.find((p) => p.face === face)

  it('läser flikarnas mått ur typen', () => {
    expect(BoxTypeDef.parse(TUCKBOX)).toEqual(TUCKBOX)
    expect(flaps).toEqual({ glueMm: 12, tuckMm: 20, dust: 0.8 })
  })

  it('är limfliken och två gånger framsida och sida i bredd, och två flikar, två djup och höjden på höjden', () => {
    expect(net.width).toBe(12 + 2 * 34.5 + 2 * 65)
    expect(net.height).toBe(2 * 20 + 2 * 34.5 + 90)
  })

  it('lägger sidorna i en rad efter limfliken: vänster, fram, höger, bak', () => {
    expect(panel('left')).toEqual({ face: 'left', x: 12, y: 54.5, width: 34.5, height: 90, turned: false })
    expect(panel('front')).toEqual({ face: 'front', x: 46.5, y: 54.5, width: 65, height: 90, turned: false })
    expect(panel('right')).toEqual({ face: 'right', x: 111.5, y: 54.5, width: 34.5, height: 90, turned: false })
    expect(panel('back')).toEqual({ face: 'back', x: 146, y: 54.5, width: 65, height: 90, turned: false })
  })

  it('hänger locket på baksidan, upp och ner som på arket, och botten under framsidan', () => {
    expect(panel('lid')).toEqual({ face: 'lid', x: 146, y: 20, width: 65, height: 34.5, turned: true })
    expect(panel('bottom')).toEqual({ face: 'bottom', x: 46.5, y: 144.5, width: 65, height: 34.5, turned: false })
  })

  it('ger varje yta sitt eget mått, så att nätet och ytans mall är samma rektangel', () => {
    for (const p of net.panels) expect({ widthMm: p.width, heightMm: p.height }).toEqual(boxFaceSize(p.face, size))
    expect(net.panels.map((p) => p.face).sort()).toEqual([...TUCKBOX.faces].sort())
  })

  it('har limflik, fyra dammflikar och två instick, och inga av dem trycks', () => {
    expect(net.flaps.map((f) => f.kind).sort()).toEqual(['dust', 'dust', 'dust', 'dust', 'glue', 'tuck', 'tuck'])
    const dust = net.flaps.filter((f) => f.kind === 'dust')
    // En dammflik är fyra femtedelar av djupet.
    for (const f of dust) {
      if (f.kind !== 'dust') continue
      const ys = f.points.map(([, y]) => y)
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.8 * 34.5)
    }
    const tucks = net.flaps.filter((f) => f.kind === 'tuck')
    expect(tucks).toContainEqual({ kind: 'tuck', x: 146, y: 0, width: 65, height: 20, opens: 'up' })
    expect(tucks).toContainEqual({ kind: 'tuck', x: 46.5, y: 179, width: 65, height: 20, opens: 'down' })
  })

  it('viker längs varje kant där två delar av arket möts', () => {
    // Fyra lodräta mellan limfliken och sidorna, och åtta vågräta: locket, instickens kanter, botten
    // och dammflikarna.
    expect(net.folds).toHaveLength(12)
    expect(net.folds).toContainEqual([146, 54.5, 211, 54.5])
    expect(net.folds).toContainEqual([12, 54.5, 12, 144.5])
  })

  it('följer måtten: ett djupare mått gör nätet bredare och högre med två djup', () => {
    const deeper = tuckNet(TUCKBOX, { ...size, depth: 38 })
    expect(deeper.width - net.width).toBeCloseTo(2 * 3.5)
    expect(deeper.height - net.height).toBeCloseTo(2 * 3.5)
  })
})
