// @vitest-environment jsdom
// Att släppa bildfiler där en bild kan väljas (#291, L22, variant B).
//
// Mönstret är ett och samma på tre ytor: bibliotekets bildyta i Media, det aktuella bildfältet i
// Data — cellens ruta och massredigeringens — och guidens bildfält. Filväljaren, formatreglerna
// och återkopplingen är dragflödets egna; det är samma väg in, öppnad två gånger.
//
// Det som skiljer ytorna åt är hur många filer de tar emot. Media tar en batch; ett enskilt
// bildfält tar en bild, och flera filer på ett sådant fält är en fråga utan svar — vilken av dem
// skulle fältet få? Tyst första fil är det enda svaret som är fel, för det är det enda som ser ut
// som ett svar.
//
// Här står ytornas gemensamma regler. Bibliotekets batch har sin egen fil (`media-batch`), där
// den mäts mot en riktig tjänst; det som går att avgöra utan nätverk står här.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DataTable } from '../src/editor/DataTable.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const HASH = 'c'.repeat(64)
const LANDED = 'd'.repeat(64)

// PNG-signaturen först, eftersom grinden läser filen och aldrig dess namn (#204). Filerna skiljer
// sig efter den, så «en annan bild» är en fråga om byte och inte om vad filen hette.
const png = (name: string, tail: number[]): File => new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...tail])], name, { type: 'image/png' })

// En `DataTransfer` som ett släpp verkligen bär den: antingen en biblioteksbild under sitt eget
// dragtypnamn, eller filer — aldrig båda, för det är just skillnaden ytan måste kunna göra.
const dropping = (what: { hash?: string; files?: File[] }) => ({
  getData: (type: string) => (type === 'text/x-byd-asset' ? (what.hash ?? '') : ''),
  files: what.files ?? [],
  types: what.hash ? ['text/x-byd-asset'] : what.files?.length ? ['Files'] : [],
})

function deckWithArt() {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rows[0]!.fields['art'] = `asset:${HASH}`
  return doc
}

function table(over: Partial<Parameters<typeof DataTable>[0]> = {}) {
  const onCell = vi.fn()
  const onUpload = vi.fn(async () => LANDED)
  render(
    <DataTable
      doc={deckWithArt()}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={onCell}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
      assetBase="http://api.local"
      onUpload={onUpload}
      {...over}
    />,
  )
  return { onCell, onUpload }
}

describe('ett enskilt bildfält tar en bild (#291)', () => {
  it('lämnar cellen orörd när flera filer släpps på den, och säger vad som hände', () => {
    const { onCell, onUpload } = table()
    const cell = within(screen.getAllByRole('row')[2]!).getByLabelText('Bild för knight')

    fireEvent.drop(cell, { dataTransfer: dropping({ files: [png('skog.png', [1]), png('berg.png', [2])] }) })

    // Ingen av dem laddas upp och ingen av dem skrivs: det som inte går att svara på svaras inte
    // på till hälften.
    expect(onUpload).not.toHaveBeenCalled()
    expect(onCell).not.toHaveBeenCalled()
    // Och beskedet är ett besked: antalet filer, och att fältet står kvar som det var.
    expect(screen.getByRole('alert').textContent).toBe('Ett bildfält tar en bild i taget. 2 filer släpptes, och fältet står kvar som det var.')
  })

  it('säger samma sak i massredigeringens bildruta, som är ett fält och inte ett bibliotek', () => {
    const { onUpload } = table()
    fireEvent.click(screen.getByLabelText('markera knight'))
    fireEvent.change(within(screen.getByRole('toolbar', { name: 'Markerade kort' })).getByLabelText('Kolumn'), { target: { value: 'art' } })
    const slot = within(screen.getByRole('toolbar', { name: 'Markerade kort' })).getByLabelText('Bild för de markerade korten')

    fireEvent.drop(slot, { dataTransfer: dropping({ files: [png('skog.png', [1]), png('berg.png', [2])] }) })

    expect(onUpload).not.toHaveBeenCalled()
    expect(screen.queryByRole('img', { name: 'Bild för de markerade korten' })).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe('Ett bildfält tar en bild i taget. 2 filer släpptes, och fältet står kvar som det var.')
  })
})

