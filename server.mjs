import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename, extname, join, normalize } from 'node:path'
import { applyRoomProgressOnLevelUp, defaultRoomProgress, normalizeRoomProgress } from './rooms-shared.mjs'

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
  childProfiles: {},
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
      childProfiles: parsed.childProfiles && typeof parsed.childProfiles === 'object' ? parsed.childProfiles : {},
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
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

const sendError = (response, status, message) => sendJson(response, status, { error: message })

const getPairKey = (players) =>
  players
    .map((player) => normalizeEmail(player.email))
    .filter(Boolean)
    .sort()
    .join('|')

const defaultStarRules = () => ({ gold: 3, silver: 2, bronze: 1 })

const categoryAchievements = [
  { id: 'kitchen_combo', icon: 'kitchen', threshold: 3 },
]

const computeCategoryCountsFromChores = (chores = []) => {
  const counts = {}
  for (const chore of chores) {
    if (!chore.completed) continue
    const title = String(chore.parentTitle || chore.title || '').toLowerCase()
    let icon = 'storage'
    if (title.includes('кух') || title.includes('посуд')) icon = 'kitchen'
    else if (title.includes('ванн') || title.includes('туал') || title.includes('раков')) icon = 'bath'
    else if (title.includes('спаль')) icon = 'bedroom'
    else if (title.includes('гостин') || title.includes('комнат')) icon = 'living'
    else if (title.includes('прихож') || title.includes('корид')) icon = 'hall'
    else if (title.includes('сад') || title.includes('двор') || title.includes('улиц')) icon = 'garden'
    counts[icon] = (counts[icon] || 0) + 1
  }
  return counts
}

const unlockAchievements = (categoryCounts, currentIds = []) => {
  const next = new Set(currentIds)
  for (const achievement of categoryAchievements) {
    if ((categoryCounts[achievement.icon] || 0) >= achievement.threshold) next.add(achievement.id)
  }
  if (Object.values(categoryCounts || {}).filter((count) => Number(count || 0) > 0).length >= 3) next.add('triple_zone')
  return [...next]
}

const computeLedgerStreak = (ledger = []) => {
  if (!ledger.length) return 0
  const days = [...new Set(ledger.map((entry) => String(entry.createdAt || '').slice(0, 10)).filter(Boolean))]
    .sort()
    .reverse()
  let streak = 1
  let previous = new Date(days[0])
  for (let i = 1; i < days.length; i++) {
    const current = new Date(days[i])
    const diffDays = Math.round((previous.getTime() - current.getTime()) / (1000 * 3600 * 24))
    if (diffDays === 1) {
      streak += 1
      previous = current
    } else if (diffDays > 1) {
      break
    }
  }
  return streak
}

