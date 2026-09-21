import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { fillBody, marksAt, openBullet, placeCaret, runCommand, tillStrang, NO_MARKS, type BodyMarks } from './body.js'
import { useRoving } from './roving.js'
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
// Tecknet som öppnar symbollistan (L2, E4). Det är ett och samma vare sig det skrivs eller trycks.
const BRACE = '{'

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
  // Vad `{ }`-knappen gör. Svarar den `true` var trycket listans eget — den stod öppen och
  // stängdes — och ingen klammer skrivs. Annars skriver knappen en klammer där markören står,
  // vilket är exakt vad tangenten `{` gör (E4, #33): en klammer, och listan öppen.
  //
  // Det rail-knappen i en vanlig cell gör som den här inte gör är att ta tillbaka sin egen
  // klammer vid ett andra tryck (#236). I en skrivyta med stycken och punkter är Backsteg redan
  // det självklara sättet att ta bort ett tecken, och en knapp som raderar i texten under handen
  // är mer överraskande där än i ett enradigt fält.
  onSymbol?: (() => boolean) | undefined
  // Var markören ska stå efter en skrivning verktyget gjorde åt designern — en symbol tagen ur
  // listan. `null` när ingen sådan står på tur.
  caretAt?: number | null | undefined
  aria?: Record<string, string> | undefined
  children?: ReactNode
}

export function BodyCell({ label, head, value, open, icons, onWrite, onOpen, onClose, onListKey, onSymbol, caretAt, aria, children }: BodyCellProps) {
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

  const said = () => {
    const el = write.current
    if (!el) return
    const caret = el.ownerDocument.getSelection()
    const at = caret && caret.anchorNode && el.contains(caret.anchorNode) ? { node: caret.anchorNode, offset: caret.anchorOffset } : null
    const { text, at: where } = tillStrang(el, at)
    onWrite(text, where ?? text.length)
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
      if (onSymbol?.()) return
      const el = write.current
      if (!el) return
      el.focus()
      el.ownerDocument.execCommand?.('insertText', false, BRACE)
      return said()
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
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && (event.key === 'b' || event.key === 'i')) {
            event.preventDefault()
            return command(event.key === 'b' ? 'bold' : 'italic')
          }
          onListKey?.(event)
        }}
        {...aria}
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
