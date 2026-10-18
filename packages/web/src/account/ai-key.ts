// The designer's own AI key from the browser's side (#999, E4): what the server says about it — never
// the key — and saving, proving, choosing a model and removing it. The key travels to the server
// once, in the body of the save, and is never read back.
import type { AiFailure, AiKeyDescription, AiModel, AiProvider } from '@byd/server/doc'
import { Unauthorized, withCredentials } from './session.js'

export type { AiFailure, AiModel, AiProvider }
export type AiKey = AiKeyDescription & { defaultModel: string }

export const AI_PROVIDER_LIST: readonly AiProvider[] = ['anthropic', 'openai']
// The providers' own names, which are never translated.
export const PROVIDER_NAMES: Record<AiProvider, string> = { anthropic: 'Anthropic', openai: 'OpenAI' }
// Where a designer without a key makes one (#999, the beställare's addition 2026-10-18).
export const KEY_PAGES: Record<AiProvider, string> = { anthropic: 'https://platform.claude.com/settings/keys', openai: 'https://platform.openai.com/api-keys' }

// What a model is called, wherever it is named (#1001): the name the provider's own list gives it,
// and its id only while there is no list. The profile's picker and the editor's panel both ask this,
// so the two never call the same model two things.
export function modelNameOf(models: readonly AiModel[] | null, id: string): string {
  return models?.find((m) => m.id === id)?.name ?? id
}

// Why a key was not saved: the provider's closed set of words, and the server's own reasons.
export type KeyRefusal = Exclude<AiFailure, 'refused'> | 'too-many' | 'unavailable' | 'malformed' | 'offline'

const json = (body: unknown): RequestInit => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const why = async (res: Response): Promise<string> => ((await res.json().catch(() => ({}))) as { error?: string }).error ?? ''

export async function readAiKey(http: string): Promise<{ key: AiKey | null; sealing: boolean }> {
  const res = await fetch(`${http}/me/ai-key`, withCredentials())
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(`could not read the key: ${res.status}`)
  return (await res.json()) as { key: AiKey | null; sealing: boolean }
}

export async function saveAiKey(http: string, provider: AiProvider, key: string): Promise<{ ok: true; key: AiKey; models: AiModel[] } | { ok: false; why: KeyRefusal }> {
  let res: Response
  try {
    res = await fetch(`${http}/me/ai-key`, withCredentials({ method: 'PUT', ...json({ provider, key }) }))
  } catch {
    return { ok: false, why: 'offline' }
  }
  if (res.status === 401) throw new Unauthorized()
  if (res.ok) return { ok: true, ...((await res.json()) as { key: AiKey; models: AiModel[] }) }
  if (res.status === 400) return { ok: false, why: 'malformed' }
  if (res.status === 429) return { ok: false, why: 'too-many' }
  if (res.status === 503) return { ok: false, why: 'unavailable' }
  const said = await why(res)
  return { ok: false, why: (['invalid-key', 'no-credit', 'rate-limit', 'overloaded', 'network'] as const).find((w) => w === said) ?? 'network' }
}

// The models the key may use, asked of the provider through the server. A list that cannot be had
// leaves the picker with what it already knows rather than failing the page.
export async function listAiModels(http: string): Promise<{ models: AiModel[]; defaultModel: string } | null> {
  const res = await fetch(`${http}/me/ai-key/models`, withCredentials()).catch(() => null)
  if (res?.status === 401) throw new Unauthorized()
  return res?.ok ? ((await res.json()) as { models: AiModel[]; defaultModel: string }) : null
}

// null is the provider's standard model. Null back means there is no key to choose a model for.
export async function chooseAiModel(http: string, model: string | null): Promise<AiKey | null> {
  const res = await fetch(`${http}/me/ai-key/model`, withCredentials({ method: 'PUT', ...json({ model }) }))
  if (res.status === 401) throw new Unauthorized()
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`could not choose the model: ${res.status}`)
  return ((await res.json()) as { key: AiKey }).key
}

export async function removeAiKey(http: string): Promise<void> {
  const res = await fetch(`${http}/me/ai-key`, withCredentials({ method: 'DELETE' }))
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(`could not remove the key: ${res.status}`)
}