describe('guidens bildfält tar emot ett släpp (#291)', () => {
  const open = () => {
    history.replaceState(null, '', '/new')
    render(<NewProjectPage onNavigate={() => undefined} />)
  }

  it('lägger den släppta bilden i det fält som tog emot den', async () => {
    open()

    fireEvent.drop(screen.getByRole('group', { name: 'Bild för Illustration' }), { dataTransfer: dropping({ files: [png('drake.png', [1])] }) })

    // Samma väg in som filväljarens: fältet visar bilden, och ingenting annat har rört sig.
    expect(await screen.findByRole('img', { name: 'Förhandsvisning av Illustration' })).toBeTruthy()
  })

  it('lämnar fältet orört när flera filer släpps på det', async () => {
    open()

    fireEvent.drop(screen.getByRole('group', { name: 'Bild för Illustration' }), { dataTransfer: dropping({ files: [png('drake.png', [1]), png('borg.png', [2])] }) })

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Ett bildfält tar en bild i taget. 2 filer släpptes, och fältet står kvar som det var.')
    expect(screen.queryByRole('img', { name: 'Förhandsvisning av Illustration' })).toBeNull()
  })
})

describe('markeringen medan ett drag står över en yta (#291)', () => {
  it('lyser på den yta draget står över, säger vad den tar emot, och slocknar när draget lämnar', () => {
    table()
    const cell = within(screen.getAllByRole('row')[2]!).getByLabelText('Bild för knight')
    const other = within(screen.getAllByRole('row')[3]!).getByLabelText('Bild för wizard')

    fireEvent.dragOver(cell, { dataTransfer: dropping({ files: [png('skog.png', [1])] }) })

    // Markeringen är cellens egen. Att två rutor lyste samtidigt vore ett löfte om att två mål
    // väntar på samma släpp.
    expect(cell.getAttribute('data-over')).toBe('true')
    expect(other.getAttribute('data-over')).toBeNull()
    // Ramen säger att något kan släppas; texten säger vad.
    expect(cell.textContent).toContain('Tar emot en bild')

    fireEvent.dragLeave(cell)
    expect(cell.getAttribute('data-over')).toBeNull()
    expect(cell.textContent).not.toContain('Tar emot en bild')
  })

  it('slocknar också när släppet är gjort', () => {
    table()
    const cell = within(screen.getAllByRole('row')[2]!).getByLabelText('Bild för knight')

    fireEvent.dragOver(cell, { dataTransfer: dropping({ files: [png('skog.png', [1])] }) })
    fireEvent.drop(cell, { dataTransfer: dropping({ files: [png('skog.png', [1])] }) })

    expect(cell.getAttribute('data-over')).toBeNull()
  })

  it('låter inte webbläsaren öppna den släppta filen som en ny sida', () => {
    table()
    const cell = within(screen.getAllByRole('row')[2]!).getByLabelText('Bild för knight')

    // `fireEvent` svarar falskt när något tog hand om händelsen. Utan det svaret navigerar
    // webbläsaren bort från verktyget och tar formgivarens osparade arbete med sig.
    expect(fireEvent.dragOver(cell, { dataTransfer: dropping({ files: [png('skog.png', [1])] }) })).toBe(false)
    expect(fireEvent.drop(cell, { dataTransfer: dropping({ files: [png('skog.png', [1])] }) })).toBe(false)
  })

  it('skiljer en biblioteksbild från en fil: den återanvänds utan ny uppladdning', () => {
    const { onCell, onUpload } = table()
    const cell = within(screen.getAllByRole('row')[3]!).getByLabelText('Bild för wizard')

    fireEvent.drop(cell, { dataTransfer: dropping({ hash: HASH }) })

    expect(onUpload).not.toHaveBeenCalled()
    expect(onCell).toHaveBeenCalledWith('wizard', 'art', `asset:${HASH}`)
  })
})
