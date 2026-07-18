import { getLevelFromXp } from './childProgress'

export type RoomThemeId = 'room' | 'castle' | 'ocean' | 'beach' | 'space'

export type RoomItemDef = {
  id: string
  label: string
  src: string
  /** percent position inside the room stage */
  x: number
  y: number
  scale?: number
}

export type RoomWaypoint = {
  /** 0..1 across stage width */
  x: number
  /** hold ms at this spot */
  holdMs?: number
  label?: string
}

export type RoomThemeDef = {
  id: RoomThemeId
  label: string
  backdropSrc: string
  sceneSrc: string
  ambient: 'cozy' | 'castle' | 'ocean' | 'beach' | 'space'
  items: RoomItemDef[]
  /** Hero walk route unique per theme */
  waypoints: RoomWaypoint[]
}

export type RoomProgress = {
  roomIndex: number
  placedItemIds: string[]
  offerNextRoom: boolean
  roomsCompleted: number
}

export const ROOM_THEMES: RoomThemeDef[] = [
  {
    id: 'room',
    label: 'Уютная комната',
    backdropSrc: '/avatars/backgrounds/backdrop-room.svg',
    sceneSrc: '/rooms/scenes/room.svg',
    ambient: 'cozy',
    items: [
      { id: 'room-bed', label: 'Кровать', src: '/rooms/room/bed.svg', x: 12, y: 62, scale: 1.35 },
      { id: 'room-lamp', label: 'Лампа', src: '/rooms/room/lamp.svg', x: 34, y: 48, scale: 1.1 },
      { id: 'room-rug', label: 'Коврик', src: '/rooms/room/rug.svg', x: 48, y: 74, scale: 1.4 },
      { id: 'room-shelf', label: 'Полка', src: '/rooms/room/shelf.svg', x: 68, y: 42, scale: 1.15 },
      { id: 'room-plant', label: 'Растение', src: '/rooms/room/plant.svg', x: 84, y: 58, scale: 1.2 },
    ],
    waypoints: [
      { x: 0.18, holdMs: 1100, label: 'окно' },
      { x: 0.42, holdMs: 700, label: 'коврик' },
      { x: 0.62, holdMs: 900, label: 'полка' },
      { x: 0.82, holdMs: 1000, label: 'растение' },
      { x: 0.5, holdMs: 600, label: 'центр' },
    ],
  },
  {
    id: 'castle',
    label: 'Замок героя',
    backdropSrc: '/avatars/backgrounds/backdrop-castle.svg',
    sceneSrc: '/rooms/scenes/castle.svg',
    ambient: 'castle',
    items: [
      { id: 'castle-throne', label: 'Трон', src: '/rooms/castle/throne.svg', x: 46, y: 52, scale: 1.4 },
      { id: 'castle-shield', label: 'Щит', src: '/rooms/castle/shield.svg', x: 22, y: 40, scale: 1.15 },
      { id: 'castle-banner', label: 'Знамя', src: '/rooms/castle/banner.svg', x: 72, y: 28, scale: 1.2 },
      { id: 'castle-chest', label: 'Сундук', src: '/rooms/castle/chest.svg', x: 78, y: 68, scale: 1.25 },
      { id: 'castle-torch', label: 'Факел', src: '/rooms/castle/torch.svg', x: 12, y: 36, scale: 1.1 },
    ],
    waypoints: [
      { x: 0.14, holdMs: 900, label: 'факел' },
      { x: 0.28, holdMs: 800, label: 'щит' },
      { x: 0.48, holdMs: 1200, label: 'трон' },
      { x: 0.72, holdMs: 800, label: 'знамя' },
      { x: 0.84, holdMs: 900, label: 'сундук' },
    ],
  },
  {
    id: 'ocean',
    label: 'Подводный мир',
    backdropSrc: '/avatars/backgrounds/backdrop-ocean.svg',
    sceneSrc: '/rooms/scenes/ocean.svg',
    ambient: 'ocean',
    items: [
      { id: 'ocean-coral', label: 'Коралл', src: '/rooms/ocean/coral.svg', x: 14, y: 62, scale: 1.3 },
      { id: 'ocean-chest', label: 'Сундук', src: '/rooms/ocean/chest.svg', x: 42, y: 70, scale: 1.25 },
      { id: 'ocean-weed', label: 'Водоросли', src: '/rooms/ocean/weed.svg', x: 70, y: 58, scale: 1.35 },
      { id: 'ocean-shell', label: 'Ракушка', src: '/rooms/ocean/shell.svg', x: 58, y: 78, scale: 1.05 },
      { id: 'ocean-fish', label: 'Рыбка', src: '/rooms/ocean/fish.svg', x: 82, y: 36, scale: 1.2 },
    ],
    waypoints: [
      { x: 0.16, holdMs: 900, label: 'коралл' },
      { x: 0.4, holdMs: 1000, label: 'сундук' },
      { x: 0.58, holdMs: 700, label: 'ракушка' },
      { x: 0.78, holdMs: 1100, label: 'рыбка' },
      { x: 0.32, holdMs: 600, label: 'волна' },
    ],
  },
  {
    id: 'beach',
    label: 'Пляж',
    backdropSrc: '/avatars/backgrounds/backdrop-tropics.svg',
    sceneSrc: '/rooms/scenes/beach.svg',
    ambient: 'beach',
    items: [
      { id: 'beach-umbrella', label: 'Зонт', src: '/rooms/beach/umbrella.svg', x: 24, y: 48, scale: 1.4 },
      { id: 'beach-bucket', label: 'Ведро', src: '/rooms/beach/bucket.svg', x: 44, y: 72, scale: 1.15 },
      { id: 'beach-palm', label: 'Пальма', src: '/rooms/beach/palm.svg', x: 76, y: 42, scale: 1.45 },
      { id: 'beach-can', label: 'Лейка', src: '/rooms/beach/can.svg', x: 58, y: 68, scale: 1.1 },
      { id: 'beach-ball', label: 'Мяч', src: '/rooms/beach/ball.svg', x: 12, y: 74, scale: 1.1 },
    ],
    waypoints: [
      { x: 0.14, holdMs: 800, label: 'мяч' },
      { x: 0.28, holdMs: 1100, label: 'зонт' },
      { x: 0.48, holdMs: 700, label: 'ведро' },
      { x: 0.66, holdMs: 800, label: 'лейка' },
      { x: 0.82, holdMs: 1000, label: 'пальма' },
    ],
  },
  {
    id: 'space',
    label: 'Космос',
    backdropSrc: '/avatars/backgrounds/backdrop-space.svg',
    sceneSrc: '/rooms/scenes/space.svg',
    ambient: 'space',
    items: [
      { id: 'space-rocket', label: 'Ракета', src: '/rooms/space/rocket.svg', x: 16, y: 46, scale: 1.35 },
      { id: 'space-star', label: 'Звезда', src: '/rooms/space/star.svg', x: 48, y: 24, scale: 1.1 },
      { id: 'space-window', label: 'Иллюминатор', src: '/rooms/space/window.svg', x: 70, y: 34, scale: 1.25 },
      { id: 'space-bot', label: 'Робот', src: '/rooms/space/bot.svg', x: 58, y: 66, scale: 1.2 },
      { id: 'space-crystal', label: 'Кристалл', src: '/rooms/space/crystal.svg', x: 84, y: 62, scale: 1.15 },
    ],
    waypoints: [
      { x: 0.18, holdMs: 1000, label: 'ракета' },
      { x: 0.4, holdMs: 700, label: 'палуба' },
      { x: 0.58, holdMs: 900, label: 'робот' },
      { x: 0.72, holdMs: 1100, label: 'иллюминатор' },
      { x: 0.86, holdMs: 800, label: 'кристалл' },
    ],
  },
]