const defaultChildProfile = ({ id, parentEmail, childEmail, name, avatar, avatarUrl = '', ageGroup = 'kid' }) => ({
  id,
  parentEmail: normalizeEmail(parentEmail),
  childEmail: normalizeEmail(childEmail),
  name: String(name || 'Ребёнок').trim(),
  avatar: String(avatar || 'duck'),
  avatarUrl: String(avatarUrl || ''),
  starBalance: 0,
  starRules: defaultStarRules(),
  rewards: ageGroup === 'teen'
    ? [
        { id: makeId(), starsRequired: 5, label: 'Час без вопросов по телефону', category: 'privilege' },
        { id: makeId(), starsRequired: 8, label: 'Выбор фильма или сериала на вечер', category: 'experience' },
        { id: makeId(), starsRequired: 12, label: 'Эквивалент 300₽ на карманные расходы', category: 'allowance' },
        { id: makeId(), starsRequired: 20, label: 'Выходной без домашних дел + 500₽', category: 'experience' },
      ]
    : [
        { id: makeId(), starsRequired: 3, label: 'Маленький подарок', category: 'item' },
        { id: makeId(), starsRequired: 5, label: 'Выбор мультика / игры', category: 'experience' },
        { id: makeId(), starsRequired: 10, label: 'Большой приз (игрушка / поход)', category: 'item' },
      ],
  ledger: [],
  achievementIds: [],
  categoryCounts: {},
  totalQuests: 0,
  ageGroup: ageGroup === 'teen' ? 'teen' : 'kid',
  currentGoal: undefined,
  moneyRate: ageGroup === 'teen' ? 25 : 15, // руб за звезду
  skillLevels: {},
  xp: 0,
  equippedCosmetics: {},
  unlockedCosmetics: [],
  cosmeticChoiceLevels: [],
  roomProgress: defaultRoomProgress(),
  regularTasks: [],
  lootboxRewards: ['+20xp', '+1 звезда', 'potion', 'candy'],
  lootboxCharges: 0,
  pendingRegulars: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

const sanitizeChildProfile = (profile, fallback = {}) => ({
  id: String(profile.id || fallback.id || makeId()),
  parentEmail: normalizeEmail(profile.parentEmail || fallback.parentEmail || ''),
  childEmail: normalizeEmail(profile.childEmail || fallback.childEmail || ''),
  name: String(profile.name || fallback.name || 'Ребёнок').trim(),
  avatar: String(profile.avatar || fallback.avatar || 'duck'),
  avatarUrl: String(profile.avatarUrl || fallback.avatarUrl || ''),
  starBalance: Number(profile.starBalance ?? fallback.starBalance ?? 0),
  starRules: {
    gold: Number(profile.starRules?.gold ?? fallback.starRules?.gold ?? 3),
    silver: Number(profile.starRules?.silver ?? fallback.starRules?.silver ?? 2),
    bronze: Number(profile.starRules?.bronze ?? fallback.starRules?.bronze ?? 1),
  },
  rewards: Array.isArray(profile.rewards)
    ? profile.rewards.map((reward) => ({
        id: String(reward.id || makeId()),
        starsRequired: Number(reward.starsRequired || 0),
        label: String(reward.label || '').trim(),
        redeemedAt: reward.redeemedAt ? String(reward.redeemedAt) : undefined,
        category: reward.category || undefined,
      }))
    : fallback.rewards || [],
  ledger: Array.isArray(profile.ledger) ? profile.ledger.slice(-100) : fallback.ledger || [],
  achievementIds: Array.isArray(profile.achievementIds) ? profile.achievementIds.map(String) : fallback.achievementIds || [],
  categoryCounts:
    profile.categoryCounts && typeof profile.categoryCounts === 'object'
      ? profile.categoryCounts
      : fallback.categoryCounts || {},
  totalQuests: Number(profile.totalQuests ?? fallback.totalQuests ?? 0),
  ageGroup: profile.ageGroup === 'teen' ? 'teen' : 'kid',
  currentGoal: profile.currentGoal && profile.currentGoal.label && profile.currentGoal.starsTarget
    ? { label: String(profile.currentGoal.label), starsTarget: Number(profile.currentGoal.starsTarget) }
    : fallback.currentGoal || undefined,
  moneyRate: Number(profile.moneyRate ?? fallback.moneyRate ?? (profile.ageGroup === 'teen' ? 25 : 15)),
  skillLevels: profile.skillLevels && typeof profile.skillLevels === 'object' ? profile.skillLevels : fallback.skillLevels || {},
  xp: Number(profile.xp ?? fallback.xp ?? 0),
  equippedCosmetics: profile.equippedCosmetics && typeof profile.equippedCosmetics === 'object' ? profile.equippedCosmetics : fallback.equippedCosmetics || {},
  unlockedCosmetics: Array.isArray(profile.unlockedCosmetics) ? profile.unlockedCosmetics : fallback.unlockedCosmetics || [],
  cosmeticChoiceLevels: Array.isArray(profile.cosmeticChoiceLevels) ? profile.cosmeticChoiceLevels.map(Number).filter(Number.isFinite) : fallback.cosmeticChoiceLevels || [],
  roomProgress: normalizeRoomProgress(profile.roomProgress ?? fallback.roomProgress),
  regularTasks: Array.isArray(profile.regularTasks) ? profile.regularTasks.map(t => ({
    id: String(t.id || makeId()),
    label: String(t.label || 'Задание'),
    xp: Number(t.xp || 10),
    stars: Number(t.stars || 1),
  })) : fallback.regularTasks || [],
  lootboxRewards: Array.isArray(profile.lootboxRewards) ? profile.lootboxRewards.map(String) : fallback.lootboxRewards || ['+20xp', '+1 звезда', 'potion'],
  lootboxCharges: Math.max(0, Math.floor(Number(profile.lootboxCharges ?? fallback.lootboxCharges ?? 0))),
  pendingRegulars: Array.isArray(profile.pendingRegulars)
    ? profile.pendingRegulars.map((t) => ({
        id: String(t.id || makeId()),
        label: String(t.label || 'Задание'),
        xp: Number(t.xp || 10),
        stars: Number(t.stars || 1),
        doneAt: t.doneAt ? String(t.doneAt) : undefined,
      }))
    : Array.isArray(fallback.pendingRegulars)
      ? fallback.pendingRegulars
      : [],
  createdAt: profile.createdAt || fallback.createdAt || new Date().toISOString(),
  updatedAt: profile.updatedAt || fallback.updatedAt || new Date().toISOString(),
})

const applyChildOutcome = (db, outcome, gameId) => {
  if (!outcome?.childProfileId) return
  const profileId = String(outcome.childProfileId)
  const previous = db.childProfiles[profileId]
  if (!previous) return
  if ((previous.ledger || []).some((entry) => entry.gameId === gameId)) return

  const starsEarned = Number(outcome.starsEarned || 0)
  const categoryDelta = computeCategoryCountsFromChores(outcome.chores || [])
  const categoryCounts = { ...(previous.categoryCounts || {}) }
  for (const [icon, count] of Object.entries(categoryDelta)) {
    categoryCounts[icon] = (categoryCounts[icon] || 0) + count
  }

  // Skill tree progression (RPG)
  const prevSkillLevels = previous.skillLevels || {}
  const newSkillLevels = {}
  let skillBonusStars = 0
  const skillKeys = ['kitchen', 'bath', 'bedroom', 'living', 'hall', 'garden']
  skillKeys.forEach(key => {
    const count = categoryCounts[key] || 0
    const newLvl = Math.floor(count / 4) + 1
    const oldLvl = prevSkillLevels[key] || 1
    newSkillLevels[key] = newLvl
    if (newLvl > oldLvl) {
      skillBonusStars += (newLvl - oldLvl) * 2
    }
  })

  const totalStarsThisQuest = starsEarned + skillBonusStars

  const ledgerEntry = {
    id: makeId(),
    gameId,
    stars: totalStarsThisQuest,
    tier: String(outcome.tier || 'none'),
    note: String(outcome.prizeLabel || outcome.note || 'Квест завершён') + (skillBonusStars > 0 ? ` (+${skillBonusStars} за навыки)` : ''),
    createdAt: new Date().toISOString(),
  }
  const totalQuests = Number(previous.totalQuests || 0) + 1
  const starBalance = Number(previous.starBalance || 0) + totalStarsThisQuest
  const nextAchievementIds = new Set(unlockAchievements(categoryCounts, previous.achievementIds || []))
  const nextLedger = [...(previous.ledger || []), ledgerEntry]
  const streak = computeLedgerStreak(nextLedger)
  if (totalQuests >= 1) nextAchievementIds.add('first_quest')
  if (String(outcome.tier || '') === 'gold') nextAchievementIds.add('gold_quest')
  if (starBalance >= 10) nextAchievementIds.add('star_collector')
  if (streak >= 3) nextAchievementIds.add('streak_3')
  if (streak >= 7) nextAchievementIds.add('streak_7')
  if (totalQuests >= 14) nextAchievementIds.add('many_quests')

  const prevXp = Number(previous.xp || 0)
  const nextXp = prevXp + (outcome.coins ? Math.floor(outcome.coins * 0.4) : 20)
  const roomProgress = applyRoomProgressOnLevelUp(prevXp, nextXp, previous.roomProgress)
  const lootboxesEnabled = Array.isArray(previous.lootboxRewards) && previous.lootboxRewards.length > 0
  const lootboxCharges = Number(previous.lootboxCharges || 0) + (lootboxesEnabled ? 1 : 0)

  db.childProfiles[profileId] = sanitizeChildProfile({
    ...previous,
    starBalance,
    totalQuests,
    categoryCounts,
    achievementIds: [...nextAchievementIds],
    skillLevels: newSkillLevels,
    xp: nextXp,
    roomProgress,
    lootboxCharges,
    ledger: nextLedger,
    updatedAt: new Date().toISOString(),
  })
}

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
  const activeGames = Object.values(db.activeGames || {})
    .sort((a, b) => new Date(b.updatedAt || b.startedAt).getTime() - new Date(a.updatedAt || a.startedAt).getTime())
    .map((game) => hydrateActiveGame(game, db.profiles))

  const boardMaps = {
    solo: new Map(),
    duo: new Map(),
    childQuest: new Map(),
  }

  for (const game of games) {
    if (!game.pairKey) continue
    const mode = game.mode === 'solo' ? 'solo' : game.mode === 'childQuest' ? 'childQuest' : 'duo'
    const boardKey = `${mode}|${game.pairKey}`
    const boardMap = boardMaps[mode]
    const current =
      boardMap.get(boardKey) || {
        pairKey: game.pairKey,
        mode,
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
    boardMap.set(boardKey, current)
  }

  const sortBoard = (entries) =>
    entries.sort((a, b) => {
      const scoreA = a.totalScore + a.games * 25 + a.totalChores * 5
      const scoreB = b.totalScore + b.games * 25 + b.totalChores * 5
      return scoreB - scoreA
    })

  const leaderboard = {
    solo: sortBoard([...boardMaps.solo.values()]),
    duo: sortBoard([...boardMaps.duo.values()]),
    childQuest: sortBoard([...boardMaps.childQuest.values()]),
  }

  const childProfiles = Object.values(db.childProfiles || {}).sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return { activeGames, profiles, games, leaderboard, childProfiles }
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
        isChild: Boolean(player.isChild),
      }))
    : []
  const chores = Array.isArray(body.chores) ? body.chores : []

  if (players.length < 1 || players.some((player) => !player.email || !player.email.includes('@'))) {
    sendError(response, 400, 'Для активной игры нужен хотя бы один игрок с почтой.')
    return
  }

  const db = readDb()
  const existingId = String(body.id || '')
  const id = existingId && db.activeGames[existingId] ? existingId : makeId()
  const previous = db.activeGames[id] || {}
  const mode = body.mode === 'solo' ? 'solo' : body.mode === 'childQuest' ? 'childQuest' : 'duo'
  const activeGame = {
    id,
    pairKey: getPairKey(players),
    players,
    chores,
    mode,
    prize: String(body.prize || previous.prize || ''),
    prizeTiers: Array.isArray(body.prizeTiers) ? body.prizeTiers : previous.prizeTiers || [],
    roundMinutes: Number(body.roundMinutes || previous.roundMinutes || 0),
    targetScore: Number(body.targetScore || previous.targetScore || 0),
    childPlayerIndex: Number.isInteger(body.childPlayerIndex) ? Number(body.childPlayerIndex) : previous.childPlayerIndex,
    parentPlayerIndex: Number.isInteger(body.parentPlayerIndex) ? Number(body.parentPlayerIndex) : previous.parentPlayerIndex,
    requirePhotoProof: Boolean(body.requirePhotoProof ?? previous.requirePhotoProof),
    phase: previous.phase || 'play',
    finishedPlayers: Array.isArray(previous.finishedPlayers) ? previous.finishedPlayers : [],
    startedAt: previous.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  db.activeGames[id] = activeGame
  writeDb(db)
  sendJson(response, 200, { game: hydrateActiveGame(activeGame, db.profiles) })
}

