/** Hide packages the viewer owns from subscribed lists — they belong under My collection. */
export function excludeOwnFromSubscribed<T extends { id: string; ownerDid: string }>(
  packages: T[],
  options: { userDid: string | null; collectionPackageIds?: Iterable<string> },
): T[] {
  const collectionIds = new Set(options.collectionPackageIds ?? [])
  const { userDid } = options
  if (!userDid && collectionIds.size === 0) return packages

  return packages.filter((pkg) => {
    if (collectionIds.has(pkg.id)) return false
    if (userDid && pkg.ownerDid === userDid) return false
    return true
  })
}
