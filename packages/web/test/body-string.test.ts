// @vitest-environment jsdom
// Strängen in är strängen ut (#324, L39).
//
// Redigeraren är ett lager över #308:s delmängd och skriver **samma sträng**. Det står och faller
// med två funktioner: `fillBody` gör strängen till element, och `tillStrang` är enda vägen ut ur
// dem. Rundturen mäts här tecken för tecken, och en gång till genom CSV — det är den vägen en lek
// lämnar verktyget och kommer tillbaka, och den får inte se att en cell någonsin varit öppen.
//
// Vad som *inte* mäts här: att skriva i en `contenteditable`. jsdom har ingen sådan, och ett prov
// som låtsades ha det skulle vara grönt utan att betyda något — samma slags fel som
// jsdom-uppladdningarna som skickade «[object Blob]» och passerade. Det ställs till Chromium i
// `data-table-body-writing.test.tsx`.
import { describe, expect, it } from 'vitest'
import { canonicalBody, fillBody, tillStrang } from '../src/editor/body.js'
import { exportCardsCsv, importCardsCsv } from '../src/editor/csv.js'
import { projectDoc } from './project-doc.js'

// Delmängden, i de former en cell faktiskt bär den.
const CORPUS = [
  '',
  'Flyger tyst.',
  '**Gläntans väktare** kommer i spel.',
  'Den får *skydd* medan den står framför dig.',
  'Betala {droppe} för att dra ett kort.',
  'Skada {svard|fara} 2.',
  '- Se på de tre översta korten\n- Lägg ett av dem i din hand',
  'När **Gläntans väktare** kommer i spel:\n\n- Se på de tre översta korten\n- Lägg ett av dem i din hand\n- Lägg resten {blad} i kasthögen\n\nDen får *skydd* medan den står framför dig.',
  '**Fet** och *kursiv* i samma **rad** med {mynt}.',
  'Ett stycke.\n\nEtt till.\n\nOch ett tredje.',
  '- **fet punkt**\n- *kursiv punkt*\n- punkt med {skold}',
  // Tecken som skulle ha varit HTML om något här byggde markup.
  '<b>inte fet</b> & <script>x</script>',
  // Asterisker som inte stänger är text och ingen markering (#308).
  'Tre * stjärnor * här',
]

const write = (text: string): HTMLElement => {
  const el = document.createElement('div')
  fillBody(el, text)
  return el
}

describe('rundturen redigerare → dokument → redigerare (L39)', () => {
  it('ger tillbaka exakt den sträng som gick in, tecken för tecken', () => {
    for (const text of CORPUS) expect({ text, out: tillStrang(write(text)).text }).toEqual({ text, out: text })
  })

  it('går genom elementen en gång till utan att ändra sig', () => {
    // En sträng som inte är delmängdens egen form — `- ` direkt under en rad text, som `parseBody`
    // ändå läser som en lista — kommer ut i den form kortet ritas i, och sedan står den still.
    for (const text of [...CORPUS, 'Gör så här:\n- ett\n- två', 'a\n\n\n\nb', '  \n\nFlyger.']) {
      const once = canonicalBody(text, document)
      expect({ text, twice: canonicalBody(once, document) }).toEqual({ text, twice: once })
    }
  })

  it('låter ingen HTML och inga dolda tecken nå strängen', () => {
    const el = write('Flyger')
    // Det en webbläsare hittar på inuti en `contenteditable`: ett hårt mellanslag där ett
    // mellanslag stod, och en `<span style>` från `execCommand`.
    const p = el.firstElementChild!
    p.append(document.createTextNode('\u00a0tyst'))
    const span = document.createElement('span')
    span.setAttribute('style', 'font-weight: 700')
    span.textContent = ' över skogen'
    p.append(span)
    // Taggen når aldrig strängen — men markeringen den bär gör det. En `<span style>` är hur
    // `execCommand` skriver fet text när `styleWithCSS` är på, och det är läget en inklistrad
    // text eller en annan webbläsare kan komma i; `runCommand` slår av den för det tjänsten
    // själv gör, men vägen ut måste läsa båda formerna. Att bara känna igen `<b>` hade tappat
    // fetstilen tyst, vilket är precis vad kommentaren över `runCommand` varnar för.
    expect(tillStrang(el).text).toBe('Flyger tyst** över skogen**')
    // Och det som inte får nå strängen når den inte: ingen vinkelparentes, inget hårt mellanslag.
    expect(tillStrang(el).text).not.toMatch(/[<>\u00a0]/)
    expect(el.innerHTML).toContain('<span style')
  })

  it('läser en `<div>` webbläsaren lade dit som det stycke den är', () => {
    const el = write('Ett stycke.')
    const div = document.createElement('div')
    div.textContent = 'Ett till.'
    el.append(div)
    expect(tillStrang(el).text).toBe('Ett stycke.\n\nEtt till.')
  })

  it('svarar var markören står, räknat i strängens egna tecken', () => {
    const el = write('När **Gläntans väktare** kommer')
    const bold = el.querySelector('strong')!.firstChild!
    expect(tillStrang(el, { node: bold, offset: 'Gläntans'.length }).at).toBe('När **Gläntans'.length)
    const first = el.firstElementChild!.firstChild!
    expect(tillStrang(el, { node: first, offset: 2 }).at).toBe(2)
  })
})

describe('CSV-rundturen ser ingen skillnad (D3, L39)', () => {
  it('bär tillbaka precis det redigeraren skrev', () => {
    const doc = projectDoc()
    doc.rows = CORPUS.map((body, i) => ({ id: `k${i}`, fields: { title: `Kort ${i}`, body: tillStrang(write(body)).text, antal: 1 } }))

    const back = importCardsCsv(exportCardsCsv(doc))

    expect(back.map((row) => row.fields['body'])).toEqual(doc.rows.map((row) => row.fields['body']))
    // Och en gång till in i elementen: vägen ut ur dem är densamma efter en resa genom en fil.
    for (const row of back) expect(tillStrang(write(String(row.fields['body'] ?? ''))).text).toBe(row.fields['body'])
  })
})
