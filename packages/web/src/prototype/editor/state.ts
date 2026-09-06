// PROTOTYPE — shared editable state so every variant edits the same deck.
import { useState } from 'react'
import type { Element, FaceTemplate, Row } from '@byd/template'
import { front, initialRows } from './data.js'

export function useDeck() {
  const [face, setFace] = useState<FaceTemplate>(front)
  const [rows, setRows] = useState<Row[]>(initialRows)
  const setCell = (i: number, key: string, value: string) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, [key]: value } : r)))
  const patchElement = (id: string, patch: Partial<Element>) =>
    setFace((f) => ({ ...f, base: f.base.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e)) }))
  return { face, rows, setCell, patchElement }
}

export function fieldOf(el: Element, key: 'x' | 'y' | 'w' | 'h'): number {
  return 'x' in el && key in el ? ((el as unknown as Record<string, number>)[key] ?? 0) : 0
}