const deleteActiveGame = (gameId, response) => {
  const db = readDb()
  if (!db.activeGames[gameId]) {
    sendError(response, 404, 'Активная игра не найдена.')
    return
  }
  delete db.activeGames[gameId]
  writeDb(db)
  sendJson(response, 200, { state: buildState() })
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
  if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= game.players.length) {
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

  if (choreId && target.completed) {
    game.chores = game.chores.map((chore) =>
      chore.id === target.id && chore.assignedTo === playerIndex
        ? { ...chore, completed: false, completedAt: undefined, actualMinutes: undefined, proofPhotoUrl: undefined }
        : chore,
    )
    game.updatedAt = new Date().toISOString()
    db.activeGames[gameId] = game
    writeDb(db)
    sendJson(response, 200, { game: hydrateActiveGame(game, db.profiles) })
    return
  }

  const completed = game.chores
    .filter((chore) => chore.assignedTo === playerIndex && chore.completed && chore.completedAt)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
  const lastDoneAt = completed[0]?.completedAt || game.startedAt || new Date().toISOString()
  const completedAt = new Date().toISOString()
  const actualMinutes = Math.max(1, Math.round((new Date(completedAt).getTime() - new Date(lastDoneAt).getTime()) / 60000))
  const proofPhotoUrl = body.proofPhotoUrl ? String(body.proofPhotoUrl) : target.proofPhotoUrl || ''

  if (game.requirePhotoProof && !proofPhotoUrl) {
    sendError(response, 400, 'Для этого дела нужна фотография.')
    return
  }

  if (proofPhotoUrl && !proofPhotoUrl.startsWith('data:image/')) {
    sendError(response, 400, 'Можно прикрепить только фото.')
    return
  }

  if (proofPhotoUrl.length > 900_000) {
    sendError(response, 413, 'Фото слишком большое. Сожмите или выберите другое.')
    return
  }

  game.chores = game.chores.map((chore) =>
    chore.id === target.id && chore.assignedTo === playerIndex
      ? { 
          ...chore, 
          completed: true, 
          completedAt: Date.now(), 
          actualMinutes, 
          proofPhotoUrl,
          approved: !game.requirePhotoProof   // if photo required, wait for parent approval
        }
      : chore,
  )
  game.updatedAt = completedAt
  db.activeGames[gameId] = game
  writeDb(db)
  sendJson(response, 200, { game: hydrateActiveGame(game, db.profiles) })
}

