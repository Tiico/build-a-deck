import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { fillBody, marksAt, openBullet, placeCaret, runCommand, tillStrang, NO_MARKS, type BodyMarks } from './body.js'
import { useRoving } from './roving.js'
import { lineKey } from './lineKeys.js'
import { useT } from '../i18n/index.js'

// Body-cellen (L39, #324). Samma cell stängd och öppen, och samma element: markören sätts i det
// som redan visar formen, och det är det som är att öppna cellen.
//
// **Stängd** visar den formen med ett tak på två rader — det som ryms som det är, resten utfasad.
// Taket sitter på `.byd-data-body` och aldrig på cellen: `max-height` på ett `<td>` hedras inte,
// en tabellcell växer med sitt innehåll oavsett, och prototypen mätte 101 px där 34 begärdes.
// L39 kallar det lösningens bärande del.
//
// **Öppen** får den ett huvud, och i huvudet står verktygen. De står där hela tiden cellen är
// öppen och rör sig aldrig: en rad som tonar fram vid fokus säger ingenting till den som ännu
// inte klickat. Raden är `role="toolbar"` med roving tabindex, samma `useRoving` som resten av
// editorns listor, och knapparnas `aria-pressed` följer markeringen.

export type BodyTool = 'bold' | 'italic' | 'list' | 'symbol'
const TOOLS: readonly BodyTool[] = ['bold', 'italic', 'list', 'symbol']
const PRESSED: Record<BodyTool, keyof BodyMarks | null> = { bold: 'bold', italic: 'italic', list: 'list', symbol: null }
const LABEL = { bold: 'table.body.bold', italic: 'table.body.italic', list: 'table.body.list', symbol: 'table.icon.insert' } as const
const GLYPH: Record<BodyTool, string> = { bold: 'F', italic: 'K', list: '•—', symbol: '{ }' }

export type BodyCellProps = {
  // Vad cellen heter för den som inte ser den: samma namn en vanlig cell bär, `<kort> <fält>`.
  label: string
  // Vad huvudet säger när cellen är öppen: fältet, och kortet det gäller.
  head: string
  value: string
  open: boolean
  // Projektets egna symboler som bilder, efter det namn `{namn}` skriver.
  icons: Record<string, string>
  // Vad designern skrev, läst ur elementen av `tillStrang` och ingenting annat. `at` är var
  // markören står räknat i strängens tecken, vilket klammerns symbollista frågar efter.
  onWrite(text: string, at: number): void
  onOpen(): void
  onClose(): void
  // Tangenterna symbollistan hör när den är öppen (E4) — samma lista och samma svar som i en
  // vanlig cell, hörd här av samma skäl: fokus stannar i meningen som skrivs.
  onListKey?: ((event: KeyboardEvent) => void) | undefined
  // `{ }`-knappen, med var markören står räknat i strängens tecken. Den öppnar listan som
  // tangenten `{` öppnar (E4, #33), eller stänger den om den stod öppen, och skriver ingenting:
  // det är först ett val i listan som skriver, där markören stod (#693).
  onSymbol?: ((at: number) => void) | undefined
  // Var markören ska stå efter en skrivning verktyget gjorde åt designern — en symbol tagen ur
  // listan. `null` när ingen sådan står på tur.
  caretAt?: number | null | undefined
  aria?: Record<string, string> | undefined
  // Out of the tab order in a row the hand is not standing in (#575): -1, or left as it is.
  tabIndex?: number | undefined
  children?: ReactNode
}

