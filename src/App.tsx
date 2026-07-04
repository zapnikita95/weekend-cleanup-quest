import QRCode from 'qrcode'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Difficulty = 'easy' | 'normal' | 'hard'
type Phase = 'setup' | 'play' | 'rating' | 'ceremony'
type ServerPhase = 'play' | 'rating' | 'awaiting_rating' | 'ceremony'
type GameMode = 'duo' | 'solo' | 'childQuest'
type TierId = 'gold' | 'silver' | 'bronze' | 'none'

type Player = {
  email: string
  name: string
  avatar: string
  avatarUrl?: string
  isChild?: boolean
}

type PrizeTier = {
  id: Exclude<TierId, 'none'>
  label: string
  minPercent: number
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
  section?: string
}

type ChoreGroup = {
  id: string
  title: string
  enabled: boolean
  icon?: string
  section?: string
  children: ChoreTask[]
}

type ChoreItem = ChoreTask | ChoreGroup

type AssignedChore = ChoreTask & {
  assignedTo: number
  completed: boolean
  completedAt?: number
  actualMinutes?: number
  partnerRating: number
  ratings?: Record<string, number>
  parentId?: string
  parentTitle?: string
  extra?: boolean
  approved?: boolean
  reviewBy?: number
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
  mode?: GameMode
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
  mode: GameMode
  players: (Player & { profile?: Profile | null })[]
  games: number
  totalScore: number
  totalChores: number
  wins: Record<string, number>
  lastPlayedAt: string
}

type ModeLeaderboards = {
  solo: PairLeaderboard[]
  duo: PairLeaderboard[]
  childQuest: PairLeaderboard[]
}

type ApiState = {
  activeGames: ActiveGame[]
  profiles: Profile[]
  games: GameRecord[]
  leaderboard: ModeLeaderboards
}

type ActiveGame = {
  id: string
  pairKey: string
  players: Player[]
  chores: AssignedChore[]
  roundMinutes: number
  mode?: GameMode
  prize?: string
  prizeTiers?: PrizeTier[]
  targetScore?: number
  childPlayerIndex?: number
  parentPlayerIndex?: number
  requirePhotoProof?: boolean
  phase?: ServerPhase
  finishedPlayers?: number[]
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
const spriteAvatarSet = new Set(avatarOptions)
const roomIconOptions = ['bath', 'kitchen', 'living', 'bedroom', 'toilet', 'hall', 'wardrobe', 'storage', 'garden', 'outside', 'dining', 'garage']
const roomIconLabels: Record<string, string> = {
  bath: 'Ванная',
  kitchen: 'Кухня',
  living: 'Гостиная',
  bedroom: 'Спальня',
  toilet: 'Туалет',
  hall: 'Прихожая',
  wardrobe: 'Гардероб',
  storage: 'Кладовка',
  garden: 'Сад / двор',
  outside: 'На улице',
  dining: 'Столовая',
  garage: 'Гараж',
}
const defaultSections = ['Дела по дому', 'Уход за собой']
const PUBLIC_SITE = 'https://www.tidytitans.ru'

const defaultPrizeTiers: PrizeTier[] = [
  { id: 'gold', label: '', minPercent: 100 },
  { id: 'silver', label: '', minPercent: 85 },
  { id: 'bronze', label: '', minPercent: 75 },
]

const tierLabels: Record<Exclude<TierId, 'none'>, string> = {
  gold: 'Золото',
  silver: 'Серебро',
  bronze: 'Бронза',
}

const getShareOrigin = () => {
  if (typeof window === 'undefined') return PUBLIC_SITE
  const { hostname, origin } = window.location
  if (hostname === 'tidytitans.ru' || hostname === 'www.tidytitans.ru') return PUBLIC_SITE
  return origin
}

const choreBasePoints = (chore: { minutes: number; difficulty: Difficulty }) =>
  10 + chore.minutes + difficultyBonus[chore.difficulty]

const getTierFromScore = (coins: number, target: number): TierId => {
  if (target <= 0) return 'none'
  const pct = (coins / target) * 100
  if (pct >= 100) return 'gold'
  if (pct >= 85) return 'silver'
  if (pct >= 75) return 'bronze'
  return 'none'
}

const getNextTierInfo = (coins: number, target: number) => {
  const current = getTierFromScore(coins, target)
  if (current === 'gold') return { current, next: null as TierId | null, remaining: 0 }
  if (current === 'silver') return { current, next: 'gold' as TierId, remaining: Math.max(0, Math.ceil(target - coins)) }
  if (current === 'bronze') return { current, next: 'silver' as TierId, remaining: Math.max(0, Math.ceil(target * 0.85 - coins)) }
  return { current, next: 'bronze' as TierId, remaining: Math.max(0, Math.ceil(target * 0.75 - coins)) }
}

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}

const defaultPlayersByMode: Record<GameMode, Player[]> = {
  duo: [
    { email: 'player-1@example.com', name: 'Игрок 1', avatar: 'fox' },
    { email: 'player-2@example.com', name: 'Игрок 2', avatar: 'cat' },
  ],
  solo: [{ email: 'player@example.com', name: 'Игрок', avatar: 'fox' }],
  childQuest: [{ email: 'child@example.com', name: 'Ребёнок', avatar: 'duck', isChild: true }],
}

const playersStorageKey = (mode: GameMode) => `wcq-players-${mode}`

const readPlayersForMode = (mode: GameMode): Player[] => {
  const defaults = defaultPlayersByMode[mode]
  const saved = readLocalJson<unknown>(playersStorageKey(mode), null)
  if (!Array.isArray(saved) || saved.length < 1) return defaults.map((player) => ({ ...player }))
  const limit = mode === 'childQuest' || mode === 'solo' ? 1 : saved.length
  return saved.slice(0, limit).map((player: any, index) => ({
    email: String(player?.email || defaults[index]?.email || `player-${index + 1}@example.com`),
    name: String(player?.name || defaults[index]?.name || `Игрок ${index + 1}`),
    avatar: String(player?.avatar || defaults[index]?.avatar || avatarOptions[index % avatarOptions.length]),
    avatarUrl: player?.avatarUrl ? String(player.avatarUrl) : '',
    isChild: mode === 'childQuest' ? true : Boolean(player?.isChild),
  }))
}

const emptyLeaderboards = (): ModeLeaderboards => ({
  solo: [],
  duo: [],
  childQuest: [],
})

const normalizeApiState = (state: ApiState): ApiState => {
  if (Array.isArray((state as ApiState & { leaderboard?: unknown }).leaderboard)) {
    const legacy = (state as ApiState & { leaderboard: PairLeaderboard[] }).leaderboard
    return {
      ...state,
      leaderboard: {
        solo: legacy.filter((entry) => entry.mode === 'solo'),
        duo: legacy.filter((entry) => !entry.mode || entry.mode === 'duo'),
        childQuest: legacy.filter((entry) => entry.mode === 'childQuest'),
      },
    }
  }
  return {
    ...state,
    leaderboard: state.leaderboard || emptyLeaderboards(),
  }
}

const emptyState: ApiState = { activeGames: [], profiles: [], games: [], leaderboard: emptyLeaderboards() }

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
const pairPlayerEmail = (pairEmail: string, index: number) => {
  const email = normalizeEmail(pairEmail)
  return email ? `${email}#player-${index + 1}` : ''
}
const isGroup = (item: ChoreItem): item is ChoreGroup => 'children' in item
const isCompleted = (chore: AssignedChore): chore is CompletedChore =>
  chore.completed && typeof chore.completedAt === 'number'

const computePlayerScore = (assigned: AssignedChore[], playerIndex: number): PlayerScore => {
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
}

