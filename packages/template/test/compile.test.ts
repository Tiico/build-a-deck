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
    expect(out.css).toContain('[data-element="frame"]{left:1mm;top:1mm;width:61mm;height:86mm;}')
    // The frame is a rounded path with the line inside the box, not a CSS border (L17).
    expect(out.html).toContain('<div data-element="frame"><svg')
    expect(out.html).toContain('fill="#fff"')
    expect(out.html).toContain('stroke="#000"')
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
  // The colour the plate is actually painted, read off the path the compiler drew (L17).
  // `none` is how SVG says unpainted, which is what a shape with no colour has always been.
  const backgroundOf = (out: { html: string }) => {
    const found = /<div data-element="plate">.*?<path[^>]*fill="([^"]*)"/.exec(out.html)?.[1] ?? null
    return found === 'none' ? null : found
  }
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

// The one place a shape becomes ink (L17). Every shape is a path in an SVG inside its element,
// so a hexagon, a rectangle and a line are drawn by one code path with one set of meanings —
// and the stroke of each behaves like the border it replaces: inside the box, never over it.
describe('shapes are drawn as paths (L17)', () => {
  const shape = (over: Record<string, unknown> = {}) =>
    ({ kind: 'shape' as const, id: 'frame', x: 1, y: 1, w: 61, h: 86, ...over }) as unknown as Element
  const faceOf = (el: Element): FaceTemplate => ({ base: [el], variants: {} })
  const draw = (el: Element, scope?: string) =>
    compile({ type: CARD_STANDARD_63x88, face: faceOf(el), row: {}, icons, ...(scope ? { scope } : {}) })
  const pathsIn = (html: string) => [...html.matchAll(/<path\b[^>]*>/g)].map((m) => m[0])
  const dOf = (html: string, nth = 0) => /d="([^"]*)"/.exec(pathsIn(html)[nth] ?? '')?.[1] ?? ''

  it('positions the element in millimetres and draws the shape in the box own units', () => {
    const out = draw(shape({ shape: 'rect', fill: '#ffffff' }))
    expect(out.css).toContain('[data-element="frame"]{left:1mm;top:1mm;width:61mm;height:86mm;}')
    expect(out.html).toContain('<div data-element="frame">')
    expect(out.html).toContain('viewBox="0 0 61 86"')
    expect(pathsIn(out.html)).toHaveLength(1)
    expect(dOf(out.html)).toBe('M 0 0 L 61 0 L 61 86 L 0 86 Z')
  })

  // A border in CSS is drawn inside the box; a stroke in SVG straddles the line it is on. So the
  // path is inset by half the line, which puts the outer edge of the stroke exactly on the box —
  // the box stays the truth the handles and the guides stand on.
  it('keeps the stroke inside the box, as the border it replaces was', () => {
    const out = draw(shape({ shape: 'rect', fill: '#ffffff', stroke: '#000000', strokeMm: 0.5, radiusMm: 3 }))
    expect(out.html).toContain('stroke="#000000"')
    expect(out.html).toContain('stroke-width="0.5"')
    expect(dOf(out.html)).toContain('M 3.25 0.25')
  })

  it('draws a polygon with the corner count it was given, and a star with twice as many', () => {
    const corners = (html: string) => (dOf(html).match(/[ML]/g) ?? []).length
    expect(corners(draw(shape({ shape: 'polygon', corners: 6, fill: '#abcdef' })).html)).toBe(6)
    expect(corners(draw(shape({ shape: 'polygon', corners: 3, fill: '#abcdef' })).html)).toBe(3)
    expect(corners(draw(shape({ shape: 'star', corners: 5, innerRatio: 0.4, fill: '#abcdef' })).html)).toBe(10)
  })

  // A line is the one shape with no inside. Offering it a fill would let the editor paint
  // something the designer cannot see and cannot click.
  it('never fills a line, whatever the fill says', () => {
    const out = draw(shape({ shape: 'line', h: 0, fill: '#ff0000', stroke: '#333333', strokeMm: 0.4 }))
    expect(out.html).not.toContain('fill="#ff0000"')
    expect(out.html).toContain('stroke="#333333"')
  })

  it('lifts a shape off the paper with a shadow, colour and all', () => {
    const out = draw(shape({ shape: 'rect', fill: '#ffffff', shadow: { dxMm: 0, dyMm: 0.6, blurMm: 1.2, color: '#000000', opacity: 0.35 } }))
    expect(out.css).toContain('filter:drop-shadow(0mm 0.6mm 1.2mm rgb(0 0 0 / 0.35))')
  })

  it('carries a shadow colour through untouched when no transparency is asked for', () => {
    const out = draw(shape({ shape: 'circle', fill: '#ffffff', shadow: { dxMm: 0.5, dyMm: 0.5, blurMm: 0, color: '#334455' } }))
    expect(out.css).toContain('filter:drop-shadow(0.5mm 0.5mm 0mm #334455)')
  })

  // One transparency for the whole shape (#317): it is a layer opacity, so the fill, the pattern
  // and the line fade together rather than one of them at a time. It sits on the element and not
  // on the path for the same reason the shadow does — whatever the shape turned out to be is what
  // goes see-through, and the three layers inside keep their own relationship to each other.
  it('makes the whole shape see-through with one number', () => {
    const out = draw(shape({ shape: 'rect', fill: '#ffffff', stroke: '#000000', strokeMm: 0.5, opacity: 0.5 }))
    expect(out.css).toContain('[data-element="frame"]{left:1mm;top:1mm;width:61mm;height:86mm;opacity:0.5;}')
  })

  // A template written before the field existed has no opinion about transparency, and a document
  // with no opinion must draw exactly as it drew yesterday: nothing is written, so nothing changes
  // — not even `opacity:1`, which would be a new declaration in every card ever compiled.
  it('says nothing about transparency when the shape does not', () => {
    const out = draw(shape({ shape: 'rect', fill: '#ffffff' }))
    expect(out.css).not.toContain('opacity')
  })

  it('is a number between none and whole in the schema, and nothing else', () => {
    const solid = { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#ffffff' }
    expect(Element.parse({ ...solid, opacity: 0.5 })).toMatchObject({ opacity: 0.5 })
    expect(Element.parse({ ...solid, opacity: 0 })).toMatchObject({ opacity: 0 })
    expect(Element.parse(solid)).not.toHaveProperty('opacity')
    expect(() => Element.parse({ ...solid, opacity: 1.5 })).toThrow()
    expect(() => Element.parse({ ...solid, opacity: '50%' })).toThrow()
  })
})

