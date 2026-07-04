import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename, extname, join, normalize } from 'node:path'

const port = Number(process.env.PORT || 4173)
const root = join(process.cwd(), 'dist')
const dataDir = process.env.DATA_DIR || '/data'
const uploadDir = join(dataDir, 'uploads')
const dbPath = join(dataDir, 'weekend-cleanup-quest.json')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

const defaultDb = {
  activeGames: {},
  profiles: {},
  games: [],
}

mkdirSync(uploadDir, { recursive: true })

const normalizeEmail = (email = '') => email.trim().toLowerCase()

const safeFileName = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'avatar'

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const readJsonBody = async (request) => {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const readDb = () => {
  if (!existsSync(dbPath)) return structuredClone(defaultDb)
  try {
    const parsed = JSON.parse(readFileSync(dbPath, 'utf8'))
    return {
      activeGames: parsed.activeGames && typeof parsed.activeGames === 'object' ? parsed.activeGames : {},
      profiles: parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {},
      games: Array.isArray(parsed.games) ? parsed.games : [],
    }
  } catch {
    return structuredClone(defaultDb)
  }
}

const writeDb = (db) => {
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`)
}

const sendJson = (response, status, payload) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

const sendError = (response, status, message) => sendJson(response, status, { error: message })

const getPairKey = (players) =>
  players
    .map((player) => normalizeEmail(player.email))
    .filter(Boolean)
    .sort()
    .join('|')

const hydrateGame = (game, profiles) => ({
  ...game,
  players: game.players.map((player) => ({
    ...player,
    profile: profiles[normalizeEmail(player.email)] || null,
  })),
})

const hydrateActiveGame = (game, profiles) => ({
  ...game,
  players: game.players.map((player) => ({
    ...player,
    profile: profiles[normalizeEmail(player.email)] || null,
  })),
})

const buildState = () => {
  const db = readDb()
  const profiles = Object.values(db.profiles).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const games = db.games
    .slice()
    .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())
    .map((game) => hydrateGame(game, db.profiles))

  const pairMap = new Map()

  for (const game of games) {
    if (!game.pairKey) continue
    const current =
      pairMap.get(game.pairKey) || {
        pairKey: game.pairKey,
        players: game.players,
        games: 0,
        totalScore: 0,
        totalChores: 0,
        wins: {},
        lastPlayedAt: game.finishedAt,
      }

    current.games += 1
    current.totalScore += game.scores.reduce((sum, score) => sum + score.total, 0)
    current.totalChores += game.scores.reduce((sum, score) => sum + score.count, 0)
    current.lastPlayedAt =
      new Date(game.finishedAt).getTime() > new Date(current.lastPlayedAt).getTime()
        ? game.finishedAt
        : current.lastPlayedAt
    if (game.winnerEmail) {
      current.wins[game.winnerEmail] = (current.wins[game.winnerEmail] || 0) + 1
    }
    pairMap.set(game.pairKey, current)
  }

  const leaderboard = [...pairMap.values()].sort((a, b) => {
    const scoreA = a.totalScore + a.games * 25 + a.totalChores * 5
    const scoreB = b.totalScore + b.games * 25 + b.totalChores * 5
    return scoreB - scoreA
  })

  return { profiles, games, leaderboard }
}

const getActiveGame = (requestUrl) => {
  const match = requestUrl.pathname.match(/^\/api\/active-games\/([^/]+)(?:\/(.+))?$/)
  if (!match) return null
  return { id: decodeURIComponent(match[1]), action: match[2] || '' }
}

const createActiveGame = async (request, response) => {
  const body = await readJsonBody(request)
  const players = Array.isArray(body.players)
    ? body.players.map((player) => ({
        email: normalizeEmail(player.email),
        name: String(player.name || '').trim(),
        avatar: String(player.avatar || 'fox'),
        avatarUrl: String(player.avatarUrl || ''),
      }))
    : []
  const chores = Array.isArray(body.chores) ? body.chores : []

  if (players.length !== 2 || players.some((player) => !player.email || !player.email.includes('@'))) {
    sendError(response, 400, 'Для активной игры нужны два игрока с почтой.')
    return
  }

  const db = readDb()
  const existingId = String(body.id || '')
  const id = existingId && db.activeGames[existingId] ? existingId : makeId()
  const previous = db.activeGames[id] || {}
  const activeGame = {
    id,
    pairKey: getPairKey(players),
    players,
    chores,
    roundMinutes: Number(body.roundMinutes || previous.roundMinutes || 0),
    startedAt: previous.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  db.activeGames[id] = activeGame
  writeDb(db)
  sendJson(response, 200, { game: hydrateActiveGame(activeGame, db.profiles) })
}

const completeActiveChore = async (gameId, request, response) => {
  const body = await readJsonBody(request)
  const db = readDb()
  const game = db.activeGames[gameId]
  if (!game) {
    sendError(response, 404, 'Активная игра не найдена.')
    return
  }

  const playerIndex = Number(body.playerIndex)
  if (playerIndex !== 0 && playerIndex !== 1) {
    sendError(response, 400, 'Нужен номер игрока.')
    return
  }

  const choreId = body.choreId ? String(body.choreId) : ''
  const target = choreId
    ? game.chores.find((chore) => chore.id === choreId && chore.assignedTo === playerIndex)
    : game.chores.find((chore) => chore.assignedTo === playerIndex && !chore.completed)

  if (!target) {
    sendJson(response, 200, { game: hydrateActiveGame(game, db.profiles) })
    return
  }

  const completed = game.chores
    .filter((chore) => chore.assignedTo === playerIndex && chore.completed && chore.completedAt)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
  const lastDoneAt = completed[0]?.completedAt || game.startedAt || new Date().toISOString()
  const completedAt = new Date().toISOString()
  const actualMinutes = Math.max(1, Math.round((new Date(completedAt).getTime() - new Date(lastDoneAt).getTime()) / 60000))

  game.chores = game.chores.map((chore) =>
    chore.id === target.id && chore.assignedTo === playerIndex
      ? { ...chore, completed: true, completedAt: Date.now(), actualMinutes }
      : chore,
  )
  game.updatedAt = completedAt
  db.activeGames[gameId] = game
  writeDb(db)
  sendJson(response, 200, { game: hydrateActiveGame(game, db.profiles) })
}

const upsertProfile = async (request, response) => {
  const body = await readJsonBody(request)
  const email = normalizeEmail(body.email)
  if (!email || !email.includes('@')) {
    sendError(response, 400, 'Нужна корректная почта профиля.')
    return
  }

  const db = readDb()
  const previous = db.profiles[email] || {}
  const profile = {
    email,
    name: String(body.name || previous.name || email.split('@')[0]).trim(),
    avatar: String(body.avatar || previous.avatar || 'fox'),
    avatarUrl: body.avatarUrl || previous.avatarUrl || '',
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  db.profiles[email] = profile
  writeDb(db)
  sendJson(response, 200, { profile, state: buildState() })
}

const uploadAvatar = async (request, response) => {
  const body = await readJsonBody(request)
  const email = normalizeEmail(body.email)
  const dataUrl = String(body.dataUrl || '')
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|gif|webp|svg\+xml));base64,(.+)$/)

  if (!email || !email.includes('@')) {
    sendError(response, 400, 'Нужна почта профиля для загрузки аватарки.')
    return
  }

  if (!match) {
    sendError(response, 400, 'Можно загрузить только картинку.')
    return
  }

  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.byteLength > 1_500_000) {
    sendError(response, 413, 'Аватарка слишком большая. Лимит 1.5 MB.')
    return
  }

  const extension = match[1].includes('svg') ? 'svg' : match[1].split('/')[1].replace('jpeg', 'jpg')
  const fileName = `${safeFileName(email)}-${Date.now()}.${extension}`
  const filePath = join(uploadDir, fileName)
  writeFileSync(filePath, buffer)

  const db = readDb()
  const previous = db.profiles[email] || {}
  const profile = {
    email,
    name: String(body.name || previous.name || email.split('@')[0]).trim(),
    avatar: String(body.avatar || previous.avatar || 'custom'),
    avatarUrl: `/uploads/${fileName}`,
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  db.profiles[email] = profile
  writeDb(db)
  sendJson(response, 200, { profile, state: buildState() })
}

const createGame = async (request, response) => {
  const body = await readJsonBody(request)
  const players = Array.isArray(body.players)
    ? body.players.map((player) => ({
        email: normalizeEmail(player.email),
        name: String(player.name || '').trim(),
        avatar: String(player.avatar || 'fox'),
        avatarUrl: String(player.avatarUrl || ''),
      }))
    : []

  if (players.length !== 2 || players.some((player) => !player.email || !player.email.includes('@'))) {
    sendError(response, 400, 'Для истории нужны два игрока с почтой.')
    return
  }

  const scores = Array.isArray(body.scores) ? body.scores : []
  if (scores.length !== 2) {
    sendError(response, 400, 'Нужно передать очки двух игроков.')
    return
  }

  const db = readDb()
  for (const player of players) {
    const previous = db.profiles[player.email] || {}
    db.profiles[player.email] = {
      email: player.email,
      name: player.name || previous.name || player.email.split('@')[0],
      avatar: player.avatar || previous.avatar || 'fox',
      avatarUrl: player.avatarUrl || previous.avatarUrl || '',
      createdAt: previous.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  const winnerEmail = body.winnerEmail ? normalizeEmail(body.winnerEmail) : ''
  const game = {
    id: makeId(),
    pairKey: getPairKey(players),
    players,
    winnerEmail,
    roundMinutes: Number(body.roundMinutes || 0),
    elapsedSeconds: Number(body.elapsedSeconds || 0),
    scores: scores.map((score, index) => ({
      email: players[index].email,
      total: Number(score.total || 0),
      count: Number(score.count || 0),
      speed: Number(score.speed || 0),
      streak: Number(score.streak || 0),
      partner: Number(score.partner || 0),
    })),
    chores: Array.isArray(body.chores) ? body.chores.slice(0, 80) : [],
    finishedAt: new Date().toISOString(),
  }

  db.games.push(game)
  db.games = db.games.slice(-500)
  writeDb(db)
  sendJson(response, 201, { game: hydrateGame(game, db.profiles), state: buildState() })
}

const serveFile = (response, filePath) => {
  response.setHeader('Content-Type', contentTypes[extname(filePath)] || 'application/octet-stream')
  createReadStream(filePath).pipe(response)
}

const serveUpload = (url, response) => {
  const fileName = basename(decodeURIComponent(url.pathname.replace('/uploads/', '')))
  const filePath = join(uploadDir, fileName)
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendError(response, 404, 'Файл не найден.')
    return
  }
  serveFile(response, filePath)
}

const serveStatic = (url, response) => {
  const requestedPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  const filePath = join(root, requestedPath === '/' ? 'index.html' : requestedPath)
  const fallbackPath = join(root, 'index.html')
  const targetPath = existsSync(filePath) && statSync(filePath).isFile() ? filePath : fallbackPath
  serveFile(response, targetPath)
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`)

  try {
    if (request.method === 'GET' && url.pathname === '/api/state') {
      sendJson(response, 200, buildState())
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/active-games') {
      await createActiveGame(request, response)
      return
    }
    const activeRoute = getActiveGame(url)
    if (activeRoute && request.method === 'GET' && !activeRoute.action) {
      const db = readDb()
      const game = db.activeGames[activeRoute.id]
      if (!game) {
        sendError(response, 404, 'Активная игра не найдена.')
        return
      }
      sendJson(response, 200, { game: hydrateActiveGame(game, db.profiles) })
      return
    }
    if (activeRoute && request.method === 'POST' && activeRoute.action === 'complete') {
      await completeActiveChore(activeRoute.id, request, response)
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/profiles') {
      await upsertProfile(request, response)
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/avatar') {
      await uploadAvatar(request, response)
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/games') {
      await createGame(request, response)
      return
    }
    if (request.method === 'GET' && url.pathname.startsWith('/uploads/')) {
      serveUpload(url, response)
      return
    }
    serveStatic(url, response)
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : 'Server error')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Weekend Cleanup Quest is running on port ${port}`)
})
