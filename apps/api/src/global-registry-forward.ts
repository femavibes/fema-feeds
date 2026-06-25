import type {
  LogicBlockPackage,
  MarketplaceProductKind,
  MarketplacePublishRequest,
  PluginPackage,
  SortPackPackage,
} from '@cfb/core-types'
import {
  GLOBAL_MARKETPLACE_CANONICAL_URL,
  globalMarketplaceRemoteUrl,
  isCanonicalGlobalRegistryHost,
} from './global-marketplace.js'

export interface GlobalIngressPayload {
  ownerDid: string
  productKind: MarketplaceProductKind
  publisherNote?: string | null
  sourceHost?: string | null
  logicBlock?: LogicBlockPackage
  sortPack?: SortPackPackage
  plugin?: PluginPackage
}

function packagePayload(
  productKind: MarketplaceProductKind,
  pkg: LogicBlockPackage | SortPackPackage | PluginPackage,
): Pick<GlobalIngressPayload, 'logicBlock' | 'sortPack' | 'plugin'> {
  if (productKind === 'logic_block') return { logicBlock: pkg as LogicBlockPackage }
  if (productKind === 'sort_pack') return { sortPack: pkg as SortPackPackage }
  return { plugin: pkg as PluginPackage }
}

export async function forwardGlobalListingSubmission(
  pkg: LogicBlockPackage | SortPackPackage | PluginPackage,
  productKind: MarketplaceProductKind,
  ownerDid: string,
  publisherNote?: string | null,
  sourceHost?: string | null,
): Promise<MarketplacePublishRequest | 'duplicate' | 'registry_unreachable'> {
  if (isCanonicalGlobalRegistryHost()) {
    throw new Error('forwardGlobalListingSubmission called on registry host')
  }

  const registryUrl = globalMarketplaceRemoteUrl() ?? GLOBAL_MARKETPLACE_CANONICAL_URL
  const body: GlobalIngressPayload = {
    ownerDid,
    productKind,
    publisherNote,
    sourceHost,
    ...packagePayload(productKind, pkg),
  }

  try {
    const res = await fetch(`${registryUrl.replace(/\/$/, '')}/api/global-marketplace/ingress/publish-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 409) return 'duplicate'
    if (!res.ok) return 'registry_unreachable'
    const json = (await res.json()) as { request?: MarketplacePublishRequest }
    if (!json.request) return 'registry_unreachable'
    return json.request
  } catch {
    return 'registry_unreachable'
  }
}
