// Whether a drawing a designer hands the tool is one it may store and draw (#1087).
//
// An SVG is a document that runs: a `<script>`, an `onload`, a `<foreignObject>` holding a page, an
// `href` that fetches from somewhere else. A card draws a coloured icon as a CSS mask, so all the
// tool ever needs from the file is the shape — and every one of those things is something the file
// could do instead of being a shape, wherever its bytes are opened: in the editor, on the felt,
// from `/assets/<hash>` in a tab of its own.
//
// The answer is an allowlist, asked twice of the same bytes. The editor cleans a file down to it
// before the hash is taken, because an asset is named by its bytes (`assetRefOf`) and a file the
// service rewrote would no longer be the file the document names. The service then asks this
// function of every drawing that arrives and refuses the ones that fail, without changing a byte.
// One list, so the cleaner cannot let through something the gate refuses, nor the gate let
// through something the cleaner would have taken out.
//
// It reads the text itself, with a tokenizer that knows only as much XML as an icon needs, because
// it runs on the server, where there is no DOMParser, and because a parser that understands more
// than this is more than this has to trust. Whatever it does not recognise it refuses.

// The elements a shape is made of: geometry, grouping, reuse within the file, and the gradients
// and masks a drawn icon may carry. Nothing that holds text to lay out, a picture to fetch, a
// stylesheet, a link, or a timeline.
export const SVG_ELEMENTS: ReadonlySet<string> = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'defs', 'clipPath', 'mask', 'use', 'symbol', 'title', 'desc',
  'linearGradient', 'radialGradient', 'stop',
])

// The attributes those elements need. No `style`: a stylesheet is a language of its own, with
// `url()`, `@import` and escapes, and every property an icon needs has a presentation attribute
// that says the same thing in a value this file can read.
export const SVG_ATTRIBUTES: ReadonlySet<string> = new Set([
  // geometry
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points',
  // painting
  'transform', 'fill', 'fill-rule', 'fill-opacity', 'clip-rule', 'clip-path', 'mask',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'color',
  // document
  'viewBox', 'preserveAspectRatio', 'version', 'xmlns', 'xmlns:xlink', 'id', 'class', 'href', 'xlink:href',
  // gradients
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'fx', 'fy', 'spreadMethod',
])

// The only places text means anything in a drawing that is a shape. Everywhere else it is the
// whitespace between tags.
export const SVG_TEXT_HOLDERS: ReadonlySet<string> = new Set(['title', 'desc'])

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

// The namespaces the two `xmlns` attributes may declare. Another one would make the elements below
// it something other than SVG, which the allowlist above says nothing about.
const NAMESPACES: ReadonlyMap<string, string> = new Map([
  ['xmlns', SVG_NAMESPACE],
  ['xmlns:xlink', 'http://www.w3.org/1999/xlink'],
])