const addActiveExtraChore = async (gameId, request, response) => {
  const body = await readJsonBody(request)
  const db = readDb()
  const game = db.activeGames[gameId]
  if (!game) {
    sendError(response, 404, 'Активная игра не найдена.')
    return
  }

  const assignedTo = Number(body.assignedTo)
  if (!Number.isInteger(assignedTo) || assignedTo < 0 || assignedTo >= game.players.length) {
    sendError(response, 400, 'Нужен исполнитель дела.')
    return
  }

  const title = String(body.title || '').trim()
  if (!title) {
    sendError(response, 400, 'Нужно название дополнительного дела.')
    return
  }

  const solo = game.mode === 'solo'
  const difficulty = solo ? String(body.difficulty || 'normal') : 'normal'
  const completedAt = Date.now()
  const reviewBy =
    game.mode === 'childQuest' && Number.isInteger(game.parentPlayerIndex)
      ? Number(game.parentPlayerIndex)
      : game.players.findIndex((_, index) => index !== assignedTo)
  const chore = {
    id: makeId(),
    title,
    minutes: Number(body.minutes || 10),
    difficulty,
    enabled: true,
    assignedTo,
    completed: true,
    completedAt,
    actualMinutes: Number(body.actualMinutes || body.minutes || 10),
    partnerRating: 0,
    extra: true,
    approved: solo,
    reviewBy: solo ? undefined : reviewBy >= 0 ? reviewBy : undefined,
  }

  game.chores = [...(game.chores || []), chore]
  game.updatedAt = new Date().toISOString()
  db.activeGames[gameId] = game
  writeDb(db)
  sendJson(response, 200, { game: hydrateActiveGame(game, db.profiles) })
}

