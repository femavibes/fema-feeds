import { extractPostInput } from '@cfb/post-resolve/browser'

export { extractPostInput }

export function normalizePostUrlField(raw: string): { value: string; extracted: boolean } {
  const result = extractPostInput(raw)
  if (!result.ok) throw new Error(result.error)
  return { value: result.value, extracted: result.extracted }
}
