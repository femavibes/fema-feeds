import { describe, expect, it } from 'vitest'
import type { ProjectL1Config } from '@cfb/core-types'
import { hydrateProjectsWithCache } from './hydrate.js'

describe('hydrateProjectsWithCache', () => {
  it('merges cached DIDs onto author lists by listId', () => {
    const projects: ProjectL1Config[] = [
      {
        projectId: 'urbanism',
        name: 'Urbanism',
        enabled: true,
        authorLists: [
          {
            listId: 'urbanism-orgs',
            fastPath: { enabled: true, bypassSteps: [] },
          },
        ],
      },
    ]
    const cache = new Map([['urbanism-orgs', { dids: ['did:plc:a', 'did:plc:b'] }]])
    const out = hydrateProjectsWithCache(projects, cache)
    expect(out[0]?.authorLists?.[0]?.dids).toEqual(['did:plc:a', 'did:plc:b'])
  })

  it('leaves lists unchanged when cache has no entry', () => {
    const projects: ProjectL1Config[] = [
      {
        projectId: 'x',
        name: 'X',
        enabled: true,
        authorLists: [
          {
            listId: 'manual',
            dids: ['did:plc:keep'],
            fastPath: { enabled: false, bypassSteps: [] },
          },
        ],
      },
    ]
    const out = hydrateProjectsWithCache(projects, new Map())
    expect(out[0]?.authorLists?.[0]?.dids).toEqual(['did:plc:keep'])
  })

  it('unions manual DIDs with cached list members', () => {
    const projects: ProjectL1Config[] = [
      {
        projectId: 'x',
        name: 'X',
        enabled: true,
        authorLists: [
          {
            listId: 'mixed',
            dids: ['did:plc:manual'],
            fastPath: { enabled: true, bypassSteps: [] },
          },
        ],
      },
    ]
    const cache = new Map([['mixed', { dids: ['did:plc:cached'] }]])
    const out = hydrateProjectsWithCache(projects, cache)
    expect(out[0]?.authorLists?.[0]?.dids).toEqual(['did:plc:cached', 'did:plc:manual'])
  })
})
