import QRCode from 'qrcode'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Difficulty = 'easy' | 'normal' | 'hard'
type Phase = 'setup' | 'play' | 'rating' | 'ceremony'
type GameMode = 'duo' | 'solo'

type Player = {
  email: string
  name: string
  avatar: string
  avatarUrl?: string
}

type Profile = Player & {
  createdAt: string
  updatedAt: string
}

type ChoreTask = {
  id: string
  title: string
  minutes: number
  difficulty: Difficulty
  enabled: boolean
}

type ChoreGroup = {
  id: string
  title: string
  enabled: boolean
  icon?: string
  children: ChoreTask[]
}

type ChoreItem = ChoreTask | ChoreGroup

type AssignedChore = ChoreTask & {
  assignedTo: 0 | 1
  completed: boolean
  completedAt?: number
  actualMinutes?: number
  partnerRating: number
  parentId?: string
  parentTitle?: string
  extra?: boolean
  approved?: boolean
  reviewBy?: 0 | 1
}

type CompletedChore = AssignedChore & {
  completed: true
  completedAt: number
}

type PlayerScore = {
  total: number
  base: number
  speed: number
  partner: number
  streak: number
  count: number
}

type GameRecord = {
  id: string
  pairKey: string
  players: (Player & { profile?: Profile | null })[]
  winnerEmail: string
  roundMinutes: number
  elapsedSeconds: number
  scores: (PlayerScore & { email: string })[]
  chores?: AssignedChore[]
  finishedAt: string
}

type PairLeaderboard = {
  pairKey: string
  players: (Player & { profile?: Profile | null })[]
  games: number
  totalScore: number
  totalChores: number
  wins: Record<string, number>
  lastPlayedAt: string
}

type ApiState = {
  activeGames: ActiveGame[]
  profiles: Profile[]
  games: GameRecord[]
  leaderboard: PairLeaderboard[]
}

type ActiveGame = {
  id: string
  pairKey: string
  players: Player[]
  chores: AssignedChore[]
  roundMinutes: number
  mode?: GameMode
  prize?: string
  targetScore?: number
  startedAt: string
  updatedAt: string
}

type ChoreStat = {
  title: string
  total: number
  avgMinutes: number
  byPlayer: Record<string, number>
}

const avatarOptions = ['fox', 'cat', 'frog', 'robot', 'ghost', 'duck', 'wizard', 'dragon', 'ninja', 'alien', 'queen', 'slime']
const roomIconOptions = ['bath', 'kitchen', 'living', 'bedroom', 'toilet', 'hall', 'wardrobe', 'storage', 'garden', 'outside', 'dining', 'garage']

const defaultPlayers: [Player, Player] = [
  { email: 'you@example.com', name: 'Вы', avatar: 'fox' },
  { email: 'partner@example.com', name: 'Партнёр', avatar: 'cat' },
]

const task = (id: string, title: string, minutes: number, difficulty: Difficulty = 'normal'): ChoreTask => ({
  id,
  title,
  minutes,
  difficulty,
  enabled: true,
})

const defaultChores: ChoreItem[] = [
  task('dishes', 'Помыть посуду', 15),
  {
    id: 'bathroom-group',
    title: 'Ванная комната',
    enabled: true,
    icon: 'bath',
    children: [
      task('bathroom-tub', 'Помыть ванную', 25, 'hard'),
      task('bathroom-sink', 'Раковина и зеркало', 15),
      task('bathroom-bottles', 'Убрать баночки', 10, 'easy'),
    ],
  },
  task('kitchen', 'Протереть кухню', 20),
  task('vacuum', 'Пропылесосить', 25),
  task('laundry', 'Разобрать стирку', 20, 'easy'),
  task('wardrobe', 'Навести порядок в шкафу', 30, 'hard'),
  task('trash', 'Мусор и пакеты', 10, 'easy'),
  task('dust', 'Вытереть пыль', 20),
]

const emptyState: ApiState = { activeGames: [], profiles: [], games: [], leaderboard: [] }

const difficultyLabel: Record<Difficulty, string> = {
  easy: 'легко',
  normal: 'обычно',
  hard: 'сложно',
}

const difficultyBonus: Record<Difficulty, number> = {
  easy: 2,
  normal: 6,
  hard: 14,
}

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const normalizeEmail = (email: string) => email.trim().toLowerCase()
const pairPlayerEmail = (pairEmail: string, index: 0 | 1) => {
  const email = normalizeEmail(pairEmail)
  return email ? `${email}#player-${index + 1}` : ''
}
const isGroup = (item: ChoreItem): item is ChoreGroup => 'children' in item
const isCompleted = (chore: AssignedChore): chore is CompletedChore =>
  chore.completed && typeof chore.completedAt === 'number'

const shuffle = <T,>(items: T[]) => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const formatClock = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', hour: '2-digit', minute: '2-digit', month: 'short' }).format(
    new Date(value),
  )

const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'API error')
  return payload
}

const readLocalJson = <T,>(key: string, fallback: T): T => {
  try {
    const saved = window.localStorage.getItem(key)
    return saved ? (JSON.parse(saved) as T) : fallback
  } catch {
    window.localStorage.removeItem(key)
    return fallback
  }
}

const writeLocalJson = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be blocked or full on some browsers; the game still works for the current session.
  }
}

const normalizeStoredChores = (items: unknown): ChoreItem[] => {
  if (!Array.isArray(items)) return defaultChores
  return items.map((item: any) => {
    if (Array.isArray(item.children)) {
      return {
        id: String(item.id || makeId()),
        title: String(item.title || 'Категория'),
        enabled: item.enabled !== false,
        icon: String(item.icon || 'storage'),
        children: item.children.map((child: any) => ({
          id: String(child.id || makeId()),
          title: String(child.title || 'Поддело'),
          minutes: Number(child.minutes || 10),
          difficulty: (child.difficulty || 'normal') as Difficulty,
          enabled: child.enabled !== false,
        })),
      }
    }
    return {
      id: String(item.id || makeId()),
      title: String(item.title || 'Дело'),
      minutes: Number(item.minutes || 10),
      difficulty: (item.difficulty || 'normal') as Difficulty,
      enabled: item.enabled !== false,
    }
  })
}

const getAssignableTasks = (item: ChoreItem): AssignedChore[] => {
  if (!item.enabled) return []
  if (!isGroup(item)) {
    return [{ ...item, assignedTo: 0, completed: false, partnerRating: 0 }]
  }
  return item.children
    .filter((child) => child.enabled)
    .map((child) => ({
      ...child,
      assignedTo: 0,
      completed: false,
      partnerRating: 0,
      parentId: item.id,
      parentTitle: item.title,
    }))
}

const computeChoreStats = (games: GameRecord[], players: [Player, Player]): ChoreStat[] => {
  const map = new Map<string, { total: number; minutes: number; byPlayer: Record<string, number> }>()
  for (const game of games) {
    for (const chore of game.chores || []) {
      if (!chore.completed) continue
      const playerEmail = normalizeEmail(game.players[chore.assignedTo]?.email || '')
      const key = chore.title.trim().toLowerCase()
      const current = map.get(key) || { total: 0, minutes: 0, byPlayer: {} }
      current.total += 1
      current.minutes += Number(chore.actualMinutes || chore.minutes || 0)
      current.byPlayer[playerEmail] = (current.byPlayer[playerEmail] || 0) + 1
      map.set(key, current)
    }
  }

  return [...map.entries()]
    .map(([title, stat]) => ({
      title,
      total: stat.total,
      avgMinutes: stat.total ? Math.round(stat.minutes / stat.total) : 0,
      byPlayer: Object.fromEntries(players.map((player) => [normalizeEmail(player.email), stat.byPlayer[normalizeEmail(player.email)] || 0])),
    }))
    .sort((a, b) => b.total - a.total)
}

