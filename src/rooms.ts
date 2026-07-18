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

export type RoomThemeDef = {
  id: RoomThemeId
  label: string
  backdropSrc: string
  sceneSrc: string
  ambient: 'cozy' | 'castle' | 'ocean' | 'beach' | 'space'
  items: RoomItemDef[]
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

/** Grant one themed item per level gained; pause at 5 until next room accepted. */
export const applyRoomProgressOnLevelUp = (
  prevXp: number,
  nextXp: number,
  progress?: Partial<RoomProgress> | null,
): RoomProgress => {
  const result = normalizeRoomProgress(progress)
  const prevLevel = getLevelFromXp(Math.max(0, prevXp))
  const nextLevel = getLevelFromXp(Math.max(0, nextXp))
  if (nextLevel <= prevLevel) return result
  if (result.offerNextRoom || result.placedItemIds.length >= ITEMS_PER_ROOM) return result

  const levelsGained = nextLevel - prevLevel
  for (let i = 0; i < levelsGained; i++) {
    if (result.placedItemIds.length >= ITEMS_PER_ROOM) break
    const theme = getRoomTheme(result.roomIndex)
    const nextItem = theme.items.find((item) => !result.placedItemIds.includes(item.id))
    if (!nextItem) break
    result.placedItemIds = [...result.placedItemIds, nextItem.id]
    if (result.placedItemIds.length >= ITEMS_PER_ROOM) {
      result.offerNextRoom = true
      break
    }
  }
  return result
}

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

/** Apply XP delta and return updated room progress (and whether a new item was granted). */
export const applyXpWithRoomProgress = (
  prevXp: number,
  nextXp: number,
  progress?: Partial<RoomProgress> | null,
): { roomProgress: RoomProgress; grantedItemIds: string[]; leveledUp: boolean } => {
  const before = normalizeRoomProgress(progress)
  const roomProgress = applyRoomProgressOnLevelUp(prevXp, nextXp, before)
  const grantedItemIds = roomProgress.placedItemIds.filter((id) => !before.placedItemIds.includes(id))
  return {
    roomProgress,
    grantedItemIds,
    leveledUp: getLevelFromXp(nextXp) > getLevelFromXp(prevXp),
  }
}
