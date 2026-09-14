import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, Element, type FaceTemplate } from '../src/index.js'

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
    expect(out.html).toMatch(/<div data-element="art"><img class="byd-art" src="https:\/\/x\/a\.png" alt=""><\/div>/)
    expect(out.css).toContain('[data-element="art"]{left:3mm;top:3mm;width:57mm;height:40mm;}')
    expect(out.css).toContain('[data-element="art"] .byd-art{width:100%;height:100%;object-fit:cover;}')
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
    expect(at('fill')).toContain('[data-element="art"]{left:3mm;top:3mm;width:57mm;height:40mm;}')
    expect(at('fill')).toContain('[data-element="art"] .byd-art{width:100%;height:100%;object-fit:fill;}')
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

// The two things an element carries for the person editing it and not for the card: what the
// designer calls the layer, and whether it is locked (L1-tillägget, L15). They are template data
// like everything else — versioned, diffed, shared with whoever else has the project open — but
// the card that is printed must be the same card whether or not a layer was locked while it was
// drawn.
describe('what an element carries for the designer and not for the card (L15)', () => {
  const named: FaceTemplate = { ...face, base: face.base.map((el) => ({ ...el, name: 'Rubriken', locked: true })) }

  it('survives the schema, which is the only thing that decides what a template may hold', () => {
    const parsed = Element.parse({ ...face.base[0], name: 'Rubriken', locked: true })
    expect(parsed).toMatchObject({ name: 'Rubriken', locked: true })
    // And they are optional: every template written before they existed is still a template.
    expect(Element.parse(face.base[0])).not.toHaveProperty('name')
  })

  it('is accepted on an element and changes nothing the card is made of', () => {
    const row = { title: 'Drake', body: 'Gör skada' }
    const plain = compile({ type: CARD_STANDARD_63x88, face, row, icons })
    const marked = compile({ type: CARD_STANDARD_63x88, face: named, row, icons })
    expect(marked.html).toBe(plain.html)
    expect(marked.css).toBe(plain.css)
    expect(marked.warnings).toEqual([])
  })
})

// A fill that is a rule on a column (L16). The colour lives in the template, where every other
// style lives; the deck says which of them a card gets. Without this the only way to give the
// trap cards a red plate was a variant per value — a tab per colour, and the design copied into
// each of them.
describe('a fill that follows a column (L16)', () => {
  const plate = (fill: unknown) => ({ kind: 'shape' as const, id: 'plate', x: 0, y: 0, w: 63, h: 20, shape: 'rect' as const, fill: fill as string })
  const card = (fill: unknown): FaceTemplate => ({ base: [plate(fill)], variants: {} })
  const backgroundOf = (out: { css: string }) => /\[data-element="plate"\]\{[^}]*background:([^;}]*)/.exec(out.css)?.[1] ?? null
  const rule = { field: 'typ', map: { eld: '#c0392b', vatten: '#2980b9' }, else: '#7f8c8d' }

  it('paints what the row’s value names', () => {
    expect(backgroundOf(compile({ type: CARD_STANDARD_63x88, face: card(rule), row: { typ: 'eld' }, icons }))).toBe('#c0392b')
    expect(backgroundOf(compile({ type: CARD_STANDARD_63x88, face: card(rule), row: { typ: 'vatten' }, icons }))).toBe('#2980b9')
  })

  it('falls back for a value the rule does not name, and for a cell nobody filled in', () => {
    // A value without a colour of its own is the ordinary case, exactly as a value without a
    // variant is (L3): most cards are the plain one, and that is not a warning.
    expect(backgroundOf(compile({ type: CARD_STANDARD_63x88, face: card(rule), row: { typ: 'jord' }, icons }))).toBe('#7f8c8d')
    expect(backgroundOf(compile({ type: CARD_STANDARD_63x88, face: card(rule), row: {}, icons }))).toBe('#7f8c8d')
  })

  it('leaves the shape unpainted when the rule names no colour and has no fallback', () => {
    const bare = { field: 'typ', map: { eld: '#c0392b' } }
    expect(backgroundOf(compile({ type: CARD_STANDARD_63x88, face: card(bare), row: { typ: 'jord' }, icons }))).toBeNull()
  })

  it('is a colour as it always was when it is written as one', () => {
    expect(backgroundOf(compile({ type: CARD_STANDARD_63x88, face: card('#123456'), row: {}, icons }))).toBe('#123456')
  })

  it('is what the schema accepts, in both shapes', () => {
    expect(Element.parse(plate(rule))).toMatchObject({ fill: rule })
    expect(Element.parse(plate('#123456'))).toMatchObject({ fill: '#123456' })
    expect(() => Element.parse(plate({ map: { eld: '#c0392b' } }))).toThrow()
  })
})

