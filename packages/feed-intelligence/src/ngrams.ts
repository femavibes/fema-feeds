import { getStopWords } from './stop-words/index.js'

const URL_RE = /https?:\/\/\S+/g
const MENTION_RE = /@[\w.-]+/g
const TOKEN_RE = /[a-z\u00C0-\u024F]{3,}/g // 3+ letter words, supports accented chars

/** Tokenize text into lowercase words, stripping URLs and mentions. */
export function tokenize(text: string): string[] {
  const cleaned = text.toLowerCase().replace(URL_RE, '').replace(MENTION_RE, '')
  return cleaned.match(TOKEN_RE) ?? []
}

/** Extract meaningful unigrams (non-stop-words). */
export function extractUnigrams(tokens: string[], lang: string): string[] {
  const stops = getStopWords(lang)
  return tokens.filter((t) => !stops.has(t))
}

/** Extract bigrams where at least one word is not a stop word. */
export function extractBigrams(tokens: string[], lang: string): string[] {
  const stops = getStopWords(lang)
  const results: string[] = []
  for (let i = 0; i < tokens.length - 1; i++) {
    if (!stops.has(tokens[i]!) || !stops.has(tokens[i + 1]!)) {
      results.push(`${tokens[i]} ${tokens[i + 1]}`)
    }
  }
  return results
}

/** Extract trigrams where at least one word is not a stop word. */
export function extractTrigrams(tokens: string[], lang: string): string[] {
  const stops = getStopWords(lang)
  const results: string[] = []
  for (let i = 0; i < tokens.length - 2; i++) {
    if (!stops.has(tokens[i]!) || !stops.has(tokens[i + 1]!) || !stops.has(tokens[i + 2]!)) {
      results.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`)
    }
  }
  return results
}

/** Full n-gram extraction pipeline: unigrams + bigrams + trigrams. */
export function extractNgrams(text: string, lang: string): string[] {
  const tokens = tokenize(text)
  if (tokens.length === 0) return []
  return [
    ...extractUnigrams(tokens, lang),
    ...extractBigrams(tokens, lang),
    ...extractTrigrams(tokens, lang),
  ]
}
