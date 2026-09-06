// PROTOTYPE — throwaway route /prototype/table?variant=A|B|C
// Question: what should the shared `table` view look like? Three structurally different answers.
import { useMemo, useState } from 'react'
import { buildScene } from './data.js'
import { Switcher } from './Switcher.js'
import { VariantA } from './VariantA.js'
import { VariantB } from './VariantB.js'
import { VariantC } from './VariantC.js'

const VARIANTS = [
  { key: 'A', name: 'Planritning' },
  { key: 'B', name: 'Filtbord (bordsläge)' },
  { key: 'C', name: 'Sändning (TV-läge)' },
]

export function TablePrototype() {
  const scene = useMemo(buildScene, [])
  const [variant, setVariant] = useState(() => new URLSearchParams(location.search).get('variant') ?? 'A')
  const change = (key: string) => {
    const url = new URL(location.href)
    url.searchParams.set('variant', key)
    history.replaceState(null, '', url)
    setVariant(key)
  }
  return (
    <>
      {variant === 'A' && <VariantA scene={scene} />}
      {variant === 'B' && <VariantB scene={scene} />}
      {variant === 'C' && <VariantC scene={scene} />}
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </>
  )
}
