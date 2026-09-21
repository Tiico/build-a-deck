import { useRef } from 'react'
import { INK, symbolName, symbolPreview, type GameSymbol } from './symbols.js'
import { RoleList, SymbolList, type Meaning } from './SymbolList.js'
import { SymbolSample, SymbolSheet } from './SymbolSample.js'
import { placedProps, usePlacement } from './placement.js'
import { useT } from '../i18n/index.js'

// The box a symbol and its meaning are chosen in, at the brace in a cell (L34, #302).
//
// Two questions in one box: which symbol, and — when the game has named meanings — which of them
// to draw it in. The meanings are not names beside abstract colour dots; they are coloured copies
// of the very symbol the designer chose, and the grid above follows the meaning the keys are on,
// so what she gets is seen before it is inserted. «Utan betydelse» stands first among them and
// costs no extra step. The foot says the exact string the box will write, which is the product's
// own syntax and nothing of the box's — the picker is a road to the same string the hand would
// type, not a replacement for it.
//
// A game with no meanings has no meaning step at all. The box says why in one line and the
// symbol is inserted in ink; nothing is skipped, because there is nothing to skip.
//
// Every sample stands on the card's paper: a symbol drawn in the card's ink against the editor's
// dark panel is no preview, and «utan betydelse» was invisible in the first draft.
export type SymbolBoxProps = {
  symbols: readonly GameSymbol[]
  // The one the keys are on in the grid.
  active: number
  // The symbol chosen, once one has been — the meanings are copies of it. Before that they are
  // copies of the one the keys are on, so the row is never about nothing.
  picked: GameSymbol | null
  // The game's meanings, with «utan betydelse» first. Empty when the game has named none.
  meanings: readonly Meaning[]
  // The meaning the keys are on, or null while they are still in the grid.
  meaningActive: number | null
  // The card's ground: what every sample stands on.
  paper: string
  palette: Record<string, string> | undefined
  // The list ids the cell points at with `aria-activedescendant`.
  symbolsId: string
  meaningsId: string
  className: string
  // The string the box will write, exactly.
  writes: string
  onPickSymbol(symbol: GameSymbol): void
  onPickMeaning(role: string | null): void
}

export function SymbolBox({ symbols, active, picked, meanings, meaningActive, paper, palette, symbolsId, meaningsId, className, writes, onPickSymbol, onPickMeaning }: SymbolBoxProps) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  // The box opens where there is room for it (#229), as every list of this kind does. It is the
  // box that is placed and not the grid inside it, because the grid, the meanings and the foot go
  // up or down together.
  const place = usePlacement(true, box)
  const shown = picked ?? symbols[active] ?? null
  // The meaning the grid is drawn in: the one the keys are on, once they are among the meanings.
  const inked = meaningActive === null ? null : (meanings[meaningActive]?.role ?? null)
  // A library symbol is not in the game yet, so the sample's icon set is the symbol itself under
  // the name it will get — the same name the string in the foot is written with.
  const sample = (symbol: GameSymbol, role: string | null) => {
    const name = symbolName(symbol, t)
    return <SymbolSample written={`{${name}${role === null ? '' : `|${role}`}}`} symbols={{ icons: { [name]: symbolPreview(symbol) }, palette }} paper={paper} />
  }
  return (
    <div ref={box} className={`byd-symbol-box ${className}`} role="group" aria-label={t('table.symbol.box')} {...placedProps(place)}>
      <SymbolSheet />
      <SymbolList id={symbolsId} className="byd-symbol-box-grid" symbols={symbols} active={active} label={t('table.symbols')} sample={(symbol) => sample(symbol, inked)} onPick={onPickSymbol} />
      {meanings.length === 0 ? (
        <p className="byd-symbol-none">{t('table.meanings.none')}</p>
      ) : (
        shown && (
          <RoleList
            id={meaningsId}
            className="byd-symbol-box-meanings"
            roles={meanings}
            active={meaningActive ?? -1}
            label={t('table.roles')}
            none={t('table.meaning.none')}
            sample={({ role }) => sample(shown, role)}
            onPick={onPickMeaning}
          />
        )
      )}
      <p className="byd-symbol-writes">
        <span>{t('table.writes')}</span> <code>{writes}</code>
      </p>
    </div>
  )
}

// The meanings as the box offers them: «utan betydelse» first, in the card's ink, and then the
// game's own. An empty palette is an empty list, which is what tells the box there is no step.
export function meaningsOf(palette: Record<string, string> | undefined): Meaning[] {
  const named = Object.entries(palette ?? {}).map(([role, colour]) => ({ role, colour }))
  return named.length === 0 ? [] : [{ role: null, colour: INK }, ...named]
}
