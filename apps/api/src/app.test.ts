import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { IngestRunner } from '@cfb/ingest-runner'
import { createApp } from './app.js'

const root = resolve(import.meta.dirname, '../../..')
const projectsDir = resolve(root, 'config/projects')
const feedsDir = resolve(root, 'config/feeds')

function mockIngest(initial = false): IngestRunner {
  let running = initial
  const status = () => ({
    running,
    startedAt: running ? '2026-01-01T00:00:00.000Z' : null,
    jetstreamUrl: running ? 'wss://test' : null,
    lastSession: null,
    seen: 10,
    l1Pass: 2,
    saved: 2,
    saveErrors: 0,
    enrichment: {
      enabled: true,
      profileFetches: 0,
      profileErrors: 0,
      labelResolves: 0,
      labelResolveErrors: 0,
      engagementBumps: 0,
      engagementIgnored: 0,
      engagementErrors: 0,
      labelStream: {
        connections: 0,
        events: 0,
        labelsProcessed: 0,
        postsChanged: 0,
        errors: 0,
      },
    },
    l2: {
      evaluated: 0,
      matched: 0,
      written: 0,
      errors: 0,
    },
  })
  return {
    getStatus: status,
    start: async () => {
      running = true
      return status()
    },
    stop: async () => {
      running = false
      return status()
    },
  }
}

