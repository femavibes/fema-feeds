import type { ProjectL1Config } from '@cfb/core-types'

/** Merge server-compiled ingest gate into local project draft (after Update live). */
export function mergeCompiledIngestFromServer(
  local: ProjectL1Config,
  server: ProjectL1Config,
): ProjectL1Config {
  if (!server.compiledL1Meta) return local
  return {
    ...local,
    ingestGate: server.ingestGate,
    compiledL1Meta: server.compiledL1Meta,
    keywordInclude: undefined,
    keywordExclude: undefined,
    hashtagInclude: undefined,
    hashtagExclude: undefined,
    followRing: undefined,
    postKinds: undefined,
    language: undefined,
    hasVideo: undefined,
    hasImage: undefined,
    hasLinkCard: undefined,
    hasQuote: undefined,
    hasRecord: undefined,
    hasTextOnly: undefined,
    labels: undefined,
  }
}
