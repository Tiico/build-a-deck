import type { ProjectFont } from '@byd/server'
import { catalogStack, type CatalogFamily, fileInSheet, fileSheetHref } from '../editor/font-catalog.js'
import { assetRef, assetRefOf } from '../editor/assets.js'
import { withCredentials } from '../account/api.js'
import type { T } from '../i18n/index.js'
import type { Frame } from './frames.js'

// Hur startramens ansikte hamnar i projektet (#420, B3, L27).
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
async function bytesOf(catalog: CatalogFamily, t: T): Promise<Uint8Array<ArrayBuffer>> {
  const said = () => new Error(t('fonts.catalog.silent'))
  const sheet = await fetch(fileSheetHref(catalog)).catch(() => null)
  if (!sheet?.ok) throw said()
  const file = await fetch(fileInSheet(await sheet.text())).catch(() => null)
  if (!file?.ok) throw said()
  return new Uint8Array(await file.arrayBuffer())
}

/**
 * Ramens typsnitt som dokumentets `fonts` (B3), med filen redan uppladdad.
 *
 * `'login'` när tjänsten vill ha ett konto först, precis som bilduppladdningen svarar — den
 * guidade starten har en dörr tillbaka hit och ska inte tappa utkastet på vägen.
 */
export async function uploadFrameFont(t: T, http: string, frame: Frame): Promise<Record<string, ProjectFont> | 'login'> {
  const catalog = frame.font
  const bytes = await bytesOf(catalog, t)
  const res = await fetch(`${http}/assets`, withCredentials({ method: 'POST', headers: { 'content-type': 'font/woff2' }, body: bytes }))
  if (res.status === 401) return 'login'
  if (!res.ok) throw new Error(t('wizard.error.upload', { status: res.status }))
  const ref = assetRef(((await res.json()) as { hash: string }).hash)
  // Asseten heter hashen av sina bytes och ingenting annat, så namnet går att räkna ut på den här
  // sidan också. Håller de två inte med varandra pekar dokumentet på ingenting, och det ska sägas
  // här och inte vid tryck ett år senare.
  const own = await assetRefOf(bytes)
  if (ref !== own) throw new Error(`the service named the font ${ref} and its bytes say ${own}`)
  // Katalogposten vet sin licens och fyller i den, för tryckets skull, och `source` är vad listan
  // i editorn ska säga om posten: en familj som kom vetande svaret får inte stå med två tomma
  // rutor formgivaren förväntas fylla i (L27).
  return { [catalog.family]: { stack: catalogStack(catalog.family, catalog.category), asset: ref, licence: { licence: catalog.licence, by: catalog.by }, source: 'catalog' } }
}
