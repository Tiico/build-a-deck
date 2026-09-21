// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openBord(): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  // Ask the fixture whether it is answering before standing the editor up (#149). The editor
  // opens a project with a single `fetch` and keeps no second attempt, so a surface that loses
  // that one request stands on the disconnected screen for the rest of the test — and then the
  // word waited for below never comes. Seen once under a full gate run: «Spara» was not there,
  // and neither was anything else the editor draws. The word stays, saying only what it can say.
  await run.answering()
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
}
// Sparar, och lämnar ytan i vila.
//
// Knappen har tre lägen och bara två namn, vilket är vad som gör ett sparande i ett test lurigt:
// medan begäran är i luften heter den «Sparar…» och är spärrad, i vila heter den «Spara» och är
// *också* spärrad, och bara med något osparat är den «Spara» och tryckbar. Ett `fireEvent.click`
// på den spärrade gör ingenting alls — tyst — så ett test som klickar för tidigt får ingen
// knapp, eller ett klick som inte händer, och faller långt senare på en revision som aldrig kom.
//
// Att vänta på serverns revision räcker inte: den stiger när servern har skrivit, medan svaret
// fortfarande är på väg tillbaka. Landar det svaret efter nästa ändring skrivs ändringen över,
// och ytan står i vila med något som aldrig sparades. Det är exakt så «expected 2 to be 3» såg
// ut. Väntan hör därför hemma på klienten och inte på servern (#366, #370).
//
// Så: kräv att knappen är tryckbar innan den trycks — ett tyst klick blir ett läsbart fel i
// stället för en gåta — och vänta efter klicket tills den är «Spara» och spärrad igen, vilket är
// det enda läge som betyder både «inte mitt i ett sparande» och «ingenting kvar osparat».
const saveButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Spara' }) as HTMLButtonElement

async function spara(): Promise<void> {
  const button = (await screen.findByRole('button', { name: 'Spara' })) as HTMLButtonElement
  expect(button.disabled).toBe(false)
  fireEvent.click(button)
  await waitFor(() => expect(saveButton().disabled).toBe(true))
}
const handle = (id: string) => document.querySelector(`[data-zone-handle="${id}"]`) as HTMLElement
const row = (id: string) => document.querySelector(`[data-zone-row="${id}"]`) as HTMLElement
// Raderna i listan. En zonfamilj står som `hand:*` (#175): samma zon vid var sin plats är en
// rad, och platserna under den när någon fällt ut den.
const rows = () =>
  [...document.querySelectorAll('[data-zone-row], [data-zone-family]')].map((el) => el.getAttribute('data-zone-row') ?? `${el.getAttribute('data-zone-family')}:*`)

// Bordet är designerns (B5, reviderat). Listan är vägen in till varje zon — också de som ligger
// under varandra på filten, där ett handtag bakom ett annat inte ens går att träffa.
describe('the setup editor (B5, K2): the list of zones', () => {
  it('lists every zone with its own, and takes one off the table when it is removed', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    // I dokumentets egen ordning, för den ordningen betyder något: ett släpp landar i den minsta
    // zonen, och mellan lika stora i den som står först (K2).
    expect(rows()).toEqual(['draw', 'discard', 'table', 'hand:*'])
    // Vid platserna är raden familjens (#175): platserna står under den när någon fällt ut den.
    fireEvent.click(screen.getByRole('button', { name: 'Hand 2 platser' }))
    expect(rows()).toEqual(['draw', 'discard', 'table', 'hand:*', 'hand:A', 'hand:B'])
    expect(row('hand:A').textContent).toMatch(/A/)

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Kasthög' }))
    expect(rows()).toEqual(['draw', 'table', 'hand:*', 'hand:A', 'hand:B'])
    expect(handle('discard')).toBeNull()
    expect(document.querySelector('[data-table] [data-zone="discard"]')).toBeNull()

    await spara()
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    expect((await run.projects.load(run.projectId))?.setup.zones.some((z) => z.id === 'discard')).toBe(false)
  })
})

