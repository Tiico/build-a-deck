// Genererar prototypen för #420: startramarnas typsnitt.
//
// Korten är inte ritade för hand. De kommer ur produktens egna delar:
// `FRAMES` i `packages/web/src/wizard/frames.ts` (de tre startramarna), `compile` i
// `packages/template` (den enda renderaren, E2) och `validateCard` i samma paket (den fysiska
// kontrollen, E5). Antalet anmärkningar under varje kort är alltså mätt och inte påstått.
//
// Körs med:
//   node_modules/.bin/tsx docs/ux-audits/2026-09-22/generera.ts
import { writeFileSync } from 'node:fs'
import { compile, validateCard, type FaceTemplate, type Element, type Issue, type Row } from '../../../packages/template/src/index.js'
import { CARD_STANDARD_63x88 } from '../../../packages/engine/src/typedef.js'
import { FRAMES, type Field } from '../../../packages/web/src/wizard/frames.js'

const HÄR = new URL('.', import.meta.url).pathname

// ── Vad korten säger ─────────────────────────────────────────────────────────────────────────
// Två kort, som i felrapporten. Riktig svensk text, för att frågan är om brödtext i 8,5 punkter
// överlever på ett 63 mm-kort — inte om ett familjenamn ser bra ut i nitton punkter (L27).
const FÄLT: Field[] = [
  { key: 'title', label: 'Titel', kind: 'text' },
  { key: 'cost', label: 'Kostnad', kind: 'number' },
  { key: 'body', label: 'Text', kind: 'text' },
  { key: 'art', label: 'Bild', kind: 'image' },
]

const KORT: { id: string; row: Row }[] = [
  {
    id: 'skogsvakten',
    row: {
      title: 'Skogsvakten',
      cost: 3,
      body: 'När Skogsvakten kommer i spel: dra ett kort.\n\nSå länge den står kvar får dina djur +1 i styrka.',
      art: bild('#2d5a3d', '#7fa86b', '#1b3527'),
    },
  },
  {
    id: 'glantans-ljus',
    row: {
      title: 'Gläntans ljus',
      cost: 1,
      body: 'Lägg en markör här. Vid rundans slut flyttas den till ett annat kort du äger.',
      art: bild('#4a3a5c', '#c9a86b', '#2a2036'),
    },
  },
]

