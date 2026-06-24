import type { EnrichmentSettings, FeedConfig, ProjectL1Config } from '@cfb/core-types'

import { compileAllProjects } from '@cfb/l1-compile'

import {

  filterLabelsForPost,

  queryLabels,

  toLabelerLabels,

} from '@cfb/label-resolve'

import type pg from 'pg'

import {

  labelerLabelsFingerprint,

  listEnabledLabelerDids,

  listPostsDueForLabelRefresh,

  normalizedPostFromRow,

  touchPostLabelsChecked,

} from '@cfb/storage-postgres'

import { applyLabelerLabelsToPoolPost } from './apply.js'



export interface LabelRefreshSweepResult {

  checked: number

  changed: number

  l1Removed: number

  l2Reevaluated: number

  errors: number

}



function authorProfileUri(did: string): string {

  return `at://${did}/app.bsky.actor.profile/self`

}



/** Re-query labelers for pool posts; re-run L1/L2 when labels change. */

export async function sweepLabelRefresh(

  pool: pg.Pool,

  settings: EnrichmentSettings,

  feeds: FeedConfig[],

  projects: ProjectL1Config[],

): Promise<LabelRefreshSweepResult> {

  const result: LabelRefreshSweepResult = {

    checked: 0,

    changed: 0,

    l1Removed: 0,

    l2Reevaluated: 0,

    errors: 0,

  }



  if (!settings.enabled || !settings.labelRefreshEnabled) return result



  const labelerDids = await listEnabledLabelerDids(pool)

  if (labelerDids.length === 0) return result



  const candidates = await listPostsDueForLabelRefresh(pool, {

    limit: settings.labelRefreshBatchSize,

    maxAgeDays: settings.labelRefreshMaxAgeDays,

    intervalMinutes: settings.labelRefreshIntervalMinutes,

  })

  if (candidates.length === 0) return result



  compileAllProjects(projects)



  const uriPatterns = new Set<string>()

  for (const row of candidates) {

    uriPatterns.add(row.postUri)

    uriPatterns.add(row.authorDid)

    uriPatterns.add(authorProfileUri(row.authorDid))

  }



  let rawLabels: Awaited<ReturnType<typeof queryLabels>>

  try {

    rawLabels = await queryLabels([...uriPatterns], labelerDids)

  } catch {

    for (const row of candidates) {

      await touchPostLabelsChecked(pool, row.postUri).catch(() => undefined)

    }

    result.checked = candidates.length

    result.errors = candidates.length

    return result

  }



  for (const row of candidates) {

    result.checked++

    try {

      const post = normalizedPostFromRow(row)

      const before = labelerLabelsFingerprint(post.labelerLabels)

      const filtered = filterLabelsForPost(rawLabels, post.uri, post.authorDid)

      const labelerLabels = toLabelerLabels(filtered, post)

      const after = labelerLabelsFingerprint(labelerLabels)



      if (before === after) {

        await touchPostLabelsChecked(pool, post.uri)

        continue

      }



      const applied = await applyLabelerLabelsToPoolPost(

        pool,

        post.uri,

        labelerLabels,

        feeds,

        projects,

      )

      if (!applied) continue



      result.changed++

      result.l1Removed += applied.l1Removed

      if (applied.l2Reevaluated) result.l2Reevaluated++

    } catch {

      result.errors++

      await touchPostLabelsChecked(pool, row.postUri).catch(() => undefined)

    }

  }



  return result

}

