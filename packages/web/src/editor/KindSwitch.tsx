import type { HTMLAttributes, Ref } from 'react'
import type { ColumnKind } from '@byd/server/doc'
import { HookGlyph } from '../glyphs.js'
import { useT } from '../i18n/index.js'

// Vad en kolumn är, där den står (#1085, beställarens beslut variant B): i kolumnlistan bakom `＋`,
// på samma rad som kolumnens namn. Text, prosa eller bild. «Mallen föreslår, designern avgör» — en
// hög ruta föreslår prosa (L43) och ett bildlager föreslår bild, och här står valet och går att
// vända. Det var förut en växel med två lägen, prosa och text (L43, #615), och en kolumn blev bild
// bara där mallen ritade den som bild — så att få en bildkolumn i Tabell krävde ett besök i Mall.
//
// Det stod en gång i tabellhuvudet: en prick utanför rubrikens flöde och en utfällning som öppnades
// när pekaren vilade på rubriken (#615). Dörren har plats för det huvudet aldrig hade: hela
// träffytor och hjälp på begäran, utan att röra en rubrik som också dras och sorteras.
//
// Skillnaden mellan förval och val bärs i form — en streckad markering när mallen föreslog, en
// ifylld när designern valde — och i ord, som gruppens namn, eftersom en streckad kant inte finns
// för en skärmläsare (L12).

export const KINDS: readonly ColumnKind[] = ['text', 'prose', 'image']

export type KindSwitchProps = {
  // Det ord kolumnen står under i huvudet. Det är namnet och aldrig nyckeln som läses upp (A4).
  label: string
  // Vad kolumnen *är* — mallens förslag vänt av valet — och om designern själv har sagt det.
  kind: ColumnKind
  chosen: boolean
  onKind(next: ColumnKind | null): void
  // Dörrens tangentbordsordning (#388): varje knapp är en plats på radens pilväg.
  keys(one: ColumnKind | 'follow'): HTMLAttributes<HTMLButtonElement> & { ref: Ref<HTMLButtonElement> }
}

// Växeln själv: tre knappar i radens flöde, mellan namnet och ×.
export function KindSwitch({ label, kind, chosen, onKind, keys }: KindSwitchProps) {
  const t = useT()
  return (
    <span className="byd-kind-switch" role="group" aria-label={t(`table.kind.is.${kind}.${chosen ? 'choice' : 'template'}`, { field: label })} data-from={chosen ? 'choice' : 'template'}>
      {KINDS.map((as) => (
        <button
          key={as}
          type="button"
          {...keys(as)}
          aria-pressed={kind === as}
          aria-label={t('table.kind.turn.named', { turn: t(`table.kind.as.${as}`), field: label })}
          // Den tryckta knappen trycks också: på en kolumn som följer mallen gör det förslaget till
          // designerns eget val, och ett val är vad nästa omritning av mallen inte får röra.
          onClick={() => onKind(as)}
        >
          {t(`table.kind.as.${as}`)}
        </button>
      ))}
    </span>
  )
}

// Reset is an action, so it stays beside the switch it answers, before the ×. Its slot keeps its
// width when there is nothing to reset, so the × stands in one column down the list. The
// explanation is shared by the list.
export function KindReset({ label, chosen, onKind, keys }: KindSwitchProps) {
  const t = useT()
  return (
    <span className="byd-kind-reset">
      {chosen && (
        <button type="button" className="byd-kind-follow" {...keys('follow')} aria-label={t('table.kind.turn.named', { turn: t('table.kind.follow'), field: label })} title={t('table.kind.follow')} onClick={() => onKind(null)}>
          <HookGlyph />
        </button>
      )}
    </span>
  )
}
