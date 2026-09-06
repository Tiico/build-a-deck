import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Testing Library only cleans up on its own with vitest globals; do it explicitly.
afterEach(cleanup)

// Under jsdom, its WebSocket wraps Node's undici, which dispatches jsdom Events on a Node
// EventTarget and throws. The `ws` client speaks the same API and has no such split.
import { WebSocket as WsClient } from 'ws'
import { useWebSocketImplementation, type WebSocketCtor } from '../src/client.js'
if (typeof document !== 'undefined') useWebSocketImplementation(WsClient as unknown as WebSocketCtor)
