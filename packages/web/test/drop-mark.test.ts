import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Dragmarkeringen är en token, och varje mottagande yta hämtar ur den (#291, L22).
//
// Det som var i drift när skivan började var en bärnstensfärgad ram skriven rakt in i
// `editor.css`, på en enda yta. Beslutstexten talar om «den blå dragmarkeringen». De två går inte
// att förena genom att måla om Datas levererade rutor på eget bevåg, och de går inte heller att
// låta ligga: tre nya ytor skulle då välja var sin ton, och den fjärde en fjärde.
//
// Så färgen blev en token med bärnstenen som förval, och formen skrevs en gång. En övergång till
// blått är då en rad och inte sju ytor. Det som står här är vad som gör den meningen sann i morgon
// också: en åttonde yta kan varken skriva en egen färg eller ta emot ett släpp utan att gå genom
// samma mekanism som de sju.
const SRC = join(import.meta.dirname, '..', 'src')
const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]))
const sources = filesUnder(SRC)
const read = (path: string) => readFileSync(path, 'utf8')
// Utan kommentarerna, när det är väljare och deklarationer som läses: en kommentar över en regel
// hör till det som står i den och inte till regeln.
const rules = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, '')
const sheet = read(join(SRC, 'dropping.css'))

describe('dragmarkeringens token (#291)', () => {
  it('står i ett enda hus, med bärnstenen som förval', () => {
    // Förvalet är den ton som faktiskt är i drift, så skivan ändrar ingenting den inte blev
    // ombedd att ändra. Den står en gång: två deklarationer av samma namn är två färger som
    // bara råkar vara lika i dag.
    expect([...sheet.matchAll(/--byd-drop-mark:\s*#ffd98a/g)]).toHaveLength(1)
    expect([...sheet.matchAll(/--byd-drop-wash:\s*rgba\(255, 217, 138, 0\.1\)/g)]).toHaveLength(1)

    // Ingen annan stilmall *deklarerar* den. Att hämta ur den får vem som helst göra — det är
    // hela poängen — men den som deklarerar om den har gjort en andra färg av en.
    const declaring = sources
      .filter((path) => path.endsWith('.css') && path !== join(SRC, 'dropping.css'))
      .filter((path) => /--byd-drop-[a-z]+\s*:/.test(read(path)))
      .map((path) => relative(SRC, path))
    expect(declaring).toEqual([])

    // Och klassen som bär markeringen skrivs bara på två ställen: stilmallen som ritar den, och
    // modulen som delar ut den. Ingen yta kan bära den på egen hand och ingen kan låta bli.
    const naming = sources
      .filter((path) => /(?<!-)byd-drop\b/.test(read(path)))
      .map((path) => relative(SRC, path))
      .sort()
    expect(naming).toEqual(['dropping.css', 'editor/dropping.tsx'])
  })

  it('är den enda färg någon mottagande yta målar sin markering i', () => {
    // Varje regel i hela trädet som målar en yta ett drag står över — bildytorna, regelbokens
    // import (#293) och typsnittsknappen (#294). Formen är kontrollens egen: en kant här, en
    // kontur där. Färgen är allas och ingens.
    const marking = sources
      .filter((path) => path.endsWith('.css'))
      .flatMap((path) => [...rules(path).matchAll(/([^{}]*\[data-over='true'\][^{}]*)\{([^}]*)\}/g)].map((m) => ({ at: relative(SRC, path), selector: m[1]!.trim(), body: m[2]! })))
    // Uppräknade och inte bara räknade, så att en ny yta syns i felet i stället för att bara
    // höja en siffra.
    expect(marking.map((rule) => `${rule.at}: ${rule.selector}`).sort()).toEqual([
      "dropping.css: .byd-drop[data-over='true']",
      "editor/editor.css: .byd-data-tools label[data-over='true']",
      "editor/editor.css: .byd-fonts-upload[data-over='true']",
      "editor/editor.css: .byd-rules-ways label[data-over='true']",
    ])
    // Och ingen av dem nämner en färg av sitt eget: bara namnen.
    const ownColour = marking.filter((rule) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(rule.body)).map((rule) => `${rule.at}: ${rule.selector}`)
    expect(ownColour).toEqual([])
    expect(marking.filter((rule) => !rule.body.includes('var(--byd-drop-'))).toEqual([])
  })

  it('bärs av varje bildyta genom en och samma väg in', () => {
    // `dropSurface` sätter klassen, och `droppedOn` — läsningen av vad som släpptes — är privat
    // för modulen, så en bildyta kan inte ta emot en fil utan att bära märket.
    const own = join(SRC, 'editor', 'dropping.tsx')
    expect(sources.filter((path) => path !== own && /droppedOn/.test(read(path)))).toEqual([])

    // De fyra bildytorna går alla genom den: bibliotekets bildyta, cellens ruta,
    // massredigeringens och guidens bildfält.
    const surfaces = sources
      .filter((path) => /\.tsx$/.test(path) && path !== own)
      .flatMap((path) => [...read(path).matchAll(/dropSurface\(/g)].map(() => relative(SRC, path)))
    expect(surfaces.sort()).toEqual(['editor/DataTable.tsx', 'editor/DataTable.tsx', 'editor/MediaPanel.tsx', 'wizard/NewProjectPage.tsx'])

    // Och varje annan mottagare i trädet är uppräknad här. De tre som finns tar något annat än
    // bilder — en datafil (#292), en regelbok med sina bilder (#293), ett typsnitt (#294) — och
    // har därför sin egen väg in, vilket HITL-beslutet uttryckligen säger: CSV, regler och
    // typsnitt tillämpar mönstret *lokalt* vid sina befintliga kontroller. Det de inte får ha är
    // en färg av sitt eget, och den hämtar de ur tokenen ovan som alla andra. En fjärde som
    // dyker upp fäller det här och får då frågan ställd om sig.
    const others = sources
      .filter((path) => path !== own && /\.tsx$/.test(path) && /dataTransfer[^;]*\.files/.test(read(path)))
      .map((path) => relative(SRC, path))
      .sort()
    expect(others).toEqual(['editor/DataTable.tsx', 'editor/RulesPanel.tsx', 'editor/TemplateCanvas.tsx'])
  })
})
