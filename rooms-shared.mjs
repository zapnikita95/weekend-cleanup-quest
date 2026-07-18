/** Room progression helpers for server.mjs (mirrors src/rooms.ts). */

export const XP_THRESHOLDS = [0, 30, 80, 150, 240, 350, 480, 630, 800, 1000]
export const ITEMS_PER_ROOM = 5

export const ROOM_ITEM_IDS = {
  room: ['room-bed', 'room-lamp', 'room-rug', 'room-shelf', 'room-plant'],
  castle: ['castle-throne', 'castle-shield', 'castle-banner', 'castle-chest', 'castle-torch'],
  ocean: ['ocean-coral', 'ocean-chest', 'ocean-weed', 'ocean-shell', 'ocean-fish'],
  beach: ['beach-umbrella', 'beach-bucket', 'beach-palm', 'beach-can', 'beach-ball'],
  space: ['space-rocket', 'space-star', 'space-window', 'space-bot', 'space-crystal'],
}

export const ROOM_THEME_ORDER = ['room', 'castle', 'ocean', 'beach', 'space']

export const getLevelFromXp = (xp) => {
  let level = 1
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1
    else break
  }
  return level
}

export const defaultRoomProgress = () => ({
  roomIndex: 0,
  placedItemIds: [],
  offerNextRoom: false,
  roomsCompleted: 0,
})

export const normalizeRoomProgress = (progress) => {
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

const themeItemsForIndex = (roomIndex) => {
  const themeId = ROOM_THEME_ORDER[((roomIndex % ROOM_THEME_ORDER.length) + ROOM_THEME_ORDER.length) % ROOM_THEME_ORDER.length]
  return ROOM_ITEM_IDS[themeId] || ROOM_ITEM_IDS.room
}

export const applyRoomProgressOnLevelUp = (prevXp, nextXp, progress) => {
  const result = normalizeRoomProgress(progress)
  const prevLevel = getLevelFromXp(Math.max(0, prevXp))
  const nextLevel = getLevelFromXp(Math.max(0, nextXp))
  if (nextLevel <= prevLevel) return result
  if (result.offerNextRoom || result.placedItemIds.length >= ITEMS_PER_ROOM) return result

  const levelsGained = nextLevel - prevLevel
  for (let i = 0; i < levelsGained; i++) {
    if (result.placedItemIds.length >= ITEMS_PER_ROOM) break
    const items = themeItemsForIndex(result.roomIndex)
    const nextItem = items.find((id) => !result.placedItemIds.includes(id))
    if (!nextItem) break
    result.placedItemIds = [...result.placedItemIds, nextItem]
    if (result.placedItemIds.length >= ITEMS_PER_ROOM) {
      result.offerNextRoom = true
      break
    }
  }
  return result
}