export const ITEMS_PER_ROOM = 5

export const defaultRoomProgress = (): RoomProgress => ({
  roomIndex: 0,
  placedItemIds: [],
  offerNextRoom: false,
  roomsCompleted: 0,
})

export const normalizeRoomProgress = (progress?: Partial<RoomProgress> | null): RoomProgress => {
  const base = defaultRoomProgress()
  if (!progress || typeof progress !== 'object') return base
  return {
    roomIndex: Math.max(0, Number(progress.roomIndex) || 0),
    placedItemIds: Array.isArray(progress.placedItemIds)
      ? progress.placedItemIds.map(String).slice(0, ITEMS_PER_ROOM)
      : [],
    offerNextRoom: Boolean(progress.offerNextRoom),
    roomsCompleted: Math.max(0, Number(progress.roomsCompleted) || 0),
  }
}

export const getRoomTheme = (roomIndex: number): RoomThemeDef => {
  const index = ((roomIndex % ROOM_THEMES.length) + ROOM_THEMES.length) % ROOM_THEMES.length
  return ROOM_THEMES[index]
}

export const getRoomItemDef = (theme: RoomThemeDef, itemId: string): RoomItemDef | undefined =>
  theme.items.find((item) => item.id === itemId)

export type LevelRewardClaim = { level: number; kind: 'room' | 'cosmetic'; itemId: string }

