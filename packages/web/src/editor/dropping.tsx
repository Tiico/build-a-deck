import type { DragEvent, HTMLAttributes } from 'react'
import { ASSET_DRAG_TYPE } from './assets.js'
import { useT, type T } from '../i18n/index.js'

// Uppladdningsytorna, och vad ett släpp på en av dem är (#291, L22, variant B).
//
// Beslutet är att ytan där en bild kan väljas också är ytan som tar emot den: bibliotekets
// bildyta i Media, det aktuella bildfältet i Data — cellens ruta och massredigeringens — och
// guidens bildfält. Ingen egen släppruta vid sidan av, ingen uppladdningsspalt. Filväljaren,
// formatreglerna och återkopplingen är dragflödets egna; det är samma väg in, öppnad två gånger.
//
// Två helt olika saker kan landa på samma ruta, och ytan måste kunna skilja dem åt innan den gör
// något alls. En biblioteksbild som dras ur Datas bildremsa bär sin hash under verktygets eget
// dragtypnamn: den är redan uppladdad, och att ladda upp den igen vore att göra en bild av två.
// En fil från formgivarens egen skrivbordsyta bär inget sådant namn och har bara sina byte.
//
// Läsningen är privat för den här modulen med flit. Så länge `droppedOn` inte går att nå utifrån
// kan ingen yta ta emot en fil utan att gå genom `dropSurface`, och då bär varje mottagare samma
// klass och samma markering. En åttonde yta kan alltså inte smyga in en egen färg: den har ingen
// egen väg in att smyga den på.
type Dropped = { kind: 'library'; hash: string } | { kind: 'files'; files: File[] } | { kind: 'nothing' }

function droppedOn(data: DataTransfer | null | undefined): Dropped {
  // Biblioteksbilden först: den är ett svar och filerna är ett annat, och en dragbild som råkar
  // bära båda är fortfarande den bild formgivaren höll i handen.
  const hash = data?.getData(ASSET_DRAG_TYPE) ?? ''
  if (hash) return { kind: 'library', hash }
  const files = [...(data?.files ?? [])]
  return files.length > 0 ? { kind: 'files', files } : { kind: 'nothing' }
}

// Klassen varje mottagande yta bär, och den enda kroken markeringen ritas genom. Färgen står i
// `dropping.css` och ingen annanstans.
export const DROP_SURFACE = 'byd-drop'

export type DropSurface = {
  // Om draget står över just den här ytan. Ett släpp får aldrig oavsiktligt ändra ett annat mål,
  // så ytan äger sitt eget svar på frågan och ärver ingens.
  over: boolean
  onOver(over: boolean): void
  onFiles(files: File[]): void
  // En biblioteksbild som återanvänds utan ny uppladdning (E1). En yta utan det här svaret —
  // biblioteket självt, guiden — låter en sådan dragbild ligga.
  onLibrary?: ((hash: string) => void) | undefined
  className?: string | undefined
}

// Vad en mottagande yta ska bära. Skrivet en gång, så att ingen yta kan ha sin egen mening om
// vad ett släpp är eller om hur det ser ut när ett drag står över den.
export function dropSurface({ over, onOver, onFiles, onLibrary, className }: DropSurface): HTMLAttributes<HTMLElement> & { className: string; 'data-over'?: 'true' } {
  return {
    className: className === undefined ? DROP_SURFACE : `${className} ${DROP_SURFACE}`,
    ...(over ? { 'data-over': 'true' as const } : {}),
    onDragOver: (event: DragEvent<HTMLElement>) => {
      // Utan det här öppnar webbläsaren filen som en ny sida i stället för att lämna den hit.
      event.preventDefault()
      onOver(true)
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      // En `dragleave` betyder inte alltid att draget lämnade ytan: den fyras av också när
      // pekaren går från ytan ner på något som står i den — en bricka i biblioteket, knappen i
      // rutan. Markeringen skulle då blinka i takt med att pekaren rör sig över sina egna barn.
      const to = event.relatedTarget
      if (to instanceof Node && event.currentTarget.contains(to)) return
      onOver(false)
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      // Markeringen försvinner när släppet är gjort, precis som när draget lämnar ytan.
      onOver(false)
      const dropped = droppedOn(event.dataTransfer)
      if (dropped.kind === 'library') onLibrary?.(dropped.hash)
      else if (dropped.kind === 'files') onFiles(dropped.files)
    },
  }
}

// Markeringen kompletteras med text om vad som tas emot (#291, HITL). En ram som lyser säger att
// något kan släppas; den säger inte *vad*, och skillnaden mellan en yta som tar en bild och en
// som tar flera är hela skillnaden mellan de här ytorna.
export function DropSays({ many }: { many?: boolean }) {
  const t = useT()
  return (
    <span className="byd-drop-says" aria-hidden="true">
      {t(many ? 'upload.drop.many' : 'upload.drop.one')}
    </span>
  )
}

// Ett enskilt bildfält tar en bild (#291). Flera filer på ett sådant fält är en fråga utan svar —
// vilken av dem skulle fältet få? — och tyst första fil är det enda felaktiga svaret, eftersom det
// är det enda som ser ut som ett svar. Så fältet står kvar som det var och säger varför.
export function oneFile(files: readonly File[], t: T): { file: File } | { said: string } | null {
  if (files.length === 0) return null
  const first = files[0]
  if (files.length > 1 || !first) return { said: t('upload.one.only', { n: files.length }) }
  return { file: first }
}