const approveActiveExtraChore = async (gameId, request, response) => {
  const body = await readJsonBody(request)
  const db = readDb()
  const game = db.activeGames[gameId]
  if (!game) {
    sendError(response, 404, 'Активная игра не найдена.')
    return
  }

  const choreId = String(body.choreId || '')
  const difficulty = String(body.difficulty || 'normal')
  const partnerRating = Number(body.partnerRating || 0)

  game.chores = (game.chores || []).map((chore) =>
    chore.id === choreId && chore.extra
      ? { ...chore, difficulty, partnerRating, approved: true, reviewBy: undefined }
      : chore,
  )
  game.updatedAt = new Date().toISOString()
  db.activeGames[gameId] = game
  writeDb(db)
  sendJson(response, 200, { game: hydrateActiveGame(game, db.profiles) })
}

const approvePhotoChore = async (gameId, request, response) => {
  const body = await readJsonBody(request)
  const db = readDb()
  const game = db.activeGames[gameId]
  if (!game) {
    sendError(response, 404, 'Активная игра не найдена.')
    return
  }
  const choreId = String(body.choreId || '')
  game.chores = (game.chores || []).map((chore) =>
    chore.id === choreId 
      ? { ...chore, approved: true }
      : chore,
  )
  game.updatedAt = new Date().toISOString()
  db.activeGames[gameId] = game
  writeDb(db)
  sendJson(response, 200, { game: hydrateActiveGame(game, db.profiles) })
}

const finishActiveGame = async (gameId, request, response) => {
  const body = await readJsonBody(request)
  const db = readDb()
  const game = db.activeGames[gameId]
  if (!game) {
    sendError(response, 404, 'Активная игра не найдена.')
    return
  }

  const playerIndex = Number(body.playerIndex)
  if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= game.players.length) {
    sendError(response, 400, 'Нужен номер игрока.')
    return
  }

  game.finishedPlayers = [...new Set([...(game.finishedPlayers || []), playerIndex])]
  game.phase = game.mode === 'solo' || game.mode === 'childQuest' ? 'ceremony' : 'awaiting_rating'
  game.updatedAt = new Date().toISOString()
  db.activeGames[gameId] = game
  writeDb(db)
  sendJson(response, 200, { game: hydrateActiveGame(game, db.profiles) })
}

const updateActiveGamePhase = async (gameId, request, response) => {
  const body = await readJsonBody(request)
  const db = readDb()
  const game = db.activeGames[gameId]
  if (!game) {
    sendError(response, 404, 'Активная игра не найдена.')
    return
  }

  const phase = String(body.phase || '')
  if (!['play', 'rating', 'awaiting_rating', 'ceremony'].includes(phase)) {
    sendError(response, 400, 'Некорректная фаза игры.')
    return
  }

  game.phase = phase
  game.updatedAt = new Date().toISOString()
  db.activeGames[gameId] = game
  writeDb(db)
  sendJson(response, 200, { game: hydrateActiveGame(game, db.profiles) })
}

