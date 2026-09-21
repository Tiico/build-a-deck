import { PT_TO_MM, DEFAULT_LINE_HEIGHT, parseBody, type InlineNode } from '@byd/template'
import type { ProjectDoc } from './types.js'

// Body-cellen i Data (L39, #324). Redigeraren är ett lager över #308:s delmängd: den skriver och
// läser **samma sträng**, så CSV-rundturen och samtidig redigering (D3) ser ingen skillnad.
//
// Två riktningar och inget mer. `fillBody` gör strängen till semantiska element — `P I B UL LI`,
// det en skärmläsare hör formateringen på — och `tillStrang` är **enda vägen ut ur dem**. Att
// det är en enda funktion är inte städning utan garantin: allt en webbläsare hittar på inuti en
// `contenteditable` — en `<span style>` från `execCommand`, ett `&nbsp;` där ett mellanslag stod,
// en `<div>` där ett stycke väntades — passerar den här läsaren och kommer ut som delmängden
// eller inte alls. Cellens lagrade sträng kan därför inte bära dolda tecken eller HTML-fragment.
//
// Ingenting här rör `innerHTML`. Trädet byggs nod för nod, så en `<b>` designern skriver är text
// i en textnod precis som i `parseBody` (#308) — en säkerhetsgräns, eftersom cellen går vidare in
// i den Chromium som renderar trycket.

// Vilka kolumner som är body-kolumner. Frågan ställs till mallen och aldrig till kolumnens namn:
// `body` är bara ordet guiden föreslår, och designern skriver över det (`suggestFieldKey`). Det
// som skiljer en body från en rubrik är vad rutan kan *visa*: ett stycke eller en punktlista
// behöver två rader, och en titelruta som rymmer en rad kan inte visa någondera hur texten än
// märks upp. Delmängden gäller ändå överallt — strängen är strängen — men verktygen står där de
// har någon verkan.
//
// Måttet är elementets egna: rutans höjd i millimeter mot två rader av dess egen grad. `shrink`
// (E6) kan krympa texten tills fler rader ryms, men det är en nödutgång och inte vad rutan är
// ritad för, så det är den skrivna graden som svarar.
export const BODY_LINES = 2

// Rutan en kolumn mäts mot: dess höjd i millimeter och höjden på en rad av dess egen grad. En
// kolumn kan ritas av flera element — fram och bak, i ett villkor, i en grupp — och då är det
// den generösaste rutan som svarar, eftersom det är den som kan visa ett stycke. En kolumn
// mallen inte ritar alls har ingen ruta, vilket är något annat än en ruta som inte räcker.
export type FieldBox = { h: number; line: number }

