// PROTOTYPE — throwaway route /prototype/join?variant=A|B|C
// Question: how does a phone sit down at the table? Three structurally different answers.
import { useState } from 'react'
import { Switcher } from './Switcher.js'
import { VariantA } from './VariantA.js'
import { VariantB } from './VariantB.js'
import { VariantC } from './VariantC.js'

const VARIANTS = [
  { key: 'A', name: 'Bordet som platsväljare' },
  { key: 'B', name: 'Listan' },
  { key: 'C', name: 'Bara namnet' },
]

export function JoinPrototype() {
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
