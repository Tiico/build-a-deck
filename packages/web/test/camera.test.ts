import { describe, expect, it } from 'vitest'
import { CAMERA_MIN_MM, activeBounds, cameraOf, centre, fitFloor, frameRect, overscanPx, panBy, reachOf, zoomAround } from '../src/table/camera.js'
import { CARD_MM } from '../src/table/drop.js'
import { buildScene } from './scene.js'

// The camera (C5): a rectangle of the table, in millimetres, at the viewport's aspect.
const floor = { x: -500, y: -300, w: 1000, h: 600 }
const wide = { w: 1000, h: 500 }

describe('what is in play', () => {
  it('is the loose cards and the board: piles and areas, empty or not — never the hands, which sit at the rim', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    const b = activeBounds(snapshot)!
    const emptied = { ...snapshot, zones: snapshot.zones.map((z) => (z.id === 'discard' ? { ...z, mode: 'count' as const, count: 0 } : z)) }
    expect(activeBounds(emptied)).toEqual(b)
    // The scene: cards at (100, 50) and (300, 200) in the floor, which starts at (-500, -300);
    // the draw pile at (-200, 0) and the discard at (200, 0), each a card centred on its point
    // plus its label below. Hands at y = 320 and y = -420 do not count.
    expect(b.x).toBeCloseTo(-400)
    expect(b.y).toBeCloseTo(-250)
    expect(b.x + b.w).toBeCloseTo(200 + 63 / 2)
    expect(b.y + b.h).toBeCloseTo(88 / 2 + 24)
  })
})

describe('framing', () => {
  it('grows the target to the viewport aspect around its centre', () => {
    expect(frameRect({ x: 0, y: 0, w: 200, h: 200 }, wide, floor, 0)).toEqual({ x: -100, y: 0, w: 400, h: 200 })
    expect(frameRect({ x: 0, y: 0, w: 400, h: 100 }, wide, floor, 0)).toEqual({ x: 0, y: -50, w: 400, h: 200 })
  })

  it('never goes closer than the minimum width, and never wider than the floor and its content', () => {
    expect(frameRect({ x: 0, y: 0, w: 100, h: 50 }, wide, floor, 400)).toEqual({ x: -150, y: -75, w: 400, h: 200 })
    expect(frameRect(floor, wide, floor, 0)).toEqual(fitFloor(floor, wide))
    expect(fitFloor(floor, wide)).toEqual({ x: -600, y: -300, w: 1200, h: 600 })
  })

  it('stays inside the floor as fitted, so the camera never shows the void', () => {
    expect(frameRect({ x: 400, y: 200, w: 200, h: 100 }, wide, floor, 0)).toEqual({ x: 400, y: 200, w: 200, h: 100 })
    // Growing to the aspect would take this one past the rim; it is pulled back onto the table,
    // and the content it was given still lies inside it.
    expect(frameRect({ x: 300, y: 250, w: 200, h: 25 }, wide, floor, 0)).toEqual({ x: 300, y: 200, w: 200, h: 100 })
  })

  it('follows what lies beyond the rim rather than slicing it (#20)', () => {
    // A split beside a pile at the edge can land a card off the felt. A sliver of the void beyond
    // the table's border is a frame; half a card at the screen's edge reads as a bug.
    const stray = { x: 480, y: 280, w: 200, h: 100 }
    expect(frameRect(stray, wide, reachOf(floor, stray), 0)).toEqual(stray)
    // Nothing in play beyond the rim, nothing to reach for: the floor and no more.
    expect(reachOf(floor, { x: -100, y: -100, w: 200, h: 200 })).toEqual(floor)
    expect(reachOf(floor, null)).toEqual(floor)
  })

  it('does not let a zoom widen what the camera may see', () => {
    // Zooming out is a view, not content: it stops at the reach, however far out it asks to go.
    const stray = { x: 480, y: 280, w: 200, h: 100 }
    const reach = reachOf(floor, stray)
    expect(zoomAround(fitFloor(reach, wide), { x: 0, y: 0 }, 8, wide, reach, 0)).toEqual(fitFloor(reach, wide))
  })

  it('zooms around a point by a factor, and the scale follows from the width', () => {
    const whole = fitFloor(floor, wide)
    const z = zoomAround(whole, { x: 100, y: 50 }, 0.5, wide, floor, 200)
    expect(z).toEqual({ x: -200, y: -100, w: 600, h: 300 })
    expect(cameraOf(z, wide, floor)).toEqual({ scale: 1000 / 600, left: -(z.x - floor.x) * (1000 / 600), top: -(z.y - floor.y) * (1000 / 600) })
    // Zooming out past the floor lands on the whole floor.
    expect(zoomAround(z, { x: 100, y: 50 }, 4, wide, floor, 200)).toEqual(whole)
  })
})

