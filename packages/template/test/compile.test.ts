import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, type FaceTemplate } from '../src/index.js'

const text = (id: string, field: string, y: number, sizePt: number) => ({
  kind: 'text' as const,
  id,
  x: 5,
  y,
  w: 53,
  h: 12,
  bind: { field },
  font: { family: 'Inter', sizePt, weight: 700 as const, align: 'left' as const },
  color: '#111111',
  fit: 'fixed' as const,
})

const face: FaceTemplate = { base: [text('title', 'title', 5, 14), text('body', 'body', 30, 9)], variants: {} }
const icons = { eld: 'data:image/svg+xml;utf8,<svg/>', '2': 'data:image/svg+xml;utf8,<svg/>' }

describe('compile — text elements (L1, L2)', () => {
  it('binds fields, escapes content, renders the inline tree and positions elements in millimetres', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face, row: { title: 'Drake <b>', body: 'Gör {2}{eld} skada **nu**' }, icons })

    expect(out.warnings).toEqual([])
    expect(out.html).toContain('data-element="title"')
    expect(out.html).toContain('Drake &lt;b&gt;')
    expect(out.html).not.toContain('<b>')
    expect(out.html).toContain('<strong>nu</strong>')
    expect(out.html).toMatch(/<img class="byd-icon" src="[^"]+" alt="eld">/)
    expect(out.css).toContain('[data-element="title"]{left:5mm;top:5mm;width:53mm;height:12mm;font-size:14pt;')
    expect(out.css).toContain('font-family:Inter')
  })
})

describe('icons', () => {
  it('renders an unknown icon as a visible marker and reports it, never as nothing', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face, row: { title: 'x', body: 'Ge {guld}' }, icons })
    expect(out.html).toContain('<span class="byd-icon-missing">{guld}</span>')
    expect(out.warnings).toEqual([{ element: 'body', code: 'unknown-icon', detail: 'guld' }])
  })
})

describe('variants (L3)', () => {
  it('the row column picks a variant that overrides elements by id and may remove some', () => {
    const withVariants: FaceTemplate = {
      base: [text('title', 'title', 5, 14), text('body', 'body', 30, 9), text('cost', 'cost', 70, 12)],
      variantBy: 'typ',
      variants: {
        besvärjelse: { override: [text('title', 'title', 5, 18)], remove: ['cost'] },
      },
    }
    const creature = compile({ type: CARD_STANDARD_63x88, face: withVariants, row: { typ: 'varelse', title: 'Drake', body: '', cost: '3' }, icons })
    expect(creature.css).toContain('[data-element="title"]{left:5mm;top:5mm;width:53mm;height:12mm;font-size:14pt;')
    expect(creature.html).toContain('data-element="cost"')

    const spell = compile({ type: CARD_STANDARD_63x88, face: withVariants, row: { typ: 'besvärjelse', title: 'Eldstorm', body: '', cost: '' }, icons })
    expect(spell.css).toContain('[data-element="title"]{left:5mm;top:5mm;width:53mm;height:12mm;font-size:18pt;')
    expect(spell.html).not.toContain('data-element="cost"')
    expect(spell.warnings).toEqual([])
  })

  it('a value with no variant of that name is the base look, without a warning', () => {
    const withVariants: FaceTemplate = { base: [text('title', 'title', 5, 14)], variantBy: 'typ', variants: {} }
    const out = compile({ type: CARD_STANDARD_63x88, face: withVariants, row: { typ: 'land', title: 'Skog' }, icons })
    expect(out.html).toContain('Skog')
    expect(out.warnings).toEqual([])
  })
})

describe('conditions and groups (L3, L1)', () => {
  it('an `if` renders its children only when the field is non-empty or equals the value; a group offsets its children', () => {
    const cond: FaceTemplate = {
      base: [
        { kind: 'if', id: 'hasCost', when: { field: 'cost', nonEmpty: true }, children: [text('cost', 'cost', 70, 12)] },
        { kind: 'if', id: 'isRare', when: { field: 'rarity', equals: 'sällsynt' }, children: [text('rare', 'rarity', 80, 8)] },
        { kind: 'group', id: 'corner', x: 40, y: 60, children: [text('atk', 'atk', 0, 10), text('hp', 'hp', 6, 10)] },
      ],
      variants: {},
    }
    const a = compile({ type: CARD_STANDARD_63x88, face: cond, row: { cost: '3', rarity: 'vanlig', atk: '2', hp: '4' }, icons })
    expect(a.html).toContain('data-element="cost"')
    expect(a.html).not.toContain('data-element="rare"')
    expect(a.css).toContain('[data-element="atk"]{left:45mm;top:60mm;')
    expect(a.css).toContain('[data-element="hp"]{left:45mm;top:66mm;')

    const b = compile({ type: CARD_STANDARD_63x88, face: cond, row: { cost: '', rarity: 'sällsynt', atk: '', hp: '' }, icons })
    expect(b.html).not.toContain('data-element="cost"')
    expect(b.html).toContain('data-element="rare"')
  })
})

