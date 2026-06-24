import { createServer } from 'node:http'
import { rankRequest } from '../src/index.js'
import type { RankerRequest } from '../src/types.js'

const PORT = Number(process.env.CFB_RANKER_PORT ?? 8791)

createServer(async (req, res) => {
  if (req.method === 'POST' && (req.url === '/on_sort' || req.url === '/')) {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as RankerRequest
      const out = rankRequest(body)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(out))
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'bad request' }))
    }
    return
  }
  res.writeHead(404)
  res.end('POST /on_sort')
}).listen(PORT, () => {
  console.log(`fema-personalized-rank dev server http://127.0.0.1:${PORT}/on_sort`)
})
