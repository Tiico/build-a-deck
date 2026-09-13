import { STANDARD_TYPES, TypeRegistry, initialState, project } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import type { ProjectDoc } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'

// The table a project makes (B5), as the screen would show it before anyone sat down: the deck
// face down in the deck zone, and every seat's counters at their start values. Built the way the
// server builds a table — setupFromProject, initialState and project — so what the designer sees
// is what the engine accepts and what the players get: the pile counts the rows times `antal`
// (L4, #85), not a stand-in. A setup the engine refuses gives null.
const registry = new TypeRegistry(STANDARD_TYPES)

export function previewOf(doc: Pick<ProjectDoc, 'rows' | 'setup'>): Snapshot | null {
  try {
    return project(initialState('preview', setupFromProject(doc), registry), registry, null)
  } catch {
    return null
  }
}
