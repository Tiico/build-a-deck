import { SVG_ELEMENTS, SVG_NAMESPACE, SVG_TEXT_HOLDERS, svgAttributeRefusal, svgRefusal } from '@byd/protocol'

// A designer's own drawing, cleaned down to what the gate takes (#1087).
//
// An asset is named by the hash of its bytes (`assetRefOf`), worked out here before the upload, and
// the service may only take or refuse those bytes — never rewrite them, or the document would name
// a file nobody stored. So the cleaning happens here, before the hash: what is hashed, uploaded and
// referred to is the cleaned file, and `POST /assets` asks `svgRefusal` of it as the gate.
//
// It cleans with the browser's own parser and serialiser, and keeps exactly what the protocol's
// allowlist lets through: the same element, attribute and text lists, and the same question of
// every attribute value. The result is then asked `svgRefusal` all the same, because a file whose
// parts all pass can still fail as a whole — no `<svg>` root, a parse error, a namespace that
// makes the root something else — and the answer the designer is given has to be the gate's.
export function cleanSvg(text: string): { svg: string } | { refused: string } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  // A browser does not throw on a file that does not parse: it hands back a document with a
  // `parsererror` in it — the whole of it in Firefox and jsdom, beside what it did read in
  // Chromium. Cleaning the latter would take a half-read file for a whole one.
  if (doc.getElementsByTagName('parsererror').length > 0) return { refused: 'the file does not parse' }
  const root = doc.documentElement
  // `svgRefusal` reads names, not namespaces: a root spelled `svg` in no namespace passes it and is
  // still no drawing a browser draws, so this is the one refusal that is the cleaner's own.
  if (root.localName !== 'svg' || root.prefix !== null || root.namespaceURI !== SVG_NAMESPACE) return { refused: 'the root element is not an SVG <svg>' }
  keepAllowed(root)
  // The root alone: no doctype, no declaration and no comment before it survive the serialiser.
  const svg = new XMLSerializer().serializeToString(root)
  const refused = svgRefusal(svg)
  return refused ? { refused } : { svg }
}

// Strips an element down to the allowlist, in place: an attribute the protocol refuses goes, an
// element it does not list goes with everything inside it, and so do comments, CDATA, processing
// instructions and text that stands where a shape belongs.
function keepAllowed(el: Element): void {
  for (const attribute of [...el.attributes]) if (svgAttributeRefusal(attribute.name, attribute.value)) el.removeAttributeNode(attribute)
  for (const child of [...el.childNodes]) {
    if (isElement(child)) {
      // The name has to be SVG's and spelled without a prefix, because `svgRefusal` reads the
      // serialised name: `<html:path>` or a path in the XHTML namespace is not a path.
      if (child.namespaceURI === SVG_NAMESPACE && child.prefix === null && SVG_ELEMENTS.has(child.localName)) keepAllowed(child)
      else child.remove()
    } else if (child.nodeType === child.TEXT_NODE) {
      if (!SVG_TEXT_HOLDERS.has(el.localName) && /[^ \t\r\n]/.test(child.nodeValue ?? '')) child.remove()
    } else child.remove()
  }
}

// By node type rather than `instanceof Element`: a parsed document belongs to no window, and the
// `Element` in scope is the page's.
const isElement = (node: Node): node is Element => node.nodeType === node.ELEMENT_NODE
