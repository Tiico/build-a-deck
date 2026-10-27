import { useMemo, type ReactNode } from 'react'
import { BOX_TYPES, TypeRegistry, boxFaceSize, boxFaceType } from '@byd/engine'
import { COVER_FACES, type CoverFace, type GameCover } from '@byd/server/doc'
import { CardPreview } from '../editor/CardPreview.js'
import { PX_PER_MM } from '../editor/canvas.js'
import { previewIcons } from '../editor/assets.js'
import { previewFonts } from '../editor/fonts.js'

// Lådan i heron (#1416, L91), i runda 1:s variant C och runda 2:s steg 4: lådan står stilla och lite
// snett bakom lekens första kort, så att spelet känns igen från raden. Ingen rotation, ingen rörelse
// och inget ljus; det som vrider sig hör bara till «Visa upp» (#1414). Lådan har sitt eget plan för
// framsidan och högra sidan, och varje yta ritas av den enda `CardPreview` i ytans eget mått
// (E2). Den ritar alltså aldrig en yta själv, och en låda som inte är ritad är den neutrala ytan som
// `boxFaceOf` ger.
//
// Platsen är fast från första skärmen (G1): ramen är lika stor vare sig ytorna har landat eller inte,
// och kortet står alltid på samma ställe i den. Lådan ställer sig bakom kortet när den landar, och
// ingenting runt omkring flyttar sig.

// Ramen och kortet i den, i CSS-pixlar. Stylesheeten reserverar ramen ur samma tal.
export const HOME_COVER_W = 236
export const HOME_COVER_H = 216
export const HOME_COVER_CARD_H = 140
const CARD_W = (HOME_COVER_CARD_H * 63) / 88
// Var kortet står: dess vänsterkant och överkant i ramen.
const CARD_X = HOME_COVER_W - 24 - CARD_W
const CARD_Y = HOME_COVER_H - 6 - HOME_COVER_CARD_H
// Hur lådan står, som i prototypen: vriden 24° så att högra sidan syns, i ögonhöjd. Och hur långt in
// under kortet framsidans högra kant går: kortet lutar 7° kring sin nederkant, så dess vänstra kant
// går från framsidans högra hörn upptill till 14 px in på den nedtill. Längre in skymmer kortet slutet
// på spelets namn på en låda som inte är ritad, eftersom namnet står mitt på framsidan och fyller den.
const TURN = 24
const UNDER = 14
// Framsidans högra kant, `UNDER` px in under kortet: lådan står bakom det och sidan går in under det.
const FRONT_RIGHT = CARD_X + UNDER

const BOXES = new TypeRegistry(BOX_TYPES)
const cos = Math.cos((TURN * Math.PI) / 180)
const sin = Math.sin((TURN * Math.PI) / 180)

// Lådans plan i ramen: hur många px en mm är, lådans mått i px och var dess kropp står. Vriden kring
// sin mitt står framsidan från mitten − w·cos/2 − d·sin/2 till mitten + w·cos/2 − d·sin/2, och
// sidan därifrån till mitten + w·cos/2 + d·sin/2. Lådan får vara så hög som ramen tillåter, så länge
// framsidan ryms till vänster om kortet och sidan inte går ut ur ramen till höger.
export function coverLayout(size: GameCover['size']): { px: number; w: number; h: number; d: number; left: number; top: number } {
  const px = Math.min((HOME_COVER_H - 20) / size.height, (FRONT_RIGHT - 4) / (size.width * cos), (HOME_COVER_W - FRONT_RIGHT - 4) / Math.max(size.depth * sin, 1e-6))
  const [w, h, d] = [size.width * px, size.height * px, size.depth * px]
  const centre = FRONT_RIGHT - (w * cos) / 2 + (d * sin) / 2
  return { px, w, h, d, left: centre - w / 2, top: (HOME_COVER_H - 20 - h) / 2 + 6 }
}

// Hur varje yta står på lådans kropp, som i prototypens `lada3d`.
const placed = (face: CoverFace, w: number, h: number, d: number): { width: number; height: number; left: number; top: number; transform: string } => {
  switch (face) {
    case 'front':
      return { width: w, height: h, left: 0, top: 0, transform: `translateZ(${d / 2}px)` }
    case 'right':
      return { width: d, height: h, left: (w - d) / 2, top: 0, transform: `rotateY(90deg) translateZ(${w / 2}px)` }
  }
}

export function HeroBox({ project, cover, assetBase, label, card }: { project: string; cover: GameCover | null; assetBase: string; label: string; card: ReactNode }) {
  return (
    <span className="byd-home-box" role="img" aria-label={label} style={{ width: HOME_COVER_W, height: HOME_COVER_H }}>
      {cover && <Box project={project} cover={cover} assetBase={assetBase} />}
      <span className="byd-home-box-card" style={{ left: CARD_X, top: CARD_Y }}>
        {card}
      </span>
    </span>
  )
}

function Box({ project, cover, assetBase }: { project: string; cover: GameCover; assetBase: string }) {
  const type = useMemo(() => BOXES.box(cover.type), [cover.type])
  const layout = coverLayout(cover.size)
  // Resolved once per cover and held by identity, as the card on a row is (#320).
  const icons = useMemo(() => previewIcons({ icons: cover.icons }, assetBase), [cover, assetBase])
  const fonts = useMemo(() => previewFonts({ template: { faces: Object.fromEntries(COVER_FACES.map((f) => [f, cover.faces[f].template])) }, ...(cover.fonts ? { fonts: cover.fonts } : {}) }, assetBase), [cover, assetBase])
  const { w, h, d } = layout
  return (
    <span className="byd-home-box-scene" aria-hidden="true" style={{ left: layout.left, top: layout.top, width: w, height: h }}>
      <span className="byd-home-box-body" style={{ transform: `rotateY(${-TURN}deg)` }}>
        {COVER_FACES.map((face) => {
          const at = placed(face, w, h, d)
          const mm = boxFaceSize(face, cover.size)
          return (
            <span key={face} className="byd-home-box-face" data-box-face={face} style={{ width: at.width, height: at.height, left: at.left, top: at.top, transform: at.transform }}>
              <CardPreview id={`home-${project}-box-${face}`} type={boxFaceType(type, face, cover.size)} face={cover.faces[face].template} row={{}} icons={icons} fonts={fonts} assetBase={assetBase} palette={cover.palette} scale={at.width / (mm.widthMm * PX_PER_MM)} />
            </span>
          )
        })}
      </span>
    </span>
  )
}
