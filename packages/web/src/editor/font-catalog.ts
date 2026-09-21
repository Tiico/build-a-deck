// Google Fonts as the editor's picker knows it (#329, L27).
//
// The list of families is data the build carries and not something fetched: the two endpoints
// that could answer «which families are there» — `fonts.google.com/metadata/fonts` and
// `download/list` — send no `Access-Control-Allow-Origin`, so a browser cannot read either. What
// *is* CORS-open is `fonts.googleapis.com/css2` and `fonts.gstatic.com`, which is exactly the
// pair the approved prototype used: the catalog is a list here, and Google is reached only for
// the faces themselves — the samples when the picker opens, and the file when a family is chosen.
//
// That is also what keeps DRIFT §12 true. Nothing here runs on the server, and nothing runs at
// page load: `google-fonts.ts` is behind a dynamic import that the opening of the picker is the
// only caller of.
export type CatalogFamily = {
  family: string
  category: string
  licence: string
  by: string
  // What `css2` is asked for after `wght@`: `min..max` for a family with a weight axis, which
  // brings down the whole variable file rather than the weights the template happens to use
  // (L27), and a `;`-separated list of the weights a static family was drawn in.
  weights: string
}

// One family per line, `family|category|licence|by|weights`. A line and not JSON because the
// file is generated and read and never hand-edited, and a line is a third of the bytes.
export function parseCatalog(text: string): CatalogFamily[] {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [family = '', category = '', licence = '', by = '', weights = ''] = line.split('|')
      return { family, category, licence, by, weights }
    })
}

export type CatalogQuery = { query: string; category: string }

export function searchCatalog(families: CatalogFamily[], { query, category }: CatalogQuery): CatalogFamily[] {
  const wanted = query.trim().toLowerCase()
  return families.filter((f) => (category === 'alla' || f.category === category) && (wanted === '' || f.family.toLowerCase().includes(wanted)))
}

// The one address every face on a page of hits is drawn from. `css2` is CORS-open and takes a
// list, so a page of twenty-four families is one request and not twenty-four — which is also
// what makes the privacy criterion countable: the picker's whole traffic is this sheet, and
// nothing asks for it until the picker is opened.
export const GOOGLE_CSS = 'https://fonts.googleapis.com/css2'

export function sampleSheetHref(families: CatalogFamily[]): string | null {
  if (families.length === 0) return null
  const asked = families.map((f) => `family=${f.family.replace(/ /g, '+')}:wght@${f.weights}`).join('&')
  return `${GOOGLE_CSS}?${asked}&display=swap`
}

export const isVariable = (family: CatalogFamily): boolean => family.weights.includes('..')

// What the chosen family's own sheet is asked for. A variable family is asked for its whole
// axis, which is one file that every weight is drawn from (L27); a family drawn in separate
// weights is asked for its regular, because the project holds one asset per family and asking
// for all of them would only be asking which of them to throw away.
export function fileSheetHref(family: CatalogFamily): string {
  return `${GOOGLE_CSS}?family=${family.family.replace(/ /g, '+')}:wght@${isVariable(family) ? family.weights : '400'}&display=swap`
}

// The cut the card is set in. `css2` answers with one `@font-face` per subset, each named in a
// comment above it, and the project carries one file — so which one is a choice and not an
// accident: latin is the one the tool's own text is written in, and taking the first block would
// take latin-ext, whose glyphs are the ones latin does not need.
export function fileInSheet(css: string): string {
  const blocks = [...css.matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\/[\s\S]*?url\((https:\/\/[^)]+)\)/g)]
  const latin = blocks.find((m) => m[1] === 'latin') ?? blocks.at(-1)
  const url = latin?.[2]
  if (url === undefined) throw new Error('no font file in the sheet')
  return url
}

// How old the list may be before the gate goes red (#370, L27). Six months, because a
// half-year-old catalog is still ~1 800 usable families: the limit alarms on neglect, not on
// normal operation. There is no scheduler — the stamp travels in the generated file and the
// suite reads it, so the age is a fact on disk and the failure lands in the same gate as
// everything else.
export const CATALOG_MAX_AGE_MONTHS = 6

// The one thing that fixes a red gate, spelled out so whoever meets it does not have to guess.
export const CATALOG_COMMAND = 'pnpm --filter @byd/web exec tsx scripts/google-fonts.ts'

// `YYYY-MM-DD` and nothing else, read strictly and round-tripped: `new Date` would take a
// half-written stamp, a month of 31 February or a sentence and answer with a date or with
// `Invalid Date`, and both of those read as «not older than six months». A stamp that cannot be
// read is a broken gate, so it is an error and not a silence.
export function catalogStamp(stamp: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) throw new Error(`the catalog stamp is not a YYYY-MM-DD date: ${JSON.stringify(stamp)} — re-run \`${CATALOG_COMMAND}\``)
  const date = new Date(`${stamp}T00:00:00Z`)
  if (date.toISOString().slice(0, 10) !== stamp) throw new Error(`the catalog stamp is not a day that exists: ${stamp} — re-run \`${CATALOG_COMMAND}\``)
  return date
}

export function staleCatalogMessage(stamp: string, now: Date): string | null {
  const generated = catalogStamp(stamp)
  const limit = new Date(generated)
  limit.setUTCMonth(limit.getUTCMonth() + CATALOG_MAX_AGE_MONTHS)
  if (now < limit) return null
  return `The Google Fonts catalog in \`google-fonts.ts\` was generated ${stamp} and is older than ${CATALOG_MAX_AGE_MONTHS} months (today is ${now.toISOString().slice(0, 10)}). Re-run \`${CATALOG_COMMAND}\` and commit the result (#370, L27).`
}