describe('image, icons and shape elements (L1)', () => {
  it('renders an image from a field, a row of icons from a list of names, and a shape', () => {
    const f: FaceTemplate = {
      base: [
        { kind: 'image', id: 'art', x: 3, y: 3, w: 57, h: 40, bind: { field: 'art' }, fit: 'cover' },
        { kind: 'icons', id: 'cost', x: 3, y: 45, w: 57, h: 6, bind: { field: 'cost' }, iconMm: 5, gapMm: 1 },
        { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#fff', stroke: '#000', strokeMm: 0.5, radiusMm: 3 },
      ],
      variants: {},
    }
    const out = compile({ type: CARD_STANDARD_63x88, face: f, row: { art: 'https://x/a.png', cost: 'eld eld skog' }, icons: { ...icons, skog: 'data:s' } })
    expect(out.html).toMatch(/<img data-element="art" src="https:\/\/x\/a\.png" alt="">/)
    expect(out.css).toContain('[data-element="art"]{left:3mm;top:3mm;width:57mm;height:40mm;object-fit:cover;}')
    expect(out.html.match(/class="byd-icon"/g)).toHaveLength(3)
    expect(out.html).toContain('data-element="cost"')
    expect(out.css).toContain('[data-element="cost"] .byd-icon{height:5mm;width:5mm;margin-right:1mm;}')
    expect(out.css).toContain('[data-element="frame"]{left:1mm;top:1mm;width:61mm;height:86mm;background:#fff;border:0.5mm solid #000;border-radius:3mm;}')
    expect(out.warnings).toEqual([])
  })

  // The two ways a picture can meet its frame without leaving a gap in it: fill the frame and
  // crop, or stretch to the frame. A picture that reaches its frame's edges is what makes the
  // frame worth dragging — the handles, the outline and the guides all stand on it.
  it('stretches a picture to its frame when it is not to keep its proportions, and fills the frame when it is', () => {
    const at = (fit: 'cover' | 'fill' | undefined) => {
      const f: FaceTemplate = { base: [{ kind: 'image', id: 'art', x: 3, y: 3, w: 57, h: 40, bind: { field: 'art' }, ...(fit ? { fit } : {}) }], variants: {} }
      return compile({ type: CARD_STANDARD_63x88, face: f, row: { art: 'https://x/a.png' }, icons }).css
    }
    expect(at('fill')).toContain('[data-element="art"]{left:3mm;top:3mm;width:57mm;height:40mm;object-fit:fill;}')
    // Said or unsaid, a picture fills its frame: the default is the frame, not a gap inside it.
    expect(at('cover')).toContain('object-fit:cover;}')
    expect(at(undefined)).toContain('object-fit:cover;}')
  })
})

describe('bleed (print profile from the type, B2)', () => {
  it('with bleed the root grows by bleedMm on every side and elements shift; without, the root is the trimmed card', () => {
    const plain = compile({ type: CARD_STANDARD_63x88, face, row: { title: 'x', body: '' }, icons })
    expect(plain.css).toContain('[data-card]{position:relative;width:63mm;height:88mm;')
    expect(plain.css).toContain('[data-element="title"]{left:5mm;top:5mm;')

    const bled = compile({ type: CARD_STANDARD_63x88, face, row: { title: 'x', body: '' }, icons, bleed: true })
    expect(bled.css).toContain('[data-card]{position:relative;width:69mm;height:94mm;')
    expect(bled.css).toContain('[data-element="title"]{left:8mm;top:8mm;')
    expect(bled.html).toContain('data-bleed="3"')
  })
})

describe('text fitting (E6)', () => {
  const long = 'När detta kort spelas: dra två kort, sedan kasta ett. Om du kontrollerar ett Torn får du dessutom en {guld}. '
  const shrinkBody: FaceTemplate = { base: [{ ...text('body', 'body', 30, 9), fit: 'shrink' }], variants: {} }
  const fixedBody: FaceTemplate = { base: [{ ...text('body', 'body', 30, 9), fit: 'fixed' }], variants: {} }
  const ic = { ...icons, guld: 'data:g' }

  it('shrinks a text that does not fit, in steps, until it does — and says nothing when it did', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face: shrinkBody, row: { body: long }, icons: ic })
    const size = Number(/\[data-element="body"\]\{[^}]*font-size:([\d.]+)pt/.exec(out.css)?.[1])
    expect(size).toBeLessThan(9)
    expect(size).toBeGreaterThanOrEqual(6)
    expect(out.warnings).toEqual([])
  })

  it('never goes below the minimum for the script, and then warns with the element', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face: shrinkBody, row: { body: long.repeat(4) }, icons: ic })
    expect(out.css).toContain('[data-element="body"]{left:5mm;top:30mm;width:53mm;height:12mm;font-size:6pt;')
    expect(out.warnings).toEqual([{ element: 'body', code: 'text-too-small', detail: expect.stringMatching(/6pt/) }])
  })

  it('a fixed box keeps its size and warns about overflow instead', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face: fixedBody, row: { body: long }, icons: ic })
    expect(out.css).toContain('font-size:9pt;')
    expect(out.warnings).toEqual([{ element: 'body', code: 'text-overflow', detail: expect.any(String) }])
  })

  it('uses an injected measurer when given one', () => {
    const measure = () => 1 // everything fits in a millimetre
    const out = compile({ type: CARD_STANDARD_63x88, face: shrinkBody, row: { body: long.repeat(4) }, icons: ic, measure })
    expect(out.css).toContain('font-size:9pt;')
    expect(out.warnings).toEqual([])
  })
})