// The whole point of trimming (E1): a deck's art arrives one file per card, and two files that
// hold the same motif rarely hold it at the same size — one carries a wide transparent border,
// the next almost none. What is asked here is never the CSS but where the motif lands: the same
// rectangle of the card, on every card, whatever the file around it measures.
describe('compile — a picture fitted by its motif rather than by its file (E1)', () => {
  const frame = { kind: 'image' as const, id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' } }

  // Where the motif is actually drawn inside its frame, in millimetres, read back off what the
  // compiler emitted rather than out of the numbers that went in.
  function motifBox(css: string, motif: { w: number; h: number; trim: { left: number; top: number } }) {
    const rule = /\[data-element="art"\] \.byd-art\{([^}]*)\}/.exec(css)?.[1] ?? ''
    const said = Object.fromEntries(rule.split(';').filter(Boolean).map((d) => d.split(':')))
    const mm = (prop: string) => Number(String(said[prop] ?? '').replace('mm', ''))
    const [left, top, w, h] = [mm('left'), mm('top'), mm('width'), mm('height')]
    const [sx, sy] = [w / motif.w, h / motif.h]
    return { x: left + motif.trim.left * sx, y: top + motif.trim.top * sy, sx, sy }
  }

  const wide = { w: 100, h: 100, trim: { left: 10, top: 10, right: 10, bottom: 10 } }
  const tight = { w: 200, h: 200, trim: { left: 50, top: 50, right: 50, bottom: 50 } }

  it('draws the motif of two differently padded files in the same place, at the same size', () => {
    const face: FaceTemplate = { base: [{ ...frame, fit: 'contain', trim: true }], variants: {} }
    const at = (src: string, motif: typeof wide) => {
      const css = compile({ type: CARD_STANDARD_63x88, face, row: { art: src }, icons, motifs: { [src]: motif } }).css
      const box = motifBox(css, motif)
      return { x: box.x, y: box.y, w: (motif.w - motif.trim.left - motif.trim.right) * box.sx, h: (motif.h - motif.trim.top - motif.trim.bottom) * box.sy }
    }

    // 80 of 100 pixels against 100 of 200: a fifth of the one file is air and a half of the
    // other, and the motif is nonetheless 30 × 30 mm in both, flush with the 30 mm frame's top
    // and bottom and 5 mm in from either side of it.
    expect(at('a.png', wide)).toEqual({ x: 5, y: 0, w: 30, h: 30 })
    expect(at('b.png', tight)).toEqual({ x: 5, y: 0, w: 30, h: 30 })
  })

  it('fills the frame with the motif when the picture is to cover it, so the air is cropped and not shown', () => {
    const face: FaceTemplate = { base: [{ ...frame, trim: true }], variants: {} }
    const css = compile({ type: CARD_STANDARD_63x88, face, row: { art: 'a.png' }, icons, motifs: { 'a.png': wide } }).css
    const box = motifBox(css, wide)

    // A square motif covering a 40 × 30 frame is 40 × 40: as wide as the frame, and taller —
    // so it fills the frame's width and hangs 5 mm over each of its horizontal edges, cropped.
    expect([80 * box.sx, 80 * box.sy]).toEqual([40, 40])
    expect([box.x, box.y]).toEqual([0, -5])
  })

  it('leaves the picture to its frame when nothing has measured that file yet', () => {
    const face: FaceTemplate = { base: [{ ...frame, fit: 'contain', trim: true }], variants: {} }
    const css = compile({ type: CARD_STANDARD_63x88, face, row: { art: 'a.png' }, icons }).css

    expect(css).toContain('[data-element="art"] .byd-art{width:100%;height:100%;object-fit:contain;}')
  })

  it('leaves a measured picture to its frame when the element does not ask for the motif', () => {
    const face: FaceTemplate = { base: [{ ...frame, fit: 'contain' }], variants: {} }
    const css = compile({ type: CARD_STANDARD_63x88, face, row: { art: 'a.png' }, icons, motifs: { 'a.png': wide } }).css

    expect(css).toContain('[data-element="art"] .byd-art{width:100%;height:100%;object-fit:contain;}')
  })

  // The frame is what the designer grabs — the handles hang on its corners, the outline follows
  // it and `elementFromPoint` answers with it — so the element's own box stays the frame however
  // the picture inside it is fitted, and the picture that overflows it is cropped by it.
  it('keeps the element the frame and hangs the picture inside it', () => {
    const face: FaceTemplate = { base: [{ ...frame, trim: true }], variants: {} }
    const out = compile({ type: CARD_STANDARD_63x88, face, row: { art: 'a.png' }, icons, motifs: { 'a.png': wide } })

    expect(out.html).toMatch(/<div data-element="art"><img class="byd-art" src="a\.png" alt=""><\/div>/)
    expect(out.css).toContain('[data-element="art"]{left:5mm;top:4mm;width:40mm;height:30mm;}')
  })
})