describe('api', () => {
  const app = createApp({ pool: null, projectsDir, feedsDir, ingest: mockIngest() })

  it('GET /api/health', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; bootId: string; startedAt: string }
    expect(body.ok).toBe(true)
    expect(body.bootId).toBeTruthy()
    expect(body.startedAt).toBeTruthy()
  })

  it('GET /api/projects lists configs', async () => {
    const res = await app.request('/api/projects')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { projects: Array<{ projectId: string }> }
    expect(body.projects.length).toBeGreaterThan(0)
    expect(body.projects.some((p) => p.projectId === 'urbanism')).toBe(true)
  })

  it('GET /api/projects/:projectId/feeds', async () => {
    const res = await app.request('/api/projects/urbanism/feeds')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { feeds: Array<{ feedId: string; projectId: string }> }
    expect(body.feeds.some((f) => f.projectId === 'urbanism')).toBe(true)
  })

  it('POST /api/projects/:id/preview returns L1 trace', async () => {
    const res = await app.request('/api/projects/video-creators/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { matched: boolean; trace: unknown[] } }
    expect(body.result.trace.length).toBeGreaterThan(0)
    expect(body.result.matched).toBe(true)
  })

  it('GET /api/ingest/status', async () => {
    const res = await app.request('/api/ingest/status')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { running: boolean }
    expect(body.running).toBe(false)
  })

  it('POST /api/ingest/start and stop', async () => {
    const ingest = mockIngest()
    const isolated = createApp({ pool: null, projectsDir, feedsDir, ingest })
    const start = await isolated.request('/api/ingest/start', { method: 'POST' })
    expect(start.status).toBe(200)
    expect((await start.json()) as { running: boolean }).toEqual(expect.objectContaining({ running: true }))
    const stop = await isolated.request('/api/ingest/stop', { method: 'POST' })
    expect((await stop.json()) as { running: boolean }).toEqual(expect.objectContaining({ running: false }))
  })

  it('GET /api/stats returns 503 without database', async () => {
    const res = await app.request('/api/stats')
    expect(res.status).toBe(503)
  })

  it('POST /api/projects creates a new project', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cfb-api-'))
    const feedDir = await mkdtemp(join(tmpdir(), 'cfb-api-feeds-'))
    const isolated = createApp({ pool: null, projectsDir: dir, feedsDir: feedDir })
    const id = 'test-project'
    const res = await isolated.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: id, name: 'Test Project' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { project: { projectId: string } }
    expect(body.project.projectId).toBe(id)
  })

  it('POST /api/feeds creates a feed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cfb-api-p-'))
    const feedDir = await mkdtemp(join(tmpdir(), 'cfb-api-f-'))
    const isolated = createApp({ pool: null, projectsDir: dir, feedsDir: feedDir })
    await isolated.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'p1', name: 'P1' }),
    })
    const res = await isolated.request('/api/feeds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        feedId: 'f1',
        projectId: 'p1',
        name: 'Feed 1',
        enabled: true,
        poolScope: 'project_only',
        match: { type: 'group', id: 'root', logic: 'any', children: [] },
      }),
    })
    expect(res.status).toBe(201)
    const list = await isolated.request('/api/projects/p1/feeds')
    const body = (await list.json()) as { feeds: Array<{ feedId: string }> }
    expect(body.feeds.some((f) => f.feedId === 'f1')).toBe(true)
  })

  it('DELETE /api/projects/:id removes project file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cfb-api-del-'))
    const feedDir = await mkdtemp(join(tmpdir(), 'cfb-api-del-f-'))
    const isolated = createApp({ pool: null, projectsDir: dir, feedsDir: feedDir })
    const id = 'to-delete'
    await isolated.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: id, name: 'Delete Me' }),
    })
    const del = await isolated.request(`/api/projects/${id}`, { method: 'DELETE' })
    expect(del.status).toBe(200)
    const get = await isolated.request(`/api/projects/${id}`)
    expect(get.status).toBe(404)
  })

  it('GET describeFeedGenerator returns 503 without FEEDGEN_DID', async () => {
    const prev = process.env.FEEDGEN_DID
    delete process.env.FEEDGEN_DID
    const isolated = createApp({ pool: null, projectsDir, feedsDir, ingest: mockIngest() })
    const res = await isolated.request('/xrpc/app.bsky.feed.describeFeedGenerator')
    if (prev) process.env.FEEDGEN_DID = prev
    expect(res.status).toBe(503)
  })

  it('GET describeFeedGenerator lists feeds when DID configured', async () => {
    const prev = process.env.FEEDGEN_DID
    process.env.FEEDGEN_DID = 'did:plc:testgen'
    const isolatedFeedsDir = await mkdtemp(join(tmpdir(), 'cfb-feeds-'))
    const { writeFile } = await import('node:fs/promises')
    await writeFile(
      join(isolatedFeedsDir, 'pub-feed.json'),
      JSON.stringify({
        feedId: 'pub-feed',
        projectId: 'urbanism',
        name: 'Published test feed',
        enabled: true,
        published: true,
        poolScope: 'project_only',
        match: { type: 'group', id: 'root', logic: 'any', children: [] },
      }),
      'utf8',
    )
    const isolated = createApp({ pool: null, projectsDir, feedsDir: isolatedFeedsDir, ingest: mockIngest() })
    const res = await isolated.request('/xrpc/app.bsky.feed.describeFeedGenerator')
    if (prev) process.env.FEEDGEN_DID = prev
    else delete process.env.FEEDGEN_DID
    expect(res.status).toBe(200)
    const body = (await res.json()) as { did: string; feeds: Array<{ uri: string }> }
    expect(body.did).toBe('did:plc:testgen')
    expect(body.feeds.some((f) => f.uri.includes('pub-feed'))).toBe(true)
  })

  it('GET /api/feeds/:id/publish returns checklist', async () => {
    const res = await app.request('/api/feeds/urbanism/publish')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { feedId: string; checklist: unknown[] }
    expect(body.feedId).toBe('urbanism')
    expect(body.checklist.length).toBeGreaterThan(0)
  })

  it('POST /api/feeds/:id/import-rules maps legacy groups', async () => {
    const res = await app.request('/api/feeds/urbanism/import-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rules: {
          logic: 'OR',
          groups: [
            {
              logic: 'AND',
              conditions: [{ field: 'text', operator: 'contains', value: 'bike' }],
            },
          ],
        },
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { conditionCount: number; match: { logic: string } }
    expect(body.conditionCount).toBe(1)
    expect(body.match.logic).toBe('any')
  })

  it('POST /api/feeds/:id/import-rules maps Graze manifest.filter', async () => {
    const res = await app.request('/api/feeds/urbanism/import-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rules: {
          manifest: {
            filter: {
              and: [
                {
                  or: [
                    { regex_matches: ['text', 'bike', true] },
                    { social_list: [['did:plc:test'], 'in'] },
                  ],
                },
              ],
            },
          },
        },
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { conditionCount: number; match: { logic: string; children: unknown[] } }
    expect(body.conditionCount).toBeGreaterThanOrEqual(2)
    expect(body.match.logic).toBe('all')
    expect(body.match.children.length).toBe(1)
  })
})
