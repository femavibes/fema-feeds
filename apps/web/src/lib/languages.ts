export interface LanguageOption {
  code: string
  name: string
}

/** Common Bluesky post language tags (ISO 639-1 / short BCP-47). */
export const COMMON_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'ru', name: 'Russian' },
  { code: 'sv', name: 'Swedish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'id', name: 'Indonesian' },
  { code: 'th', name: 'Thai' },
  { code: 'ca', name: 'Catalan' },
  { code: 'ro', name: 'Romanian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'nb', name: 'Norwegian' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
]

const knownCodes = new Set(COMMON_LANGUAGES.map((l) => l.code))

export function isKnownLanguageCode(code: string): boolean {
  return knownCodes.has(code.toLowerCase())
}

export function languageDisplayName(code: string): string {
  const hit = COMMON_LANGUAGES.find((l) => l.code === code.toLowerCase())
  return hit ? hit.name : code
}
