// PROTOTYPE — throwaway route /prototype/player?variant=A|B|C
// Question: what should the phone's `player` view look like? Three structurally different answers.
import { useMemo, useState } from 'react'
import { buildPlayerScene } from './data.js'
import { Switcher } from './Switcher.js'
import { VariantA } from './VariantA.js'
import { VariantB } from './VariantB.js'
import { VariantC } from './VariantC.js'

const VARIANTS = [
  { key: 'A', name: 'Remsan' },
  { key: 'B', name: 'Kortlek i handen' },
  { key: 'C', name: 'Bräde + hand' },
]

export function PlayerPrototype() {
  const view = useMemo(buildPlayerScene, [])
  const [variant, setVariant] = useState(() => new URLSearchParams(location.search).get('variant') ?? 'A')
  const change = (key: string) => {
    const url = new URL(location.href)
    url.searchParams.set('variant', key)
    history.replaceState(null, '', url)
    setVariant(key)
  }
  return (
    <>
      {variant === 'A' && <VariantA view={view} />}
      {variant === 'B' && <VariantB view={view} />}
      {variant === 'C' && <VariantC view={view} />}
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </>
  )
}
