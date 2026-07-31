import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { WebSocketServer } from 'ws'
import { Hub } from './hub.js'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '0.0.0.0'
/** Build del cliente. En produccion el mismo proceso sirve la web y el WS. */
const WEB_DIST = resolve(process.env.WEB_DIST ?? new URL('../../web/dist', import.meta.url).pathname)

const hub = new Hub()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function serveStatic(urlPath: string): Promise<{ body: Buffer; type: string } | null> {
  // normalize + prefijo obligatorio: sin esto un `../../etc/passwd` sale del dist.
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '')
  const target = join(WEB_DIST, rel)
  if (!target.startsWith(WEB_DIST)) return null

  try {
    const info = await stat(target)
    if (info.isDirectory()) return null
    return { body: await readFile(target), type: MIME[extname(target)] ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, ...hub.stats() }))
    return
  }

  void (async () => {
    const asset = await serveStatic(url.pathname === '/' ? '/index.html' : url.pathname)
    if (asset) {
      res.writeHead(200, { 'content-type': asset.type })
      res.end(asset.body)
      return
    }
    // SPA: cualquier ruta desconocida devuelve el index y rutea el cliente.
    const index = await serveStatic('/index.html')
    if (index) {
      res.writeHead(200, { 'content-type': index.type })
      res.end(index.body)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('El cliente no esta compilado todavia. Corré: npm run build -w @drecksau/web')
  })()
})

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 })

wss.on('connection', (ws) => {
  const ctx: { playerId: string | null } = { playerId: null }
  let alive = true

  ws.on('message', (data) => {
    hub.onMessage(ws, ctx, data.toString())
  })
  ws.on('close', () => hub.onClose(ctx))
  ws.on('error', () => hub.onClose(ctx))
  ws.on('pong', () => {
    alive = true
  })

  // Heartbeat: detecta sockets colgados que nunca disparan 'close'.
  const beat = setInterval(() => {
    if (!alive) {
      clearInterval(beat)
      ws.terminate()
      return
    }
    alive = false
    try {
      ws.ping()
    } catch {
      clearInterval(beat)
    }
  }, 30_000)

  ws.on('close', () => clearInterval(beat))
})

setInterval(() => hub.sweep(), 60_000)

server.listen(PORT, HOST, () => {
  console.log(`[drecksau] servidor escuchando en http://${HOST}:${PORT}`)
  console.log(`[drecksau] websocket en ws://${HOST}:${PORT}/ws`)
  console.log(`[drecksau] sirviendo cliente desde ${WEB_DIST}`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[drecksau] ${sig}, cerrando`)
    wss.close()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
