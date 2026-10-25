import { MemoryRenderStore } from '../src/store.js'
import { screenQueueBehaviour } from './screen-behaviour.js'

screenQueueBehaviour('i minnet', async () => new MemoryRenderStore())
