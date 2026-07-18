import QRCode from 'qrcode'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORY_ACHIEVEMENTS,
  type ChildProfile,
  type ChildQuestOutcome,
  computeSkillLevels,
  computeStreak,
  computeCategoryCountsFromChores,
  defaultStarRules,
  filterGamesByMode,
  getAgeLabel,
  getSkillTitle,
  getCategorySkillBonus,
  getActiveSkillBuffs,
  getLevelFromXp,
  xpForNextLevel,
  XP_THRESHOLDS,
  SKILL_TREE,
  starsForTier,
  type StarReward,
  type StarRules,
} from './childProgress'
import { ChildRoomScene } from './ChildRoomScene'
import { applyXpWithRoomProgress, type RoomProgress } from './rooms'
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
  proofPhotoUrl?: string
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
  prize?: string
  prizeTiers?: PrizeTier[]
  targetScore?: number
  childOutcome?: ChildQuestOutcome
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
  childProfiles: ChildProfile[]
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

const defaultLootboxRewards = ['+20xp', '+1 звезда', 'potion']
const lootboxRewardOptions = [
  { value: '+20xp', label: 'Опыт' },
  { value: '+1 звезда', label: 'Звезда' },
  { value: 'potion', label: 'Зелье' },
  { value: 'candy', label: 'Конфетка' },
  { value: 'other', label: 'Другое' },
]
const standardLootboxRewardValues = new Set(lootboxRewardOptions.map((option) => option.value))
const cosmeticSlotLabels: Record<string, string> = {
  hat: 'Голова',
  cloak: 'Плащ',
  staff: 'Посох',
  pet: 'Питомец',
  potion: 'Зелье',
}
const cosmeticItemLabels: Record<string, string> = {
  'hat-crown': 'Корона',
  cloak: 'Плащ героя',
  staff: 'Магический посох',
  'pet-slime': 'Зелёный питомец',
  potion: 'Зелье',
}
const cosmeticUnlocks = [
  { item: 'hat-crown', minLevel: 2, slot: 'hat' },
  { item: 'cloak', minLevel: 3, slot: 'cloak' },
  { item: 'staff', minLevel: 4, slot: 'staff' },
  { item: 'pet-slime', minLevel: 5, slot: 'pet' },
  { item: 'potion', minLevel: 6, slot: 'potion' },
]
const progressionAvatarOptions = ['duck', 'fox', 'cat', 'frog', 'robot', 'wizard', 'dragon', 'ninja', 'queen', 'slime']

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
      childProfiles: Array.isArray(state.childProfiles) ? state.childProfiles : [],
    }
  }
  return {
    ...state,
    leaderboard: state.leaderboard || emptyLeaderboards(),
    childProfiles: Array.isArray(state.childProfiles) ? state.childProfiles : [],
  }
}

const emptyState: ApiState = { activeGames: [], profiles: [], games: [], leaderboard: emptyLeaderboards(), childProfiles: [] }

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



const masterChores: ChoreItem[] = [
  ...defaultChores,
  task('make-bed', 'Заправить кровать', 5, 'easy'),
  task('dishes-quick', 'Помыть посуду после еды', 10),
  task('surfaces', 'Протереть поверхности', 12),
  task('trash-daily', 'Вынести мусор', 5, 'easy'),
  task('dishes-full', 'Полный цикл посуды + посудомойка', 18),
  task('laundry-full', 'Стирка: загрузить + развесить + убрать', 25, 'normal'),
  task('vacuum-rooms', 'Пропылесосить все комнаты', 30, 'hard'),
  task('trash-recycle', 'Мусор + сортировка вторсырья', 12, 'easy'),
  task('bathroom-reset', 'Ванная: протереть + убрать средства', 20),
  task('kitchen-counters', 'Кухня: столешницы + плита + вынести мусор', 22),
  task('fridge-check', 'Проверить холодильник: просрочка + протереть', 15, 'normal'),
  task('car-wash', 'Помыть машину снаружи или внутри', 35, 'hard'),
  task('grocery-help', 'Помочь с продуктами: занести + разложить', 15),
  task('room-reset', 'Своя комната: убрать поверхность + пылесос', 25),
  task('windows', 'Помыть окна / зеркала', 30, 'hard'),
  task('fridge-deep', 'Разобрать холодильник', 35, 'hard'),
];

const templateSelections: Record<string, string[]> = {
  'weekend': ['dishes', 'bathroom-group', 'kitchen', 'vacuum', 'laundry', 'wardrobe', 'trash', 'dust'],
  'daily': ['make-bed', 'dishes-quick', 'surfaces', 'trash-daily'],
  'teen': ['dishes-full', 'laundry-full', 'vacuum-rooms', 'trash-recycle', 'bathroom-reset', 'kitchen-counters', 'fridge-check', 'car-wash', 'grocery-help', 'room-reset'],
  'deep': ['dishes', 'bathroom-group', 'kitchen', 'vacuum', 'laundry', 'wardrobe', 'trash', 'dust', 'windows', 'fridge-deep'],
  'minimal': ['dishes', 'trash', 'vacuum'],
};



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