// A pattern is ink repeated over the fill (L17), which is what makes a card back a card back.
// It is a second layer on the same path, so a fill that follows a column (L16) keeps following
// it and the pattern rides on top of whatever colour the row lands on.
describe('patterned fills (L17)', () => {
  const back = (pattern: Record<string, unknown>, fill: unknown = '#2f4068'): FaceTemplate => ({
    base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill, pattern } as unknown as Element],
    variants: {},
  })

  it('defines the tile once and paints a layer of it over the fill', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face: back({ kind: 'diamonds', color: '#3a4d7a', scaleMm: 6 }), row: {}, icons })
    expect(out.html).toContain('patternUnits="userSpaceOnUse"')
    expect(out.html).toContain('width="6" height="6"')
    expect(out.html).toContain('#3a4d7a')
    // The fill underneath is still drawn: the pattern is a layer, not a replacement.
    expect(out.html).toContain('fill="#2f4068"')
    const id = /<pattern id="([^"]+)"/.exec(out.html)?.[1]
    expect(id).toBeTruthy()
    expect(out.html).toContain(`fill="url(#${id})"`)
  })

  it('turns the tile by the angle it is given', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face: back({ kind: 'stripes', color: '#fff', scaleMm: 4, angleDeg: 45 }), row: {}, icons })
    expect(out.html).toContain('patternTransform="rotate(45)"')
  })

  // Many cards share one page in the deck wall and in the print sheet. Two tiles under the same
  // id would leave every card wearing the first card's pattern, which is the kind of fault that
  // only shows up once a deck has two of something.
  it('names the tile after the card it belongs to, so two cards on a page never share one', () => {
    const a = compile({ type: CARD_STANDARD_63x88, face: back({ kind: 'dots', color: '#fff', scaleMm: 3 }), row: {}, icons, scope: '#card-a' })
    const b = compile({ type: CARD_STANDARD_63x88, face: back({ kind: 'dots', color: '#fff', scaleMm: 3 }), row: {}, icons, scope: '#card-b' })
    const idOf = (html: string) => /<pattern id="([^"]+)"/.exec(html)?.[1]
    expect(idOf(a.html)).toBeTruthy()
    expect(idOf(a.html)).not.toBe(idOf(b.html))
  })

  it('rides on top of a fill that follows a column (L16)', () => {
    const face = back({ kind: 'grid', color: '#ffffff', scaleMm: 5 }, { field: 'element', map: { eld: '#8b2e2e' }, else: '#333333' })
    const eld = compile({ type: CARD_STANDARD_63x88, face, row: { element: 'eld' }, icons })
    expect(eld.html).toContain('fill="#8b2e2e"')
    expect(eld.html).toContain('<pattern id=')
  })
})

