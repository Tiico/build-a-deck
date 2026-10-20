import { describe, expect, it } from 'vitest'
import { JsonParts, type JsonPartEvent } from '../src/json-parts.js'

// The incremental reader a structured answer is streamed through (#1002): JSON arrives a few
// characters at a time, and each part of the proposal is handed on the moment it is whole — a card
// when its closing brace arrives, not when the answer ends — and a text the answer carries is
// handed on as it grows, so a prose answer inside JSON still streams.
const answer = JSON.stringify({
  message: 'Tre kort, alla billiga.\nEtt «citat» och \\ och å och "quote".',
  proposal: { cards: [{ fields: [{ field: 'title', value: 'Varg' }] }, { fields: [{ field: 'title', value: 'Räv {2}' }, { field: 'antal', value: 2 }] }, { fields: [] }], note: { a: [1, 2] }, done: true },
})

// Every chunking of the same answer gives the same events, in the same order, whole.
function feed(reader: JsonParts, text: string, sizes: number[]): JsonPartEvent[] {
  const out: JsonPartEvent[] = []
  let at = 0
  for (let i = 0; at < text.length; i++) {
    const size = sizes[i % sizes.length] ?? 1
    out.push(...reader.push(text.slice(at, at + size)))
    at += size
  }
  return out
}
const joined = (events: JsonPartEvent[]) => events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('')
const parts = (events: JsonPartEvent[]) => events.filter((e) => e.type === 'part')

describe('reading a structured answer as it streams', () => {
  for (const sizes of [[1], [3], [7, 1, 13], [answer.length]]) {
    it(`hands on every part whole and the text as it grows, in chunks of ${sizes.join(', ')}`, () => {
      const reader = new JsonParts({ textAt: ['message'], partsAt: ['proposal'] })
      const events = feed(reader, answer, sizes)
      expect(joined(events)).toBe('Tre kort, alla billiga.\nEtt «citat» och \\ och å och "quote".')
      expect(parts(events)).toEqual([
        { type: 'part', key: 'cards', value: { fields: [{ field: 'title', value: 'Varg' }] } },
        { type: 'part', key: 'cards', value: { fields: [{ field: 'title', value: 'Räv {2}' }, { field: 'antal', value: 2 }] } },
        { type: 'part', key: 'cards', value: { fields: [] } },
        { type: 'part', key: 'note', value: { a: [1, 2] } },
        { type: 'part', key: 'done', value: true },
      ])
      expect(reader.end()).toEqual({ complete: true, value: JSON.parse(answer) })
    })
  }

  it('hands on a card the moment its closing brace arrives, before the rest of the answer', () => {
    const reader = new JsonParts({ partsAt: [] })
    expect(reader.push('{"cards":[{"fields":[{"field":"title","value":"Va')).toEqual([])
    expect(reader.push('rg"}]}')).toEqual([{ type: 'part', key: 'cards', value: { fields: [{ field: 'title', value: 'Varg' }] } }])
    expect(reader.push(',{"fields":[]')).toEqual([])
    expect(reader.push('}')).toEqual([{ type: 'part', key: 'cards', value: { fields: [] } }])
  })

  it('never splits a text in the middle of an escape', () => {
    const reader = new JsonParts({ textAt: ['message'], partsAt: ['proposal'] })
    const events = [...reader.push('{"message":"a\\'), ...reader.push('u00e'), ...reader.push('5b\\'), ...reader.push('n')]
    expect(events.map((e) => (e.type === 'text' ? e.text : '?'))).toEqual(['a', 'åb', '\n'])
  })

  it('says an answer that stopped before it was whole is not complete', () => {
    const reader = new JsonParts({ partsAt: [] })
    reader.push('{"cards":[{"fields":[]},{"fie')
    expect(reader.end()).toEqual({ complete: false })
  })

  it('says an answer that is not JSON is not complete, and hands on nothing from it', () => {
    const reader = new JsonParts({ partsAt: [] })
    expect(reader.push('Här är tio kort: {')).toEqual([])
    expect(reader.end().complete).toBe(false)
  })

  it('leaves a proposal of null alone: the answer was prose', () => {
    const reader = new JsonParts({ textAt: ['message'], partsAt: ['proposal'] })
    const events = reader.push('{"message":"Spelet har tre kort.","proposal":null}')
    expect(joined(events)).toBe('Spelet har tre kort.')
    expect(parts(events)).toEqual([])
    expect(reader.end()).toEqual({ complete: true, value: { message: 'Spelet har tre kort.', proposal: null } })
  })
})