// Panorering (#325): kameran flyttas av en hand, och kan inte lämna räckvidden.
describe('panning', () => {
  // `fitFloor(floor, wide)` är { x: -600, y: -300, w: 1200, h: 600 }: allt kameran får se.
  const cam = { x: 0, y: 0, w: 400, h: 200 }

  it('moves the camera by what the hand asked for', () => {
    expect(panBy(cam, 50, 20, wide, floor)).toEqual({ x: 50, y: 20, w: 400, h: 200 })
    expect(panBy(cam, -50, -20, wide, floor)).toEqual({ x: -50, y: -20, w: 400, h: 200 })
  })

  it('never lets the camera leave the reach, however far the hand goes', () => {
    expect(panBy(cam, 5000, 5000, wide, floor)).toEqual({ x: 200, y: 100, w: 400, h: 200 })
    expect(panBy(cam, -5000, -5000, wide, floor)).toEqual({ x: -600, y: -300, w: 400, h: 200 })
    // Och räckvidden är bordet plus det som är i spel utanför det (#20), inte bordet ensamt.
    const stray = { x: 1000, y: 0, w: 200, h: 100 }
    expect(panBy(cam, 5000, 0, wide, reachOf(floor, stray)).x).toBeGreaterThan(200)
  })

  it('has nowhere to go while the whole reach is already in the picture', () => {
    const whole = fitFloor(floor, wide)
    expect(panBy(whole, 500, 500, wide, floor)).toEqual(whole)
  })
})

// Hur nära kameran får komma (#392). Gränsen finns för att en bild av ingenting inte är en bild,
// men den satt på åtta kortbredder, och det är en översikt till. Den som zoomar in på en hög gör
// det för att läsa ett kort, så den närmaste vyn är ett kort och det som ligger bredvid det.
describe('hur nära kameran får komma', () => {
  it('stannar vid ungefär tre kortbredder, så ett kort och dess grannar fyller bilden', () => {
    const whole = fitFloor(floor, wide)
    const closest = zoomAround(whole, centre(whole), 1 / 100, wide, floor, CAMERA_MIN_MM)
    expect(closest.w / CARD_MM.w).toBeGreaterThan(3)
    expect(closest.w / CARD_MM.w).toBeLessThan(3.5)
  })
})

