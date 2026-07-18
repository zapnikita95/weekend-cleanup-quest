export type TierId = 'gold' | 'silver' | 'bronze' | 'none'
export type GameMode = 'duo' | 'solo' | 'childQuest'

export type StarRules = {
  gold: number
  silver: number
  bronze: number
}

export type StarReward = {
  id: string
  starsRequired: number
  label: string
  redeemedAt?: string
}

export type ChildLedgerEntry = {
  id: string
  gameId: string
  stars: number
  tier: TierId
  note: string
  createdAt: string
}

export type ChildProfile = {
  id: string
  parentEmail: string
  childEmail: string
  name: string
  avatar: string
  avatarUrl?: string
  starBalance: number
  starRules: StarRules
  rewards: StarReward[]
  ledger: ChildLedgerEntry[]
  achievementIds: string[]
  categoryCounts: Record<string, number>
  totalQuests: number
  ageGroup?: 'kid' | 'teen'
  currentGoal?: { label: string; starsTarget: number }
  moneyRate?: number // рублей за 1 звезду (для teen/allowance)
  skillLevels?: Record<string, number>
  xp: number
  equippedCosmetics?: Record<string, string>  // e.g. { hat: 'crown', cloak: 'blue', pet: 'slime' }
  unlockedCosmetics?: string[]
  cosmeticChoiceLevels?: number[]
  /** Per level-up: player picks room item OR cosmetic; unclaimed stay available later */
  levelRewardClaims?: Array<{ level: number; kind: 'room' | 'cosmetic'; itemId: string }>
  /** Animated hero room: sequential themes, up to 5 items, then offer next room */
  roomProgress?: {
    roomIndex: number
    placedItemIds: string[]
    offerNextRoom: boolean
    roomsCompleted: number
  }
  regularTasks?: Array<{ id: string; label: string; xp: number; stars: number }>
  lootboxRewards?: string[]  // e.g. ['+30xp', '+2stars', 'potion']
  /** Unopened lootboxes earned by quests / confirmed regulars. Never free. */
  lootboxCharges?: number
  pendingRegulars?: Array<{ id: string; label: string; xp: number; stars: number; doneAt?: string }>
  createdAt: string
  updatedAt: string
}

export type ChildQuestOutcome = {
  childProfileId: string
  childEmail: string
  coins: number
  targetScore: number
  tier: TierId
  prizeLabel: string
  starsEarned: number
  choresCompleted: number
}

export const defaultStarRules: StarRules = { gold: 3, silver: 2, bronze: 1 }

export const CATEGORY_ACHIEVEMENTS = [
  { id: 'first_quest', icon: 'trophy', title: 'Первая уборка', threshold: 1, description: 'Доведи до конца свой первый квест.' },
  { id: 'gold_quest', icon: 'gold', title: 'На все сто', threshold: 1, description: 'Набери золотой результат в квесте.' },
  { id: 'triple_zone', icon: 'rooms', title: 'По всему дому', threshold: 3, description: 'Закрой дела сразу в трёх разных комнатах.' },
  { id: 'kitchen_combo', icon: 'kitchen', title: 'На кухне порядок', threshold: 3, description: 'Сделай три дела на кухне.' },
  { id: 'speed_runner', icon: 'speed', title: 'Успел вовремя', threshold: 1, description: 'Заверши квест раньше времени.' },
  { id: 'perfect_rating', icon: 'shield', title: 'Родители довольны', threshold: 1, description: 'Получи высшие оценки за дела.' },
  { id: 'star_collector', icon: 'stars', title: 'Десять звёзд', threshold: 10, description: 'Накопи 10 звёзд.' },
  { id: 'streak_3', icon: 'streak', title: 'Три дня без пропусков', threshold: 3, description: 'Играй три дня подряд.' },
  { id: 'streak_7', icon: 'streak', title: 'Неделя без пропусков', threshold: 7, description: 'Играй семь дней подряд.' },
  { id: 'many_quests', icon: 'calendar', title: 'Четырнадцать квестов', threshold: 14, description: 'Заверши 14 квестов.' },
] as const

// RPG Skill Tree
export const SKILL_TREE = [
  { id: 'kitchen', icon: 'kitchen', title: 'Кухня', desc: 'Посуда, стол, плита' },
  { id: 'bath', icon: 'bath', title: 'Ванная', desc: 'Раковина, зеркало, пол' },
  { id: 'bedroom', icon: 'bedroom', title: 'Спальня', desc: 'Кровать, вещи, пыль' },
  { id: 'living', icon: 'living', title: 'Гостиная', desc: 'Диван, пол, общий порядок' },
  { id: 'hall', icon: 'hall', title: 'Прихожая', desc: 'Обувь, куртки, вход' },
  { id: 'garden', icon: 'garden', title: 'Двор', desc: 'Мусор, двор, растения' },
] as const

export type Skill = typeof SKILL_TREE[number]

export const getSkillLevel = (count: number): number => Math.floor((count || 0) / 4) + 1