export function BodyCell({ label, head, value, open, icons, onWrite, onOpen, onClose, onListKey, onSymbol, caretAt, aria, tabIndex, children }: BodyCellProps) {
  const write = useRef<HTMLDivElement | null>(null)
  const [marks, setMarks] = useState<BodyMarks>(NO_MARKS)

  // Elementen är webbläsarens medan det skrivs i dem, inte Reacts: en `contenteditable` React
  // ritar om under handen tappar markören. Så de fylls bara när strängen som kommer in är en
  // annan än den som står i dem — det första bygget, och en ändring som kom någon annanstans
  // ifrån (D3). Det designern själv just skrev är per definition redan där.
  const wanted = useRef<number | null>(null)
  wanted.current = caretAt ?? wanted.current
  useLayoutEffect(() => {
    const el = write.current
    if (!el) return
    if (el.childElementCount > 0 && tillStrang(el).text === value) return
    const inside = el.contains(el.ownerDocument.activeElement)
    fillBody(el, value, icons)
    // Noderna markören stod i finns inte kvar. Stod den i cellen sätts den tillbaka: där
    // verktyget skrev, när verktyget skrev, och annars sist — en ändring som kom någon
    // annanstans ifrån (D3) har ingen plats att peka på.
    if (inside) placeCaret(el, wanted.current ?? tillStrang(el).text.length)
    wanted.current = null
  }, [value, icons])

  // `aria-pressed` följer markeringen, och markeringen ändras av allt: klick, piltangenter,
  // kommandon. Webbläsaren har en egen händelse för just det.
  useEffect(() => {
    if (!open) return setMarks(NO_MARKS)
    const el = write.current
    if (!el) return undefined
    const read = () => setMarks(marksAt(el, el.ownerDocument.getSelection()))
    read()
    const doc = el.ownerDocument
    doc.addEventListener('selectionchange', read)
    return () => doc.removeEventListener('selectionchange', read)
  }, [open])

  // Strängen och var markören står i den.
  const read = (el: HTMLElement) => {
    const caret = el.ownerDocument.getSelection()
    const at = caret && caret.anchorNode && el.contains(caret.anchorNode) ? { node: caret.anchorNode, offset: caret.anchorOffset } : null
    const { text, at: where } = tillStrang(el, at)
    return { text, at: where ?? text.length }
  }

  const said = () => {
    const el = write.current
    if (!el) return
    const { text, at } = read(el)
    onWrite(text, at)
  }

  const run = (command: string) => {
    const el = write.current
    if (!el) return
    el.focus()
    // Kommandot är webbläsarens eget och kan lämna vad den vill efter sig — en `<div>` där ett
    // stycke väntades, ett hårt mellanslag där ett mellanslag stod. Ingenting av det når
    // strängen: `tillStrang` är enda vägen ut, och den läser bara delmängden.
    runCommand(el, command)
  }

  const command = (tool: BodyTool) => {
    if (tool === 'symbol') {
      const el = write.current
      if (!el) return
      el.focus()
      return onSymbol?.(read(el).at)
    }
    run(tool === 'bold' ? 'bold' : tool === 'italic' ? 'italic' : 'insertUnorderedList')
    said()
    const el = write.current
    if (el) setMarks(marksAt(el, el.ownerDocument.getSelection()))
  }

  return (
    <div
      className="byd-data-bodycell"
      data-open={open ? 'true' : undefined}
      onFocus={onOpen}
      onBlur={(event) => {
        // Cellen är öppen så länge fokus står någonstans i den: verktygsraden hör till cellen,
        // och att gå från skrivytan till en knapp i huvudet är inte att lämna.
        if (!event.currentTarget.contains(event.relatedTarget)) onClose()
      }}
    >
      {open && (
        <div className="byd-data-bodyhead">
          <b>{head}</b>
          <BodyTools marks={marks} onCommand={command} />
        </div>
      )}
      <div
        ref={write}
        className="byd-data-body"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        onInput={() => {
          const el = write.current
          if (el) openBullet(el)
          said()
        }}
        // A paste is taken as its text (#479): the string only ever kept the subset the card can
        // draw, but the browser left the pasted markup — a table, a picture — standing in the cell.
        onPaste={(event) => {
          const el = write.current
          if (!el) return
          event.preventDefault()
          insertPlain(el, event.clipboardData.getData('text/plain'))
          said()
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && (event.key === 'b' || event.key === 'i')) {
            event.preventDefault()
            return command(event.key === 'b' ? 'bold' : 'italic')
          }
          onListKey?.(event)
          // Home and End within the line and never the table's box (#692), once the symbol list
          // — which has its own Home and End while it is open — has had them.
          if (!event.defaultPrevented) lineKey(event)
        }}
        {...aria}
        {...(tabIndex !== undefined ? { tabIndex } : {})}
      />
      {children}
    </div>
  )
}

// Verktygsraden: en tabbstopp in, piltangenter mellan knapparna (APG), och samma `useRoving`
// som editorns övriga listor — beteendet skrivs en gång och inte en gång till här.
function BodyTools({ marks, onCommand }: { marks: BodyMarks; onCommand(tool: BodyTool): void }) {
  const t = useT()
  const { itemProps } = useRoving({ ids: [...TOOLS], selected: null, orientation: 'horizontal' })
  return (
    <div className="byd-data-bodytools" role="toolbar" aria-label={t('table.body.tools')}>
      {TOOLS.map((tool) => {
        const { ref, ...rest } = itemProps(tool)
        const pressed = PRESSED[tool]
        return (
          <button
            key={tool}
            type="button"
            ref={ref}
            {...rest}
            data-tool={tool}
            aria-label={t(LABEL[tool])}
            {...(pressed ? { 'aria-pressed': marks[pressed] } : {})}
            // Ett tryck på en knapp får inte ta fokus ur skrivytan: markeringen kommandot gäller
            // är den som står där.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onCommand(tool)}
          >
            {GLYPH[tool]}
          </button>
        )
      })}
    </div>
  )
}

// Text put in where the caret stands, as the browser's own insertion would put it, and by hand
// where there is no such command to ask (a test's document has none).
function insertPlain(el: HTMLElement, text: string): void {
  const doc = el.ownerDocument
  if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text)) return
  const selection = doc.getSelection()
  const range = selection && selection.rangeCount > 0 && el.contains(selection.anchorNode) ? selection.getRangeAt(0) : null
  const node = doc.createTextNode(text)
  if (range) {
    range.deleteContents()
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
  } else {
    const last = el.lastElementChild ?? el
    last.appendChild(node)
  }
}