function App() {
  const mobileRoute = window.location.pathname.match(/^\/player\/([^/]+)\/([01])\/?$/)
  if (mobileRoute) {
    return <MobilePlayerPage playerIndex={Number(mobileRoute[2]) as 0 | 1} sessionId={decodeURIComponent(mobileRoute[1])} />
  }
  const gameRoute = window.location.pathname.match(/^\/game\/([^/]+)\/?$/)
  return <GameApp initialGameId={gameRoute ? decodeURIComponent(gameRoute[1]) : ''} />
}

function GameApp({ initialGameId }: { initialGameId: string }) {
  const [players, setPlayers] = useState<[Player, Player]>(() => {
    const saved = readLocalJson<unknown>('wcq-players', defaultPlayers)
    if (!Array.isArray(saved) || saved.length !== 2) return defaultPlayers
    return saved.map((player: any, index) => ({
      email: String(player?.email || defaultPlayers[index as 0 | 1].email),
      name: String(player?.name || defaultPlayers[index as 0 | 1].name),
      avatar: String(player?.avatar || defaultPlayers[index as 0 | 1].avatar),
      avatarUrl: player?.avatarUrl ? String(player.avatarUrl) : '',
    })) as [Player, Player]
  })
  const [pairEmail, setPairEmail] = useState(() => readLocalJson<string>('wcq-pair-email', ''))
  const [gameMode, setGameMode] = useState<GameMode>(() => readLocalJson<GameMode>('wcq-game-mode', 'duo'))
  const [prize, setPrize] = useState(() => readLocalJson<string>('wcq-prize', ''))
  const [targetScore, setTargetScore] = useState(() => readLocalJson<number>('wcq-target-score', 120))
  const [extraChore, setExtraChore] = useState({ assignedTo: 0 as 0 | 1, title: '', minutes: 10, difficulty: 'normal' as Difficulty, rating: 2 })
  const [extraReviews, setExtraReviews] = useState<Record<string, { difficulty: Difficulty; rating: number }>>({})
  const [chores, setChores] = useState<ChoreItem[]>(() => normalizeStoredChores(readLocalJson<unknown>('wcq-chores', null)))
  const [remoteState, setRemoteState] = useState<ApiState>(emptyState)
  const [status, setStatus] = useState('Профили и история хранятся на сервере в /data.')
  const [newChore, setNewChore] = useState({ title: '', minutes: 15, difficulty: 'normal' as Difficulty })
  const [newCategoryTitle, setNewCategoryTitle] = useState('')
  const [roundMinutes, setRoundMinutes] = useState(120)
  const [phase, setPhase] = useState<Phase>('setup')
  const [assigned, setAssigned] = useState<AssignedChore[]>([])
  const [roundStartedAt, setRoundStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [musicOn, setMusicOn] = useState(false)
  const [savedGameId, setSavedGameId] = useState('')
  const [activeGameId, setActiveGameId] = useState(() => initialGameId || readLocalJson<string>('wcq-active-game-id', ''))
  const [qrCodes, setQrCodes] = useState<[string, string]>(['', ''])
  const audioRef = useRef<AudioContext | null>(null)
  const timersRef = useRef<number[]>([])

  const loadState = useCallback(async () => {
    try {
      setRemoteState(await api<ApiState>('/api/state'))
    } catch (error) {
      setStatus(error instanceof Error ? `Сервер истории недоступен: ${error.message}` : 'Сервер истории недоступен.')
    }
  }, [])

  useEffect(() => {
    loadState()
  }, [loadState])

  useEffect(() => {
    writeLocalJson('wcq-players', players)
  }, [players])

  useEffect(() => {
    writeLocalJson('wcq-pair-email', pairEmail)
  }, [pairEmail])

  useEffect(() => {
    writeLocalJson('wcq-game-mode', gameMode)
  }, [gameMode])

  useEffect(() => {
    writeLocalJson('wcq-prize', prize)
  }, [prize])

  useEffect(() => {
    writeLocalJson('wcq-target-score', targetScore)
  }, [targetScore])

  useEffect(() => {
    writeLocalJson('wcq-active-game-id', activeGameId)
  }, [activeGameId])

  useEffect(() => {
    writeLocalJson('wcq-chores', chores)
  }, [chores])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!activeGameId) {
      setQrCodes(['', ''])
      return
    }

    const makeCodes = async () => {
      const base = window.location.origin
      const urls = [0, 1].map((playerIndex) => `${base}/player/${activeGameId}/${playerIndex}`)
      const codes = await Promise.all(urls.map((url) => QRCode.toDataURL(url, { margin: 1, width: 220 })))
      setQrCodes(codes as [string, string])
    }

    makeCodes().catch(() => setQrCodes(['', '']))
  }, [activeGameId])

  useEffect(() => {
    if (!activeGameId || phase === 'setup') return
    const sync = async () => {
      try {
        const result = await api<{ game: ActiveGame }>(`/api/active-games/${activeGameId}`)
        setAssigned(result.game.chores)
      } catch {
        // The main screen remains usable even if a phone briefly loses sync.
      }
    }
    const timer = window.setInterval(sync, 1500)
    return () => window.clearInterval(timer)
  }, [activeGameId, phase])

  const selectedTasks = useMemo(() => chores.flatMap(getAssignableTasks), [chores])
  const recommendedScore = useMemo(() => {
    const potentials = selectedTasks.map((chore) => 10 + chore.minutes + difficultyBonus[chore.difficulty]).sort((a, b) => a - b)
    const skipCount = Math.min(potentials.length, potentials.length >= 8 ? 3 : potentials.length >= 4 ? 2 : 1)
    const forgivingTotal = potentials.slice(skipCount).reduce((sum, score) => sum + score, 0)
    const categoryBonus = chores
      .filter(isGroup)
      .reduce((sum, group) => sum + (group.enabled && group.children.filter((child) => child.enabled).length >= 2 ? 12 : 0), 0)
    return Math.max(20, Math.round((forgivingTotal + categoryBonus) / 10) * 10)
  }, [chores, selectedTasks])
  const elapsedSeconds = roundStartedAt ? Math.max(0, Math.floor((now - roundStartedAt) / 1000)) : 0
  const playerPlans = useMemo(
    () => [assigned.filter((chore) => chore.assignedTo === 0), assigned.filter((chore) => chore.assignedTo === 1)] as const,
    [assigned],
  )
  const gamePlayers = useMemo(
    () => players.map((player, index) => ({ ...player, email: pairPlayerEmail(pairEmail, index as 0 | 1) })) as [Player, Player],
    [pairEmail, players],
  )
  const activePlayerIndexes = useMemo(() => (gameMode === 'solo' ? [0] : [0, 1]) as (0 | 1)[], [gameMode])
  const currentPairKey = gamePlayers.map((player) => normalizeEmail(player.email)).sort().join('|')
  const currentPairGames = remoteState.games.filter((game) => game.pairKey === currentPairKey)
  const currentPairBoard = remoteState.leaderboard.find((pair) => pair.pairKey === currentPairKey)
  const currentActiveGame = remoteState.activeGames.find((game) => game.pairKey === currentPairKey)
  const choreStats = useMemo(() => computeChoreStats(currentPairGames, gamePlayers), [currentPairGames, gamePlayers])

  const scoreFor = useCallback(
    (playerIndex: 0 | 1): PlayerScore => {
      const completed = assigned.filter(
        (chore) => chore.assignedTo === playerIndex && isCompleted(chore) && (!chore.extra || chore.approved),
      )
      const base = completed.reduce((sum, chore) => sum + 10 + chore.minutes + difficultyBonus[chore.difficulty], 0)
      const speed = completed.reduce((sum, chore) => {
        if (!chore.actualMinutes || chore.actualMinutes >= chore.minutes) return sum
        return sum + Math.max(2, Math.ceil((chore.minutes - chore.actualMinutes) / 2))
      }, 0)
      const partner = completed.reduce((sum, chore) => sum + chore.partnerRating * 5, 0)
      const streak = completed.length >= 2 ? completed.length * 4 : 0
      const categoryBonus = [...new Set(completed.map((chore) => chore.parentId).filter(Boolean))].reduce((sum, parentId) => {
        const groupTasks = assigned.filter((chore) => chore.assignedTo === playerIndex && chore.parentId === parentId)
        return groupTasks.length > 1 && groupTasks.every((chore) => chore.completed) ? sum + 12 : sum
      }, 0)
      return { total: base + speed + partner + streak + categoryBonus, base, speed, partner, streak, count: completed.length }
    },
    [assigned],
  )

  const playerScores = [scoreFor(0), scoreFor(1)] as const
  const winner =
    gameMode === 'solo'
      ? playerScores[0].total >= Math.ceil(targetScore * 0.9)
        ? 0
        : null
      : playerScores[0].total === playerScores[1].total
        ? null
        : playerScores[0].total > playerScores[1].total
          ? 0
          : 1
  const winnerEmail = winner === null ? '' : normalizeEmail(gamePlayers[winner].email)
  const allDone = assigned.length > 0 && assigned.every((chore) => chore.completed)

  const updatePlayer = (index: 0 | 1, patch: Partial<Player>) => {
    setPlayers((current) => {
      const next: [Player, Player] = [{ ...current[0] }, { ...current[1] }]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  const applyProfile = (index: 0 | 1, profile: Profile) => {
    updatePlayer(index, {
      avatar: profile.avatar,
      avatarUrl: profile.avatarUrl,
      name: profile.name,
    })
  }

  const openActiveGame = async (gameId: string) => {
    try {
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${gameId}`)
      setActiveGameId(result.game.id)
      setAssigned(result.game.chores)
      setRoundStartedAt(new Date(result.game.startedAt).getTime())
      setGameMode(result.game.mode || 'duo')
      setPrize(result.game.prize || '')
      setTargetScore(result.game.targetScore || targetScore)
      setPhase('play')
      window.history.replaceState(null, '', `/game/${result.game.id}`)
      setStatus('Активная игра загружена.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить активную игру.')
    }
  }

  useEffect(() => {
    if (initialGameId) {
      openActiveGame(initialGameId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGameId])

  const loadPairByEmail = async () => {
    if (!normalizeEmail(pairEmail).includes('@')) {
      setStatus('Введите почту и нажмите кнопку загрузки.')
      return
    }
    const state = await api<ApiState>('/api/state')
    setRemoteState(state)
    const active = state.activeGames.find((game) => game.pairKey === currentPairKey)
    setStatus(active ? 'Найдена активная игра. Можно перейти к ней ниже.' : 'Почта загружена. Активной игры пока нет.')
  }

  const saveProfile = async (index: 0 | 1) => {
    const player = { ...players[index], email: gamePlayers[index].email }
    if (!normalizeEmail(pairEmail).includes('@')) {
      setStatus('Введите общую почту пары, чтобы сохранить профиль.')
      return
    }
    try {
      const result = await api<{ profile: Profile; state: ApiState }>('/api/profiles', {
        body: JSON.stringify(player),
        method: 'POST',
      })
      applyProfile(index, result.profile)
      setRemoteState(result.state)
      setStatus(`Профиль ${result.profile.name} сохранён.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить профиль.')
    }
  }

  const uploadAvatar = async (index: 0 | 1, file: File | null) => {
    if (!file) return
    if (!normalizeEmail(pairEmail).includes('@')) {
      setStatus('Сначала укажи общую почту пары, потом загружай аватарку.')
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    try {
      const result = await api<{ profile: Profile; state: ApiState }>('/api/avatar', {
        body: JSON.stringify({ ...players[index], email: gamePlayers[index].email, dataUrl }),
        method: 'POST',
      })
      applyProfile(index, result.profile)
      setRemoteState(result.state)
      setStatus('Профиль обновлён.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить аватарку.')
    }
  }

  const addChore = () => {
    const title = newChore.title.trim()
    if (!title) return
    setChores((current) => [...current, { ...newChore, id: makeId(), title, enabled: true }])
    setNewChore({ title: '', minutes: 15, difficulty: 'normal' })
  }

  const addCategory = () => {
    const title = newCategoryTitle.trim()
    if (!title) return
    setChores((current) => [...current, { id: makeId(), title, enabled: true, icon: 'storage', children: [] }])
    setNewCategoryTitle('')
  }

  const addChild = (groupId: string) => {
    setChores((current) =>
      current.map((item) =>
        isGroup(item) && item.id === groupId
          ? { ...item, children: [...item.children, task(makeId(), '', 10, 'normal')] }
          : item,
      ),
    )
  }

  const updateItem = (id: string, patch: Partial<ChoreTask | ChoreGroup>, childId?: string) => {
    setChores((current) =>
      current.map((item) => {
        if (!childId && item.id === id) return { ...item, ...patch } as ChoreItem
        if (childId && isGroup(item) && item.id === id) {
          return {
            ...item,
            children: item.children.map((child) => (child.id === childId ? { ...child, ...patch } : child)),
          }
        }
        return item
      }),
    )
  }

  const deleteItem = (id: string, childId?: string) => {
    setChores((current) => {
      if (!childId) return current.filter((item) => item.id !== id)
      return current.map((item) =>
        isGroup(item) && item.id === id ? { ...item, children: item.children.filter((child) => child.id !== childId) } : item,
      )
    })
  }

  const startRound = async () => {
    if (!normalizeEmail(pairEmail).includes('@')) {
      setStatus('Введите общую почту пары перед стартом уборки.')
      return
    }
    if (!prize.trim()) {
      setStatus('Укажите приз или награду перед стартом уборки.')
      return
    }

    const totals = [0, 0]
    const nextAssigned: AssignedChore[] = []

    const assignTask = (chore: AssignedChore, preferred?: 0 | 1) => {
      const order: (0 | 1)[] =
        gameMode === 'solo'
          ? [0]
          : preferred !== undefined
            ? [preferred, preferred === 0 ? 1 : 0]
            : totals[0] <= totals[1]
              ? [0, 1]
              : [1, 0]
      const target = order.find((playerIndex) => totals[playerIndex] + chore.minutes <= roundMinutes)
      if (target === undefined) return false
      totals[target] += chore.minutes
      nextAssigned.push({ ...chore, assignedTo: target })
      return true
    }

    for (const item of shuffle(chores.filter((chore) => chore.enabled))) {
      const tasks = getAssignableTasks(item)
      if (!tasks.length) continue

      if (isGroup(item)) {
        const total = tasks.reduce((sum, chore) => sum + chore.minutes, 0)
        const order: (0 | 1)[] = gameMode === 'solo' ? [0] : totals[0] <= totals[1] ? [0, 1] : [1, 0]
        const wholeTarget = order.find((playerIndex) => totals[playerIndex] + total <= roundMinutes)
        if (wholeTarget !== undefined) {
          tasks.forEach((chore) => assignTask(chore, wholeTarget))
        } else {
          shuffle(tasks).forEach((chore) => assignTask(chore))
        }
        continue
      }

      assignTask(tasks[0])
    }

    if (!nextAssigned.length) {
      setStatus('Не получилось собрать раунд: выбери больше дел или увеличь лимит времени.')
      return
    }
    setSavedGameId('')
    setAssigned(nextAssigned)
    setRoundStartedAt(Date.now())
    setPhase('play')
    try {
      const result = await api<{ game: ActiveGame }>('/api/active-games', {
        body: JSON.stringify({
          chores: nextAssigned,
          mode: gameMode,
          players: gamePlayers.map((player) => ({ ...player, email: normalizeEmail(player.email) })),
          prize,
          roundMinutes,
          targetScore,
        }),
        method: 'POST',
      })
      setActiveGameId(result.game.id)
      window.history.replaceState(null, '', `/game/${result.game.id}`)
      setAssigned(result.game.chores)
      setStatus('QR-коды готовы: можно отмечать дела с телефонов.')
    } catch (error) {
      setActiveGameId('')
      setStatus(error instanceof Error ? `Игра стартовала, но QR не создался: ${error.message}` : 'Игра стартовала, но QR не создался.')
    }
  }

  const completeNextFor = useCallback(
    async (playerIndex: 0 | 1, choreId?: string) => {
      if (phase !== 'play') return
      if (activeGameId) {
        try {
          const result = await api<{ game: ActiveGame }>(`/api/active-games/${activeGameId}/complete`, {
            body: JSON.stringify({ choreId, playerIndex }),
            method: 'POST',
          })
          setAssigned(result.game.chores)
          return
        } catch {
          // Fall back to local marking so the main screen still works offline.
        }
      }
      setAssigned((current) => {
        const target = choreId
          ? current.find((chore) => chore.id === choreId && chore.assignedTo === playerIndex)
          : current.find((chore) => chore.assignedTo === playerIndex && !chore.completed)
        if (!target) return current
        if (choreId && target.completed) {
          return current.map((chore) =>
            chore.id === target.id && chore.assignedTo === target.assignedTo
              ? { ...chore, completed: false, completedAt: undefined, actualMinutes: undefined }
              : chore,
          )
        }
        const lastDoneAt =
          current
            .filter((chore) => chore.assignedTo === playerIndex)
            .filter(isCompleted)
            .sort((a, b) => b.completedAt - a.completedAt)[0]?.completedAt ?? roundStartedAt ?? Date.now()
        const completedAt = Date.now()
        const actualMinutes = Math.max(1, Math.round((completedAt - lastDoneAt) / 60000))
        return current.map((chore) =>
          chore.id === target.id && chore.assignedTo === target.assignedTo
            ? { ...chore, completed: true, completedAt, actualMinutes }
            : chore,
        )
      })
    },
    [activeGameId, phase, roundStartedAt],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'SELECT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        completeNextFor(0)
      }
      if (event.code === 'Enter') {
        event.preventDefault()
        completeNextFor(1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [completeNextFor])

  const rateChore = (id: string, playerIndex: 0 | 1, rating: number) => {
    setAssigned((current) =>
      current.map((chore) => (chore.id === id && chore.assignedTo === playerIndex ? { ...chore, partnerRating: rating } : chore)),
    )
    setSavedGameId('')
  }

  const addExtraDoneChore = async () => {
    const title = extraChore.title.trim()
    if (!title) {
      setStatus('Напиши название дополнительного дела.')
      return
    }

    const localChore: AssignedChore = {
      id: makeId(),
      title,
      minutes: extraChore.minutes,
      difficulty: gameMode === 'solo' ? extraChore.difficulty : 'normal',
      enabled: true,
      assignedTo: gameMode === 'solo' ? 0 : extraChore.assignedTo,
      completed: true,
      completedAt: Date.now(),
      actualMinutes: extraChore.minutes,
      partnerRating: gameMode === 'solo' ? extraChore.rating : 0,
      extra: true,
      approved: gameMode === 'solo',
      reviewBy: gameMode === 'solo' ? 0 : extraChore.assignedTo === 0 ? 1 : 0,
    }

    if (!activeGameId) {
      setAssigned((current) => [...current, localChore])
      setExtraChore((current) => ({ ...current, title: '' }))
      return
    }

    try {
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${activeGameId}/add-extra`, {
        body: JSON.stringify(localChore),
        method: 'POST',
      })
      setAssigned(result.game.chores)
      setExtraChore((current) => ({ ...current, title: '' }))
      setStatus(gameMode === 'solo' ? 'Дополнительное дело добавлено.' : 'Дополнительное дело ждёт подтверждения партнёра.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось добавить дополнительное дело.')
    }
  }

  const approveExtraFromMain = async (choreId: string) => {
    const review = extraReviews[choreId] || { difficulty: 'normal' as Difficulty, rating: 2 }
    if (!activeGameId) {
      setAssigned((current) =>
        current.map((chore) =>
          chore.id === choreId ? { ...chore, difficulty: review.difficulty, partnerRating: review.rating, approved: true } : chore,
        ),
      )
      return
    }
    try {
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${activeGameId}/approve-extra`, {
        body: JSON.stringify({ choreId, difficulty: review.difficulty, partnerRating: review.rating }),
        method: 'POST',
      })
      setAssigned(result.game.chores)
      setStatus('Дополнительное дело подтверждено.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось подтвердить дело.')
    }
  }

  const resetRound = () => {
    setPhase('setup')
    setAssigned([])
    setRoundStartedAt(null)
    setSavedGameId('')
    setActiveGameId('')
    window.history.replaceState(null, '', '/')
  }

  const toggleMusic = async () => {
    if (musicOn) {
      timersRef.current.forEach(window.clearTimeout)
      timersRef.current = []
      await audioRef.current?.close()
      audioRef.current = null
      setMusicOn(false)
      return
    }

    const context = new AudioContext()
    audioRef.current = context
    setMusicOn(true)

    const loop = () => {
      if (!audioRef.current) return
      const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 392]
      notes.forEach((freq, index) => {
        const start = context.currentTime + index * 0.18
        const osc = context.createOscillator()
        const gain = context.createGain()
        osc.type = 'square'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.045, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16)
        osc.connect(gain)
        gain.connect(context.destination)
        osc.start(start)
        osc.stop(start + 0.17)
      })
      timersRef.current.push(window.setTimeout(loop, 1500))
    }
    loop()
  }

  const saveGame = async () => {
    try {
      const result = await api<{ game: GameRecord; state: ApiState }>('/api/games', {
        body: JSON.stringify({
          players: gamePlayers.map((player) => ({ ...player, email: normalizeEmail(player.email) })),
          winnerEmail,
          mode: gameMode,
          prize,
          roundMinutes,
          targetScore,
          elapsedSeconds,
          scores: playerScores,
          chores: assigned,
        }),
        method: 'POST',
      })
      setRemoteState(result.state)
      setSavedGameId(result.game.id)
      setStatus('Игра сохранена в историю пары.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить игру.')
    }
  }

  return (
    <main className="game-shell">
      <header className="topbar pixel-panel">
        <div>
          <p className="eyebrow">Weekend Cleanup Quest</p>
          <h1>Уборка выходного дня</h1>
          <p className="status-line">{status}</p>
          <label className="pair-email-label">
            Введите почту, чтобы сохранить или загрузить игру
            <span className="email-load-row">
              <input
                placeholder="family@example.com"
                value={pairEmail}
                onChange={(event) => setPairEmail(event.target.value)}
              />
              <button className="pixel-button alt" type="button" onClick={loadPairByEmail}>
                Загрузить
              </button>
            </span>
          </label>
          {currentActiveGame && phase === 'setup' && (
            <button className="pixel-button resume-button" type="button" onClick={() => openActiveGame(currentActiveGame.id)}>
              Продолжить активную игру
            </button>
          )}
        </div>
        <button className="pixel-button alt" type="button" onClick={toggleMusic}>
          {musicOn ? 'Музыка: ON' : 'Музыка: OFF'}
        </button>
      </header>

      {phase === 'setup' && (
        <section className="setup-grid">
          <article className="pixel-panel profiles-panel">
            <div className="panel-title">
              <span>1</span>
              <h2>Профили игроков</h2>
            </div>
            <div className="mode-grid">
              <button className={gameMode === 'duo' ? 'pixel-button active' : 'pixel-button'} type="button" onClick={() => setGameMode('duo')}>
                Парная игра
              </button>
              <button className={gameMode === 'solo' ? 'pixel-button active' : 'pixel-button'} type="button" onClick={() => setGameMode('solo')}>
                Одиночный режим
              </button>
              {gameMode === 'solo' && (
                <label>
                  Цель по очкам
                  <input
                    min={20}
                    step={10}
                    type="number"
                    value={targetScore}
                    onChange={(event) => setTargetScore(Number(event.target.value))}
                  />
                  <small className="formula-hint">
                    Рекомендация: {recommendedScore}. Формула: сумма очков выбранных дел минус 1 сложное или 2–3 простых
                    дела, плюс бонусы за закрытие категорий.
                  </small>
                  <button className="tiny-button" type="button" onClick={() => setTargetScore(recommendedScore)}>
                    Поставить рекомендацию
                  </button>
                </label>
              )}
            </div>
            <div className="players-editor">
              {players.slice(0, gameMode === 'solo' ? 1 : 2).map((player, index) => (
                <ProfileEditor
                  index={index as 0 | 1}
                  key={index}
                  onApplyProfile={applyProfile}
                  onSaveProfile={saveProfile}
                  onUpdatePlayer={updatePlayer}
                  onUploadAvatar={uploadAvatar}
                  player={player}
                  profiles={remoteState.profiles}
                />
              ))}
            </div>
          </article>

          <aside className="pixel-panel stats-panel">
            <div className="panel-title">
              <span>★</span>
              <h2>Рейтинг прошлых игр</h2>
            </div>
            {currentPairBoard ? (
              <div className="pair-stats">
                <strong>{currentPairBoard.games} игр</strong>
                <p>
                  Общий счёт: {currentPairBoard.totalScore} · Закрыто дел: {currentPairBoard.totalChores}
                </p>
                {players.slice(0, gameMode === 'solo' ? 1 : 2).map((player, index) => (
                  <p key={index}>
                    {player.name}: побед {currentPairBoard.wins[normalizeEmail(gamePlayers[index as 0 | 1].email)] || 0}
                  </p>
                ))}
              </div>
            ) : (
              <p className="hint">У этой пары ещё нет сохранённых игр. Самое время открыть сезон.</p>
            )}
          </aside>

          <article className="pixel-panel">
            <div className="panel-title">
              <span>2</span>
              <h2>Длина игры</h2>
            </div>
            <div className="duration-buttons">
              {[60, 120, 240].map((minutes) => (
                <button
                  className={roundMinutes === minutes ? 'pixel-button active' : 'pixel-button'}
                  key={minutes}
                  type="button"
                  onClick={() => setRoundMinutes(minutes)}
                >
                  {minutes / 60}ч
                </button>
              ))}
            </div>
            <label>
              Свой лимит на каждого
              <input
                min={15}
                step={5}
                type="number"
                value={roundMinutes}
                onChange={(event) => setRoundMinutes(Number(event.target.value))}
              />
            </label>
            <p className="hint">Время нужно только для ориентира и распределения. Игра завершается только когда вы сами переходите к оценкам.</p>
          </article>

          <ChoreLibrary
            chores={chores}
            newCategoryTitle={newCategoryTitle}
            newChore={newChore}
            onAddCategory={addCategory}
            onAddChild={addChild}
            onAddChore={addChore}
            onDeleteItem={deleteItem}
            onNewCategoryTitle={setNewCategoryTitle}
            onNewChore={setNewChore}
            onUpdateItem={updateItem}
          />

          <Dashboard history={currentPairGames} leaderboard={remoteState.leaderboard} stats={choreStats} players={gamePlayers} />

          <article className="pixel-panel start-card">
            <h2>Готовы к уборке?</h2>
            <div className="start-card-body">
              <p>
                Выбрано поддел: <strong>{selectedTasks.length}</strong>. {gameMode === 'solo' ? `Цель: ${targetScore} очков.` : 'Можно распределить целую категорию, а игра сама разорвёт её, если лимит времени не даёт отдать всё одному.'}
              </p>
              <label>
                Приз / награда
                <input
                  placeholder={gameMode === 'solo' ? 'Например: купить себе вкусняшку' : 'Например: победителю массаж / ужин'}
                  value={prize}
                  onChange={(event) => setPrize(event.target.value)}
                />
              </label>
            </div>
            <button className="pixel-button start" disabled={!selectedTasks.length || !prize.trim()} type="button" onClick={startRound}>
              Сгенерировать уборку
            </button>
          </article>
        </section>
      )}

      {phase === 'play' && (
        <section className="play-screen">
          <div className="hud pixel-panel">
            <div>
              <p className="eyebrow">Время рейда</p>
              <strong>{formatClock(elapsedSeconds)}</strong>
            </div>
            <div>
              <p className="eyebrow">Горячие клавиши</p>
              <strong>Space / Enter</strong>
            </div>
            <button className="pixel-button" type="button" onClick={() => setPhase('rating')}>
              К оценкам
            </button>
          </div>

          <div className="battlefield">
            {activePlayerIndexes.map((playerIndex) => {
              const plan = playerPlans[playerIndex as 0 | 1]
              const totalMinutes = plan.reduce((sum, chore) => sum + chore.minutes, 0)
              const done = plan.filter((chore) => chore.completed).length
              return (
                <article className="pixel-panel player-board" key={playerIndex}>
                  <div className="player-card">
                    <PixelAvatar avatar={players[playerIndex as 0 | 1].avatar} avatarUrl={players[playerIndex as 0 | 1].avatarUrl} />
                    <div>
                      <h2>{players[playerIndex as 0 | 1].name || `Игрок ${playerIndex + 1}`}</h2>
                      <p>
                        {done}/{plan.length} дел · {totalMinutes} мин · текущие очки {playerScores[playerIndex as 0 | 1].total}
                      </p>
                    </div>
                  </div>
                  <button
                    className="pixel-button wide"
                    type="button"
                    onClick={() => completeNextFor(playerIndex as 0 | 1)}
                  >
                    {playerIndex === 0 ? 'Space' : 'Enter'}: отметить следующее
                  </button>
                  {qrCodes[playerIndex] && (
                    <div className="qr-card">
                      <img alt={`QR для ${players[playerIndex as 0 | 1].name}`} src={qrCodes[playerIndex]} />
                      <div>
                        <strong>Сканируй телефоном</strong>
                        <span>Откроются только дела {players[playerIndex as 0 | 1].name}</span>
                      </div>
                    </div>
                  )}
                  <div className="quest-list">
                    {plan.map((chore) => (
                      <button
                        className={chore.completed ? 'quest done' : 'quest'}
                        key={chore.id}
                        type="button"
                        onClick={() => {
                          if (!chore.completed) {
                            completeNextFor(playerIndex as 0 | 1, chore.id)
                          }
                        }}
                      >
                        <span>{chore.completed ? '✓' : '□'}</span>
                        <strong>{chore.parentTitle ? `${chore.parentTitle}: ${chore.title}` : chore.title}</strong>
                        <small>
                          {chore.minutes} мин · {difficultyLabel[chore.difficulty]}
                        </small>
                      </button>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>

          {allDone && (
            <div className="pixel-panel all-done">
              <h2>Все дела закрыты!</h2>
              <button className="pixel-button start" type="button" onClick={() => setPhase('rating')}>
                К оценкам партнёра
              </button>
            </div>
          )}
        </section>
      )}

      {phase === 'rating' && (
        <section className="results-screen">
          <article className="pixel-panel winner-card calm">
            <p className="eyebrow">Сначала оценки</p>
            <h2>{gameMode === 'solo' ? 'Добавь попутные дела и оцени себя' : 'Поставьте друг другу оценки'}</h2>
            <p>Итоги ещё скрыты. Добавьте всё, что сделали сверх плана, затем нажмите “Подвести итоги”.</p>
          </article>
          <ExtraChoreForm
            extraChore={extraChore}
            mode={gameMode}
            onAdd={addExtraDoneChore}
            onChange={setExtraChore}
            players={players}
          />
          <PendingExtraApprovals
            chores={assigned}
            onApprove={approveExtraFromMain}
            reviews={extraReviews}
            setReviews={setExtraReviews}
          />
          <ScoreCards
            assigned={assigned}
            mode={gameMode}
            playerPlans={playerPlans}
            players={players}
            playerScores={playerScores}
            onRateChore={rateChore}
          />
          <div className="actions">
            <button className="pixel-button start ceremony-button" type="button" onClick={() => setPhase('ceremony')}>
              Подвести итоги
            </button>
            <button className="pixel-button" type="button" onClick={() => setPhase('play')}>
              Вернуться к списку
            </button>
          </div>
        </section>
      )}

      {phase === 'ceremony' && (
        <section className="results-screen ceremony-screen">
          <article className="pixel-panel certificate">
            <div className="confetti" />
            <p className="eyebrow">Грамота победителя</p>
            <h2>
              {gameMode === 'solo'
                ? winner === null
                  ? 'Почти победа'
                  : 'Личная победа!'
                : winner === null
                  ? 'Суперничья уборки'
                  : `Президент уборки: ${players[winner].name}`}
            </h2>
            <p className="certificate-name">
              {gameMode === 'solo' ? players[0].name : winner === null ? `${players[0].name} + ${players[1].name}` : players[winner].name}
            </p>
            <p>
              {gameMode === 'solo'
                ? `Цель: ${targetScore} очков. Набрано: ${playerScores[0].total}. ${winner === null ? 'Чуть-чуть не хватило, но дом всё равно стал лучше.' : `Награда разблокирована: ${prize || 'выбери себе приятный приз'}.`}`
                : `За героическую битву с пылью, баночками, посудой и хаосом. Дом получает +100 к уюту, а победитель получает приз: ${prize || 'заслуженная радость'}.`}
            </p>
          </article>
          <ScoreCards
            assigned={assigned}
            mode={gameMode}
            playerPlans={playerPlans}
            players={players}
            playerScores={playerScores}
            onRateChore={rateChore}
          />
          <div className="actions">
            <button className="pixel-button start" disabled={Boolean(savedGameId)} type="button" onClick={saveGame}>
              {savedGameId ? 'Игра сохранена' : 'Сохранить в историю'}
            </button>
            <button className="pixel-button" type="button" onClick={resetRound}>
              Новый рейд
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

function ChoreLibrary({
  chores,
  newCategoryTitle,
  newChore,
  onAddCategory,
  onAddChild,
  onAddChore,
  onDeleteItem,
  onNewCategoryTitle,
  onNewChore,
  onUpdateItem,
}: {
  chores: ChoreItem[]
  newCategoryTitle: string
  newChore: { title: string; minutes: number; difficulty: Difficulty }
  onAddCategory: () => void
  onAddChild: (groupId: string) => void
  onAddChore: () => void
  onDeleteItem: (id: string, childId?: string) => void
  onNewCategoryTitle: (title: string) => void
  onNewChore: (chore: { title: string; minutes: number; difficulty: Difficulty }) => void
  onUpdateItem: (id: string, patch: Partial<ChoreTask | ChoreGroup>, childId?: string) => void
}) {
  return (
    <article className="pixel-panel chores-panel">
      <div className="panel-title">
        <span>3</span>
        <h2>Общий список дел</h2>
      </div>
      <div className="add-chore">
        <input
          placeholder="Одиночное дело"
          value={newChore.title}
          onChange={(event) => onNewChore({ ...newChore, title: event.target.value })}
        />
        <input
          aria-label="Минуты"
          min={5}
          step={5}
          type="number"
          value={newChore.minutes}
          onChange={(event) => onNewChore({ ...newChore, minutes: Number(event.target.value) })}
        />
        <select value={newChore.difficulty} onChange={(event) => onNewChore({ ...newChore, difficulty: event.target.value as Difficulty })}>
          <option value="easy">легко</option>
          <option value="normal">обычно</option>
          <option value="hard">сложно</option>
        </select>
        <button className="pixel-button" type="button" onClick={onAddChore}>
          Добавить дело
        </button>
      </div>
      <div className="add-category">
        <input
          placeholder="Категория, например: ванная комната"
          value={newCategoryTitle}
          onChange={(event) => onNewCategoryTitle(event.target.value)}
        />
        <button className="pixel-button alt" type="button" onClick={onAddCategory}>
          Добавить категорию
        </button>
      </div>
      <div className="chore-list">
        {chores.map((item) =>
          isGroup(item) ? (
            <div className="chore-group" key={item.id}>
              <div className="chore-row group-row">
                <input checked={item.enabled} type="checkbox" onChange={(event) => onUpdateItem(item.id, { enabled: event.target.checked })} />
                <span className={`room-icon ${item.icon || 'storage'}`} />
                <select value={item.icon || 'storage'} onChange={(event) => onUpdateItem(item.id, { icon: event.target.value })}>
                  {roomIconOptions.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </select>
                <input value={item.title} onChange={(event) => onUpdateItem(item.id, { title: event.target.value })} />
                <span>{item.children.reduce((sum, child) => sum + (child.enabled ? child.minutes : 0), 0)} мин</span>
                <button className="tiny-button" type="button" onClick={() => onAddChild(item.id)}>
                  + дело
                </button>
                <button className="tiny-button danger" type="button" onClick={() => onDeleteItem(item.id)}>
                  удалить
                </button>
              </div>
              {item.children.map((child) => (
                <div className="chore-row child-row" key={child.id}>
                  <input
                    checked={child.enabled}
                    type="checkbox"
                    onChange={(event) => onUpdateItem(item.id, { enabled: event.target.checked }, child.id)}
                  />
                  <input
                    placeholder="Новое дело"
                    value={child.title}
                    onChange={(event) => onUpdateItem(item.id, { title: event.target.value }, child.id)}
                  />
                  <input
                    className="mini-input"
                    min={5}
                    step={5}
                    type="number"
                    value={child.minutes}
                    onChange={(event) => onUpdateItem(item.id, { minutes: Number(event.target.value) }, child.id)}
                  />
                  <select value={child.difficulty} onChange={(event) => onUpdateItem(item.id, { difficulty: event.target.value as Difficulty }, child.id)}>
                    <option value="easy">легко</option>
                    <option value="normal">обычно</option>
                    <option value="hard">сложно</option>
                  </select>
                  <button className="tiny-button danger" type="button" onClick={() => onDeleteItem(item.id, child.id)}>
                    удалить
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="chore-row" key={item.id}>
              <input checked={item.enabled} type="checkbox" onChange={(event) => onUpdateItem(item.id, { enabled: event.target.checked })} />
              <input value={item.title} onChange={(event) => onUpdateItem(item.id, { title: event.target.value })} />
              <input
                className="mini-input"
                min={5}
                step={5}
                type="number"
                value={item.minutes}
                onChange={(event) => onUpdateItem(item.id, { minutes: Number(event.target.value) })}
              />
              <select value={item.difficulty} onChange={(event) => onUpdateItem(item.id, { difficulty: event.target.value as Difficulty })}>
                <option value="easy">легко</option>
                <option value="normal">обычно</option>
                <option value="hard">сложно</option>
              </select>
              <button className="tiny-button danger" type="button" onClick={() => onDeleteItem(item.id)}>
                удалить
              </button>
            </div>
          ),
        )}
      </div>
    </article>
  )
}

function ExtraChoreForm({
  extraChore,
  mode,
  onAdd,
  onChange,
  players,
}: {
  extraChore: { assignedTo: 0 | 1; title: string; minutes: number; difficulty: Difficulty; rating: number }
  mode: GameMode
  onAdd: () => void
  onChange: (value: { assignedTo: 0 | 1; title: string; minutes: number; difficulty: Difficulty; rating: number }) => void
  players: [Player, Player]
}) {
  return (
    <article className="pixel-panel extra-panel">
      <div className="panel-title">
        <span>+</span>
        <h2>Сделали ещё что-то?</h2>
      </div>
      <div className="extra-grid">
        {mode === 'duo' && (
          <select
            value={extraChore.assignedTo}
            onChange={(event) => onChange({ ...extraChore, assignedTo: Number(event.target.value) as 0 | 1 })}
          >
            <option value={0}>{players[0].name}</option>
            <option value={1}>{players[1].name}</option>
          </select>
        )}
        <input
          placeholder="Например: протёр пыль в прихожей"
          value={extraChore.title}
          onChange={(event) => onChange({ ...extraChore, title: event.target.value })}
        />
        <input
          min={1}
          step={1}
          type="number"
          value={extraChore.minutes}
          onChange={(event) => onChange({ ...extraChore, minutes: Number(event.target.value) })}
        />
        {mode === 'solo' && (
          <>
            <select
              value={extraChore.difficulty}
              onChange={(event) => onChange({ ...extraChore, difficulty: event.target.value as Difficulty })}
            >
              <option value="easy">легко</option>
              <option value="normal">обычно</option>
              <option value="hard">сложно</option>
            </select>
            <select value={extraChore.rating} onChange={(event) => onChange({ ...extraChore, rating: Number(event.target.value) })}>
              <option value={0}>0 баллов</option>
              <option value={1}>1 балл</option>
              <option value={2}>2 балла</option>
              <option value={3}>3 балла</option>
            </select>
          </>
        )}
        <button className="pixel-button start" type="button" onClick={onAdd}>
          Добавить сделанное
        </button>
      </div>
      {mode === 'duo' && <p className="hint">Партнёр подтвердит сложность и оценку на своей QR-странице.</p>}
    </article>
  )
}

function PendingExtraApprovals({
  chores,
  onApprove,
  reviews,
  setReviews,
}: {
  chores: AssignedChore[]
  onApprove: (choreId: string) => void
  reviews: Record<string, { difficulty: Difficulty; rating: number }>
  setReviews: (value: Record<string, { difficulty: Difficulty; rating: number }>) => void
}) {
  const pending = chores.filter((chore) => chore.extra && !chore.approved)
  if (!pending.length) return null

  return (
    <article className="pixel-panel extra-panel">
      <div className="panel-title">
        <span>!</span>
        <h2>Подтвердить попутные дела</h2>
      </div>
      <div className="review-box">
        {pending.map((chore) => {
          const review = reviews[chore.id] || { difficulty: 'normal' as Difficulty, rating: 2 }
          return (
            <div className="review-card" key={chore.id}>
              <strong>{chore.title}</strong>
              <select
                value={review.difficulty}
                onChange={(event) => setReviews({ ...reviews, [chore.id]: { ...review, difficulty: event.target.value as Difficulty } })}
              >
                <option value="easy">легко</option>
                <option value="normal">обычно</option>
                <option value="hard">сложно</option>
              </select>
              <select
                value={review.rating}
                onChange={(event) => setReviews({ ...reviews, [chore.id]: { ...review, rating: Number(event.target.value) } })}
              >
                <option value={0}>0 баллов</option>
                <option value={1}>1 балл</option>
                <option value={2}>2 балла</option>
                <option value={3}>3 балла</option>
              </select>
              <button className="pixel-button start" type="button" onClick={() => onApprove(chore.id)}>
                Принять и оценить
              </button>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function ScoreCards({
  assigned,
  mode,
  onRateChore,
  playerPlans,
  playerScores,
  players,
}: {
  assigned: AssignedChore[]
  mode: GameMode
  onRateChore: (id: string, playerIndex: 0 | 1, rating: number) => void
  playerPlans: readonly [AssignedChore[], AssignedChore[]]
  playerScores: readonly [PlayerScore, PlayerScore]
  players: [Player, Player]
}) {
  return (
    <div className="score-grid">
      {(mode === 'solo' ? [0] : [0, 1]).map((playerIndex) => (
        <article className="pixel-panel score-card" key={playerIndex}>
          <div className="player-card">
            <PixelAvatar avatar={players[playerIndex as 0 | 1].avatar} avatarUrl={players[playerIndex as 0 | 1].avatarUrl} small />
            <h2>{players[playerIndex as 0 | 1].name}</h2>
          </div>
          <strong className="big-score">{playerScores[playerIndex as 0 | 1].total}</strong>
          <p>
            Дела: {playerScores[playerIndex as 0 | 1].count} · Скорость: +{playerScores[playerIndex as 0 | 1].speed} ·
            Оценки: +{playerScores[playerIndex as 0 | 1].partner}
          </p>
          <div className="rating-list">
            {playerPlans[playerIndex as 0 | 1]
              .filter(isCompleted)
              .map((chore) => (
                <div className="rating-row" key={`${chore.id}-${chore.assignedTo}`}>
                  <span>{chore.parentTitle ? `${chore.parentTitle}: ${chore.title}` : chore.title}</span>
                  {chore.extra && !chore.approved && <em>ждёт подтверждения</em>}
                  <div>
                    {[0, 1, 2, 3].map((rating) => (
                      <button
                        className={chore.partnerRating === rating ? 'rating active' : 'rating'}
                        key={rating}
                        type="button"
                        onClick={() => onRateChore(chore.id, playerIndex as 0 | 1, rating)}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            {!assigned.some((chore) => chore.assignedTo === playerIndex && chore.completed) && <p className="hint">Нет закрытых дел для оценки.</p>}
          </div>
        </article>
      ))}
    </div>
  )
}

function ProfileEditor({
  index,
  onApplyProfile,
  onSaveProfile,
  onUpdatePlayer,
  onUploadAvatar,
  player,
  profiles,
}: {
  index: 0 | 1
  onApplyProfile: (index: 0 | 1, profile: Profile) => void
  onSaveProfile: (index: 0 | 1) => void
  onUpdatePlayer: (index: 0 | 1, patch: Partial<Player>) => void
  onUploadAvatar: (index: 0 | 1, file: File | null) => void
  player: Player
  profiles: Profile[]
}) {
  return (
    <div className="player-editor">
      <PixelAvatar avatar={player.avatar} avatarUrl={player.avatarUrl} />
      <label>
        Имя героя
        <input value={player.name} onChange={(event) => onUpdatePlayer(index, { name: event.target.value })} />
      </label>
      <label>
        Выбрать существующий профиль
        <select
          value=""
          onChange={(event) => {
            const profile = profiles.find((item) => item.email === event.target.value)
            if (profile) onApplyProfile(index, profile)
          }}
        >
          <option value="">профили на сервере</option>
          {profiles.map((profile) => (
            <option key={profile.email} value={profile.email}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      <div className="avatar-list" aria-label="Выбор аватарки">
        {avatarOptions.map((avatar) => (
          <button
            className={avatar === player.avatar && !player.avatarUrl ? 'avatar-choice active' : 'avatar-choice'}
            key={avatar}
            type="button"
            onClick={() => onUpdatePlayer(index, { avatar, avatarUrl: '' })}
          >
            <PixelAvatar avatar={avatar} small />
          </button>
        ))}
      </div>
      <label className="upload-label">
        Своя аватарка
        <input
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          type="file"
          onChange={(event) => onUploadAvatar(index, event.target.files?.[0] || null)}
        />
      </label>
      <button className="pixel-button wide" type="button" onClick={() => onSaveProfile(index)}>
        Сохранить профиль
      </button>
    </div>
  )
}

function Dashboard({
  history,
  leaderboard,
  players,
  stats,
}: {
  history: GameRecord[]
  leaderboard: PairLeaderboard[]
  players: [Player, Player]
  stats: ChoreStat[]
}) {
  return (
    <article className="pixel-panel dashboard-panel">
      <div className="panel-title">
        <span>4</span>
        <h2>История, дела и лидерборд</h2>
      </div>
      <div className="dashboard-grid three">
        <section>
          <h3>История текущей пары</h3>
          <div className="history-list">
            {history.slice(0, 8).map((game) => (
              <div className="history-row" key={game.id}>
                <strong>{game.winnerEmail ? `Победа: ${game.players.find((player) => player.email === game.winnerEmail)?.name}` : 'Ничья'}</strong>
                <span>
                  {formatDate(game.finishedAt)} · {game.scores.map((score) => score.total).join(' : ')}
                </span>
              </div>
            ))}
            {!history.length && <p className="hint">Сохранённых игр этой пары пока нет.</p>}
          </div>
        </section>
        <section>
          <h3>Кто что делает чаще</h3>
          <div className="history-list">
            {stats.slice(0, 8).map((stat) => (
              <div className="history-row" key={stat.title}>
                <strong>{stat.title}</strong>
                <span>
                  {players[0].name}: {stat.byPlayer[normalizeEmail(players[0].email)] || 0} · {players[1].name}:{' '}
                  {stat.byPlayer[normalizeEmail(players[1].email)] || 0} · среднее {stat.avgMinutes} мин
                </span>
              </div>
            ))}
            {!stats.length && <p className="hint">Статистика дел появится после сохранённых игр.</p>}
          </div>
        </section>
        <section>
          <h3>Лидерборд пар</h3>
          <div className="history-list">
            {leaderboard.slice(0, 8).map((pair, index) => (
              <div className="history-row" key={pair.pairKey}>
                <strong>
                  #{index + 1} {pair.players.map((player) => player.name).join(' + ')}
                </strong>
                <span>
                  {pair.games} игр · {pair.totalScore} очков · {pair.totalChores} дел
                </span>
              </div>
            ))}
            {!leaderboard.length && <p className="hint">Лидерборд появится после первой сохранённой игры.</p>}
          </div>
        </section>
      </div>
    </article>
  )
}

function PixelAvatar({ avatar, avatarUrl, small = false }: { avatar: string; avatarUrl?: string; small?: boolean }) {
  if (avatarUrl) {
    return (
      <div className={small ? 'custom-avatar small' : 'custom-avatar'} aria-hidden="true">
        <img alt="" src={avatarUrl} />
      </div>
    )
  }

  return (
    <div className={small ? `pixel-avatar ${avatar} small` : `pixel-avatar ${avatar}`} aria-hidden="true">
      <span className="ear left" />
      <span className="ear right" />
      <span className="horn left" />
      <span className="horn right" />
      <span className="eye left" />
      <span className="eye right" />
      <span className="snout" />
      <span className="mouth" />
      <span className="badge" />
      <span className="spark" />
    </div>
  )
}

function MobilePlayerPage({ playerIndex, sessionId }: { playerIndex: 0 | 1; sessionId: string }) {
  const [game, setGame] = useState<ActiveGame | null>(null)
  const [status, setStatus] = useState('Загружаю игру...')
  const [reviews, setReviews] = useState<Record<string, { difficulty: Difficulty; rating: number }>>({})
  const [mobileExtra, setMobileExtra] = useState({ title: '', difficulty: 'normal' as Difficulty, rating: 2 })

  const loadGame = useCallback(async () => {
    try {
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${sessionId}`)
      setGame(result.game)
      setStatus('Синхронизация включена')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить игру')
    }
  }, [sessionId])

  useEffect(() => {
    loadGame()
    const timer = window.setInterval(loadGame, 1500)
    return () => window.clearInterval(timer)
  }, [loadGame])

  const complete = async (choreId?: string) => {
    try {
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${sessionId}/complete`, {
        body: JSON.stringify({ choreId, playerIndex }),
        method: 'POST',
      })
      setGame(result.game)
      setStatus('Готово, общий экран обновился')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось отметить дело')
    }
  }

  const approveExtra = async (choreId: string) => {
    const review = reviews[choreId] || { difficulty: 'normal' as Difficulty, rating: 2 }
    try {
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${sessionId}/approve-extra`, {
        body: JSON.stringify({ choreId, difficulty: review.difficulty, partnerRating: review.rating }),
        method: 'POST',
      })
      setGame(result.game)
      setStatus('Дополнительное дело подтверждено')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось подтвердить дело')
    }
  }

  const addMobileExtra = async () => {
    const title = mobileExtra.title.trim()
    if (!title) {
      setStatus('Напиши название дополнительного дела')
      return
    }
    try {
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${sessionId}/add-extra`, {
        body: JSON.stringify({
          assignedTo: playerIndex,
          difficulty: mobileExtra.difficulty,
          minutes: 10,
          partnerRating: mobileExtra.rating,
          title,
        }),
        method: 'POST',
      })
      setGame(result.game)
      setMobileExtra({ title: '', difficulty: 'normal', rating: 2 })
      setStatus(result.game.mode === 'solo' ? 'Дополнительное дело добавлено' : 'Дело отправлено партнёру на подтверждение')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось добавить дело')
    }
  }

  if (!game) {
    return (
      <main className="mobile-shell">
        <section className="pixel-panel mobile-panel">
          <p className="eyebrow">Weekend Cleanup Quest</p>
          <h1>Мои дела</h1>
          <p>{status}</p>
        </section>
      </main>
    )
  }

  const player = game.players[playerIndex]
  const chores = game.chores.filter((chore) => chore.assignedTo === playerIndex)
  const reviewChores = game.chores.filter((chore) => chore.extra && !chore.approved && chore.reviewBy === playerIndex)
  const done = chores.filter((chore) => chore.completed).length
  const next = chores.find((chore) => !chore.completed)

  return (
    <main className="mobile-shell">
      <section className="pixel-panel mobile-panel">
        <div className="player-card">
          <PixelAvatar avatar={player.avatar} avatarUrl={player.avatarUrl} />
          <div>
            <p className="eyebrow">Моя уборка</p>
            <h1>{player.name}</h1>
            <p>
              {done}/{chores.length} дел · {status}
            </p>
          </div>
        </div>

        <div className="quest-list mobile-quests">
          {chores.map((chore) => (
            <button
              className={chore.completed ? 'quest done' : 'quest'}
              key={`${chore.id}-${chore.assignedTo}`}
              type="button"
              onClick={() => complete(chore.id)}
            >
              <span>{chore.completed ? '✓' : '□'}</span>
              <strong>{chore.parentTitle ? `${chore.parentTitle}: ${chore.title}` : chore.title}</strong>
              <small>
                {chore.minutes} мин · {difficultyLabel[chore.difficulty]}
              </small>
            </button>
          ))}
        </div>

        {reviewChores.length > 0 && (
          <div className="review-box review-popup">
            <h2>Партнёр добавил дело</h2>
            {reviewChores.map((chore) => {
              const review = reviews[chore.id] || { difficulty: 'normal' as Difficulty, rating: 2 }
              return (
                <div className="review-card" key={chore.id}>
                  <strong>{chore.title}</strong>
                  <select
                    value={review.difficulty}
                    onChange={(event) =>
                      setReviews((current) => ({
                        ...current,
                        [chore.id]: { ...review, difficulty: event.target.value as Difficulty },
                      }))
                    }
                  >
                    <option value="easy">легко</option>
                    <option value="normal">обычно</option>
                    <option value="hard">сложно</option>
                  </select>
                  <select
                    value={review.rating}
                    onChange={(event) =>
                      setReviews((current) => ({
                        ...current,
                        [chore.id]: { ...review, rating: Number(event.target.value) },
                      }))
                    }
                  >
                    <option value={0}>0 баллов</option>
                    <option value={1}>1 балл</option>
                    <option value={2}>2 балла</option>
                    <option value={3}>3 балла</option>
                  </select>
                  <button className="pixel-button start wide" type="button" onClick={() => approveExtra(chore.id)}>
                    Подтвердить
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="mobile-extra-form">
          <h2>Добавить дело</h2>
          <input
            placeholder="Что ещё сделал?"
            value={mobileExtra.title}
            onChange={(event) => setMobileExtra((current) => ({ ...current, title: event.target.value }))}
          />
          {game.mode === 'solo' && (
            <div className="mobile-extra-controls">
              <select
                value={mobileExtra.difficulty}
                onChange={(event) => setMobileExtra((current) => ({ ...current, difficulty: event.target.value as Difficulty }))}
              >
                <option value="easy">легко</option>
                <option value="normal">обычно</option>
                <option value="hard">сложно</option>
              </select>
              <select
                value={mobileExtra.rating}
                onChange={(event) => setMobileExtra((current) => ({ ...current, rating: Number(event.target.value) }))}
              >
                <option value={0}>0 баллов</option>
                <option value={1}>1 балл</option>
                <option value={2}>2 балла</option>
                <option value={3}>3 балла</option>
              </select>
            </div>
          )}
          <button className="pixel-button alt wide" type="button" onClick={addMobileExtra}>
            Добавить дело
          </button>
        </div>

        <button className="pixel-button start mobile-done" disabled={!next} type="button" onClick={() => complete()}>
          Сделано!
        </button>
      </section>
    </main>
  )
}

export default App
