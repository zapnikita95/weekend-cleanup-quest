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