describe('fit attributes for the DOM (E6, one algorithm everywhere)', () => {
  it('stamps each text element with its fit mode, starting size and script minimum so the page can refit with real metrics', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face, row: { title: 'Drake', body: 'kort' }, icons })
    expect(out.html).toMatch(/<div data-element="title" data-fit="fixed" data-size-pt="14" data-min-pt="6">/)
    const shrink: FaceTemplate = { base: [{ ...text('body', 'body', 30, 9), fit: 'shrink' }], variants: {} }
    const s = compile({ type: CARD_STANDARD_63x88, face: shrink, row: { body: '漢字' }, icons })
    expect(s.html).toMatch(/<div data-element="body" data-fit="shrink" data-size-pt="9" data-min-pt="8">/)
  })
})

describe('scope (many cards on one page)', () => {
  it('prefixes every selector with the scope so two cards with different fitted sizes do not collide', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face, row: { title: 'x', body: '' }, icons, scope: '#c7' })
    expect(out.css).toContain('#c7 [data-card]{')
    expect(out.css).toContain('#c7 [data-element="title"]{')
    expect(out.css).toContain('#c7 [data-element]{position:absolute')
    expect(out.css).toContain('#c7 .byd-icon{')
    expect(out.css).not.toMatch(/(^|\n)\[data-/)
    expect(out.html).toContain('<div data-card')
  })
})

describe('pips (L2 addendum)', () => {
  it('renders a bare number in braces as a pip, not as a missing icon, unless the icon set has that name', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face, row: { title: 'x', body: 'Betala {2} och {eld}' }, icons: { eld: icons.eld } })
    expect(out.html).toContain('<span class="byd-pip">2</span>')
    expect(out.warnings).toEqual([])
    expect(out.css).toContain('.byd-pip{')
    const named = compile({ type: CARD_STANDARD_63x88, face, row: { title: 'x', body: '{2}' }, icons: { ...icons, '2': 'data:two' } })
    expect(named.html).toContain('<img class="byd-icon" src="data:two" alt="2">')
    expect(named.html).not.toContain('byd-pip')
  })
})

describe('the fonts a version is pinned to (B3)', () => {
  const face = (family: string) => ({
    base: [{ kind: 'text' as const, id: 'title', x: 5, y: 5, w: 50, h: 10, bind: { literal: 'Drake' }, font: { family, sizePt: 12 }, color: '#111' }],
    variants: {},
  })

  it('writes a font the project carries as a face of its own, so the file is what renders', () => {
    const out = compile({
      type: CARD_STANDARD_63x88,
      face: face('Rubrik'),
      row: {},
      icons: {},
      fonts: { Rubrik: { stack: '"Rubrik", Georgia, serif', src: 'data:font/woff2;base64,AAA' } },
    })
    expect(out.css).toContain('@font-face')
    expect(out.css).toContain('font-family:"Rubrik"')
    expect(out.css).toContain('data:font/woff2;base64,AAA')
    // The element uses the stack the project named, not the bare name.
    expect(out.css).toContain('font-family:"Rubrik", Georgia, serif')
  })

  it('leaves a family the project does not name as the stack it is, so older templates are untouched', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face: face('Georgia, serif'), row: {}, icons: {} })
    expect(out.css).not.toContain('@font-face')
    expect(out.css).toContain('font-family:Georgia, serif')
  })

  it('writes each face once however many elements use it', () => {
    const two = {
      base: [
        { kind: 'text' as const, id: 'title', x: 5, y: 5, w: 50, h: 10, bind: { literal: 'Drake' }, font: { family: 'Rubrik', sizePt: 12 }, color: '#111' },
        { kind: 'text' as const, id: 'body', x: 5, y: 20, w: 50, h: 30, bind: { literal: 'Flygande.' }, font: { family: 'Rubrik', sizePt: 9 }, color: '#111' },
      ],
      variants: {},
    }
    const out = compile({ type: CARD_STANDARD_63x88, face: two, row: {}, icons: {}, fonts: { Rubrik: { stack: '"Rubrik", serif', src: 'data:font/woff2;base64,AAA' } } })
    expect(out.css.match(/@font-face/g)).toHaveLength(1)
  })

  it('uses a project font that has no file as the stack it stands for, and says nothing of a face', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face: face('Brödtext'), row: {}, icons: {}, fonts: { 'Brödtext': { stack: 'Georgia, serif' } } })
    expect(out.css).not.toContain('@font-face')
    expect(out.css).toContain('font-family:Georgia, serif')
  })
})