export const acceptNextRoom = (progress?: Partial<RoomProgress> | null): RoomProgress => {
  const current = normalizeRoomProgress(progress)
  return {
    roomIndex: current.roomIndex + 1,
    placedItemIds: [],
    offerNextRoom: false,
    roomsCompleted: current.roomsCompleted + 1,
  }
}

export const declineNextRoomOffer = (progress?: Partial<RoomProgress> | null): RoomProgress => {
  const current = normalizeRoomProgress(progress)
  return { ...current, offerNextRoom: true }
}

/** Peek next furniture for current room (null if full / waiting for next room). */
export const peekNextRoomItem = (progress?: Partial<RoomProgress> | null): RoomItemDef | null => {
  const current = normalizeRoomProgress(progress)
  if (current.offerNextRoom || current.placedItemIds.length >= ITEMS_PER_ROOM) return null
  const theme = getRoomTheme(current.roomIndex)
  return theme.items.find((item) => !current.placedItemIds.includes(item.id)) || null
}

/** Place next furniture into the room for a claimed level reward. */
export const claimNextRoomItem = (
  progress?: Partial<RoomProgress> | null,
): { roomProgress: RoomProgress; item: RoomItemDef } | null => {
  const current = normalizeRoomProgress(progress)
  if (current.offerNextRoom || current.placedItemIds.length >= ITEMS_PER_ROOM) return null
  const theme = getRoomTheme(current.roomIndex)
  const item = theme.items.find((entry) => !current.placedItemIds.includes(entry.id))
  if (!item) return null
  const placedItemIds = [...current.placedItemIds, item.id]
  return {
    item,
    roomProgress: {
      ...current,
      placedItemIds,
      offerNextRoom: placedItemIds.length >= ITEMS_PER_ROOM,
    },
  }
}

export const migrateLevelRewardClaims = (profile: {
  levelRewardClaims?: LevelRewardClaim[] | null
  cosmeticChoiceLevels?: number[] | null
  roomProgress?: Partial<RoomProgress> | null
}): LevelRewardClaim[] => {
  if (Array.isArray(profile.levelRewardClaims) && profile.levelRewardClaims.length) {
    return profile.levelRewardClaims.map((claim) => ({
      level: Number(claim.level),
      kind: claim.kind === 'cosmetic' ? 'cosmetic' : 'room',
      itemId: String(claim.itemId || 'legacy'),
    }))
  }
  const claims: LevelRewardClaim[] = []
  const usedLevels = new Set<number>()
  for (const level of profile.cosmeticChoiceLevels || []) {
    const lvl = Number(level)
    if (!Number.isFinite(lvl) || usedLevels.has(lvl)) continue
    usedLevels.add(lvl)
    claims.push({ level: lvl, kind: 'cosmetic', itemId: 'legacy' })
  }
  const placed = normalizeRoomProgress(profile.roomProgress).placedItemIds
  let cursor = 2
  for (const itemId of placed) {
    while (usedLevels.has(cursor)) cursor++
    usedLevels.add(cursor)
    claims.push({ level: cursor, kind: 'room', itemId })
    cursor++
  }
  return claims
}

/** Levels 2..current that still need a reward pick (room OR cosmetic). */
export const getPendingRewardLevels = (xp: number, claims: LevelRewardClaim[]): number[] => {
  const level = getLevelFromXp(Math.max(0, xp))
  const claimed = new Set(claims.map((claim) => claim.level))
  const pending: number[] = []
  for (let lvl = 2; lvl <= level; lvl++) {
    if (!claimed.has(lvl)) pending.push(lvl)
  }
  return pending
}