export function boxesOf(doc: ProjectDoc): Record<string, FieldBox> {
  const out: Record<string, FieldBox> = {}
  const walk = (els: ProjectDoc['template']['faces'][string]['base']) => {
    for (const el of els) {
      if (el.kind === 'text' && 'field' in el.bind) {
        const line = el.font.sizePt * PT_TO_MM * (el.font.lineHeight ?? DEFAULT_LINE_HEIGHT)
        const had = out[el.bind.field]
        if (!had || el.h / line > had.h / had.line) out[el.bind.field] = { h: el.h, line }
      }
      if (el.kind === 'if' || el.kind === 'group') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  return out
}

// Vad höjden **föreslår** (L43, #362). Det här är regeln som var hela sanningen fram till #362
// och som fortfarande är förvalet: en ruta som rymmer två rader kan visa ett stycke eller en
// punkt, och en som inte gör det kan det inte hur texten än märks upp.
export function bodyFieldsOf(doc: ProjectDoc): string[] {
  return Object.entries(boxesOf(doc))
    .filter(([, box]) => box.h >= BODY_LINES * box.line)
    .map(([field]) => field)
}

// Vad kolumnen **är** (L43, #362). Höjden föreslår, designern avgör: ett uttryckligt val i
// dokumentet väger över förslaget, och en kolumn utan val följer höjden — vilket är varför varje
// lek som fanns före #362 beter sig precis som den gjorde.
export function proseFieldsOf(doc: ProjectDoc): string[] {
  const suggested = bodyFieldsOf(doc)
  const chosen = doc.prose ?? {}
  const every = [...suggested, ...Object.keys(chosen).filter((f) => !suggested.includes(f))]
  return every.filter((f) => chosen[f] ?? true)
}

// Vad designern själv har sagt om kolumnen, och `null` när hon inte har sagt något. Skillnaden
// mellan förval och val bärs i form i ytan (L43), så den måste gå att ställa som en egen fråga.
export function proseChoiceOf(doc: ProjectDoc, field: string): boolean | null {
  return doc.prose?.[field] ?? null
}

// Klassen en symbol bärs av inuti redigeraren, och attributet som är dess namn. Namnet står i
// attributet och aldrig i det som ritas: vad chippet visar är en bild eller ett ord, och vad
// strängen får är `{namn}` — så de två kan inte komma i otakt.
export const SYMBOL_CLASS = 'byd-body-symbol'
const SYMBOL_NAME = 'data-symbol'
const SYMBOL_ROLE = 'data-role'

// Vad en symbol ritas som i cellen: projektets egen bild när den har en, annars namnet. Bilden
// får inget eget alternativ — chippet bär namnet i sitt attribut och läses upp av titeln — och
// den är `contenteditable="false"`, så markören hoppar över den som ett tecken.
export function symbolChip(document: Document, name: string, role: string | undefined, url: string | undefined): HTMLElement {
  const chip = document.createElement('span')
  chip.className = SYMBOL_CLASS
  chip.setAttribute(SYMBOL_NAME, name)
  if (role) chip.setAttribute(SYMBOL_ROLE, role)
  chip.setAttribute('contenteditable', 'false')
  chip.title = role ? `{${name}|${role}}` : `{${name}}`
  if (url) {
    const img = document.createElement('img')
    img.src = url
    img.alt = name
    chip.append(img)
  } else chip.textContent = name
  return chip
}

// Strängen som element. Tomt är ett tomt stycke och inte ingenting: en `contenteditable` utan
// blockelement låter webbläsaren hitta på ett eget när Enter trycks, och då är det inte längre
// delmängden som skrivs.
export function fillBody(el: HTMLElement, text: string, icons: Record<string, string> = {}): void {
  const doc = el.ownerDocument
  el.replaceChildren()
  const span = (nodes: readonly InlineNode[], into: Node) => {
    for (const n of nodes) into.appendChild(inline(doc, n, icons))
    if (!into.hasChildNodes()) into.appendChild(doc.createElement('br'))
  }
  for (const block of parseBody(text)) {
    if (block.type === 'paragraph') {
      const p = doc.createElement('p')
      span(block.children, p)
      el.append(p)
    } else {
      const ul = doc.createElement('ul')
      for (const item of block.items) {
        const li = doc.createElement('li')
        span(item, li)
        ul.append(li)
      }
      el.append(ul)
    }
  }
  if (!el.hasChildNodes()) {
    const p = doc.createElement('p')
    p.append(doc.createElement('br'))
    el.append(p)
  }
}

function inline(doc: Document, n: InlineNode, icons: Record<string, string>): Node {
  switch (n.type) {
    case 'text':
      return doc.createTextNode(n.text)
    case 'icon':
      return symbolChip(doc, n.name, n.role, icons[n.name])
    case 'bold':
    case 'italic': {
      const el = doc.createElement(n.type === 'bold' ? 'strong' : 'em')
      for (const c of n.children) el.appendChild(inline(doc, c, icons))
      return el
    }
    // En referens (B7) hör regelboken till och når aldrig ett kort; `parseBody` läser inga, så
    // den här grenen kan bara nås av ett träd någon byggt för hand. Den säger vad den är.
    case 'ref':
      return doc.createTextNode(`[[${n.of}:${n.id}]]`)
  }
}

// Var markören står, i strängens egna tecken. `null` när den inte står i det här elementet.
export type Caret = { node: Node; offset: number }

// **Enda vägen ut ur redigerarens element.** Ingenting annat får läsa dem, och ingenting annat
// får skriva cellens värde.
//
// Med en markör svarar den också var markören står *i strängen*, vilket är vad klammerns
// symbollista behöver för att fråga samma fråga som i en vanlig cell (E4): den räknar i tecken
// och vet ingenting om noder.
export function tillStrang(el: HTMLElement, caret?: Caret | null): { text: string; at: number | null } {
  const out: string[] = []
  let at: number | null = null
  let length = 0
  const write = (s: string) => {
    out.push(s)
    length += s.length
  }
  // En webbläsare skriver ett hårt mellanslag (U+00A0) där ett vanligt annars fallit bort. Det är
  // ett dolt tecken och får inte nå strängen: det är ett mellanslag, och skrivs som ett.
  const plain = (s: string) => s.replace(/\u00a0/g, ' ')
  const mark = (node: Node, offset: number) => {
    if (!caret || at !== null) return
    if (caret.node === node && caret.offset === offset) at = length
  }
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = plain(node.textContent ?? '')
      if (caret && caret.node === node) at ??= length + plain((node.textContent ?? '').slice(0, caret.offset)).length
      write(text)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as Element
    const name = element.getAttribute(SYMBOL_NAME)
    if (name) {
      const role = element.getAttribute(SYMBOL_ROLE)
      write(role ? `{${name}|${role}}` : `{${name}}`)
      return
    }
    const tag = element.tagName
    // En `<br>` sist i ett block är webbläsarens egen fyllnad och inget tecken; en mitt i är den
    // enkla radbrytning delmängden läser som en radbrytning inuti stycket.
    if (tag === 'BR') {
      if (element.nextSibling) write('\n')
      return
    }
    // En lista var som helst är en lista. Chromium lägger sin `<ul>` inuti stycket markören
    // stod i — `<p><ul><li>…` — vilket varken är giltig HTML eller något den här sidan skrev,
    // och en lista som bara känns igen överst hade då lästs som ett stycke med punkterna
    // hopskrivna. Mätt i Chromium.
    if (tag === 'UL') {
      items(element)
      return
    }
    // Fet och kursiv kan komma som stil i stället för som element. `runCommand` slår av
    // `styleWithCSS` för det tjänsten själv gör, men en inklistrad text, en annan webbläsare
    // eller ett kommando någon annan kört bär `<span style="font-weight: bold">` — och en
    // markering som bara känns igen på sitt elementnamn hade tappats tyst. Stilen läses bara
    // där den står skriven, aldrig uträknad: ärvd stil är inte den här nodens markering.
    const style = (element as HTMLElement).style
    const bold = tag === 'B' || tag === 'STRONG' || style?.fontWeight === 'bold' || Number(style?.fontWeight) >= 600
    const italic = tag === 'I' || tag === 'EM' || style?.fontStyle === 'italic'
    const wrap = bold ? '**' : italic ? '*' : ''
    // En tom markering är ingen markering: `****` är fyra asterisker i strängen och inte fet text.
    const pieces = out.length
    const before = length
    if (wrap) write(wrap)
    kids(element)
    if (!wrap) return
    if (length === before + wrap.length) {
      out.length = pieces
      length = before
    } else write(wrap)
  }
  // Punkterna, skrivna på ett ställe: en rad var, med sitt streck. Både blocket och `walk` går
  // hit, så en lista ser likadan ut vare sig webbläsaren la den överst eller inuti ett stycke.
  const items = (list: Element) => {
    for (const [j, li] of [...list.children].entries()) {
      if (j > 0) write('\n')
      write('- ')
      kids(li)
    }
  }
  const kids = (element: Element) => {
    const nodes = [...element.childNodes]
    for (const [i, child] of nodes.entries()) {
      mark(element, i)
      walk(child)
    }
    mark(element, nodes.length)
  }
  // Blocken: en `<ul>` är en punktlista, allt annat på den här nivån är ett stycke. Det gäller
  // också det webbläsaren själv lägger dit — en `<div>` eller en naken textnod — så ett stycke
  // är ett stycke vilket element den råkade välja.
  const blocks = [...el.childNodes]
  let any = false
  for (const [i, block] of blocks.entries()) {
    mark(el, i)
    const pieces = out.length
    const start = length
    if (any) write('\n\n')
    const list = block.nodeType === Node.ELEMENT_NODE ? ((block as Element).tagName === 'UL' ? (block as Element) : (block as Element).querySelector('ul')) : null
    // Blocket *är* listan när det inte bär något annat än den. Bär det text också är det ett
    // stycke som råkar ha en lista i sig, och då skriver `walk` båda i den ordning de står.
    if (list && (block.textContent ?? '') === (list.textContent ?? '')) items(list)
    else walk(block)
    // Ett block utan tecken bär inget stycke: fyllnadsraden i en tom cell, och det tomma stycke
    // en webbläsare kan lämna efter sig, är ingenting strängen ska minnas.
    if (length === start + (any ? 2 : 0)) {
      out.length = pieces
      length = start
    } else any = true
  }
  mark(el, blocks.length)
  const text = out.join('')
  return { text, at: caret ? Math.min(at ?? text.length, text.length) : null }
}

// Vad strängen blir när den gått en gång genom elementen. En sträng som redan är delmängdens
// egen form kommer ut tecken för tecken som den gick in; en som inte är det — `- ` direkt under
// en rad text, som `parseBody` ändå läser som en lista — kommer ut i den form kortet ritas i.
// Den som aldrig rörs skrivs aldrig om: cellen skriver bara när någon skriver i den.
export function canonicalBody(text: string, document: Document): string {
  const el = document.createElement('div')
  fillBody(el, text)
  return tillStrang(el).text
}

// `- ` först på en rad börjar en lista, precis som i strängen. Det som gör listan är
// webbläsarens eget listkommando, så punkten ritas av `<ul>` och inte av två tecken som blir
// kvar i texten. Svarar om raden blev en punkt.
//
// Den bor här och inte i komponenten för att det är DOM-arbete i en `contenteditable`, och allt
// sådant måste gå att ställa till en riktig webbläsare: jsdom har ingen `contenteditable`, och ett
// prov som låtsades ha det vore grönt utan att betyda något.
export function openBullet(el: HTMLElement): boolean {
  const doc = el.ownerDocument
  const caret = doc.getSelection()
  const node = caret?.anchorNode
  if (!caret || !node || node.nodeType !== Node.TEXT_NODE) return false
  if (!/^-[ \u00a0]$/.test(node.textContent ?? '') || caret.anchorOffset !== 2) return false
  if ((node.parentElement as Element | null)?.closest('li')) return false
  // De två tecknen tas med webbläsarens eget raderkommando och inte genom att tömma noden: en
  // nod som töms under markören lämnar den utan plats att stå på, och listan hamnade då i
  // stycket ovanför. Mätt i Chromium.
  doc.execCommand?.('delete')
  doc.execCommand?.('delete')
  runCommand(el, 'insertUnorderedList')
  return true
}

// Vad ett verktyg gör, kört som webbläsarens eget kommando. `styleWithCSS` slås av först, och det
// är inte en formalitet: med den på skriver Chromium `<span style="font-weight: bold">` i stället
// för `<b>`, och då hör ingen skärmläsare att texten är fet — och `tillStrang`, som bara läser
// delmängdens element, hade tappat markeringen tyst. Mätt i Chromium.
export function runCommand(el: HTMLElement, command: string): void {
  const doc = el.ownerDocument
  doc.execCommand?.('styleWithCSS', false, 'false')
  doc.execCommand?.(command)
}

// Vad markeringen står i, som verktygsknapparnas `aria-pressed` följer.
export type BodyMarks = { bold: boolean; italic: boolean; list: boolean }
export const NO_MARKS: BodyMarks = { bold: false, italic: false, list: false }

export function marksAt(el: HTMLElement, selection: Selection | null): BodyMarks {
  const node = selection?.anchorNode
  if (!node || !el.contains(node)) return NO_MARKS
  const marks = { ...NO_MARKS }
  for (let at: Node | null = node; at && at !== el; at = at.parentNode) {
    if (at.nodeType !== Node.ELEMENT_NODE) continue
    const tag = (at as Element).tagName
    if (tag === 'B' || tag === 'STRONG') marks.bold = true
    if (tag === 'I' || tag === 'EM') marks.italic = true
    if (tag === 'LI' || tag === 'UL') marks.list = true
  }
  return marks
}

// Markören satt på en plats i strängen, räknad i dess egna tecken. Det är `tillStrang` baklänges,
// och används där verktyget skrev åt designern — en symbol taget ur listan — så att skrivandet
// fortsätter där symbolen slutade i stället för sist i cellen.
export function placeCaret(el: HTMLElement, at: number): void {
  const doc = el.ownerDocument
  const selection = doc.getSelection()
  if (!selection) return
  let left = at
  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (left <= text.length) return { node, offset: left }
      left -= text.length
      return null
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null
    const element = node as Element
    if (element.getAttribute(SYMBOL_NAME)) {
      // Ett chip är en nod i DOM:en och flera tecken i strängen; går markören in i det landar den
      // efter det, vilket är var den hör hemma när symbolen just skrevs.
      const role = element.getAttribute(SYMBOL_ROLE)
      const own = (role ? `{${element.getAttribute(SYMBOL_NAME)}|${role}}` : `{${element.getAttribute(SYMBOL_NAME)}}`).length
      if (left <= own) return { node: element.parentNode ?? el, offset: [...(element.parentNode?.childNodes ?? [])].indexOf(element) + 1 }
      left -= own
      return null
    }
    for (const child of [...element.childNodes]) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  // Mellanrummen mellan block och punkter kostar tecken i strängen men finns inte som noder;
  // de dras av här, i samma ordning som `tillStrang` skriver dem.
  let any = false
  for (const block of [...el.childNodes]) {
    if (any) left -= 2
    if (block.nodeType === Node.ELEMENT_NODE && (block as Element).tagName === 'UL') {
      for (const [j, li] of [...(block as Element).children].entries()) {
        if (j > 0) left -= 1
        left -= 2
        const found = walk(li)
        if (found) return set(selection, found)
      }
    } else {
      const found = walk(block)
      if (found) return set(selection, found)
    }
    any = true
  }
  const last = el.lastChild
  if (last) set(selection, { node: last, offset: last.childNodes.length })
}

function set(selection: Selection, at: { node: Node; offset: number }): void {
  const range = (at.node.ownerDocument ?? (at.node as Document)).createRange()
  try {
    range.setStart(at.node, at.offset)
  } catch {
    return
  }
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}