const rateActiveChore = async (gameId, request, response) => {
  const body = await readJsonBody(request)
  const db = readDb()
  const game = db.activeGames[gameId]
  if (!game) {
    sendError(response, 404, 'Активная игра не найдена.')
    return
  }

  const choreId = String(body.choreId || '')
  const reviewerIndex = Number(body.reviewerIndex)
  const partnerRating = Math.max(0, Math.min(3, Number(body.partnerRating || 0)))
  if (!Number.isInteger(reviewerIndex) || reviewerIndex < 0 || reviewerIndex >= game.players.length) {
    sendError(response, 400, 'Нужен номер оценивающего игрока.')
    return
  }

  game.chores = (game.chores || []).map((chore) => {
    if (chore.id !== choreId || !chore.completed || chore.assignedTo === reviewerIndex) return chore
    const ratings = { ...(chore.ratings || {}), [reviewerIndex]: partnerRating }
    const averageRating = Object.values(ratings).reduce((sum, rating) => sum + Number(rating || 0), 0) / Object.values(ratings).length
    return {
      ...chore,
      partnerRating: Math.round(averageRating),
      ratings,
    }
  })
  game.updatedAt = new Date().toISOString()
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
    isChild: Boolean(body.isChild ?? previous.isChild),
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

const deleteGame = async (gameId, response) => {
  const db = readDb()
  const index = db.games.findIndex((game) => game.id === gameId)
  if (index < 0) {
    sendError(response, 404, 'Игра не найдена.')
    return
  }
  db.games.splice(index, 1)
  writeDb(db)
  sendJson(response, 200, { state: buildState() })
}

const createGame = async (request, response) => {
  const body = await readJsonBody(request)
  const players = Array.isArray(body.players)
    ? body.players.map((player) => ({
        email: normalizeEmail(player.email),
        name: String(player.name || '').trim(),
        avatar: String(player.avatar || 'fox'),
        avatarUrl: String(player.avatarUrl || ''),
        isChild: Boolean(player.isChild),
      }))
    : []

  if (players.length < 1 || players.some((player) => !player.email || !player.email.includes('@'))) {
    sendError(response, 400, 'Для истории нужен хотя бы один игрок с почтой.')
    return
  }

  const scores = Array.isArray(body.scores) ? body.scores : []
  if (scores.length !== players.length) {
    sendError(response, 400, 'Нужно передать очки всех игроков.')
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
      isChild: Boolean(player.isChild ?? previous.isChild),
      createdAt: previous.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  const winnerEmail = body.winnerEmail ? normalizeEmail(body.winnerEmail) : ''
  const mode = body.mode === 'solo' ? 'solo' : body.mode === 'childQuest' ? 'childQuest' : 'duo'
  const childOutcome = body.childOutcome && typeof body.childOutcome === 'object' ? body.childOutcome : null
  const game = {
    id: makeId(),
    pairKey: getPairKey(players),
    players,
    winnerEmail,
    mode,
    prize: String(body.prize || ''),
    prizeTiers: Array.isArray(body.prizeTiers) ? body.prizeTiers : [],
    roundMinutes: Number(body.roundMinutes || 0),
    targetScore: Number(body.targetScore || 0),
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
    childOutcome:
      mode === 'childQuest' && childOutcome
        ? {
            childProfileId: String(childOutcome.childProfileId || ''),
            childEmail: normalizeEmail(childOutcome.childEmail || players[0]?.email || ''),
            coins: Number(childOutcome.coins || 0),
            targetScore: Number(childOutcome.targetScore || body.targetScore || 0),
            tier: String(childOutcome.tier || 'none'),
            prizeLabel: String(childOutcome.prizeLabel || body.prize || ''),
            starsEarned: Number(childOutcome.starsEarned || 0),
            choresCompleted: Number(childOutcome.choresCompleted || 0),
          }
        : undefined,
    finishedAt: new Date().toISOString(),
  }

  db.games.push(game)
  db.games = db.games.slice(-500)

  if (mode === 'childQuest' && childOutcome?.childProfileId) {
    applyChildOutcome(db, { ...childOutcome, chores: game.chores, prizeLabel: game.childOutcome?.prizeLabel }, game.id)
  }

  writeDb(db)
  sendJson(response, 201, { game: hydrateGame(game, db.profiles), state: buildState() })
}

const upsertChildProfile = async (request, response) => {
  const body = await readJsonBody(request)
  const parentEmail = normalizeEmail(body.parentEmail)
  if (!parentEmail || !parentEmail.includes('@')) {
    sendError(response, 400, 'Нужна почта родителя.')
    return
  }

  const db = readDb()
  const id = String(body.id || makeId())
  const previous = db.childProfiles[id] || defaultChildProfile({
    id,
    parentEmail,
    childEmail: body.childEmail || `${parentEmail.split('@')[0]}-child@${parentEmail.split('@')[1] || 'example.com'}`,
    name: body.name,
    avatar: body.avatar,
    avatarUrl: body.avatarUrl,
    ageGroup: body.ageGroup,
  })

  if (previous.parentEmail && previous.parentEmail !== parentEmail) {
    sendError(response, 403, 'Нельзя изменить чужой профиль ребёнка.')
    return
  }

  const prevXp = Number(previous.xp || 0)
  const nextXp = body.xp !== undefined ? Number(body.xp) : prevXp
  let roomProgress = body.roomProgress !== undefined
    ? normalizeRoomProgress(body.roomProgress)
    : previous.roomProgress
  if (body.xp !== undefined && body.roomProgress === undefined) {
    roomProgress = applyRoomProgressOnLevelUp(prevXp, nextXp, previous.roomProgress)
  }

  const profile = sanitizeChildProfile(
    {
      ...previous,
      ...body,
      id,
      parentEmail,
      childEmail: normalizeEmail(body.childEmail || previous.childEmail),
      name: String(body.name || previous.name || 'Ребёнок').trim(),
      avatar: String(body.avatar || previous.avatar || 'duck'),
      avatarUrl: String(body.avatarUrl || previous.avatarUrl || ''),
      starRules: body.starRules || previous.starRules,
      rewards: Array.isArray(body.rewards) ? body.rewards : previous.rewards,
      xp: nextXp,
      roomProgress,
      updatedAt: new Date().toISOString(),
    },
    previous,
  )

  db.childProfiles[id] = profile
  db.profiles[profile.childEmail] = {
    ...(db.profiles[profile.childEmail] || {}),
    email: profile.childEmail,
    name: profile.name,
    avatar: profile.avatar,
    avatarUrl: profile.avatarUrl || '',
    isChild: true,
    createdAt: db.profiles[profile.childEmail]?.createdAt || profile.createdAt,
    updatedAt: new Date().toISOString(),
  }
  writeDb(db)
  sendJson(response, 200, { profile, state: buildState() })
}

const getChildProfile = (profileId, response) => {
  const db = readDb()
  const profile = db.childProfiles[profileId]
  if (!profile) {
    sendError(response, 404, 'Профиль ребёнка не найден.')
    return
  }
  const childGames = db.games
    .filter((game) => game.mode === 'childQuest' && game.childOutcome?.childProfileId === profileId)
    .slice(-20)
    .reverse()
  sendJson(response, 200, { profile: sanitizeChildProfile(profile), games: childGames.map((game) => hydrateGame(game, db.profiles)) })
}

const patchChildProfile = async (profileId, request, response) => {
  const body = await readJsonBody(request)
  const db = readDb()
  const previous = db.childProfiles[profileId]
  if (!previous) {
    sendError(response, 404, 'Профиль ребёнка не найден.')
    return
  }

  const prevXp = Number(previous.xp || 0)
  const nextXp = body.xp !== undefined ? Number(body.xp) : prevXp
  let roomProgress = body.roomProgress !== undefined
    ? normalizeRoomProgress(body.roomProgress)
    : previous.roomProgress

  if (body.xp !== undefined && body.roomProgress === undefined) {
    roomProgress = applyRoomProgressOnLevelUp(prevXp, nextXp, previous.roomProgress)
  }

  // Child patch cannot mint free lootboxes — only openLootbox endpoint spends them.
  const profile = sanitizeChildProfile(
    {
      ...previous,
      ...body,
      id: previous.id,
      parentEmail: previous.parentEmail,
      childEmail: previous.childEmail,
      xp: nextXp,
      roomProgress,
      lootboxCharges: previous.lootboxCharges,
      updatedAt: new Date().toISOString(),
    },
    previous,
  )

  db.childProfiles[profileId] = profile
  writeDb(db)
  sendJson(response, 200, { profile, state: buildState() })
}

const openChildLootbox = async (profileId, request, response) => {
  await readJsonBody(request).catch(() => ({}))
  const db = readDb()
  const previous = db.childProfiles[profileId]
  if (!previous) {
    sendError(response, 404, 'Профиль ребёнка не найден.')
    return
  }

  const rewards = Array.isArray(previous.lootboxRewards) ? previous.lootboxRewards : []
  if (!rewards.length) {
    sendError(response, 400, 'Лутбоксы выключены родителем.')
    return
  }

  const charges = Math.max(0, Number(previous.lootboxCharges || 0))
  if (charges < 1) {
    sendError(response, 400, 'Нет лутбоксов. Заработай квестом или регулярным делом.')
    return
  }

  const pick = String(rewards[Math.floor(Math.random() * rewards.length)] || '+20xp')
  const prevXp = Number(previous.xp || 0)
  let nextXp = prevXp
  let starBalance = Number(previous.starBalance || 0)
  let note = `Лутбокс: ${pick}`

  if (/xp/i.test(pick)) {
    const amt = parseInt(pick, 10)
    nextXp += Number.isFinite(amt) && amt > 0 ? amt : 20
  } else if (/звезд/i.test(pick)) {
    const amt = parseInt(pick, 10)
    starBalance += Number.isFinite(amt) && amt > 0 ? amt : 1
  } else if (pick === 'potion') {
    note += ' (Зелье: +10% к следующей игре)'
  }

  const roomProgress = applyRoomProgressOnLevelUp(prevXp, nextXp, previous.roomProgress)
  const profile = sanitizeChildProfile(
    {
      ...previous,
      xp: nextXp,
      starBalance,
      roomProgress,
      lootboxCharges: charges - 1,
      updatedAt: new Date().toISOString(),
    },
    previous,
  )

  db.childProfiles[profileId] = profile
  writeDb(db)
  sendJson(response, 200, { profile, reward: pick, note, state: buildState() })
}

const redeemChildReward = async (profileId, request, response) => {
  const body = await readJsonBody(request)
  const rewardId = String(body.rewardId || '')
  const db = readDb()
  const profile = db.childProfiles[profileId]
  if (!profile) {
    sendError(response, 404, 'Профиль ребёнка не найден.')
    return
  }

  const reward = (profile.rewards || []).find((item) => item.id === rewardId)
  if (!reward) {
    sendError(response, 404, 'Награда не найдена.')
    return
  }
  if (reward.redeemedAt) {
    sendError(response, 400, 'Эта награда уже получена.')
    return
  }
  if (Number(profile.starBalance || 0) < Number(reward.starsRequired || 0)) {
    sendError(response, 400, 'Звёзд пока недостаточно.')
    return
  }

  profile.starBalance = Number(profile.starBalance || 0) - Number(reward.starsRequired || 0)
  profile.rewards = (profile.rewards || []).map((item) =>
    item.id === rewardId ? { ...item, redeemedAt: new Date().toISOString() } : item,
  )
  profile.ledger = [
    ...(profile.ledger || []),
    {
      id: makeId(),
      gameId: '',
      stars: -Number(reward.starsRequired || 0),
      tier: 'none',
      note: `Получена награда: ${reward.label}`,
      createdAt: new Date().toISOString(),
    },
  ]
  profile.updatedAt = new Date().toISOString()
  db.childProfiles[profileId] = sanitizeChildProfile(profile)
  writeDb(db)
  sendJson(response, 200, { profile: db.childProfiles[profileId], state: buildState() })
}

const serveFile = (response, filePath) => {
  response.setHeader('Content-Type', contentTypes[extname(filePath)] || 'application/octet-stream')
  response.setHeader('Strict-Transport-Security', 'max-age=31536000')
  response.setHeader('X-Content-Type-Options', 'nosniff')
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
  const host = String(request.headers.host || '').split(':')[0]
  const url = new URL(request.url || '/', `http://${request.headers.host}`)

  if (host === 'tidytitans.ru') {
    const target = `https://www.tidytitans.ru${url.pathname}${url.search}`
    response.writeHead(301, {
      Location: target,
      'Strict-Transport-Security': 'max-age=31536000',
    })
    response.end()
    return
  }

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
    if (activeRoute && request.method === 'DELETE' && !activeRoute.action) {
      deleteActiveGame(activeRoute.id, response)
      return
    }
    if (activeRoute && request.method === 'POST' && activeRoute.action === 'complete') {
      await completeActiveChore(activeRoute.id, request, response)
      return
    }
    if (activeRoute && request.method === 'POST' && activeRoute.action === 'add-extra') {
      await addActiveExtraChore(activeRoute.id, request, response)
      return
    }
    if (activeRoute && request.method === 'POST' && activeRoute.action === 'approve-extra') {
      await approveActiveExtraChore(activeRoute.id, request, response)
      return
    }
    if (activeRoute && request.method === 'POST' && activeRoute.action === 'approve-photo') {
      await approvePhotoChore(activeRoute.id, request, response)
      return
    }
    if (activeRoute && request.method === 'POST' && activeRoute.action === 'rate') {
      await rateActiveChore(activeRoute.id, request, response)
      return
    }
    if (activeRoute && request.method === 'POST' && activeRoute.action === 'finish') {
      await finishActiveGame(activeRoute.id, request, response)
      return
    }
    if (activeRoute && request.method === 'POST' && activeRoute.action === 'phase') {
      await updateActiveGamePhase(activeRoute.id, request, response)
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
    if (request.method === 'POST' && url.pathname === '/api/child-profiles') {
      await upsertChildProfile(request, response)
      return
    }
    const childProfileMatch = url.pathname.match(/^\/api\/child-profiles\/([^/]+)(?:\/(.+))?$/)
    if (childProfileMatch && request.method === 'GET' && !childProfileMatch[2]) {
      getChildProfile(decodeURIComponent(childProfileMatch[1]), response)
      return
    }
    if (childProfileMatch && request.method === 'POST' && !childProfileMatch[2]) {
      await patchChildProfile(decodeURIComponent(childProfileMatch[1]), request, response)
      return
    }
    if (childProfileMatch && request.method === 'POST' && childProfileMatch[2] === 'redeem') {
      await redeemChildReward(decodeURIComponent(childProfileMatch[1]), request, response)
      return
    }
    if (childProfileMatch && request.method === 'POST' && childProfileMatch[2] === 'lootbox') {
      await openChildLootbox(decodeURIComponent(childProfileMatch[1]), request, response)
      return
    }
    const savedGameMatch = url.pathname.match(/^\/api\/games\/([^/]+)$/)
    if (savedGameMatch && request.method === 'DELETE') {
      await deleteGame(decodeURIComponent(savedGameMatch[1]), response)
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