// The deck's measure (E1): `trim` takes the air off, but it does not say how large the drawing
// should be drawn or where in the frame it should stand — so two files that carry different
// amounts of air still draw their motifs at different sizes as soon as their proportions differ.
// The measure is what makes them agree, and what is asked here is always where the drawing lands
// in millimetres, never the CSS that put it there.
describe('compile — a picture framed by the deck’s measure (E1)', () => {
  const frame = { kind: 'image' as const, id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' } }
  const measure = { fill: 0.8 }

  // Where the drawing is drawn on the card, in millimetres of the card, read back off what the
  // compiler emitted. The element sits at 5,4 mm, so the numbers are relative to its own corner.
  function drawnBox(css: string, motif: { w: number; h: number; trim: { left: number; top: number; right: number; bottom: number } }) {
    const rule = /\[data-element="art"\] \.byd-art\{([^}]*)\}/.exec(css)?.[1] ?? ''
    const said = Object.fromEntries(rule.split(';').filter(Boolean).map((d) => d.split(':')))
    const mm = (prop: string) => Number(String(said[prop] ?? '').replace('mm', ''))
    const s = mm('width') / motif.w
    const round = (v: number) => Math.round(v * 1e3) / 1e3
    return {
      x: round(mm('left') + motif.trim.left * s),
      y: round(mm('top') + motif.trim.top * s),
      w: round((motif.w - motif.trim.left - motif.trim.right) * s),
      h: round((motif.h - motif.trim.top - motif.trim.bottom) * s),
    }
  }

  // The same drawing in three files: the second is the first at twice the resolution, the third
  // carries half again as much air around it. Nothing about the three may reach the card.
  const plain = { w: 200, h: 100, trim: { left: 60, top: 10, right: 60, bottom: 10 } }
  const doubled = { w: 400, h: 200, trim: { left: 120, top: 20, right: 120, bottom: 20 } }
  const airy = { w: 300, h: 150, trim: { left: 110, top: 35, right: 110, bottom: 35 } }

  const at = (motif: typeof plain, src: string, face: FaceTemplate, framing?: Record<string, { zoom?: number; dx?: number; dy?: number }>) =>
    drawnBox(compile({ type: CARD_STANDARD_63x88, face, row: { art: src }, icons, motifs: { [src]: motif }, ...(framing ? { framing } : {}) }).css, motif)

  it('draws the motif of three unlike files at the same size in the same place', () => {
    const face: FaceTemplate = { base: [{ ...frame, frame: measure }], variants: {} }

    // Four fifths of the 30 mm frame is 24 mm, centred in it whatever the file measured.
    expect(at(plain, 'a.png', face)).toEqual({ x: 8, y: 3, w: 24, h: 24 })
    expect(at(doubled, 'b.png', face)).toEqual({ x: 8, y: 3, w: 24, h: 24 })
    expect(at(airy, 'c.png', face)).toEqual({ x: 8, y: 3, w: 24, h: 24 })
  })

  it('takes one card’s own departure from the measure, and only that card’s', () => {
    const face: FaceTemplate = { base: [{ ...frame, frame: measure }], variants: {} }

    // Twice as close: the drawing is 48 mm across in a 40 × 30 mm frame, so it is cropped by the
    // frame on all four sides and still centred in it. The card beside it is untouched.
    expect(at(plain, 'a.png', face, { art: { zoom: 2 } })).toEqual({ x: -4, y: -9, w: 48, h: 48 })
    expect(at(plain, 'a.png', face)).toEqual({ x: 8, y: 3, w: 24, h: 24 })
  })

  it('draws the whole drawing when the file has no air to give, rather than sampling what was never drawn', () => {
    const face: FaceTemplate = { base: [{ ...frame, frame: measure }], variants: {} }
    const cropped = { w: 160, h: 120, trim: { left: 0, top: 0, right: 0, bottom: 0 } }

    // The measure wants a window wider than the file, so the window is what the file is: the
    // drawing then fills the frame instead of four fifths of it, and the card shows the truth.
    expect(at(cropped, 'e.png', face)).toEqual({ x: 0, y: 0, w: 40, h: 30 })
  })

  it('leaves the picture to its frame when nothing has measured that file yet', () => {
    const face: FaceTemplate = { base: [{ ...frame, fit: 'contain', frame: measure }], variants: {} }
    const css = compile({ type: CARD_STANDARD_63x88, face, row: { art: 'a.png' }, icons }).css

    expect(css).toContain('[data-element="art"] .byd-art{width:100%;height:100%;object-fit:contain;}')
  })

  it('keeps the element the frame, as every other fitting does', () => {
    const face: FaceTemplate = { base: [{ ...frame, frame: measure }], variants: {} }
    const out = compile({ type: CARD_STANDARD_63x88, face, row: { art: 'a.png' }, icons, motifs: { 'a.png': plain } })

    expect(out.html).toMatch(/<div data-element="art"><img class="byd-art" src="a\.png" alt=""><\/div>/)
    expect(out.css).toContain('[data-element="art"]{left:5mm;top:4mm;width:40mm;height:30mm;}')
  })
})

