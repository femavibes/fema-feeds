import { randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'

const port = Number(process.env.API_PORT ?? 3000)
const bootId = randomUUID()
const app = createApp({ bootId })

const server = serve({ fetch: app.fetch, port }, () => {
  console.error(`[api] http://localhost:${port}`)
})

async function shutdown() {
  console.error('[api] shutting down…')
  app.stopDuckDnsPoller?.()
  await app.ingest.stop()
  await server.close()
  process.exit(0)
}

process.on('SIGINT', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })
