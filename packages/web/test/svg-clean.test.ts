// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { svgRefusal } from '@byd/protocol'
import { cleanSvg } from '../src/editor/svg-clean.js'
import { LIBRARY } from '../src/editor/symbols.js'
import { THEMES } from '../src/editor/themes.js'

// The drawings the tool uploads by itself are held to the gate a designer's own file is (#1087):
// the library's symbols and each theme's starter set reach `POST /assets` as `vector` assets, and
// the gate now refuses any drawing outside the allowlist.
describe('the tool’s own drawings pass the gate unchanged (#1087)', () => {
  it('lets every symbol in the library through as it is', () => {
    for (const symbol of LIBRARY) expect(svgRefusal(symbol.svg), symbol.id).toBeNull()
  })

  it('lets every theme’s starter icons through as they are', () => {
    for (const theme of THEMES) {
      expect(theme.icons.length, theme.id).toBeGreaterThan(0)
      for (const id of theme.icons) {
        const symbol = LIBRARY.find((s) => s.id === id)
        expect(symbol, `${theme.id}: ${id}`).toBeDefined()
        expect(svgRefusal(symbol!.svg), `${theme.id}: ${id}`).toBeNull()
      }
    }
  })
})

const cleaned = (text: string): string => {
  const out = cleanSvg(text)
  if ('refused' in out) throw new Error(`refused: ${out.refused}`)
  return out.svg
}

// A designer's own file is cleaned before it is hashed (#1087), so the address the document holds
// is the address of what the gate will take.
describe('a designer’s own drawing is cleaned down to the allowlist before upload (#1087)', () => {
  it('gives a clean file back as it was, so its address does not move', () => {
    const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" color="#1c1c1c"><path fill="currentColor" d="M1 2z"/></svg>'
    expect(cleaned(icon)).toBe(icon)
    for (const symbol of LIBRARY) expect(cleaned(symbol.svg), symbol.id).toBe(symbol.svg)
  })

  it('takes out what runs, fetches or styles, and keeps the shape', () => {
    const dirty = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?xml-stylesheet href="https://example.test/a.css"?>',
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
      '<!-- Generator: a drawing program -->',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 24 24" onload="alert(1)" style="background:url(https://example.test/t.png)" inkscape:version="1.3">',
      '<script>alert(document.cookie)</script>',
      '<style>.a{fill:url(https://example.test/x)}</style>',
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
      '<inkscape:namedview/>',
      '<g onclick="x()" class="a">stray text<!-- note -->',
      '<path d="M0 0h24v24z" fill="url(https://example.test/p.svg#g)" stroke="url(#ok)"/>',
      '<a href="https://example.test"><circle cx="1" cy="1" r="1"/></a>',
      '<use href="https://example.test/a.svg#s"/><use xlink:href="#s"/>',
      '<image href="data:image/png;base64,AAAA"/>',
      '<animate attributeName="href" to="javascript:alert(1)"/>',
      '</g>',
      '<title>Sköld &amp; svärd</title>',
      '</svg>',
    ].join('\n')
    const svg = cleaned(dirty)
    expect(svgRefusal(svg)).toBeNull()
    for (const gone of ['script', 'style', 'foreignObject', 'namedview', 'onload', 'onclick', 'inkscape', 'example.test', 'stray text', 'note', '<a', '<image', '<animate', 'DOCTYPE', 'Generator', 'xml-stylesheet']) {
      expect(svg, gone).not.toContain(gone)
    }
    // The shape is all still there, and what pointed inside the file still does.
    expect(svg).toContain('<path d="M0 0h24v24z" stroke="url(#ok)"/>')
    expect(svg).toContain('<use xlink:href="#s"/>')
    expect(svg).toContain('class="a"')
    expect(svg).toContain('<title>Sköld &amp; svärd</title>')
  })

  it('takes out an element that only looks like SVG’s, from another namespace', () => {
    const svg = cleaned('<svg xmlns="http://www.w3.org/2000/svg"><path xmlns="http://www.w3.org/1999/xhtml" d="M0 0"/><circle r="1"/></svg>')
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>')
  })

  it('refuses a file that does not parse or is not a drawing, and says why', () => {
    expect(cleanSvg('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>')).toEqual({ refused: expect.any(String) as string })
    expect(cleanSvg('not a drawing at all')).toEqual({ refused: expect.any(String) as string })
    expect(cleanSvg('<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>')).toEqual({ refused: expect.any(String) as string })
    // A root called svg in no namespace is no drawing a browser draws.
    expect(cleanSvg('<svg><path d="M0 0"/></svg>')).toEqual({ refused: expect.any(String) as string })
  })
})
