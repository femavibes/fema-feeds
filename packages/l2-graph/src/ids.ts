let counter = 0

export function newId(prefix: string): string {
  counter += 1
  return `${prefix}-import-${counter}`
}

/** Reset for tests. */
export function resetImportIds(): void {
  counter = 0
}
