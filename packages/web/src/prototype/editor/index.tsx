// PROTOTYPE — throwaway route /prototype/editor?variant=A|B|C
// Question: what should the creator's editor look like — template, table, preview?
import { useState } from 'react'
import { Switcher } from './Switcher.js'
import { VariantA } from './VariantA.js'
import { VariantB } from './VariantB.js'
import { VariantC } from './VariantC.js'

const VARIANTS = [
  { key: 'A', name: 'Trepanel' },
  { key: 'B', name: 'Kalkylbladet först' },
  { key: 'C', name: 'Kortväggen' },
]

export function EditorPrototype() {
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
