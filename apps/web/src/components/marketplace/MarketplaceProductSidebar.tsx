import type { LogicBlockPackage, PluginPackage, SortPackPackage } from '@cfb/core-types'

import { LogicBlockDetailPanel } from '../logic-blocks/LogicBlockDetailPanel'
import { SortPackDetailPanel } from '../sort-packs/SortPackDetailPanel'
import { InjectorDetailPanel } from '../plugins/InjectorDetailPanel'
import {
  useMarketplaceSubscription,
  type MarketplaceSubscriptionSelection,
} from './useMarketplaceSubscription'

export type MarketplaceProductSelection =
  | { kind: 'logic_block'; pkg: LogicBlockPackage }
  | { kind: 'sort_pack'; pkg: SortPackPackage }
  | { kind: 'injector'; pkg: PluginPackage }
  | { kind: 'ranker'; pkg: PluginPackage }

interface Props {
  selection: MarketplaceProductSelection | null
  subscribedPin: string | null
  onSubscriptionChanged: () => void
  emptyHint?: string
}

export function MarketplaceProductSidebar({
  selection,
  subscribedPin,
  onSubscriptionChanged,
  emptyHint = 'Select a listing to preview trust status and subscribe.',
}: Props) {
  const subscriptionSelection: MarketplaceSubscriptionSelection | null = selection
    ? selection.kind === 'logic_block'
      ? { kind: 'logic_block', pkg: selection.pkg }
      : selection.kind === 'sort_pack'
        ? { kind: 'sort_pack', pkg: selection.pkg }
        : { kind: selection.kind, pkg: selection.pkg }
    : null

  const sub = useMarketplaceSubscription(subscriptionSelection, subscribedPin, onSubscriptionChanged)

  if (!selection) {
    return (
      <div className="marketplace-sidebar-empty">
        <p>{emptyHint}</p>
      </div>
    )
  }

  return (
    <>
      <div className="marketplace-sidebar-toolbar sidebar-head">
        <div className="sidebar-head-text marketplace-sidebar-head-labels">
          <h2>Details</h2>
          <span className="sidebar-head-sub">Listing</span>
        </div>
        <div className="marketplace-sidebar-toolbar-actions">
          {sub.showSubscribeAction ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={sub.busy}
              onClick={() => void sub.subscribe()}
            >
              {sub.busy ? '…' : sub.subscribeLabel}
            </button>
          ) : null}
          {sub.isSubscribed ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={sub.busy}
              onClick={() => void sub.unsubscribe()}
            >
              Unsubscribe
            </button>
          ) : null}
        </div>
      </div>

      <div className="marketplace-sidebar-body sidebar-scroll">
        {sub.error ? <p className="field-error marketplace-sidebar-toolbar-error">{sub.error}</p> : null}

        {selection.kind === 'logic_block' ? (
          <LogicBlockDetailPanel
            variant="marketplace"
            pkg={selection.pkg}
            subscribedVersionPin={subscribedPin}
            selectedVersion={sub.selectedVersion}
            onSelectedVersionChange={sub.setSelectedVersion}
            updatePolicy={sub.updatePolicy as import('@cfb/core-types').LogicBlockUpdatePolicy}
            onUpdatePolicyChange={sub.setUpdatePolicy}
            subscriptionBusy={sub.busy}
            onSubscribed={onSubscriptionChanged}
          />
        ) : selection.kind === 'sort_pack' ? (
          <SortPackDetailPanel
            variant="marketplace"
            pkg={selection.pkg}
            subscribedVersionPin={subscribedPin}
            selectedVersion={sub.selectedVersion}
            onSelectedVersionChange={sub.setSelectedVersion}
            updatePolicy={sub.updatePolicy as import('@cfb/core-types').SortPackUpdatePolicy}
            onUpdatePolicyChange={sub.setUpdatePolicy}
            subscriptionBusy={sub.busy}
            onSubscribed={onSubscriptionChanged}
          />
        ) : (
          <InjectorDetailPanel
            kind={selection.kind}
            variant="marketplace"
            pkg={selection.pkg}
            subscribedVersionPin={subscribedPin}
            selectedVersion={sub.selectedVersion}
            onSelectedVersionChange={sub.setSelectedVersion}
            updatePolicy={sub.updatePolicy as import('@cfb/core-types').PluginUpdatePolicy}
            onUpdatePolicyChange={sub.setUpdatePolicy}
            subscriptionBusy={sub.busy}
            onSubscribed={onSubscriptionChanged}
          />
        )}
      </div>
    </>
  )
}