const computePlayerScore = (assigned: AssignedChore[], playerIndex: number, requirePhoto = false): PlayerScore => {
  const completed = assigned.filter((chore) => {
    const baseOk = chore.assignedTo === playerIndex && isCompleted(chore) && (!chore.extra || chore.approved)
    if (requirePhoto && chore.proofPhotoUrl) {
      return baseOk && chore.approved
    }
    return baseOk
  })
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

const numberInputValue = (value: number | undefined) => (Number.isFinite(value) && Number(value) !== 0 ? String(value) : '')
const numberFromInput = (value: string) => (value === '' ? 0 : Number(value))

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

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

function App() {
  const childRoute = window.location.pathname.match(/^\/child\/([^/]+)\/?$/)
  if (childRoute) {
    return <ChildCabinetPage profileId={decodeURIComponent(childRoute[1])} />
  }
  const childDefaultPlayerRoute = window.location.pathname.match(/^\/player\/([^/]+)\/?$/)
  if (childDefaultPlayerRoute) {
    return <MobilePlayerPage playerIndex={0} sessionId={decodeURIComponent(childDefaultPlayerRoute[1])} />
  }
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
  const [playOnStars, setPlayOnStars] = useState(() => readLocalJson<'stars' | 'prizes'>('wcq-child-reward-mode', 'stars') === 'stars')
  const [childProfileModalMode, setChildProfileModalMode] = useState<'create' | 'edit' | null>(null)
  const [playFx, setPlayFx] = useState<{ playerIndex: number; coins: number; id: number } | null>(null)
  const [rewardModeEditorOpen, setRewardModeEditorOpen] = useState(false)
  const [targetScore, setTargetScore] = useState(() => readLocalJson<number>('wcq-target-score', 120))
  const [extraChore, setExtraChore] = useState({ assignedTo: 0, title: '', minutes: 10, difficulty: 'normal' as Difficulty, rating: 2 })
  const [extraReviews, setExtraReviews] = useState<Record<string, { difficulty: Difficulty; rating: number }>>({})
  const [chores, setChores] = useState<ChoreItem[]>(() => masterChores.map(c => ({...c, enabled: c.enabled !== false})))
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
  const [newCategoryIcon, setNewCategoryIcon] = useState('storage')
  const [selectedChildProfileId, setSelectedChildProfileId] = useState(() => readLocalJson<string>('wcq-child-profile-id', ''))
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
    writeLocalJson('wcq-child-reward-mode', playOnStars ? 'stars' : 'prizes')
  }, [playOnStars])

  useEffect(() => {
    writeLocalJson('wcq-target-score', targetScore)
  }, [targetScore])

  useEffect(() => {
    writeLocalJson('wcq-active-game-id', activeGameId)
  }, [activeGameId])

  useEffect(() => {
    writeLocalJson('wcq-child-profile-id', selectedChildProfileId)
  }, [selectedChildProfileId])

  useEffect(() => {
    if (!childProfileModalMode) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [childProfileModalMode])

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
  const currentPairModeGames = useMemo(
    () => filterGamesByMode(currentPairAllGames, gameMode),
    [currentPairAllGames, gameMode],
  )
  const activeChildProfile = useMemo(
    () => remoteState.childProfiles.find((profile) => profile.id === selectedChildProfileId) || null,
    [remoteState.childProfiles, selectedChildProfileId],
  )
  const parentChildProfiles = useMemo(
    () =>
      remoteState.childProfiles.filter(
        (profile) => !pairEmail || profile.parentEmail === normalizeEmail(pairEmail),
      ),
    [remoteState.childProfiles, pairEmail],
  )

  useEffect(() => {
    if (gameMode === 'childQuest' && !selectedChildProfileId && parentChildProfiles.length) {
      setSelectedChildProfileId(parentChildProfiles[0].id)
    }
  }, [gameMode, parentChildProfiles, selectedChildProfileId])

  useEffect(() => {
    if (gameMode !== 'childQuest' || !activeChildProfile) return
    setPlayers([
      {
        email: activeChildProfile.childEmail,
        name: activeChildProfile.name,
        avatar: activeChildProfile.avatar,
        avatarUrl: activeChildProfile.avatarUrl,
        isChild: true,
      },
    ])
  }, [activeChildProfile, gameMode])

  const currentPairBoard = remoteState.leaderboard[gameMode].find((entry) => entry.pairKey === currentPairKey)
  const currentActiveGame = remoteState.activeGames.find((game) => game.pairKey === currentPairKey)

  const scoreFor = useCallback((playerIndex: number): PlayerScore => computePlayerScore(assigned, playerIndex, gameMode === 'childQuest' && requirePhotoProof), [assigned, gameMode, requirePhotoProof])

  const playerScores = players.map((_, index) => scoreFor(index))
  const childCoins = useMemo(() => {
    if (gameMode !== 'childQuest' || childPlayerIndex < 0 || !activeChildProfile) return 0
    const skills = activeChildProfile.skillLevels || {}
    return assigned
      .filter((chore) => chore.assignedTo === childPlayerIndex && isCompleted(chore) && (!requirePhotoProof || chore.approved))
      .reduce((sum, chore) => {
        const base = choreBasePoints(chore)
        // Determine rough category from title
        const titleLower = (chore.parentTitle || chore.title || '').toLowerCase()
        let cat = 'storage'
        if (titleLower.includes('кух') || titleLower.includes('посуд')) cat = 'kitchen'
        else if (titleLower.includes('ванн') || titleLower.includes('туал') || titleLower.includes('раков')) cat = 'bath'
        else if (titleLower.includes('спаль')) cat = 'bedroom'
        else if (titleLower.includes('гостин') || titleLower.includes('комнат')) cat = 'living'
        else if (titleLower.includes('прихож') || titleLower.includes('корид')) cat = 'hall'
        else if (titleLower.includes('сад') || titleLower.includes('двор') || titleLower.includes('улиц')) cat = 'garden'

        const bonus = getCategorySkillBonus ? getCategorySkillBonus(cat, skills).coinBonus : 0
        return sum + base + bonus
      }, 0)
  }, [assigned, childPlayerIndex, gameMode, activeChildProfile, requirePhotoProof])
  const childTier = gameMode === 'childQuest' ? getTierFromScore(childCoins, targetScore) : 'none'
  const activeBuffs = gameMode === 'childQuest' && activeChildProfile ? getActiveSkillBuffs(activeChildProfile.skillLevels || {}) : []
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
    const state = normalizeApiState(await api<ApiState>('/api/state'))
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
    const dataUrl = await fileToDataUrl(file)
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

  const addChore = (groupId?: string) => {
    const title = newChore.title.trim()
    if (!title) return
    if (groupId) {
      setChores((current) =>
        current.map((item) =>
          isGroup(item) && item.id === groupId
            ? {
                ...item,
                children: [
                  ...item.children,
                  { ...newChore, id: makeId(), title, enabled: true, section: item.section || currentSection },
                ],
              }
            : item,
        ),
      )
    } else {
      setChores((current) => [...current, { ...newChore, id: makeId(), title, enabled: true, section: currentSection }])
    }
    setNewChore({ title: '', minutes: 15, difficulty: 'normal' })
  }

  const addCategory = () => {
    const title = newCategoryTitle.trim()
    if (!title) return
    setChores((current) => [
      ...current,
      { id: makeId(), title, enabled: true, icon: newCategoryIcon, section: currentSection, children: [] },
    ])
    setNewCategoryTitle('')
    setNewCategoryIcon('storage')
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

  const loadTemplate = (key: string) => {
    const isTeenProfile = remoteState.childProfiles.find(p => p.id === selectedChildProfileId)?.ageGroup === 'teen'
    const isTeen = isTeenProfile || key === 'teen'
    const selectedIds = templateSelections[key] || templateSelections['weekend']
    const nextSections = key === 'daily' ? ['Быстрый сброс'] : key === 'teen' ? ['Самостоятельность', 'Дом'] : key === 'deep' ? ['Глубокая уборка'] : key === 'minimal' ? ['Мини-квест'] : defaultSections
    setChores(masterChores.map(item => {
      if (!isGroup(item)) {
        return { ...item, enabled: selectedIds.includes(item.id) }
      }
      return {
        ...item,
        enabled: item.children.some(c => selectedIds.includes(c.id)),
        children: item.children.map(c => ({ ...c, enabled: selectedIds.includes(c.id) }))
      }
    }))
    setSections(nextSections)
    setCurrentSection(nextSections[0] || defaultSections[0])
    setStartHints([])
    if (key === 'teen' || isTeen) {
      if (gameMode !== 'childQuest') switchGameMode('childQuest')
      setStatus('Загружен шаблон для подростка. Отлично для самостоятельности!')
    } else {
      setStatus(`Загружен шаблон: ${key}`)
    }
  }

  const loadRecurring = () => {
    const lastGame = currentPairModeGames[0]
    if (!lastGame?.chores?.length) {
      setStatus('Нет прошлых игр для повтора.')
      return
    }
    const recurringChores = lastGame.chores.filter(c => c.completed).slice(0, 8).map((c, i) => ({
      id: `rec-${Date.now()}-${i}`,
      title: c.title || c.parentTitle || 'Дело',
      minutes: c.minutes || 15,
      difficulty: c.difficulty || 'normal',
      enabled: true,
      section: currentSection,
    }))
    setChores((prev) => [...prev, ...recurringChores])
    setStatus('Добавлены повторяющиеся дела из прошлой игры!')
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

  const clearActiveGame = async (gameId: string) => {
    try {
      const result = await api<{ state: ApiState }>(`/api/active-games/${gameId}`, { method: 'DELETE' })
      setRemoteState(normalizeApiState(result.state))
      if (activeGameId === gameId) setActiveGameId('')
      setStatus('Активная игра закрыта. Можно запускать новую.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось закрыть активную игру.')
    }
  }

  const dismissOnboarding = () => {
    writeLocalJson('wcq-onboarding-dismissed', true)
    setShowOnboarding(false)
  }

  const getStartBlockers = () => {
    const blockers: string[] = []
    if (!selectedTasks.length) blockers.push('chores')
    if (gameMode === 'childQuest') {
      if (!activeChildProfile) blockers.push('child-profile')
      if (!playOnStars) {
        if (!prizeTiers.find((tier) => tier.id === 'gold')?.label.trim()) blockers.push('gold-prize')
      }
    } else if (!prize.trim()) {
      blockers.push('prize')
    }
    if (!normalizeEmail(pairEmail).includes('@')) blockers.push('email')
    return blockers
  }

  const scrollToStartBlocker = (blockers: string[]) => {
    const first = ['email', 'child-profile', 'child-name', 'chores', 'gold-prize', 'prize'].find((key) => blockers.includes(key))
    if (!first) return
    window.setTimeout(() => {
      document.querySelector(`[data-start-field="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }

  const handleStartClick = () => {
    const blockers = getStartBlockers()
    setStartHints(blockers)
    if (blockers.length) {
      if (blockers.includes('email')) setStatus('Введите почту, чтобы сохранить игру в историю.')
      else if (blockers.includes('child-profile')) setStatus('Сначала добавьте или выберите ребёнка для квеста.')
      else if (blockers.includes('chores')) setStatus('Выберите хотя бы одно дело в списке.')
      else if (blockers.includes('gold-prize')) setStatus('Укажите приз за золото (1 место).')
      else if (blockers.includes('child-name')) setStatus('Введите имя ребёнка.')
      else if (blockers.includes('prize')) setStatus('Укажите приз или награду.')
      scrollToStartBlocker(blockers)
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
      if (!activeChildProfile) {
        setStatus('Сначала добавьте или выберите ребёнка для квеста.')
        return
      }
      if (!playOnStars && !prizeTiers.find((tier) => tier.id === 'gold')?.label.trim()) {
        setStatus('Укажите приз за золото (1 место).')
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
          prize: gameMode === 'childQuest' ? (!playOnStars ? prizeTiers.find((tier) => tier.id === 'gold')?.label || '' : '') : prize,
          prizeTiers: gameMode === 'childQuest' && !playOnStars ? prizeTiers : undefined,
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

  const triggerPlayFx = useCallback((playerIndex: number, coins: number) => {
    const id = Date.now()
    setPlayFx({ playerIndex, coins, id })
    window.setTimeout(() => {
      setPlayFx((current) => (current?.id === id ? null : current))
    }, 900)
  }, [])

  const completeNextFor = useCallback(
    async (playerIndex: number, choreId?: string) => {
      if (phase !== 'play') return
      const triggerForChore = (chore?: AssignedChore) => {
        if (!chore || chore.completed) return
        triggerPlayFx(playerIndex, choreBasePoints(chore))
      }
      if (activeGameId) {
        try {
          const before = assigned.find((chore) =>
            choreId
              ? chore.id === choreId && chore.assignedTo === playerIndex
              : chore.assignedTo === playerIndex && !chore.completed,
          )
          const result = await api<{ game: ActiveGame }>(`/api/active-games/${activeGameId}/complete`, {
            body: JSON.stringify({ choreId, playerIndex }),
            method: 'POST',
          })
          triggerForChore(before)
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
        triggerPlayFx(playerIndex, choreBasePoints(target))
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
    [activeGameId, assigned, phase, roundStartedAt, triggerPlayFx],
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

  const approvePhotoFromMain = (choreId: string) => {
    // fallback local update if no active id
    setAssigned((current) => current.map((chore) => (chore.id === choreId ? { ...chore, approved: true } : chore)))
    if (activeGameId) {
      fetch(`/api/active-games/${activeGameId}/approve-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choreId }),
      }).then(() => setStatus('Фото подтверждено!')).catch(() => {})
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
      const childOutcome =
        gameMode === 'childQuest' && activeChildProfile
          ? {
              childProfileId: activeChildProfile.id,
              childEmail: normalizeEmail(gamePlayers[0]?.email || ''),
              coins: childCoins,
              targetScore,
              tier: childTier,
              prizeLabel: playOnStars ? '' : prizeTiers.find((tier) => tier.id === childTier)?.label || '',
              starsEarned: playOnStars ? starsForTier(childTier, activeChildProfile.starRules || defaultStarRules) : 0,
              choresCompleted: assigned.filter((chore) => chore.completed).length,
            }
          : undefined
      const result = await api<{ game: GameRecord; state: ApiState }>('/api/games', {
        body: JSON.stringify({
          players: gamePlayers.map((player, index) => ({
            ...player,
            email: normalizeEmail(player.email),
            isChild: Boolean(players[index]?.isChild),
          })),
          winnerEmail,
          mode: gameMode,
          prize: gameMode === 'childQuest' ? (!playOnStars ? prizeTiers.find((tier) => tier.id === childTier)?.label || prize : '') : prize,
          prizeTiers: gameMode === 'childQuest' && !playOnStars ? prizeTiers : undefined,
          childOutcome,
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
      setStatus(
        gameMode === 'childQuest' && childOutcome?.starsEarned
          ? `Игра сохранена. Ребёнок получил ${childOutcome.starsEarned} звёзд.`
          : 'Игра сохранена в историю.',
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить игру.')
    }
  }

  const saveChildProfile = async (patch: Partial<ChildProfile> & { create?: boolean }) => {
    if (!pairEmail.trim()) {
      setStatus('Сначала укажите почту семьи.')
      return false
    }
    if (patch.create) {
      const name = patch.name || players[0]?.name || '';
      const avatar = patch.avatar || players[0]?.avatar || 'duck';
      const dup = parentChildProfiles.find(p => p.name.toLowerCase() === name.toLowerCase() && p.avatar === avatar);
      if (dup) {
        setStatus('Такой ребенок уже есть, дубли не разрешены.');
        return false;
      }
    }
    try {
      const childEmail = normalizeEmail(gamePlayers[0]?.email || pairPlayerEmail(pairEmail, 0))
      const result = await api<{ profile: ChildProfile; state: ApiState }>('/api/child-profiles', {
        body: JSON.stringify({
          id: patch.create ? undefined : selectedChildProfileId || undefined,
          parentEmail: normalizeEmail(pairEmail),
          childEmail,
          name: players[0]?.name || 'Ребёнок',
          avatar: players[0]?.avatar || 'duck',
          avatarUrl: players[0]?.avatarUrl || '',
          starRules: activeChildProfile?.starRules || defaultStarRules,
          rewards: activeChildProfile?.rewards,
          ...patch,
        }),
        method: 'POST',
      })
      setRemoteState(normalizeApiState(result.state))
      if (patch.create) setSelectedChildProfileId(result.profile.id)
      setPlayers([{ email: result.profile.childEmail, name: result.profile.name, avatar: result.profile.avatar, avatarUrl: result.profile.avatarUrl, isChild: true }])
      setStatus('Профиль сохранён!')
      return true
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить профиль ребёнка.')
      return false
    }
  }

  const copyChildCabinetLink = async (profileId = selectedChildProfileId) => {
    if (!profileId) {
      setStatus('Сначала сохраните профиль ребёнка.')
      return
    }
    const link = `${getShareOrigin()}/child/${profileId}`
    await copyText(link)
    setStatus('Ссылка на кабинет ребёнка скопирована.')
  }

  return (
    <main className="game-shell">
      {status && <p className="app-toast">{status}</p>}
      <header className="topbar pixel-panel">
        <div>
          <h1>Tidy Titans</h1>
          <p className="app-subtitle">Уборка как игра</p>
          <label className={`pair-email-label ${startHints.includes('email') ? 'field-error' : ''}`} data-start-field="email">
            Введите почту, чтобы сохранить или загрузить игру
            <span className="email-load-row">
              <input
                placeholder="семья@example.com"
                value={pairEmail}
                onChange={(event) => setPairEmail(event.target.value)}
              />
              <button className="pixel-button alt" type="button" onClick={loadPairByEmail}>
                Загрузить
              </button>
            </span>
          </label>
          {currentActiveGame && phase === 'setup' && (
            <div className="active-game-actions">
              <button className="pixel-button resume-button" type="button" onClick={() => openActiveGame(currentActiveGame.id)}>
                Продолжить активную игру
              </button>
              <button className="tiny-button danger" type="button" onClick={() => clearActiveGame(currentActiveGame.id)}>
                Завершить активную игру
              </button>
            </div>
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
            childProfile={activeChildProfile}
            gameMode={gameMode}
            pairGames={currentPairModeGames}
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
              <h2>{gameMode === 'childQuest' ? 'Настройки игры' : 'Профили игроков'}</h2>
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
                    value={numberInputValue(targetScore)}
                    onChange={(event) => setTargetScore(numberFromInput(event.target.value))}
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
                <div className={`child-setup-block ${startHints.includes('child-profile') ? 'field-error' : ''}`} data-start-field="child-profile">
                  <p className="hint">
                    Один персонаж — ребёнок. Цель: <strong>{recommendedScore}</strong> монет (считается из выбранных дел).
                  </p>
                  {parentChildProfiles.length === 0 ? (
                    <div className="child-empty-card">
                      <strong>Профилей детей пока нет</strong>
                      <span>Для квеста нужен один профиль ребёнка. Все настройки откроются в отдельном окне.</span>
                      <button className="pixel-button alt" type="button" onClick={() => setChildProfileModalMode('create')}>
                        Добавить ребёнка
                      </button>
                    </div>
                  ) : (
                    <div className="child-profile-picker">
                      <div className="child-profile-card-list">
                        {parentChildProfiles.map((profile) => (
                          <div
                            className={selectedChildProfileId === profile.id ? 'child-profile-chip-wrap active' : 'child-profile-chip-wrap'}
                            key={profile.id}
                          >
                            <button
                              className={selectedChildProfileId === profile.id ? 'child-profile-chip active' : 'child-profile-chip'}
                              type="button"
                              onClick={() => setSelectedChildProfileId(profile.id)}
                            >
                              <PixelAvatar avatar={profile.avatar} avatarUrl={profile.avatarUrl} small />
                              <span>
                                <strong>{profile.name}</strong>
                                <small>{profile.ageGroup === 'teen' ? 'Подросток' : 'Ребёнок'}</small>
                              </span>
                            </button>
                            <button
                              className="tiny-button child-profile-copy-link"
                              type="button"
                              title="Скопировать ссылку на профиль"
                              onClick={(event) => {
                                event.stopPropagation()
                                void copyChildCabinetLink(profile.id)
                              }}
                            >
                              Ссылка
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="child-profile-actions">
                        <button className="tiny-button" type="button" onClick={() => setChildProfileModalMode('create')}>
                          Добавить ребёнка
                        </button>
                        <button className="tiny-button alt" disabled={!selectedChildProfileId} type="button" onClick={() => setChildProfileModalMode('edit')}>
                          Настройки профиля
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {childProfileModalMode && (
                <div className="modal-backdrop" role="dialog" aria-modal="true">
                  <article className="pixel-panel child-profile-modal">
                    <button className="modal-close-button" type="button" onClick={() => setChildProfileModalMode(null)} aria-label="Закрыть">
                      ×
                    </button>
                    <ChildProfileManager
                      childProfile={childProfileModalMode === 'create' ? null : activeChildProfile}
                      childProfiles={parentChildProfiles}
                      isFirstProfile={parentChildProfiles.length === 0}
                      mode={childProfileModalMode}
                      onCopyLink={copyChildCabinetLink}
                      onSave={saveChildProfile}
                      onSelectProfile={setSelectedChildProfileId}
                      selectedProfileId={childProfileModalMode === 'create' ? '' : selectedChildProfileId}
                    />
                  </article>
                </div>
              )}
            </div>
            {gameMode !== 'childQuest' && <div className="players-editor">
              {players.slice(0, gameMode === 'solo' ? 1 : players.length).map((player, index) => (
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
                  nameLabel="Имя героя"
                  highlightName={startHints.includes('child-name')}
                />
              ))}
            </div>}
            {gameMode === 'duo' && (
              <button className="pixel-button alt wide" type="button" onClick={addPlayer}>
                Добавить персонажа
              </button>
            )}
          </article>

          <ModeSummaryPanel
            childProfile={activeChildProfile}
            gameMode={gameMode}
            games={currentPairModeGames}
            onOpenStats={goToStats}
            pairBoard={currentPairBoard}
            players={players}
            gamePlayers={gamePlayers}
          />

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
                value={numberInputValue(roundMinutes)}
                onChange={(event) => setRoundMinutes(numberFromInput(event.target.value))}
              />
            </label>
            <p className="hint">Время нужно только для ориентира и распределения. Игра завершается только когда вы сами переходите к оценкам.</p>
          </article>

          <ChoreLibrary
            className={showOnboarding ? 'tour-chores' : ''}
            chores={sectionChores}
            currentSection={currentSection}
            newCategoryIcon={newCategoryIcon}
            newCategoryTitle={newCategoryTitle}
            newChore={newChore}
            newSectionTitle={newSectionTitle}
            onAddCategory={addCategory}
            onAddChild={addChild}
            onAddChore={addChore}
            onAddSection={addSection}
            onDeleteItem={deleteItem}
            onLoadTemplate={loadTemplate}
            onNewCategoryIcon={setNewCategoryIcon}
            onNewCategoryTitle={setNewCategoryTitle}
            onNewChore={setNewChore}
            onNewSectionTitle={setNewSectionTitle}
            onSectionChange={setCurrentSection}
            onUpdateItem={updateItem}
            sections={sections}
          />
          <div className="chore-quick-actions">
            <button type="button" className="tiny-button" onClick={loadRecurring}>Повторить дела из прошлой уборки</button>
            {gameMode === 'childQuest' && (
              <button
                className={requirePhotoProof ? 'photo-proof-toggle is-on' : 'photo-proof-toggle'}
                type="button"
                onClick={() => setRequirePhotoProof((current) => !current)}
              >
                <span className="pixel-check-box" aria-hidden>{requirePhotoProof ? '✓' : ''}</span>
                Нужны фото
              </button>
            )}
          </div>

          {gameMode !== 'childQuest' && (
            <button
              className={`stats-nav-card pixel-panel ${showOnboarding ? 'tour-dashboard' : ''}`}
              type="button"
              onClick={goToStats}
            >
              <div className="panel-title stats-nav-title">
                <span>4</span>
                <div>
                  <h2>{gameMode === 'solo' ? 'Моя история и статистика' : 'История пары и статистика'}</h2>
                  <p className="hint">
                    {gameMode === 'solo'
                      ? 'Когда играл, что делал и что давно не повторял'
                      : 'Кто что делает чаще и история ваших игр'}
                  </p>
                </div>
              </div>
              <span aria-hidden className="stats-nav-arrow">
                →
              </span>
            </button>
          )}

          <article className={`pixel-panel start-card ${showOnboarding ? 'tour-start' : ''}`}>
            <h2>Готовы к уборке?</h2>
            <div className="start-card-body">
              <p className={startHints.includes('chores') ? 'start-hint-error' : ''} data-start-field="chores">
                Выбрано дел: <strong>{selectedTasks.length}</strong>.{' '}
                {gameMode === 'childQuest'
                  ? `Цель ребёнка: ${recommendedScore} монет.`
                  : gameMode === 'solo'
                    ? `Цель: ${targetScore} очков.`
                    : 'Можно распределить целую категорию, а игра сама разорвёт её, если лимит времени не даёт отдать всё одному.'}
              </p>
              {gameMode !== 'childQuest' && (
                <label className={startHints.includes('prize') ? 'field-error' : ''} data-start-field="prize">
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
                <div className={`child-reward-mode-panel ${startHints.includes('gold-prize') ? 'field-error' : ''}`} data-start-field="gold-prize">
                  {!rewardModeEditorOpen ? (
                    <p className="hint">
                      {playOnStars && activeChildProfile
                        ? `Игра на звёзды: золото ${activeChildProfile.starRules?.gold || 3}★, серебро ${activeChildProfile.starRules?.silver || 2}★, бронза ${activeChildProfile.starRules?.bronze || 1}★.`
                        : playOnStars
                          ? 'Игра на звёзды. Сначала выберите ребёнка, чтобы взять его правила звёзд.'
                          : `Игра на призы: золото — ${prizeTiers.find((tier) => tier.id === 'gold')?.label || 'не заполнено'}.`}
                      {' '}
                      <button className="tiny-button" type="button" onClick={() => setRewardModeEditorOpen(true)}>
                        Изменить
                      </button>
                    </p>
                  ) : (
                    <div className="reward-mode-editor">
                      <div className="reward-mode-buttons">
                        <button className={playOnStars ? 'pixel-button active' : 'pixel-button alt'} type="button" onClick={() => setPlayOnStars(true)}>
                          На звёзды
                        </button>
                        <button className={!playOnStars ? 'pixel-button active' : 'pixel-button alt'} type="button" onClick={() => setPlayOnStars(false)}>
                          На призы
                        </button>
                      </div>
                      {playOnStars ? (
                        <p className="hint">
                          Будут начисляться звёзды из профиля ребёнка: золото {activeChildProfile?.starRules?.gold || 3}★, серебро {activeChildProfile?.starRules?.silver || 2}★, бронза {activeChildProfile?.starRules?.bronze || 1}★.
                        </p>
                      ) : (
                        <div className="tier-prize-grid start-prize-grid">
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
                      <button className="tiny-button" type="button" onClick={() => setRewardModeEditorOpen(false)}>
                        Готово
                      </button>
                    </div>
                  )}
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
              {gameMode === 'childQuest' && activeBuffs.length > 0 && (
                <small style={{fontSize: '10px', opacity: 0.7}}>Баффы: {activeBuffs.slice(0,2).join(', ')}</small>
              )}
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
              const fxActive = playFx?.playerIndex === playerIndex
              return (
                <article className={`pixel-panel player-board ${fxActive ? 'play-fx-active' : ''}`} key={playerIndex}>
                  <div className={`player-card ${fxActive ? 'avatar-celebrate' : ''}`}>
                    <PixelAvatar avatar={players[playerIndex].avatar} avatarUrl={players[playerIndex].avatarUrl} />
                    <div>
                      <h2>{players[playerIndex].name || `Игрок ${playerIndex + 1}`}</h2>
                      <p>
                        {done}/{plan.length} дел · {totalMinutes} мин · текущие очки {playerScores[playerIndex]?.total || 0}
                      </p>
                    </div>
                    {fxActive && (
                      <span className="coin-float" key={playFx.id}>
                        +{playFx.coins}
                      </span>
                    )}
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
                        className={chore.completed ? 'quest done quest-spark' : 'quest'}
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
                          {gameMode === 'childQuest' && requirePhotoProof && !chore.proofPhotoUrl ? ' · ждёт фото' : ''}
                        </small>
                        {chore.proofPhotoUrl && (
                          <img alt="Фото подтверждения" className="proof-thumb board-proof-thumb" src={chore.proofPhotoUrl} />
                        )}
                        {gameMode === 'childQuest' && requirePhotoProof && chore.proofPhotoUrl && !chore.approved && (
                          <button className="tiny-button" type="button" onClick={() => approvePhotoFromMain(chore.id)}>
                            ✓ Подтвердить фото
                          </button>
                        )}
                      </button>
                    ))}
                  </div>
                  {gameMode === 'childQuest' && requirePhotoProof && plan.some(c => c.proofPhotoUrl && !c.approved) && (
                    <div className="pixel-panel" style={{marginTop: 12, padding: 12}}>
                      <strong>Фото на подтверждение (можно в любое время до завершения):</strong>
                      {plan.filter(c => c.proofPhotoUrl && !c.approved).map(c => (
                        <div key={c.id} style={{display:'flex', alignItems:'center', gap:8, margin: '6px 0'}}>
                          <img src={c.proofPhotoUrl} alt="" style={{width:48, height:48, objectFit:'cover', border: '2px solid #000'}} />
                          <span>{c.title}</span>
                          <button className="tiny-button" onClick={() => approvePhotoFromMain(c.id)}>Подтвердить</button>
                        </div>
                      ))}
                    </div>
                  )}
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
          <article className="pixel-panel certificate ceremony-burst">
            <div className="confetti" />
            <div className="confetti confetti-layer-2" />
            {gameMode === 'childQuest' && childTier !== 'none' && (
              <div className="ceremony-medal medal-spin">
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

const computeChoreStatsForGames = (games: GameRecord[]): ChoreStat[] => {
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
      byPlayer: stat.byPlayer,
    }))
    .sort((a, b) => b.total - a.total)
}

const computeRecentChoreTitles = (games: GameRecord[]) => {
  const seen = new Map<string, string>()
  for (const game of games) {
    for (const chore of game.chores || []) {
      if (!chore.completed) continue
      const key = chore.title.trim().toLowerCase()
      if (!seen.has(key)) seen.set(key, game.finishedAt)
    }
  }
  return [...seen.entries()]
    .map(([title, finishedAt]) => ({ title, finishedAt }))
    .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())
}

function RoomIcon({ icon, label = '' }: { icon: string; label?: string }) {
  const symbolId = icon === 'outside' ? 'garden' : icon === 'wardrobe' ? 'bedroom' : icon === 'garage' ? 'storage' : icon === 'dining' ? 'kitchen' : icon === 'toilet' ? 'bath' : icon
  return (
    <svg aria-label={label} className={`room-icon ${symbolId}`} role="img">
      {label && <title>{label}</title>}
      <use href={`/sprites/skill-icons.svg#${symbolId}`} />
    </svg>
  )
}

function AchievementBadge({
  achievement,
  unlocked,
}: {
  achievement: (typeof CATEGORY_ACHIEVEMENTS)[number]
  unlocked: boolean
}) {
  return (
    <div className={unlocked ? 'achievement-badge unlocked' : 'achievement-badge'}>
      <div className="achievement-badge-frame">
        <svg className={`achievement-icon achievement-icon-${achievement.icon}`} role="img" aria-label={achievement.title}>
          <use href={`/sprites/achievement-icons.svg#${achievement.icon}`} />
        </svg>
        <span className="achievement-ribbon" aria-hidden>★</span>
      </div>
    </div>
  )
}

function StarSprite({ small = false }: { small?: boolean }) {
  return <img alt="" className={small ? 'star-sprite small' : 'star-sprite'} src="/sprites/star.svg" />
}

function ModeSummaryPanel({
  childProfile,
  gameMode,
  games,
  onOpenStats,
  pairBoard,
  players,
  gamePlayers,
}: {
  childProfile: ChildProfile | null
  gameMode: GameMode
  games: GameRecord[]
  onOpenStats: () => void
  pairBoard?: PairLeaderboard
  players: Player[]
  gamePlayers: Player[]
}) {
  const recentStats = useMemo(() => computeChoreStatsForGames(games).slice(0, 3), [games])
  return (
    <aside className="pixel-panel stats-panel mode-summary-panel">
      <div className="panel-title">
        <span>★</span>
        <h2>
          {gameMode === 'childQuest' ? 'Прогресс ребёнка' : gameMode === 'solo' ? 'Моя статистика' : 'Статистика пары'}
        </h2>
      </div>
      {gameMode === 'childQuest' ? (
        childProfile ? (
          <div className="pair-stats child-summary">
            <div className="child-summary-stars">
              <StarSprite small />
              <strong>{childProfile.starBalance}</strong>
              <span>звёзд накоплено</span>
            </div>
            <p>
              Квестов: {childProfile.totalQuests} · Ачивок: {childProfile.achievementIds.length}
            </p>
            <p className="hint">Следующая награда: {childProfile.rewards.find((reward) => !reward.redeemedAt && childProfile.starBalance >= reward.starsRequired)?.label || 'задайте в профиле'}</p>
          </div>
        ) : (
          <p className="hint">Сохраните профиль ребёнка, чтобы копить звёзды между квестами.</p>
        )
      ) : gameMode === 'solo' ? (
        <div className="pair-stats">
          <strong>{games.length} игр</strong>
          <p>Закрыто дел: {games.reduce((sum, game) => sum + (game.scores[0]?.count || 0), 0)}</p>
          {recentStats.slice(0, 2).map((stat) => (
            <p key={stat.title}>
              {stat.title}: {stat.total}×
            </p>
          ))}
          {!games.length && <p className="hint">После первой сохранённой игры здесь появится история дел.</p>}
        </div>
      ) : pairBoard ? (
        <div className="pair-stats">
          <strong>{pairBoard.games} игр</strong>
          <p>
            Закрыто дел: {pairBoard.totalChores} · Общий счёт: {pairBoard.totalScore}
          </p>
          {players.map((player, index) => (
            <p key={player.email}>
              {player.name}: побед {pairBoard.wins[normalizeEmail(gamePlayers[index]?.email || '')] || 0}
            </p>
          ))}
        </div>
      ) : (
        <p className="hint">Прошлых игр пока нет.</p>
      )}
      <button className="pixel-button alt wide" type="button" onClick={onOpenStats}>
        Открыть подробную статистику →
      </button>
    </aside>
  )
}

function ChildProfileManager({
  childProfile,
  childProfiles,
  isFirstProfile,
  mode,
  onCopyLink,
  onSave,
  onSelectProfile,
  selectedProfileId,
}: {
  childProfile: ChildProfile | null
  childProfiles: ChildProfile[]
  isFirstProfile: boolean
  mode: 'create' | 'edit'
  onCopyLink: () => void
  onSave: (patch: Partial<ChildProfile> & { create?: boolean }) => Promise<boolean>
  onSelectProfile: (id: string) => void
  selectedProfileId: string
}) {
  const [profileName, setProfileName] = useState(childProfile?.name || '')
  const [starRules, setStarRules] = useState<StarRules>(childProfile?.starRules || defaultStarRules)
  const [rewards, setRewards] = useState<StarReward[]>(childProfile?.rewards || [])
  const [ageGroup, setAgeGroup] = useState<'kid' | 'teen'>(childProfile?.ageGroup || 'kid')
  const [goalLabel, setGoalLabel] = useState(childProfile?.currentGoal?.label || '')
  const [goalTarget, setGoalTarget] = useState(childProfile?.currentGoal?.starsTarget || 30)
  const [regularTasks, setRegularTasks] = useState<NonNullable<ChildProfile['regularTasks']>>(childProfile?.regularTasks || [])
  const [lootboxRewards, setLootboxRewards] = useState<string[]>(childProfile?.lootboxRewards?.length ? childProfile.lootboxRewards : defaultLootboxRewards)
  const [otherLootboxText, setOtherLootboxText] = useState('')
  const [customLootboxRewards, setCustomLootboxRewards] = useState<string[]>([])
  const [parentPin, setParentPin] = useState('')
  const [saveNotice, setSaveNotice] = useState(false)

  useEffect(() => {
    setProfileName(childProfile?.name || '')
    setStarRules(childProfile?.starRules || defaultStarRules)
    setRewards(childProfile?.rewards || [])
    setAgeGroup(childProfile?.ageGroup || 'kid')
    setGoalLabel(childProfile?.currentGoal?.label || '')
    setGoalTarget(childProfile?.currentGoal?.starsTarget || 30)
    setRegularTasks(childProfile?.regularTasks || [])
    const savedLootboxRewards = childProfile?.lootboxRewards?.length ? childProfile.lootboxRewards : defaultLootboxRewards
    const standardRewards = savedLootboxRewards.filter((reward) => standardLootboxRewardValues.has(reward))
    const otherReward = savedLootboxRewards.find((reward) => reward.startsWith('Другое:'))
    setLootboxRewards([
      ...standardRewards,
      ...(otherReward ? ['other'] : []),
    ])
    setOtherLootboxText(otherReward ? otherReward.replace(/^Другое:\s*/, '') : '')
    setCustomLootboxRewards(savedLootboxRewards.filter((reward) => !standardLootboxRewardValues.has(reward) && !reward.startsWith('Другое:')))
    setSaveNotice(false)
  }, [childProfile])

  const saveProfileSettings = async () => {
    if (!profileName.trim()) {
      window.alert('Введите имя ребёнка.')
      return
    }
    if (mode === 'create' && isFirstProfile && parentPin.trim().length < 4) {
      window.alert('Задайте PIN родителя минимум из 4 символов.')
      return
    }
    const filledRewards = rewards.filter((reward) => reward.label.trim() || reward.starsRequired > 0)
    if (filledRewards.some((reward) => !reward.label.trim() || reward.starsRequired <= 0)) {
      window.alert('В каждой награде нужно указать и количество звёзд, и текст награды.')
      return
    }
    const cleanRegularTasks = regularTasks
      .map((task) => ({ ...task, label: task.label.trim(), xp: Number(task.xp || 0), stars: Number(task.stars || 0) }))
      .filter((task) => task.label)
    if (regularTasks.length !== cleanRegularTasks.length) {
      window.alert('В регулярных заданиях удалите пустые строки или заполните название.')
      return
    }
    const cleanCustomLootboxRewards = customLootboxRewards.map((reward) => reward.trim()).filter(Boolean)
    const cleanLootboxRewards = lootboxRewards.length
      ? [
          ...lootboxRewards.filter((reward) => reward !== 'other'),
          ...(lootboxRewards.includes('other') && otherLootboxText.trim() ? [`Другое: ${otherLootboxText.trim()}`] : []),
          ...cleanCustomLootboxRewards,
        ]
      : []
    if (cleanLootboxRewards.length === 1) {
      window.alert('Для лутбоксов выберите минимум 2 варианта или выключите их полностью.')
      return
    }
    const patch: Partial<ChildProfile> & { create?: boolean } = {
      create: mode === 'create',
      name: profileName.trim(),
      starRules,
      rewards: filledRewards,
      ageGroup,
      regularTasks: cleanRegularTasks,
      lootboxRewards: cleanLootboxRewards,
    }
    if (goalLabel.trim() && goalTarget > 0) {
      patch.currentGoal = { label: goalLabel.trim(), starsTarget: goalTarget }
    }
    if (mode === 'create' && isFirstProfile) {
      writeLocalJson('wcq-parent-pin-created', true)
    }
    const saved = await onSave(patch)
    if (saved) {
      setSaveNotice(true)
      window.setTimeout(() => setSaveNotice(false), 2200)
    }
  }

  const updateRegularTask = (index: number, patch: Partial<NonNullable<ChildProfile['regularTasks']>[number]>) => {
    setRegularTasks((current) => current.map((task, taskIndex) => (taskIndex === index ? { ...task, ...patch } : task)))
  }

  const toggleLootboxReward = (value: string) => {
    setLootboxRewards((current) =>
      current.includes(value) ? current.filter((reward) => reward !== value) : [...current, value],
    )
  }

  const addCustomLootboxReward = () => {
    setCustomLootboxRewards((current) => [...current, ''])
  }

  return (
    <div className="child-profile-manager">
      <div className="child-profile-header">
        <div>
          <p className="eyebrow">{mode === 'create' ? 'Новый профиль' : 'Личный кабинет родителя'}</p>
          <h2>{mode === 'create' ? 'Добавить ребёнка' : 'Настройки ребёнка'}</h2>
        </div>
        <div className="child-profile-header-actions">
          <button className="tiny-button" type="button" onClick={saveProfileSettings}>
            Сохранить профиль
          </button>
          <button className="tiny-button alt" disabled={!selectedProfileId} type="button" onClick={onCopyLink}>
            Ссылка на ЛК ребёнка
          </button>
        </div>
      </div>

      <div className="child-profile-toolbar">
        {mode === 'edit' && (
          <label>
            Профиль ребёнка
            <select
              value={selectedProfileId}
              onChange={(event) => onSelectProfile(event.target.value)}
            >
              {childProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} {profile.ageGroup === 'teen' ? '(подросток)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Имя ребёнка
          <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Например: Имануил" />
        </label>
        {mode === 'create' && isFirstProfile && (
          <label>
            PIN родителя
            <input
              maxLength={12}
              type="password"
              value={parentPin}
              onChange={(event) => setParentPin(event.target.value)}
              placeholder="Задаётся один раз"
            />
            <small className="hint">Дальше PIN не будет висеть на стартовом экране. Позже его можно будет менять в кабинете родителя.</small>
          </label>
        )}
      </div>

      <div className="teen-toggle">
        <span>Возрастная группа:</span>
        <div className="teen-toggle-buttons">
          <button
            type="button"
            className={ageGroup === 'kid' ? 'pixel-button active' : 'pixel-button alt'}
            onClick={() => setAgeGroup('kid')}
          >
            Ребёнок (5-11)
          </button>
          <button
            type="button"
            className={ageGroup === 'teen' ? 'pixel-button active' : 'pixel-button alt'}
            onClick={() => setAgeGroup('teen')}
          >
            Подросток (12-17)
          </button>
        </div>
        <small className="hint">Для подростков — другие награды, формулировки и акцент на самостоятельность.</small>
      </div>

      <div className="goal-editor">
        <label>
          Долгосрочная цель (накопить звёзды)
          <input
            placeholder="Например: новые наушники или поездка"
            value={goalLabel}
            onChange={(e) => setGoalLabel(e.target.value)}
          />
        </label>
        <label>
          Цель в звёздах
          <input type="number" min={5} value={goalTarget} onChange={(e) => setGoalTarget(Number(e.target.value) || 30)} />
        </label>
      </div>
      <section className="child-profile-section">
        <h3>Сколько звёзд получает ребёнок</h3>
        <p className="hint">Эти правила применятся при сохранении квеста: золото, серебро или бронза.</p>
        <div className="star-rules-grid">
        <label className="star-rule-card gold">
          <span>За золото</span>
          <input
            min={0}
            type="number"
            value={numberInputValue(starRules.gold)}
            onChange={(event) => setStarRules((current) => ({ ...current, gold: numberFromInput(event.target.value) }))}
          />
          <small>звёзд</small>
        </label>
        <label className="star-rule-card silver">
          <span>За серебро</span>
          <input
            min={0}
            type="number"
            value={numberInputValue(starRules.silver)}
            onChange={(event) => setStarRules((current) => ({ ...current, silver: numberFromInput(event.target.value) }))}
          />
          <small>звёзд</small>
        </label>
        <label className="star-rule-card bronze">
          <span>За бронзу</span>
          <input
            min={0}
            type="number"
            value={numberInputValue(starRules.bronze)}
            onChange={(event) => setStarRules((current) => ({ ...current, bronze: numberFromInput(event.target.value) }))}
          />
          <small>звёзд</small>
        </label>
        </div>
      </section>
      <section className="child-profile-section child-rewards-editor">
        <h3>Награды за звёзды</h3>
        <p className="hint">Если добавлена награда, обязательно заполни и цену в звёздах, и что ребёнок получит.</p>
        {rewards.map((reward, index) => (
          <div className="child-reward-row" key={reward.id}>
            <input
              min={1}
              type="number"
              value={numberInputValue(reward.starsRequired)}
              onChange={(event) =>
                setRewards((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, starsRequired: numberFromInput(event.target.value) } : item,
                  ),
                )
              }
            />
            <input
              placeholder="Что получит ребёнок"
              value={reward.label}
              onChange={(event) =>
                setRewards((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)),
                )
              }
            />
            <select
              value={(reward as any).category || ''}
              onChange={(event) =>
                setRewards((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, category: event.target.value || undefined } : item)),
                )
              }
              title="Категория награды"
            >
              <option value="">—</option>
              <option value="privilege">Привилегия</option>
              <option value="experience">Опыт</option>
              <option value="allowance">Деньги/карманные</option>
              <option value="item">Вещь/подарок</option>
            </select>
          </div>
        ))}
        <button
          className="tiny-button"
          type="button"
          onClick={() => setRewards((current) => [...current, { id: makeId(), starsRequired: 5, label: '', category: undefined }])}
        >
          + награда
        </button>
      </section>

      {/* Parent config for regular tasks and lootboxes */}
      <section className="child-profile-section">
        <h3>Регулярные задания (для ежедневного выполнения)</h3>
        <p className="hint">Ребёнок сможет отмечать их в своём кабинете и получать XP/звёзды.</p>
        <div className="regular-task-editor">
          {regularTasks.map((task, index) => (
            <div className="regular-task-row" key={task.id}>
              <input
                placeholder="Например: заправить кровать"
                value={task.label}
                onChange={(event) => updateRegularTask(index, { label: event.target.value })}
              />
              <label>
                XP
                <input
                  min={0}
                  type="number"
                  value={numberInputValue(task.xp)}
                  onChange={(event) => updateRegularTask(index, { xp: numberFromInput(event.target.value) })}
                />
              </label>
              <label>
                Звёзды
                <input
                  min={0}
                  type="number"
                  value={numberInputValue(task.stars)}
                  onChange={(event) => updateRegularTask(index, { stars: numberFromInput(event.target.value) })}
                />
              </label>
              <button
                className="tiny-button danger"
                type="button"
                onClick={() => setRegularTasks((current) => current.filter((_, taskIndex) => taskIndex !== index))}
              >
                Убрать
              </button>
            </div>
          ))}
        </div>
        <button
          className="tiny-button"
          type="button"
          onClick={() => setRegularTasks((current) => [...current, { id: makeId(), label: '', xp: 15, stars: 1 }])}
        >
          + регулярное задание
        </button>
      </section>

      <section className="child-profile-section lootbox-profile-section">
        <div className="section-heading-row">
          <h3>Содержимое лутбоксов</h3>
          <label className="pixel-check lootbox-master-check">
            <input
              checked={lootboxRewards.length > 0}
              type="checkbox"
              onChange={(event) => setLootboxRewards(event.target.checked ? defaultLootboxRewards : [])}
            />
            <span className="pixel-check-box" aria-hidden>{lootboxRewards.length > 0 ? '✓' : ''}</span>
            <span>Лутбоксы включены</span>
          </label>
        </div>
        {lootboxRewards.length > 0 && (
          <div className="lootbox-editor">
            <div className="lootbox-options-grid">
              {lootboxRewardOptions.map((option) => (
                <label className="pixel-check" key={option.value}>
                  <input
                    checked={lootboxRewards.includes(option.value)}
                    type="checkbox"
                    onChange={() => toggleLootboxReward(option.value)}
                  />
                  <span className="pixel-check-box" aria-hidden>{lootboxRewards.includes(option.value) ? '✓' : ''}</span>
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            {lootboxRewards.includes('other') && (
              <label className="lootbox-custom-row">
                Что именно выпадет в «Другое»
                <input
                  placeholder="Например: выбрать десерт / 30 минут игры"
                  value={otherLootboxText}
                  onChange={(event) => setOtherLootboxText(event.target.value)}
                />
              </label>
            )}
            {customLootboxRewards.map((reward, index) => (
              <label className="lootbox-custom-row" key={`custom-lootbox-${index}`}>
                Свой вариант #{index + 1}
                <span className="lootbox-custom-input-row">
                  <input
                    placeholder="Например: билет в кино"
                    value={reward}
                    onChange={(event) =>
                      setCustomLootboxRewards((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                      )
                    }
                  />
                  <button
                    className="tiny-button danger"
                    type="button"
                    onClick={() => setCustomLootboxRewards((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Убрать
                  </button>
                </span>
              </label>
            ))}
            <button className="tiny-button lootbox-add-custom" type="button" onClick={addCustomLootboxReward}>
              + добавить свой вариант
            </button>
          </div>
        )}
        <small className="hint lootbox-note">При включении автоматически выбираются опыт, звезда и зелье. Можно отметить «Другое» или добавить несколько своих вариантов.</small>
      </section>
      {childProfile && childProfile.pendingRegulars && childProfile.pendingRegulars.length > 0 && (
        <section className="child-profile-section">
          <h3>Ожидают подтверждения от ребенка</h3>
          {childProfile.pendingRegulars.map((p: any, i: number) => (
            <div key={i} className="history-row">
              <span>{p.label} (+{p.xp} XP +{p.stars}★)</span>
              <button className="tiny-button" onClick={async () => {
                const prevXp = childProfile.xp || 0
                const newXp = prevXp + p.xp
                const newStars = (childProfile.starBalance || 0) + p.stars
                const remaining = (childProfile.pendingRegulars || []).filter((_,ii) => ii !== i)
                const { roomProgress } = applyXpWithRoomProgress(prevXp, newXp, childProfile.roomProgress)
                await onSave({ xp: newXp, starBalance: newStars, pendingRegulars: remaining, roomProgress })
              }}>Подтвердить</button>
            </div>
          ))}
        </section>
      )}
      {childProfile && (
        <p className="hint">
          Баланс: {childProfile.starBalance} <StarSprite small /> · Кабинет: /child/{childProfile.id}
        </p>
      )}
      <div className="child-profile-save-footer">
        <button className="pixel-button start wide" type="button" onClick={saveProfileSettings}>
          Сохранить
        </button>
      </div>
      {saveNotice && <div className="save-toast">Сохранено</div>}
    </div>
  )
}

function ChildCabinetPage({ profileId }: { profileId: string }) {
  const [profile, setProfile] = useState<ChildProfile | null>(null)
  const [games, setGames] = useState<GameRecord[]>([])
  const [status, setStatus] = useState('Загружаю кабинет...')
  const [activeGameId, setActiveGameId] = useState('')
  const [cabinetPanel, setCabinetPanel] = useState<'rewards' | 'history' | 'stars'>('history')
  const [showCosmeticChoice, setShowCosmeticChoice] = useState(false)
  const [dismissedCosmeticChoice, setDismissedCosmeticChoice] = useState('')

  const loadProfile = useCallback(async () => {
    try {
      const result = await api<{ profile: ChildProfile; games: GameRecord[] }>(`/api/child-profiles/${profileId}`)
      const prof = result.profile
      setProfile(prof)
      setGames(result.games)
      setStatus('')
      setActiveGameId('')

      // Show current active game if any
      try {
        const state = await api<any>('/api/state')
        const activeForMe = (state.activeGames || []).find((g: any) => 
          g.players?.some((p: any) => p.email && result.profile.childEmail && p.email.includes(result.profile.childEmail.split('@')[0]))
        )
        if (activeForMe) {
          setActiveGameId(activeForMe.id)
        }
      } catch {
        setStatus('Кабинет загружен. Активную игру не удалось проверить, обновите страницу позже.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить кабинет.')
    }
  }, [profileId])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const saveProfilePatch = useCallback(async (patch: Partial<ChildProfile>) => {
    setProfile((current) => current ? ({ ...current, ...patch } as ChildProfile) : current)
    await api<{ profile: ChildProfile }>(`/api/child-profiles/${profileId}`, {
      method: 'POST',
      body: JSON.stringify(patch),
    }).catch(() => {
      setStatus('Изменение сохранено локально. Сервер недоступен, обновите позже.')
    })
  }, [profileId])

  const redeemReward = async (rewardId: string) => {
    try {
      const result = await api<{ profile: ChildProfile }>(`/api/child-profiles/${profileId}/redeem`, {
        body: JSON.stringify({ rewardId }),
        method: 'POST',
      })
      setProfile(result.profile)
      setStatus('Награда получена!')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось получить награду.')
    }
  }

  useEffect(() => {
    if (!profile) return
    const currentLevel = getLevelFromXp(profile.xp || 0)
    const claimedLevels = new Set(profile.cosmeticChoiceLevels || [])
    const pendingLevel = cosmeticUnlocks.find(({ minLevel }) => currentLevel >= minLevel && !claimedLevels.has(minLevel))?.minLevel || 0
    const hasRemainingCosmetics = cosmeticUnlocks.some(({ item }) => !(profile.unlockedCosmetics || []).includes(item))
    const choiceKey = `${profile.id}:${pendingLevel}:${(profile.unlockedCosmetics || []).join('|')}`
    if (pendingLevel && hasRemainingCosmetics && dismissedCosmeticChoice !== choiceKey) {
      setShowCosmeticChoice(true)
    }
  }, [dismissedCosmeticChoice, profile])

  if (!profile) {
    return (
      <main className="game-shell child-cabinet-shell">
        <p className="app-toast">{status || 'Загрузка...'}</p>
      </main>
    )
  }

  const nextReward = profile.rewards.find((reward) => !reward.redeemedAt && profile.starBalance >= reward.starsRequired)
  const xpCurrent = profile.xp || 0
  const xpLevel = getLevelFromXp(xpCurrent)
  const streak = computeStreak(profile.ledger || [])
  const ageLabel = getAgeLabel(profile.ageGroup)
  const goal = profile.currentGoal
  const goalProgress = goal ? Math.min(100, Math.floor(((profile.starBalance || 0) / goal.starsTarget) * 100)) : 0
  const activeGameLink = activeGameId ? `/player/${activeGameId}/0` : ''
  const xpNext = xpForNextLevel(xpCurrent)
  const xpLevelStart = XP_THRESHOLDS[xpLevel - 1] || 0
  const xpLevelEnd = XP_THRESHOLDS[xpLevel] || xpCurrent + xpNext || xpCurrent + 100
  const xpProgress = Math.min(100, Math.max(0, Math.floor(((xpCurrent - xpLevelStart) / Math.max(1, xpLevelEnd - xpLevelStart)) * 100)))
  const availableRewards = profile.rewards.filter((reward) => reward.label.trim())
  const equippedCosmetics = profile.equippedCosmetics || {}
  const claimedChoiceLevels = new Set(profile.cosmeticChoiceLevels || [])
  const pendingCosmeticLevel = cosmeticUnlocks.find(({ minLevel }) => xpLevel >= minLevel && !claimedChoiceLevels.has(minLevel))?.minLevel || 0
  const remainingCosmetics = cosmeticUnlocks
    .filter(({ item, minLevel }) => minLevel <= pendingCosmeticLevel && !(profile.unlockedCosmetics || []).includes(item))
    .map(({ item, slot }) => ({ item, slot }))
  const cosmeticChoiceKey = `${profile.id}:${pendingCosmeticLevel}:${(profile.unlockedCosmetics || []).join('|')}`
  const shouldOfferCosmetic = pendingCosmeticLevel > 0 && remainingCosmetics.length > 0
  const maxZonesInQuest = games.reduce((max, game) => {
    const counts = computeCategoryCountsFromChores(game.chores || [])
    return Math.max(max, Object.values(counts).filter((count) => count > 0).length)
  }, 0)
  const maxKitchenInQuest = games.reduce((max, game) => {
    const counts = computeCategoryCountsFromChores(game.chores || [])
    return Math.max(max, counts.kitchen || 0)
  }, 0)
  const hasFastQuest = games.some((game) => game.roundMinutes > 0 && game.elapsedSeconds > 0 && game.elapsedSeconds <= game.roundMinutes * 60 * 0.75)
  const hasPerfectRating = games.some((game) => {
    const completed = (game.chores || []).filter((chore) => chore.completed)
    return completed.length > 0 && completed.every((chore) => (chore.partnerRating || 0) >= 5)
  })
  const achievementProgress: Record<string, number> = {
    first_quest: profile.totalQuests || 0,
    gold_quest: games.some((game) => game.childOutcome?.tier === 'gold') ? 1 : 0,
    triple_zone: maxZonesInQuest,
    kitchen_combo: maxKitchenInQuest,
    speed_runner: hasFastQuest ? 1 : 0,
    perfect_rating: hasPerfectRating ? 1 : 0,
    star_collector: profile.starBalance || 0,
    streak_3: streak,
    streak_7: streak,
    many_quests: profile.totalQuests || 0,
  }
  const unlocked = new Set([
    ...(profile.achievementIds || []),
    ...CATEGORY_ACHIEVEMENTS
      .filter((achievement) => (achievementProgress[achievement.id] || 0) >= achievement.threshold)
      .map((achievement) => achievement.id),
  ])

  const chooseCosmetic = async (item: string, slot: string) => {
    if (!pendingCosmeticLevel) return
    const unlockedCosmetics = Array.from(new Set([...(profile.unlockedCosmetics || []), item]))
    const cosmeticChoiceLevels = Array.from(new Set([...(profile.cosmeticChoiceLevels || []), pendingCosmeticLevel]))
    const equippedCosmetics = { ...(profile.equippedCosmetics || {}), [slot]: item }
    setShowCosmeticChoice(false)
    await saveProfilePatch({ unlockedCosmetics, cosmeticChoiceLevels, equippedCosmetics })
    setStatus(`${cosmeticItemLabels[item] || item} добавлен к аватарке!`)
  }

  const changeProgressionAvatar = async (avatar: string) => {
    await saveProfilePatch({ avatar })
    setStatus('Персонаж прокачки обновлён.')
  }

  return (
    <main className="game-shell child-cabinet-shell">
      {status && <p className="app-toast">{status}</p>}
      <header className="pixel-panel child-cabinet-header">
        <div className="child-cabinet-hero">
          <ChildRoomScene
            avatar={profile.avatar}
            avatarUrl={profile.avatarUrl}
            cosmetics={profile.equippedCosmetics || {}}
            name={profile.name}
            ageLabel={`${ageLabel}${streak > 1 ? ` · ${streak} дн.` : ''}`}
            xpLevel={xpLevel}
            xpCurrent={xpCurrent}
            xpLevelEnd={xpLevelEnd}
            xpProgress={xpProgress}
            xpNext={xpNext}
            starBalance={profile.starBalance}
            roomProgress={profile.roomProgress}
            onRoomProgressChange={(next: RoomProgress) => {
              void saveProfilePatch({ roomProgress: next })
            }}
            renderAvatar={(props) => <PixelAvatar {...props} />}
            renderStar={() => <StarSprite />}
          />
          <div className="hero-avatar-stack room-cosmetics-dock">
            <div className="avatar-hover-wrap">
              <button className="tiny-button" type="button">Снаряжение</button>
              <div className="avatar-hover-card">
                <strong>Прокачка персонажа</strong>
                <p>Аксессуары открываются за уровни. Комната растёт отдельно — предметы появляются за каждый новый уровень.</p>
                {profile.avatarUrl && (
                  <label>
                    Персонаж для прокачки
                    <select value={profile.avatar} onChange={(event) => changeProgressionAvatar(event.target.value)}>
                      {progressionAvatarOptions.map((avatar) => (
                        <option key={avatar} value={avatar}>{avatar}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="cosmetic-select-grid compact">
                  {['hat','cloak','staff','pet','potion'].map(slot => {
                    const current = equippedCosmetics[slot]
                    const unlockedItems = (profile.unlockedCosmetics || []).filter(u => u.startsWith(slot) || u === slot)
                    if (!unlockedItems.length) return null
                    return (
                      <label key={slot}>
                        {cosmeticSlotLabels[slot] || slot}
                        <select value={current || ''} onChange={e => {
                          const val = e.target.value || undefined
                          const next = {...(profile.equippedCosmetics || {})}
                          if (val) next[slot] = val
                          else delete next[slot]
                          void saveProfilePatch({ equippedCosmetics: next })
                        }}>
                          <option value="">не надето</option>
                          {unlockedItems.map(item => <option key={item} value={item}>{cosmeticItemLabels[item] || item}</option>)}
                        </select>
                      </label>
                    )
                  })}
                </div>
                {shouldOfferCosmetic && (
                  <button className="tiny-button" type="button" onClick={() => setShowCosmeticChoice(true)}>
                    Выбрать новый предмет
                  </button>
                )}
                {!profile.unlockedCosmetics?.length && <small>Первый аксессуар откроется на 2 уровне.</small>}
              </div>
            </div>
            {profile.avatarUrl && <img className="child-profile-photo" src={profile.avatarUrl} alt="Фото профиля" />}
          </div>
        </div>
      </header>

      {showCosmeticChoice && shouldOfferCosmetic && (
        <div className="modal-backdrop cosmetic-choice-backdrop">
          <article className="pixel-panel cosmetic-choice-modal">
            <button className="modal-close-button" type="button" onClick={() => {
              setDismissedCosmeticChoice(cosmeticChoiceKey)
              setShowCosmeticChoice(false)
            }}>×</button>
            <p className="eyebrow">Новый уровень</p>
            <h2>Выбери предмет для аватарки</h2>
            <p className="hint">Этот выбор сохранится. Уже выбранные предметы второй раз не появляются.</p>
            <div className="cosmetic-choice-grid">
              {remainingCosmetics.map(({ item, slot }) => (
                <button className="cosmetic-choice-card" key={item} type="button" onClick={() => chooseCosmetic(item, slot)}>
                  <span className={`cosmetic-choice-preview ${slot}`}>
                    <img src={slot === 'backdrop' ? `/avatars/backgrounds/${item}.svg` : `/avatars/accessories/${item}.svg`} alt="" />
                  </span>
                  <strong>{cosmeticItemLabels[item] || item}</strong>
                  <small>{cosmeticSlotLabels[slot] || slot}</small>
                </button>
              ))}
            </div>
          </article>
        </div>
      )}

      <article className="pixel-panel child-goal-card">
        <div>
          <p className="eyebrow">Цель</p>
          <h2>{goal?.label || 'Цель пока не выбрана'}</h2>
        </div>
        <div className="goal-progress-copy">
          <strong>{goal ? `${profile.starBalance} / ${goal.starsTarget}` : `${profile.starBalance} звёзд`}</strong>
          {goal && <span>{goalProgress}%</span>}
        </div>
        {goal && <div className="progress-track"><div className="progress-fill" style={{width: `${goalProgress}%`}} /></div>}
      </article>

      <section className={activeGameLink ? 'child-task-zone has-active' : 'child-task-zone'}>
        {activeGameLink && (
          <article className="pixel-panel child-active-game-card">
            <div>
              <p className="eyebrow">Активный квест</p>
              <h2>Можно продолжить уборку</h2>
              <p className="hint">Нажми кнопку, откроется твой список дел. Никакие настройки там не нужны.</p>
            </div>
            <button className="pixel-button start" type="button" onClick={() => window.location.assign(activeGameLink)}>
              Перейти к игре
            </button>
          </article>
        )}

        <article className="pixel-panel regular-task-board">
          <div className="board-pin" aria-hidden />
          <h2>Доска регулярных дел</h2>
          <p className="hint">Отметь выполненное — получишь опыт и звёзды. Родитель увидит заявку.</p>
          <div className="regular-task-list">
            {(profile.regularTasks || []).map((task: any) => (
              <div key={task.id} className="regular-task-ticket">
                <span>{task.label}</span>
                <small>+{task.xp} XP · +{task.stars}★</small>
                <button className="tiny-button" onClick={async () => {
                  const pending = [...(profile.pendingRegulars || []), { ...task, doneAt: new Date().toISOString() }]
                  setProfile({...profile, pendingRegulars: pending} as any)
                  try {
                    await api(`/api/child-profiles/${profileId}`, {
                      method: 'POST',
                      body: JSON.stringify({ pendingRegulars: pending })
                    })
                    setStatus(`Отмечено "${task.label}" — ждёт подтверждения родителя`)
                  } catch { setStatus('Отмечено локально') }
                }}>Выполнить</button>
              </div>
            ))}
            {!(profile.regularTasks || []).length && <p className="hint">Регулярные дела появятся после настройки родителем.</p>}
          </div>
        </article>
      </section>

      <article className="pixel-panel child-lootbox-card">
        <img src="/avatars/lootbox.svg" alt="" />
        <div>
          <p className="eyebrow">Лутбокс</p>
          <h2>Сундук с бонусом</h2>
          <p className="hint">Выполни регулярные дела или набери очки в квесте — открой сундук.</p>
        </div>
        <button className="pixel-button" onClick={async () => {
          const rewards = profile.lootboxRewards || ['+20xp', '+1 звезда', 'potion']
          const pick = rewards[Math.floor(Math.random()*rewards.length)]
          let msg = `Выпало: ${pick}!`
          const prevXp = profile.xp || 0
          let newXp = prevXp
          let newStars = profile.starBalance || 0
          if (pick.includes('xp')) {
            const amt = parseInt(pick) || 20; newXp += amt
          } else if (pick.includes('звезда')) {
            const amt = parseInt(pick) || 1; newStars += amt
          } else if (pick === 'potion') {
            msg += ' (Зелье: +10% к следующей игре)'
          }
          const { roomProgress, grantedItemIds } = applyXpWithRoomProgress(prevXp, newXp, profile.roomProgress)
          if (grantedItemIds.length) msg += ' Новый предмет в комнате!'
          const newP = {...profile, xp: newXp, starBalance: newStars, roomProgress}
          setProfile(newP as any)
          await api(`/api/child-profiles/${profileId}`, {method:'POST', body: JSON.stringify({xp: newXp, starBalance: newStars, roomProgress})}).catch(()=>{})
          setStatus(msg)
        }}>Открыть лутбокс</button>
      </article>

      <section className="setup-grid child-cabinet-grid">
        {profile.ageGroup === 'teen' && (
          <article className="pixel-panel">
            <h2>Твоя автономия</h2>
            <p className="hint">Предложи родителю новое дело — оно появится в следующем квесте.</p>
            <div style={{display:'flex', gap:8}}>
              <input placeholder="Например: вынести мусор из машины" id="suggest-input" style={{flex:1}} />
              <button className="tiny-button" onClick={() => {
                const inp = document.getElementById('suggest-input') as HTMLInputElement
                if (inp?.value.trim()) {
                  setStatus(`Предложение "${inp.value.trim()}" отправлено родителю!`)
                  inp.value = ''
                }
              }}>Предложить</button>
            </div>
          </article>
        )}

        <article className="pixel-panel child-achievements-panel">
          <h2>Достижения</h2>
          <div className="achievement-grid">
            {CATEGORY_ACHIEVEMENTS.map((achievement) => {
              const isUnlocked = unlocked.has(achievement.id)
              const progress = Math.min(achievement.threshold, achievementProgress[achievement.id] || 0)
              return (
                <div className={`achievement-card ${isUnlocked ? 'unlocked' : ''}`} key={achievement.id}>
                  <AchievementBadge achievement={achievement} unlocked={isUnlocked} />
                  <strong>{achievement.title}</strong>
                  <span>{achievement.description}</span>
                  <small>{isUnlocked ? 'Открыто!' : `${progress}/${achievement.threshold}`}</small>
                </div>
              )
            })}
          </div>
        </article>

        <article className="pixel-panel">
          <h2>Дерево навыков</h2>
          <div className="skill-tree">
            {SKILL_TREE.map((skill) => {
              const count = profile.categoryCounts[skill.id] || 0
              const lvl = computeSkillLevels(profile.categoryCounts || {})[skill.id] || 1
              const title = getSkillTitle(skill.id, lvl)
              const progress = Math.min(100, Math.floor(((count % 4) / 4) * 100))
              return (
                <div className="skill-card" key={skill.id}>
                  <RoomIcon icon={skill.icon} label={skill.title} />
                  <div>
                    <strong>{title} {lvl >= 4 ? '🏅' : lvl >= 3 ? '🥈' : lvl >= 2 ? '⭐' : ''}</strong>
                    <small>Ур. {lvl} • {count} дел</small>
                    <div className="progress-track"><div className="progress-fill" style={{width: `${progress}%`}} /></div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="hint">Каждый уровень навыка = +2 звезды в будущем. Качай своего титана уборки!</p>
        </article>

        <article className="pixel-panel child-log-panel">
          <div className="child-log-header">
            <h2>Прогресс и история</h2>
            <div className="child-log-tabs">
              {availableRewards.length > 0 && <button className={cabinetPanel === 'rewards' ? 'section-tab active' : 'section-tab'} type="button" onClick={() => setCabinetPanel('rewards')}>Награды</button>}
              <button className={cabinetPanel === 'history' ? 'section-tab active' : 'section-tab'} type="button" onClick={() => setCabinetPanel('history')}>История квестов</button>
              <button className={cabinetPanel === 'stars' ? 'section-tab active' : 'section-tab'} type="button" onClick={() => setCabinetPanel('stars')}>Журнал звёзд</button>
            </div>
          </div>
          {cabinetPanel === 'rewards' && availableRewards.length > 0 && (
            <div className="history-list">
              {availableRewards.map((reward) => {
                const canRedeem = !reward.redeemedAt && profile.starBalance >= reward.starsRequired
                return (
                  <div className="history-row history-row-actions" key={reward.id}>
                    <div className="history-row-body">
                      <strong>{reward.starsRequired} <StarSprite small /> — {reward.label}</strong>
                      <span>{reward.redeemedAt ? `Получено ${formatDate(reward.redeemedAt)}` : canRedeem ? 'Можно забрать!' : `Ещё ${reward.starsRequired - profile.starBalance} звёзд`}</span>
                    </div>
                    {canRedeem && <button className="tiny-button" type="button" onClick={() => redeemReward(reward.id)}>Забрать</button>}
                  </div>
                )
              })}
              {nextReward && <p className="hint">Ближайшая цель: {nextReward.label}</p>}
            </div>
          )}
          {cabinetPanel === 'history' && (
            <>
              <div className="history-list">
                {games.map((game) => (
                  <div className="history-row" key={game.id}>
                    <div className="history-row-body">
                      <strong>{game.childOutcome?.coins ?? game.scores[0]?.total ?? 0} монет · {game.childOutcome?.starsEarned || 0} <StarSprite small /></strong>
                      <span>{formatDate(game.finishedAt)} · {game.childOutcome?.prizeLabel || game.prize || 'Квест'}</span>
                    </div>
                  </div>
                ))}
                {!games.length && <p className="hint">История квестов появится после первой сохранённой игры.</p>}
              </div>
            </>
          )}
          {cabinetPanel === 'stars' && (
            <div className="history-list">
              {profile.ledger.slice().reverse().map((entry) => (
                <div className="history-row" key={entry.id}>
                  <div className="history-row-body">
                    <strong>{entry.stars > 0 ? '+' : ''}{entry.stars} <StarSprite small /></strong>
                    <span>{formatDate(entry.createdAt)} · {entry.note}</span>
                  </div>
                </div>
              ))}
              {!profile.ledger.length && <p className="hint">Звёзды появятся после сохранённых квестов.</p>}
            </div>
          )}
        </article>
      </section>
    </main>
  )
}

function ChoreLibrary({
  chores,
  className = '',
  currentSection,
  newCategoryIcon,
  newCategoryTitle,
  newChore,
  newSectionTitle,
  onAddCategory,
  onAddChild,
  onAddChore,
  onAddSection,
  onDeleteItem,
  onLoadTemplate,
  onNewCategoryIcon,
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
  newCategoryIcon: string
  newCategoryTitle: string
  newChore: { title: string; minutes: number; difficulty: Difficulty }
  newSectionTitle: string
  onAddCategory: () => void
  onAddChild: (groupId: string) => void
  onAddChore: (groupId?: string) => void
  onAddSection: () => void
  onDeleteItem: (id: string, childId?: string) => void
  onLoadTemplate?: (key: string) => void
  onNewCategoryIcon: (icon: string) => void
  onNewCategoryTitle: (title: string) => void
  onNewChore: (chore: { title: string; minutes: number; difficulty: Difficulty }) => void
  onNewSectionTitle: (title: string) => void
  onSectionChange: (title: string) => void
  onUpdateItem: (id: string, patch: Partial<ChoreTask | ChoreGroup>, childId?: string) => void
  sections: string[]
}) {
  const [addingSection, setAddingSection] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const categoryOptions = chores.filter(isGroup)

  return (
    <article className={className ? `pixel-panel chores-panel ${className}` : 'pixel-panel chores-panel'}>
      <div className="chores-panel-header">
        <div className="panel-title">
          <span>3</span>
          <h2>Общий список дел</h2>
        </div>
        <div className="templates-row">
          <span className="templates-label">Шаблоны:</span>
          <button type="button" className="tiny-button" onClick={() => onLoadTemplate && onLoadTemplate('weekend')}>Выходные</button>
          <button type="button" className="tiny-button" onClick={() => onLoadTemplate && onLoadTemplate('daily')}>Ежедневный</button>
          <button type="button" className="tiny-button" onClick={() => onLoadTemplate && onLoadTemplate('teen')}>Подросток</button>
          <button type="button" className="tiny-button" onClick={() => onLoadTemplate && onLoadTemplate('deep')}>Глубокая</button>
          <button type="button" className="tiny-button" onClick={() => onLoadTemplate && onLoadTemplate('minimal')}>Мини</button>
        </div>
        <div className="section-tabs chores-section-tabs">
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
        <p className="compose-label">Категория</p>
        <div className="chore-compose-row chore-compose-category">
          <RoomIcon icon={newCategoryIcon} label={roomIconLabels[newCategoryIcon]} />
          <select
            aria-label="Иконка категории"
            className="compose-icon-select"
            value={newCategoryIcon}
            onChange={(event) => onNewCategoryIcon(event.target.value)}
          >
            {roomIconOptions.map((icon) => (
              <option key={icon} value={icon}>
                {roomIconLabels[icon]}
              </option>
            ))}
          </select>
          <input
            placeholder="Например: ванная комната"
            value={newCategoryTitle}
            onChange={(event) => onNewCategoryTitle(event.target.value)}
          />
          <button className="tiny-button alt compose-add-category" title="Добавить категорию" type="button" onClick={onAddCategory}>
            + кат
          </button>
        </div>
        <p className="compose-label">Дело</p>
        <div className="chore-compose-row">
          <select
            aria-label="Категория для дела"
            className="compose-category-select"
            value={selectedCategoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
          >
            <option value="">Без категории</option>
            {categoryOptions.map((group) => (
              <option key={group.id} value={group.id}>
                {group.title}
              </option>
            ))}
          </select>
          <input
            className="compose-title"
            placeholder="Название дела"
            value={newChore.title}
            onChange={(event) => onNewChore({ ...newChore, title: event.target.value })}
          />
          <input
            aria-label="Минуты"
            className="compose-minutes"
            min={5}
            step={5}
            type="number"
            value={numberInputValue(newChore.minutes)}
            onChange={(event) => onNewChore({ ...newChore, minutes: numberFromInput(event.target.value) })}
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
          <button
            className="tiny-button compose-add"
            title="Добавить дело"
            type="button"
            onClick={() => onAddChore(selectedCategoryId || undefined)}
          >
            +
          </button>
        </div>
      </div>
      <div className="chore-list">
        {chores.map((item) =>
          isGroup(item) ? (
            <div className={`chore-group icon-${item.icon || 'storage'}`} key={item.id}>
              <div className="chore-row group-row">
                <span className="row-kind">Категория</span>
                <input checked={item.enabled} type="checkbox" onChange={(event) => onUpdateItem(item.id, { enabled: event.target.checked })} />
                <RoomIcon icon={item.icon || 'storage'} label={roomIconLabels[item.icon || 'storage']} />
                <select className="room-icon-select" value={item.icon || 'storage'} onChange={(event) => onUpdateItem(item.id, { icon: event.target.value })}>
                  {roomIconOptions.map((icon) => (
                    <option key={icon} value={icon}>
                      {roomIconLabels[icon]}
                    </option>
                  ))}
                </select>
                <input value={item.title} onChange={(event) => onUpdateItem(item.id, { title: event.target.value })} />
                <span className="group-minutes">{item.children.reduce((sum, child) => sum + (child.enabled ? child.minutes : 0), 0)} мин</span>
                <button className="tiny-button" type="button" onClick={() => onAddChild(item.id)}>
                  + дело
                </button>
                <button className="tiny-button danger" type="button" onClick={() => onDeleteItem(item.id)}>
                  удалить
                </button>
              </div>
              {item.children.map((child) => (
                <div className="chore-row child-row" key={child.id}>
                  <span className="row-kind">Дело</span>
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
                    value={numberInputValue(child.minutes)}
                    onChange={(event) => onUpdateItem(item.id, { minutes: numberFromInput(event.target.value) }, child.id)}
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
            <div className="chore-row standalone-row" key={item.id}>
              <span className="row-kind">Дело</span>
              <input checked={item.enabled} type="checkbox" onChange={(event) => onUpdateItem(item.id, { enabled: event.target.checked })} />
              <input value={item.title} onChange={(event) => onUpdateItem(item.id, { title: event.target.value })} />
              <input
                className="mini-input"
                min={5}
                step={5}
                type="number"
                value={numberInputValue(item.minutes)}
                onChange={(event) => onUpdateItem(item.id, { minutes: numberFromInput(event.target.value) })}
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
          value={numberInputValue(extraChore.minutes)}
          onChange={(event) => onChange({ ...extraChore, minutes: numberFromInput(event.target.value) })}
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


function StatsPage({
  childProfile,
  gameMode,
  pairGames,
  onBack,
  onDeleteGame,
  players,
}: {
  childProfile: ChildProfile | null
  gameMode: GameMode
  pairGames: GameRecord[]
  onBack: () => void
  onDeleteGame: (gameId: string) => void
  players: Player[]
}) {
  const [statsTab, setStatsTab] = useState<'history' | 'analytics'>('history')
  const modeStats = useMemo(() => computeChoreStatsForGames(pairGames), [pairGames])
  const recentChores = useMemo(() => computeRecentChoreTitles(pairGames), [pairGames])

  const pageTitle =
    gameMode === 'childQuest' ? 'Прогресс ребёнка' : gameMode === 'solo' ? 'Моя история' : 'История пары'

  return (
    <article className="pixel-panel stats-page">
      <div className="stats-page-top">
        <button className="tiny-button stats-back-button" type="button" onClick={onBack}>
          ← На главную
        </button>
        <div className="panel-title stats-page-title">
          <span>4</span>
          <h2>{pageTitle}</h2>
        </div>
      </div>

      {gameMode === 'childQuest' && childProfile && (
        <div className="stats-child-hero">
          <StarSprite />
          <div>
            <strong>{childProfile.starBalance} звёзд</strong>
            <p>
              Квестов: {childProfile.totalQuests} · Ачивок: {childProfile.achievementIds.length}
            </p>
          </div>
        </div>
      )}

      <div className="stats-page-tabs">
        <button
          className={statsTab === 'history' ? 'section-tab active' : 'section-tab'}
          type="button"
          onClick={() => setStatsTab('history')}
        >
          История
        </button>
        <button
          className={statsTab === 'analytics' ? 'section-tab active' : 'section-tab'}
          type="button"
          onClick={() => setStatsTab('analytics')}
        >
          Статистика дел
        </button>
      </div>

      {statsTab === 'history' && (
        <section className="stats-section">
          <h3>
            {gameMode === 'childQuest' ? 'Сохранённые квесты' : gameMode === 'solo' ? 'Мои прошлые игры' : 'Игры пары'}
          </h3>
          <div className="history-list">
            {pairGames.map((game) => (
              <div className="history-row history-row-actions" key={game.id}>
                <div className="history-row-body">
                  <strong>
                    {game.mode === 'childQuest'
                      ? `${game.childOutcome?.coins ?? game.scores[0]?.total ?? 0} монет · ${game.childOutcome?.starsEarned || 0} звёзд`
                      : game.mode === 'solo'
                        ? `${game.players[0]?.name || 'Соло'}: ${game.scores[0]?.total || 0} очков`
                        : game.winnerEmail
                          ? `Победа: ${game.players.find((player) => player.email === game.winnerEmail)?.name}`
                          : 'Ничья'}
                  </strong>
                  <span>
                    {formatDate(game.finishedAt)}
                    {game.mode === 'childQuest'
                      ? ` · ${game.childOutcome?.prizeLabel || game.prize || 'Квест'}`
                      : ` · ${game.scores.map((score) => score.total).join(' : ')}`}
                  </span>
                </div>
                <button className="tiny-button danger" type="button" onClick={() => onDeleteGame(game.id)}>
                  Удалить
                </button>
              </div>
            ))}
            {!pairGames.length && <p className="hint">Сохранённых игр в этом режиме пока нет.</p>}
          </div>
        </section>
      )}

      {statsTab === 'analytics' && (
        <div className="stats-analytics-layout">
          <section className="stats-section">
            <h3>{gameMode === 'duo' ? 'Кто что делает чаще' : 'Что делал чаще'}</h3>
            <div className="history-list">
              {modeStats.map((stat) => (
                <div className="history-row" key={stat.title}>
                  <div className="history-row-body">
                    <strong>{stat.title}</strong>
                    <span>
                      {gameMode === 'duo'
                        ? players.map((player) => `${player.name}: ${stat.byPlayer[normalizeEmail(player.email)] || 0}`).join(' · ')
                        : `${stat.total}×`}
                      {' · '}среднее {stat.avgMinutes} мин
                    </span>
                  </div>
                </div>
              ))}
              {!modeStats.length && <p className="hint">Статистика дел появится после сохранённых игр.</p>}
            </div>
          </section>

          {gameMode === 'solo' && (
            <section className="stats-section">
              <h3>Недавние дела</h3>
              <div className="history-list">
                {recentChores.slice(0, 12).map((item) => (
                  <div className="history-row" key={item.title}>
                    <div className="history-row-body">
                      <strong>{item.title}</strong>
                      <span>{formatDate(item.finishedAt)}</span>
                    </div>
                  </div>
                ))}
                {!recentChores.length && <p className="hint">Здесь будет видно, что ты уже делал и когда.</p>}
              </div>
            </section>
          )}

          {gameMode === 'childQuest' && childProfile && (
            <section className="stats-section">
              <h3>Достижения по категориям</h3>
              <div className="achievement-grid">
                {CATEGORY_ACHIEVEMENTS.map((achievement) => (
                  <div
                    className={`achievement-card ${childProfile.achievementIds.includes(achievement.id) ? 'unlocked' : ''}`}
                    key={achievement.id}
                  >
                    <RoomIcon icon={achievement.icon} label={achievement.title} />
                    <strong>{achievement.title}</strong>
                    <span>
                      {childProfile.categoryCounts[achievement.icon] || 0}/{achievement.threshold} дел
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
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

function PixelAvatar({ avatar, avatarUrl, small = false, cosmetics = {} }: { avatar: string; avatarUrl?: string; small?: boolean; cosmetics?: Record<string, string> }) {
  const baseSrc = avatarUrl || (spriteAvatarSet.has(avatar) ? `/avatars/${avatar}.svg` : null)
  const backdrop = cosmetics.backdrop

  if (!baseSrc) {
    return <LegacyPixelAvatar avatar={avatar} small={small} />
  }

  const accs = Object.entries(cosmetics || {}).filter(([slot, v]) => slot !== 'backdrop' && v)

  return (
    <div className={small ? 'avatar-container small' : 'avatar-container'} aria-hidden="true">
      {backdrop && <img className="accessory backdrop" alt="" src={`/avatars/backgrounds/${backdrop}.svg`} />}
      <img className="base" alt="avatar" src={baseSrc} />
      {accs.map(([slot, item]) => {
        const src = `/avatars/accessories/${item}.svg`
        return <img key={slot} className={`accessory ${slot}`} alt={slot} src={src} />
      })}
    </div>
  )
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
  const [mobileFx, setMobileFx] = useState<{ coins: number; id: number } | null>(null)

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

  const complete = async (choreId?: string, proofPhotoUrl?: string) => {
    try {
      const before = game?.chores.find((chore) =>
        choreId ? chore.id === choreId && chore.assignedTo === playerIndex : chore.assignedTo === playerIndex && !chore.completed,
      )
      const result = await api<{ game: ActiveGame }>(`/api/active-games/${sessionId}/complete`, {
        body: JSON.stringify({ choreId, playerIndex, proofPhotoUrl }),
        method: 'POST',
      })
      if (before && !before.completed) {
        const id = Date.now()
        setMobileFx({ coins: choreBasePoints(before), id })
        window.setTimeout(() => setMobileFx((current) => (current?.id === id ? null : current)), 900)
      }
      setGame(result.game)
      setStatus('Готово, общий экран обновился')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось отметить дело')
    }
  }

  const uploadProofPhoto = async (choreId: string, file: File | null) => {
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      await complete(choreId, dataUrl)
      setStatus('Фото прикреплено! Ожидает подтверждения родителя.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить фото')
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
  const playerScore = computePlayerScore(game.chores, playerIndex, game?.requirePhotoProof)
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
        <section className="pixel-panel mobile-panel mobile-results ceremony-burst">
          <div className="confetti" />
          {game.mode === 'childQuest' && childTier !== 'none' && (
            <div className="ceremony-medal mobile-medal medal-spin">
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
      <section className={`pixel-panel mobile-panel ${mobileFx ? 'play-fx-active' : ''}`}>
        {game.mode === 'childQuest' && (
          <div className={mobileFx ? 'hud-pulse' : undefined}>
            <ChildQuestHud coins={childCoins} prizeTiers={game.prizeTiers} target={childTarget} />
          </div>
        )}
        <div className={`player-card ${mobileFx ? 'avatar-celebrate' : ''}`}>
          <PixelAvatar avatar={player.avatar} avatarUrl={player.avatarUrl} />
          <div>
            <p className="eyebrow">{game.mode === 'childQuest' ? 'Tidy Titans' : 'Моя уборка'}</p>
            <h1>{player.name}</h1>
            <p>
              {done}/{chores.length} дел · {status}
            </p>
          </div>
          {mobileFx && (
            <span className="coin-float" key={mobileFx.id}>
              +{mobileFx.coins}
            </span>
          )}
        </div>

        <div className="quest-list mobile-quests">
          {chores.map((chore) => (
            <div className={chore.completed ? 'quest done mobile-quest-card' : 'quest mobile-quest-card'} key={`${chore.id}-${chore.assignedTo}`}>
              <button className="mobile-quest-main" type="button" onClick={() => complete(chore.id)}>
                <span>{chore.completed ? '✓' : '□'}</span>
                <strong>{chore.parentTitle ? `${chore.parentTitle}: ${chore.title}` : chore.title}</strong>
                <small>
                  {chore.minutes} мин · {difficultyLabel[chore.difficulty]}
                </small>
              </button>
              {game.requirePhotoProof && !chore.completed && (
                <label className="proof-upload-button">
                  <span>Прикрепить фото и закрыть</span>
                  <input
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    type="file"
                    onChange={(event) => uploadProofPhoto(chore.id, event.target.files?.[0] || null)}
                  />
                </label>
              )}
              {chore.proofPhotoUrl && (
                <img alt="Фото подтверждения" className="proof-thumb" src={chore.proofPhotoUrl} />
              )}
            </div>
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
