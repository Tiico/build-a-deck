import { catalogFaceSource, catalogFont, type CatalogFamily, fileInSheet, fileSheetHref } from '../editor/font-catalog.js'
import { assetRef, assetRefOf } from '../editor/assets.js'
import { withCredentials } from '../account/api.js'
import type { T } from '../i18n/index.js'
import { NotMade } from './not-made.js'
import { iconsOf, starterSet, themeFamilies, themeIconFiles, type Theme } from '../editor/themes.js'
import type { ThemeFiles } from './build.js'

// Hur temats ansikten hamnar i projektet (#420, B3, L27). Förut var det ramens ansikte; sedan
// «Utseende» (L57, #633) är det temats rubrik- och brödtextfamilj, och resonemanget är detsamma.
//
// Ett typsnitt som bara är ett namn i mallen är inget typsnitt: renderaren, formgivarens skärm
// och tryckeriet sätter då var sitt ansikte, och det är precis det den fysiska kontrollen (E5)
// varnar för. Så ramen binder inte en familj utan att också skicka med dess fil, och filen reser
// som projektets egen asset — samma väg, och samma bytes, som när formgivaren själv väljer en
// familj ur katalogen. Ingen ny fil läggs i produktens eget bygge för den här saken.
//
// Bytesen hämtas en gång, när «Skapa spelet» trycks, och laddas upp dit varje annan asset går
// (`POST /assets`). Därefter beror projektet inte på Google: filen ligger på tjänsten och
// versionen pinnar den (B3).
//
// Priset är erkänt och står i L27 redan: katalogen nås från formgivarens webbläsare, så «Skapa
// spelet» behöver nät. Den tystas inte bort — att skapa en lek som säger sig bära ett ansikte den
// inte har är precis felet som lagas här — utan sägs med katalogens egna ord.

// Filens bytes, ur katalogens par av adresser (L27): arket som svarar var filen ligger, och sedan
// filen. Hela variabelfilen när familjen har en, så att en vikt vald ett år senare inte kräver
// Google igen.
// A file address the preview has already read out of the sheet (#476) is used as it is, so the
// sheet is not asked for twice.
async function bytesOf(catalog: CatalogFamily, t: T, known?: string): Promise<Uint8Array<ArrayBuffer>> {
  const said = () => new Error(t('fonts.catalog.silent'))
  let src = known
  if (!src) {
    const sheet = await fetch(fileSheetHref(catalog)).catch(() => null)
    if (!sheet?.ok) throw said()
    src = fileInSheet(await sheet.text())
  }
  const file = await fetch(src).catch(() => null)
  if (!file?.ok) throw said()
  return new Uint8Array(await file.arrayBuffer())
}

// One file up to the service, and the name it is given checked against the name its bytes have.
// Asseten heter hashen av sina bytes och ingenting annat, så namnet går att räkna ut på den här
// sidan också. Håller de två inte med varandra pekar dokumentet på ingenting, och det ska sägas
// här och inte vid tryck ett år senare.
async function upload(http: string, type: string, bytes: Uint8Array<ArrayBuffer>): Promise<string | 'login'> {
  const res = await fetch(`${http}/assets`, withCredentials({ method: 'POST', headers: { 'content-type': type }, body: bytes }))
  if (res.status === 401) return 'login'
  if (!res.ok) throw new NotMade('wizard.error.upload')
  const ref = assetRef(((await res.json()) as { hash: string }).hash)
  const own = await assetRefOf(bytes)
  if (ref !== own) throw new Error(`the service named the file ${ref} and its bytes say ${own}`)
  return ref
}

/**
 * Temats filer som spelet bär dem (L57, #633): varje familj med sin fil (#420, B3) och
 * startikonerna med sina (E1), redan uppladdade — det `buildProject` lägger temat över ramen med,
 * precis som när temat väljs i Speltema.
 *
 * `known` är filadresser förhandsvisningen redan läst ur katalogens ark när temat trycktes (#476),
 * så att arket inte frågas två gånger. `'login'` när tjänsten vill ha ett konto först, precis som
 * bilduppladdningen svarar — den guidade starten har en dörr tillbaka hit och ska inte tappa
 * utkastet på vägen.
 */
export async function uploadTheme(t: T, http: string, theme: Theme, known: Record<string, string | undefined> = {}): Promise<ThemeFiles | 'login'> {
  const fonts: ThemeFiles['fonts'] = {}
  for (const family of themeFamilies(theme)) {
    const ref = await upload(http, 'font/woff2', await bytesOf(family, t, known[family.family]))
    if (ref === 'login') return 'login'
    // Katalogposten vet sin licens och fyller i den, för tryckets skull, och `source` är vad listan
    // i editorn ska säga om posten (L27).
    fonts[family.family] = catalogFont(family, ref)
  }
  const starters = starterSet({ icons: {} }, theme, t, await themeIconFiles(theme))
  for (const { file } of starters) if ((await upload(http, file.type, file.bytes)) === 'login') return 'login'
  return { fonts, icons: iconsOf(starters) }
}

/**
 * Where the theme's faces can be drawn from before the game exists (#476): each family's file
 * address in the catalogue, read out of the same sheet `bytesOf` reads. Asked for when a theme is
 * pressed and not before (L27, DRIFT §12), so the preview stands in the faces the game will carry
 * instead of a fallback that lies about them (E2). `null` when the catalogue does not answer for
 * every family; the preview then keeps saying the faces are on their way rather than pretending.
 */
export async function themeFaceSources(theme: Theme): Promise<Record<string, { stack: string; src: string }> | null> {
  const found = await Promise.all(themeFamilies(theme).map(async (family) => [family.family, await catalogFaceSource(family)] as const))
  if (found.some(([, face]) => !face)) return null
  return Object.fromEntries(found) as Record<string, { stack: string; src: string }>
}
