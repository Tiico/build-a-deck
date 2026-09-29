import { useEffect, useRef } from 'react'
import { useDoor } from '../doors.js'
import { useT } from '../i18n/index.js'
import { CAMERA_STEP } from './camera.js'
import './camera-hand.css'

// Kamerans hörn, hämtat först när vyn är egen (#325, #346:s väg).
//
// Ingenting i den här modulen ritas på första bildrutan: kameran ramar in själv tills någon tar
// över, så klungan finns inte när sidan målas. `camera-hand.css` följer därför med hit i stället
// för att ligga i det blockerande arket, och renderaren hämtar modulen med `lazy()` inuti
// `Suspense`. Att det är en dynamisk import och inte ett senare `<link>` är vad som gör flytten
// ofarlig: bygget lägger chunkens ark bredvid dess kod, så `import()` blir klar först när båda är
// framme, och klungan kan aldrig visas oklädd.

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
  // Take the focus onto the step in when the cluster appears (#502): on /online it takes the place
  // of the lens's own way in, and the focus that stood on that button has nowhere else to go.
  focusIn?: boolean | undefined
}

export function CameraControls({ level, folded, onFold, onZoom, onWhole, focusIn = false }: CameraControlsProps) {
  const stepIn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focusIn) stepIn.current?.focus()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the focus is taken once, when the cluster appears
  }, [])
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
          <button type="button" ref={stepIn} className="byd-camera-step" aria-label={t('camera.zoom.in')} onClick={() => onZoom(1 / CAMERA_STEP)}>
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

// The lens's way in on /online (#502): one step, in the corner the cluster stands in once the felt
// is enlarged. Nothing enlarges by itself there, so the way in is seen and not only known.
export function LensEntry({ onZoom, focusIn = false }: { onZoom(): void; focusIn?: boolean | undefined }) {
  const t = useT()
  const step = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focusIn) step.current?.focus()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the focus is taken once, when the way in appears
  }, [])
  return (
    <div className="byd-camera-controls" data-lens-entry role="group" aria-label={t('camera.controls')}>
      <button type="button" ref={step} className="byd-camera-step" aria-label={t('camera.zoom.in')} onClick={onZoom}>
        +
      </button>
    </div>
  )
}

