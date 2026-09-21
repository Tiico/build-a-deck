import type { Snapshot } from '@byd/protocol'
import { useDoor } from '../doors.js'
import { useT } from '../i18n/index.js'
import { CAMERA_STEP, beyond, type Rect, type Sides } from './camera.js'
import './camera-hand.css'

// Kamerans hörn och dess ark, båda hämtade först när vyn är egen (#325, #346:s väg).
//
// Ingenting i den här modulen ritas på första bildrutan: kameran ramar in själv tills någon tar
// över, så klungan och kantmarkeringen finns inte när sidan målas. `camera-hand.css` följer
// därför med hit i stället för att ligga i det blockerande arket, och renderaren hämtar modulen
// med `lazy()` inuti `Suspense`. Att det är en dynamisk import och inte ett senare `<link>` är
// vad som gör flytten ofarlig: bygget lägger chunkens ark bredvid dess kod, så `import()` blir
// klar först när båda är framme, och klungan kan aldrig visas oklädd.

// Kantmarkeringen (#325). Vyn återgår aldrig av sig själv, inte heller när något flyttas utanför
// bilden — då tänds den här i stället, på den sida innehållet ligger, och bara medan vyn är egen.
//
// **Den nedre börjar ovanför docken.** Docken visar varje plats längs filtens nederkant, och en
// pil ritad över en plats är en markering som pekar på fel sak. Den nedre blir därmed kortare än
// de tre andra, vilket är rätt pris för att inte skriva över något som redan står där; hur högt
// den börjar står i `table.css` som `--byd-camera-dock`.
const SIDES = ['left', 'right', 'top', 'bottom'] as const

export function CameraEdges({ sides }: { sides: Sides }) {
  const t = useT()
  const lit = SIDES.filter((side) => sides[side])
  if (lit.length === 0) return null
  return (
    <>
      {lit.map((side) => (
        <div key={side} className="byd-camera-edge" data-side={side} aria-hidden="true">
          <b>‹</b>
        </div>
      ))}
      {/* Pilen är en bild, och en bild är ingenting för den som inte ser den. Meningen är samma
          sak sagd, en gång, där den hörs. */}
      <p className="byd-camera-said" role="status">
        {t('camera.beyond')}
      </p>
    </>
  )
}

// Kamerans kontroller på live-bordet (C5, #325).
//
// De bor i filtens nedre högra hörn och finns bara medan kameran är manuell. Placeringen var en
// mätbar fråga och inte en smakfråga: filten är höjdbunden, så en rad under den tar 56 px höjd
// och kostar varje kort 5 px i bredd — 6,3 % — medan en sidokolumn tar bredd och kostar kortet
// ingenting. Hörnet kostar noll under det mesta av ett spel, eftersom vyn då är automatisk och
// klungan inte finns. Priset är erkänt: den ligger över bordet när den syns.
//
// **Klungan går att fälla undan, men aldrig att stänga.** Fälld är den «Visa hela bordet ‹»:
// vägen hem och vägen tillbaka till knapparna, båda kvar. Det är kravet som gör undanfällningen
// ofarlig — en klunga som kunde stängas helt kunde lämna någon i en egen vy utan synlig väg ur
// den, och då är bordet låst i en bild ingen bad om. `Escape` finns kvar oavsett, men en väg som
// bara finns på tangentbordet är ingen väg på en TV.
export type CameraControlsProps = {
  // Hur nära vyn står, som andel av den automatiska inramningen: 100 % är hela bordet.
  level: number
  folded: boolean
  onFold(folded: boolean): void
  // Ett steg in eller ut, sagt som den faktor kamerans bredd ändras med.
  onZoom(factor: number): void
  onWhole(): void
}

export function CameraControls({ level, folded, onFold, onZoom, onWhole }: CameraControlsProps) {
  const t = useT()
  // Escape lämnar tillbaka vyn, och gör det i husets egen ordning (#152): en ring eller en panel
  // som öppnats sedan dess står närmare handen och svarar först. Dörren finns bara så länge det
  // finns en egen vy att lämna tillbaka, alltså exakt så länge klungan står här.
  useDoor('standing', onWhole)
  return (
    <div className="byd-camera-controls" data-folded={folded ? 'true' : undefined} role="group" aria-label={t('camera.controls')}>
      {!folded && (
        <>
          <button type="button" className="byd-camera-step" aria-label={t('camera.zoom.out')} onClick={() => onZoom(CAMERA_STEP)}>
            −
          </button>
          {/* Nivån är en avläsning och ingen kontroll, men den är det enda som säger hur långt
              in vyn står — och det är vad «egen vy» betyder i siffror. */}
          <span className="byd-camera-level">{t('camera.level', { n: level })}</span>
          <button type="button" className="byd-camera-step" aria-label={t('camera.zoom.in')} onClick={() => onZoom(1 / CAMERA_STEP)}>
            +
          </button>
        </>
      )}
      <button type="button" className="byd-camera-whole" onClick={onWhole}>
        {t('camera.whole')}
      </button>
      <button
        type="button"
        className="byd-camera-fold"
        aria-expanded={!folded}
        aria-label={t(folded ? 'camera.unfold' : 'camera.fold')}
        onClick={() => onFold(!folded)}
      >
        <span aria-hidden="true">{folded ? '‹' : '›'}</span>
      </button>
    </div>
  )
}

// Allt kameran lägger på filten medan vyn är egen, i ett enda ställe: renderaren hämtar den här
// och ingenting annat härifrån, så chunken — och dess ark — är precis det som bara finns då.
export type CameraHandProps = CameraControlsProps & { cam: Rect; view: Snapshot }

export function CameraHand({ cam, view, ...rest }: CameraHandProps) {
  return (
    <>
      <CameraEdges sides={beyond(cam, view)} />
      <CameraControls {...rest} />
    </>
  )
}