// En bild räcker som bild: frågan här är typsnittet, och en tom grå ruta hade gjort varje kort
// fulare än det är i editorn utan att göra frågan tydligare.
function bild(himmel: string, ljus: string, mark: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 144"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${himmel}"/><stop offset="1" stop-color="${mark}"/></linearGradient></defs><rect width="220" height="144" fill="url(#g)"/><circle cx="168" cy="36" r="17" fill="${ljus}" opacity="0.85"/><path d="M0 120 L36 74 L72 120 Z" fill="${mark}" opacity="0.9"/><path d="M52 124 L96 62 L140 124 Z" fill="${mark}"/><path d="M124 122 L164 78 L204 122 Z" fill="${mark}" opacity="0.8"/><rect y="118" width="220" height="26" fill="${mark}"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

// ── Typsnitten som faktiskt laddas ───────────────────────────────────────────────────────────
// Varje fil ligger på disk och laddas av sidan. Ingen kandidat visas i ett systemtypsnitt och
// kallas för något annat: en prototyp om typsnitt får inte ljuga om typsnitt.
type Skeppat = { generisk: string; fil: string; varifrån: string }
const FILER: Record<string, Skeppat> = {
  'Roboto Condensed': {
    generisk: 'sans-serif',
    fil: '../../../../packages/web/src/fonts/roboto-condensed-latin-wght-normal.woff2',
    varifrån: 'redan i bygget (K20, #95) — filten skriver i den',
  },
  'EB Garamond': { generisk: 'serif', fil: '../typsnitt/eb-garamond.woff2', varifrån: 'katalogen (#329) · OFL 1.1 · Georg Duffner, Octavio Pardo' },
  Inter: { generisk: 'sans-serif', fil: '../typsnitt/inter.woff2', varifrån: 'katalogen (#329) · OFL 1.1 · Rasmus Andersson' },
  Cinzel: { generisk: 'serif', fil: '../typsnitt/cinzel.woff2', varifrån: 'katalogen (#329) · OFL 1.1 · Natanael Gama' },
  'Crimson Pro': { generisk: 'serif', fil: '../typsnitt/crimson-pro.woff2', varifrån: 'katalogen (#329) · OFL 1.1 · Jacques Le Bailly' },
  Archivo: { generisk: 'sans-serif', fil: '../typsnitt/archivo.woff2', varifrån: 'katalogen (#329) · OFL 1.1 · Omnibus-Type' },
  Oswald: { generisk: 'sans-serif', fil: '../typsnitt/oswald.woff2', varifrån: 'katalogen (#329) · OFL 1.1 · Vernon Adams m.fl.' },
}

// ── Kandidaterna ─────────────────────────────────────────────────────────────────────────────
// En kandidat säger, per ram, vilken familj varje textruta sätts i. `null` är i dag: ramen rör
// sig inte och dokumentet har inga `fonts`.
type Val = Record<string, Record<string, string>> | null
type Kandidat = { id: string; namn: string; rubrik: string; mening: string; val: Val }

const KANDIDATER: Kandidat[] = [
  {
    id: 'idag',
    namn: 'I dag',
    rubrik: 'Baslinjen · Georgia + system-ui',
    mening: 'Ingen fil följer med. `system-ui` är ett ansikte på formgivarens Mac, ett annat i renderarens Chromium och ett tredje hos tryckeriet.',
    val: null,
  },
  {
    id: 'a',
    namn: 'A',
    rubrik: 'Ett ansikte ombord',
    mening: 'Alla tre ramarna sätts i Roboto Condensed — filen som redan reser med bygget. Noll nya byte, noll nät, och ramarna tappar sin skillnad.',
    val: {
      classic: { title: 'Roboto Condensed', body: 'Roboto Condensed', cost: 'Roboto Condensed' },
      minimal: { title: 'Roboto Condensed', body: 'Roboto Condensed', cost: 'Roboto Condensed' },
      dark: { title: 'Roboto Condensed', body: 'Roboto Condensed', cost: 'Roboto Condensed' },
    },
  },
  {
    id: 'b',
    namn: 'B',
    rubrik: 'Ett ansikte per ram',
    mening: 'En familj per ram, hela kortet satt i den: Klassisk en antikva, Minimal en neutral grotesk, Mörk en tätare och mer industriell. Ett typsnitt, en fil, per projekt. (Mörk skulle också kunna bära den ombordvarande kondenserade — det är kolumn A:s mörka kort.)',
    val: {
      classic: { title: 'EB Garamond', body: 'EB Garamond', cost: 'EB Garamond' },
      minimal: { title: 'Inter', body: 'Inter', cost: 'Inter' },
      dark: { title: 'Archivo', body: 'Archivo', cost: 'Archivo' },
    },
  },
  {
    id: 'c',
    namn: 'C',
    rubrik: 'Rubrik och brödtext skilda',
    mening: 'Rubriken får ett eget ansikte och brödtexten ett som är byggt för att läsas smått. Mest utpräglade ramar — och två filer i varje projekt i stället för en.',
    val: {
      classic: { title: 'Cinzel', body: 'Crimson Pro', cost: 'Crimson Pro' },
      minimal: { title: 'Archivo', body: 'Inter', cost: 'Inter' },
      dark: { title: 'Oswald', body: 'Roboto Condensed', cost: 'Roboto Condensed' },
    },
  },
]

// ── Att sätta en ram i ett annat typsnitt ────────────────────────────────────────────────────
function satt(face: FaceTemplate, val: Record<string, string> | undefined): FaceTemplate {
  if (!val) return face
  const om = (els: readonly Element[]): Element[] =>
    els.map((el) => {
      if (el.kind === 'group' || el.kind === 'if') return { ...el, children: om(el.children) }
      if (el.kind !== 'text') return el
      const familj = val[el.id]
      return familj ? { ...el, font: { ...el.font, family: familj } } : el
    })
  return { ...face, base: om(face.base) }
}

// Dokumentets `fonts` (B3): familjen bär sin stack och sin asset. Assetens namn är påhittat här —
// vad kontrollen frågar efter är att den finns, inte vad den heter.
function fonts(val: Record<string, string> | undefined): Record<string, { stack: string; asset: string; src: string }> | undefined {
  if (!val) return undefined
  const ut: Record<string, { stack: string; asset: string; src: string }> = {}
  for (const familj of new Set(Object.values(val))) {
    const skeppat = FILER[familj]
    if (!skeppat) throw new Error(`ingen fil för ${familj}`)
    ut[familj] = { stack: `"${familj}", ${skeppat.generisk}`, asset: `asset:${familj.toLowerCase().replace(/ /g, '-')}`, src: skeppat.fil }
  }
  return ut
}

// ── Kör ──────────────────────────────────────────────────────────────────────────────────────
type Ruta = { html: string; css: string; anmärkningar: Issue[] }
const rutor: Record<string, Ruta> = {}
const sammanställning: { ram: string; kandidat: string; antal: number; koder: string[] }[] = []

for (const ram of FRAMES) {
  for (const kandidat of KANDIDATER) {
    const val = kandidat.val?.[ram.id]
    const face = satt(ram.front(FÄLT), val)
    const pinnade = fonts(val)
    const alla: Issue[] = []
    for (const kort of KORT) {
      alla.push(
        ...validateCard({
          type: CARD_STANDARD_63x88,
          face,
          row: kort.row,
          ...(pinnade ? { fonts: pinnade } : {}),
        }),
      )
    }
    const nyckel = `${ram.id}-${kandidat.id}`
    const scope = `#c-${nyckel}`
    const kompilerad = compile({
      type: CARD_STANDARD_63x88,
      face,
      row: KORT[0]!.row,
      icons: {},
      scope,
      ...(pinnade ? { fonts: pinnade } : {}),
    })
    rutor[nyckel] = { html: kompilerad.html, css: kompilerad.css, anmärkningar: alla }
    sammanställning.push({ ram: ram.id, kandidat: kandidat.id, antal: alla.length, koder: [...new Set(alla.map((i) => i.code))] })
  }
}

// Det andra kortet, bara för Klassisk: samma fyra kandidater, längre rubrik och kortare text.
const andra: Record<string, Ruta> = {}
for (const kandidat of KANDIDATER) {
  const ram = FRAMES[0]!
  const val = kandidat.val?.[ram.id]
  const face = satt(ram.front(FÄLT), val)
  const pinnade = fonts(val)
  const scope = `#a-${kandidat.id}`
  const kompilerad = compile({ type: CARD_STANDARD_63x88, face, row: KORT[1]!.row, icons: {}, scope, ...(pinnade ? { fonts: pinnade } : {}) })
  andra[kandidat.id] = { html: kompilerad.html, css: kompilerad.css, anmärkningar: [] }
}

const RAMNAMN: Record<string, string> = { classic: 'Klassisk', minimal: 'Minimal', dark: 'Mörk' }
const KODORD: Record<string, string> = {
  'unpinned-font': 'typsnitt som inte följer med',
  'text-too-small': 'för liten text',
  'low-contrast': 'för låg kontrast',
  'outside-safe-area': 'utanför säkra ytan',
  'short-of-bleed': 'når inte utfallet',
  hairline: 'hårstreck',
  'colour-only': 'skillnad bara i färg',
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function anmärkning(issues: Issue[]): string {
  if (issues.length === 0) return `<p class="check ok">Fysisk kontroll: <b>noll anmärkningar</b></p>`
  const koder = [...new Set(issues.map((i) => i.code))].map((k) => KODORD[k] ?? k)
  const familjer = issues.find((i) => i.code === 'unpinned-font')?.values['families']
  return (
    `<p class="check warn">Fysisk kontroll: <b>${issues.length}</b> — ${esc(koder.join(', '))}</p>` +
    (familjer ? `<p class="check-mer">${esc(String(familjer))} följer inte med spelet</p>` : '')
  )
}

// Sidan skriver inga egna `@font-face`. Varje ansikte kommer ur `compile`s egen regel — samma
// rad som renderaren och editorns förhandsvisning får (B3) — så det som ritas här är det
// produkten skulle rita, och inte en efterhärmning bredvid.
const stilar = [...Object.values(rutor).map((r) => r.css), ...Object.values(andra).map((r) => r.css)].join('\n')

function rutaHtml(nyckel: string, ruta: Ruta, kandidat: Kandidat, ram: string): string {
  const val = kandidat.val?.[ram]
  const familjer = val ? [...new Set(Object.values(val))] : ['Georgia, serif', 'system-ui']
  return `<div class="ruta">
  <div class="rutrubrik"><span class="märke ${kandidat.id === 'idag' ? 'bas' : ''}">${esc(kandidat.namn)}</span> <span>${esc(familjer.join(' + '))}</span></div>
  <div class="kortyta" id="c-${nyckel}">${ruta.html}</div>
  <p class="fit" data-for="c-${nyckel}"></p>
  ${anmärkning(ruta.anmärkningar)}
</div>`
}

const ramarHtml = FRAMES.map((ram) => {
  const rutorHtml = KANDIDATER.map((k) => rutaHtml(`${ram.id}-${k.id}`, rutor[`${ram.id}-${k.id}`]!, k, ram.id)).join('\n')
  return `<section class="ram" id="ram-${ram.id}">
  <h2>${esc(RAMNAMN[ram.id] ?? ram.id)}</h2>
  <div class="rad">${rutorHtml}</div>
</section>`
}).join('\n')

const andraHtml = KANDIDATER.map(
  (k) => `<div class="ruta">
  <div class="rutrubrik"><span class="märke ${k.id === 'idag' ? 'bas' : ''}">${esc(k.namn)}</span> <span>Gläntans ljus</span></div>
  <div class="kortyta" id="a-${k.id}">${andra[k.id]!.html}</div>
</div>`,
).join('\n')

const kandidatHtml = KANDIDATER.map(
  (k) => `<div class="kandidat" id="k-${k.id}">
  <h3><span class="märke ${k.id === 'idag' ? 'bas' : ''}">${esc(k.namn)}</span> ${esc(k.rubrik)}</h3>
  <p>${esc(k.mening)}</p>
  <ul>${
    k.val
      ? [...new Set(Object.values(k.val).flatMap((v) => Object.values(v)))].map((f) => `<li><b>${esc(f)}</b> — ${esc(FILER[f]!.varifrån)}</li>`).join('')
      : '<li><b>Georgia, serif</b> — ingen fil; Georgia finns på Mac och Windows, inte på Linux</li><li><b>system-ui</b> — ingen fil; namnet på vad maskinen råkar ha</li>'
  }</ul>
</div>`,
).join('\n')

// Håller de tre ramarna isär? Rubrikordet ur varje ram, i den grad ramen sätter det och i det
// ansikte kandidaten ger den. Tre rader som är tre olika röster är tre ramar; tre rader som är
// samma röst är en ram tre gånger.
const rösterHtml = KANDIDATER.map((k) => {
  const rader = FRAMES.map((ram) => {
    const el = ram.front(FÄLT).base.find((e) => e.kind === 'text' && e.id === 'title')
    const grad = el && el.kind === 'text' ? el.font.sizePt : 13
    const vikt = el && el.kind === 'text' ? (el.font.weight ?? 400) : 700
    const familj = k.val?.[ram.id]?.['title']
    // Enkla citattecken: stacken hamnar i ett `style`-attribut, och ett dubbelt citattecken där
    // stänger attributet — vilket tyst tar med sig både graden och vikten.
    const stack = familj ? `'${familj}', ${FILER[familj]!.generisk}` : ram.id === 'classic' ? 'Georgia, serif' : 'system-ui'
    return `<div class="röst"><span class="etikett">${esc(RAMNAMN[ram.id] ?? ram.id)}</span><span class="ord" style="font-family:${stack};font-size:${grad * 2}pt;font-weight:${vikt}">Skogsvakten</span></div>`
  }).join('')
  return `<div class="rostblock"><div class="rutrubrik"><span class="märke ${k.id === 'idag' ? 'bas' : ''}">${esc(k.namn)}</span></div>${rader}</div>`
}).join('')

const summaHtml = `<table class="summa">
<thead><tr><th>Ram</th>${KANDIDATER.map((k) => `<th>${esc(k.namn)}</th>`).join('')}</tr></thead>
<tbody>${FRAMES.map((ram) => {
  const celler = KANDIDATER.map((k) => {
    const rad = sammanställning.find((s) => s.ram === ram.id && s.kandidat === k.id)!
    return `<td class="${rad.antal === 0 ? 'ok' : 'warn'}">${rad.antal === 0 ? 'noll anmärkningar' : `${rad.antal} · ${esc(rad.koder.map((c) => KODORD[c] ?? c).join(', '))}`}</td>`
  }).join('')
  return `<tr><th>${esc(RAMNAMN[ram.id] ?? ram.id)}</th>${celler}</tr>`
}).join('')}</tbody>
</table>`

const sida = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Startramarnas typsnitt (#420)</title>
<link rel="stylesheet" href="../../2026-09-21/prototyper/proto.css">
<style>
${stilar}

/* Sidan är ett jämförelseark och inte en editoryta: den rullar, till skillnad från de andra
   prototyperna, eftersom tolv kort inte får plats i ett fönster. */
html, body { height: auto; overflow: auto; }
body { padding: 0 0 80px; }
.ark { max-width: 1280px; margin: 0 auto; padding: 0 var(--s5); }
h1 { font-size: 22px; color: #fff; margin: var(--s5) 0 var(--s2); }
h2 { font-size: 15px; color: #fff; margin: 0 0 var(--s3); letter-spacing: 0.5px; }
h3 { font-size: 13px; color: #fff; margin: 0 0 var(--s2); }
/* Aldrig en naken elementväljare på den här sidan. Ett kort är riktig kompilerad kortmarkup —
   dess ord ligger i <p> — så ett \`p { color: … }\` i arkets egen stil skulle måla om kortets
   text, byta dess radavstånd och lägga arkets marginaler mellan styckena. Det gjorde den här
   sidan i sin första version, och då var jämförelsen mellan typsnitten inte längre sann. */
.ark > p, section.ram > p, .kandidat p, .vag2 p { margin: 0 0 var(--s2); max-width: 74ch; line-height: 1.6; color: #c3cbdd; }
code { background: var(--sunk); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; color: #ffd98a; font-size: 12px; }
.led { color: var(--quiet); }

.ram { margin: var(--s5) 0; padding: var(--s4) 0 0; border-top: 1px solid var(--line); }
.rad { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s4); align-items: start; }
.ruta { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: var(--s3); }
.rutrubrik { display: flex; align-items: center; gap: var(--s2); margin-bottom: var(--s3); font-size: 11px; color: var(--quiet-2); min-height: 20px; }
.märke { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 6px; background: var(--primary); color: #fff; font: 800 11px/1 system-ui; }
.märke.bas { background: #4a4230; color: #ffd98a; }

/* Ett millimetermått är ett millimetermått: korten ritas i sin verkliga storlek, 63 × 88 mm,
   för det är där frågan avgörs — 8,5 punkters brödtext på ett kort i handen. */
.kortyta { display: flex; justify-content: center; }
.kortyta [data-card] { border-radius: 3mm; overflow: hidden; box-shadow: 0 1px 0 rgba(0,0,0,.6), 0 10px 26px rgba(0,0,0,.45); }

.check { margin: var(--s3) 0 0; font-size: 11px; }
.check b { font-weight: 800; }
.check.ok { color: var(--good); }
.check.warn { color: var(--warn); }
.check-mer { margin: 2px 0 0; font-size: 10px; color: var(--quiet); line-height: 1.4; }
.fit { margin: var(--s3) 0 0; font-size: 11px; color: var(--quiet-2); font-variant-numeric: tabular-nums; }
.fit b { color: #dfe6f5; font-weight: 700; }
.fit .krympt { color: var(--warn); }

.kandidater { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s4); margin: var(--s4) 0 0; }
.kandidat { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: var(--s3); }
.kandidat h3 { display: flex; align-items: center; gap: var(--s2); }
.kandidat p { font-size: 12px; margin-bottom: var(--s2); }
.kandidat ul { margin: 0; padding-left: 16px; font-size: 11px; color: var(--quiet-2); line-height: 1.6; }
.kandidat li b { color: #dfe6f5; }

.roster { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s4); }
.rostblock { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: var(--s3); }
.röst { display: flex; align-items: baseline; gap: var(--s3); padding: var(--s2) 0; border-top: 1px solid var(--line-soft); }
.röst:first-of-type { border-top: 0; }
.röst .etikett { flex: none; width: 58px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--quiet); }
.röst .ord { color: #f2f5fb; line-height: 1.15; white-space: nowrap; }

.summa { border-collapse: collapse; width: 100%; margin: var(--s3) 0 0; font-size: 12px; }
.summa th, .summa td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; }
.summa thead th { background: var(--sunk); color: #fff; }
.summa tbody th { background: var(--sunk); color: #dfe6f5; width: 120px; }
.summa td.ok { color: var(--good); font-weight: 700; }
.summa td.warn { color: var(--warn); }

.vag2 { background: #2a2417; border: 1px solid #4a4230; border-radius: 12px; padding: var(--s4); margin: var(--s4) 0 0; color: #ffd98a; }
.vag2 h3 { color: #ffe9b8; }
.vag2 p { color: #e8d7a8; }
.vagg { margin-top: var(--s3); background: #171a23; border: 1px solid var(--line); border-radius: 10px; padding: var(--s3); color: var(--ink); max-width: 720px; }
.vagg .titel { font: 800 12px system-ui; color: #fff; margin-bottom: 6px; }
.vagg .rad2 { display: flex; align-items: center; gap: var(--s2); font-size: 12px; }
.vagg .prick { width: 10px; height: 10px; border-radius: 50%; background: var(--warn); flex: none; }
.vagg .tyst { color: var(--good); }
.vagg .prick.god { background: var(--good); }
.vagg .detalj { margin: 6px 0 0 18px; font-size: 11px; color: var(--quiet-2); }

.fotnot { margin-top: var(--s5); padding-top: var(--s4); border-top: 1px solid var(--line); font-size: 11px; color: var(--quiet); }
.fotnot ul { padding-left: 16px; line-height: 1.7; }
@media (max-width: 1100px) { .rad, .kandidater { grid-template-columns: repeat(2, 1fr); } .roster { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="protorad">
  <p><b>Prototyp · #420 · startramarnas typsnitt</b>
  Korten nedan är inte ritade för hand. De kommer ur <code>FRAMES</code> i <code>wizard/frames.ts</code>, är satta av <code>compile</code> i <code>packages/template</code> — den enda renderaren (E2) — i kortets verkliga mått 63 × 88 mm, och siffran under varje kort är vad <code>validateCard</code> svarade på båda korten.</p>
  <p class="sagt"><em>Varje typsnitt du ser här laddas ur en riktig woff2-fil på disk.</em> Roboto Condensed är exakt filen i <code>packages/web/src/fonts/</code> som filten redan skriver i (K20). De fem andra är hämtade ur Google Fonts genom samma par adresser som katalogen använder (#329) och ligger i <code>docs/ux-audits/2026-09-22/typsnitt/</code> med sitt ursprung i <code>HERKOMST.json</code>. Ingen kandidat är ett systemtypsnitt med ett lånat namn.</p>
</div>

<div class="ark">
<h1>Vad startramarna ska vara satta i</h1>
<p>I dag binder alla tre startramarna text till <code>Georgia, serif</code> och <code>system-ui</code>, och wizardens dokument sätter inga <code>fonts</code>. Den fysiska kontrollen (E5) flaggar varje familj versionen inte bär (B3) — alltså varje kort, alltid. Formgivarens första skärm i editorn har redan en varning på sig.</p>
<p>Fyra kolumner på varje ram: <b>I dag</b> som baslinje, och tre sätt att låta ramen bära ett typsnitt som följer med spelet.</p>

<div class="kandidater">${kandidatHtml}</div>

${ramarHtml}

<section class="ram">
  <h2>Klassisk, det andra kortet <span class="led">— kortare text, längre rubrik</span></h2>
  <div class="rad">${andraHtml}</div>
</section>

<section class="ram" id="roster">
  <h2>Håller de tre ramarna isär?</h2>
  <p>Samma ord ur varje ram, i den grad ramen sätter rubriken i, förstorat två gånger. Tre röster är tre ramar; en röst tre gånger är en ram.</p>
  <div class="roster">${rösterHtml}</div>
</section>

<section class="ram">
  <h2>Väg 1: går den fysiska kontrollen till noll?</h2>
  <p>Räknat på båda korten, alla anmärkningar och inte bara typsnittets.</p>
  ${summaHtml}
</section>

<section class="ram">
  <h2>Väg 2: varningen får vänta</h2>
  <div class="vag2">
    <h3>Vad det betyder i kortväggen</h3>
    <p>Ramarna står kvar i <code>Georgia</code> och <code>system-ui</code>, och kontrollen tiger om typsnittet tills formgivaren gjort något — bytt en familj, laddat upp en fil, rört mallen.</p>
    <div class="vagg">
      <div class="titel">Fysisk kontroll, formgivarens första skärm</div>
      <div class="rad2 tyst"><span class="prick god"></span> <span><b>Väg 1:</b> noll anmärkningar — och kortet <i>är</i> tryckbart</span></div>
      <p class="detalj">Ramen bär ett ansikte versionen håller. Filen följer med projektet, och trycket blir det formgivaren såg.</p>
      <div class="rad2"><span class="prick"></span> <span><b>Väg 2:</b> noll anmärkningar — men kortet är inte tryckbart</span></div>
      <p class="detalj">Väggen är lika tyst som i väg 1, och felet finns kvar: <code>system-ui</code> är ett ansikte på formgivarens Mac, ett annat i renderarens Chromium och ett tredje hos tryckeriet. Varningen är sann från första sekunden — att skjuta upp den är att låta kontrollen säga något annat än vad som gäller, och formgivaren får veta först när hon rört något annat eller står med trycket i handen.</p>
    </div>
  </div>
</section>

<div class="fotnot">
  <b>Vad som är mätt och vad som är påstått</b>
  <ul>
    <li><b>Mätt:</b> kortens geometri och sättning (<code>compile</code>), och antalet anmärkningar (<code>validateCard</code>) på båda korten i varje ruta.</li>
    <li><b>Mätt:</b> sättningen efter <code>fitInDocument</code> — samma slinga editorn kör — och graden varje textruta landade på står under kortet. Ett typsnitt som inte får plats syns som en lägre grad, inte som ett tyst överflöd.</li>
    <li><b>Mätt:</b> att varje familj laddas ur sin egen fil. Sidan skriver inga egna <code>@font-face</code>: varje ansikte kommer ur <code>compile</code>s egen regel, exakt den renderaren får.</li>
    <li><b>Påstått:</b> ingenting om vikt eller läsbarhet som inte syns i bilden. <code>Oswald</code> bär 200–700 och ramen Mörk ber om 800; vad webbläsaren gör med den skillnaden står i bilden och ingen annanstans.</li>
    <li><b>Utanför prototypen:</b> hur filen hamnar i projektet. Två vägar finns: skeppa bytesen med bygget som K20 redan gör, eller låta wizarden hämta familjen genom katalogens väg (#329) när spelet skapas. Det är ett beslut om drift, inte om form.</li>
  </ul>
</div>
</div>

<script type="module">
// fitInDocument ur packages/template/src/dom-fit.ts, ord för ord. Utan den läser man en
// sättning editorn aldrig visar: en textruta med data-fit="shrink" kliver ner en halv punkt i
// taget tills orden får plats, och hur långt den måste kliva beror på just typsnittet.
function fitInDocument(root) {
  const out = []
  for (const el of root.querySelectorAll('[data-element][data-fit]')) {
    const start = Number(el.dataset['sizePt'])
    const min = Number(el.dataset['minPt'])
    const shrink = el.dataset['fit'] === 'shrink'
    let size = start
    el.style.fontSize = size + 'pt'
    const overflows = () => el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5
    if (shrink) {
      while (overflows() && size - 0.5 >= min - 1e-9) {
        size -= 0.5
        el.style.fontSize = size + 'pt'
      }
    }
    out.push({ element: el.dataset['element'] ?? '', sizePt: size, start, overflow: overflows() })
  }
  return out
}

await document.fonts.ready
for (const kortyta of document.querySelectorAll('.kortyta')) fitInDocument(kortyta)

for (const rad of document.querySelectorAll('.fit')) {
  const kortyta = document.getElementById(rad.dataset['for'])
  const mätt = fitInDocument(kortyta)
  rad.innerHTML = mätt
    .map((m) => {
      const krympt = m.sizePt < m.start
      return '<span class="' + (krympt ? 'krympt' : '') + '">' + m.element + ' <b>' + m.sizePt + ' pt</b>' + (krympt ? ' (av ' + m.start + ')' : '') + '</span>'
    })
    .join(' · ')
}
</script>
</body>
</html>
`

writeFileSync(`${HÄR}prototyper/01-startramarnas-typsnitt.html`, sida)
console.table(sammanställning)
console.log('skrev prototyper/01-startramarnas-typsnitt.html')