const serverPhaseToLocal = (serverPhase?: ServerPhase): Phase => {
  if (serverPhase === 'ceremony') return 'ceremony'
  if (serverPhase === 'awaiting_rating' || serverPhase === 'rating') return 'rating'
  return 'play'
}

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
        section: String(item.section || defaultSections[0]),
        children: item.children.map((child: any) => ({
          id: String(child.id || makeId()),
          title: String(child.title || 'Поддело'),
          minutes: Number(child.minutes || 10),
          difficulty: (child.difficulty || 'normal') as Difficulty,
          enabled: child.enabled !== false,
          section: String(child.section || item.section || defaultSections[0]),
        })),
      }
    }
    return {
      id: String(item.id || makeId()),
      title: String(item.title || 'Дело'),
      minutes: Number(item.minutes || 10),
      difficulty: (item.difficulty || 'normal') as Difficulty,
      enabled: item.enabled !== false,
      section: String(item.section || defaultSections[0]),
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

const computeChoreStats = (games: GameRecord[], players: Player[]): ChoreStat[] => {
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
  const mobileRoute = window.location.pathname.match(/^\/player\/([^/]+)\/(\d+)\/?$/)
  if (mobileRoute) {
    return <MobilePlayerPage playerIndex={Number(mobileRoute[2])} sessionId={decodeURIComponent(mobileRoute[1])} />
  }
  const gameRoute = window.location.pathname.match(/^\/game\/([^/]+)\/?$/)
  return <GameApp initialGameId={gameRoute ? decodeURIComponent(gameRoute[1]) : ''} />
}

function GameApp({ initialGameId }: { initialGameId: string }) {
  const [gameMode, setGameMode] = useState<GameMode>(() => readLocalJson<GameMode>('wcq-game-mode', 'duo'))
  const [players, setPlayers] = useState<Player[]>(() => readPlayersForMode(readLocalJson<GameMode>('wcq-game-mode', 'duo')))
  const [pairEmail, setPairEmail] = useState(() => readLocalJson<string>('wcq-pair-email', ''))
  const [showOnboarding, setShowOnboarding] = useState(() => !readLocalJson<boolean>('wcq-onboarding-dismissed', false))
  const [startHints, setStartHints] = useState<string[]>([])
  const [prize, setPrize] = useState(() => readLocalJson<string>('wcq-prize', ''))
  const [prizeTiers, setPrizeTiers] = useState<PrizeTier[]>(() => {
    const saved = readLocalJson<unknown>('wcq-prize-tiers', null)
    if (!Array.isArray(saved)) return defaultPrizeTiers
    return defaultPrizeTiers.map((tier, index) => ({
      ...tier,
      label: String((saved[index] as PrizeTier | undefined)?.label || ''),
    }))
  })
  const [requirePhotoProof, setRequirePhotoProof] = useState(() => readLocalJson<boolean>('wcq-require-photo', false))
  const [targetScore, setTargetScore] = useState(() => readLocalJson<number>('wcq-target-score', 120))
  const [extraChore, setExtraChore] = useState({ assignedTo: 0, title: '', minutes: 10, difficulty: 'normal' as Difficulty, rating: 2 })
  const [extraReviews, setExtraReviews] = useState<Record<string, { difficulty: Difficulty; rating: number }>>({})
  const [chores, setChores] = useState<ChoreItem[]>(() => normalizeStoredChores(readLocalJson<unknown>('wcq-chores', null)))
  const [sections, setSections] = useState<string[]>(() => {
    const saved = readLocalJson<unknown>('wcq-sections', defaultSections)
    const valid = Array.isArray(saved) ? saved.map(String).filter(Boolean) : defaultSections
    return valid.length ? valid : defaultSections
  })
  const [currentSection, setCurrentSection] = useState(() => readLocalJson<string>('wcq-current-section', defaultSections[0]))
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [remoteState, setRemoteState] = useState<ApiState>(emptyState)
  const [status, setStatus] = useState('')
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
  const [setupView, setSetupView] = useState<'home' | 'stats'>(() =>
    window.location.pathname.match(/^\/stats\/?$/) ? 'stats' : 'home',
  )
  const [qrCodes, setQrCodes] = useState<string[]>([])
  const [playerLinks, setPlayerLinks] = useState<string[]>([])
  const [awaitingReview, setAwaitingReview] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)
  const timersRef = useRef<number[]>([])
  const childPlayerIndex = gameMode === 'childQuest' ? 0 : players.findIndex((player) => player.isChild)
  const parentPlayerIndex = gameMode === 'childQuest' ? -1 : players.findIndex((player) => !player.isChild)
  const activePlayerIndexes = useMemo(() => {
    if (gameMode === 'solo' || gameMode === 'childQuest') return [0]
    return players.map((_, index) => index)
  }, [gameMode, players])

  const loadState = useCallback(async () => {
    try {
      setRemoteState(normalizeApiState(await api<ApiState>('/api/state')))
    } catch (error) {
      setStatus(error instanceof Error ? `Сервер истории недоступен: ${error.message}` : 'Сервер истории недоступен.')
    }
  }, [])

  useEffect(() => {
    const onPopState = () => {
      setSetupView(window.location.pathname.match(/^\/stats\/?$/) ? 'stats' : 'home')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const goToStats = useCallback(() => {
    window.history.pushState(null, '', '/stats')
    setSetupView('stats')
  }, [])

  const goToSetupHome = useCallback(() => {
    window.history.pushState(null, '', '/')
    setSetupView('home')
  }, [])

  useEffect(() => {
    loadState()
  }, [loadState])

  useEffect(() => {
    writeLocalJson(playersStorageKey(gameMode), players)
  }, [players, gameMode])

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
    writeLocalJson('wcq-prize-tiers', prizeTiers)
  }, [prizeTiers])

  useEffect(() => {
    writeLocalJson('wcq-require-photo', requirePhotoProof)
  }, [requirePhotoProof])

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
    writeLocalJson('wcq-sections', sections)
  }, [sections])

  useEffect(() => {
    writeLocalJson('wcq-current-section', currentSection)
  }, [currentSection])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!activeGameId) {
      setQrCodes([])
      return
    }

    const makeCodes = async () => {
      const base = getShareOrigin()
      const urls = activePlayerIndexes.map((playerIndex) => `${base}/player/${activeGameId}/${playerIndex}`)
      setPlayerLinks(urls)
      const codes = await Promise.all(urls.map((url) => QRCode.toDataURL(url, { margin: 1, width: 220 })))
      setQrCodes(codes)
    }

    makeCodes().catch(() => {
      setQrCodes([])
      setPlayerLinks([])
    })
  }, [activeGameId, activePlayerIndexes])

  useEffect(() => {
    if (!activeGameId || phase === 'setup') return
    const sync = async () => {
      try {
        const result = await api<{ game: ActiveGame }>(`/api/active-games/${activeGameId}`)
        setAssigned(result.game.chores)
        const serverPhase = result.game.phase
        if (serverPhase === 'ceremony') {
          setPhase('ceremony')
          setAwaitingReview(false)
        } else if (serverPhase === 'awaiting_rating') {
          setAwaitingReview(true)
          if (phase === 'play') setPhase('rating')
        } else if (serverPhase === 'rating' && phase === 'play') {
          setPhase('rating')
        }
      } catch {
        // The main screen remains usable even if a phone briefly loses sync.
      }
    }
    const timer = window.setInterval(sync, 1500)
    return () => window.clearInterval(timer)
  }, [activeGameId, phase])

  const sectionChores = useMemo(() => chores.filter((chore) => (chore.section || defaultSections[0]) === currentSection), [chores, currentSection])
  const selectedTasks = useMemo(() => sectionChores.flatMap(getAssignableTasks), [sectionChores])
  const recommendedScore = useMemo(() => {
    const potentials = selectedTasks.map((chore) => 10 + chore.minutes + difficultyBonus[chore.difficulty]).sort((a, b) => a - b)
    const skipCount = Math.min(potentials.length, potentials.length >= 8 ? 3 : potentials.length >= 4 ? 2 : 1)
    const forgivingTotal = potentials.slice(skipCount).reduce((sum, score) => sum + score, 0)
    const categoryBonus = chores
      .filter((chore): chore is ChoreGroup => isGroup(chore) && (chore.section || defaultSections[0]) === currentSection)
      .reduce((sum, group) => sum + (group.enabled && group.children.filter((child) => child.enabled).length >= 2 ? 12 : 0), 0)
    return Math.max(20, Math.round((forgivingTotal + categoryBonus) / 10) * 10)
  }, [chores, currentSection, selectedTasks])
  const elapsedSeconds = roundStartedAt ? Math.max(0, Math.floor((now - roundStartedAt) / 1000)) : 0
  const playerPlans = useMemo(() => players.map((_, index) => assigned.filter((chore) => chore.assignedTo === index)), [assigned, players])
  const gamePlayers = useMemo(
    () => players.map((player, index) => ({ ...player, email: pairPlayerEmail(pairEmail, index) })),
    [pairEmail, players],
  )
  const currentPairKey = gamePlayers.map((player) => normalizeEmail(player.email)).sort().join('|')
  const currentPairAllGames = remoteState.games.filter((game) => game.pairKey === currentPairKey)
  const currentPairBoard = remoteState.leaderboard[gameMode].find((entry) => entry.pairKey === currentPairKey)
  const currentActiveGame = remoteState.activeGames.find((game) => game.pairKey === currentPairKey)

  const scoreFor = useCallback((playerIndex: number): PlayerScore => computePlayerScore(assigned, playerIndex), [assigned])

  const playerScores = players.map((_, index) => scoreFor(index))
  const childCoins = useMemo(() => {
    if (gameMode !== 'childQuest' || childPlayerIndex < 0) return 0
    return assigned
      .filter((chore) => chore.assignedTo === childPlayerIndex && isCompleted(chore))
      .reduce((sum, chore) => sum + choreBasePoints(chore), 0)
  }, [assigned, childPlayerIndex, gameMode])
  const childTier = gameMode === 'childQuest' ? getTierFromScore(childCoins, targetScore) : 'none'
  const rankedPlayers = activePlayerIndexes.slice().sort((a, b) => playerScores[b].total - playerScores[a].total)
  const winner =
    gameMode === 'childQuest'
      ? childTier === 'none'
        ? null
        : childPlayerIndex
      : gameMode === 'solo'
      ? playerScores[0].total >= Math.ceil(targetScore * 0.9)
        ? 0
        : null
      : rankedPlayers.length && playerScores[rankedPlayers[0]].total !== playerScores[rankedPlayers[1]]?.total
        ? rankedPlayers[0]
        : null
  const winnerEmail = winner === null ? '' : normalizeEmail(gamePlayers[winner]?.email || '')
  const allDone = assigned.length > 0 && assigned.every((chore) => chore.completed)

  const updatePlayer = (index: number, patch: Partial<Player>) => {
    setPlayers((current) => {
      const next = current.map((player) => ({ ...player }))
      next[index] = { ...next[index], ...patch }
      if (patch.isChild) {
        next.forEach((player, itemIndex) => {
          if (itemIndex !== index) player.isChild = false
        })
      }
      return next
    })
  }

  const addPlayer = () => {
    setPlayers((current) => [
      ...current,
      {
        email: `player-${current.length + 1}@example.com`,
        name: `Игрок ${current.length + 1}`,
        avatar: avatarOptions[current.length % avatarOptions.length],
      },
    ])
  }

  const removePlayer = (index: number) => {
    if (players.length <= 1) return
    setPlayers((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const applyProfile = (index: number, profile: Profile) => {
    updatePlayer(index, {
      avatar: profile.avatar,
      avatarUrl: profile.avatarUrl,
      name: profile.name,
      isChild: profile.isChild,
    })
  }

  const copyPlayerLink = async (playerIndex: number) => {
    const url = playerLinks[playerIndex] || `${getShareOrigin()}/player/${activeGameId}/${playerIndex}`
    try {
      await copyText(url)
      setStatus('Ссылка скопирована — отправь её ребёнку в мессенджер.')
    } catch {
      setStatus(`Не удалось скопировать. Ссылка: ${url}`)
    }
  }

  const openActiveGame = async (gameId: string) => {
    try {
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${gameId}`)
      setActiveGameId(result.game.id)
      setAssigned(result.game.chores)
      setPlayers(result.game.players.length ? result.game.players : readPlayersForMode(result.game.mode || 'duo'))
      setRoundStartedAt(new Date(result.game.startedAt).getTime())
      setGameMode(result.game.mode || 'duo')
      setPrize(result.game.prize || '')
      setPrizeTiers(result.game.prizeTiers || defaultPrizeTiers)
      setRequirePhotoProof(Boolean(result.game.requirePhotoProof))
      setTargetScore(result.game.targetScore || targetScore)
      setPhase(serverPhaseToLocal(result.game.phase))
      setAwaitingReview(result.game.phase === 'awaiting_rating')
      window.history.replaceState(null, '', `/game/${result.game.id}`)
      setStatus('Активная игра загружена.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить активную игру.')
    }
  }

  const advancePhase = async (nextPhase: Phase) => {
    setPhase(nextPhase)
    if (!activeGameId) return
    const serverPhase: ServerPhase =
      nextPhase === 'ceremony' ? 'ceremony' : nextPhase === 'rating' ? 'rating' : 'play'
    try {
      await api<{ game: ActiveGame }>(`/api/active-games/${activeGameId}/phase`, {
        body: JSON.stringify({ phase: serverPhase }),
        method: 'POST',
      })
      if (serverPhase === 'ceremony') setAwaitingReview(false)
    } catch {
      // Local phase still works if the server is briefly unavailable.
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

  const saveProfile = async (index: number) => {
    const player = { ...players[index], email: gamePlayers[index].email, isChild: players[index].isChild }
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
      setRemoteState(normalizeApiState(result.state))
      setStatus(`Профиль ${result.profile.name} сохранён.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить профиль.')
    }
  }

  const uploadAvatar = async (index: number, file: File | null) => {
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
      setRemoteState(normalizeApiState(result.state))
      setStatus('Профиль обновлён.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить аватарку.')
    }
  }

  const addChore = () => {
    const title = newChore.title.trim()
    if (!title) return
    setChores((current) => [...current, { ...newChore, id: makeId(), title, enabled: true, section: currentSection }])
    setNewChore({ title: '', minutes: 15, difficulty: 'normal' })
  }

  const addCategory = () => {
    const title = newCategoryTitle.trim()
    if (!title) return
    setChores((current) => [...current, { id: makeId(), title, enabled: true, icon: 'storage', section: currentSection, children: [] }])
    setNewCategoryTitle('')
  }

  const addSection = () => {
    const title = newSectionTitle.trim()
    if (!title || sections.includes(title)) return
    setSections((current) => [...current, title])
    setCurrentSection(title)
    setNewSectionTitle('')
  }

  const addChild = (groupId: string) => {
    setChores((current) =>
      current.map((item) =>
        isGroup(item) && item.id === groupId
          ? { ...item, children: [...item.children, { ...task(makeId(), '', 10, 'normal'), section: item.section || currentSection }] }
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

  const switchGameMode = (mode: GameMode) => {
    writeLocalJson(playersStorageKey(gameMode), players)
    setGameMode(mode)
    setPlayers(readPlayersForMode(mode))
    setStartHints([])
  }

  const goToHome = () => {
    setPhase('setup')
    setAssigned([])
    setRoundStartedAt(null)
    setSavedGameId('')
    setActiveGameId('')
    setAwaitingReview(false)
    window.history.replaceState(null, '', '/')
  }

  const dismissOnboarding = () => {
    writeLocalJson('wcq-onboarding-dismissed', true)
    setShowOnboarding(false)
  }

  const getStartBlockers = () => {
    const blockers: string[] = []
    if (!selectedTasks.length) blockers.push('chores')
    if (gameMode === 'childQuest') {
      if (!prizeTiers.find((tier) => tier.id === 'gold')?.label.trim()) blockers.push('gold-prize')
      if (!players[0]?.name.trim()) blockers.push('child-name')
    } else if (!prize.trim()) {
      blockers.push('prize')
    }
    if (!normalizeEmail(pairEmail).includes('@')) blockers.push('email')
    return blockers
  }

  const handleStartClick = () => {
    const blockers = getStartBlockers()
    setStartHints(blockers)
    if (blockers.length) {
      if (blockers.includes('email')) setStatus('Введите почту, чтобы сохранить игру в историю.')
      else if (blockers.includes('chores')) setStatus('Выберите хотя бы одно дело в списке.')
      else if (blockers.includes('gold-prize')) setStatus('Укажите приз за золото (1 место).')
      else if (blockers.includes('child-name')) setStatus('Введите имя ребёнка.')
      else if (blockers.includes('prize')) setStatus('Укажите приз или награду.')
      return
    }
    startRound()
  }

  const deleteSavedGame = async (gameId: string) => {
    try {
      const result = await api<{ state: ApiState }>(`/api/games/${gameId}`, { method: 'DELETE' })
      setRemoteState(normalizeApiState(result.state))
      if (savedGameId === gameId) setSavedGameId('')
      setStatus('Игра удалена из истории.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось удалить игру.')
    }
  }

  const startRound = async () => {
    if (!normalizeEmail(pairEmail).includes('@')) {
      setStatus('Введите общую почту перед стартом уборки.')
      return
    }
    if (gameMode === 'childQuest') {
      if (!prizeTiers.find((tier) => tier.id === 'gold')?.label.trim()) {
        setStatus('Укажите приз за золото (1 место).')
        return
      }
      if (!players[0]?.name.trim()) {
        setStatus('Введите имя ребёнка.')
        return
      }
    } else if (!prize.trim()) {
      setStatus('Укажите приз или награду перед стартом уборки.')
      return
    }

    const totals = players.map(() => 0)
    const nextAssigned: AssignedChore[] = []
    const roundTargetScore = gameMode === 'childQuest' ? recommendedScore : targetScore

    if (gameMode === 'childQuest') {
      for (const item of sectionChores.filter((chore) => chore.enabled)) {
        const tasks = getAssignableTasks(item)
        tasks.forEach((chore) => nextAssigned.push({ ...chore, assignedTo: childPlayerIndex }))
      }
    } else {
    const assignTask = (chore: AssignedChore, preferred?: number) => {
      const order: number[] =
        gameMode === 'solo'
          ? [0]
          : preferred !== undefined
            ? [preferred, ...activePlayerIndexes.filter((index) => index !== preferred)]
            : activePlayerIndexes.slice().sort((a, b) => totals[a] - totals[b])
      const target = order.find((playerIndex) => totals[playerIndex] + chore.minutes <= roundMinutes)
      if (target === undefined) return false
      totals[target] += chore.minutes
      nextAssigned.push({ ...chore, assignedTo: target })
      return true
    }

    for (const item of shuffle(sectionChores.filter((chore) => chore.enabled))) {
      const tasks = getAssignableTasks(item)
      if (!tasks.length) continue

      if (isGroup(item)) {
        const total = tasks.reduce((sum, chore) => sum + chore.minutes, 0)
        const order: number[] = gameMode === 'solo' ? [0] : activePlayerIndexes.slice().sort((a, b) => totals[a] - totals[b])
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
    }

    if (!nextAssigned.length) {
      setStatus('Не получилось собрать раунд: выбери больше дел или увеличь лимит времени.')
      return
    }
    setSavedGameId('')
    setAssigned(nextAssigned)
    setRoundStartedAt(Date.now())
    if (gameMode === 'childQuest') setTargetScore(roundTargetScore)
    setPhase('play')
    try {
      const result = await api<{ game: ActiveGame }>('/api/active-games', {
        body: JSON.stringify({
          chores: nextAssigned,
          mode: gameMode,
          players: gamePlayers.map((player, index) => ({
            ...player,
            email: normalizeEmail(player.email),
            isChild: Boolean(players[index]?.isChild),
          })),
          prize: gameMode === 'childQuest' ? prizeTiers.find((tier) => tier.id === 'gold')?.label || '' : prize,
          prizeTiers: gameMode === 'childQuest' ? prizeTiers : undefined,
          childPlayerIndex: gameMode === 'childQuest' ? childPlayerIndex : undefined,
          parentPlayerIndex: gameMode === 'childQuest' ? parentPlayerIndex : undefined,
          requirePhotoProof: gameMode === 'childQuest' ? requirePhotoProof : undefined,
          roundMinutes,
          targetScore: roundTargetScore,
        }),
        method: 'POST',
      })
      setActiveGameId(result.game.id)
      window.history.replaceState(null, '', `/game/${result.game.id}`)
      setAssigned(result.game.chores)
      setStatus(
        gameMode === 'childQuest'
          ? 'Квест готов! Скопируй ссылку ребёнку или покажи QR.'
          : 'QR-коды готовы: можно отмечать дела с телефонов.',
      )
    } catch (error) {
      setActiveGameId('')
      setStatus(error instanceof Error ? `Игра стартовала, но QR не создался: ${error.message}` : 'Игра стартовала, но QR не создался.')
    }
  }

  const completeNextFor = useCallback(
    async (playerIndex: number, choreId?: string) => {
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

  const rateChore = async (id: string, ratedPlayerIndex: number, rating: number) => {
    const reviewerIndex = activePlayerIndexes.find((index) => index !== ratedPlayerIndex) ?? 0
    if (activeGameId) {
      try {
        const result = await api<{ game: ActiveGame }>(`/api/active-games/${activeGameId}/rate`, {
          body: JSON.stringify({ choreId: id, partnerRating: rating, reviewerIndex }),
          method: 'POST',
        })
        setAssigned(result.game.chores)
        setSavedGameId('')
        return
      } catch {
        // Fall back to local state if the server is briefly unavailable.
      }
    }
    setAssigned((current) =>
      current.map((chore) => (chore.id === id && chore.assignedTo === ratedPlayerIndex ? { ...chore, partnerRating: rating } : chore)),
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
      partnerRating: 0,
      extra: true,
      approved: gameMode === 'solo',
      reviewBy:
        gameMode === 'solo'
          ? undefined
          : gameMode === 'childQuest' && parentPlayerIndex >= 0
            ? parentPlayerIndex
            : activePlayerIndexes.find((index) => index !== extraChore.assignedTo) ?? 0,
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
      setStatus(
        gameMode === 'solo'
          ? 'Дополнительное дело добавлено.'
          : gameMode === 'childQuest'
            ? 'Дополнительное дело ждёт подтверждения родителя.'
            : 'Дополнительное дело ждёт подтверждения другого участника.',
      )
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
    setAwaitingReview(false)
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
          players: gamePlayers.map((player, index) => ({
            ...player,
            email: normalizeEmail(player.email),
            isChild: Boolean(players[index]?.isChild),
          })),
          winnerEmail,
          mode: gameMode,
          prize: gameMode === 'childQuest' ? prizeTiers.find((tier) => tier.id === childTier)?.label || prize : prize,
          prizeTiers: gameMode === 'childQuest' ? prizeTiers : undefined,
          roundMinutes,
          targetScore,
          elapsedSeconds,
          scores: playerScores,
          chores: assigned,
        }),
        method: 'POST',
      })
      setRemoteState(normalizeApiState(result.state))
      setSavedGameId(result.game.id)
      setStatus('Игра сохранена в историю пары.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить игру.')
    }
  }

  return (
    <main className="game-shell">
      {status && <p className="app-toast">{status}</p>}
      <header className="topbar pixel-panel">
        <div>
          <h1>Tidy Titans</h1>
          <label className={`pair-email-label ${startHints.includes('email') ? 'field-error' : ''}`}>
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

      {awaitingReview && phase === 'play' && gameMode === 'duo' && (
        <article className="pixel-panel review-alert">
          <p className="eyebrow">Нужна ваша оценка</p>
          <h2>Участник завершил игру и ждёт проверки</h2>
          <p>Откройте экран оценок, поставьте баллы за выполненные дела и подведите итоги.</p>
          <button className="pixel-button start" type="button" onClick={() => advancePhase('rating')}>
            Перейти к оценкам
          </button>
        </article>
      )}

      {awaitingReview && phase === 'play' && gameMode === 'childQuest' && (
        <article className="pixel-panel review-alert">
          <p className="eyebrow">Квест завершён</p>
          <h2>Ребёнок нажал «Завершить»</h2>
          <p>Можно сразу открыть итоги и показать приз.</p>
          <button className="pixel-button start" type="button" onClick={() => advancePhase('ceremony')}>
            Показать итоги
          </button>
        </article>
      )}

      {phase === 'setup' && showOnboarding && <OnboardingTour onDismiss={dismissOnboarding} />}

      {phase === 'setup' && setupView === 'stats' && (
        <section className="setup-grid">
          <StatsPage
            gameMode={gameMode}
            pairGames={currentPairAllGames}
            leaderboard={remoteState.leaderboard}
            onBack={goToSetupHome}
            onDeleteGame={deleteSavedGame}
            players={gamePlayers}
          />
        </section>
      )}

      {phase === 'setup' && setupView === 'home' && (
        <section className="setup-grid">
          <article className={`pixel-panel profiles-panel ${showOnboarding ? 'tour-profiles' : ''}`}>
            <div className="panel-title">
              <span>1</span>
              <h2>{gameMode === 'childQuest' ? 'Профиль ребёнка' : 'Профили игроков'}</h2>
            </div>
            <div className="mode-grid mode-grid-three">
              <button className={gameMode === 'duo' ? 'pixel-button active' : 'pixel-button'} type="button" onClick={() => switchGameMode('duo')}>
                Парная игра
              </button>
              <button className={gameMode === 'solo' ? 'pixel-button active' : 'pixel-button'} type="button" onClick={() => switchGameMode('solo')}>
                Одиночный режим
              </button>
              <button className={gameMode === 'childQuest' ? 'pixel-button active' : 'pixel-button'} type="button" onClick={() => switchGameMode('childQuest')}>
                Квест для ребёнка
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
              {gameMode === 'childQuest' && (
                <div className="child-setup-block">
                  <p className="hint">
                    Один персонаж — ребёнок. Цель: <strong>{recommendedScore}</strong> монет (считается из выбранных дел).
                  </p>
                  <label className="child-proof-toggle">
                    <input checked={requirePhotoProof} type="checkbox" onChange={(event) => setRequirePhotoProof(event.target.checked)} />
                    Нужны фотографии для подтверждения (скоро)
                  </label>
                </div>
              )}
            </div>
            <div className="players-editor">
              {players.slice(0, gameMode === 'solo' || gameMode === 'childQuest' ? 1 : players.length).map((player, index) => (
                <ProfileEditor
                  index={index}
                  key={index}
                  onApplyProfile={applyProfile}
                  onSaveProfile={saveProfile}
                  onUpdatePlayer={updatePlayer}
                  onUploadAvatar={uploadAvatar}
                  player={player}
                  profiles={remoteState.profiles}
                  canRemove={gameMode === 'duo' && players.length > 1}
                  onRemovePlayer={removePlayer}
                  nameLabel={gameMode === 'childQuest' ? 'Имя ребёнка' : 'Имя героя'}
                  highlightName={startHints.includes('child-name')}
                />
              ))}
            </div>
            {gameMode === 'duo' && (
              <button className="pixel-button alt wide" type="button" onClick={addPlayer}>
                Добавить персонажа
              </button>
            )}
          </article>

          <aside className={`pixel-panel stats-panel ${showOnboarding ? 'tour-stats' : ''}`}>
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
                {activePlayerIndexes.map((index) => {
                  const player = players[index]
                  return (
                  <p key={index}>
                    {player.name}: побед {currentPairBoard.wins[normalizeEmail(gamePlayers[index]?.email || '')] || 0}
                  </p>
                  )
                })}
              </div>
            ) : (
              <p className="hint">Прошлых игр пока нет, ваши завершённые игры будут тут</p>
            )}
          </aside>

          <article className={`pixel-panel ${showOnboarding ? 'tour-duration' : ''}`}>
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
            className={showOnboarding ? 'tour-chores' : ''}
            chores={sectionChores}
            currentSection={currentSection}
            newCategoryTitle={newCategoryTitle}
            newChore={newChore}
            newSectionTitle={newSectionTitle}
            onAddCategory={addCategory}
            onAddChild={addChild}
            onAddChore={addChore}
            onAddSection={addSection}
            onDeleteItem={deleteItem}
            onNewCategoryTitle={setNewCategoryTitle}
            onNewChore={setNewChore}
            onNewSectionTitle={setNewSectionTitle}
            onSectionChange={setCurrentSection}
            onUpdateItem={updateItem}
            sections={sections}
          />

          <button
            className={`stats-nav-card pixel-panel ${showOnboarding ? 'tour-dashboard' : ''}`}
            type="button"
            onClick={goToStats}
          >
            <div className="panel-title stats-nav-title">
              <span>4</span>
              <div>
                <h2>История, дела и лидерборд</h2>
                <p className="hint">Турнирная таблица и статистика по текущему режиму</p>
              </div>
            </div>
            <span aria-hidden className="stats-nav-arrow">
              →
            </span>
          </button>

          <article className={`pixel-panel start-card ${showOnboarding ? 'tour-start' : ''}`}>
            <h2>Готовы к уборке?</h2>
            <div className="start-card-body">
              <p className={startHints.includes('chores') ? 'start-hint-error' : ''}>
                Выбрано дел: <strong>{selectedTasks.length}</strong>.{' '}
                {gameMode === 'childQuest'
                  ? `Цель ребёнка: ${recommendedScore} монет.`
                  : gameMode === 'solo'
                    ? `Цель: ${targetScore} очков.`
                    : 'Можно распределить целую категорию, а игра сама разорвёт её, если лимит времени не даёт отдать всё одному.'}
              </p>
              {gameMode !== 'childQuest' && (
                <label className={startHints.includes('prize') ? 'field-error' : ''}>
                  Приз / награда
                  <input
                    placeholder={gameMode === 'solo' ? 'Например: купить себе вкусняшку' : 'Например: победителю массаж / ужин'}
                    value={prize}
                    onChange={(event) => {
                      setPrize(event.target.value)
                      setStartHints((current) => current.filter((item) => item !== 'prize'))
                    }}
                  />
                </label>
              )}
              {gameMode === 'childQuest' && (
                <div className={`tier-prize-grid start-prize-grid ${startHints.includes('gold-prize') ? 'field-error' : ''}`}>
                  {prizeTiers.map((tier) => (
                    <label key={tier.id} className={tier.id === 'gold' && startHints.includes('gold-prize') ? 'field-error' : ''}>
                      <span className="tier-prize-label">
                        <PrizeSprite tier={tier.id} small />
                        {tierLabels[tier.id]} ({tier.minPercent}%+){tier.id === 'gold' ? ' *' : ''}
                      </span>
                      <input
                        placeholder={
                          tier.id === 'gold'
                            ? 'Например: поход в кино'
                            : tier.id === 'silver'
                              ? 'Например: мороженое'
                              : 'Например: наклейка'
                        }
                        value={tier.label}
                        onChange={(event) => {
                          setPrizeTiers((current) =>
                            current.map((item) => (item.id === tier.id ? { ...item, label: event.target.value } : item)),
                          )
                          if (tier.id === 'gold') setStartHints((current) => current.filter((item) => item !== 'gold-prize'))
                        }}
                      />
                    </label>
                  ))}
                  <p className="hint">* Обязателен только приз за золото. Серебро и бронза — по желанию.</p>
                </div>
              )}
              {startHints.length > 0 && (
                <p className="start-blocker-hint">Заполните подсвеченные поля, чтобы запустить игру.</p>
              )}
            </div>
            <button
              className="pixel-button start"
              type="button"
              onClick={handleStartClick}
            >
              {gameMode === 'childQuest' ? 'Запустить квест' : 'Сгенерировать уборку'}
            </button>
          </article>
        </section>
      )}

      {phase === 'play' && (
        <section className="play-screen">
          <div className="hud pixel-panel">
            <div>
              <p className="eyebrow">{gameMode === 'childQuest' ? 'Время квеста' : 'Время рейда'}</p>
              <strong>{formatClock(elapsedSeconds)}</strong>
            </div>
            <div>
              <p className="eyebrow">{gameMode === 'childQuest' ? 'Прогресс ребёнка' : 'Горячие клавиши'}</p>
              <strong>
                {gameMode === 'childQuest' && childPlayerIndex >= 0
                  ? `${childCoins} / ${targetScore} монет`
                  : 'Space / Enter'}
              </strong>
            </div>
            <button
              className="pixel-button"
              type="button"
              onClick={() => advancePhase(gameMode === 'childQuest' || gameMode === 'solo' ? 'ceremony' : 'rating')}
            >
              {gameMode === 'childQuest' ? 'Завершить квест' : gameMode === 'solo' ? 'Подвести итоги' : 'К оценкам'}
            </button>
            {(activeGameId || initialGameId) && (
              <button className="pixel-button alt" type="button" onClick={goToHome}>
                На главную
              </button>
            )}
          </div>

          {gameMode === 'childQuest' && (
            <article className="pixel-panel parent-watch-card">
              <div className="parent-watch-header">
                <div>
                  <p className="eyebrow">Родительский экран</p>
                  <h2>{players[childPlayerIndex].name} играет квест</h2>
                  <p>
                    Монеты: <strong>{childCoins}</strong> / {targetScore} · Уровень:{' '}
                    <strong>{childTier === 'none' ? 'пока без приза' : tierLabels[childTier as Exclude<TierId, 'none'>]}</strong>
                  </p>
                </div>
                <ChildQuestHud coins={childCoins} target={targetScore} prizeTiers={prizeTiers} compact />
              </div>
            </article>
          )}

          <div className="battlefield">
            {activePlayerIndexes.map((playerIndex) => {
              const plan = playerPlans[playerIndex] || []
              const totalMinutes = plan.reduce((sum, chore) => sum + chore.minutes, 0)
              const done = plan.filter((chore) => chore.completed).length
              return (
                <article className="pixel-panel player-board" key={playerIndex}>
                  <div className="player-card">
                    <PixelAvatar avatar={players[playerIndex].avatar} avatarUrl={players[playerIndex].avatarUrl} />
                    <div>
                      <h2>{players[playerIndex].name || `Игрок ${playerIndex + 1}`}</h2>
                      <p>
                        {done}/{plan.length} дел · {totalMinutes} мин · текущие очки {playerScores[playerIndex]?.total || 0}
                      </p>
                    </div>
                  </div>
                  <button
                    className="pixel-button wide"
                    type="button"
                    onClick={() => completeNextFor(playerIndex)}
                  >
                    {playerIndex === 0 ? 'Space' : playerIndex === 1 ? 'Enter' : 'QR'}: отметить следующее
                  </button>
                  {qrCodes[playerIndex] && (
                    <div className="qr-card">
                      <img alt={`QR для ${players[playerIndex].name}`} src={qrCodes[playerIndex]} />
                      <div>
                        <strong>{gameMode === 'childQuest' ? 'Ссылка для ребёнка' : 'Сканируй телефоном'}</strong>
                        <span>Откроются только дела {players[playerIndex].name}</span>
                        {playerLinks[playerIndex] && <code className="player-link">{playerLinks[playerIndex]}</code>}
                        <button className="pixel-button alt wide" type="button" onClick={() => copyPlayerLink(playerIndex)}>
                          Скопировать ссылку
                        </button>
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
                            completeNextFor(playerIndex, chore.id)
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
              <button
                className="pixel-button start"
                type="button"
                onClick={() => advancePhase(gameMode === 'childQuest' || gameMode === 'solo' ? 'ceremony' : 'rating')}
              >
                {gameMode === 'childQuest' ? 'Показать приз' : gameMode === 'solo' ? 'Подвести итоги' : 'К оценкам'}
              </button>
            </div>
          )}
        </section>
      )}

      {phase === 'rating' && gameMode === 'duo' && (
        <section className="results-screen">
          <article className="pixel-panel winner-card calm">
            <p className="eyebrow">Сначала оценки</p>
            <h2>Поставьте друг другу оценки</h2>
            <p>Итоги ещё скрыты. Добавьте всё, что сделали сверх плана, затем нажмите «Подвести итоги».</p>
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
            showRatings
          />
          <div className="actions">
            <button className="pixel-button start ceremony-button" type="button" onClick={() => advancePhase('ceremony')}>
              Подвести итоги
            </button>
            <button className="pixel-button" type="button" onClick={() => advancePhase('play')}>
              Вернуться к списку
            </button>
          </div>
        </section>
      )}

      {phase === 'ceremony' && (
        <section className="results-screen ceremony-screen">
          <article className="pixel-panel certificate">
            <div className="confetti" />
            {gameMode === 'childQuest' && childTier !== 'none' && (
              <div className="ceremony-medal">
                <PrizeSprite tier={childTier as Exclude<TierId, 'none'>} />
              </div>
            )}
            <p className="eyebrow">Грамота победителя</p>
            <h2>
              {gameMode === 'childQuest'
                ? childTier === 'none'
                  ? 'Квест завершён'
                  : `Приз: ${tierLabels[childTier as Exclude<TierId, 'none'>]}!`
                : gameMode === 'solo'
                ? winner === null
                  ? 'Почти победа'
                  : 'Личная победа!'
                : winner === null
                  ? 'Суперничья уборки'
                  : `Президент уборки: ${players[winner].name}`}
            </h2>
            <p className="certificate-name">
              {gameMode === 'childQuest' && childPlayerIndex >= 0
                ? players[childPlayerIndex].name
                : gameMode === 'solo'
                ? players[0].name
                : winner === null
                  ? activePlayerIndexes.map((index) => players[index].name).join(' + ')
                  : players[winner].name}
            </p>
            <p>
              {gameMode === 'childQuest'
                ? childTier === 'none'
                  ? `Набрано ${childCoins} из ${targetScore} монет. Приз не разблокирован — но дом стал чище!`
                  : `Набрано ${childCoins} монет. Награда: ${
                      prizeTiers.find((tier) => tier.id === childTier)?.label || 'заслуженный приз'
                    }.`
                : gameMode === 'solo'
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
            showRatings={gameMode === 'duo'}
            readOnly
          />
          <div className="actions">
            <button className="pixel-button start" disabled={Boolean(savedGameId)} type="button" onClick={saveGame}>
              {savedGameId ? 'Игра сохранена' : 'Сохранить в историю'}
            </button>
            <button className="pixel-button" type="button" onClick={resetRound}>
              Новый рейд
            </button>
            <button className="pixel-button alt" type="button" onClick={goToHome}>
              На главную
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

function ChoreLibrary({
  chores,
  className = '',
  currentSection,
  newCategoryTitle,
  newChore,
  newSectionTitle,
  onAddCategory,
  onAddChild,
  onAddChore,
  onAddSection,
  onDeleteItem,
  onNewCategoryTitle,
  onNewChore,
  onNewSectionTitle,
  onSectionChange,
  onUpdateItem,
  sections,
}: {
  chores: ChoreItem[]
  className?: string
  currentSection: string
  newCategoryTitle: string
  newChore: { title: string; minutes: number; difficulty: Difficulty }
  newSectionTitle: string
  onAddCategory: () => void
  onAddChild: (groupId: string) => void
  onAddChore: () => void
  onAddSection: () => void
  onDeleteItem: (id: string, childId?: string) => void
  onNewCategoryTitle: (title: string) => void
  onNewChore: (chore: { title: string; minutes: number; difficulty: Difficulty }) => void
  onNewSectionTitle: (title: string) => void
  onSectionChange: (title: string) => void
  onUpdateItem: (id: string, patch: Partial<ChoreTask | ChoreGroup>, childId?: string) => void
  sections: string[]
}) {
  const [addingSection, setAddingSection] = useState(false)

  return (
    <article className={className ? `pixel-panel chores-panel ${className}` : 'pixel-panel chores-panel'}>
      <div className="panel-title panel-title-with-tabs">
        <span>3</span>
        <h2>Общий список дел</h2>
        <div className="section-tabs">
          {sections.map((section) => (
            <button
              className={currentSection === section ? 'section-tab active' : 'section-tab'}
              key={section}
              type="button"
              onClick={() => onSectionChange(section)}
            >
              {section}
            </button>
          ))}
          <button
            aria-label="Добавить раздел"
            className="section-tab add"
            type="button"
            onClick={() => setAddingSection((current) => !current)}
          >
            +
          </button>
        </div>
      </div>
      {addingSection && (
        <div className="section-add-inline">
          <input
            placeholder="Название раздела, например: уход за собой"
            value={newSectionTitle}
            onChange={(event) => onNewSectionTitle(event.target.value)}
          />
          <button
            className="pixel-button alt"
            type="button"
            onClick={() => {
              onAddSection()
              setAddingSection(false)
            }}
          >
            Сохранить раздел
          </button>
        </div>
      )}
      <div className="chore-compose">
        <div className="chore-compose-row">
          <input
            className="compose-title"
            placeholder="Дело"
            value={newChore.title}
            onChange={(event) => onNewChore({ ...newChore, title: event.target.value })}
          />
          <input
            aria-label="Минуты"
            className="compose-minutes"
            min={5}
            step={5}
            type="number"
            value={newChore.minutes}
            onChange={(event) => onNewChore({ ...newChore, minutes: Number(event.target.value) })}
          />
          <select
            className="compose-diff"
            value={newChore.difficulty}
            onChange={(event) => onNewChore({ ...newChore, difficulty: event.target.value as Difficulty })}
          >
            <option value="easy">легко</option>
            <option value="normal">обычно</option>
            <option value="hard">сложно</option>
          </select>
          <button className="tiny-button compose-add" title="Добавить дело" type="button" onClick={onAddChore}>
            +
          </button>
        </div>
        <div className="chore-compose-row chore-compose-category">
          <input
            placeholder="Категория"
            value={newCategoryTitle}
            onChange={(event) => onNewCategoryTitle(event.target.value)}
          />
          <button className="tiny-button alt compose-add-category" title="Добавить категорию" type="button" onClick={onAddCategory}>
            + кат
          </button>
        </div>
      </div>
      <div className="chore-list">
        {chores.map((item) =>
          isGroup(item) ? (
            <div className="chore-group" key={item.id}>
              <div className="chore-row group-row">
                <input checked={item.enabled} type="checkbox" onChange={(event) => onUpdateItem(item.id, { enabled: event.target.checked })} />
                <select className="room-icon-select" value={item.icon || 'storage'} onChange={(event) => onUpdateItem(item.id, { icon: event.target.value })}>
                  {roomIconOptions.map((icon) => (
                    <option key={icon} value={icon}>
                      {roomIconLabels[icon]}
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
  extraChore: { assignedTo: number; title: string; minutes: number; difficulty: Difficulty; rating: number }
  mode: GameMode
  onAdd: () => void
  onChange: (value: { assignedTo: number; title: string; minutes: number; difficulty: Difficulty; rating: number }) => void
  players: Player[]
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
            onChange={(event) => onChange({ ...extraChore, assignedTo: Number(event.target.value) })}
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
          <select
            value={extraChore.difficulty}
            onChange={(event) => onChange({ ...extraChore, difficulty: event.target.value as Difficulty })}
          >
            <option value="easy">легко</option>
            <option value="normal">обычно</option>
            <option value="hard">сложно</option>
          </select>
        )}
        <button className="pixel-button start" type="button" onClick={onAdd}>
          Добавить сделанное
        </button>
      </div>
      {mode === 'duo' && <p className="hint">Другой участник подтвердит сложность и оценку на своей QR-странице.</p>}
      {mode === 'childQuest' && <p className="hint">Родитель подтвердит сложность и оценку на главном экране.</p>}
      {mode === 'solo' && <p className="hint">Баллы за доп. дела считаются только по времени и сложности — без самооценки.</p>}
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
  readOnly = false,
  showRatings = false,
}: {
  assigned: AssignedChore[]
  mode: GameMode
  onRateChore: (id: string, playerIndex: number, rating: number) => void
  playerPlans: AssignedChore[][]
  playerScores: PlayerScore[]
  players: Player[]
  readOnly?: boolean
  showRatings?: boolean
}) {
  const visiblePlayers = mode === 'solo' ? [0] : mode === 'childQuest' ? playerPlans.map((_, index) => index).filter((index) => (playerPlans[index] || []).some(isCompleted)) : players.map((_, index) => index)

  return (
    <div className="score-grid">
      {visiblePlayers.map((playerIndex) => (
        <article className="pixel-panel score-card" key={playerIndex}>
          <div className="player-card">
            <PixelAvatar avatar={players[playerIndex].avatar} avatarUrl={players[playerIndex].avatarUrl} small />
            <h2>{players[playerIndex].name}</h2>
          </div>
          <strong className="big-score">{playerScores[playerIndex]?.total || 0}</strong>
          <p>
            Дела: {playerScores[playerIndex]?.count || 0} · Скорость: +{playerScores[playerIndex]?.speed || 0}
            {showRatings ? ` · Оценки: +${playerScores[playerIndex]?.partner || 0}` : ''}
          </p>
          <div className="rating-list">
            {(playerPlans[playerIndex] || [])
              .filter(isCompleted)
              .map((chore) => (
                <div className="rating-row" key={`${chore.id}-${chore.assignedTo}`}>
                  <span>{chore.parentTitle ? `${chore.parentTitle}: ${chore.title}` : chore.title}</span>
                  {chore.extra && !chore.approved && <em>ждёт подтверждения</em>}
                  {showRatings && (
                    <div>
                      {[0, 1, 2, 3].map((rating) => (
                        <button
                          className={chore.partnerRating === rating ? 'rating active' : 'rating'}
                          disabled={readOnly}
                          key={rating}
                          type="button"
                          onClick={() => onRateChore(chore.id, playerIndex, rating)}
                        >
                          {rating}
                        </button>
                      ))}
                    </div>
                  )}
                  {!showRatings && (
                    <small>
                      +{10 + chore.minutes + difficultyBonus[chore.difficulty]}
                      {chore.partnerRating > 0 ? ` · оценка +${chore.partnerRating * 5}` : ''}
                    </small>
                  )}
                </div>
              ))}
            {!assigned.some((chore) => chore.assignedTo === playerIndex && chore.completed) && (
              <p className="hint">Нет закрытых дел.</p>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

function ProfileEditor({
  canRemove = false,
  highlightName = false,
  index,
  nameLabel = 'Имя героя',
  onApplyProfile,
  onRemovePlayer,
  onSaveProfile,
  onUpdatePlayer,
  onUploadAvatar,
  player,
  profiles,
}: {
  canRemove?: boolean
  highlightName?: boolean
  index: number
  nameLabel?: string
  onApplyProfile: (index: number, profile: Profile) => void
  onRemovePlayer: (index: number) => void
  onSaveProfile: (index: number) => void
  onUpdatePlayer: (index: number, patch: Partial<Player>) => void
  onUploadAvatar: (index: number, file: File | null) => void
  player: Player
  profiles: Profile[]
}) {
  const [uploadHint, setUploadHint] = useState(player.avatarUrl ? 'Своя картинка загружена' : 'Файл не выбран')

  useEffect(() => {
    if (player.avatarUrl) setUploadHint('Своя картинка загружена')
  }, [player.avatarUrl])

  return (
    <div className="player-editor">
      <PixelAvatar avatar={player.avatar} avatarUrl={player.avatarUrl} />
      <label className={highlightName ? 'field-error' : ''}>
        {nameLabel}
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
            onClick={() => {
              onUpdatePlayer(index, { avatar, avatarUrl: '' })
              setUploadHint('Файл не выбран')
            }}
          >
            <PixelAvatar avatar={avatar} small />
          </button>
        ))}
      </div>
      <div className="pixel-file-upload">
        <span className="pixel-file-upload-title">Своя аватарка</span>
        <div className="pixel-file-upload-row">
          <label className="pixel-file-upload-button">
            <span>Выбрать файл</span>
            <input
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              className="pixel-file-upload-input"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0] || null
                setUploadHint(file?.name || 'Файл не выбран')
                onUploadAvatar(index, file)
              }}
            />
          </label>
          <span className="pixel-file-upload-name" title={uploadHint}>
            {uploadHint}
          </span>
        </div>
        <small className="pixel-file-upload-hint">PNG, JPG, GIF или WebP</small>
      </div>
      <button className="pixel-button wide" type="button" onClick={() => onSaveProfile(index)}>
        Сохранить профиль
      </button>
      {canRemove && (
        <button className="tiny-button danger" type="button" onClick={() => onRemovePlayer(index)}>
          Удалить персонажа
        </button>
      )}
    </div>
  )
}

const modeLabels: Record<GameMode, string> = {
  solo: 'Одиночный',
  duo: 'Парный',
  childQuest: 'Квест для ребёнка',
}

function StatsPage({
  gameMode,
  pairGames,
  leaderboard,
  onBack,
  onDeleteGame,
  players,
}: {
  gameMode: GameMode
  pairGames: GameRecord[]
  leaderboard: ModeLeaderboards
  onBack: () => void
  onDeleteGame: (gameId: string) => void
  players: Player[]
}) {
  const [statsTab, setStatsTab] = useState<'tournament' | 'analytics'>('tournament')
  const [statsMode, setStatsMode] = useState<GameMode>(gameMode)

  useEffect(() => {
    setStatsMode(gameMode)
  }, [gameMode])

  const modeHistory = useMemo(
    () => pairGames.filter((game) => (game.mode || 'duo') === statsMode),
    [pairGames, statsMode],
  )
  const modeStats = useMemo(() => computeChoreStats(modeHistory, players), [modeHistory, players])
  const modeBoard = leaderboard[statsMode]

  return (
    <article className="pixel-panel stats-page">
      <div className="stats-page-top">
        <button className="tiny-button stats-back-button" type="button" onClick={onBack}>
          ← На главную
        </button>
        <div className="panel-title stats-page-title">
          <span>4</span>
          <h2>История, дела и лидерборд</h2>
        </div>
      </div>

      <div className="stats-page-tabs">
        <button
          className={statsTab === 'tournament' ? 'section-tab active' : 'section-tab'}
          type="button"
          onClick={() => setStatsTab('tournament')}
        >
          Турнирная таблица
        </button>
        <button
          className={statsTab === 'analytics' ? 'section-tab active' : 'section-tab'}
          type="button"
          onClick={() => setStatsTab('analytics')}
        >
          Статистика
        </button>
      </div>

      <div className="stats-mode-picker">
        {(['solo', 'duo', 'childQuest'] as const).map((mode) => (
          <button
            className={statsMode === mode ? 'section-tab active' : 'section-tab'}
            key={mode}
            type="button"
            onClick={() => setStatsMode(mode)}
          >
            {modeLabels[mode]}
          </button>
        ))}
      </div>

      {statsTab === 'tournament' && (
        <div className="stats-tournament-layout">
          <section className="stats-section">
            <h3>Турнирная таблица · {modeLabels[statsMode]}</h3>
            <div className="history-list">
              {modeBoard.map((entry, index) => (
                <div className="history-row" key={`${statsMode}-${entry.pairKey}`}>
                  <div className="history-row-body">
                    <strong>
                      #{index + 1}{' '}
                      {statsMode === 'solo' || statsMode === 'childQuest'
                        ? entry.players[0]?.name || 'Игрок'
                        : entry.players.map((player) => player.name).join(' + ')}
                    </strong>
                    <span>
                      {entry.games} игр · {entry.totalScore} очков · {entry.totalChores} дел
                    </span>
                  </div>
                </div>
              ))}
              {!modeBoard.length && <p className="hint">В этом режиме пока никого нет в таблице.</p>}
            </div>
          </section>

          <section className="stats-section">
            <h3>История · {modeLabels[statsMode]}</h3>
            <div className="history-list">
              {modeHistory.map((game) => (
                <div className="history-row history-row-actions" key={game.id}>
                  <div className="history-row-body">
                    <strong>
                      {game.mode === 'childQuest'
                        ? game.players[0]?.name || 'Квест'
                        : game.mode === 'solo'
                          ? `${game.players[0]?.name || 'Соло'}: ${game.scores[0]?.total || 0} очков`
                          : game.winnerEmail
                            ? `Победа: ${game.players.find((player) => player.email === game.winnerEmail)?.name}`
                            : 'Ничья'}
                    </strong>
                    <span>
                      {formatDate(game.finishedAt)} · {game.scores.map((score) => score.total).join(' : ')}
                    </span>
                  </div>
                  <button className="tiny-button danger" type="button" onClick={() => onDeleteGame(game.id)}>
                    Удалить
                  </button>
                </div>
              ))}
              {!modeHistory.length && <p className="hint">Сохранённых игр в этом режиме пока нет.</p>}
            </div>
          </section>
        </div>
      )}

      {statsTab === 'analytics' && (
        <section className="stats-section">
          <h3>Кто что делает чаще · {modeLabels[statsMode]}</h3>
          <div className="history-list">
            {modeStats.map((stat) => (
              <div className="history-row" key={stat.title}>
                <div className="history-row-body">
                  <strong>{stat.title}</strong>
                  <span>
                    {players.map((player) => `${player.name}: ${stat.byPlayer[normalizeEmail(player.email)] || 0}`).join(' · ')} ·
                    среднее {stat.avgMinutes} мин
                  </span>
                </div>
              </div>
            ))}
            {!modeStats.length && <p className="hint">Статистика дел появится после сохранённых игр.</p>}
          </div>
        </section>
      )}
    </article>
  )
}

function OnboardingTour({ onDismiss }: { onDismiss: () => void }) {
  return (
    <article className="pixel-panel onboarding-panel">
      <div className="panel-title">
        <span>?</span>
        <h2>Как устроена игра</h2>
      </div>
      <div className="onboarding-grid">
        <section className="onboarding-step">
          <strong>1. Профили</strong>
          <p>Выберите режим: соло, пара или квест для ребёнка. Настройте имя и аватар — у каждого режима свой персонаж.</p>
        </section>
        <section className="onboarding-step">
          <strong>2. Время и дела</strong>
          <p>Задайте лимит минут и отметьте дела в библиотеке. Можно добавлять комнаты и подзадачи.</p>
        </section>
        <section className="onboarding-step">
          <strong>3. Старт</strong>
          <p>Внизу укажите приз и нажмите «Сгенерировать уборку». Ребёнку отправьте QR-ссылку на телефон.</p>
        </section>
        <section className="onboarding-step">
          <strong>4. Итоги</strong>
          <p>Отмечайте дела, завершайте раунд, сохраняйте в историю. Почта нужна, чтобы не потерять прогресс.</p>
        </section>
      </div>
      <button className="pixel-button start" type="button" onClick={onDismiss}>
        Понятно, поехали
      </button>
    </article>
  )
}

function PrizeSprite({ tier, small = false }: { tier: Exclude<TierId, 'none'> | 'coin'; small?: boolean }) {
  return (
    <img
      alt=""
      className={small ? `prize-sprite small ${tier}` : `prize-sprite ${tier}`}
      src={`/sprites/${tier}.svg`}
    />
  )
}

function ChildQuestHud({
  coins,
  compact = false,
  prizeTiers = defaultPrizeTiers,
  target,
}: {
  coins: number
  compact?: boolean
  prizeTiers?: PrizeTier[]
  target: number
}) {
  const info = getNextTierInfo(coins, target)
  const currentPrize =
    info.current !== 'none' ? prizeTiers.find((tier) => tier.id === info.current)?.label || '' : ''

  return (
    <div className={compact ? 'child-quest-hud compact' : 'child-quest-hud'}>
      <div className="coin-row">
        <PrizeSprite tier="coin" small />
        <strong>{coins}</strong>
        <span>/ {target} монет</span>
      </div>
      <div className="tier-track">
        {(['bronze', 'silver', 'gold'] as const).map((tier) => {
          const threshold = tier === 'gold' ? 1 : tier === 'silver' ? 0.85 : 0.75
          const unlocked = target > 0 && coins >= Math.ceil(target * threshold)
          return (
            <div className={`tier-badge ${info.current === tier ? 'active' : unlocked ? 'unlocked' : ''}`} key={tier}>
              <PrizeSprite tier={tier} small />
              <span>{tierLabels[tier]}</span>
            </div>
          )
        })}
      </div>
      {info.current !== 'gold' && info.next && info.remaining > 0 && (
        <p className="tier-hint">
          До {tierLabels[info.next as Exclude<TierId, 'none'>]}: +{info.remaining} монет
        </p>
      )}
      {currentPrize && <p className="tier-win">Сейчас выигрываешь: {currentPrize}</p>}
    </div>
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

  if (spriteAvatarSet.has(avatar)) {
    return (
      <div className={small ? `sprite-avatar ${avatar} small` : `sprite-avatar ${avatar}`} aria-hidden="true">
        <img alt="" src={`/avatars/${avatar}.svg`} />
      </div>
    )
  }

  return <LegacyPixelAvatar avatar={avatar} small={small} />
}

/** CSS-only аватары (legacy). Оставлены как запасной вариант. */
function LegacyPixelAvatar({ avatar, small = false }: { avatar: string; small?: boolean }) {
  return (
    <div className={small ? `pixel-avatar ${avatar} small` : `pixel-avatar ${avatar}`} aria-hidden="true">
      <span className="ear left" />
      <span className="ear right" />
      <span className="horn left" />
      <span className="horn right" />
      <span className="eye left" />
      <span className="eye right" />
      <span className="snout" />
      {avatar !== 'duck' && <span className="mouth" />}
      <span className="badge" />
      <span className="spark" />
    </div>
  )
}

function MobilePlayerPage({ playerIndex, sessionId }: { playerIndex: number; sessionId: string }) {
  const [game, setGame] = useState<ActiveGame | null>(null)
  const [status, setStatus] = useState('Загружаю игру...')
  const [reviews, setReviews] = useState<Record<string, { difficulty: Difficulty; rating: number }>>({})
  const [mobileExtra, setMobileExtra] = useState({ title: '', difficulty: 'normal' as Difficulty })

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

  const rateDoneChore = async (choreId: string, rating: number) => {
    try {
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${sessionId}/rate`, {
        body: JSON.stringify({ choreId, partnerRating: rating, reviewerIndex: playerIndex }),
        method: 'POST',
      })
      setGame(result.game)
      setStatus('Оценка сохранена')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить оценку')
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
          title,
        }),
        method: 'POST',
      })
      setGame(result.game)
      setMobileExtra({ title: '', difficulty: 'normal' })
      setStatus(
        result.game.mode === 'solo'
          ? 'Дополнительное дело добавлено'
          : result.game.mode === 'childQuest'
            ? 'Дело отправлено родителю на подтверждение'
            : 'Дело отправлено на подтверждение',
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось добавить дело')
    }
  }

  const finishGame = async () => {
    try {
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${sessionId}/finish`, {
        body: JSON.stringify({ playerIndex }),
        method: 'POST',
      })
      setGame(result.game)
      setStatus(result.game.phase === 'ceremony' ? 'Игра завершена' : 'Ждём оценку')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось завершить игру')
    }
  }

  if (!game) {
    return (
      <main className="mobile-shell">
        <section className="pixel-panel mobile-panel">
          <p className="eyebrow">Tidy Titans</p>
          <h1>Мои дела</h1>
          <p>{status}</p>
        </section>
      </main>
    )
  }

  const player = game.players[playerIndex]
  if (!player) {
    return (
      <main className="mobile-shell">
        <section className="pixel-panel mobile-panel">
          <p className="eyebrow">Weekend Cleanup Quest</p>
          <h1>Игрок не найден</h1>
          <p>Проверь QR-код или попроси открыть свежую ссылку.</p>
        </section>
      </main>
    )
  }
  const chores = game.chores.filter((chore) => chore.assignedTo === playerIndex)
  const reviewChores = game.chores.filter((chore) => chore.extra && !chore.approved && chore.reviewBy === playerIndex)
  const ratingChores =
    game.mode === 'duo'
      ? game.chores.filter((chore) => chore.completed && chore.assignedTo !== playerIndex && (!chore.extra || chore.approved))
      : []
  const done = chores.filter((chore) => chore.completed).length
  const childCoins = chores.filter((chore) => chore.completed).reduce((sum, chore) => sum + choreBasePoints(chore), 0)
  const childTarget = game.targetScore || 0
  const playerScore = computePlayerScore(game.chores, playerIndex)
  const childTier = game.mode === 'childQuest' ? getTierFromScore(childCoins, childTarget) : 'none'
  const soloWon = game.mode === 'solo' && playerScore.total >= Math.ceil((game.targetScore || 0) * 0.9)
  const playerFinished = (game.finishedPlayers || []).includes(playerIndex)
  const playerLink = `${getShareOrigin()}/player/${sessionId}/${playerIndex}`

  const shareLink = async () => {
    try {
      await copyText(playerLink)
      setStatus('Ссылка скопирована')
    } catch {
      setStatus(playerLink)
    }
  }

  if (game.phase === 'ceremony') {
    const prizeLabel =
      game.mode === 'childQuest' && childTier !== 'none'
        ? game.prizeTiers?.find((tier) => tier.id === childTier)?.label || 'заслуженный приз'
        : game.mode === 'solo' && soloWon
          ? game.prize || 'выбери себе приятный приз'
          : ''

    return (
      <main className={game.mode === 'childQuest' ? 'mobile-shell kids-mode' : 'mobile-shell'}>
        <section className="pixel-panel mobile-panel mobile-results">
          {game.mode === 'childQuest' && childTier !== 'none' && (
            <div className="ceremony-medal mobile-medal">
              <PrizeSprite tier={childTier as Exclude<TierId, 'none'>} />
            </div>
          )}
          <p className="eyebrow">Итоги игры</p>
          <h1>{player.name}</h1>
          <strong className="mobile-final-score">{game.mode === 'childQuest' ? childCoins : playerScore.total}</strong>
          <p className="mobile-score-breakdown">
            {game.mode === 'childQuest'
              ? `Монеты: ${childCoins} / ${childTarget}`
              : `Очки: ${playerScore.total} · дела +${playerScore.base} · скорость +${playerScore.speed}`}
          </p>
          {prizeLabel ? (
            <article className="mobile-prize-card">
              <p className="eyebrow">Твой приз</p>
              <h2>{prizeLabel}</h2>
            </article>
          ) : (
            <p className="hint">
              {game.mode === 'childQuest'
                ? `Набрано ${childCoins} из ${childTarget} монет. Приз пока не разблокирован, но дом стал чище!`
                : game.mode === 'solo'
                  ? `Цель: ${game.targetScore || 0} очков. Набрано ${playerScore.total}.`
                  : 'Игра завершена!'}
            </p>
          )}
          <div className="mobile-results-list">
            {chores
              .filter(isCompleted)
              .map((chore) => (
                <div className="mobile-result-row" key={chore.id}>
                  <span>{chore.parentTitle ? `${chore.parentTitle}: ${chore.title}` : chore.title}</span>
                  <strong>+{choreBasePoints(chore)}</strong>
                </div>
              ))}
          </div>
        </section>
      </main>
    )
  }

  if (playerFinished && game.phase === 'awaiting_rating' && ratingChores.length === 0) {
    return (
      <main className="mobile-shell">
        <section className="pixel-panel mobile-panel mobile-waiting">
          <p className="eyebrow">Почти готово</p>
          <h1>Ждём оценку</h1>
          <p>
            Ты завершил игру. Сейчас {game.mode === 'childQuest' ? 'родитель' : 'другой участник'} ставит баллы за твои
            дела — страница обновится сама.
          </p>
          <strong className="mobile-final-score">{playerScore.total}</strong>
          <p className="hint">Пока набрано {playerScore.total} очков · {done}/{chores.length} дел</p>
        </section>
      </main>
    )
  }

  return (
    <main className={game.mode === 'childQuest' ? 'mobile-shell kids-mode' : 'mobile-shell'}>
      <section className="pixel-panel mobile-panel">
        {game.mode === 'childQuest' && (
          <ChildQuestHud coins={childCoins} prizeTiers={game.prizeTiers} target={childTarget} />
        )}
        <div className="player-card">
          <PixelAvatar avatar={player.avatar} avatarUrl={player.avatarUrl} />
          <div>
            <p className="eyebrow">{game.mode === 'childQuest' ? 'Tidy Titans' : 'Моя уборка'}</p>
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
            <h2>{game.mode === 'childQuest' ? 'Ребёнок добавил дело' : 'Нужно подтвердить дело'}</h2>
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

        {ratingChores.length > 0 && (
          <div className="review-box mobile-rating-box">
            <h2>Оценить других</h2>
            <p className="hint">Можно пройтись по очереди по делам других участников. Свои дела здесь не показываются.</p>
            {ratingChores.map((chore) => {
              const owner = game.players[chore.assignedTo]
              return (
                <div className="review-card" key={`rate-${chore.id}-${chore.assignedTo}`}>
                  <strong>{owner?.name || `Игрок ${chore.assignedTo + 1}`}: {chore.parentTitle ? `${chore.parentTitle}: ${chore.title}` : chore.title}</strong>
                  <div>
                    {[0, 1, 2, 3].map((rating) => (
                      <button
                        className={chore.ratings?.[playerIndex] === rating ? 'rating active' : 'rating'}
                        key={rating}
                        type="button"
                        onClick={() => rateDoneChore(chore.id, rating)}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
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
            <select
              value={mobileExtra.difficulty}
              onChange={(event) => setMobileExtra((current) => ({ ...current, difficulty: event.target.value as Difficulty }))}
            >
              <option value="easy">легко</option>
              <option value="normal">обычно</option>
              <option value="hard">сложно</option>
            </select>
          )}
          <button className="pixel-button alt wide" type="button" onClick={addMobileExtra}>
            Добавить дело
          </button>
        </div>

        <button className="pixel-button start mobile-done" type="button" onClick={finishGame}>
          Завершить
        </button>

        {game.mode === 'childQuest' && (
          <button className="pixel-button alt wide" type="button" onClick={shareLink}>
            Поделиться ссылкой
          </button>
        )}
      </section>
    </main>
  )
}

export default App