// Tre zoner står fast, och var och en av sitt eget skäl (B5, reviderat). Leken är den enda som går
// att lösa upp: den är en roll en hög bär, inte en zon, så den kan flytta — och då går högen den
// låg i att ta bort som vilken annan som helst.
describe('the setup editor (B5, K2): what the table cannot be without', () => {
  it('says why the felt, a hand and the deck’s pile stay, and lets the deck move so its pile can go', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    expect(screen.queryByRole('button', { name: 'Ta bort Spelyta' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ta bort Draghög' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ta bort Hand' })).toBeNull()
    expect(row('table').textContent).toMatch(/fast/)

    fireEvent.click(within(row('draw')).getByRole('button', { name: /Draghög/ }))
    expect(screen.getByText(/Lägg leken i en annan hög först/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hand 2 platser' }))
    expect(within(row('hand:A')).getByLabelText(/En plats är en hand/)).toBeTruthy()

    // En egen hög tar rollen; först då går draghögen att ta bort.
    fireEvent.click(screen.getByRole('button', { name: '＋ Hög' }))
    fireEvent.change(screen.getByLabelText('Namn för Hög 1'), { target: { value: 'Leken' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lägg leken i Leken' }))
    expect(row('hog-1').textContent).toMatch(/leken/)
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Draghög' }))
    expect(handle('draw')).toBeNull()
    // Och korten ligger i den nya leken: bordet går att bygga, och högen räknar dem.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.querySelector('[data-table] [data-zone="hog-1"]')).toBeTruthy()

    await spara()
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    const stored = await run.projects.load(run.projectId)
    expect(stored?.setup.deckZone).toBe('hog-1')
    expect(stored?.setup.zones.filter((z) => z.kind === 'hand').map((z) => z.returnTo)).toEqual(['hog-1', 'hog-1'])
  })
})

// Filten och listan är en och samma markering: det man tar tag i på filten öppnar sin rad, och
// Delete gäller den — bunden till fönstret, eftersom ett handtag aldrig har fokus (pekaren som
// markerar det är pekaren som börjar draget).
describe('the setup editor (B5, K2): the felt, the list and the key', () => {
  it('opens the row for a zone picked on the felt, takes it away with Delete, and puts it back with Ångra', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    fireEvent.click(handle('discard'))
    expect(row('discard').getAttribute('data-open')).toBe('true')
    expect(screen.getByLabelText('Genväg för Kasthög')).toBeTruthy()

    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(row('discard')).toBeNull()
    expect(screen.getByText(/Kasthög är borttagen/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ångra' }))
    expect(row('discard')).toBeTruthy()
    expect(handle('discard')).toBeTruthy()

    // Delete i ett fält är ett tecken och inte en zon.
    fireEvent.click(handle('discard'))
    const name = screen.getByLabelText('Namn för Kasthög') as HTMLInputElement
    name.focus()
    fireEvent.keyDown(name, { key: 'Delete' })
    expect(row('discard')).toBeTruthy()

    // Och det som står fast står fast också för tangenten.
    fireEvent.click(handle('hand:A'))
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(row('hand:A')).toBeTruthy()
  })
})

// Platsratten är det enda receptet har kvar, och den lägger inget tillbaka. Motsatsen till att ta
// bort en zon per plats är att ge platserna en igen — i ett steg, för det är en sak designern gör.
describe('the setup editor (B5, K2): the seats knob, and giving the seats a zone again', () => {
  it('lays a new seat out like the others, keeps what was removed removed, and gives every seat a zone back in one step', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Kasthög' }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(screen.getByRole('button', { name: '3', pressed: true })).toBeTruthy()
    // Den nya platsen syns på familjeraden innan någon fällt ut den (#175).
    expect(screen.getByRole('button', { name: 'Hand 3 platser' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hand 3 platser' }))
    expect(row('hand:C')).toBeTruthy()
    expect(document.querySelector('[data-table] .byd-hand[data-zone="hand:C"]')).toBeTruthy()
    // Kasthögen är borta, och den kommer inte tillbaka för att någon vrider på platsantalet.
    expect(row('discard')).toBeNull()

    // En räknare utan räknarzon lägger inga brickor på bordet, och panelen säger det.
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknare' }))
    expect(screen.getByText(/Ingen plats har någon räknarzon/)).toBeTruthy()
    expect(document.querySelectorAll('[data-table] [data-counter-token]')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '＋ Räknarzon per plats' }))
    expect(rows()).toEqual(expect.arrayContaining(['counters:*']))
    fireEvent.click(screen.getByRole('button', { name: 'Räknare 3 platser' }))
    expect(rows()).toEqual(expect.arrayContaining(['counters:A', 'counters:B', 'counters:C']))
    expect(screen.queryByText(/Ingen plats har någon räknarzon/)).toBeNull()
    expect(document.querySelectorAll('[data-table] [data-counter-token]')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: '＋ Yta per plats' }))
    expect(rows()).toEqual(expect.arrayContaining(['mine:*']))
    fireEvent.click(screen.getByRole('button', { name: 'Framför 3 platser' }))
    expect(rows()).toEqual(expect.arrayContaining(['mine:A', 'mine:B', 'mine:C']))
    // Telefonens ark är en plats (C4): verbet står där en gång, inte en gång per plats.
    // Arket står hopfällt tills det efterfrågas (#301).
    fireEvent.click(screen.getByRole('button', { name: 'Visa spelarvyn' }))
    expect(screen.getAllByText('Framför mig', { selector: '[data-sheet-preview] span' })).toHaveLength(1)

    await spara()
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    const stored = await run.projects.load(run.projectId)
    expect(stored?.setup.zones.map((z) => z.id)).toEqual(expect.arrayContaining(['counters:C', 'mine:C', 'hand:C']))
    expect(stored?.setup.zones.some((z) => z.id === 'discard')).toBe(false)
    expect(stored?.setup.zones.find((z) => z.id === 'mine:B')).toMatchObject({ owner: 'B', visibility: 'owner' })
  })
})

// Arket bredvid bordet är telefonens, och telefonens ark är en plats (C4): en annan plats egna yta
// står aldrig på det, och en zon som bara håller räknare är ingen plats att spela ett kort till.
// Förhandsvisningen räknade upp varje plats "Framför mig" och varje räknarzon, alltså ett ark
// ingen spelare någonsin får se.
describe('the setup editor (B5, C4): the phone’s sheet as a preview', () => {
  it('shows one seat’s sheet, not every seat’s', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknare' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknarzon per plats' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Yta per plats' }))
    // Arket står hopfällt tills det efterfrågas (#301).
    fireEvent.click(screen.getByRole('button', { name: 'Visa spelarvyn' }))

    const sheet = document.querySelector('[data-sheet-preview]') as HTMLElement
    expect(within(sheet).getAllByText('Framför mig')).toHaveLength(1)
    expect(within(sheet).queryByText(/Räknare [ABC]/)).toBeNull()
    expect(within(sheet).getByText('Kasta')).toBeTruthy()
    expect(within(sheet).getByText('Bordet')).toBeTruthy()
  })
})

// The felt drew every face-down card as one stand-in — a blue diagonal weave in `table.css` —
// whatever back the deck had. So the one surface where a designer sees the deck as a deck showed
// a back that belonged to no game, and picking a ready-made back changed the canvas and nothing
// else. The pile is the deck lying face down: it wears the deck's own back.
describe('the setup editor (B5, L17): the deck\'s own back', () => {
  const backOn = (zone: string) => document.querySelector(`[data-zone="${zone}"] .byd-pile-top .byd-preview`)
  const elementsOn = (zone: string) => [...document.querySelectorAll(`[data-zone="${zone}"] .byd-pile-top [data-element]`)].map((e) => e.getAttribute('data-element'))

  it('draws the template\'s back on a face-down pile, and follows the back when it is changed', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    // The fixture's back is a single shape called `bg`; the pile wears it.
    expect(backOn('draw')).toBeTruthy()
    expect(elementsOn('draw')).toEqual(['bg'])

    // Pick a ready-made back on the canvas, and come back to the table.
    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Baksida' }))
    fireEvent.click(screen.getByRole('button', { name: 'Medaljong' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    expect(elementsOn('draw')).toEqual(['bottom', 'edge', 'medallion', 'star'])
  })

  it('leaves a face-up pile and an empty one alone', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    // The discard pile starts empty and lies face up: there is no back to show on it.
    expect(backOn('discard')).toBeNull()
  })

  // A game made without the guided start has no back at all. A blank white card on the pile
  // would read as a fault rather than as "nothing drawn here yet", so until the back has
  // something on it the pile keeps the tool's own stand-in.
  it('keeps the stand-in while the back is still empty', async () => {
    const doc = projectDoc()
    await run.projects.create(run.projectId, { ...doc, template: { ...doc.template, faces: { ...doc.template.faces, back: { base: [], variants: {} } } } })
    await openBord()
    expect(backOn('draw')).toBeNull()
    expect(document.querySelector('[data-zone="draw"] .byd-pile-top')?.getAttribute('data-face')).toBe('back')
  })
})

// Arket — vad spelaren ser — stod alltid bredvid uppställningen och tog sin plats vare sig
// designern tittade på det eller inte (#301). Nu är det ett veck i samma kolumn: dolt när fliken
// öppnas, en knapp bort när det behövs, och knappen säger själv om det står utfällt.
describe('the setup editor (B5, C4, #301): the player view is shown when asked for', () => {
  const preview = () => document.querySelector('[data-sheet-preview]')

  it('opens with the sheet hidden and one button that shows it', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    expect(preview()).toBeNull()
    const fold = screen.getByRole('button', { name: 'Visa spelarvyn' })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Dölj spelarvyn' })).toBeNull()
  })

  // Ett veck och inte en dialog: fokus stannar på raden som fällde ut, åt båda hållen.
  it('shows and hides the sheet from the same button, which says which way it stands and keeps the focus', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    const fold = screen.getByRole('button', { name: 'Visa spelarvyn' })
    fold.focus()
    fireEvent.click(fold)
    expect(preview()).not.toBeNull()
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(fold.getAttribute('aria-controls')).toBe(preview()!.id)
    expect(fold.textContent).toContain('Dölj spelarvyn')
    expect(document.activeElement).toBe(fold)

    fireEvent.click(fold)
    expect(preview()).toBeNull()
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    expect(fold.textContent).toContain('Visa spelarvyn')
    expect(document.activeElement).toBe(fold)
  })

  // Arket läses ur dokumentet när det fälls ut, inte när fliken öppnades: en zon som döptes om
  // medan arket låg hopfällt står med sitt nya namn när det visas.
  //
  // Zonen avmarkeras innan arket fälls ut, och det är inte städning utan L29: en vald hög har
  // tredje kolumnen, och spelararket kommer tillbaka först när den lämnar den (#330). Att döpa om
  // en zon och att läsa spelarvyn är två saker designern gör efter varandra.
  it('shows the setup as it stands now, with what changed while the sheet was folded', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    fireEvent.click(row('discard').querySelector('.byd-setup-name') as HTMLElement)
    fireEvent.change(screen.getByLabelText('Namn för Kasthög'), { target: { value: 'Slasken' } })
    fireEvent.click(screen.getByRole('button', { name: 'Stäng panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Visa spelarvyn' }))
    const sheet = preview() as HTMLElement
    expect(within(sheet).getByText('överst i Slasken')).toBeTruthy()
    expect(within(sheet).queryByText(/Kasthög/)).toBeNull()
  })

  // Ingen inställning minns valet: fliken öppnas hopfälld varje gång, också efter ett besök på en
  // annan flik.
  it('is folded again when the tab is left and returned to', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: 'Visa spelarvyn' }))
    expect(preview()).not.toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    expect(preview()).toBeNull()
    expect(screen.getByRole('button', { name: 'Visa spelarvyn' }).getAttribute('aria-expanded')).toBe('false')
  })
})

