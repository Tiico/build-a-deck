import type { Zone } from '@byd/server/doc'

// Vad ett zonnamn säger om platsen det står vid, och vad det inte säger.
//
// Regeln finns för att designern själv kan ha skrivit in platsen i namnet. `Framför A` bär den;
// `Hand` gör det inte. Två ytor behöver samma svar — zonlistans familjerad i `SetupEditor` och
// rutorna i `ZoneActions` (#255) — och därför bor regeln här och inte i någondera. Två kopior av
// samma reguljära uttryck är ett fel som väntar på att en av dem ändras.
//
// Det är en ordgränsregel och inte en «börjar med»-regel, och skillnaden är hela poängen:
// `Framför A` vid plats A bär redan sin bokstav, medan `Askhögen` vid plats A inte gör det — det
// `A` som står inuti ordet är inget ord. Prototypen mätte följden: av 37 ägda zoner får 16 inget
// efterled, och ingen rad blev `Framför A A`.

// Ett tecken inget namn kan innehålla, så att hålet aldrig krockar med något designern skrivit.
const HOLE = '\u0001'

// Namnmallen: namnet med platsens egen bokstav utbytt mot hålet den fyller. Två zoner i samma roll
// är lika när de har samma mall — `Framför A` och `Framför B` är en och samma zon vid var sin
// plats; `Min hög` vid plats C är inte, och det är den skillnaden familjeraden säger.
export const templateOf = (zone: Zone): string => zone.name.replace(new RegExp(`(^|\\W)${zone.owner}(?=\\W|$)`, 'g'), `$1${HOLE}`)

export const nameOf = (template: string): string => template.replaceAll(HOLE, '').replace(/\s+/g, ' ').trim()

// Platsen zonen behöver få utskriven efter sitt namn, eller inget alls. Inget alls betyder två
// olika saker som ser lika ut här och bara ska behandlas lika: zonen står på bordet och har ingen
// ägare, eller namnet bär redan platsen och skulle annars bära den två gånger.
export const ownerOf = (zone: Zone): string | undefined =>
  zone.owner !== undefined && templateOf(zone) === zone.name ? zone.owner : undefined
