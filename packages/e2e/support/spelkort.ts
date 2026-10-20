import type { ProjectDoc } from '@byd/server'
import { spelkortDoc } from '../../server/scripts/spelkort.js'

// Provleken som den är, och samma lek skalad genom API:t till 308 kort och sju kolumner till,
// eftersom provleken döljer täthet: två tal, fyra korta ord och en mening, så att mätningen har
// både smala och breda kolumner att dela rummet med (#695, #1061).
export const prov = (): ProjectDoc => spelkortDoc(4)

export function tät(): ProjectDoc {
  const doc = spelkortDoc(4)
  const SERIE = ['Grundlek', 'Guldrush', 'Ökenvinden', 'Saloonkriget']
  const KONST = ['A. Lind', 'Moa Berg', 'J. Öst', 'Sixten Ek', 'Lo Holm']
  const STÄM = ['Dammet lägger sig över gatan.', 'Någon spelar fel på pianot igen.', 'Sheriffen tittar åt andra hållet.', 'Whiskyn är urvattnad, men billig.', 'Hästarna är oroliga i natt.']
  const rows = [0, 1, 2, 3].flatMap((lap) =>
    doc.rows.map((row, i) => {
      const n = lap * doc.rows.length + i
      return {
        id: lap === 0 ? row.id : `${row.id}-${lap + 1}`,
        fields: { ...row.fields, kostnad: String((n * 7) % 9), kraft: String((n * 5) % 12), serie: SERIE[lap] ?? '', konstnär: KONST[n % 5] ?? '', stämning: STÄM[n % 5] ?? '', version: `1.${n % 4}`, sida: n % 2 === 0 ? 'framsida' : 'båda' },
      }
    }),
  )
  return { ...doc, name: "Sal's Saloon, tät", rows }
}
