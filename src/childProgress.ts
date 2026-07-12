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
  { id: 'kitchen_master', icon: 'kitchen', title: 'Повелитель кухни', threshold: 5 },
  { id: 'bath_hero', icon: 'bath', title: 'Герой ванной', threshold: 5 },
  { id: 'bedroom_guard', icon: 'bedroom', title: 'Страж спальни', threshold: 5 },
  { id: 'living_champ', icon: 'living', title: 'Чемпион гостиной', threshold: 5 },
  { id: 'garden_ranger', icon: 'garden', title: 'Садовый рейнджер', threshold: 5 },
  { id: 'hall_keeper', icon: 'hall', title: 'Хранитель прихожей', threshold: 5 },
] as const

// RPG Skill Tree
export const SKILL_TREE = [
  { id: 'kitchen', icon: 'kitchen', title: 'Кухня', desc: 'Мастер посуды и готовки' },
  { id: 'bath', icon: 'bath', title: 'Ванная', desc: 'Гигиена и чистота' },
  { id: 'bedroom', icon: 'bedroom', title: 'Спальня', desc: 'Порядок в личном пространстве' },
  { id: 'living', icon: 'living', title: 'Гостиная', desc: 'Общие зоны' },
  { id: 'hall', icon: 'hall', title: 'Прихожая', desc: 'Вход и хранение' },
  { id: 'garden', icon: 'garden', title: 'Двор / Сад', desc: 'Наружные работы' },
] as const

export type Skill = typeof SKILL_TREE[number]

export const getSkillLevel = (count: number): number => Math.floor((count || 0) / 4) + 1

export const getSkillTitle = (skillId: string, level: number): string => {
  const base = SKILL_TREE.find(s => s.id === skillId)?.title || 'Навык'
  if (level >= 5) return `Гений ${base.toLowerCase()}`
  if (level >= 4) return `Мастер ${base.toLowerCase()}`
  if (level >= 3) return `Эксперт ${base.toLowerCase()}`
  if (level >= 2) return `Ученик ${base.toLowerCase()}`
  return base
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
  for (const achievement of CATEGORY_ACHIEVEMENTS) {
    if ((categoryCounts[achievement.icon] || 0) >= achievement.threshold) next.add(achievement.id)
  }
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
