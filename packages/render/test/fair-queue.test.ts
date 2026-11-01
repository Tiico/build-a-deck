import { describe } from 'vitest'
import { MemoryRenderStore } from '../src/store.js'
import { fairQueueBehaviour } from './fair-queue-behaviour.js'

describe('the render queue in memory takes turns between tables (#1546)', () => {
  fairQueueBehaviour(() => new MemoryRenderStore(), 'mem')
})
