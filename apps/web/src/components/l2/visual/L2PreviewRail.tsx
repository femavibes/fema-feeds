import { useState } from 'react'
import type { FeedConfig, L2NodeTrace, L2RuleGroup } from '@cfb/core-types'
import { L2MatchPoolPanel } from '../L2MatchPoolPanel'
import { L2PreviewPanel } from '../L2PreviewPanel'
import { RailPanelHead } from './L2RailChrome'

type PreviewTab = 'matches' | 'test'

export type TraceSelectHandler = (nodeId: string, trace?: L2NodeTrace[]) => void

interface Props {
  draft: FeedConfig
  match: L2RuleGroup
  onCollapse: () => void
  onTestTrace?: (trace: L2NodeTrace[] | null) => void
  onSelectNode?: TraceSelectHandler
}

export function L2PreviewRail({
  draft,
  match,
  onCollapse,
  onTestTrace,
  onSelectNode,
}: Props) {
  const [tab, setTab] = useState<PreviewTab>('matches')

  return (
    <div className="l2-preview-rail">
      <RailPanelHead
        title=""
        onCollapse={onCollapse}
        collapseLabel="Collapse matches panel"
      >
        <div className="l2-inspector-tabs" role="tablist" aria-label="Feed preview">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'matches'}
            className={tab === 'matches' ? 'active' : ''}
            onClick={() => setTab('matches')}
          >
            Matches
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'test'}
            className={tab === 'test' ? 'active' : ''}
            onClick={() => setTab('test')}
          >
            Test
          </button>
        </div>
      </RailPanelHead>
      <div className="l2-inspector-preview-panes">
        <div
          className={`l2-inspector-panel l2-inspector-matches${tab === 'matches' ? ' is-active' : ''}`}
        >
          <L2MatchPoolPanel
            draft={draft}
            match={match}
            active={tab === 'matches'}
            compact
            onSelectNode={onSelectNode}
          />
        </div>
        <div className={`l2-inspector-panel l2-inspector-test${tab === 'test' ? ' is-active' : ''}`}>
          <L2PreviewPanel
            draft={draft}
            compact
            onTestTrace={onTestTrace}
            onSelectNode={onSelectNode}
          />
        </div>
      </div>
    </div>
  )
}
