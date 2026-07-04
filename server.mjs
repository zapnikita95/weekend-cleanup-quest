import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const port = Number(process.env.PORT || 4173)
const root = join(process.cwd(), 'dist')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`)
  const requestedPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  const filePath = join(root, requestedPath === '/' ? 'index.html' : requestedPath)
  const fallbackPath = join(root, 'index.html')
  const targetPath = existsSync(filePath) && statSync(filePath).isFile() ? filePath : fallbackPath

  response.setHeader('Content-Type', contentTypes[extname(targetPath)] || 'application/octet-stream')
  createReadStream(targetPath).pipe(response)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Weekend Cleanup Quest is running on port ${port}`)
})
