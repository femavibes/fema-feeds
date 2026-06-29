import { useCallback, useEffect, useState } from 'react'
import type {
  LogicBlockPackage,
  LogicBlockUpdatePolicy,
  PluginPackage,
  PluginUpdatePolicy,
  SortPackPackage,
  SortPackUpdatePolicy,
} from '@cfb/core-types'

import { api } from '../../api/client'

export type MarketplaceSubscriptionSelection =
  | { kind: 'logic_block'; pkg: LogicBlockPackage }
  | { kind: 'sort_pack'; pkg: SortPackPackage }
  | { kind: 'injector' | 'ranker' | 'enricher'; pkg: PluginPackage }

type UpdatePolicy = LogicBlockUpdatePolicy | SortPackUpdatePolicy | PluginUpdatePolicy

export function useMarketplaceSubscription(
  selection: MarketplaceSubscriptionSelection | null,
  subscribedPin: string | null,
  onChanged: () => void,
) {
  const [selectedVersion, setSelectedVersion] = useState('')
  const [updatePolicy, setUpdatePolicy] = useState<UpdatePolicy>('pinned')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pkg = selection?.pkg ?? null
  const pkgId = pkg?.id

  useEffect(() => {
    if (!pkg) {
      setSelectedVersion('')
      setError(null)
      return
    }
    setSelectedVersion(subscribedPin ?? pkg.version)
    setError(null)
  }, [pkg, pkgId, pkg?.version, subscribedPin])

  const versionPin = selectedVersion || pkg?.version || ''
  const isSubscribed = subscribedPin != null
  const onLatestPin = isSubscribed && subscribedPin === versionPin
  const canSubscribe = pkg != null && pkg.visibility !== 'collection'
  const showSubscribeAction = canSubscribe && (!isSubscribed || !onLatestPin)

  const subscribe = useCallback(async () => {
    if (!selection || !versionPin) return
    setBusy(true)
    setError(null)
    try {
      if (selection.kind === 'logic_block') {
        await api.subscribeLogicBlock(selection.pkg.id, { versionPin, updatePolicy })
      } else if (selection.kind === 'sort_pack') {
        await api.subscribeSortPack(selection.pkg.id, { versionPin, updatePolicy })
      } else {
        await api.subscribePlugin(selection.pkg.id, { versionPin, updatePolicy })
      }
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Subscribe failed')
    } finally {
      setBusy(false)
    }
  }, [onChanged, selection, updatePolicy, versionPin])

  const unsubscribe = useCallback(async () => {
    if (!selection) return
    setBusy(true)
    setError(null)
    try {
      if (selection.kind === 'logic_block') {
        await api.unsubscribeLogicBlock(selection.pkg.id)
      } else if (selection.kind === 'sort_pack') {
        await api.unsubscribeSortPack(selection.pkg.id)
      } else {
        await api.unsubscribePlugin(selection.pkg.id)
      }
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unsubscribe failed')
    } finally {
      setBusy(false)
    }
  }, [onChanged, selection])

  const subscribeLabel = !isSubscribed ? 'Subscribe' : `Update to v${versionPin}`

  return {
    selectedVersion,
    setSelectedVersion,
    versionPin,
    updatePolicy,
    setUpdatePolicy,
    busy,
    error,
    isSubscribed,
    onLatestPin,
    canSubscribe,
    showSubscribeAction,
    subscribe,
    unsubscribe,
    subscribeLabel,
  }
}