// The TV's overscan (#322): a TV may hide the outer edge of the picture it is sent, so the
// automatic framing keeps 3 % of the viewport's shortest side clear on every side.
describe('the overscan margin (#322)', () => {
  // 1000 × 500 px, so the margin is 15 px and the picture inside it 970 × 470.
  const vp = { w: 1000, h: 500 }
  const margin = overscanPx(vp)

  it('is 3 % of the viewport\'s shortest side', () => {
    expect(margin).toBe(15)
    expect(overscanPx({ w: 1920, h: 1080 })).toBeCloseTo(32.4)
    expect(overscanPx({ w: 1080, h: 1920 })).toBeCloseTo(32.4)
  })

  it('fits the floor inside the margin: the framed rectangle is the floor plus the margin on all four sides', () => {
    // A floor as tall as the picture inside the margin, 470 mm, lands at one pixel per
    // millimetre: the camera is then the whole viewport, 15 mm outside the floor top and bottom.
    expect(fitFloor({ x: 0, y: 0, w: 400, h: 470 }, vp, margin)).toEqual({ x: -300, y: -15, w: 1000, h: 500 })
    // A floor as wide as the picture inside the margin, 970 mm: 15 mm outside it left and right.
    expect(fitFloor({ x: 0, y: 0, w: 970, h: 200 }, vp, margin)).toEqual({ x: -15, y: -150, w: 1000, h: 500 })
    // Without the margin, the floor meets the viewport's edge as before.
    expect(fitFloor({ x: 0, y: 0, w: 400, h: 470 }, vp)).toEqual({ x: -270, y: 0, w: 940, h: 470 })
  })

  it('bounds the automatic framing: what the camera is pointed at stays inside the margin', () => {
    // A target with the inner picture's own shape, ten times smaller: framed at ten pixels per
    // millimetre it fills the 970 × 470 inside the margin, and the camera is 1.5 mm outside it.
    expect(frameRect({ x: 0, y: 0, w: 97, h: 47 }, vp, floor, 0, margin)).toEqual({ x: -1.5, y: -1.5, w: 100, h: 50 })
    // The whole floor, framed automatically, is the floor plus the margin.
    expect(frameRect(floor, vp, floor, 0, margin)).toEqual(fitFloor(floor, vp, margin))
    // Zoomed all the way out by hand, the camera reaches the floor's edge: the margin bounds the
    // automatic framing, not what a person zooms to.
    expect(zoomAround(fitFloor(floor, vp, margin), { x: 0, y: 0 }, 8, vp, floor, 0)).toEqual(fitFloor(floor, vp))
  })
})

// Det andra villkoret på bilden, med egen luft (#413).
//
// Vad kameran pekas på är spelet, och luften omkring det är TV:ns överskanning. Men handens
// antalsbricka hänger vid kanten, utanför spelet, och den ritas i skärmens egna pixlar: det är
// ingen millimeter av bordet och kan inte läggas till det som ramas in. Den har alltså ett villkor
// av sitt eget — en linje som ska vara med i bilden, och en pillerbredd luft förbi den — och
// bilden är den minsta som håller båda.
describe('bilden som håller två villkor, vart och ett med sin egen luft (#413)', () => {
  const vp = { w: 1000, h: 500 }
  // Spelet, mitt på filten, och linjerna där handbrickorna hänger: förbi filtens övre och nedre
  // kant, dit fläktarna når. Femtio pixlar är luften brickan tar förbi sin egen linje.
  const play = { x: -400, y: -200, w: 800, h: 400 }
  const rim = { rect: { x: -450, y: -350, w: 900, h: 700 }, margin: 50 }

  it('drar tillbaka bilden tills linjen ligger sin egen luft innanför fönstret', () => {
    const framed = frameRect(play, vp, reachOf(floor, play), 0, 0, rim)
    expect(framed).toEqual({ x: -875, y: -437.5, w: 1750, h: 875 })
    // Räknat i pixlar, vilket är det brickan är ritad i: linjens överkant ligger femtio pixlar in.
    const scale = vp.w / framed.w
    expect((rim.rect.y - framed.y) * scale).toBeCloseTo(rim.margin)
    expect((framed.y + framed.h - (rim.rect.y + rim.rect.h)) * scale).toBeCloseTo(rim.margin)
  })

  it('kostar ingenting när linjen redan ligger innanför, så en hand vid kanten inte betalas för två gånger', () => {
    const inside = { rect: { x: -100, y: -50, w: 200, h: 100 }, margin: 50 }
    expect(frameRect(play, vp, floor, 0, 0, inside)).toEqual(frameRect(play, vp, floor, 0, 0))
    expect(frameRect(play, vp, floor, 0, 0)).toEqual({ x: -400, y: -200, w: 800, h: 400 })
  })

  it('låter räckvidden växa med linjen, så filtens egen kant inte hindrar bilden från att hålla den', () => {
    // Utan det här skulle bilden klippas till filten som fitted — och filten är just det linjen
    // ligger utanför, så villkoret vore omöjligt att uppfylla och brickan klippt igen.
    const framed = frameRect(play, vp, floor, 0, 0, rim)
    expect(framed.w).toBeGreaterThan(fitFloor(floor, vp).w)
    expect(framed.y).toBeLessThan(rim.rect.y)
    expect(framed.y + framed.h).toBeGreaterThan(rim.rect.y + rim.rect.h)
  })
})