// A symbol carries a meaning, and the meaning carries a colour (E4). The colour reaches the card
// as paint behind the symbol's own shape rather than as a second file: one upload serves every
// colour the deck writes, which is what makes a colour per use possible at all.
describe('compile — a symbol in the colour of its role (E4)', () => {
  const face: FaceTemplate = {
    base: [{ kind: 'text', id: 'body', x: 2, y: 2, w: 50, h: 20, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#111' }],
    variants: {},
  }
  const set = { svard: 'svard.svg', mynt: 'mynt.svg' }
  const palette = { fara: '#8f2d20', kostnad: '#3b3a86' }
  const ink = (body: string) => compile({ type: CARD_STANDARD_63x88, face, row: { body }, icons: set, palette })

  it('paints the symbol in its role’s colour, through its own shape', () => {
    const out = ink('Skada {svard|fara} 2.')

    // The shape is the mask and the colour is behind it, so the file is never asked to be red.
    expect(out.html).toContain('<span class="byd-icon byd-ink" role="img" aria-label="svard" style="background:#8f2d20;-webkit-mask-image:url(&quot;svard.svg&quot;);mask-image:url(&quot;svard.svg&quot;)"></span>')
    expect(out.warnings).toEqual([])
  })

  it('leaves a symbol without a role the picture it has always been', () => {
    expect(ink('Betala {mynt}.').html).toContain('<img class="byd-icon" src="mynt.svg" alt="mynt">')
  })

  it('draws a symbol whose role the deck does not name, and says which role that was', () => {
    const out = ink('Skada {svard|glomd} 2.')

    // The card keeps its symbol — losing a word is worse than losing a colour — and the deck is
    // told, so the palette can be given the meaning the text already uses.
    expect(out.html).toContain('<img class="byd-icon" src="svard.svg" alt="svard">')
    expect(out.warnings).toEqual([{ element: 'body', code: 'unknown-role', detail: 'glomd' }])
  })

  it('sizes a painted symbol like every other symbol, in text and in an icon row', () => {
    const row: FaceTemplate = {
      base: [{ kind: 'icons', id: 'row', x: 2, y: 2, w: 50, h: 8, bind: { field: 'marks' }, iconMm: 4 }],
      variants: {},
    }
    const out = compile({ type: CARD_STANDARD_63x88, face: row, row: { marks: 'svard|fara mynt' }, icons: set, palette })

    expect(out.css).toContain('.byd-ink{display:inline-block;width:1em;background:currentColor;')
    expect(out.css).toContain('[data-element="row"] .byd-icon{height:4mm;width:4mm;')
    expect(out.html).toContain('style="background:#8f2d20;')
    expect(out.html).toContain('<img class="byd-icon" src="mynt.svg" alt="mynt">')
  })
})

// A body carrying the subset (L2, #308): bold, italic, paragraphs, a bullet list and symbols.
// One code path draws it — the editor preview, the felt's texture and the print PDF all come
// through `compile` (B3, E2) — so what is asserted here is what every surface shows.
describe('a formatted body (L2, #308)', () => {
  const body = (text: string) => compile({ type: CARD_STANDARD_63x88, face, row: { title: 'Drake', body: text }, icons })

  it('draws a bullet list as a list, one item per line', () => {
    expect(body('Välj en:\n- **Dra** ett kort\n- Gör {eld} skada').html).toContain(
      '<p>Välj en:</p><ul><li><strong>Dra</strong> ett kort</li>' +
        '<li>Gör <img class="byd-icon" src="data:image/svg+xml;utf8,&lt;svg/&gt;" alt="eld"> skada</li></ul>',
    )
  })

  // The spacing has to follow the element's own font and size, because the size is not settled at
  // compile time: `fitInDocument` steps it down in the browser until the words fit. A gap or an
  // indent written in millimetres would keep the size it was compiled at and drift away from the
  // text; written in `em` it is measured against a `font-size` in points, which is a physical
  // length all the way to the press. A browser's own `ul` is indented by 40 *pixels*, which is
  // neither, so the rule is overwritten rather than inherited.
  it('spaces and indents the list against the element’s font, never in pixels', () => {
    const out = body('Välj en:\n- ett\n- två')

    expect(out.css).toContain('[data-element] ul{margin:0;padding-left:1.15em;list-style:disc;}')
    expect(out.css).toContain('[data-element] li+li{margin-top:0.2em;}')
    expect(out.css).toContain('[data-element] p+ul{margin-top:0.5em;}')
    expect(out.css).toContain('[data-element] ul+p{margin-top:0.5em;}')
    // Nothing the body's own blocks are laid out with is a pixel.
    expect(out.css.split('\n').filter((rule) => /\b(?:p|ul|li)\b/.test(rule) && /\dpx/.test(rule))).toEqual([])
  })

  it('draws a symbol inside bold and inside italic, as it draws one beside them (E4)', () => {
    const out = body('**Gör {eld} skada** och *ta {eld}*.')

    expect(out.html).toContain('<strong>Gör <img class="byd-icon" src="data:image/svg+xml;utf8,&lt;svg/&gt;" alt="eld"> skada</strong>')
    expect(out.html).toContain('<em>ta <img class="byd-icon" src="data:image/svg+xml;utf8,&lt;svg/&gt;" alt="eld"></em>')
    expect(out.warnings).toEqual([])
  })

  it('draws a cell with no marking as the one paragraph it has always been', () => {
    const out = body('Dra ett kort och lägg det överst i högen.')

    expect(out.html).toContain('<div data-element="body" data-fit="fixed" data-size-pt="9" data-min-pt="6"><p>Dra ett kort och lägg det överst i högen.</p></div>')
    expect(out.html).not.toContain('<ul>')
  })

  it('draws a tag the designer typed as the tag she typed, inside a list item as anywhere else', () => {
    const out = body('- <b>inte fet</b> men **fet**')

    expect(out.html).toContain('<ul><li>&lt;b&gt;inte fet&lt;/b&gt; men <strong>fet</strong></li></ul>')
    expect(out.html).not.toContain('<b>')
  })

  // A page holds many cards, each fitted to its own size, and a rule that lost its scope would
  // lay out every card on it. Every rule the body's blocks need is pushed on its own for that
  // reason; this is what says so.
  it('scopes every rule the body’s blocks need, so one card cannot lay out another', () => {
    const out = compile({ type: CARD_STANDARD_63x88, face, row: { title: 'Drake', body: '- ett' }, icons, scope: '#kort-7' })

    expect(out.css.split('\n').filter((rule) => /\[data-element\] (?:p|ul|li)/.test(rule) && !rule.startsWith('#kort-7 '))).toEqual([])
  })
})
