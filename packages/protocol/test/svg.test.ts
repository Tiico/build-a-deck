import { describe, expect, it } from 'vitest'
import { svgRefusal } from '../src/index.js'

// The drawing a designer uploads as her own icon (#1087): the editor cleans it before the hash is
// taken, and the service asks the same question of the bytes that arrive. These are the files
// that question has to let through and the ones it must not.

const SVG = 'xmlns="http://www.w3.org/2000/svg"'
// A body inside a root that is itself above reproach, so a refusal is the body's.
const drawn = (body: string): string => `<svg ${SVG} viewBox="0 0 24 24">${body}</svg>`

describe('an SVG that is safe to store and draw (#1087)', () => {
  it('lets a game-icons file through: one path in currentColor', () => {
    expect(svgRefusal(`<svg ${SVG} viewBox="0 0 512 512" color="#1c1c1c"><path fill="currentColor" d="M1 2z"/></svg>`)).toBeNull()
  })

  it('lets a Lucide file through: strokes on a group, a path and a circle', () => {
    expect(
      svgRefusal(
        `<svg ${SVG} viewBox="0 0 24 24" color="#1c1c1c"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M1 2"/><circle cx="12" cy="12" r="3"/></g></svg>`,
      ),
    ).toBeNull()
  })

  // Copied out of `packages/web/src/editor/symbols.ts` rather than imported from it: protocol
  // depends on nothing. The web suite asks the same of every symbol in the live library.
  it('lets the library’s own symbols through, the even-odd ones and the colour blocks included', () => {
    const library = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1c1c1c"><path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1c1c1c"><path fill-rule="evenodd" d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4a5 5 0 110 10 5 5 0 010-10z"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1c1c1c"><path fill-rule="evenodd" d="M2 2h20v20H2zm1.5 1.5v17h17v-17z"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1c1c1c"><path d="M5 7h14l-1.5 14h-11z"/><path d="M9 4h6v3H9z"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1c1c1c"><circle cx="12" cy="9" r="6"/><path d="M6 20c2-3 10-3 12 0z"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1c1c1c"><rect width="24" height="24" fill="#b4653f"/></svg>',
    ]
    for (const svg of library) expect(svgRefusal(svg), svg).toBeNull()
  })

  it('lets through what a drawing program leaves around the shape: a declaration, comments, a title, entities', () => {
    expect(svgRefusal(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- ritad för hand -->\n<svg ${SVG}/>\n`)).toBeNull()
    expect(svgRefusal(`\uFEFF<svg ${SVG}><title>Sköld &amp; svärd &#8211; &#x2014;</title><desc>&lt;ingen&gt;</desc></svg>`)).toBeNull()
  })

  it('lets a gradient, a clip and a mask through when they are referred to inside the file', () => {
    const svg = drawn(
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#000" stop-opacity="1"/></linearGradient>' +
        '<radialGradient id="r" fx="0.5" fy="0.5" spreadMethod="pad"/><clipPath id="c"><rect width="10" height="10"/></clipPath><mask id="m"><ellipse cx="1" cy="1" rx="1" ry="1"/></mask>' +
        '<symbol id="s"><polygon points="0,0 1,1 1,0"/></symbol></defs>' +
        '<g clip-path="url(#c)" mask="url( \'#m\' )"><path fill="url(#g)" d="M0 0h1"/><line x1="0" y1="0" x2="1" y2="1" stroke="url(&quot;#r&quot;)"/><polyline points="0 0 1 1"/></g>' +
        `<use href="#s"/><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#s"/>`,
    )
    expect(svgRefusal(svg)).toBeNull()
  })
})

describe('an SVG that is refused (#1087)', () => {
  it('refuses a doctype and the entities it declares', () => {
    expect(svgRefusal(`<!DOCTYPE svg><svg ${SVG}/>`)).toMatch(/doctype/)
    expect(svgRefusal(`<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY lol "lol">]><svg ${SVG}><title>&lol;</title></svg>`)).toMatch(/doctype/)
    expect(svgRefusal(drawn('<!ENTITY x SYSTEM "file:///etc/passwd">'))).toMatch(/doctype/)
    // An entity XML does not define could only have been declared by a doctype.
    expect(svgRefusal(drawn('<title>&xxe;</title>'))).toMatch(/entity/)
    expect(svgRefusal(drawn('<title>salt & peppar</title>'))).toMatch(/entity/)
  })

  it('refuses a processing instruction other than a leading declaration, and CDATA', () => {
    expect(svgRefusal(`<?xml-stylesheet href="https://example.test/a.css"?><svg ${SVG}/>`)).toMatch(/processing instruction/)
    expect(svgRefusal(drawn('<?php echo 1 ?>'))).toMatch(/processing instruction/)
    // The declaration belongs on the first line and nowhere else.
    expect(svgRefusal(` <?xml version="1.0"?><svg ${SVG}/>`)).toMatch(/processing instruction/)
    expect(svgRefusal(drawn('<title><![CDATA[<script>alert(1)</script>]]></title>'))).toMatch(/CDATA/)
  })

  it('refuses a declaration that names an encoding other than UTF-8, which the browser would read differently', () => {
    expect(svgRefusal(`<?xml version="1.0" encoding="utf-8"?><svg ${SVG}/>`)).toBeNull()
    expect(svgRefusal(`<?xml version="1.0" encoding="UTF-7"?><svg ${SVG}/>`)).toMatch(/UTF-8/)
    expect(svgRefusal(`<?xml version="1.0" encoding='ISO-8859-1'?><svg ${SVG}/>`)).toMatch(/UTF-8/)
  })

  it('refuses every element outside the allowlist, names it, and reads names as XML does', () => {
    for (const el of ['script', 'foreignObject', 'image', 'style', 'a', 'iframe', 'animate', 'animateTransform', 'animateMotion', 'set', 'text', 'feImage', 'svg:script']) {
      expect(svgRefusal(drawn(`<${el}></${el}>`)), el).toBe(`<${el}> is not an element a drawing may hold`)
    }
    // XML is case-sensitive: `<Script>` is not the script element, and not on the list either.
    expect(svgRefusal(drawn('<Script/>'))).toMatch(/<Script>/)
    expect(svgRefusal(drawn('<clippath/>'))).toMatch(/<clippath>/)
    // An element hidden under an allowed one is read all the same.
    expect(svgRefusal(drawn('<defs><g><script/></g></defs>'))).toMatch(/<script>/)
  })

  it('refuses every attribute outside the allowlist, and every event handler by name', () => {
    expect(svgRefusal(`<svg ${SVG} onload="alert(1)"/>`)).toBe('onload is an event handler')
    expect(svgRefusal(drawn('<path onclick="x()" d="M0 0"/>'))).toBe('onclick is an event handler')
    expect(svgRefusal(drawn('<path ONMOUSEOVER="x()"/>'))).toBe('ONMOUSEOVER is an event handler')
    for (const attribute of ['style', 'begin', 'xml:base', 'xmlns:inkscape', 'requiredExtensions', 'target']) {
      expect(svgRefusal(drawn(`<path ${attribute}="x"/>`)), attribute).toBe(`${attribute} is not an attribute a drawing may carry`)
    }
  })

  it('refuses an href that leaves the file, and an xmlns that is not SVG’s or XLink’s', () => {
    for (const href of ['https://example.test/a.svg#s', 'a.svg#s', '//example.test/x', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>', '#', '# s', '']) {
      expect(svgRefusal(drawn(`<use href="${href.replaceAll('<', '&lt;')}"/>`)), href).toMatch(/href points outside the drawing/)
      expect(svgRefusal(drawn(`<use xlink:href="${href.replaceAll('<', '&lt;')}"/>`)), href).toMatch(/xlink:href points outside the drawing/)
    }
    expect(svgRefusal('<svg xmlns="http://www.w3.org/1999/xhtml"/>')).toMatch(/namespace/)
    expect(svgRefusal(`<svg ${SVG} xmlns:xlink="http://example.test/"/>`)).toMatch(/namespace/)
  })

  it('refuses a url() that is not a reference into the file, and a javascript: or data: address anywhere', () => {
    expect(svgRefusal(drawn('<path fill="url(https://example.test/p.svg#g)"/>'))).toMatch(/fill points outside the drawing/)
    expect(svgRefusal(drawn('<path fill="url(#g) url(x.svg)"/>'))).toMatch(/points outside the drawing/)
    expect(svgRefusal(drawn('<g mask="URL(x.svg#m)"/>'))).toMatch(/points outside the drawing/)
    expect(svgRefusal(drawn('<path class="javascript:x"/>'))).toMatch(/javascript:/)
    expect(svgRefusal(drawn('<path id="java&#9;script:x"/>'))).toMatch(/javascript:/)
    expect(svgRefusal(drawn('<path class="DATA:text/html,x"/>'))).toMatch(/data:/)
    // An escape is how a stylesheet spells `url(` without the letters.
    expect(svgRefusal(drawn('<path fill="\\75 rl(x.svg)"/>'))).toMatch(/backslash/)
    // An entity is read before the check, as the browser reads it.
    expect(svgRefusal(drawn('<path fill="&#117;rl(x.svg)"/>'))).toMatch(/points outside the drawing/)
  })

  it('refuses a root that is not svg, a file with two roots, and a file that does not parse', () => {
    expect(svgRefusal('<g/>')).toBe('the root element is <g>, not <svg>')
    expect(svgRefusal('<html><svg/></html>')).toMatch(/root element is <html>/)
    expect(svgRefusal('')).toMatch(/no <svg>/)
    expect(svgRefusal('just words')).toMatch(/text outside/)
    expect(svgRefusal(`<svg ${SVG}/><svg ${SVG}/>`)).toMatch(/more than one root/)
    expect(svgRefusal(`<svg ${SVG}><g></svg>`)).toBe('</svg> closes <g>')
    expect(svgRefusal(`<svg ${SVG}><g>`)).toBe('<g> is never closed')
    expect(svgRefusal(`<svg ${SVG}></g></svg>`)).toBe('</g> closes <svg>')
    expect(svgRefusal(`<svg ${SVG}/></g>`)).toBe('</g> closes nothing')
    expect(svgRefusal(drawn('<path d="M0 0" d="M1 1"/>'))).toMatch(/twice/)
    expect(svgRefusal(drawn('<path d=M0/>'))).toMatch(/not quoted/)
    expect(svgRefusal(drawn('<path d="M0 0/>'))).toMatch(/never closed|does not parse/)
    expect(svgRefusal(drawn('<path d="<script>"/>'))).toMatch(/holds a </)
    expect(svgRefusal(drawn('<path d="M0"fill="red"/>'))).toMatch(/does not parse/)
    expect(svgRefusal(drawn('<!-- never closed'))).toMatch(/comment/)
  })

  it('refuses text where a shape belongs', () => {
    expect(svgRefusal(drawn('<g>alert(1)</g>'))).toBe('<g> holds text')
    expect(svgRefusal(`<svg ${SVG}/>trailing`)).toMatch(/text outside/)
  })
})
