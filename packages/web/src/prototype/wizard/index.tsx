// PROTOTYPE — throwaway route /prototype/wizard?variant=A|B|C
// Question: what does the road from an empty page to a playable project look like?
import { useState } from 'react'
import { Switcher } from './Switcher.js'
import { VariantA } from './VariantA.js'
import { VariantB } from './VariantB.js'
import { VariantC } from './VariantC.js'

const VARIANTS = [
  { key: 'A', name: 'En fråga per sida' },
  { key: 'B', name: 'Allt på en sida, levande kort' },
  { key: 'C', name: 'Guidad editor' },
]

export function WizardPrototype() {
  const [variant, setVariant] = useState(() => new URLSearchParams(location.search).get('variant') ?? 'A')
  const change = (key: string) => {
    const url = new URL(location.href)
    url.searchParams.set('variant', key)
    history.replaceState(null, '', url)
    setVariant(key)
  }
  return (
    <>
      {variant === 'A' && <VariantA />}
      {variant === 'B' && <VariantB />}
      {variant === 'C' && <VariantC />}
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </>
  )
}
