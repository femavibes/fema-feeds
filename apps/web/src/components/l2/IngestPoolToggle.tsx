import type { L2RuleNode } from '@cfb/core-types'

import { ingestPoolActive, showIngestPoolToggle, JETSTREAM_FILTER_ARIA, JETSTREAM_FILTER_HINT, JETSTREAM_FILTER_LABEL } from '../../lib/run-at-ingest'

import { ToggleRow } from '../ToggleRow'



interface Props {

  node: L2RuleNode

  onChange: (node: L2RuleNode) => void

}



export function IngestPoolToggle({ node, onChange }: Props) {

  if (!showIngestPoolToggle(node)) return null

  return (

    <ToggleRow
      label={JETSTREAM_FILTER_LABEL}
      hint={JETSTREAM_FILTER_HINT}
      checked={ingestPoolActive(node)}
      onChange={(checked) => {
        if (!showIngestPoolToggle(node)) return
        onChange({ ...node, runAtIngest: checked } as L2RuleNode)
      }}
      ariaLabel={JETSTREAM_FILTER_ARIA}
    />

  )

}