export const getSkillRankLabel = (level: number): string => {
  if (level >= 5) return 'Ас'
  if (level >= 4) return 'Профи'
  if (level >= 3) return 'Опытный'
  if (level >= 2) return 'Уверенный'
  return 'Новичок'
}

export const getSkillTitle = (skillId: string, level: number): string => {
  const base = SKILL_TREE.find(s => s.id === skillId)?.title || 'Навык'
  return `${base} · ${getSkillRankLabel(level)}`
}

export const getSkillBonusStars = (oldLevel: number, newLevel: number): number => {
  if (newLevel > oldLevel) return (newLevel - oldLevel) * 2 // +2 stars per level up
  return 0
}

// Active in-game bonuses for childQuest
export const getCategorySkillBonus = (categoryIcon: string, skillLevels: Record<string, number>) => {
  const lvl = skillLevels?.[categoryIcon] || 1
  return {
    coinBonus: Math.floor(lvl * 3),           // flat +coins per chore in category
    starMultiplier: 1 + (lvl - 1) * 0.1,      // small % bonus to final stars
    timeExtension: lvl >= 3 ? 5 : 0,          // minutes extra available if high skill
  }
}

export const getActiveSkillBuffs = (skillLevels: Record<string, number>) => {
  const buffs: string[] = []
  Object.entries(skillLevels || {}).forEach(([cat, lvl]) => {
    if (lvl >= 2) buffs.push(`+${Math.floor(lvl*3)} монет в ${cat}`)
    if (lvl >= 4) buffs.push(`Бонусные звёзды в ${cat}`)
  })
  return buffs
}

export const ROOM_ICON_TO_KEY: Record<string, string> = {
  bath: 'bath',
  kitchen: 'kitchen',
  living: 'living',
  bedroom: 'bedroom',
  toilet: 'bath',
  hall: 'hall',
  wardrobe: 'bedroom',
  storage: 'storage',
  garden: 'garden',
  outside: 'garden',
  dining: 'kitchen',
  garage: 'storage',
}

export const starsForTier = (tier: TierId, rules: StarRules) => {
  if (tier === 'gold') return rules.gold
  if (tier === 'silver') return rules.silver
  if (tier === 'bronze') return rules.bronze
  return 0
}

export const computeCategoryCountsFromChores = (chores: Array<{ completed?: boolean; parentTitle?: string; title?: string }>) => {
  const counts: Record<string, number> = {}
  for (const chore of chores) {
    if (!chore.completed) continue
    const title = (chore.parentTitle || chore.title || '').toLowerCase()
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

export const unlockAchievements = (categoryCounts: Record<string, number>, currentIds: string[]) => {
  const next = new Set(currentIds)
  if ((categoryCounts.kitchen || 0) >= 3) next.add('kitchen_combo')
  if (Object.values(categoryCounts).filter((count) => count > 0).length >= 3) next.add('triple_zone')
  return [...next]
}

export const filterGamesByMode = <T extends { mode?: GameMode }>(games: T[], mode: GameMode) =>
  games.filter((game) => (game.mode || 'duo') === mode)

export const computeLevel = (totalQuests: number, starBalance: number): number => {
  // Simple satisfying progression: quests primary + stars bonus
  return 1 + Math.floor(totalQuests / 3) + Math.floor(starBalance / 12)
}

export const computeSkillLevels = (categoryCounts: Record<string, number>): Record<string, number> => {
  const levels: Record<string, number> = {}
  SKILL_TREE.forEach(skill => {
    levels[skill.id] = getSkillLevel(categoryCounts[skill.id] || 0)
  })
  return levels
}

// XP and Level system
export const XP_THRESHOLDS = [0, 30, 80, 150, 240, 350, 480, 630, 800, 1000] // cumulative XP for levels 1 to 10+

export const getLevelFromXp = (xp: number): number => {
  let level = 1
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1
    else break
  }
  return level
}

export const xpForNextLevel = (currentXp: number): number => {
  const level = getLevelFromXp(currentXp)
  const nextThreshold = XP_THRESHOLDS[level] || XP_THRESHOLDS[XP_THRESHOLDS.length-1] + 200
  return Math.max(0, nextThreshold - currentXp)
}

export const xpGainFromGame = (coins: number, choresCompleted: number): number => {
  // Tune so first game ~30-50 XP for level 2
  return Math.floor(coins * 0.4 + choresCompleted * 3)
}

export const xpGainFromRegular = (xpReward: number): number => xpReward


export const computeStreak = (ledger: ChildLedgerEntry[]): number => {
  if (!ledger.length) return 0
  const sorted = [...ledger].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  let streak = 1
  let prev = new Date(sorted[0].createdAt)
  for (let i = 1; i < sorted.length; i++) {
    const d = new Date(sorted[i].createdAt)
    const diffDays = Math.floor((prev.getTime() - d.getTime()) / (1000 * 3600 * 24))
    if (diffDays === 1) {
      streak++
      prev = d
    } else if (diffDays > 1) {
      break
    }
  }
  return streak
}

export const getAgeLabel = (ageGroup?: 'kid' | 'teen') => (ageGroup === 'teen' ? 'Подросток' : 'Ребёнок')
