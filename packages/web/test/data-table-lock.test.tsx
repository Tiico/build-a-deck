// @vitest-environment jsdom
// Vilken kolumn som står still när tabellen rullar i sidled är designerns (#1408, beställarens val
// A efter prototypen 2026-10-26): varje kolumn har ett lås, i dörren och på rubriken, och det som
// är låst står på listen (L55) i lekens ordning. Från start är titeln låst — det är fritexten man
// orienterar sig efter, inte nyckeln och antalet — och id och antal rullar med raden.
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DataTable } from '../src/editor/DataTable.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'

const PROJECT = 'p-lock'

function Editing({ doc: initial = projectDoc(), project = PROJECT }: { doc?: ProjectDoc; project?: string }) {
  const [doc] = useState(initial)
  return <DataTable doc={doc} project={project} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} />
}

// Huvudets kolumner i ordning, med bocken och × som sina klasser.
const heads = () => [...document.querySelectorAll('.byd-data thead th')].map((th) => th.getAttribute('data-col') ?? th.className)
const head = (col: string) => document.querySelector(`.byd-data thead th[data-col="${col}"]`) as HTMLElement
const cell = (cardRef: string, col: string) => document.querySelector(`.byd-data tbody tr[data-card-ref="${cardRef}"] td[data-col="${col}"]`) as HTMLElement
const pinned = (el: HTMLElement) => el.hasAttribute('data-pinned')
// Dörren, där varje kolumn har sitt lås; en låst kolumns rubrik bär ett till med samma namn.
const door = () => within(screen.getByRole('group', { name: 'Kolumner' }))

beforeEach(() => localStorage.clear())

describe('vilken kolumn som står still (#1408)', () => {
  it('nålar titeln från start, och id och antal rullar med raden', () => {
    render(<Editing />)
    expect(heads()).toEqual(['byd-data-check', 'title', 'id', 'antal', 'body', 'byd-data-remove'])
    expect(pinned(head('title'))).toBe(true)
    expect(head('title').hasAttribute('data-pinned-last')).toBe(true)
    for (const col of ['id', 'antal', 'body']) expect(pinned(head(col))).toBe(false)
    // Raden står i samma ordning som huvudet, och dess titelcell står på listen med huvudets.
    const row = document.querySelector('.byd-data tbody tr[data-card-ref="dragon"]') as HTMLElement
    expect([...row.children].map((td) => td.getAttribute('data-col') ?? td.className)).toEqual(['byd-data-check', 'title', 'id', 'antal', 'body', 'byd-data-remove'])
    expect(pinned(cell('dragon', 'title'))).toBe(true)
    expect(cell('dragon', 'title').hasAttribute('data-pinned-last')).toBe(true)
    expect(pinned(cell('dragon', 'id'))).toBe(false)
    expect(pinned(cell('dragon', 'antal'))).toBe(false)
  })

  it('låser en kolumn i dörren, och den flyttar till listen i lekens ordning', () => {
    render(<Editing />)
    fireEvent.click(screen.getByRole('button', { name: 'Kolumner' }))
    const lock = door().getByRole('button', { name: 'Lås Antal så att den står still' })
    expect(lock.getAttribute('aria-pressed')).toBe('false')
    expect(door().getByRole('button', { name: 'Lås upp Titel' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(lock)
    // antal står före titeln i lekens ordning (id, antal, fälten), så den står först på listen.
    expect(heads()).toEqual(['byd-data-check', 'antal', 'title', 'id', 'body', 'byd-data-remove'])
    expect(pinned(head('antal'))).toBe(true)
    expect(head('antal').hasAttribute('data-pinned-last')).toBe(false)
    expect(head('title').hasAttribute('data-pinned-last')).toBe(true)
    expect(door().getByRole('button', { name: 'Lås upp Antal' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('kommer ihåg vad som är låst per lek, som bredderna (L4)', () => {
    const first = render(<Editing />)
    fireEvent.click(screen.getByRole('button', { name: 'Kolumner' }))
    fireEvent.click(door().getByRole('button', { name: 'Lås upp Titel' }))
    expect(heads()).toEqual(['byd-data-check', 'id', 'antal', 'title', 'body', 'byd-data-remove'])
    expect(document.querySelectorAll('.byd-data [data-pinned]')).toHaveLength(0)
    first.unmount()
    const again = render(<Editing />)
    expect(heads()).toEqual(['byd-data-check', 'id', 'antal', 'title', 'body', 'byd-data-remove'])
    again.unmount()
    // En annan lek har sitt eget svar, och börjar med titeln.
    render(<Editing project="p-other" />)
    expect(heads()).toEqual(['byd-data-check', 'title', 'id', 'antal', 'body', 'byd-data-remove'])
  })

  it('bär låset på en låst kolumns rubrik, där det är vägen ut, och på ingen annan', () => {
    render(<Editing />)
    const onHead = head('title').querySelector('button.byd-data-lock') as HTMLButtonElement
    expect(onHead.getAttribute('aria-label')).toBe('Lås upp Titel')
    // Ingen rubrik bär ett lås som bara pekaren skulle se (#140, #193): det olåsta låses i dörren.
    expect(document.querySelectorAll('.byd-data thead .byd-data-lock')).toHaveLength(1)
    fireEvent.click(onHead)
    expect(pinned(head('title'))).toBe(false)
    expect(document.querySelectorAll('.byd-data thead .byd-data-lock')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Kolumner' }))
    fireEvent.click(door().getByRole('button', { name: 'Lås id så att den står still' }))
    expect(heads()).toEqual(['byd-data-check', 'id', 'antal', 'title', 'body', 'byd-data-remove'])
    expect(pinned(head('id'))).toBe(true)
    expect(head('id').querySelector('button.byd-data-lock')?.getAttribute('aria-label')).toBe('Lås upp id')
  })
})
