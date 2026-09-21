import type { Rect } from './camera.js'

// Vad en skärm minns om sin egen kamera (C5, #325).
//
// **Per skärm, och aldrig i loggen: en vy är ingen händelse (L4).** Att en TV står inzoomad på
// draghögen är inget som hänt vid bordet, och en logg som bar det vore en logg som inte längre
// kan spelas upp som ett spel. Så det bor i webbläsaren, hos den skärm som bad om det, och ingen
// annan vid bordet vet om det.
//
// Nyckeln bär bordet med sig, eftersom en bild i bordets millimeter bara betyder något på det
// bord den mättes på.
//
// `localStorage` kastar i privat läge och kan vara avstängd; både läsning och skrivning är
// därför inneslutna, och en skärm utan den ritar rätt ändå — den minns bara ingenting.
export type CameraMemory = { cam: Rect | null; folded: boolean }

const NOTHING: CameraMemory = { cam: null, folded: false }
const keyFor = (scope: string): string => `byd.camera.${scope}`

const isRect = (value: unknown): value is Rect =>
  typeof value === 'object' &&
  value !== null &&
  (['x', 'y', 'w', 'h'] as const).every((k) => Number.isFinite((value as Record<string, unknown>)[k]))

export function recallCamera(scope: string): CameraMemory {
  try {
    const said = window.localStorage.getItem(keyFor(scope))
    if (said === null) return NOTHING
    const read = JSON.parse(said) as { cam?: unknown; folded?: unknown }
    return { cam: isRect(read.cam) ? read.cam : null, folded: read.folded === true }
  } catch {
    // En skärm som inte får minnas är en skärm som inte minns. Den ritar likafullt.
    return NOTHING
  }
}

export function rememberCamera(scope: string, memory: CameraMemory): void {
  try {
    if (memory.cam === null && !memory.folded) window.localStorage.removeItem(keyFor(scope))
    else window.localStorage.setItem(keyFor(scope), JSON.stringify(memory))
  } catch {
    // Som ovan: ingenting att göra åt, och ingenting som får stoppa bilden.
  }
}
