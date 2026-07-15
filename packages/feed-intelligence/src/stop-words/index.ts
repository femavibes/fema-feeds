import { STOP_WORDS_EN } from './en.js'

const STOP_WORD_REGISTRY: Record<string, Set<string>> = {
  en: STOP_WORDS_EN,
}

export function getStopWords(lang: string): Set<string> {
  return STOP_WORD_REGISTRY[lang] ?? STOP_WORDS_EN
}

export function isStopWord(word: string, lang: string): boolean {
  return getStopWords(lang).has(word)
}