// What may stand after a `#` in a reference: an id, as XML spells one.
const FRAGMENT = /^#[\p{L}_][\p{L}\p{N}_.:-]*$/u
// `url(#id)`, the one kind of `url()` a value may hold: a gradient, a clip or a mask in this file.
const LOCAL_URL = /url\(\s*(['"]?)#[\p{L}_][\p{L}\p{N}_.:-]*\1\s*\)/giu
// The five entities XML defines and numeric references. A doctype is refused, so no other name
// can have been declared, and a reference to one would only be a file that does not parse.
const ENTITY = /&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/y
const NAME = /[A-Za-z_][\w.:-]*/y
const SPACE = /[ \t\r\n]*/y
const XML_DECLARATION = /^<\?xml[ \t\r\n][^]*?\?>/

// Why a drawing may not be stored, in a few words of English, or null when it may.
export function svgRefusal(text: string): string | null {
  const src = text.replace(/^\uFEFF/, '')
  const open: string[] = []
  let rooted = false
  let at = 0
  // A file may say which version of XML it is written in, and only on its first line: that is
  // the one processing instruction XML itself gives a meaning, and the only place it may stand.
  const declaration = XML_DECLARATION.exec(src)
  if (declaration) {
    // These checks read the file as UTF-8, and so does everything that hands it on. A file that
    // says it is written in something else is a file the browser would read as other text than
    // this did — UTF-7 spells `<` without the byte.
    const encoding = /\bencoding[ \t\r\n]*=[ \t\r\n]*(["'])(.*?)\1/.exec(declaration[0])
    if (encoding && encoding[2]?.toLowerCase() !== 'utf-8') return 'it is not written in UTF-8'
    at = declaration[0].length
  }

  const sticky = (re: RegExp): string | null => {
    re.lastIndex = at
    const m = re.exec(src)
    if (!m) return null
    at = re.lastIndex
    return m[0]
  }

  while (at < src.length) {
    const lt = src.indexOf('<', at)
    const end = lt < 0 ? src.length : lt
    const refused = textRefusal(src.slice(at, end), open.at(-1))
    if (refused) return refused
    at = end
    if (lt < 0) break

    if (src.startsWith('<!--', at)) {
      // A comment is inert wherever it stands; the cleaner takes them out anyway.
      const close = src.indexOf('-->', at + 4)
      if (close < 0) return 'a comment is never closed'
      at = close + 3
      continue
    }
    // CDATA hides text from the reading above, which is the whole of what it is for.
    if (src.startsWith('<![CDATA[', at)) return 'it holds a CDATA section'
    // A doctype is where entities are declared — the file that expands to a gigabyte, the entity
    // that reads a file off the disk — and an icon has no use for one.
    if (src.startsWith('<!', at)) return 'it holds a doctype or a declaration'
    if (src.startsWith('<?', at)) return 'it holds a processing instruction'

    if (src.startsWith('</', at)) {
      at += 2
      const name = sticky(NAME)
      sticky(SPACE)
      if (!name || src[at] !== '>') return 'a closing tag does not parse'
      at += 1
      const expected = open.pop()
      if (expected !== name) return expected ? `</${name}> closes <${expected}>` : `</${name}> closes nothing`
      continue
    }

    at += 1
    const name = sticky(NAME)
    if (!name) return 'a tag does not parse'
    if (!rooted) {
      if (name !== 'svg') return `the root element is <${name}>, not <svg>`
      rooted = true
    } else if (open.length === 0) return 'there is more than one root element'
    if (!SVG_ELEMENTS.has(name)) return `<${name}> is not an element a drawing may hold`

    const seen = new Set<string>()
    for (;;) {
      const space = sticky(SPACE)
      if (src.startsWith('/>', at)) {
        at += 2
        break
      }
      if (src[at] === '>') {
        at += 1
        open.push(name)
        break
      }
      const attribute = space ? sticky(NAME) : null
      if (!attribute) return `<${name}> does not parse`
      if (seen.has(attribute)) return `${attribute} is given twice on <${name}>`
      seen.add(attribute)
      sticky(SPACE)
      if (src[at] !== '=') return `${attribute} on <${name}> has no value`
      at += 1
      sticky(SPACE)
      const quote = src[at]
      if (quote !== '"' && quote !== "'") return `${attribute} on <${name}> is not quoted`
      const close = src.indexOf(quote, at + 1)
      if (close < 0) return `${attribute} on <${name}> is never closed`
      const raw = src.slice(at + 1, close)
      at = close + 1
      const refusedValue = attributeRefusal(attribute, raw)
      if (refusedValue) return refusedValue
    }
  }

  const unclosed = open.at(-1)
  if (unclosed) return `<${unclosed}> is never closed`
  if (!rooted) return 'there is no <svg> element'
  return null
}

// Text between tags: anything at all inside a title or a description, as long as its entities are
// the ones XML knows, and nothing but whitespace anywhere else.
function textRefusal(text: string, parent: string | undefined): string | null {
  if (text === '') return null
  const decoded = decodedEntities(text)
  if (decoded === null) return 'it uses an entity XML does not define'
  if (parent && SVG_TEXT_HOLDERS.has(parent)) return null
  return /^[ \t\r\n]*$/.test(decoded) ? null : parent ? `<${parent}> holds text` : 'there is text outside the drawing'
}

// An attribute as it stands in the file: its entities are read first, since the checks are made on
// the value the browser reads.
function attributeRefusal(name: string, raw: string): string | null {
  if (raw.includes('<')) return `${name} holds a <`
  const value = decodedEntities(raw)
  if (value === null) return `${name} uses an entity XML does not define`
  return svgAttributeRefusal(name, value)
}

// Why an attribute may not stay on a drawing, asked of its name as the file spells it (`xlink:href`)
// and its value as the DOM reads it, entities expanded. It is the question the editor's cleaner
// asks of each attribute it keeps, so what it keeps is what this file lets through.
export function svgAttributeRefusal(name: string, value: string): string | null {
  // A handler is refused by name before anything else: it is the one attribute whose whole
  // purpose is to run, and the reason should say so.
  if (/^on/i.test(name)) return `${name} is an event handler`
  if (!SVG_ATTRIBUTES.has(name)) return `${name} is not an attribute a drawing may carry`
  const namespace = NAMESPACES.get(name)
  if (namespace !== undefined && value !== namespace) return `${name} declares a namespace other than ${namespace}`
  if ((name === 'href' || name === 'xlink:href') && !FRAGMENT.test(value)) return `${name} points outside the drawing`
  // A backslash is an escape in the CSS a presentation attribute is read as, and `\75 rl(` is a
  // `url(` the checks below would not see. No number, colour or path a shape is made of has one.
  if (value.includes('\\')) return `${name} holds a backslash`
  // Read without the whitespace and control characters a browser skips over inside a scheme, so
  // `java&#9;script:` is the same word to this as to the browser.
  const squeezed = [...value]
    .filter((c) => c > ' ' && c !== '\u007f')
    .join('')
    .toLowerCase()
  if (squeezed.includes('javascript:')) return `${name} holds a javascript: address`
  if (squeezed.includes('data:')) return `${name} holds a data: address`
  if (/url\(/i.test(value.replace(LOCAL_URL, ''))) return `${name} points outside the drawing`
  return null
}

// The text as it reads once its entities are expanded, or null when it uses one XML does not
// define or an ampersand that starts none. Every check on a value is made on this, because the
// browser makes its decisions on this.
function decodedEntities(text: string): string | null {
  let out = ''
  let at = 0
  for (let amp = text.indexOf('&'); amp >= 0; amp = text.indexOf('&', at)) {
    ENTITY.lastIndex = amp
    const m = ENTITY.exec(text)
    if (!m) return null
    out += text.slice(at, amp) + entityText(m[0])
    at = amp + m[0].length
  }
  return out + text.slice(at)
}

const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function entityText(entity: string): string {
  const body = entity.slice(1, -1)
  if (!body.startsWith('#')) return NAMED[body] ?? ''
  const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
  // A code point that is not one stands for nothing a check could be fooled by; it reads as a
  // replacement character, which no scheme or keyword contains.
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD'
}