// Högens bottenkort (K23, #331): ett specifikt kort ur leken och sidan det ligger på, valt i
// zonpanelen och sparat med högen. Prototypgodkänd variant A: kortval och sida i panelen.
describe('högens bottenkort', () => {
  it('väljs bland lekens kort med sin sida, och står kvar när projektet öppnas igen', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    fireEvent.click(within(row('draw')).getByRole('button', { name: /Draghög/ }))

    const card = screen.getByLabelText('Bottenkort för Draghög') as HTMLSelectElement
    expect(card.value).toBe('')
    expect([...card.options].map((o) => o.textContent)).toEqual(['inget', 'Drake', 'Riddare', 'Trollkarl'])
    // No card, no side to choose.
    expect(screen.queryByLabelText('Bottenkortets sida för Draghög')).toBeNull()

    fireEvent.change(card, { target: { value: 'knight' } })
    const side = screen.getByLabelText('Bottenkortets sida för Draghög') as HTMLSelectElement
    expect(side.value).toBe('back')
    fireEvent.change(side, { target: { value: 'front' } })

    await spara()
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    expect((await run.projects.load(run.projectId))?.setup.zones.find((z) => z.id === 'draw')?.bottom).toEqual({ cardRef: 'knight', face: 'front' })

    // The felt in the editor shows it the way the table will: the edge under the pile.
    expect(document.querySelector('[data-table] [data-zone="draw"] .byd-pile-bottom')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Bottenkort för Draghög'), { target: { value: '' } })
    expect(screen.queryByLabelText('Bottenkortets sida för Draghög')).toBeNull()
    await spara()
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(3))
    expect((await run.projects.load(run.projectId))?.setup.zones.find((z) => z.id === 'draw')).not.toHaveProperty('bottom')
  })

  it('an area has no bottom card to choose', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openBord()
    fireEvent.click(within(row('table')).getByRole('button', { name: /Spelyta/ }))
    expect(screen.queryByLabelText('Bottenkort för Spelyta')).toBeNull()
  })
})
